import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { limitAiCalls } from "../middleware/rateLimit";
import {
  getAiCreditBalance,
  refundAiCredit,
  reserveAiCredit,
  resolveAiCreditAllowances,
  ensureAiCreditBalance,
  findAiCreditUpgrade,
} from "../lib/ai/credits";
import { GeminiError, isGeminiConfigured } from "../lib/ai/gemini";
import {
  ExplainAnswerError,
  generateAnswerExplanation,
  loadExplainQuestion,
  type ExplainAnswerStudentContext,
} from "../lib/ai/explain-answer";
import { generateStudyChatReply, studyChatRequestSchema, type StudyChatContext } from "../lib/ai/study-chat";
import { ApiError } from "../lib/errors";
import { validateBody } from "../middleware/validate";
import { prisma } from "../lib/prisma";
import { resolveViewerUniversityId } from "../lib/university-scope";

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
    const upgrade = await findAiCreditUpgrade(prisma, balance.dailyAllowance);
    res.status(200).json({
      dailyAllowance: balance.dailyAllowance,
      usedToday: balance.usedToday,
      remainingToday: balance.remainingToday,
      purchasedCredits: balance.purchasedCredits,
      resetAt: balance.resetAt.toISOString(),
      lowBalance,
      upgrade,
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

    if (!isGeminiConfigured()) {
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
      if (err instanceof GeminiError && err.kind === "QUOTA_EXHAUSTED") {
        // Free-tier quota is a real, retry-later state — never an auto-switch to a
        // paid model, never a charge.
        throw new ApiError(
          503,
          "AI_QUOTA_EXHAUSTED",
          "The AI provider's free quota is temporarily exhausted. No credit was used — please try again later."
        );
      }
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

router.post("/study-chat", limitAiCalls, validateBody(studyChatRequestSchema), studyChat);

// POST /api/ai/explain-answer — the on-demand "Explain this answer" generation for
// the question player's practice-mode feedback block.
//
// Guard sequence (each gate BEFORE the next, and every gate before any credit):
//   0. limitAiCalls burst friction (per IP per endpoint),
//   1. shape validation (questionId required, sessionId required),
//   2. 503 AI_NOT_CONFIGURED (Gemini key absent — NOT a bug, no credit used),
//   3. 404 unknown-or-hidden question (BR-2 approved + faculty rollout + FR-10a
//      university layering via loadExplainQuestion — hidden stays indistinguishable),
//   4. answer-evidence gate: the requester must have their OWN attempt row for this
//      session-question. The endpoint can therefore never become an oracle that
//      reveals correct answers for unanswered questions (server-side BR-4 mirror),
//   5. exam-mode gate: sessions still in-flight (completedAt null) never generate
//      explanations — mirrors HINT_NOT_ALLOWED_IN_EXAM_MODE,
//   6. credit reserve-then-generate with refund on ANY failure (one shared pool),
//   7. quota mapping: provider 429 → 503 AI_QUOTA_EXHAUSTED, no charge, no fallback.
// Question + reference content in the prompt come exclusively from the DB route in
// src/lib/ai/explain-answer.ts; the client never sends answer material.
const explainAnswerBodySchema = z.object({
  questionId: z.string().uuid(),
  sessionId: z.string().uuid(),
});

async function explainAnswer(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { questionId, sessionId } = req.body as z.infer<typeof explainAnswerBodySchema>;

    if (!isGeminiConfigured()) {
      throw new ApiError(
        503,
        "AI_NOT_CONFIGURED",
        "AI features are not configured on this server. No credit was used."
      );
    }

    const viewerUniversityId = await resolveViewerUniversityId(prisma, userId);
    const question = await loadExplainQuestion(prisma, questionId, viewerUniversityId);
    if (!question) {
      // Deliberately 404 for missing/non-approved/hidden-faculty/other-university —
      // hidden content must be indistinguishable from missing content.
      throw new ApiError(404, "QUESTION_NOT_FOUND", "No accessible question exists with this id.");
    }

    // Answer-evidence + exam gates. One combined lookup keeps this cheap: the row
    // must exist under a session the requester owns.
    const sessionQuestion = await prisma.sessionQuestion.findFirst({
      where: { sessionId, questionId },
      select: { id: true, session: { select: { userId: true, mode: true, completedAt: true } } },
    });
    if (!sessionQuestion || sessionQuestion.session.userId !== userId) {
      throw new ApiError(
        403,
        "QUESTION_NOT_ANSWERED",
        "This explanation is available after answering the question in your own session."
      );
    }
    if (sessionQuestion.session.mode === "exam" && sessionQuestion.session.completedAt === null) {
      throw new ApiError(
        403,
        "EXAM_RESULTS_WITHHELD",
        "Exam explanations unlock when the exam is finished and results are revealed."
      );
    }
    const latestAttempt = await prisma.attempt.findFirst({
      where: { sessionQuestionId: sessionQuestion.id },
      orderBy: { answeredAt: "desc" },
      select: { selectedOptionIds: true, freeTextAnswer: true },
    });
    if (!latestAttempt) {
      throw new ApiError(
        403,
        "QUESTION_NOT_ANSWERED",
        "This explanation is available after answering the question in your own session."
      );
    }

    // Student context is resolved BEFORE the credit reservation: every query below
    // only reads rows we already gated, so a transient pooler failure here costs the
    // student nothing. Refund coverage then begins at the reserve itself.
    const selectedOptionIds = Array.isArray(latestAttempt.selectedOptionIds)
      ? latestAttempt.selectedOptionIds.filter((id): id is string => typeof id === "string")
      : [];
    const selectedOptionTexts = question.options
      .filter((option) => selectedOptionIds.includes(option.id))
      .map((option) => option.bodyText);
    const attemptCount = await prisma.attempt.count({ where: { sessionQuestionId: sessionQuestion.id } });
    const studentContext: ExplainAnswerStudentContext = {
      selectedOptionIds,
      selectedOptionTexts,
      freeTextAnswer: latestAttempt.freeTextAnswer,
      attemptCount,
    };

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

    let generation: Awaited<ReturnType<typeof generateAnswerExplanation>>;
    try {
      generation = await generateAnswerExplanation(question, studentContext);
    } catch (err) {
      // A failed generation must not cost the student a credit.
      await refundAiCredit(prisma, userId, reservation);
      console.error(`[ai:explain-answer] generation failed for user ${userId}`, err);
      if (err instanceof ExplainAnswerError) {
        if (err.reason === "QUOTA_EXHAUSTED") {
          throw new ApiError(
            503,
            "AI_QUOTA_EXHAUSTED",
            "The AI provider's free quota is temporarily exhausted. No credit was used — please try again later."
          );
        }
        if (err.reason === "NOT_CONFIGURED") {
          throw new ApiError(
            503,
            "AI_NOT_CONFIGURED",
            "AI features are not configured on this server. No credit was used."
          );
        }
        if (err.reason === "INVALID_REQUEST") {
          throw new ApiError(502, "AI_GENERATION_FAILED", "Explanation generation failed. No credit was used.");
        }
      }
      throw new ApiError(502, "AI_GENERATION_FAILED", "Explanation generation failed. No credit was used.");
    }

    if (generation.explanation.directExplanation.length === 0) {
      // Schema already forbids empty directExplanation; this stays as a second wall
      // (same double-gate style as the study-chat empty-reply check).
      await refundAiCredit(prisma, userId, reservation);
      throw new ApiError(502, "AI_GENERATION_FAILED", "Explanation generation failed. No credit was used.");
    }

    // Best-effort provenance (same rationale as the hint + study-chat handlers).
    try {
      await prisma.aiInteraction.create({
        data: {
          userId,
          feature: "explain_answer",
          contextRefType: "question",
          contextRefId: questionId,
          inputSummary: `type=${question.type} attempts=${attemptCount} model=${generation.model}`,
          outputSummary: generation.explanation.directExplanation.slice(0, 2000),
        },
      });
    } catch (err) {
      console.error(`[ai:explain-answer] ai_interactions log failed for user ${userId}`, err);
    }

    res.status(200).json({
      explanation: generation.explanation,
      creditsRemainingToday: reservation.remainingToday,
      dailyAllowance: reservation.dailyAllowance,
    });
  } catch (err) {
    next(err);
  }
}

router.post("/explain-answer", limitAiCalls, validateBody(explainAnswerBodySchema), explainAnswer);

export default router;
