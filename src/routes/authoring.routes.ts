import { NextFunction, Request, Response, Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { validateBody, validateParams } from "../middleware/validate";
import { jsonObject } from "../lib/common-schemas";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";

// docs/hamame_api_contract.md — "Content Authoring & Validation (Instructor/Reviewer)".
// Role enforcement (Instructor vs Academic Reviewer, PRD Section 6) is applied per-route
// below via requireRole, on top of requireAuth's identity check. GET /me/stats is the
// one exception — deliberately left to requireAuth only, since a user should see their
// own contributor stats regardless of role.
const router = Router();

router.use(requireAuth);

const requireInstructorOrReviewer = requireRole("instructor", "academic_reviewer");

// Content lifecycle shared by Question.status and LessonVersion.status (BR-2 mandatory
// validation gate): 'draft' -> 'pending_review' -> 'approved' | 'rejected'. 'rejected'
// content is edited back to 'draft' via PUT /:type/:id below, then resubmitted through
// the submit route ('draft' and 'rejected' are both submittable), closing the edit-and-
// resubmit loop that was designed into the lifecycle.
const SUBMITTABLE_STATUSES = ["draft", "rejected"] as const;
const STATUS_VALUES = ["draft", "pending_review", "approved", "rejected"] as const;

function zeroedStatusCounts(): Record<(typeof STATUS_VALUES)[number], number> {
  return { draft: 0, pending_review: 0, approved: 0, rejected: 0 };
}

// POST /api/authoring/lessons — draft a lesson version, FR-48. Mirrors
// lessons/lesson_versions in prisma/schema.prisma.
const draftLessonSchema = z.object({
  unitId: z.string().uuid(),
  title: z.string().min(1),
  contentTier: z.enum(["official", "hamame_plus"]),
  bodyRichtext: jsonObject,
  // FR-10a: omit (or send null) for global content visible to every faculty-matched
  // student, or name a university to scope it to that university only.
  universityId: z.string().uuid().nullable().optional(),
});

// Content visibility depends on this id resolving to a real university, so an unknown one
// must be rejected rather than stored — scoped-to-nothing content would be invisible to
// everyone with no obvious cause.
async function assertUniversityExists(universityId: string | null | undefined): Promise<void> {
  if (!universityId) {
    return;
  }
  const university = await prisma.university.findUnique({ where: { id: universityId }, select: { id: true } });
  if (!university) {
    throw new ApiError(404, "UNIVERSITY_NOT_FOUND", "No university exists with this id.");
  }
}

async function createLessonDraft(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { unitId, title, contentTier, bodyRichtext, universityId } = req.body as z.infer<typeof draftLessonSchema>;

    const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { id: true } });
    if (!unit) {
      throw new ApiError(404, "UNIT_NOT_FOUND", "No unit exists with this id.");
    }
    await assertUniversityExists(universityId);

    const { lesson, version } = await prisma.$transaction(async (tx) => {
      const createdLesson = await tx.lesson.create({
        data: { unitId, title, contentTier, universityId: universityId ?? null },
      });
      const createdVersion = await tx.lessonVersion.create({
        data: {
          lessonId: createdLesson.id,
          versionNumber: 1,
          status: "draft",
          authoredBy: userId,
          bodyRichtext: bodyRichtext as Prisma.InputJsonValue,
        },
      });
      return { lesson: createdLesson, version: createdVersion };
    });

    res.status(201).json({ lesson, version });
  } catch (err) {
    next(err);
  }
}

router.post("/lessons", requireInstructorOrReviewer, validateBody(draftLessonSchema), createLessonDraft);

// POST /api/authoring/questions — draft a question, FR-48. Mirrors questions/
// question_options/clinical_case_parts in prisma/schema.prisma.
const draftQuestionSchema = z.object({
  unitId: z.string().uuid(),
  type: z.enum(["QCM", "QCS", "QROC", "CLINICAL_CASE"]),
  source: z.enum(["official_exam", "hamame_authored", "ai_generated"]),
  difficulty: z.string().optional(),
  bodyRichtext: jsonObject,
  explanationRichtext: jsonObject,
  options: z
    .array(
      z.object({
        bodyText: z.string().min(1),
        isCorrect: z.boolean(),
        orderIndex: z.number().int().min(0),
      })
    )
    .optional(),
  clinicalCaseParts: z
    .array(
      z.object({
        partOrder: z.number().int().min(0),
        promptText: z.string().min(1),
        expectedAnswerText: z.string().optional(),
      })
    )
    .optional(),
  // FR-10a — see draftLessonSchema above. Annales are the canonical per-university
  // artifact, so this matters most here.
  universityId: z.string().uuid().nullable().optional(),
});

async function createQuestionDraft(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const {
      unitId,
      type,
      source,
      difficulty,
      bodyRichtext,
      explanationRichtext,
      options,
      clinicalCaseParts,
      universityId,
    } = req.body as z.infer<typeof draftQuestionSchema>;

    const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { id: true } });
    if (!unit) {
      throw new ApiError(404, "UNIT_NOT_FOUND", "No unit exists with this id.");
    }
    await assertUniversityExists(universityId);

    const question = await prisma.question.create({
      data: {
        unitId,
        type,
        source,
        status: "draft",
        difficulty,
        universityId: universityId ?? null,
        bodyRichtext: bodyRichtext as Prisma.InputJsonValue,
        explanationRichtext: explanationRichtext as Prisma.InputJsonValue,
        authoredBy: userId,
        options: options && options.length > 0 ? { create: options } : undefined,
        clinicalCaseParts:
          clinicalCaseParts && clinicalCaseParts.length > 0 ? { create: clinicalCaseParts } : undefined,
      },
      include: {
        options: { orderBy: { orderIndex: "asc" } },
        clinicalCaseParts: { orderBy: { partOrder: "asc" } },
      },
    });

    res.status(201).json({ question });
  } catch (err) {
    next(err);
  }
}

router.post("/questions", requireInstructorOrReviewer, validateBody(draftQuestionSchema), createQuestionDraft);

// POST /api/authoring/:type/:id/submit — submit for review, FR-49. `:id` is a
// LessonVersion id for type 'lesson' (Lesson itself carries no status) and a Question
// id for type 'question'.
const submitParamsSchema = z.object({
  type: z.enum(["lesson", "question"]),
  id: z.string().uuid(),
});

async function submitForReview(req: Request, res: Response, next: NextFunction) {
  try {
    const { type, id } = req.params as unknown as z.infer<typeof submitParamsSchema>;
    const userId = req.auth!.userId;

    // Role enforcement (Instructor/Academic Reviewer) is handled by requireRole on this
    // route below — this ownership check is a separate, additional guard (a user can
    // only submit their own draft, even if they hold one of the allowed roles).
    if (type === "lesson") {
      const version = await prisma.lessonVersion.findUnique({ where: { id } });
      if (!version) {
        throw new ApiError(404, "LESSON_VERSION_NOT_FOUND", "No lesson version exists with this id.");
      }
      if (version.authoredBy !== userId) {
        throw new ApiError(403, "FORBIDDEN", "This lesson version does not belong to you.");
      }
      if (!(SUBMITTABLE_STATUSES as readonly string[]).includes(version.status)) {
        throw new ApiError(
          409,
          "INVALID_STATUS",
          `This lesson version cannot be submitted from status '${version.status}'.`
        );
      }

      const updated = await prisma.lessonVersion.update({ where: { id }, data: { status: "pending_review" } });
      return res.status(200).json({ version: updated });
    }

    const question = await prisma.question.findUnique({ where: { id } });
    if (!question) {
      throw new ApiError(404, "QUESTION_NOT_FOUND", "No question exists with this id.");
    }
    if (question.authoredBy !== userId) {
      throw new ApiError(403, "FORBIDDEN", "This question does not belong to you.");
    }
    if (!(SUBMITTABLE_STATUSES as readonly string[]).includes(question.status)) {
      throw new ApiError(409, "INVALID_STATUS", `This question cannot be submitted from status '${question.status}'.`);
    }

    const updated = await prisma.question.update({ where: { id }, data: { status: "pending_review" } });
    res.status(200).json({ question: updated });
  } catch (err) {
    next(err);
  }
}

router.post(
  "/:type/:id/submit",
  requireInstructorOrReviewer,
  validateParams(submitParamsSchema),
  submitForReview
);

// PUT /api/authoring/:type/:id — edit own draft/rejected content. Closes the lifecycle
// gap flagged in the handoff: 'rejected' content was designed to be fixed and
// resubmitted, but no edit path existed. Editing updates the content fields (same set as
// the corresponding create-draft endpoint), resets status to 'draft' (whether it was
// already 'draft' or coming from 'rejected'), and clears the stale reviewComment. The
// already-existing submit route above (unchanged) is what the author calls next to
// re-enter review.
const EDITABLE_STATUSES = SUBMITTABLE_STATUSES; // identical set ('draft' | 'rejected')

async function editContent(req: Request, res: Response, next: NextFunction) {
  try {
    const { type, id } = req.params as unknown as z.infer<typeof submitParamsSchema>;
    const userId = req.auth!.userId;

    // The body schema depends on :type, so the middleware validateBody form can't be
    // used on this combined route — branch here and reproduce validate.ts's exact
    // VALIDATION_ERROR shape (400, path: message list) for parity.
    const bodySchema = type === "lesson" ? draftLessonSchema : draftQuestionSchema;
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ")
      );
    }

    // Same ownership + status guards as the submit route above: only the original author
    // may edit, and only while the content is still 'draft' or 'rejected'.
    if (type === "lesson") {
      const version = await prisma.lessonVersion.findUnique({ where: { id } });
      if (!version) {
        throw new ApiError(404, "LESSON_VERSION_NOT_FOUND", "No lesson version exists with this id.");
      }
      if (version.authoredBy !== userId) {
        throw new ApiError(403, "FORBIDDEN", "This lesson version does not belong to you.");
      }
      if (!(EDITABLE_STATUSES as readonly string[]).includes(version.status)) {
        throw new ApiError(
          400,
          "INVALID_STATUS_FOR_EDIT",
          `This lesson version cannot be edited from status '${version.status}'.`
        );
      }

      const { unitId, title, contentTier, bodyRichtext, universityId } = parsed.data as z.infer<
        typeof draftLessonSchema
      >;
      await assertUniversityExists(universityId);

      const { lesson, version: updatedVersion } = await prisma.$transaction(async (tx) => {
        const updatedLesson = await tx.lesson.update({
          where: { id: version.lessonId },
          data: { unitId, title, contentTier, universityId: universityId ?? null },
        });
        const updatedLessonVersion = await tx.lessonVersion.update({
          where: { id },
          data: { bodyRichtext: bodyRichtext as Prisma.InputJsonValue, status: "draft", reviewComment: null },
        });
        return { lesson: updatedLesson, version: updatedLessonVersion };
      });

      return res.status(200).json({ lesson, version: updatedVersion });
    }

    const question = await prisma.question.findUnique({ where: { id } });
    if (!question) {
      throw new ApiError(404, "QUESTION_NOT_FOUND", "No question exists with this id.");
    }
    if (question.authoredBy !== userId) {
      throw new ApiError(403, "FORBIDDEN", "This question does not belong to you.");
    }
    if (!(EDITABLE_STATUSES as readonly string[]).includes(question.status)) {
      throw new ApiError(
        400,
        "INVALID_STATUS_FOR_EDIT",
        `This question cannot be edited from status '${question.status}'.`
      );
    }

    const {
      unitId,
      type: questionType,
      source,
      difficulty,
      bodyRichtext,
      explanationRichtext,
      options,
      clinicalCaseParts,
      universityId,
    } = parsed.data as z.infer<typeof draftQuestionSchema>;

    await assertUniversityExists(universityId);

    // Nested options/clinicalCaseParts are replaced wholesale to match the submitted
    // body (delete-then-create is safe here: only 'draft'/'rejected' content can reach
    // this point, so no student session can reference these rows).
    const updatedQuestion = await prisma.question.update({
      where: { id },
      data: {
        unitId,
        type: questionType,
        source,
        status: "draft",
        reviewComment: null,
        difficulty,
        universityId: universityId ?? null,
        bodyRichtext: bodyRichtext as Prisma.InputJsonValue,
        explanationRichtext: explanationRichtext as Prisma.InputJsonValue,
        options: options && options.length > 0 ? { deleteMany: {}, create: options } : { deleteMany: {} },
        clinicalCaseParts:
          clinicalCaseParts && clinicalCaseParts.length > 0
            ? { deleteMany: {}, create: clinicalCaseParts }
            : { deleteMany: {} },
      },
      include: {
        options: { orderBy: { orderIndex: "asc" } },
        clinicalCaseParts: { orderBy: { partOrder: "asc" } },
      },
    });

    res.status(200).json({ question: updatedQuestion });
  } catch (err) {
    next(err);
  }
}

router.put("/:type/:id", requireInstructorOrReviewer, validateParams(submitParamsSchema), editContent);

// GET /api/authoring/me/stats — contributor's aggregate stats, FR-51.
async function getContributorStats(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;

    const [lessonGroups, questionGroups] = await Promise.all([
      prisma.lessonVersion.groupBy({ by: ["status"], where: { authoredBy: userId }, _count: true }),
      prisma.question.groupBy({ by: ["status"], where: { authoredBy: userId }, _count: true }),
    ]);

    const lessons = zeroedStatusCounts();
    for (const group of lessonGroups) {
      if (group.status in lessons) {
        lessons[group.status as (typeof STATUS_VALUES)[number]] = group._count;
      }
    }

    const questions = zeroedStatusCounts();
    for (const group of questionGroups) {
      if (group.status in questions) {
        questions[group.status as (typeof STATUS_VALUES)[number]] = group._count;
      }
    }

    res.status(200).json({ lessons, questions });
  } catch (err) {
    next(err);
  }
}

router.get("/me/stats", getContributorStats);

export default router;
