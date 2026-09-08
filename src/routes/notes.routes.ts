import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { validateBody, validateParams, validateQuery } from "../middleware/validate";
import { paginationQuery, uuidParam } from "../lib/common-schemas";
import { requireAuth } from "../middleware/auth";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";

// docs/hamame_api_contract.md — "Question Bank & Sessions" section (personal notes, FR-20).
const router = Router();

router.use(requireAuth);

const NOTE_LABEL_MAX_LENGTH = 80;

// Phase 3 notes library: the fixed 6-tag taxonomy (MedSparkDZ-confirmed, gap
// analysis §11). Stored as slugs; the frontend maps them to emoji + French
// labels. Unknown tags are rejected, never silently stored.
const NOTE_TAGS = ["difficile", "facile", "important", "a_reviser", "compris", "piege"] as const;
type NoteTag = (typeof NOTE_TAGS)[number];

const noteTagsSchema = z.array(z.enum(NOTE_TAGS)).max(6);

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
// Filters: q (case-insensitive substring on bodyText), tag (single taxonomy
// tag — note must carry it), favoritesOnly ("true" → isFavorite only).
const listNotesQuerySchema = paginationQuery.extend({
  q: z.string().trim().min(1).max(200).optional(),
  tag: z.enum(NOTE_TAGS).optional(),
  favoritesOnly: z.enum(["true", "false"]).optional(),
});

async function listNotes(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { page, limit, q, tag, favoritesOnly } = req.query as unknown as z.infer<
      typeof listNotesQuerySchema
    >;

    const where: { userId: string; bodyText?: object; tags?: object; isFavorite?: boolean } = {
      userId,
    };
    if (q) where.bodyText = { contains: q, mode: "insensitive" };
    if (tag) where.tags = { has: tag };
    if (favoritesOnly === "true") where.isFavorite = true;

    const [total, notes] = await Promise.all([
      prisma.note.count({ where }),
      prisma.note.findMany({
        where,
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
        tags: note.tags,
        isFavorite: note.isFavorite,
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

router.get("/", validateQuery(listNotesQuerySchema), listNotes);

// POST /api/notes — create note tied to question/lesson.
const createNoteSchema = z
  .object({
    questionId: z.string().uuid().optional(),
    lessonId: z.string().uuid().optional(),
    bodyText: z.string().min(1),
    tags: noteTagsSchema.optional(),
    isFavorite: z.boolean().optional(),
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
    const { questionId, lessonId, bodyText, tags, isFavorite } = req.body as z.infer<
      typeof createNoteSchema
    >;

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
      data: {
        userId,
        questionId,
        lessonId,
        bodyText,
        ...(tags ? { tags: [...new Set(tags)] } : {}),
        ...(isFavorite !== undefined ? { isFavorite } : {}),
      },
    });

    res.status(201).json({ note });
  } catch (err) {
    next(err);
  }
}

router.post("/", validateBody(createNoteSchema), createNote);

// PATCH /api/notes/:id — retag / favorite / edit own note. At least one field.
const updateNoteSchema = z
  .object({
    bodyText: z.string().min(1).optional(),
    tags: noteTagsSchema.optional(),
    isFavorite: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.bodyText === undefined && data.tags === undefined && data.isFavorite === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Nothing to update." });
    }
  });

async function updateNote(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params;
    const { bodyText, tags, isFavorite } = req.body as z.infer<typeof updateNoteSchema>;

    const existing = await prisma.note.findFirst({ where: { id, userId }, select: { id: true } });
    if (!existing) {
      throw new ApiError(404, "NOTE_NOT_FOUND", "No note exists with this id.");
    }

    const note = await prisma.note.update({
      where: { id },
      data: {
        ...(bodyText !== undefined ? { bodyText } : {}),
        ...(tags !== undefined ? { tags: [...new Set(tags)] } : {}),
        ...(isFavorite !== undefined ? { isFavorite } : {}),
      },
    });

    res.status(200).json({ note });
  } catch (err) {
    next(err);
  }
}

router.patch("/:id", validateParams(uuidParam("id")), validateBody(updateNoteSchema), updateNote);

export default router;
