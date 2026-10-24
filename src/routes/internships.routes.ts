import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { paginationQuery } from "../lib/common-schemas";
import { validateBody, validateQuery } from "../middleware/validate";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../lib/prisma";

// ---------------------------------------------------------------------------
// /api/internships — internship-placement reviews (medspark.online stage/ECOS
// parity). Moderated: submissions start 'pending_review' and are approved /
// rejected through the SAME review-queue machinery as lessons/questions
// (/api/review/internship_review/:id/approve|reject — the contentType is
// unioned into review.routes.ts). Only approved rows are publicly listed;
// /mine shows the author their own rows in every status, like the authoring
// stats surface does.
// hasRole-free: every signed-in student may submit and read.
// ---------------------------------------------------------------------------
const router = Router();
router.use(requireAuth);

const submitSchema = z.object({
  category: z.enum(["stage", "garde", "ecos"]),
  wilaya: z.string().trim().min(1).max(60),
  hospitalName: z.string().trim().min(2).max(120),
  serviceName: z.string().trim().max(120).nullable().optional(),
  rating: z.number().int().min(1).max(5),
  content: z.string().trim().min(50).max(1500),
});

const listQuerySchema = paginationQuery.extend({
  wilaya: z.string().trim().min(1).max(60).optional(),
  category: z.enum(["stage", "garde", "ecos"]).optional(),
});

// POST /api/internships/reviews — submit a review for moderation.
// NOTE: multiple pending submissions are allowed (a student may legitimately
// review several placements before any is processed); it is double-submitting
// the IDENTICAL review that is nonsense, so a same-day duplicate check on
// (userId, hospitalName, serviceName, category) keeps the queue clean.
async function submitReview(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const body = req.body as z.infer<typeof submitSchema>;
    const duplicate = await prisma.internshipReview.findFirst({
      where: {
        userId,
        hospitalName: body.hospitalName,
        serviceName: body.serviceName ?? null,
        category: body.category,
        status: "pending_review",
      },
      select: { id: true },
    });
    if (duplicate) {
      res.status(409).json({
        error: {
          code: "REVIEW_PENDING_FOR_THIS_PLACEMENT",
          message: "A review of this placement is already awaiting moderation.",
        },
      });
      return;
    }
    const row = await prisma.internshipReview.create({
      data: {
        userId,
        category: body.category,
        wilaya: body.wilaya,
        hospitalName: body.hospitalName,
        serviceName: body.serviceName ?? null,
        rating: body.rating,
        content: body.content,
        // status stays the DB default ('pending_review') — but the submission
        // timestamp is stamped explicitly so the review queue can sort by it.
        submittedAt: new Date(),
      },
    });
    res.status(201).json({ review: { id: row.id, status: row.status } });
  } catch (err) {
    next(err);
  }
}

// GET /api/internships/reviews — approved reviews only, is-wide (identities of
// reviewers stay with the model: reviewer names are NEVER exposed, following
// the same privacy line the leaderboard uses for raw accounts on hidden rows).
async function listApproved(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, wilaya, category } = req.query as unknown as {
      page: number;
      limit: number;
      wilaya?: string;
      category?: "stage" | "garde" | "ecos";
    };
    const where = {
      status: "approved",
      ...(wilaya ? { wilaya } : {}),
      ...(category ? { category } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.internshipReview.findMany({
        where,
        orderBy: { reviewedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          category: true,
          wilaya: true,
          hospitalName: true,
          serviceName: true,
          rating: true,
          content: true,
          reviewedAt: true,
        },
      }),
      prisma.internshipReview.count({ where }),
    ]);
    res.json({
      reviews: rows,
      pagination: { page, limit, total },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/internships/mine — the author's own rows, all statuses.
async function mine(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = req.query as unknown as { page: number; limit: number };
    const userId = req.auth!.userId;
    const [rows, total] = await Promise.all([
      prisma.internshipReview.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.internshipReview.count({ where: { userId } }),
    ]);
    res.json({
      reviews: rows.map((row) => ({
        id: row.id,
        category: row.category,
        wilaya: row.wilaya,
        hospitalName: row.hospitalName,
        serviceName: row.serviceName,
        rating: row.rating,
        content: row.content,
        status: row.status,
        reviewComment: row.reviewComment,
        createdAt: row.createdAt,
      })),
      pagination: { page, limit, total },
    });
  } catch (err) {
    next(err);
  }
}

router.post("/reviews", validateBody(submitSchema), submitReview);
router.get("/reviews", validateQuery(listQuerySchema), listApproved);
router.get("/mine", validateQuery(paginationQuery), mine);

export default router;
