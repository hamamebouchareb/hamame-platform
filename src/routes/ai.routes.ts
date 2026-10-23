import { NextFunction, Request, Response, Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  getAiCreditBalance,
  refundAiCredit,
  reserveAiCredit,
  resolveAiCreditAllowances,
  ensureAiCreditBalance,
} from "../lib/ai/credits";
import { isAiConfigured } from "../lib/ai/anthropic";
import { generateStudyChatReply, studyChatRequestSchema, type StudyChatContext } from "../lib/ai/study-chat";
import { ApiError } from "../lib/errors";
import { validateBody } from "../middleware/validate";
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
    // Task 7(a): server-computed low-balance flag using the same <20% rule the
    // dashboard previously computed client-side (since removed). Zero remaining
    // is its own empty state, not "low" — the UI treats those separately.
    const lowBalance =
      balance.dailyAllowance > 0 &&
      balance.remainingToday > 0 &&
      balance.remainingToday / balance.dailyAllowance < 0.2;
    res.status(200).json({
      dailyAllowance: balance.dailyAllowance,
      usedToday: balance.usedToday,
      remainingToday: balance.remainingToday,
      resetAt: balance.resetAt.toISOString(),
      lowBalance,
    });
  } catch (err) {
    next(err);
  }
}

router.get("/credits", getCredits);

// POST /api/ai/study-chat — one signed-in chat turn with the V2 study assistant
// (medspark.online ChatAI parity, approved gap list).
//
// Same guard sequence as the session hint (the two features share exactly one
// credit pool, one key gate, and one ai_interactions ledger):
//   1. request-validity guards first (shape, unit existence),
//   2. 503 AI_NOT_CONFIGURED (no key on the server — NOT a bug),
//   3. credit reserve BEFORE the model call, refund on ANY failure,
//   4. best-effort provenance row (feature: "study_chat").
// No body-paywall-free free chat: one turn = one credit, same pool as hints
// (BR-6), so the /ai/credits balance view also covers this feature.
type StudyChatBody = {
  messages: { role: "user"; content: string }[];
  unitId?: string | null;
};

async function studyChat(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const body = req.body as StudyChatBody;

    // Build the trusted study context BEFORE any cost, so a bad unitId reads as
    // a request-validity 404, never as a misleading "AI unavailable".
    let context: StudyChatContext | null = null;
    if (body.unitId) {
      const unit = await prisma.unit.findUnique({
        where: { id: body.unitId },
        select: {
          name: true,
          module: {
            select: {
              name: true,
              year: { select: { label: true, faculty: { select: { name: true } } } },
            },
          },
        },
      });
      if (!unit) throw new ApiError(404, "UNIT_NOT_FOUND", "No unit exists with this id.");
      context = {
        faculty: unit.module.year.faculty.name,
        year: unit.module.year.label,
        module: unit.module.name,
        unit: unit.name,
      };
    }

    if (!isAiConfigured()) {
      // 503, not 500 — an unconfigured dependency is not a bug. No credit is
      // consumed (the reserve would come after this gate anyway).
      throw new ApiError(
        503,
        "AI_NOT_CONFIGURED",
        "AI features are not configured on this server. No credit was used."
      );
    }

    const allowances = await resolveAiCreditAllowances(prisma, userId);
    await ensureAiCreditBalance(prisma, userId, allowances);

    const reservation = await reserveAiCredit(prisma, userId);
    if (!reservation.reserved) {
      throw new ApiError(
        429,
        "AI_CREDITS_EXHAUSTED",
        `No AI credits remaining today (${reservation.dailyAllowance} per day on your plan). Your balance resets at ${reservation.resetAt.toISOString()}.`
      );
    }

    let result: Awaited<ReturnType<typeof generateStudyChatReply>>;
    try {
      result = await generateStudyChatReply(
        body.messages.map((message) => ({ role: message.role, content: message.content })),
        context
      );
    } catch (err) {
      // A failed generation must not cost the student a credit.
      await refundAiCredit(prisma, userId, reservation);
      console.error(`[ai:study-chat] generation failed for user ${userId}`, err);
      throw new ApiError(502, "AI_GENERATION_FAILED", "Chat generation failed. No credit was used.");
    }

    if (result.replyText.length === 0) {
      // Empty transcript from the model is a failed turn, not an empty state.
      await refundAiCredit(prisma, userId, reservation);
      throw new ApiError(502, "AI_GENERATION_FAILED", "Chat generation failed. No credit was used.");
    }

    // Best-effort provenance (same rationale as the hint handler).
    try {
      await prisma.aiInteraction.create({
        data: {
          userId,
          feature: "study_chat",
          contextRefType: body.unitId ? "unit" : "none",
          contextRefId: body.unitId ?? null,
          inputSummary: `turns=${body.messages.length} unit=${body.unitId ?? "-"} model=${result.model} promptVersion=${result.promptVersion}`,
          outputSummary: result.replyText.slice(0, 2000),
        },
      });
    } catch (err) {
      console.error(`[ai:study-chat] ai_interactions log failed for user ${userId}`, err);
    }

    res.status(200).json({
      reply: result.replyText,
      creditsRemainingToday: reservation.remainingToday,
      dailyAllowance: reservation.dailyAllowance,
    });
  } catch (err) {
    next(err);
  }
}

router.post("/study-chat", validateBody(studyChatRequestSchema), studyChat);

export default router;
