import { randomBytes } from "crypto";
import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { paginationQuery } from "../lib/common-schemas";
import { validateBody, validateQuery } from "../middleware/validate";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { createNotificationBestEffort } from "./notifications.routes";

// FR-65/BR-18 — activation codes: the MVP's manual-payment bridge. A Support
// Agent/Admin confirms payment off-platform, issues a single-use code scoped to
// exactly one faculty-year, and the student redeems it in-app.
//
// Premium access is granted through the SAME mechanism every other manual path
// uses (an active premium Subscription — what /api/subscriptions/me and the AI
// credit bootstrap read), never a parallel gating system. The faculty-year scope
// lives on the activation_codes row as the audit record (BR-18/NFR-10) alongside
// the Payment row created at redemption.
//
// Grant duration: the PRD fixes no per-code duration, so redemption grants a
// fixed 30-day premium period (one monthly billing period — the premium plan's
// billingPeriod). Change ACTIVATION_GRANT_DAYS here if pricing later needs it.

// Sequential awaits throughout — Supabase session pooler concurrency limit
// (see HAMAME_MASTER_HANDOFF.md Section 1).

const ACTIVATION_GRANT_DAYS = 30;

const router = Router();
router.use(requireAuth);

// Codes are stored uppercase (hex is case-insensitive anyway); redeeming with any
// casing works via the same normalization the admin issue path applies.
function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function serializeDecimal(value: { toNumber: () => number } | null): number | null {
  return value === null ? null : value.toNumber();
}

// ---------------------------------------------------------------------------
// Student-facing redemption
// ---------------------------------------------------------------------------

const redeemSchema = z.object({ code: z.string().min(1) });

// POST /api/activation-codes/redeem — validate, claim, grant.
//
// Validation order (one specific error per case):
//   1. code exists                → 404 ACTIVATION_CODE_NOT_FOUND
//   2. status 'redeemed'          → 409 ACTIVATION_CODE_ALREADY_REDEEMED
//   3. expiresAt in the past      → 409 ACTIVATION_CODE_EXPIRED
//   4. status 'revoked'           → 409 ACTIVATION_CODE_REVOKED
//   5. no active premium plan     → 500 ACTIVATION_PLAN_MISSING (server misconfig)
//
// The claim is a conditional updateMany (`WHERE id = ... AND status = 'active'`)
// inside the grant transaction — two concurrent redemptions of the same code can
// only ever flip one row, and the loser's whole transaction (subscription +
// payment included) rolls back instead of double-granting. Same
// atomic-conditional-claim discipline as the AI-credit reserve (BR-6).
async function redeemActivationCode(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { code } = req.body as z.infer<typeof redeemSchema>;

    const activationCode = await prisma.activationCode.findUnique({
      where: { code: normalizeCode(code) },
      include: { faculty: { select: { name: true } }, year: { select: { label: true } } },
    });
    if (!activationCode) {
      throw new ApiError(404, "ACTIVATION_CODE_NOT_FOUND", "No activation code exists with this code.");
    }
    if (activationCode.status === "redeemed") {
      throw new ApiError(409, "ACTIVATION_CODE_ALREADY_REDEEMED", "This code has already been redeemed.");
    }
    const now = new Date();
    if (activationCode.expiresAt && activationCode.expiresAt < now) {
      throw new ApiError(409, "ACTIVATION_CODE_EXPIRED", "This code has expired.");
    }
    if (activationCode.status === "revoked") {
      throw new ApiError(409, "ACTIVATION_CODE_REVOKED", "This code has been revoked.");
    }

    const premiumPlan = await prisma.plan.findFirst({ where: { name: "premium", isActive: true } });
    if (!premiumPlan) {
      throw new ApiError(500, "ACTIVATION_PLAN_MISSING", "No active premium plan is configured.");
    }

    const { subscription, payment } = await prisma.$transaction(async (tx) => {
      // Atomic claim — must be the first write so a lost race aborts everything below.
      const claimed = await tx.activationCode.updateMany({
        where: { id: activationCode.id, status: "active" },
        data: { status: "redeemed", redeemedBy: userId, redeemedAt: now },
      });
      if (claimed.count !== 1) {
        throw new ApiError(409, "ACTIVATION_CODE_ALREADY_REDEEMED", "This code has already been redeemed.");
      }

      const activeSubscription = await tx.subscription.findFirst({
        where: { userId, status: "active" },
      });

      // Extend from max(currentPeriodEnd, now) — same stacking rule as promo-code
      // redemption: a healthy future expiry extends from itself; a stale
      // still-'active' row still gets a full period instead of a negative one.
      let subscriptionResult;
      if (activeSubscription) {
        const base = activeSubscription.currentPeriodEnd > now ? activeSubscription.currentPeriodEnd : now;
        subscriptionResult = await tx.subscription.update({
          where: { id: activeSubscription.id },
          data: { currentPeriodEnd: addDays(base, ACTIVATION_GRANT_DAYS) },
          include: { plan: true },
        });
      } else {
        subscriptionResult = await tx.subscription.create({
          data: {
            userId,
            planId: premiumPlan.id,
            status: "active",
            startedAt: now,
            currentPeriodEnd: addDays(now, ACTIVATION_GRANT_DAYS),
            autoRenew: true,
          },
          include: { plan: true },
        });
      }

      // BR-18/NFR-10: the redemption is logged alongside the payment record it
      // corresponds to. The money moved off-platform, so the in-system record is a
      // zero-amount succeeded manual_assisted payment on the granted subscription.
      const createdPayment = await tx.payment.create({
        data: {
          subscriptionId: subscriptionResult.id,
          amountDzd: 0,
          method: "manual_assisted",
          status: "succeeded",
        },
      });

      await tx.activationCode.update({
        where: { id: activationCode.id },
        data: { paymentId: createdPayment.id },
      });

      return { subscription: subscriptionResult, payment: createdPayment };
    });

    // Billing notification for the redeemer (best-effort, never fails redemption).
    await createNotificationBestEffort({
      userId,
      category: "prix",
      title: "Premium activé",
      body: `Votre accès Premium est actif (${activationCode.faculty.name} — ${activationCode.year.label}).`,
    });

    res.status(200).json({
      message: "Activation code redeemed successfully. Premium access has been granted.",
      unlocked: { faculty: activationCode.faculty.name, year: activationCode.year.label },
      grantedDays: ACTIVATION_GRANT_DAYS,
      subscription: {
        ...subscription,
        plan: { ...subscription.plan, priceDzd: serializeDecimal(subscription.plan.priceDzd) },
      },
      payment: { id: payment.id, amountDzd: serializeDecimal(payment.amountDzd), method: payment.method },
    });
  } catch (err) {
    next(err);
  }
}

router.post("/redeem", validateBody(redeemSchema), redeemActivationCode);

// ---------------------------------------------------------------------------
// Support Agent / Admin — issue + list (mounted at /api/admin/activation-codes;
// see routes/index.ts for why this is its own router rather than part of
// admin.routes.ts, whose router-level gate is admin-only)
// ---------------------------------------------------------------------------

const adminActivationCodesRouter = Router();
adminActivationCodesRouter.use(requireAuth);
const requireSupportAgentOrAdmin = requireRole("support_agent", "admin");

const ISSUE_CODE_SCHEMA = z.object({
  facultyId: z.string().uuid(),
  yearId: z.string().uuid(),
  expiresAt: z.string().datetime().optional(),
});

// POST /api/admin/activation-codes — issue one code after manual payment
// confirmation. The code is opaque (crypto.randomBytes hex), stored uppercase,
// and can never be guessed/enumerated from issued ones.
async function issueActivationCode(req: Request, res: Response, next: NextFunction) {
  try {
    const issuerId = req.auth!.userId;
    const { facultyId, yearId, expiresAt } = req.body as z.infer<typeof ISSUE_CODE_SCHEMA>;

    const year = await prisma.year.findUnique({ where: { id: yearId }, select: { id: true, facultyId: true } });
    if (!year) {
      throw new ApiError(404, "YEAR_NOT_FOUND", "No year exists with this id.");
    }
    if (year.facultyId !== facultyId) {
      throw new ApiError(400, "YEAR_FACULTY_MISMATCH", "This year does not belong to the selected faculty.");
    }

    const code = `AC-${randomBytes(10).toString("hex").toUpperCase()}`;

    const activationCode = await prisma.activationCode.create({
      data: {
        code,
        facultyId,
        yearId,
        issuedBy: issuerId,
        status: "active",
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
      include: { faculty: { select: { name: true } }, year: { select: { label: true } } },
    });

    res.status(201).json({
      activationCode: {
        id: activationCode.id,
        code: activationCode.code,
        status: activationCode.status,
        expiresAt: activationCode.expiresAt,
        faculty: activationCode.faculty.name,
        year: activationCode.year.label,
      },
    });
  } catch (err) {
    next(err);
  }
}

adminActivationCodesRouter.post(
  "/",
  requireSupportAgentOrAdmin,
  validateBody(ISSUE_CODE_SCHEMA),
  issueActivationCode
);

// GET /api/admin/activation-codes?status=&facultyId=&page=&limit= — issued codes
// with redemption/audit info (NFR-10).
const LIST_QUERY_SCHEMA = paginationQuery.extend({
  status: z.enum(["active", "redeemed", "expired", "revoked"]).optional(),
  facultyId: z.string().uuid().optional(),
});

async function listActivationCodes(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, status, facultyId } = req.query as unknown as z.infer<typeof LIST_QUERY_SCHEMA>;

    const where = {
      ...(status ? { status } : {}),
      ...(facultyId ? { facultyId } : {}),
    };

    // Sequential, not Promise.all — pooler concurrency limit.
    const total = await prisma.activationCode.count({ where });
    const codes = await prisma.activationCode.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        faculty: { select: { name: true } },
        year: { select: { label: true } },
        issuer: { select: { fullName: true } },
        redeemer: { select: { fullName: true, email: true } },
        payment: { select: { id: true, method: true, status: true } },
      },
    });

    res.status(200).json({
      activationCodes: codes.map((code) => ({
        id: code.id,
        code: code.code,
        status: code.status,
        faculty: code.faculty.name,
        year: code.year.label,
        issuedBy: code.issuer.fullName,
        issuedAt: code.createdAt,
        expiresAt: code.expiresAt,
        redeemedBy: code.redeemer?.fullName ?? null,
        redeemedByEmail: code.redeemer?.email ?? null,
        redeemedAt: code.redeemedAt,
        payment: code.payment,
      })),
      pagination: { page, limit, total },
    });
  } catch (err) {
    next(err);
  }
}

adminActivationCodesRouter.get("/", requireSupportAgentOrAdmin, validateQuery(LIST_QUERY_SCHEMA), listActivationCodes);

export { adminActivationCodesRouter };
export default router;
