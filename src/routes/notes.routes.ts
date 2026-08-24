import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { validateBody, validateQuery } from "../middleware/validate";
import { paginationQuery } from "../lib/common-schemas";
import { requireAuth } from "../middleware/auth";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";

// docs/hamame_api_contract.md — "Question Bank & Sessions" section (personal notes, FR-20).
const router = Router();

router.use(requireAuth);

const NOTE_LABEL_MAX_LENGTH = 80;

// Questions have no title field — bodyRichtext is JSON (usually { text: "..." } per the
// seed data). This derives a short, readable label without building a rich-text renderer
// here (that's a frontend concern, out of scope for this endpoint).
function extractQuestionLabel(bodyRichtext: unknown): string {
  if (bodyRichtext && typeof bodyRichtext === "object") {
    const text = (bodyRichtext as { text?: unknown }).text;
    if (typeof text === "string" && text.trim().length > 0) {
      return text.length > NOTE_LABEL_MAX_LENGTH ? `${text.slice(0, NOTE_LABEL_MAX_LENGTH)}…` : text;
    }
  }
  return "Question";
}

// GET /api/notes — list the current user's notes, most recent first.
async function listNotes(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { page, limit } = req.query as unknown as z.infer<typeof paginationQuery>;

    const [total, notes] = await Promise.all([
      prisma.note.count({ where: { userId } }),
      prisma.note.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          question: { select: { id: true, bodyRichtext: true } },
          lesson: { select: { id: true, title: true } },
        },
      }),
    ]);

    res.status(200).json({
      notes: notes.map((note) => ({
        id: note.id,
        bodyText: note.bodyText,
        createdAt: note.createdAt,
        question: note.question
          ? { id: note.question.id, label: extractQuestionLabel(note.question.bodyRichtext) }
          : null,
        lesson: note.lesson ? { id: note.lesson.id, title: note.lesson.title } : null,
      })),
      pagination: { page, limit, total },
    });
  } catch (err) {
    next(err);
  }
}

router.get("/", validateQuery(paginationQuery), listNotes);

// POST /api/notes — create note tied to question/lesson.
const createNoteSchema = z
  .object({
    questionId: z.string().uuid().optional(),
    lessonId: z.string().uuid().optional(),
    bodyText: z.string().min(1),
  })
  .superRefine((data, ctx) => {
    if (!data.questionId && !data.lessonId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either questionId or lessonId is required.",
        path: ["questionId"],
      });
    }
  });

async function createNote(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { questionId, lessonId, bodyText } = req.body as z.infer<typeof createNoteSchema>;

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

    const note = await prisma.note.create({
      data: { userId, questionId, lessonId, bodyText },
    });

    res.status(201).json({ note });
  } catch (err) {
    next(err);
  }
}

router.post("/", validateBody(createNoteSchema), createNote);

export default router;
