import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { validateBody } from "../middleware/validate";
import { requireAuth } from "../middleware/auth";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";

// docs/hamame_api_contract.md — "Monetization" section (subscription lifecycle).
// Promo-code redeem/admin live under `/api/promo-codes` (promoCodes.routes.ts), not here.
const router = Router();

router.use(requireAuth);

// Subscription.currentPeriodEnd/Payment.amountDzd/Plan.priceDzd are Prisma Decimal —
// left un-converted they serialize to JSON strings rather than numbers. Normalize to a
// plain number (or null) everywhere returned, mirroring serializeScore in
// src/routes/sessions.routes.ts.
function serializeDecimal(value: { toNumber: () => number } | null): number | null {
  return value === null ? null : value.toNumber();
}

function serializePlan(plan: { priceDzd: { toNumber: () => number } | null }) {
  return { ...plan, priceDzd: serializeDecimal(plan.priceDzd) };
}

// A free plan (billingPeriod: null) never expires/renews — there's no real "forever"
// value for a timestamptz column, so this pushes currentPeriodEnd ~100 years out as a
// practical stand-in.
const FREE_PLAN_PERIOD_YEARS = 100;

function computeCurrentPeriodEnd(billingPeriod: string | null, from: Date): Date {
  const end = new Date(from);
  if (billingPeriod === "monthly") {
    end.setMonth(end.getMonth() + 1);
  } else if (billingPeriod === "yearly") {
    end.setFullYear(end.getFullYear() + 1);
  } else {
    end.setFullYear(end.getFullYear() + FREE_PLAN_PERIOD_YEARS);
  }
  return end;
}

// POST /api/subscriptions — create subscription (plan_id, payment_token).
const createSubscriptionSchema = z.object({
  planId: z.string().uuid(),
  paymentToken: z.string().min(1).optional(),
});

async function createSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { planId } = req.body as z.infer<typeof createSubscriptionSchema>;

    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) {
      throw new ApiError(404, "PLAN_NOT_FOUND", "No active plan exists with this id.");
    }

    const existingActiveSubscription = await prisma.subscription.findFirst({
      where: { userId, status: "active" },
    });
    if (existingActiveSubscription) {
      throw new ApiError(
        409,
        "SUBSCRIPTION_ALREADY_ACTIVE",
        "This user already has an active subscription. Cancel it before subscribing to a new plan."
      );
    }

    const startedAt = new Date();
    const currentPeriodEnd = computeCurrentPeriodEnd(plan.billingPeriod, startedAt);

    // MVP placeholder per PRD Section 18.3 / BR-8: there is no real payment gateway
    // integration yet. The subscription activates immediately and a Payment row is
    // recorded with method 'manual_assisted' purely for audit purposes, mirroring how
    // a real assisted-payment flow (bank transfer / agent-assisted CIB-Edahabia or
    // BaridiMob confirmation) would be logged, even though no actual gateway call
    // happens here. This must be replaced by real CIB/Edahabia/BaridiMob gateway
    // integration later.
    const { subscription, payment } = await prisma.$transaction(async (tx) => {
      const createdSubscription = await tx.subscription.create({
        data: {
          userId,
          planId: plan.id,
          status: "active",
          startedAt,
          currentPeriodEnd,
          autoRenew: true,
        },
      });

      const createdPayment = await tx.payment.create({
        data: {
          subscriptionId: createdSubscription.id,
          amountDzd: plan.priceDzd ?? 0,
          method: "manual_assisted",
          status: "succeeded",
        },
      });

      return { subscription: createdSubscription, payment: createdPayment };
    });

    res.status(201).json({
      subscription: { ...subscription, plan: serializePlan(plan) },
      payment: { ...payment, amountDzd: serializeDecimal(payment.amountDzd) },
    });
  } catch (err) {
    next(err);
  }
}

router.post("/", validateBody(createSubscriptionSchema), createSubscription);

// GET /api/subscriptions/me — current subscription.
async function getCurrentSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;

    // No subscription row is not an error — a user who never subscribed is implicitly
    // on the free tier, so this returns null rather than 404ing.
    const subscription = await prisma.subscription.findFirst({
      where: { userId },
      orderBy: { startedAt: "desc" },
      include: { plan: true },
    });

    if (!subscription) {
      return res.status(200).json({ subscription: null });
    }

    res.status(200).json({
      subscription: { ...subscription, plan: serializePlan(subscription.plan) },
    });
  } catch (err) {
    next(err);
  }
}

router.get("/me", getCurrentSubscription);

// PUT /api/subscriptions/me/cancel — BR-7: effective end of period.
async function cancelCurrentSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;

    const subscription = await prisma.subscription.findFirst({
      where: { userId, status: "active" },
    });
    if (!subscription) {
      throw new ApiError(404, "SUBSCRIPTION_NOT_FOUND", "No active subscription exists for this user.");
    }

    // BR-7: cancellation only takes effect at the end of the current paid period, so
    // status stays 'active' and currentPeriodEnd is untouched here — this endpoint
    // just marks cancellation intent (cancelledAt + autoRenew: false).
    //
    // Gap: actually flipping status to 'expired' once currentPeriodEnd passes requires
    // a scheduled job that does not exist yet anywhere in this codebase. Until that job
    // is built, an expired-but-not-renewed subscription will keep reporting
    // status: 'active' from this API.
    const updated = await prisma.subscription.update({
      where: { id: subscription.id },
      data: { cancelledAt: new Date(), autoRenew: false },
    });

    res.status(200).json({ subscription: updated });
  } catch (err) {
    next(err);
  }
}

router.put("/me/cancel", cancelCurrentSubscription);

export default router;
