import { NextFunction, Request, Response, Router } from "express";
import { Prisma, Streak, StudySession } from "@prisma/client";
import { z } from "zod";
import { validateBody, validateParams, validateQuery } from "../middleware/validate";
import { paginationQuery, uuidParam } from "../lib/common-schemas";
import { requireAuth } from "../middleware/auth";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { buildQuestionWhere } from "../lib/question-filters";
import { shuffle } from "../lib/shuffle";
import { createFlashcardFromQuestion, findFlashcardSourceQuestion } from "../lib/flashcard-from-question";
import { resolveViewerUniversityId } from "../lib/university-scope";
import { checkAndAwardBadges, notifyBadgeEarned } from "../lib/badge-awards";
import { enqueueReviewQueueItem } from "./reviews.routes";
import { isAiConfigured } from "../lib/ai/anthropic";
import {
  ContextualHintError,
  HINTABLE_QUESTION_TYPES,
  generateContextualHint,
  loadHintPersonalization,
  loadHintQuestion,
} from "../lib/ai/contextual-hint";
import {
  ensureAiCreditBalance,
  refundAiCredit,
  reserveAiCredit,
  resolveAiCreditAllowances,
} from "../lib/ai/credits";

// docs/hamame_api_contract.md — "Question Bank & Sessions" section (session lifecycle).
// All session endpoints act on the current user's own sessions, so all require auth.
const router = Router();

router.use(requireAuth);

const AUTO_GRADABLE_TYPES = ["QCM", "QCS"] as const;

function isAutoGradableType(type: string): boolean {
  return (AUTO_GRADABLE_TYPES as readonly string[]).includes(type);
}

// StudySession.score is a Prisma Decimal — left un-converted, it serializes to a JSON
// string rather than a number, which is surprising for a percentage. Normalize to a
// plain number (or null) everywhere it's returned.
function serializeScore(score: { toNumber: () => number } | null): number | null {
  return score === null ? null : score.toNumber();
}

// Streak bookkeeping (FR-?? gamification, V1 streaks only — see src/routes/streaks.routes.ts).
// Dates are compared at day granularity in UTC, ignoring time-of-day, matching
// Streak.lastActiveDate's @db.Date column type.
function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysBetweenUtc(later: Date, earlier: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((startOfUtcDay(later).getTime() - startOfUtcDay(earlier).getTime()) / MS_PER_DAY);
}

// Upserts the user's Streak row per the rules: no existing row (or, if the column
// ever allowed it, a null lastActiveDate) starts a fresh streak of 1; a gap of exactly
// one day extends it; a gap of 0 (already active today) leaves it unchanged so
// multiple sessions in one day don't double-count; a gap of 2+ days resets it to 1.
//
// Returns the upserted row (previously void) so the caller can feed currentStreakDays
// straight into the badge-award check below without a redundant re-query — this is the
// transaction's own just-written value, not a fresh read of possibly-stale state.
async function updateStreakForUser(tx: Prisma.TransactionClient, userId: string): Promise<Streak> {
  const today = startOfUtcDay(new Date());
  const existingStreak = await tx.streak.findUnique({ where: { userId } });

  let currentStreakDays: number;
  if (!existingStreak) {
    currentStreakDays = 1;
  } else {
    const gapDays = daysBetweenUtc(today, existingStreak.lastActiveDate);
    if (gapDays <= 0) {
      currentStreakDays = existingStreak.currentStreakDays;
    } else if (gapDays === 1) {
      currentStreakDays = existingStreak.currentStreakDays + 1;
    } else {
      currentStreakDays = 1;
    }
  }

  const longestStreakDays = Math.max(existingStreak?.longestStreakDays ?? 0, currentStreakDays);

  return tx.streak.upsert({
    where: { userId },
    update: { currentStreakDays, longestStreakDays, lastActiveDate: today },
    create: { userId, currentStreakDays, longestStreakDays, lastActiveDate: today },
  });
}

// Fetches a session and enforces that it belongs to the requesting user. Shared by
// every endpoint below since they all act on "the current user's own session".
async function requireOwnedSession(sessionId: string, userId: string): Promise<StudySession> {
  const session = await prisma.studySession.findUnique({ where: { id: sessionId } });
  if (!session) {
    throw new ApiError(404, "SESSION_NOT_FOUND", "No session exists with this id.");
  }
  if (session.userId !== userId) {
    throw new ApiError(403, "FORBIDDEN", "This session does not belong to you.");
  }
  return session;
}

// Full session + ordered questions/options for creation and detail responses. Never
// selects Question.explanationRichtext/aiEnhancedExplanation or
// QuestionOption.isCorrect — those only ever appear in practice-mode answer feedback
// (submitAnswer) or the post-submission results endpoint (getSessionResults).
function loadSessionWithQuestions(sessionId: string) {
  return prisma.studySession.findUnique({
    where: { id: sessionId },
    include: {
      sessionQuestions: {
        orderBy: { presentedOrder: "asc" },
        include: {
          question: {
            select: {
              id: true,
              unitId: true,
              type: true,
              source: true,
              difficulty: true,
              bodyRichtext: true,
              // P5 player chips: unit/module labels + sitting metadata. No new
              // schema — examYear/sittingLabel came from Phase 1; the paper-number
              // suffix MedSparkDZ shows (e.g. "2019 EMD N°1") already fits the
              // free-text sittingLabel field.
              examYear: true,
              sittingLabel: true,
              unit: { select: { name: true, module: { select: { name: true } } } },
              options: { select: { id: true, bodyText: true } },
              clinicalCaseParts: {
                orderBy: { partOrder: "asc" },
                select: { id: true, partOrder: true, promptText: true },
              },
            },
          },
        },
      },
    },
  });
}

type SessionWithQuestions = NonNullable<Awaited<ReturnType<typeof loadSessionWithQuestions>>>;

// Re-orders a question's options per the session_questions.option_order snapshot
// (BR-4: option order is randomized once, per attempt, at session-creation time — not
// re-shuffled on every read). Falls back to the stored (select) order if the snapshot
// is missing or stale relative to the current option set.
function reorderOptions<T extends { id: string }>(options: T[], optionOrder: Prisma.JsonValue): T[] {
  if (!Array.isArray(optionOrder)) {
    return options;
  }
  const byId = new Map(options.map((option) => [option.id, option]));
  const orderedIds = optionOrder.filter((entry): entry is string => typeof entry === "string" && byId.has(entry));
  const ordered = orderedIds.map((optionId) => byId.get(optionId)!);
  const remaining = options.filter((option) => !orderedIds.includes(option.id));
  return [...ordered, ...remaining];
}

function formatSessionForResponse(session: SessionWithQuestions) {
  return {
    id: session.id,
    name: session.name,
    mode: session.mode,
    isOfficialMock: session.isOfficialMock,
    timeLimitSeconds: session.timeLimitSeconds,
    resultSort: session.resultSort,
    showStats: session.showStats,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    score: serializeScore(session.score),
    questions: session.sessionQuestions.map((sessionQuestion) => ({
      sessionQuestionId: sessionQuestion.id,
      presentedOrder: sessionQuestion.presentedOrder,
      question: {
        id: sessionQuestion.question.id,
        unitId: sessionQuestion.question.unitId,
        type: sessionQuestion.question.type,
        source: sessionQuestion.question.source,
        difficulty: sessionQuestion.question.difficulty,
        bodyRichtext: sessionQuestion.question.bodyRichtext,
        examYear: sessionQuestion.question.examYear,
        sittingLabel: sessionQuestion.question.sittingLabel,
        unitName: sessionQuestion.question.unit.name,
        moduleName: sessionQuestion.question.unit.module.name,
      },
      options: reorderOptions(sessionQuestion.question.options, sessionQuestion.optionOrder),
      clinicalCaseParts: sessionQuestion.question.clinicalCaseParts,
    })),
  };
}

// POST /api/sessions — create session (mode, filters, size), FR-15/16.
//
// Contract extras (FR-15/16, MedSparkDZ audit):
//   sort      — 'random' (default, BR-4) | 'by_year' | 'by_course'. Ordering applies to
//               the SELECTED pool only: candidates are shuffled first, then grouped by
//               curriculum key (year order_index; +module order_index for by_course),
//               preserving the shuffled order inside each group so BR-4 randomness
//               survives within groups while groups themselves follow the chosen order.
//   examMode  — boolean switch form of mode (contract param). When both are sent, the
//               explicit boolean wins over `mode`.
//   showStats — persisted and echoed so the results surface can gate its detailed
//               accuracy/breakdown section (plain score when false).
const createSessionSchema = z.object({
  name: z.string().min(1),
  mode: z.enum(["practice", "exam"]),
  facultyId: z.string().uuid().optional(),
  yearId: z.string().uuid().optional(),
  moduleIds: z.array(z.string().uuid()).optional(),
  unitIds: z.array(z.string().uuid()).optional(),
  questionTypes: z.array(z.enum(["QCM", "QCS", "QROC", "CLINICAL_CASE"])).optional(),
  source: z.enum(["official_exam", "hamame_authored", "ai_generated", "mixed"]).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  // Exam-sitting scope (past-exam picker + period filter). Passed straight into the
  // shared buildQuestionWhere — the candidate-pool query itself needed no other change.
  examYear: z.number().int().min(1000).max(9999).optional(),
  examYearFrom: z.number().int().min(1000).max(9999).optional(),
  examYearTo: z.number().int().min(1000).max(9999).optional(),
  sittingLabel: z.string().min(1).max(120).optional(),
  size: z.number().int().min(1).max(200),
  isOfficialMock: z.boolean().optional().default(false),
  timeLimitSeconds: z.number().int().min(1).optional(),
  sort: z.enum(["by_year", "by_course", "random"]).optional().default("random"),
  examMode: z.boolean().optional(),
  showStats: z.boolean().optional().default(true),
});

async function createSession(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const {
      name,
      mode,
      facultyId,
      yearId,
      moduleIds,
      unitIds,
      questionTypes,
      source,
      dateFrom,
      dateTo,
      examYear,
      examYearFrom,
      examYearTo,
      sittingLabel,
      size,
      isOfficialMock,
      timeLimitSeconds,
      sort,
      examMode,
      showStats,
    } = req.body as z.infer<typeof createSessionSchema>;

    // examMode is the contract's boolean-switch spelling of mode; explicit beats enum.
    const effectiveMode = examMode === undefined ? mode : examMode ? "exam" : "practice";

    if (unitIds && unitIds.length > 0) {
      // Same faculty-visibility gate as buildQuestionWhere below: a unit under a hidden
      // ('planned') faculty is indistinguishable from a missing one, so the requested
      // scope must resolve through the same unit -> module -> year -> faculty traversal
      // before the session is allowed to reference it.
      const existingUnits = await prisma.unit.findMany({
        where: {
          id: { in: unitIds },
          module: { year: { faculty: { rolloutStatus: { in: ["beta", "live"] } } } },
        },
        select: { id: true },
      });
      if (existingUnits.length !== unitIds.length) {
        throw new ApiError(404, "UNIT_NOT_FOUND", "One or more requested unitIds do not exist.");
      }
    }

    // FR-10a: a session must never be built from another university's scoped questions.
    // Sequential await rather than folding into a Promise.all, per the pooler guidance.
    const viewerUniversityId = await resolveViewerUniversityId(prisma, userId);

    const where = buildQuestionWhere({
      unitIds,
      moduleIds,
      yearId,
      facultyId,
      types: questionTypes,
      source: source && source !== "mixed" ? source : undefined,
      dateFrom,
      dateTo,
      examYear,
      examYearFrom,
      examYearTo,
      sittingLabel,
      viewerUniversityId,
    });

    // BR-4: question order is shuffled per attempt. Fetch every matching candidate id
    // (+ its option ids, needed for the option-order snapshot below), then shuffle and
    // cap at `size` in application code rather than relying on DB-level randomness.
    const candidates = await prisma.question.findMany({
      where,
      select: { id: true, options: { select: { id: true } } },
    });
    let selected = shuffle(candidates).slice(0, size);

    // FR-15 result ordering — see createSessionSchema docs. Shuffle first (BR-4), then a
    // stable group-sort by curriculum key; ties keep their shuffled order so randomness
    // is preserved inside every group. 'random' skips this entirely.
    if (sort !== "random" && selected.length > 1) {
      const keyRows = await prisma.question.findMany({
        where: { id: { in: selected.map((question) => question.id) } },
        select: {
          id: true,
          unit: { select: { module: { select: { orderIndex: true, year: { select: { orderIndex: true } } } } } },
        },
      });
      const shuffledIndexById = new Map(selected.map((question, index) => [question.id, index]));
      const keyById = new Map(keyRows.map((row) => [row.id, row]));
      selected = [...selected].sort((a, b) => {
        const keyA = keyById.get(a.id)!;
        const keyB = keyById.get(b.id)!;
        const yearDiff = keyA.unit.module.year.orderIndex - keyB.unit.module.year.orderIndex;
        if (yearDiff !== 0) return yearDiff;
        if (sort === "by_course") {
          const moduleDiff = keyA.unit.module.orderIndex - keyB.unit.module.orderIndex;
          if (moduleDiff !== 0) return moduleDiff;
        }
        return shuffledIndexById.get(a.id)! - shuffledIndexById.get(b.id)!;
      });
    }

    const session = await prisma.$transaction(async (tx) => {
      const createdSession = await tx.studySession.create({
        data: {
          userId,
          name,
          mode: effectiveMode,
          isOfficialMock,
          timeLimitSeconds,
          resultSort: sort,
          showStats,
          startedAt: new Date(),
        },
      });

      if (selected.length > 0) {
        await tx.sessionQuestion.createMany({
          data: selected.map((question, index) => ({
            sessionId: createdSession.id,
            questionId: question.id,
            presentedOrder: index,
            // BR-4: option order is also shuffled per attempt, then snapshotted so it
            // stays stable for the lifetime of this session.
            optionOrder:
              question.options.length > 0
                ? shuffle(question.options.map((option) => option.id))
                : undefined,
          })),
        });
      }

      return createdSession;
    });

    const fullSession = await loadSessionWithQuestions(session.id);
    res.status(201).json({ session: formatSessionForResponse(fullSession!) });
  } catch (err) {
    next(err);
  }
}

router.post("/", validateBody(createSessionSchema), createSession);

// GET /api/sessions — own session history, newest first (Phase 3 history page).
//
// Read-only over existing tables (study_sessions + session_questions + attempts):
// no new columns or tables. Each entry carries totals plus a per-unit breakdown
// (answered/total/correct with unit/module/year/faculty labels) so the UI can
// group by curriculum without extra round-trips. Correctness uses the latest
// attempt per session_question — the same rule scoring itself uses. "Continuer"
// is a client-side route to /sessions/:id (player) or .../results; the player
// does not restore per-question UI state on reload, so resume means re-answering
// from the top with history intact server-side — stated, not oversold.
const listSessionsQuerySchema = paginationQuery.extend({
  // P12 cheap simulations history: filter to past exam-mode sessions only.
  mode: z.enum(["practice", "exam"]).optional(),
});

async function listSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { page, limit, mode } = req.query as unknown as z.infer<typeof listSessionsQuerySchema>;

    const where = { userId, ...(mode ? { mode } : {}) };
    // Sequential awaits (pooler guidance: no large Promise.all).
    const total = await prisma.studySession.count({ where });
    const sessions = await prisma.studySession.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        sessionQuestions: {
          orderBy: { presentedOrder: "asc" },
          select: {
            attempts: {
              orderBy: { answeredAt: "desc" },
              take: 1,
              select: { isCorrect: true },
            },
            question: {
              select: {
                id: true,
                unit: {
                  select: {
                    id: true,
                    name: true,
                    module: {
                      select: {
                        id: true,
                        name: true,
                        year: {
                          select: {
                            id: true,
                            label: true,
                            faculty: { select: { id: true, name: true } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    res.status(200).json({
      sessions: sessions.map((session) => {
        let answered = 0;
        let correct = 0;
        const byUnit = new Map<
          string,
          {
            unitId: string;
            unitName: string;
            moduleName: string;
            yearLabel: string;
            facultyName: string;
            total: number;
            answered: number;
            correct: number;
          }
        >();
        for (const sq of session.sessionQuestions) {
          const latest = sq.attempts[0] ?? null;
          const isAnswered = latest !== null;
          const isCorrect = latest?.isCorrect === true;
          if (isAnswered) answered += 1;
          if (isCorrect) correct += 1;
          const unit = sq.question.unit;
          const key = unit.id;
          const entry = byUnit.get(key) ?? {
            unitId: unit.id,
            unitName: unit.name,
            moduleName: unit.module.name,
            yearLabel: unit.module.year.label,
            facultyName: unit.module.year.faculty.name,
            total: 0,
            answered: 0,
            correct: 0,
          };
          entry.total += 1;
          if (isAnswered) entry.answered += 1;
          if (isCorrect) entry.correct += 1;
          byUnit.set(key, entry);
        }
        return {
          id: session.id,
          name: session.name,
          mode: session.mode,
          startedAt: session.startedAt,
          completedAt: session.completedAt,
          score: serializeScore(session.score),
          stats: { total: session.sessionQuestions.length, answered, correct },
          units: [...byUnit.values()],
        };
      }),
      pagination: { page, limit, total },
    });
  } catch (err) {
    next(err);
  }
}

router.get("/", validateQuery(listSessionsQuerySchema), listSessions);

// GET /api/sessions/:id — session detail + questions.
async function getSessionDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await requireOwnedSession(id, req.auth!.userId);

    const fullSession = await loadSessionWithQuestions(id);
    res.status(200).json({ session: formatSessionForResponse(fullSession!) });
  } catch (err) {
    next(err);
  }
}

router.get("/:id", validateParams(uuidParam("id")), getSessionDetail);

// POST /api/sessions/:id/answers — submit answer(s) for a question in-session.
const submitAnswerSchema = z.object({
  questionId: z.string().uuid(),
  selectedOptionIds: z.array(z.string().uuid()).optional(),
  freeTextAnswer: z.string().optional(),
});

async function submitAnswer(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { questionId, selectedOptionIds, freeTextAnswer } = req.body as z.infer<typeof submitAnswerSchema>;
    const session = await requireOwnedSession(id, req.auth!.userId);

    if (session.completedAt) {
      throw new ApiError(409, "SESSION_ALREADY_COMPLETED", "This session has already been submitted.");
    }

    const sessionQuestion = await prisma.sessionQuestion.findFirst({
      where: { sessionId: id, questionId },
      include: {
        question: {
          select: {
            type: true,
            explanationRichtext: true,
            options: { select: { id: true, isCorrect: true } },
          },
        },
      },
    });
    if (!sessionQuestion) {
      throw new ApiError(404, "SESSION_QUESTION_NOT_FOUND", "This question is not part of this session.");
    }

    // QROC/clinical-case questions are not auto-gradable — automated grading is a V2 AI
    // feature (out of scope here). They need human/AI review not yet built, so
    // isCorrect stays null for them.
    let isCorrect: boolean | null = null;
    if (isAutoGradableType(sessionQuestion.question.type)) {
      const correctOptionIds = sessionQuestion.question.options
        .filter((option) => option.isCorrect)
        .map((option) => option.id);
      const submittedOptionIds = selectedOptionIds ?? [];
      isCorrect =
        correctOptionIds.length === submittedOptionIds.length &&
        correctOptionIds.every((optionId) => submittedOptionIds.includes(optionId));
    }

    const attempt = await prisma.attempt.create({
      data: {
        sessionQuestionId: sessionQuestion.id,
        selectedOptionIds: selectedOptionIds ?? undefined,
        freeTextAnswer: freeTextAnswer ?? undefined,
        isCorrect,
        answeredAt: new Date(),
      },
    });

    const responseAttempt: Record<string, unknown> = {
      id: attempt.id,
      sessionQuestionId: attempt.sessionQuestionId,
      selectedOptionIds: attempt.selectedOptionIds,
      freeTextAnswer: attempt.freeTextAnswer,
      answeredAt: attempt.answeredAt,
    };

    // BR-4: no feedback until the whole session is submitted — only practice mode gets
    // immediate isCorrect/explanation; exam mode gets neither until GET .../results.
    // correctOptionIds is practice-only for the same reason: revealing it in exam mode
    // would leak the answer key before submission.
    if (session.mode === "practice") {
      responseAttempt.isCorrect = attempt.isCorrect;
      responseAttempt.explanation = sessionQuestion.question.explanationRichtext;
      responseAttempt.correctOptionIds = sessionQuestion.question.options
        .filter((option) => option.isCorrect)
        .map((option) => option.id);
    }

    res.status(201).json({ attempt: responseAttempt });
  } catch (err) {
    next(err);
  }
}

router.post("/:id/answers", validateParams(uuidParam("id")), validateBody(submitAnswerSchema), submitAnswer);

// POST /api/sessions/:id/hints — contextual hint for a question in an active practice
// session (FR-29, credit-governed per BR-6).
//
// Mounted here rather than under the contract's placeholder /api/ai/hint because a hint is
// session-scoped: it needs the same ownership, session-state and question-membership
// guards as POST /:id/answers, and reuses them directly. Lesson-scoped AI tools (chat,
// note-maker, answer-locator) still belong under /api/ai/* when they are built.
//
// Everything safety-critical lives in src/lib/ai/contextual-hint.ts (the answer is never
// put in the prompt, and generated text is screened before it is returned) and
// src/lib/ai/credits.ts (reserve-then-refund). This handler is the guard sequence plus
// the failure-path bookkeeping.
const hintSchema = z.object({
  questionId: z.string().uuid(),
});

async function requestHint(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { questionId } = req.body as z.infer<typeof hintSchema>;
    const userId = req.auth!.userId;

    const session = await requireOwnedSession(id, userId);

    if (session.completedAt) {
      throw new ApiError(409, "SESSION_ALREADY_COMPLETED", "This session has already been submitted.");
    }

    // Exam mode is deliberately hint-free: exam sessions exist to simulate real exam
    // conditions (BR-4), and a hint would corrupt both that diagnostic value and the
    // accuracy data derived from exam attempts. An explicit rejection, never a silent
    // allow and never a silently unpersonalized/no-op hint.
    if (session.mode !== "practice") {
      throw new ApiError(
        409,
        "HINT_NOT_ALLOWED_IN_EXAM_MODE",
        "Hints are only available in practice mode. This session is in exam mode."
      );
    }

    // Membership check first: a question the student isn't currently working on must not
    // be hintable through this endpoint at all.
    const sessionQuestion = await prisma.sessionQuestion.findFirst({
      where: { sessionId: id, questionId },
      select: { id: true },
    });
    if (!sessionQuestion) {
      throw new ApiError(404, "SESSION_QUESTION_NOT_FOUND", "This question is not part of this session.");
    }

    const question = await loadHintQuestion(prisma, questionId);
    if (!question) {
      throw new ApiError(404, "SESSION_QUESTION_NOT_FOUND", "This question is not part of this session.");
    }
    if (!(HINTABLE_QUESTION_TYPES as readonly string[]).includes(question.type)) {
      throw new ApiError(
        400,
        "HINT_UNSUPPORTED_QUESTION_TYPE",
        `Hints are only available for ${HINTABLE_QUESTION_TYPES.join("/")} questions. No credit was used.`
      );
    }

    // Dependency availability is checked AFTER the request-validity guards above: a
    // request that could never produce a hint (wrong question type, wrong session state)
    // must report that reason, not a misleading "AI unavailable". Still before any credit
    // is reserved, so a missing key can never cost a student a credit, and 503 rather than
    // 500 — an unconfigured dependency is not a bug.
    if (!isAiConfigured()) {
      throw new ApiError(
        503,
        "AI_NOT_CONFIGURED",
        "AI features are not configured on this server. No credit was used."
      );
    }

    const personalization = await loadHintPersonalization(prisma, userId, question);

    const allowances = await resolveAiCreditAllowances(prisma, userId);
    await ensureAiCreditBalance(prisma, userId, allowances);

    // Reserve BEFORE the model call — see the long note in src/lib/ai/credits.ts on why
    // the reverse order would allow unlimited free hints via retries.
    const reservation = await reserveAiCredit(prisma, userId);
    if (!reservation.reserved) {
      throw new ApiError(
        429,
        "AI_CREDITS_EXHAUSTED",
        `No AI credits remaining today (${reservation.dailyAllowance} per day on your plan). Your balance resets at ${reservation.resetAt.toISOString()}.`
      );
    }

    let hint: Awaited<ReturnType<typeof generateContextualHint>>;
    try {
      hint = await generateContextualHint(question, personalization);
    } catch (err) {
      // A failed generation must not cost the student a credit — that includes a hint
      // rejected by the leak check, which the student never sees.
      await refundAiCredit(prisma, userId, reservation);

      if (err instanceof ContextualHintError && err.reason === "UNSAFE_HINT") {
        console.error(`[sessions:hint] unsafe hint discarded for question ${questionId}: ${err.message}`);
        throw new ApiError(
          502,
          "HINT_UNSAFE",
          "Could not produce a hint that keeps the answer hidden. No credit was used — please try again."
        );
      }

      console.error(`[sessions:hint] generation failed for question ${questionId}`, err);
      throw new ApiError(502, "AI_GENERATION_FAILED", "Hint generation failed. No credit was used.");
    }

    // BR-6/FR-35 provenance for a user-facing AI feature. Best-effort: the student has
    // already been charged and has a valid hint, so a logging failure must not turn a
    // successful request into an error (and must not trigger a refund either).
    try {
      await prisma.aiInteraction.create({
        data: {
          userId,
          feature: "hint",
          contextRefType: "question",
          contextRefId: questionId,
          inputSummary: `session=${id} band=${personalization.band} missedBefore=${personalization.missedThisQuestionBefore} model=${hint.model} promptVersion=${hint.promptVersion} attempts=${hint.attempts}`,
          outputSummary: hint.hintText,
        },
      });
    } catch (err) {
      console.error(`[sessions:hint] ai_interactions log failed for question ${questionId}`, err);
    }

    res.status(200).json({
      hint: {
        text: hint.hintText,
        sessionId: id,
        questionId,
        // Lets the UI show "tailored to your recent work" honestly — false when the
        // student has too little history in this module to personalize on.
        personalized: personalization.band !== "unknown" || personalization.missedThisQuestionBefore,
        creditsRemainingToday: reservation.remainingToday,
        dailyAllowance: reservation.dailyAllowance,
      },
    });
  } catch (err) {
    next(err);
  }
}

router.post("/:id/hints", validateParams(uuidParam("id")), validateBody(hintSchema), requestHint);

// POST /api/sessions/:id/submit — finalize session, compute score.
async function finalizeSession(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const session = await requireOwnedSession(id, req.auth!.userId);

    if (session.completedAt) {
      throw new ApiError(409, "SESSION_ALREADY_COMPLETED", "This session has already been submitted.");
    }

    // Resolved before the transaction opens (and reused by the auto-flashcard hook inside
    // it) so the FR-10a gate is re-checked at submit time, not just at session creation —
    // a student's university could have changed in between.
    const viewerUniversityId = await resolveViewerUniversityId(prisma, session.userId);

    // Populated inside the transaction below (badge-award hook), read after it commits
    // to fire the badge-earned push (see notifyBadgeEarned's doc comment for why that
    // network call must happen outside the transaction, not inside it).
    let newlyAwardedBadgeIds: string[] = [];

    const updatedSession = await prisma.$transaction(async (tx) => {
      const sessionQuestions = await tx.sessionQuestion.findMany({
        where: { sessionId: id },
        select: {
          question: { select: { id: true, type: true } },
          attempts: { orderBy: { answeredAt: "desc" }, take: 1, select: { isCorrect: true } },
        },
      });

      // Score = % correct among ALL gradable (QCM/QCS) questions — QROC/clinical cases
      // are excluded from both numerator and denominator (not auto-gradable yet, per the
      // AI feature catalog). The denominator is every gradable question, answered or
      // not: an unanswered gradable question counts as incorrect, so a student can't
      // inflate their score by skipping ones they're unsure of (BR-4 score integrity,
      // matters most for exam-mode/official-mock sessions).
      const gradableQuestions = sessionQuestions.filter((sq) => isAutoGradableType(sq.question.type));
      const correctCount = gradableQuestions.filter((sq) => sq.attempts[0]?.isCorrect === true).length;
      // null (not 0) when there's nothing gradable at all — 0 would incorrectly imply
      // "answered everything wrong" rather than "nothing to grade". Every reader of
      // score (serializeScore, and the response bodies below) must keep treating null
      // as "ungraded", not coerce it to 0.
      const score = gradableQuestions.length > 0 ? (correctCount / gradableQuestions.length) * 100 : null;

      const updated = await tx.studySession.update({
        where: { id },
        data: { completedAt: new Date(), score },
      });

      const streak = await updateStreakForUser(tx, session.userId);

      // Automatic badge-award triggers (Section 9 item 5 of the handoff — previously
      // manual-award-only by design). Evaluates streak/session-count/accuracy criteria
      // against the state this same transaction just wrote (score above, streak just
      // above) and awards any newly-met badges. See src/lib/badge-awards.ts for the
      // criteria taxonomy and, in particular, why this is safe under concurrent session
      // submits without needing a new migration (UserBadge's composite primary key
      // already prevents a duplicate award row — this differs from the review-queue race
      // fixed earlier this session, which had no constraint at all).
      // Best-effort by design, same as the review-queue hook below — a badge-evaluation
      // failure (e.g. a malformed criteria JSON from a future admin typo) must never
      // block or roll back session completion.
      try {
        const newlyAwarded = await checkAndAwardBadges(tx, {
          userId: session.userId,
          currentStreakDays: streak.currentStreakDays,
        });
        newlyAwardedBadgeIds = newlyAwarded.map((userBadge) => userBadge.badgeId);
      } catch (err) {
        console.error(`[sessions:submit] badge-award check failed for session ${id}`, err);
      }

      // Auto-enqueue on wrong answer (FR-26/27 spaced-repetition hook): any gradable
      // question answered incorrectly is queued for review, due immediately, provided
      // the user opted in via ReviewSettings.
      // Additionally, a distinct Flashcard artifact is generated from each missed question
      // (MBset gap analysis Section 4 — "auto-generates flashcards from missed
      // questions"): the card is created from the question's body/explanation rich text
      // and enqueued into the SAME queue, so the student reviews a dedicated front/back
      // card rather than only re-facing the original question. Both enqueues share the
      // same idempotent engine; flashcards are deduped per (user, source question) so
      // repeat wrong answers across sessions don't stack duplicate cards. Generation
      // re-checks the same approved+visible-faculty gate as the manual from-question
      // route (shared src/lib/flashcard-from-question.ts) — a hidden-faculty question
      // never becomes a flashcard.
      // Best-effort by design — a queue failure must never block or roll back session
      // completion, so this block catches and logs its own errors.
      try {
        const reviewSettings = await tx.reviewSettings.findUnique({ where: { userId: session.userId } });
        if (reviewSettings?.isEnabled) {
          for (const sq of gradableQuestions) {
            if (sq.attempts[0]?.isCorrect === false) {
              await enqueueReviewQueueItem(tx, { userId: session.userId, questionId: sq.question.id });

              const source = await findFlashcardSourceQuestion(tx, sq.question.id, viewerUniversityId);
              if (source) {
                // Dedup on (user, source question) now lives inside the shared helper,
                // enforced by a unique index — the findFirst-then-create that used to be
                // here raced under concurrent submits and could stack duplicate cards.
                const { flashcard } = await createFlashcardFromQuestion(tx, session.userId, source);
                await enqueueReviewQueueItem(tx, { userId: session.userId, flashcardId: flashcard.id });
              }
            }
          }
        }
      } catch (err) {
        console.error(`[sessions:submit] review-queue auto-enqueue failed for session ${id}`, err);
      }

      return updated;
    });

    // Badge-earned push (V1 push feature) — fired here, after the transaction has
    // committed, using the plain `prisma` client (not `tx`, which is now closed). Best-
    // effort: notifyBadgeEarned swallows its own errors, so a push failure can never turn
    // an already-successful session submission into an error response.
    for (const badgeId of newlyAwardedBadgeIds) {
      await notifyBadgeEarned(prisma, session.userId, badgeId);
    }

    res.status(200).json({
      session: {
        id: updatedSession.id,
        name: updatedSession.name,
        mode: updatedSession.mode,
        showStats: updatedSession.showStats,
        resultSort: updatedSession.resultSort,
        startedAt: updatedSession.startedAt,
        completedAt: updatedSession.completedAt,
        score: serializeScore(updatedSession.score),
      },
    });
  } catch (err) {
    next(err);
  }
}

router.post("/:id/submit", validateParams(uuidParam("id")), finalizeSession);

// GET /api/sessions/:id/results — results + explanations.
async function getSessionResults(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const session = await requireOwnedSession(id, req.auth!.userId);

    if (!session.completedAt) {
      throw new ApiError(409, "SESSION_NOT_COMPLETED", "This session has not been submitted yet.");
    }

    const sessionQuestions = await prisma.sessionQuestion.findMany({
      where: { sessionId: id },
      orderBy: { presentedOrder: "asc" },
      include: {
        question: {
          select: {
            id: true,
            type: true,
            source: true,
            difficulty: true,
            bodyRichtext: true,
            explanationRichtext: true,
            options: {
              orderBy: { orderIndex: "asc" },
              select: { id: true, bodyText: true, isCorrect: true },
            },
            clinicalCaseParts: {
              orderBy: { partOrder: "asc" },
              select: { id: true, partOrder: true, promptText: true, expectedAnswerText: true },
            },
          },
        },
        attempts: { orderBy: { answeredAt: "desc" }, take: 1 },
      },
    });

    // Now that the session is submitted, revealing isCorrect / expectedAnswerText is
    // exactly the point of this endpoint (unlike everywhere else questions are surfaced).
    const results = sessionQuestions.map((sessionQuestion) => {
      const latestAttempt = sessionQuestion.attempts[0] ?? null;
      return {
        sessionQuestionId: sessionQuestion.id,
        presentedOrder: sessionQuestion.presentedOrder,
        question: {
          id: sessionQuestion.question.id,
          type: sessionQuestion.question.type,
          source: sessionQuestion.question.source,
          difficulty: sessionQuestion.question.difficulty,
          bodyRichtext: sessionQuestion.question.bodyRichtext,
        },
        studentAnswer: latestAttempt
          ? { selectedOptionIds: latestAttempt.selectedOptionIds, freeTextAnswer: latestAttempt.freeTextAnswer }
          : null,
        isCorrect: latestAttempt ? latestAttempt.isCorrect : null,
        options: sessionQuestion.question.options,
        clinicalCaseParts: sessionQuestion.question.clinicalCaseParts,
        explanation: sessionQuestion.question.explanationRichtext,
      };
    });

    res.status(200).json({
      session: {
        id: session.id,
        name: session.name,
        mode: session.mode,
        // Read-side of the FR-16 toggle: false tells the results UI to render a plain
        // score without the detailed accuracy/breakdown section.
        showStats: session.showStats,
        resultSort: session.resultSort,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        score: serializeScore(session.score),
      },
      results,
    });
  } catch (err) {
    next(err);
  }
}

router.get("/:id/results", validateParams(uuidParam("id")), getSessionResults);

export default router;
