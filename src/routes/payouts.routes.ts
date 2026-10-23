import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { paginationQuery, uuidParam } from "../lib/common-schemas";
import { validateBody, validateParams, validateQuery } from "../middleware/validate";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { createNotificationBestEffort } from "./notifications.routes";

// ---------------------------------------------------------------------------
// /api/payouts — creator payout queue (manual bridge to offline bank transfer;
// no earnings computation exists — see the PayoutRequest model comment).
//
// Creators: POST a request (instructor-only), GET /mine. Admins: GET the queue
// and drive pending → approved/rejected → paid. Every decision stamps
// decidedBy/decidedAt and notifies the requester (category prix, FR copy —
// backend-side FR is the repo convention for notification content).
// ---------------------------------------------------------------------------
const router = Router();
router.use(requireAuth);

const requireInstructor = requireRole("instructor");
const requireAdmin = requireRole("admin", "super_admin");

const createRequestSchema = z.object({
  amountDzd: z.number().int().min(500).max(6_000_000),
  method: z.enum(["manual"]).default("manual"),
  note: z.string().max(500).nullable().optional(),
});

const decideSchema = z.object({
  action: z.enum(["approve", "reject", "mark-paid"]),
  decisionNote: z.string().max(500).nullable().optional(),
});

// POST /api/payouts — file a payout request. One open request per author at a
// time: a second pending returns 409 so the queue stays a single-review flow.
async function createRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const body = req.body as { amountDzd: number; method: "manual"; note?: string | null };
    const open = await prisma.payoutRequest.findFirst({ where: { userId, status: "pending" }, select: { id: true } });
    if (open) {
      throw new ApiError(409, "PENDING_EXISTS", "You already have a payout request awaiting review.");
    }
    const row = await prisma.payoutRequest.create({
      data: {
        userId,
        amountDzd: body.amountDzd,
        method: body.method,
        note: body.note ?? null,
      },
    });
    res.status(201).json({ request: row });
  } catch (err) {
    next(err);
  }
}

// GET /api/payouts/mine — the author's own requests, newest first.
async function listMine(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = req.query as unknown as { page?: number; limit?: number };
    const userId = req.auth!.userId;
    const [rows, total] = await Promise.all([
      prisma.payoutRequest.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip: ((page ?? 1) - 1) * (limit ?? 20),
        take: limit ?? 20,
      }),
      prisma.payoutRequest.count({ where: { userId } }),
    ]);
    res.json({ requests: rows, pagination: { page: page ?? 1, limit: limit ?? 20, total } });
  } catch (err) {
    next(err);
  }
}

// GET /api/payouts/admin — the queue. ?status= pending|approved|rejected|paid.
const adminListQuery = paginationQuery.extend({
  status: z.enum(["pending", "approved", "rejected", "paid"]).optional(),
});

async function listAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, status } = req.query as unknown as {
      page: number;
      limit: number;
      status?: "pending" | "approved" | "rejected" | "paid";
    };
    const where = {
      ...(status ? { status } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.payoutRequest.findMany({
        where,
        orderBy: { createdAt: "asc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, fullName: true, university: true } },
          decidedByUser: { select: { fullName: true } },
        },
      }),
      prisma.payoutRequest.count({ where }),
    ]);
    res.json({
      requests: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        requestedBy: r.user.fullName,
        university: r.user.university,
        amountDzd: r.amountDzd,
        method: r.method,
        status: r.status,
        note: r.note,
        decidedBy: r.decidedByUser?.fullName ?? null,
        decidedAt: r.decidedAt,
        decisionNote: r.decisionNote,
        createdAt: r.createdAt,
      })),
      pagination: { page, limit, total },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/payouts/admin/:id/decide — queue state machine:
//   pending → approved | rejected;  approved → paid. Anything else → 409.
async function decide(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.auth!.userId;
    const { id } = req.params as unknown as { id: string };
    const body = req.body as { action: "approve" | "reject" | "mark-paid"; decisionNote?: string | null };
    const row = await prisma.payoutRequest.findUnique({ where: { id }, select: { id: true, userId: true, status: true } });
    if (!row) throw new ApiError(404, "PAYOUT_NOT_FOUND", "No payout request exists with this id.");

    const transitions: Record<string, ("approved" | "rejected" | "paid")[]> = {
      pending: ["approved", "rejected"],
      approved: ["paid"],
      rejected: [],
      paid: [],
    };
    const allowed = transitions[row.status] ?? [];
    const target: "approved" | "rejected" | "paid" =
      body.action === "approve"
        ? "approved"
        : body.action === "reject"
          ? "rejected"
          : "paid";
    if (!allowed.includes(target)) {
      throw new ApiError(409, "INVALID_TRANSITION", `A ${row.status} request cannot move to ${target}.`);
    }

    const updated = await prisma.payoutRequest.update({
      where: { id: row.id },
      data: { status: target, decidedBy: adminId, decidedAt: new Date(), decisionNote: body.decisionNote ?? null },
    });
    void createNotificationBestEffort({
      userId: row.userId,
      category: "prix",
      title:
        target === "approved"
          ? "Demande de paiement approuvée"
          : target === "rejected"
            ? "Demande de paiement refusée"
            : "Paiement effectué",
      body:
        target === "approved"
          ? "Votre demande de paiement a été approuvée. Le virement sera effectué par l'équipe."
          : target === "rejected"
            ? "Votre demande de paiement a été refusée. Contactez l'équipe pour plus de détails."
            : "Votre paiement a été effectué. Merci pour vos contributions !",
    });
    res.json({ request: { id: updated.id, status: updated.status, decidedAt: updated.decidedAt, decisionNote: updated.decisionNote } });
  } catch (err) {
    next(err);
  }
}

router.post("/", requireInstructor, validateBody(createRequestSchema), createRequest);
router.get("/mine", requireInstructor, validateQuery(paginationQuery), listMine);
router.get("/admin", requireAdmin, validateQuery(adminListQuery), listAdmin);
router.post("/admin/:id/decide", requireAdmin, validateParams(uuidParam("id")), validateBody(decideSchema), decide);

export default router;
