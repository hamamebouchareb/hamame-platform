import { NextFunction, Request, Response, Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { validateBody, validateParams, validateQuery } from "../middleware/validate";
import { paginationQuery, uuidParam } from "../lib/common-schemas";
import { requireAuth } from "../middleware/auth";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { enqueueReviewQueueItem } from "./reviews.routes";
import {
  FLASHCARD_TEXT_MAX_LENGTH,
  createFlashcardFromQuestion,
  findFlashcardSourceQuestion,
} from "../lib/flashcard-from-question";
import { resolveViewerUniversityId } from "../lib/university-scope";

// Flashcard content type (prisma/schema.prisma's Flashcard model) — user-generated
// front/back pairs, optionally sourced from a question or lesson. Integration with the
// existing spaced-repetition engine is via ReviewQueueItem.flashcardId: flashcards are
// enqueued into the SAME due-queue as lessons/questions (see POST /:id/enqueue below and
// enqueueReviewQueueItem in reviews.routes.ts) — there is no second queue system.
const router = Router();

router.use(requireAuth);

const QUESTION_LABEL_MAX_LENGTH = 80;

// Response shape strips the internal userId — the caller already knows it's their own.
function toFlashcardResponse(flashcard: {
  id: string;
  front: string;
  back: string;
  sourceQuestionId: string | null;
  sourceLessonId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: flashcard.id,
    front: flashcard.front,
    back: flashcard.back,
    sourceQuestionId: flashcard.sourceQuestionId,
    sourceLessonId: flashcard.sourceLessonId,
    createdAt: flashcard.createdAt,
    updatedAt: flashcard.updatedAt,
  };
}

// POST /api/flashcards — create a flashcard, optionally tied to a question/lesson.
const createFlashcardSchema = z.object({
  front: z.string().min(1).max(FLASHCARD_TEXT_MAX_LENGTH),
  back: z.string().min(1).max(FLASHCARD_TEXT_MAX_LENGTH),
  sourceQuestionId: z.string().uuid().optional(),
  sourceLessonId: z.string().uuid().optional(),
});

async function createFlashcard(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { front, back, sourceQuestionId, sourceLessonId } = req.body as z.infer<typeof createFlashcardSchema>;

    // FK guards, mirroring notes.routes.ts: a bad target would otherwise surface as a
    // confusing P2003 FK error on create.
    if (sourceQuestionId) {
      const question = await prisma.question.findUnique({ where: { id: sourceQuestionId }, select: { id: true } });
      if (!question) {
        throw new ApiError(404, "QUESTION_NOT_FOUND", "No question exists with this id.");
      }
    }
    if (sourceLessonId) {
      const lesson = await prisma.lesson.findUnique({ where: { id: sourceLessonId }, select: { id: true } });
      if (!lesson) {
        throw new ApiError(404, "LESSON_NOT_FOUND", "No lesson exists with this id.");
      }
    }

    // The (userId, sourceQuestionId) unique index added in migration 20260101000012
    // applies here too, so a second card explicitly tagged to the same source question is
    // now rejected rather than silently duplicated. Reported as 409 rather than made
    // idempotent like POST /from-question: this caller supplied its own front/back, and
    // quietly returning a pre-existing card with different content would be misleading.
    // Caught rather than pre-checked so the concurrent case can't slip through as a
    // generic 500 — safe here because this route uses the plain client, not a transaction.
    let flashcard;
    try {
      flashcard = await prisma.flashcard.create({
        data: { userId, front, back, sourceQuestionId, sourceLessonId },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ApiError(
          409,
          "FLASHCARD_ALREADY_EXISTS",
          "You already have a flashcard for this source question."
        );
      }
      throw err;
    }

    res.status(201).json({ flashcard: toFlashcardResponse(flashcard) });
  } catch (err) {
    next(err);
  }
}

router.post("/", validateBody(createFlashcardSchema), createFlashcard);

// POST /api/flashcards/from-question/:questionId — create a card from a question,
// idempotent per (caller, source question).
//
// Pre-fills front = question.bodyRichtext and back = question.explanationRichtext (both
// plain-text extracted + truncated), sets sourceQuestionId, and creates the row directly
// so the client never round-trips content it already has. The frontend decides when this
// is useful (e.g. its existing "wrong answer" flow) — the backend makes no judgment
// about whether the question was answered wrong, it just supports the creation.
//
// Idempotent rather than the "one-shot" it used to be: 201 with a new card the first
// time, 200 with the existing card afterwards (same created-flag convention as the
// enqueue endpoints). The dedup is enforced by a unique index, so it holds under
// concurrent requests too — see createFlashcardFromQuestion for the full reasoning.
//
// The source question must be approved (BR-2), belong to a visible faculty, and be visible
// to this user's university (FR-10a) — the same gate the shared lib applies in the session
// auto-generate hook. Missing, non-approved, hidden-faculty and other-university questions
// all resolve to the same 404 (QUESTION_NOT_FOUND), so a direct questionId probe can't turn
// content the user can't see into a flashcard (same bug class as the earlier
// faculty-visibility leak).
async function createFromQuestion(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { questionId } = req.params;

    const viewerUniversityId = await resolveViewerUniversityId(prisma, userId);

    const source = await findFlashcardSourceQuestion(prisma, questionId, viewerUniversityId);
    if (!source) {
      throw new ApiError(404, "QUESTION_NOT_FOUND", "No approved question exists with this id.");
    }

    const { flashcard, created } = await createFlashcardFromQuestion(prisma, userId, source);

    res.status(created ? 201 : 200).json({ flashcard: toFlashcardResponse(flashcard) });
  } catch (err) {
    next(err);
  }
}

router.post("/from-question/:questionId", validateParams(uuidParam("questionId")), createFromQuestion);

// GET /api/flashcards — list the caller's flashcards, most recent first, paginated.
async function listFlashcards(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { page, limit } = req.query as unknown as z.infer<typeof paginationQuery>;

    const [total, flashcards] = await Promise.all([
      prisma.flashcard.count({ where: { userId } }),
      prisma.flashcard.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.status(200).json({
      flashcards: flashcards.map(toFlashcardResponse),
      pagination: { page, limit, total },
    });
  } catch (err) {
    next(err);
  }
}

router.get("/", validateQuery(paginationQuery), listFlashcards);

// GET /api/flashcards/:id — single flashcard. Anti-probe: a row that exists but belongs
// to someone else is indistinguishable from a missing row (404, not 403) — matching the
// GET conventions in reviews.routes.ts.
async function getFlashcard(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params;

    const flashcard = await prisma.flashcard.findFirst({ where: { id, userId } });
    if (!flashcard) {
      throw new ApiError(404, "FLASHCARD_NOT_FOUND", "No flashcard exists with this id.");
    }

    res.status(200).json({ flashcard: toFlashcardResponse(flashcard) });
  } catch (err) {
    next(err);
  }
}

router.get("/:id", validateParams(uuidParam("id")), getFlashcard);

// PUT /api/flashcards/:id — update front/back. Ownership is explicit here (403, not the
// generic 404): a mutating action on someone else's card should be visible as forbidden
// rather than hidden as missing.
const updateFlashcardSchema = z
  .object({
    front: z.string().min(1).max(FLASHCARD_TEXT_MAX_LENGTH).optional(),
    back: z.string().min(1).max(FLASHCARD_TEXT_MAX_LENGTH).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.front && !data.back) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one of front or back is required.",
        path: ["front"],
      });
    }
  });

async function updateFlashcard(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params;
    const { front, back } = req.body as z.infer<typeof updateFlashcardSchema>;

    const flashcard = await prisma.flashcard.findUnique({ where: { id } });
    if (!flashcard) {
      throw new ApiError(404, "FLASHCARD_NOT_FOUND", "No flashcard exists with this id.");
    }
    if (flashcard.userId !== userId) {
      throw new ApiError(403, "FLASHCARD_FORBIDDEN", "This flashcard does not belong to you.");
    }

    const updated = await prisma.flashcard.update({
      where: { id },
      data: { front, back },
    });

    res.status(200).json({ flashcard: toFlashcardResponse(updated) });
  } catch (err) {
    next(err);
  }
}

router.put("/:id", validateParams(uuidParam("id")), validateBody(updateFlashcardSchema), updateFlashcard);

// DELETE /api/flashcards/:id — ownership-checked (403 for someone else's card). Any
// ReviewQueueItem rows referencing this flashcard cascade-delete via the
// ReviewQueueItem.flashcard FK (onDelete: Cascade) — no manual cleanup needed here, and
// the verification section confirms that cascade against the real DB.
async function deleteFlashcard(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params;

    const flashcard = await prisma.flashcard.findUnique({ where: { id } });
    if (!flashcard) {
      throw new ApiError(404, "FLASHCARD_NOT_FOUND", "No flashcard exists with this id.");
    }
    if (flashcard.userId !== userId) {
      throw new ApiError(403, "FLASHCARD_FORBIDDEN", "This flashcard does not belong to you.");
    }

    await prisma.flashcard.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

router.delete("/:id", validateParams(uuidParam("id")), deleteFlashcard);

// POST /api/flashcards/:id/enqueue — enqueue this flashcard for review, due immediately.
//
// Reuses the shared idempotent enqueueReviewQueueItem used by the manual
// POST /api/reviews/enqueue and the session auto-enqueue, so flashcards flow into the
// SAME ReviewQueueItem engine as lessons/questions (no second queue). Consistent with
// the manual enqueue endpoint, there is no review_settings opt-in gate here.
async function enqueueFlashcard(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params;

    const flashcard = await prisma.flashcard.findUnique({ where: { id }, select: { id: true, userId: true } });
    if (!flashcard) {
      throw new ApiError(404, "FLASHCARD_NOT_FOUND", "No flashcard exists with this id.");
    }
    if (flashcard.userId !== userId) {
      throw new ApiError(403, "FLASHCARD_FORBIDDEN", "This flashcard does not belong to you.");
    }

    const { item, created } = await enqueueReviewQueueItem(prisma, { userId, flashcardId: id });
    res.status(created ? 201 : 200).json({ item });
  } catch (err) {
    next(err);
  }
}

router.post("/:id/enqueue", validateParams(uuidParam("id")), enqueueFlashcard);

export default router;
