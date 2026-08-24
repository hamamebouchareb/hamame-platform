import "dotenv/config";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { isAiConfigured } from "../lib/ai/anthropic";
import {
  EXPLAINABLE_QUESTION_TYPES,
  GenerationFailureReason,
  McqExplanationError,
  MCQ_EXPLANATION_MODEL,
  ExplainableQuestion,
  generateMcqExplanation,
  loadExplainableQuestion,
  storeMcqExplanation,
} from "../lib/ai/mcq-explanation";

// One-time backfill of Question.aiEnhancedExplanation for the existing question bank.
// Run MANUALLY only (npm run ai:backfill-explanations) — nothing imports this, and it is
// deliberately not registered with the cron jobs in src/jobs/.
//
// Resumability is a property of the query, not of any saved state file: the selector only
// matches questions whose ai_enhanced_explanation is still NULL, so a completed question
// is invisible to the next run and a failed one is retried. Interrupting with Ctrl+C is
// safe — every question is written the moment it succeeds.
//
// Flags:
//   --dry-run              generate and print, write nothing (use this to judge quality)
//   --limit=N              process at most N questions
//   --question-id=<uuid>   process exactly one question
//   --concurrency=N        parallel Anthropic calls (default 3)
//
// Concurrency note: N controls outbound HTTP, and each worker issues at most one database
// query at a time (load, then write), so peak database concurrency is N. Keep it well
// under the Supabase session pooler's ~10 simultaneous-query ceiling.

const DEFAULT_CONCURRENCY = 3;
const MAX_CONCURRENCY = 6;

// Reasons a question can never succeed, so it is reported as skipped rather than as a
// failure to retry on the next run.
const PERMANENT_SKIP_REASONS: readonly GenerationFailureReason[] = [
  "NOT_FOUND",
  "NOT_APPROVED",
  "UNSUPPORTED_TYPE",
  "TOO_FEW_OPTIONS",
];

interface Options {
  dryRun: boolean;
  limit: number | null;
  questionId: string | null;
  concurrency: number;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { dryRun: false, limit: null, questionId: null, concurrency: DEFAULT_CONCURRENCY };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    const match = /^--([a-z-]+)=(.+)$/.exec(arg);
    if (!match) {
      throw new Error(`Unrecognized argument '${arg}'.`);
    }
    const [, key, value] = match;
    if (key === "limit") {
      options.limit = Number(value);
      if (!Number.isInteger(options.limit) || options.limit < 1) {
        throw new Error("--limit must be a positive integer.");
      }
    } else if (key === "question-id") {
      options.questionId = value;
    } else if (key === "concurrency") {
      options.concurrency = Number(value);
      if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > MAX_CONCURRENCY) {
        throw new Error(`--concurrency must be an integer between 1 and ${MAX_CONCURRENCY}.`);
      }
    } else {
      throw new Error(`Unrecognized argument '${arg}'.`);
    }
  }

  return options;
}

function buildWhere(options: Options): Prisma.QuestionWhereInput {
  return {
    ...(options.questionId ? { id: options.questionId } : {}),
    status: "approved",
    type: { in: [...EXPLAINABLE_QUESTION_TYPES] },
    // NOTE: `aiEnhancedExplanation: null` is a Prisma validation error on Json fields —
    // a nullable JsonB column must be matched with `{ equals: Prisma.DbNull }`. This one
    // filter is what makes the whole script resumable and idempotent.
    aiEnhancedExplanation: { equals: Prisma.DbNull },
  };
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

function printDryRun(question: ExplainableQuestion, payload: Awaited<ReturnType<typeof generateMcqExplanation>>["payload"]) {
  const byId = new Map(question.options.map((option) => [option.id, option]));
  console.log(`\n--- ${question.id} (${question.type}, difficulty: ${question.difficulty ?? "n/a"}) ---`);
  console.log(`Key takeaway: ${payload.keyTakeaway}`);
  for (const option of payload.options) {
    const label = option.isCorrect ? "CORRECT  " : "INCORRECT";
    console.log(`  [${option.orderIndex}] ${label} ${byId.get(option.optionId)?.bodyText ?? ""}`);
    console.log(`      ${option.text}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!isAiConfigured()) {
    throw new Error("ANTHROPIC_API_KEY is not set — add it to .env before running this script.");
  }

  const targets = await prisma.question.findMany({
    where: buildWhere(options),
    select: { id: true },
    orderBy: { createdAt: "asc" },
    ...(options.limit ? { take: options.limit } : {}),
  });

  const total = targets.length;
  console.log(
    `Backfilling ai_enhanced_explanation with ${MCQ_EXPLANATION_MODEL} — ${total} question(s) to process` +
      `, concurrency ${options.concurrency}${options.dryRun ? ", DRY RUN (nothing will be written)" : ""}.`
  );
  if (total === 0) {
    return;
  }

  // Ctrl+C stops handing out new questions and lets in-flight ones finish, so the run
  // ends with a readable summary instead of a torn-off log.
  let stopping = false;
  process.on("SIGINT", () => {
    if (stopping) process.exit(130);
    stopping = true;
    console.log("\nInterrupted — draining in-flight questions, then stopping. Re-run to resume.");
  });

  const startedAt = Date.now();
  let written = 0;
  let skipped = 0;
  let alreadyPresent = 0;
  let processed = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let estimatedUsd = 0;
  const failuresByReason = new Map<GenerationFailureReason | "UNKNOWN", number>();

  await runPool(targets, options.concurrency, async (target) => {
    if (stopping) return;
    const position = `[${++processed}/${total}]`;

    try {
      const question = await loadExplainableQuestion(prisma, target.id);
      if (!question) {
        throw new McqExplanationError("NOT_FOUND", `No question exists with id ${target.id}.`);
      }

      const { payload, usage } = await generateMcqExplanation(question);
      inputTokens += usage.inputTokens;
      outputTokens += usage.outputTokens;
      estimatedUsd += usage.estimatedUsd;

      if (options.dryRun) {
        written += 1;
        console.log(
          `${position} generated ${target.id} (in ${usage.inputTokens} / out ${usage.outputTokens} tok, ~$${usage.estimatedUsd.toFixed(4)})`
        );
        printDryRun(question, payload);
        return;
      }

      const stored = await storeMcqExplanation(prisma, target.id, payload);
      if (stored) {
        written += 1;
      } else {
        alreadyPresent += 1;
      }
      console.log(
        `${position} ${stored ? "written " : "existing"} ${target.id} (in ${usage.inputTokens} / out ${usage.outputTokens} tok, ~$${usage.estimatedUsd.toFixed(4)})`
      );
    } catch (err) {
      // A single bad question must never abort the run: classify it, log it, move on.
      if (err instanceof McqExplanationError) {
        if (PERMANENT_SKIP_REASONS.includes(err.reason)) {
          skipped += 1;
          console.log(`${position} skipped ${target.id} — ${err.reason}: ${err.message}`);
          return;
        }
        failuresByReason.set(err.reason, (failuresByReason.get(err.reason) ?? 0) + 1);
        console.error(`${position} FAILED  ${target.id} — ${err.reason}: ${err.message}`);
        return;
      }
      failuresByReason.set("UNKNOWN", (failuresByReason.get("UNKNOWN") ?? 0) + 1);
      console.error(`${position} FAILED  ${target.id} — UNKNOWN: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  const failed = [...failuresByReason.values()].reduce((sum, count) => sum + count, 0);
  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log(
    `\nDone in ${elapsedSeconds}s — ${written} ${options.dryRun ? "generated" : "written"}` +
      `${alreadyPresent > 0 ? `, ${alreadyPresent} already present` : ""}` +
      `, ${skipped} skipped, ${failed} failed.`
  );
  console.log(
    `Tokens: ${inputTokens} in / ${outputTokens} out — estimated $${estimatedUsd.toFixed(4)} at standard Haiku 4.5 rates.`
  );

  if (failed > 0) {
    console.log("Failures by reason:");
    for (const [reason, count] of failuresByReason) {
      console.log(`  ${reason}: ${count}`);
    }
    console.log("Re-run the same command to retry only the questions that are still missing an explanation.");
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
