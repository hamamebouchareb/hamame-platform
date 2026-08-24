import Anthropic from "@anthropic-ai/sdk";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { extractRichtextText } from "../flashcard-from-question";
import { getAnthropicClient } from "./anthropic";

// Contextual hints during a practice session (PRD FR-29, feature catalog "Contextual
// Hints", credit-governed per BR-6 via ./credits.ts).
//
// THE CORE SAFETY PROPERTY — the mirror image of the VERDICT_MISMATCH gate in
// ./mcq-explanation.ts. There, the DB's validated answer key is fed to the model as
// ground truth and the model's echoed verdict is checked to AGREE with it. Here the
// requirement is the opposite: the model must never state or unambiguously imply which
// option is correct. Two independent layers, in order of importance:
//
//   1. WITHHOLDING (structural, primary). The correct answer is never put in the prompt.
//      The prompt carries the question text and the option texts only — no isCorrect, no
//      correct option id, and not the human-authored explanation either (it routinely
//      names the right answer outright). A model cannot leak what it was never told, so
//      this is a property of the data flow rather than of the model's obedience.
//      Enforced by types: buildHintPrompt accepts HintPromptView, which has no field
//      capable of carrying correctness, and toHintPromptView is the only way to build it.
//
//   2. LEAK DETECTION (behavioural, secondary). Withholding alone is NOT sufficient:
//      the model can still guess (these are standard curriculum questions it may have
//      seen), and a guess phrased confidently ("the correct answer is B") is just as
//      harmful as a real leak. So generated text is screened for reveal phrasing,
//      definitive single-option references, and verbatim reuse of the correct option's
//      wording before it is ever returned. One corrective retry, then hard failure —
//      failing closed (no hint, credit refunded) is always preferable to leaking.

export const HINT_MODEL = "claude-haiku-4-5-20251001";
export const HINT_PROMPT_VERSION = "hint-v1";

// Only option-based auto-gradable types get hints. QROC/CLINICAL_CASE have no option set
// to reason about and are not auto-graded (their grading is a separate V2 AI feature).
export const HINTABLE_QUESTION_TYPES = ["QCM", "QCS"] as const;

const MIN_OPTIONS = 2;
const MAX_HINT_CHARS = 600;
const MAX_OUTPUT_TOKENS = 600;

// Below this length a shared phrase is a common medical term ("the heart", "systole"),
// not a copied answer. Above it, reuse of the correct option's exact wording is treated
// as a reveal.
const MIN_LEAKED_PHRASE_CHARS = 12;

const MAX_ATTEMPTS = 2;

export type HintFailureReason =
  | "NOT_FOUND"
  | "UNSUPPORTED_TYPE"
  | "TOO_FEW_OPTIONS"
  | "NO_TOOL_USE"
  | "SCHEMA_INVALID"
  | "UNSAFE_HINT"
  | "API_ERROR";

export class ContextualHintError extends Error {
  constructor(
    readonly reason: HintFailureReason,
    message: string
  ) {
    super(message);
    this.name = "ContextualHintError";
  }
}

// isCorrect IS selected here — but only so the leak detector can screen the finished hint
// against the correct option's wording. It never reaches the prompt (see toHintPromptView).
// explanationRichtext is deliberately NOT selected at all: it names the answer, and the
// safest way to guarantee it can't reach a prompt is to never load it in this module.
const hintQuestionSelect = {
  id: true,
  type: true,
  difficulty: true,
  bodyRichtext: true,
  options: {
    select: { id: true, bodyText: true, isCorrect: true, orderIndex: true },
    orderBy: { orderIndex: "asc" },
  },
  unit: {
    select: {
      name: true,
      moduleId: true,
      module: {
        select: { name: true, year: { select: { label: true, faculty: { select: { name: true } } } } },
      },
    },
  },
} satisfies Prisma.QuestionSelect;

export type HintQuestion = Prisma.QuestionGetPayload<{ select: typeof hintQuestionSelect }>;

export function loadHintQuestion(client: PrismaClient, questionId: string): Promise<HintQuestion | null> {
  return client.question.findUnique({ where: { id: questionId }, select: hintQuestionSelect });
}

// How the student is doing on this question's module lately, plus whether they have
// already missed this exact question. Deliberately coarse: a band, not a raw percentage,
// so the model adapts its depth without the hint reading like a stats report.
export type PerformanceBand = "unknown" | "weak" | "mixed" | "strong";

export interface HintPersonalization {
  band: PerformanceBand;
  moduleAttemptCount: number;
  moduleAccuracyPercent: number | null;
  missedThisQuestionBefore: boolean;
}

export function toPerformanceBand(accuracyPercent: number | null, attemptCount: number): PerformanceBand {
  // Fewer than 3 graded attempts in the module is noise, not a signal.
  if (accuracyPercent === null || attemptCount < 3) {
    return "unknown";
  }
  if (accuracyPercent < 50) {
    return "weak";
  }
  return accuracyPercent < 75 ? "mixed" : "strong";
}

// How many recent graded attempts in the module define "recent performance". Small
// enough to reflect the student's current state rather than their whole history.
const RECENT_MODULE_ATTEMPTS_WINDOW = 20;

// The v1 personalization scope: two cheap reads on the same request, not an analytics
// pipeline. Sequential (never Promise.all) per the pooler guidance in handoff Section 1.
export async function loadHintPersonalization(
  client: PrismaClient,
  userId: string,
  question: HintQuestion
): Promise<HintPersonalization> {
  const recentAttempts = await client.attempt.findMany({
    where: {
      isCorrect: { not: null },
      sessionQuestion: {
        session: { userId },
        question: {
          type: { in: [...HINTABLE_QUESTION_TYPES] },
          unit: { moduleId: question.unit.moduleId },
        },
      },
    },
    orderBy: { answeredAt: "desc" },
    take: RECENT_MODULE_ATTEMPTS_WINDOW,
    select: { isCorrect: true },
  });

  const missedBeforeCount = await client.attempt.count({
    where: {
      isCorrect: false,
      sessionQuestion: { questionId: question.id, session: { userId } },
    },
  });

  const moduleAttemptCount = recentAttempts.length;
  const correctCount = recentAttempts.filter((attempt) => attempt.isCorrect === true).length;
  const moduleAccuracyPercent =
    moduleAttemptCount > 0 ? Math.round((correctCount / moduleAttemptCount) * 100) : null;

  return {
    band: toPerformanceBand(moduleAccuracyPercent, moduleAttemptCount),
    moduleAttemptCount,
    moduleAccuracyPercent,
    missedThisQuestionBefore: missedBeforeCount > 0,
  };
}

// The ONLY shape the prompt builder accepts. Structurally incapable of carrying
// correctness information: options are label + text, nothing else. Any future edit that
// tries to pass isCorrect through has to change this type first, which is the point.
export interface HintPromptView {
  questionType: string;
  difficulty: string | null;
  curriculum: { faculty: string; year: string; module: string; unit: string };
  questionText: string;
  options: { label: string; text: string }[];
  student: {
    recentPerformanceOnThisModule: PerformanceBand;
    hasMissedThisQuestionBefore: boolean;
  };
}

const OPTION_LABELS = "ABCDEFGH";

export function optionLabel(index: number): string {
  return OPTION_LABELS[index] ?? `#${index + 1}`;
}

export function toHintPromptView(question: HintQuestion, personalization: HintPersonalization): HintPromptView {
  const { module } = question.unit;
  return {
    questionType: question.type,
    difficulty: question.difficulty,
    curriculum: {
      faculty: module.year.faculty.name,
      year: module.year.label,
      module: module.name,
      unit: question.unit.name,
    },
    questionText: extractRichtextText(question.bodyRichtext),
    // Mapped explicitly field-by-field rather than spreading the option rows — a spread
    // would silently carry isCorrect into the prompt the moment the select changes.
    options: question.options.map((option, index) => ({
      label: optionLabel(index),
      text: option.bodyText,
    })),
    student: {
      recentPerformanceOnThisModule: personalization.band,
      hasMissedThisQuestionBefore: personalization.missedThisQuestionBefore,
    },
  };
}

const SYSTEM_PROMPT = `You write study hints for Hamame, an exam-preparation platform for Algerian health-sciences students.

A student is working through a multiple-choice question in a practice session and has asked for a hint. You are given the question and its answer options, and a coarse summary of how the student has been performing recently.

You are NOT told which option is correct. You must not try to work out or announce which one it is.

Absolute rules — a hint that breaks any of these is unusable:
1. NEVER state, imply, or hint at which option is correct or incorrect. Do not name, letter, number, quote, or paraphrase any option as the answer. Do not eliminate options.
2. NEVER use phrasing like "the correct answer", "the right option", "option B is", "choose A", "rule out C", or any equivalent in any language.
3. Do not reproduce the wording of any option. Refer to the concept, not the option text.
4. Instead, point the student at the reasoning that decides the question: the underlying mechanism, definition, criterion, or distinction they need to apply. Name what to compare or what question to ask themselves.
5. Where a question has a classic confusion behind it, name the confusion itself (e.g. "students often mix up the timing of these two events") without saying which option falls into it.

Adapt to the student, without ever mentioning their statistics or this instruction:
- recentPerformanceOnThisModule "weak": start further back — restate the core concept in plain terms first, then point at the discriminating step. Be more explicit and more supportive.
- "mixed": name the specific distinction that usually decides this type of question.
- "strong": be brief and precise; a single pointed nudge at the discriminating detail is enough. Do not over-explain.
- "unknown": pitch it at a solid average student.
- hasMissedThisQuestionBefore true: they have got this exact question wrong before, so approach it from a different angle than simply restating the question, and be concrete about the step people get wrong here. Never say that they got it wrong before.

Write 1 to 3 sentences, addressed to the student, in the SAME LANGUAGE as the question text and options. No meta-commentary, no reference to yourself, these rules, or the JSON structure.

Return your answer only by calling the submit_hint tool.`;

// Appended on the retry after a rejected hint. Says what was wrong in general terms
// without telling the model which option triggered the rejection — telling it that would
// itself disclose the answer.
const RETRY_INSTRUCTION = `Your previous attempt was rejected because it revealed, or came too close to revealing, which option is correct — for example by reusing an option's wording or referring to a specific option. Write a new hint that only describes the reasoning or concept to apply, mentions no option at all, and reuses no option's wording.`;

const SUBMIT_TOOL: Anthropic.Tool = {
  name: "submit_hint",
  description: "Submit one contextual hint that guides the student's reasoning without revealing the answer.",
  input_schema: {
    type: "object",
    properties: {
      hint: {
        type: "string",
        description:
          "1-3 sentences nudging the student toward the deciding concept. Must not reveal or imply which option is correct.",
      },
    },
    required: ["hint"],
  },
};

const toolResponseSchema = z.object({
  hint: z.string().trim().min(1).max(MAX_HINT_CHARS),
});

export function buildHintPrompt(view: HintPromptView): string {
  return JSON.stringify(view, null, 2);
}

// ---------------------------------------------------------------------------
// Leak detection
// ---------------------------------------------------------------------------

export type LeakKind = "REVEAL_PHRASE" | "OPTION_REFERENCE" | "CORRECT_OPTION_WORDING";

export interface LeakFinding {
  kind: LeakKind;
  detail: string;
}

// Accent- and punctuation-insensitive so "réponse" / "reponse" and quoted option text
// both still match. Comparison is done on this normalized form only.
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// French and English, since the bank is French-dominant with English seed content. Each
// pattern targets phrasing that asserts an answer rather than merely discussing options.
const REVEAL_PHRASE_PATTERNS: { pattern: RegExp; detail: string }[] = [
  { pattern: /\b(la |une )?(bonne|vraie|juste) reponse\b/, detail: "states 'bonne réponse'" },
  { pattern: /\breponse (correcte|exacte|juste|attendue)\b/, detail: "states 'réponse correcte/exacte'" },
  { pattern: /\bcorrect answer\b/, detail: "states 'correct answer'" },
  { pattern: /\bright answer\b/, detail: "states 'right answer'" },
  { pattern: /\bthe answer is\b/, detail: "states 'the answer is'" },
  { pattern: /\bil faut (choisir|cocher|selectionner)\b/, detail: "instructs which option to pick" },
  { pattern: /\b(choose|select|pick) (option )?[a-h]\b/, detail: "instructs which option to pick" },
  { pattern: /\b(eliminez|excluez|ecartez)\b/, detail: "instructs the student to eliminate options" },
  { pattern: /\b(rule out|eliminate|discard) (option )?[a-h]\b/, detail: "instructs elimination of an option" },
  { pattern: /\b(bonne|mauvaise)s? (proposition|option)s?\b/, detail: "labels options as good/bad" },
  { pattern: /\b(correct|incorrect|wrong|true|false) option\b/, detail: "labels an option correct/incorrect" },
  { pattern: /\boption [a-h] (is|est)\b/, detail: "asserts something about a specific option" },
  { pattern: /\b(proposition|reponse) [a-h] (est|is)\b/, detail: "asserts something about a specific option" },
];

// A bare label used imperatively/assertively, e.g. "c'est A", "it's B". Requires the
// label to stand alone as a word so ordinary letters inside words never match.
const DEFINITIVE_LABEL_PATTERNS: { pattern: RegExp; detail: string }[] = [
  { pattern: /\b(c est|cest|il s agit de|voici) (l option )?[a-h]\b/, detail: "asserts a specific option" },
  { pattern: /\b(it s|its|this is) (option )?[a-h]\b/, detail: "asserts a specific option" },
  { pattern: /\b(reponse|answer|option|proposition)\s*[:=]\s*[a-h]\b/, detail: "names an option as the answer" },
];

// The longest normalized word-boundary phrase shared by both strings, used to detect a
// hint that reuses the correct option's distinctive wording verbatim.
function longestSharedPhrase(hint: string, optionText: string): string {
  const optionWords = optionText.split(" ").filter(Boolean);
  let longest = "";
  for (let start = 0; start < optionWords.length; start += 1) {
    for (let end = optionWords.length; end > start; end -= 1) {
      const phrase = optionWords.slice(start, end).join(" ");
      if (phrase.length <= longest.length) {
        break;
      }
      if (hint.includes(phrase)) {
        longest = phrase;
        break;
      }
    }
  }
  return longest;
}

export interface HintSafetyInput {
  hintText: string;
  options: { bodyText: string; isCorrect: boolean }[];
}

// Returns every reason the hint is unsafe (empty array = safe to show).
//
// The wording check is deliberately ASYMMETRIC: reusing the correct option's distinctive
// wording is a leak, while the same overlap with an incorrect option is not — it can't
// point the student at the answer. A hint that reuses a long phrase found in BOTH a
// correct and an incorrect option is discussing shared vocabulary, not disclosing, so
// that case is allowed.
export function detectHintLeaks({ hintText, options }: HintSafetyInput): LeakFinding[] {
  const hint = normalize(hintText);
  const findings: LeakFinding[] = [];

  for (const { pattern, detail } of REVEAL_PHRASE_PATTERNS) {
    if (pattern.test(hint)) {
      findings.push({ kind: "REVEAL_PHRASE", detail });
    }
  }

  for (const { pattern, detail } of DEFINITIVE_LABEL_PATTERNS) {
    if (pattern.test(hint)) {
      findings.push({ kind: "OPTION_REFERENCE", detail });
    }
  }

  const incorrectTexts = options.filter((option) => !option.isCorrect).map((option) => normalize(option.bodyText));

  for (const option of options.filter((candidate) => candidate.isCorrect)) {
    const normalizedOption = normalize(option.bodyText);
    if (!normalizedOption) {
      continue;
    }
    const shared = longestSharedPhrase(hint, normalizedOption);
    if (shared.length < MIN_LEAKED_PHRASE_CHARS) {
      continue;
    }
    if (incorrectTexts.some((incorrect) => incorrect.includes(shared))) {
      continue;
    }
    findings.push({
      kind: "CORRECT_OPTION_WORDING",
      detail: `reuses ${shared.length} characters of the correct option's wording ("${shared}")`,
    });
  }

  return findings;
}

export function assertHintable(question: HintQuestion): void {
  if (!(HINTABLE_QUESTION_TYPES as readonly string[]).includes(question.type)) {
    throw new ContextualHintError("UNSUPPORTED_TYPE", `Question ${question.id} is type '${question.type}'.`);
  }
  if (question.options.length < MIN_OPTIONS) {
    throw new ContextualHintError(
      "TOO_FEW_OPTIONS",
      `Question ${question.id} has ${question.options.length} option(s), needs at least ${MIN_OPTIONS}.`
    );
  }
}

export interface HintUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface HintResult {
  hintText: string;
  attempts: number;
  // Findings from rejected attempts, kept for logging/diagnostics. A returned hint always
  // has zero findings of its own.
  rejectedFindings: LeakFinding[][];
  usage: HintUsage;
  model: string;
  promptVersion: string;
}

async function callModel(userPrompt: string, corrective: string | null): Promise<{ hint: string; usage: HintUsage }> {
  let message: Anthropic.Message;
  try {
    message = await getAnthropicClient().messages.create({
      model: HINT_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      // A little warmth so a retry actually differs from the rejected attempt, but low
      // enough to keep the hint disciplined.
      temperature: 0.5,
      system: corrective ? `${SYSTEM_PROMPT}\n\n${corrective}` : SYSTEM_PROMPT,
      tools: [SUBMIT_TOOL],
      tool_choice: { type: "tool", name: SUBMIT_TOOL.name },
      messages: [{ role: "user", content: userPrompt }],
    });
  } catch (err) {
    throw new ContextualHintError("API_ERROR", err instanceof Error ? err.message : String(err));
  }

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === SUBMIT_TOOL.name
  );
  if (!toolUse) {
    throw new ContextualHintError(
      "NO_TOOL_USE",
      `Model returned no ${SUBMIT_TOOL.name} call (stop_reason: ${message.stop_reason}).`
    );
  }

  const parsed = toolResponseSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new ContextualHintError("SCHEMA_INVALID", `Tool output failed validation: ${parsed.error.message}`);
  }

  return {
    hint: parsed.data.hint.trim(),
    usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
  };
}

// Generates a hint and refuses to return one that fails the leak check. One corrective
// retry, then UNSAFE_HINT — the caller treats that exactly like an API failure and
// refunds the credit, so a student is never charged for a hint they never saw.
export async function generateContextualHint(
  question: HintQuestion,
  personalization: HintPersonalization
): Promise<HintResult> {
  assertHintable(question);

  const userPrompt = buildHintPrompt(toHintPromptView(question, personalization));
  const rejectedFindings: LeakFinding[][] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const { hint, usage } = await callModel(userPrompt, attempt === 1 ? null : RETRY_INSTRUCTION);
    totalInputTokens += usage.inputTokens;
    totalOutputTokens += usage.outputTokens;

    const findings = detectHintLeaks({ hintText: hint, options: question.options });
    if (findings.length === 0) {
      return {
        hintText: hint,
        attempts: attempt,
        rejectedFindings,
        usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
        model: HINT_MODEL,
        promptVersion: HINT_PROMPT_VERSION,
      };
    }
    rejectedFindings.push(findings);
  }

  throw new ContextualHintError(
    "UNSAFE_HINT",
    `Hint for question ${question.id} failed the leak check on all ${MAX_ATTEMPTS} attempts: ${rejectedFindings
      .map((findings, index) => `attempt ${index + 1}: ${findings.map((finding) => finding.detail).join("; ")}`)
      .join(" | ")}`
  );
}
