import { NextFunction, Request, Response, Router } from "express";
import { prisma } from "../lib/prisma";

// docs/hamame_api_contract.md — "Monetization" section (public plan listing).
const router = Router();

// Plan.priceDzd is a Prisma Decimal — left un-converted it serializes to a JSON
// string rather than a number, which is surprising for a price. Normalize to a plain
// number (or null) everywhere it's returned, mirroring serializeScore in
// src/routes/sessions.routes.ts.
function serializePriceDzd(priceDzd: { toNumber: () => number } | null): number | null {
  return priceDzd === null ? null : priceDzd.toNumber();
}

// GET /api/plans — active plans. Public so pricing can be shown pre-signup.
async function listActivePlans(_req: Request, res: Response, next: NextFunction) {
  try {
    const plans = await prisma.plan.findMany({ where: { isActive: true } });
    res.status(200).json({
      plans: plans.map((plan) => ({
        ...plan,
        priceDzd: serializePriceDzd(plan.priceDzd),
      })),
    });
  } catch (err) {
    next(err);
  }
}

router.get("/", listActivePlans);

export default router;
