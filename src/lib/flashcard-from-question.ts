import { randomUUID } from "node:crypto";
import { Flashcard, Prisma, PrismaClient } from "@prisma/client";
import { universityScopeFilter } from "./university-scope";

// Shared flashcard-from-question logic, used by BOTH the manual
// POST /api/flashcards/from-question route (flashcards.routes.ts) and the automatic
// create-on-wrong-answer hook in sessions.routes.ts, so the two can't drift on the
// extraction rules or the source-question visibility gate.

export const FLASHCARD_TEXT_MAX_LENGTH = 2000;

// Same visible-status set as curriculum.routes.ts. Kept local (like that file) rather
// than importing across route/lib boundaries, matching the repo's deliberate pattern of
// small duplicated constants over cross-module coupling — but any change here MUST stay
// in sync with curriculum.routes.ts's VISIBLE_ROLLOUT_STATUSES.
const VISIBLE_ROLLOUT_STATUSES = ["beta", "live"] as const;

// bodyRichtext/explanationRichtext are JSON rich-text documents. Seed data uses two
// shapes: { text: "..." } for questions and { blocks: [{ type, text }] } for lessons.
// This derives plain text for flashcard front/back without a rich-text renderer here
// (rendering is a frontend concern). Never returns the raw JSON or "[object Object]".
export function extractRichtextText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") {
      return record.text;
    }
    if (Array.isArray(record.blocks)) {
      return record.blocks
        .map((block) => (block && typeof block === "object" ? (block as { text?: unknown }).text : undefined))
        .filter((text): text is string => typeof text === "string")
        .join(" ");
    }
  }
  return "";
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export interface FlashcardSourceQuestion {
  id: string;
  bodyRichtext: Prisma.JsonValue;
  explanationRichtext: Prisma.JsonValue;
}

// Loads the question a flashcard may be sourced from, enforcing the same visibility
// rules that protect the rest of the platform:
//   - status 'approved' (BR-2 mandatory validation gate) — a non-approved question must
//     never become a flashcard a student studies;
//   - the faculty must be visible (rolloutStatus beta/live), matching the per-route
//     gating in curriculum.routes.ts.
// This closes the same bug class as the earlier faculty-visibility leak: a direct
// questionId probe must not bypass faculty hiding by turning a hidden-faculty question
// into a flashcard. Returns null for missing / non-approved / hidden-faculty /
// other-university questions alike, so the route layer can 404 without distinguishing
// which one — hidden content stays indistinguishable from missing content.
//
// viewerUniversityId is required rather than optional for the same reason as in
// question-filters.ts: an optional visibility argument is one forgotten call site away
// from being a leak. Null means global content only.
export async function findFlashcardSourceQuestion(
  client: Prisma.TransactionClient | PrismaClient,
  questionId: string,
  viewerUniversityId: string | null
): Promise<FlashcardSourceQuestion | null> {
  return client.question.findFirst({
    where: {
      id: questionId,
      status: "approved",
      unit: { module: { year: { faculty: { rolloutStatus: { in: [...VISIBLE_ROLLOUT_STATUSES] } } } } },
      AND: [universityScopeFilter(viewerUniversityId)],
    },
    select: { id: true, bodyRichtext: true, explanationRichtext: true },
  });
}

// Creates a flashcard from an already-validated source question, idempotent on
// (userId, sourceQuestionId) — one card per user per source question.
//
// This dedup used to live in the session hook as a findFirst-then-create, which raced the
// same way enqueueReviewQueueItem did: concurrent wrong-answer submits for the same
// question both read "no card yet" and both inserted. Two duplicate cards then earned two
// legitimately-distinct queue items, so fixing only the queue-item dedup would not have
// removed the duplicate-card symptom. It is now enforced by the unique index added in
// migration 20260101000012_add_review_queue_and_flashcard_unique_constraints and the
// `ON CONFLICT DO NOTHING` insert below.
//
// Raw SQL rather than prisma.create/upsert for the same reason as enqueueReviewQueueItem
// (see the long note there): one caller passes a transaction client, and in Postgres a
// raised unique violation would abort that transaction and roll back the whole session
// submit. ON CONFLICT DO NOTHING never raises.
//
// BEHAVIOR CHANGE, deliberate and approved: the manual POST /api/flashcards/from-question
// route was previously "one-shot by design" and would happily create a second card for a
// question that already had one. It is now idempotent too — it returns the existing card
// with 200 instead of a duplicate with 201. Both callers share this function precisely so
// they can't drift on the dedup rule.
export async function createFlashcardFromQuestion(
  client: Prisma.TransactionClient | PrismaClient,
  userId: string,
  source: FlashcardSourceQuestion
): Promise<{ flashcard: Flashcard; created: boolean }> {
  const id = randomUUID();
  const front = truncate(extractRichtextText(source.bodyRichtext), FLASHCARD_TEXT_MAX_LENGTH);
  const back = truncate(extractRichtextText(source.explanationRichtext), FLASHCARD_TEXT_MAX_LENGTH);
  // updated_at has no DB default (Prisma manages @updatedAt application-side), so a raw
  // insert has to supply it explicitly; created_at does have a DB default.
  const now = new Date();

  const inserted = await client.$executeRaw`
    INSERT INTO "flashcards" ("id", "user_id", "front", "back", "source_question_id", "updated_at")
    VALUES (${id}::uuid, ${userId}::uuid, ${front}, ${back}, ${source.id}::uuid, ${now})
    ON CONFLICT ("user_id", "source_question_id") DO NOTHING`;

  // Read back through Prisma so callers get a properly typed Flashcard rather than a raw
  // driver row. On conflict this returns the card that already existed, whose front/back
  // are deliberately left as they were — a re-generate must not silently overwrite a card
  // the student may have edited via PUT /api/flashcards/:id.
  const flashcard =
    inserted > 0
      ? await client.flashcard.findUniqueOrThrow({ where: { id } })
      : await client.flashcard.findFirstOrThrow({ where: { userId, sourceQuestionId: source.id } });

  return { flashcard, created: inserted > 0 };
}
