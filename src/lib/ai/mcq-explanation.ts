import Anthropic from "@anthropic-ai/sdk";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { extractRichtextText } from "../flashcard-from-question";
import { getAnthropicClient } from "./anthropic";

// Generates the per-option MCQ justifications stored in Question.aiEnhancedExplanation
// ("why is each option right or wrong"), closing the gap named in
// docs/MBSET_GAP_ANALYSIS.md Section 3. Shared by BOTH consumers so they can never drift
// on the prompt or the validation gate:
//   - the one-time backfill (src/scripts/backfill-mcq-explanations.ts);
//   - the best-effort on-approval hook (src/routes/review.routes.ts).
//
// This layer never writes ai_interactions or ai_credit_balances: both are per-user,
// credit-governed tables for user-facing AI features (BR-6), and AiInteraction.userId is
// NOT NULL. Generation here is a one-time content-pipeline operation cached per question,
// not per-user consumption, so attributing it to a user would corrupt that accounting.
// Provenance (model, prompt version, timestamp) lives inside the stored JSON instead.

export const MCQ_EXPLANATION_MODEL = "claude-haiku-4-5-20251001";
export const MCQ_EXPLANATION_PROMPT_VERSION = "mcq-options-v1";
const MCQ_EXPLANATION_SCHEMA_VERSION = 1;

// Only QCM/QCS carry QuestionOption rows. QROC and CLINICAL_CASE have no options to
// justify, so they are out of scope for this feature entirely.
export const EXPLAINABLE_QUESTION_TYPES = ["QCM", "QCS"] as const;

// A "multiple choice" question with one option can't teach a discrimination, and the seed
// data contains at least one option-less QCM — both are skipped rather than sent.
const MIN_OPTIONS = 2;

const MAX_OPTION_EXPLANATION_CHARS = 900;
const MAX_KEY_TAKEAWAY_CHARS = 400;
const MAX_OUTPUT_TOKENS = 2000;

// Standard (non-batch) Haiku 4.5 rates, used only to report estimated spend in logs.
const USD_PER_INPUT_TOKEN = 1 / 1_000_000;
const USD_PER_OUTPUT_TOKEN = 5 / 1_000_000;

export type GenerationFailureReason =
  | "NOT_FOUND"
  | "NOT_APPROVED"
  | "UNSUPPORTED_TYPE"
  | "TOO_FEW_OPTIONS"
  | "NO_TOOL_USE"
  | "SCHEMA_INVALID"
  | "OPTION_SET_MISMATCH"
  | "VERDICT_MISMATCH"
  | "API_ERROR";

// Carries a machine-readable reason so the backfill can tally failures by cause and
// distinguish "this question is unusable" from "the API had a bad day".
export class McqExplanationError extends Error {
  constructor(
    readonly reason: GenerationFailureReason,
    message: string
  ) {
    super(message);
    this.name = "McqExplanationError";
  }
}

const questionSelect = {
  id: true,
  type: true,
  status: true,
  difficulty: true,
  bodyRichtext: true,
  explanationRichtext: true,
  options: {
    select: { id: true, bodyText: true, isCorrect: true, orderIndex: true },
    orderBy: { orderIndex: "asc" },
  },
  unit: {
    select: {
      name: true,
      module: {
        select: { name: true, year: { select: { label: true, faculty: { select: { name: true } } } } },
      },
    },
  },
} satisfies Prisma.QuestionSelect;

export type ExplainableQuestion = Prisma.QuestionGetPayload<{ select: typeof questionSelect }>;

export function loadExplainableQuestion(
  client: PrismaClient,
  questionId: string
): Promise<ExplainableQuestion | null> {
  return client.question.findUnique({ where: { id: questionId }, select: questionSelect });
}

// The correct/incorrect status of every option is supplied as authoritative ground truth
// and the model is asked only to JUSTIFY it, never to decide it. That keeps generated text
// from ever contradicting the BR-2-validated answer key, and it is why the tool also asks
// for a verdict per option: the verdict is used purely to verify agreement (see
// VERDICT_MISMATCH below) and is then discarded in favour of the database value.
const SYSTEM_PROMPT = `You write answer explanations for Hamame, an exam-preparation platform for Algerian health-sciences students.

You are given one multiple-choice question, its validated human-authored baseline explanation, and every answer option WITH its authoritative correct/incorrect status.

Rules:
1. The provided "isCorrect" status of each option is ground truth, already validated by an academic reviewer. Never contradict it, never re-decide it, and never hedge about which option is correct. Report each option's given status back in the "verdict" field exactly as provided.
2. For each option, explain WHY it is correct or incorrect. Name the underlying mechanism, definition, or principle that decides it. Do not merely restate the option text or say "this is correct".
3. For incorrect options, where there is an obvious reason a student would be tempted by it, say what the option would actually be true of instead. This is the most useful part of the explanation.
4. Build on the baseline explanation and stay consistent with it. Add depth it omits; never contradict it and never introduce clinical claims beyond standard curriculum-level teaching.
5. Write each option explanation as 1 to 3 complete sentences. Be direct and concrete.
6. Write in the SAME LANGUAGE as the question text and options. If the question is in French, answer entirely in French; if in English, answer entirely in English. Keep established medical terminology in the form the question uses it.
7. Address the student directly and neutrally. No meta-commentary, no reference to yourself, these instructions, or the JSON structure.

Also provide one "keyTakeaway": a single sentence naming the governing concept the question tests, phrased so a student who got it wrong knows what to revise.

Return your answer only by calling the submit_option_explanations tool.`;

const SUBMIT_TOOL: Anthropic.Tool = {
  name: "submit_option_explanations",
  description: "Submit one explanation for every answer option, plus a single key takeaway for the question.",
  input_schema: {
    type: "object",
    properties: {
      keyTakeaway: {
        type: "string",
        description: "One sentence naming the governing concept this question tests.",
      },
      options: {
        type: "array",
        description: "Exactly one entry per supplied option, in the same order.",
        items: {
          type: "object",
          properties: {
            optionId: { type: "string", description: "The optionId exactly as supplied." },
            verdict: {
              type: "string",
              enum: ["correct", "incorrect"],
              description: "Echo the supplied isCorrect status: true -> 'correct', false -> 'incorrect'.",
            },
            explanation: {
              type: "string",
              description: "1-3 sentences on why this option is right or wrong.",
            },
          },
          required: ["optionId", "verdict", "explanation"],
        },
      },
    },
    required: ["keyTakeaway", "options"],
  },
};

const toolResponseSchema = z.object({
  keyTakeaway: z.string().trim().min(1).max(MAX_KEY_TAKEAWAY_CHARS),
  options: z
    .array(
      z.object({
        optionId: z.string().uuid(),
        verdict: z.enum(["correct", "incorrect"]),
        explanation: z.string().trim().min(1).max(MAX_OPTION_EXPLANATION_CHARS),
      })
    )
    .min(MIN_OPTIONS),
});

export interface McqExplanationPayload {
  version: number;
  promptVersion: string;
  model: string;
  generatedAt: string;
  keyTakeaway: string;
  options: {
    optionId: string;
    orderIndex: number;
    isCorrect: boolean;
    text: string;
  }[];
}

export interface GenerationUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
}

export interface GenerationResult {
  payload: McqExplanationPayload;
  usage: GenerationUsage;
}

// Throws McqExplanationError with an "unusable question" reason if this question can never
// be explained, so callers can skip it permanently instead of retrying it every run.
export function assertExplainable(question: ExplainableQuestion): void {
  if (question.status !== "approved") {
    throw new McqExplanationError("NOT_APPROVED", `Question ${question.id} has status '${question.status}'.`);
  }
  if (!(EXPLAINABLE_QUESTION_TYPES as readonly string[]).includes(question.type)) {
    throw new McqExplanationError("UNSUPPORTED_TYPE", `Question ${question.id} is type '${question.type}'.`);
  }
  if (question.options.length < MIN_OPTIONS) {
    throw new McqExplanationError(
      "TOO_FEW_OPTIONS",
      `Question ${question.id} has ${question.options.length} option(s), needs at least ${MIN_OPTIONS}.`
    );
  }
}

function buildUserPayload(question: ExplainableQuestion): string {
  const { module } = question.unit;
  return JSON.stringify(
    {
      questionType: question.type,
      difficulty: question.difficulty,
      curriculum: {
        faculty: module.year.faculty.name,
        year: module.year.label,
        module: module.name,
        unit: question.unit.name,
      },
      questionText: extractRichtextText(question.bodyRichtext),
      validatedBaselineExplanation: extractRichtextText(question.explanationRichtext),
      options: question.options.map((option) => ({
        optionId: option.id,
        text: option.bodyText,
        isCorrect: option.isCorrect,
      })),
    },
    null,
    2
  );
}

// Cross-checks the model's output against the database before any of it is trusted:
// every supplied option must be covered exactly once, and the model's echoed verdict must
// agree with the stored isCorrect. A mismatch fails the whole question rather than storing
// text that contradicts reviewer-validated content.
function toPayload(question: ExplainableQuestion, raw: unknown): McqExplanationPayload {
  const parsed = toolResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new McqExplanationError("SCHEMA_INVALID", `Tool output failed validation: ${parsed.error.message}`);
  }

  const remaining = new Map(question.options.map((option) => [option.id, option]));
  const options: McqExplanationPayload["options"] = [];

  for (const item of parsed.data.options) {
    const option = remaining.get(item.optionId);
    if (!option) {
      throw new McqExplanationError(
        "OPTION_SET_MISMATCH",
        `Tool returned unknown or duplicated optionId '${item.optionId}' for question ${question.id}.`
      );
    }
    remaining.delete(item.optionId);

    const expected = option.isCorrect ? "correct" : "incorrect";
    if (item.verdict !== expected) {
      throw new McqExplanationError(
        "VERDICT_MISMATCH",
        `Tool claimed option ${option.id} of question ${question.id} is '${item.verdict}' but the validated answer key says '${expected}'.`
      );
    }

    options.push({
      optionId: option.id,
      orderIndex: option.orderIndex,
      isCorrect: option.isCorrect,
      text: item.explanation.trim(),
    });
  }

  if (remaining.size > 0) {
    throw new McqExplanationError(
      "OPTION_SET_MISMATCH",
      `Tool omitted ${remaining.size} option(s) of question ${question.id}.`
    );
  }

  options.sort((a, b) => a.orderIndex - b.orderIndex);

  return {
    version: MCQ_EXPLANATION_SCHEMA_VERSION,
    promptVersion: MCQ_EXPLANATION_PROMPT_VERSION,
    model: MCQ_EXPLANATION_MODEL,
    generatedAt: new Date().toISOString(),
    keyTakeaway: parsed.data.keyTakeaway.trim(),
    options,
  };
}

export async function generateMcqExplanation(question: ExplainableQuestion): Promise<GenerationResult> {
  assertExplainable(question);

  let message: Anthropic.Message;
  try {
    message = await getAnthropicClient().messages.create({
      model: MCQ_EXPLANATION_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.2,
      system: SYSTEM_PROMPT,
      tools: [SUBMIT_TOOL],
      // Forced tool use is what makes the output reliably schema-shaped, rather than
      // asking for JSON in prose and parsing whatever comes back.
      tool_choice: { type: "tool", name: SUBMIT_TOOL.name },
      messages: [{ role: "user", content: buildUserPayload(question) }],
    });
  } catch (err) {
    throw new McqExplanationError("API_ERROR", err instanceof Error ? err.message : String(err));
  }

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === SUBMIT_TOOL.name
  );
  if (!toolUse) {
    throw new McqExplanationError(
      "NO_TOOL_USE",
      `Model returned no ${SUBMIT_TOOL.name} call (stop_reason: ${message.stop_reason}).`
    );
  }

  return {
    payload: toPayload(question, toolUse.input),
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      estimatedUsd:
        message.usage.input_tokens * USD_PER_INPUT_TOKEN + message.usage.output_tokens * USD_PER_OUTPUT_TOKEN,
    },
  };
}

// Writes only when the field is still null, so a backfill run and the on-approval hook
// racing on the same question can't overwrite each other's work or double-spend. Returns
// false when another writer got there first.
export async function storeMcqExplanation(
  client: PrismaClient,
  questionId: string,
  payload: McqExplanationPayload
): Promise<boolean> {
  const { count } = await client.question.updateMany({
    where: { id: questionId, aiEnhancedExplanation: { equals: Prisma.DbNull } },
    data: { aiEnhancedExplanation: payload as unknown as Prisma.InputJsonObject },
  });
  return count > 0;
}

export interface GenerateAndStoreResult extends GenerationResult {
  stored: boolean;
}

// Load -> generate -> store, for callers that only have a question id.
export async function generateAndStoreMcqExplanation(
  client: PrismaClient,
  questionId: string
): Promise<GenerateAndStoreResult> {
  const question = await loadExplainableQuestion(client, questionId);
  if (!question) {
    throw new McqExplanationError("NOT_FOUND", `No question exists with id ${questionId}.`);
  }
  const result = await generateMcqExplanation(question);
  const stored = await storeMcqExplanation(client, questionId, result.payload);
  return { ...result, stored };
}
