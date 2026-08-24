import { NextFunction, Request, Response, Router } from "express";
import { requireAuth } from "../middleware/auth";
import { getAiCreditBalance } from "../lib/ai/credits";
import { prisma } from "../lib/prisma";

// /api/ai/* — first mounted AI-tooling group. Section 4.14's contextual hints live under
// /api/sessions/:id/hints (session-bound), but the companion credit-balance read belongs
// here as a standalone, feature-agnostic view of the shared AI credit pool.
const router = Router();

router.use(requireAuth);

// GET /api/ai/credits — current AI credit balance for the authenticated student.
//
// Read-only from the caller's perspective (no credit consumed). Internally runs the same
// lazy bootstrap + daily-reset-if-stale path the hints reserve flow uses, via
// getAiCreditBalance in src/lib/ai/credits.ts, so the numbers match what the next AI
// request would actually charge against.
async function getCredits(req: Request, res: Response, next: NextFunction) {
  try {
    const balance = await getAiCreditBalance(prisma, req.auth!.userId);
    res.status(200).json({
      dailyAllowance: balance.dailyAllowance,
      usedToday: balance.usedToday,
      remainingToday: balance.remainingToday,
      resetAt: balance.resetAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

router.get("/credits", getCredits);

export default router;
