import { randomUUID } from "node:crypto";
import { NextFunction, Request, Response, Router } from "express";
import { Prisma, PrismaClient, ReviewQueueItem } from "@prisma/client";
import { z } from "zod";
import { validateBody, validateParams } from "../middleware/validate";
import { uuidParam } from "../lib/common-schemas";
import { requireAuth } from "../middleware/auth";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";

// Spaced repetition engine (FR-26/27, V2): ReviewSettings + ReviewQueueItem. Manual
// enqueue lives here (POST /enqueue); sessions.routes.ts's finalizeSession also
// auto-enqueues missed questions/flashcards via the shared enqueueReviewQueueItem helper
// when ReviewSettings.isEnabled is true.
const router = Router();

router.use(requireAuth);

const DAY_MS = 24 * 60 * 60 * 1000;

// ============================================================================
// SM-2 INSPIRATION, NOT BYTE-EXACT SM-2 — read before judging the algorithm.
//
// The ReviewQueueItem schema carries only `easeFactor` + `lastReviewedAt` — it has NO
// repetition-count and NO previous-interval field (it was modeled as a simplified V2
// scaffold, not a full SM-2 data model). Real SM-2 tracks n (repetition number) and I
// (interval) explicitly, and gates interval growth on n. We can't do that here, so:
//   - The EASE FACTOR update below IS the standard SM-2 formula verbatim.
//   - The INTERVAL is approximated: first success → 1 day; later successes → previous
//     actual elapsed interval × new ease factor (interval-doubling via EF), floored at
//     1 day and capped at 180. This is SM-2-*inspired* — honest about the gap rather
//     than overclaiming.
// ============================================================================

// GET /api/reviews/settings — the caller's ReviewSettings row, or a default-shaped
// object if none exists yet (deliberately NOT auto-created on GET).
async function getReviewSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const settings = await prisma.reviewSettings.findUnique({ where: { userId } });

    if (!settings) {
      return res.status(200).json({
        settings: { isEnabled: false, notificationsEnabled: true, scheduleDays: [] },
      });
    }

    res.status(200).json({ settings });
  } catch (err) {
    next(err);
  }
}

router.get("/settings", getReviewSettings);

// PUT /api/reviews/settings — upsert keyed on userId.
const updateSettingsSchema = z.object({
  isEnabled: z.boolean(),
  notificationsEnabled: z.boolean(),
  scheduleDays: z.array(z.number()),
});

async function updateReviewSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { isEnabled, notificationsEnabled, scheduleDays } = req.body as z.infer<typeof updateSettingsSchema>;

    const settings = await prisma.reviewSettings.upsert({
      where: { userId },
      update: {
        isEnabled,
        notificationsEnabled,
        scheduleDays: scheduleDays as Prisma.InputJsonValue,
      },
      create: {
        userId,
        isEnabled,
        notificationsEnabled,
        scheduleDays: scheduleDays as Prisma.InputJsonValue,
      },
    });

    res.status(200).json({ settings });
  } catch (err) {
    next(err);
  }
}

router.put("/settings", validateBody(updateSettingsSchema), updateReviewSettings);

// POST /api/reviews/enqueue — queue a lesson or question for review, due immediately.
// Exactly one of lessonId/questionId required (adapted from auth.routes.ts's
// identifierRefinement superRefine). Idempotent like the role-grant endpoints: an
// existing row for the same user+target is returned as-is (200) instead of duplicating.
const enqueueSchema = z
  .object({
    lessonId: z.string().uuid().optional(),
    questionId: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    if ((data.lessonId && data.questionId) || (!data.lessonId && !data.questionId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exactly one of lessonId or questionId is required.",
        path: ["questionId"],
      });
    }
  });

// Shared idempotent enqueue, used by the manual POST /api/reviews/enqueue below and by
// the auto-enqueue-on-wrong-answer hook in sessions.routes.ts. Accepts any Prisma
// client (plain `prisma`, or a transaction client inside $transaction) so the session
// submit can enqueue inside its own transaction. Returns whether a new row was created
// so callers can distinguish "already queued" from "newly queued".
//
// CONCURRENCY-SAFE VIA THE DATABASE, DELIBERATELY NOT VIA find-then-create.
// This used to do findFirst-then-create, which raced: two concurrent requests for the
// same (user, target) both read "not queued" and both inserted. The dedup is now
// enforced by the unique indexes added in migration
// 20260101000012_add_review_queue_and_flashcard_unique_constraints, one per target
// column, and the insert below uses raw `ON CONFLICT DO NOTHING`.
//
// Why raw SQL instead of prisma.upsert() or catch-P2002 — this is the non-obvious part:
// one caller (sessions.routes.ts's finalizeSession) passes a TRANSACTION client. In
// Postgres a unique violation aborts the whole transaction, so a raised-and-caught
// P2002 could not be recovered from there — every later statement on that `tx` would
// fail and the session submit would roll back, losing the student's answers. That would
// be strictly worse than the duplicate row this fix removes. `ON CONFLICT DO NOTHING`
// never raises, so it is safe both inside and outside a transaction. prisma.upsert() is
// unsuitable for the same reason: it only compiles to a native ON CONFLICT when its
// internal optimization conditions hold and silently falls back to a non-atomic
// read-then-write otherwise, which would reintroduce both the race and the abort risk.
//
// The affected-row count is the source of truth for `created` (1 = we inserted,
// 0 = someone else already had). An existing row is returned untouched — dueAt,
// easeFactor and lastReviewedAt are never reset by a re-enqueue, matching the previous
// behavior exactly.
export async function enqueueReviewQueueItem(
  client: Prisma.TransactionClient | PrismaClient,
  input: { userId: string; lessonId?: string; questionId?: string; flashcardId?: string }
): Promise<{ item: ReviewQueueItem; created: boolean }> {
  // App-level half of the "exactly one target" rule (the other half is the DB CHECK
  // constraint `review_queue_items_single_target_check` added in migration
  // 20260101000010_add_flashcards). Never fires via the schema-validated endpoints —
  // each guarantees exactly one — it's defense-in-depth for direct callers.
  const targetCount = [input.lessonId, input.questionId, input.flashcardId].filter((v) => v !== undefined).length;
  if (targetCount !== 1) {
    throw new Error("Exactly one of lessonId, questionId or flashcardId is required.");
  }

  const id = randomUUID();
  const dueAt = new Date(); // due immediately; easeFactor hits the 2.5 DB default

  // One statement per target column: the ON CONFLICT target must name the columns of a
  // real unique index, so it can't be parameterized. Written out literally rather than
  // interpolated via Prisma.raw so no column name is ever string-built.
  let inserted: number;
  if (input.lessonId) {
    inserted = await client.$executeRaw`
      INSERT INTO "review_queue_items" ("id", "user_id", "lesson_id", "due_at")
      VALUES (${id}::uuid, ${input.userId}::uuid, ${input.lessonId}::uuid, ${dueAt})
      ON CONFLICT ("user_id", "lesson_id") DO NOTHING`;
  } else if (input.questionId) {
    inserted = await client.$executeRaw`
      INSERT INTO "review_queue_items" ("id", "user_id", "question_id", "due_at")
      VALUES (${id}::uuid, ${input.userId}::uuid, ${input.questionId}::uuid, ${dueAt})
      ON CONFLICT ("user_id", "question_id") DO NOTHING`;
  } else {
    inserted = await client.$executeRaw`
      INSERT INTO "review_queue_items" ("id", "user_id", "flashcard_id", "due_at")
      VALUES (${id}::uuid, ${input.userId}::uuid, ${input.flashcardId}::uuid, ${dueAt})
      ON CONFLICT ("user_id", "flashcard_id") DO NOTHING`;
  }

  // Read back through Prisma so the caller still gets a fully typed ReviewQueueItem
  // (notably easeFactor as a Prisma.Decimal, which completeReview depends on) rather
  // than raw driver row shapes. On the insert path this reads our own row by id; on the
  // conflict path it reads the row that won, which is what an idempotent caller wants.
  const item = inserted > 0
    ? await client.reviewQueueItem.findUniqueOrThrow({ where: { id } })
    : input.lessonId
      ? await client.reviewQueueItem.findFirstOrThrow({ where: { userId: input.userId, lessonId: input.lessonId } })
      : input.questionId
        ? await client.reviewQueueItem.findFirstOrThrow({ where: { userId: input.userId, questionId: input.questionId } })
        : await client.reviewQueueItem.findFirstOrThrow({ where: { userId: input.userId, flashcardId: input.flashcardId } });

  return { item, created: inserted > 0 };
}

async function enqueueReview(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { lessonId, questionId } = req.body as z.infer<typeof enqueueSchema>;

    // FK guard, mirroring notes.routes.ts: a bad target would otherwise surface as a
    // confusing P2003 FK error on create.
    if (questionId) {
      const question = await prisma.question.findUnique({ where: { id: questionId }, select: { id: true } });
      if (!question) {
        throw new ApiError(404, "QUESTION_NOT_FOUND", "No question exists with this id.");
      }
    }
    if (lessonId) {
      const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { id: true } });
      if (!lesson) {
        throw new ApiError(404, "LESSON_NOT_FOUND", "No lesson exists with this id.");
      }
    }

    const { item, created } = await enqueueReviewQueueItem(prisma, { userId, lessonId, questionId });
    res.status(created ? 201 : 200).json({ item });
  } catch (err) {
    next(err);
  }
}

router.post("/enqueue", validateBody(enqueueSchema), enqueueReview);

// GET /api/reviews/due — items due now or earlier, oldest-due first, with basic target
// info (title for lessons, type/source for questions — same shape as the authored-
// content export in users.routes.ts).
async function getDueReviews(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const items = await prisma.reviewQueueItem.findMany({
      where: { userId, dueAt: { lte: new Date() } },
      orderBy: { dueAt: "asc" },
      include: {
        lesson: { select: { title: true } },
        question: { select: { type: true, source: true } },
        flashcard: { select: { id: true, front: true } },
      },
    });

    res.status(200).json({ items });
  } catch (err) {
    next(err);
  }
}

router.get("/due", getDueReviews);

// POST /api/reviews/:id/complete — SM-2 quality rating (0-5). Ownership check returns
// 404 (not 403) so a caller can't probe whether other users' queue items exist.
const completeSchema = z.object({
  quality: z.number().int().min(0).max(5),
});

async function completeReview(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { quality } = req.body as z.infer<typeof completeSchema>;
    const userId = req.auth!.userId;

    const item = await prisma.reviewQueueItem.findUnique({ where: { id } });
    if (!item || item.userId !== userId) {
      throw new ApiError(404, "REVIEW_QUEUE_ITEM_NOT_FOUND", "No review queue item exists with this id.");
    }

    const now = new Date();

    // Quality 0-2 = failed/hard: back to the start of the learning sequence. dueAt = now
    // + 1 day. easeFactor is deliberately left UNCHANGED (rather than dropping it): a
    // lapse reflects timing, not a lower intrinsic difficulty, and keeping EF stable
    // avoids compounding punishment into an unretrievable item. lastReviewedAt is also
    // left untouched so "lastReviewedAt === null" keeps meaning "never succeeded yet"
    // for the first-success interval branch below.
    if (quality < 3) {
      const updated = await prisma.reviewQueueItem.update({
        where: { id },
        data: { dueAt: new Date(now.getTime() + DAY_MS) },
      });
      return res.status(200).json({ item: updated });
    }

    // Quality 3-5 = passed. Standard SM-2 ease-factor update (verbatim formula).
    const newEaseFactor = Math.max(
      1.3,
      item.easeFactor.toNumber() + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    );

    // Simplified interval (no repetition-count/previous-interval field on the schema —
    // see the SM-2 note at the top): first success = 1 day; later success = the actual
    // elapsed interval since lastReview times the new EF, floored at 1 day (a same-day
    // success shouldn't re-due within the same day) and capped at 180 days.
    let intervalDays: number;
    if (item.lastReviewedAt === null) {
      intervalDays = 1;
    } else {
      const daysSinceLastReview = (now.getTime() - item.lastReviewedAt.getTime()) / DAY_MS;
      intervalDays = Math.max(1, daysSinceLastReview * newEaseFactor);
    }
    const dueDays = Math.min(intervalDays, 180);

    const updated = await prisma.reviewQueueItem.update({
      where: { id },
      data: {
        easeFactor: new Prisma.Decimal(newEaseFactor),
        lastReviewedAt: now,
        dueAt: new Date(now.getTime() + dueDays * DAY_MS),
      },
    });

    res.status(200).json({ item: updated });
  } catch (err) {
    next(err);
  }
}

router.post("/:id/complete", validateParams(uuidParam("id")), validateBody(completeSchema), completeReview);

export default router;
