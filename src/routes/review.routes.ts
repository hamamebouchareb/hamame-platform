import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { validateBody, validateParams, validateQuery } from "../middleware/validate";
import { paginationQuery } from "../lib/common-schemas";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { isAiConfigured } from "../lib/ai/anthropic";
import { EXPLAINABLE_QUESTION_TYPES, generateAndStoreMcqExplanation } from "../lib/ai/mcq-explanation";

// docs/hamame_api_contract.md — "Content Authoring & Validation (Instructor/Reviewer)".
// These act on the Academic Reviewer's queue (PRD Section 6, BR-2). Every route below
// requires requireAuth (identity) AND requireRole('academic_reviewer', 'admin') (role).
const router = Router();

router.use(requireAuth);

const requireReviewerOrAdmin = requireRole("academic_reviewer", "admin");

const SNIPPET_MAX_LENGTH = 160;

function truncate(text: string): string {
  return text.length > SNIPPET_MAX_LENGTH ? `${text.slice(0, SNIPPET_MAX_LENGTH)}…` : text;
}

// bodyRichtext shapes vary by content ("{ text }" for questions, "{ blocks: [...] }" for
// lessons per prisma/seed.ts) — this is just a triage snippet, not a rich-text renderer
// (same scope decision as notes.routes.ts's extractQuestionLabel), so it degrades to an
// empty string rather than trying to fully interpret unknown shapes.
function extractSnippet(bodyRichtext: unknown): string {
  if (bodyRichtext && typeof bodyRichtext === "object") {
    const text = (bodyRichtext as { text?: unknown }).text;
    if (typeof text === "string" && text.trim().length > 0) {
      return truncate(text);
    }

    const blocks = (bodyRichtext as { blocks?: unknown }).blocks;
    if (Array.isArray(blocks)) {
      for (const block of blocks) {
        const blockText = (block as { text?: unknown } | null)?.text;
        if (typeof blockText === "string" && blockText.trim().length > 0) {
          return truncate(blockText);
        }
      }
    }
  }
  return "";
}

type QueueItem =
  | {
      contentType: "lesson";
      id: string;
      lessonId: string;
      lessonTitle: string;
      snippet: string;
      authorFullName: string | null;
      createdAt: Date;
    }
  | {
      contentType: "question";
      id: string;
      type: string;
      snippet: string;
      authorFullName: string | null;
      createdAt: Date;
    };

// GET /api/review/queue — reviewer's pending queue. Role-gated to Academic Reviewers
// (and Admins) via requireRole below (PRD Section 6).
async function getReviewQueue(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = req.query as unknown as z.infer<typeof paginationQuery>;

    // Prisma can't UNION LessonVersion and Question in one query, so both are fetched
    // in parallel, tagged with a contentType discriminator, then merged/sorted/paginated
    // in application code. Neither model has a dedicated "submittedAt" column (only
    // createdAt/reviewedAt), so createdAt is used as the recency signal.
    const [pendingLessonVersions, pendingQuestions] = await Promise.all([
      prisma.lessonVersion.findMany({
        where: { status: "pending_review" },
        orderBy: { createdAt: "desc" },
        include: {
          lesson: { select: { id: true, title: true } },
          author: { select: { fullName: true } },
        },
      }),
      prisma.question.findMany({
        where: { status: "pending_review" },
        orderBy: { createdAt: "desc" },
        include: {
          author: { select: { fullName: true } },
        },
      }),
    ]);

    const items: QueueItem[] = [
      ...pendingLessonVersions.map((version): QueueItem => ({
        contentType: "lesson",
        id: version.id,
        lessonId: version.lesson.id,
        lessonTitle: version.lesson.title,
        snippet: extractSnippet(version.bodyRichtext),
        authorFullName: version.author.fullName,
        createdAt: version.createdAt,
      })),
      ...pendingQuestions.map((question): QueueItem => ({
        contentType: "question",
        id: question.id,
        type: question.type,
        snippet: extractSnippet(question.bodyRichtext),
        authorFullName: question.author?.fullName ?? null,
        createdAt: question.createdAt,
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = items.length;
    const paged = items.slice((page - 1) * limit, (page - 1) * limit + limit);

    res.status(200).json({ items: paged, pagination: { page, limit, total } });
  } catch (err) {
    next(err);
  }
}

router.get("/queue", requireReviewerOrAdmin, validateQuery(paginationQuery), getReviewQueue);

const reviewTargetParamsSchema = z.object({
  type: z.enum(["lesson", "question"]),
  id: z.string().uuid(),
});

// Generates the newly approved question's per-option AI explanation. Never throws and
// never rejects: it runs after the approval response has already been sent, so there is no
// caller left to handle an error. Silently ignores question types that have no options.
async function generateApprovedQuestionExplanation(question: { id: string; type: string }): Promise<void> {
  if (!(EXPLAINABLE_QUESTION_TYPES as readonly string[]).includes(question.type)) {
    return;
  }
  if (!isAiConfigured()) {
    console.warn(
      `[review:approve] ANTHROPIC_API_KEY not set — skipped explanation generation for question ${question.id}`
    );
    return;
  }

  try {
    await generateAndStoreMcqExplanation(prisma, question.id);
  } catch (err) {
    console.error(`[review:approve] explanation generation failed for question ${question.id}`, err);
  }
}

// POST /api/review/:type/:id/approve — BR-2. Role-gated to Academic Reviewers (and
// Admins) via requireRole below (PRD Section 6).
async function approveContent(req: Request, res: Response, next: NextFunction) {
  try {
    const { type, id } = req.params as unknown as z.infer<typeof reviewTargetParamsSchema>;
    const userId = req.auth!.userId;

    if (type === "lesson") {
      const version = await prisma.lessonVersion.findUnique({ where: { id } });
      if (!version) {
        throw new ApiError(404, "LESSON_VERSION_NOT_FOUND", "No lesson version exists with this id.");
      }
      if (version.status !== "pending_review") {
        throw new ApiError(
          409,
          "INVALID_STATUS",
          `This lesson version cannot be approved from status '${version.status}'.`
        );
      }

      const { updatedVersion, updatedLesson } = await prisma.$transaction(async (tx) => {
        const nextVersion = await tx.lessonVersion.update({
          where: { id },
          data: { status: "approved", reviewedBy: userId, reviewedAt: new Date(), reviewComment: null },
        });
        // The lesson's "published" content is whatever its currentVersionId points at
        // (see GET /api/lessons/:id in curriculum.routes.ts) — approving a version is
        // what makes it live.
        const nextLesson = await tx.lesson.update({
          where: { id: nextVersion.lessonId },
          data: { currentVersionId: nextVersion.id },
        });
        return { updatedVersion: nextVersion, updatedLesson: nextLesson };
      });

      return res.status(200).json({ version: updatedVersion, lesson: updatedLesson });
    }

    const question = await prisma.question.findUnique({ where: { id } });
    if (!question) {
      throw new ApiError(404, "QUESTION_NOT_FOUND", "No question exists with this id.");
    }
    if (question.status !== "pending_review") {
      throw new ApiError(409, "INVALID_STATUS", `This question cannot be approved from status '${question.status}'.`);
    }

    const updatedQuestion = await prisma.question.update({
      where: { id },
      data: { status: "approved", reviewedBy: userId, reviewedAt: new Date(), reviewComment: null },
    });

    res.status(200).json({ question: updatedQuestion });

    // Approval is the right trigger for AI explanation generation: rejected questions must
    // never cost anything, and only approved questions are ever shown to students.
    // Best-effort like the badge-award and review-enqueue hooks, but deliberately fired
    // AFTER the response rather than inside the approval write — a multi-second network
    // call must not sit in a transaction or delay the reviewer. A generation lost to a
    // process restart is recovered by re-running the backfill script, which by default
    // only touches questions still missing an explanation.
    void generateApprovedQuestionExplanation(updatedQuestion);
  } catch (err) {
    next(err);
  }
}

router.post(
  "/:type/:id/approve",
  requireReviewerOrAdmin,
  validateParams(reviewTargetParamsSchema),
  approveContent
);

// POST /api/review/:type/:id/reject — reject with mandatory comment.
const rejectSchema = z.object({
  reviewComment: z.string().min(1),
});

// Role-gated to Academic Reviewers (and Admins) via requireRole below (PRD Section 6).
async function rejectContent(req: Request, res: Response, next: NextFunction) {
  try {
    const { type, id } = req.params as unknown as z.infer<typeof reviewTargetParamsSchema>;
    const { reviewComment } = req.body as z.infer<typeof rejectSchema>;
    const userId = req.auth!.userId;

    if (type === "lesson") {
      const version = await prisma.lessonVersion.findUnique({ where: { id } });
      if (!version) {
        throw new ApiError(404, "LESSON_VERSION_NOT_FOUND", "No lesson version exists with this id.");
      }
      if (version.status !== "pending_review") {
        throw new ApiError(
          409,
          "INVALID_STATUS",
          `This lesson version cannot be rejected from status '${version.status}'.`
        );
      }

      const updatedVersion = await prisma.lessonVersion.update({
        where: { id },
        data: { status: "rejected", reviewedBy: userId, reviewedAt: new Date(), reviewComment },
      });
      return res.status(200).json({ version: updatedVersion });
    }

    const question = await prisma.question.findUnique({ where: { id } });
    if (!question) {
      throw new ApiError(404, "QUESTION_NOT_FOUND", "No question exists with this id.");
    }
    if (question.status !== "pending_review") {
      throw new ApiError(409, "INVALID_STATUS", `This question cannot be rejected from status '${question.status}'.`);
    }

    const updatedQuestion = await prisma.question.update({
      where: { id },
      data: { status: "rejected", reviewedBy: userId, reviewedAt: new Date(), reviewComment },
    });
    res.status(200).json({ question: updatedQuestion });
  } catch (err) {
    next(err);
  }
}

router.post(
  "/:type/:id/reject",
  requireReviewerOrAdmin,
  validateParams(reviewTargetParamsSchema),
  validateBody(rejectSchema),
  rejectContent
);

export default router;
