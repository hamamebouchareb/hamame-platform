import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { validateBody } from "../middleware/validate";
import { requireAuth } from "../middleware/auth";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";

// V2 monetization: promo-code redemption (PromoCode + PromoCodeRedemption in
// prisma/schema.prisma).
//
// Redemption actively GRANTS Premium access instead of just recording intent: on a valid
// redemption this handler creates a PromoCodeRedemption row AND creates-or-extends the
// user's premium Subscription inside the same transaction (single source of truth, no
// partial-apply window). Mirrors the manual-assisted payment MVP — there is no real
// payment gateway; the redemption row is the audit record.
//
// Schema constraints that shape the logic (confirmed against prisma/schema.prisma — no
// schema change was made for this):
//   - no global maxUses column  →  codes are globally unlimited, only maxUsesPerAccount
//     (default 1) applies
//   - no isActive column        →  "active" is inferred as "not expired" (expiresAt null
//     or in the future)
//   - granted duration          →  read from PromoCode.value.grantsDays, validated as a
//     positive integer when the code is created (admin.routes.ts)
const router = Router();

router.use(requireAuth);

const redeemSchema = z.object({ code: z.string().min(1) });

// Codes are stored normalized to uppercase (see POST /api/admin/promo-codes), which makes
// the @unique lookup case-insensitive in practice — redeem with any casing works.
function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

// Plan.priceDzd is a Prisma Decimal — left un-converted it serializes to a JSON string.
// Same normalization as serializePlan in src/routes/subscriptions.routes.ts (duplicated
// here per the existing per-file convention).
function serializeDecimal(value: { toNumber: () => number } | null): number | null {
  return value === null ? null : value.toNumber();
}

function serializePlan(plan: { priceDzd: { toNumber: () => number } | null }) {
  return { ...plan, priceDzd: serializeDecimal(plan.priceDzd) };
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// POST /api/promo-codes/redeem — validate a code, then grant/extend Premium.
//
// Validation order (fail fast, one specific error per case):
//   1. code exists (case-insensitive)                    → 404
//   2. not expired (expiresAt null or in the future)      → 400 "This code has expired."
//      (this is the whole "active" check — there is no isActive column, so a code that
//      is no longer active IS an expired code)
//   3. global maxUses                                     → skipped: no such column exists,
//      codes are unlimited globally
//   4. per-account maxUsesPerAccount not exceeded         → 400 "You've already used this code."
//
// On success a single transaction creates the redemption row AND creates a premium
// Subscription (if the user has no active one) or extends the active one's
// currentPeriodEnd by value.grantsDays — extended from the CURRENT expiry, not from
// today, so stacking codes never wastes days.
async function redeemPromoCode(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { code } = req.body as z.infer<typeof redeemSchema>;

    const promoCode = await prisma.promoCode.findUnique({ where: { code: normalizeCode(code) } });
    if (!promoCode) {
      throw new ApiError(404, "PROMO_CODE_NOT_FOUND", "No promo code exists with this code.");
    }

    const now = new Date();
    if (promoCode.expiresAt && promoCode.expiresAt < now) {
      throw new ApiError(400, "PROMO_CODE_EXPIRED", "This code has expired.");
    }

    const redemptionCount = await prisma.promoCodeRedemption.count({
      where: { promoCodeId: promoCode.id, userId },
    });
    if (redemptionCount >= promoCode.maxUsesPerAccount) {
      throw new ApiError(400, "PROMO_CODE_ALREADY_USED", "You've already used this code.");
    }

    // grantsDays is validated as a positive integer at code creation, so this is a
    // defensive guard for legacy rows created before that validation existed, not a
    // normal user-facing path.
    const grantsDays = (promoCode.value as { grantsDays?: unknown }).grantsDays;
    if (typeof grantsDays !== "number" || !Number.isInteger(grantsDays) || grantsDays < 1) {
      throw new ApiError(
        400,
        "PROMO_CODE_MISCONFIGURED",
        "This code has no valid grant duration configured. Contact support."
      );
    }

    // The premium Plan is seeded (prisma/seed.ts). Redeeming a code that grants Premium
    // when no active premium plan exists is a server misconfiguration, not a client error.
    const premiumPlan = await prisma.plan.findFirst({ where: { name: "premium", isActive: true } });
    if (!premiumPlan) {
      throw new ApiError(500, "PROMO_PLAN_MISSING", "No active premium plan is configured.");
    }

    const { subscription, redemption } = await prisma.$transaction(async (tx) => {
      const createdRedemption = await tx.promoCodeRedemption.create({
        data: { promoCodeId: promoCode.id, userId },
      });

      const activeSubscription = await tx.subscription.findFirst({
        where: { userId, status: "active" },
      });

      // Extend from the CURRENT expiry, never from today, so stacking codes doesn't waste
      // days. max(currentPeriodEnd, now) is a strict improvement over a bare "extend from
      // currentPeriodEnd": for a healthy future-dated expiry it is identical, and for a
      // stale row whose currentPeriodEnd is already in the past while status is still
      // 'active' (the known gap where no job flips expired subscriptions yet — see
      // subscriptions.routes.ts) it still grants a full period instead of a
      // negative-length extension.
      let subscriptionResult;
      if (activeSubscription) {
        const base = activeSubscription.currentPeriodEnd > now ? activeSubscription.currentPeriodEnd : now;
        subscriptionResult = await tx.subscription.update({
          where: { id: activeSubscription.id },
          data: { currentPeriodEnd: addDays(base, grantsDays) },
          include: { plan: true },
        });
      } else {
        subscriptionResult = await tx.subscription.create({
          data: {
            userId,
            planId: premiumPlan.id,
            status: "active",
            startedAt: now,
            currentPeriodEnd: addDays(now, grantsDays),
            autoRenew: true,
          },
          include: { plan: true },
        });
      }

      return { subscription: subscriptionResult, redemption: createdRedemption };
    });

    res.status(200).json({
      message: "Promo code redeemed successfully. Premium access has been granted.",
      grantedDays: grantsDays,
      redemption: { id: redemption.id, promoCodeId: redemption.promoCodeId, redeemedAt: redemption.redeemedAt },
      subscription: { ...subscription, plan: serializePlan(subscription.plan) },
    });
  } catch (err) {
    next(err);
  }
}

router.post("/redeem", validateBody(redeemSchema), redeemPromoCode);

export default router;
