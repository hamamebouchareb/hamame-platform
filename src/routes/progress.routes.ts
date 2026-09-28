import { NextFunction, Request, Response, Router } from "express";
import { validateParams } from "../middleware/validate";
import { uuidParam } from "../lib/common-schemas";
import { requireAuth } from "../middleware/auth";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { getDailyGoalProgress } from "../lib/daily-goal";
import { resolveViewerUniversityId, universityScopeFilter } from "../lib/university-scope";

// docs/hamame_api_contract.md — "Progress & Dashboard" section.
// Spaced-repetition endpoints live under `/api/reviews/*` (reviews.routes.ts), not here.
const router = Router();

router.use(requireAuth);

const AUTO_GRADABLE_TYPES = ["QCM", "QCS"] as const;

// Predictive exam-readiness (PRD Version 2). Weights and bands are confirmed product
// decisions — do not re-derive. Consistency is streak capped at 30 days then scaled to
// 0–100 so it can never contribute more than its 0.2 weight even at very long streaks.
const READINESS_RECENT_WINDOW = 20;
const READINESS_MIN_ATTEMPTS = 5;
const READINESS_STREAK_CAP_DAYS = 30;
const READINESS_WEIGHTS = { recentAccuracy: 0.5, curriculumCoverage: 0.3, consistency: 0.2 } as const;

function toNumberOrNull(value: { toNumber: () => number } | null): number | null {
  return value === null ? null : value.toNumber();
}

function readinessLabel(score: number): "Needs work" | "On track" | "Exam ready" {
  if (score <= 40) return "Needs work";
  if (score <= 70) return "On track";
  return "Exam ready";
}

// GET /api/progress/me — streak, score, accuracy, activity history.
async function getMyProgress(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;

    // Sequential, not Promise.all — same pooler-concurrency fix already applied to
    // GET /api/users/me/export (see that handler's comment in users.routes.ts): firing
    // all of these concurrently can trip the Supabase session pooler's ~10-connection
    // limit (P1001). This isn't a hot path, so trading a little latency for reliability
    // is the right call. All of these are independent read-only queries on the plain
    // client (no shared transaction), so sequencing them changes nothing but timing.
    const streak = await prisma.streak.findUnique({ where: { userId } });

    const totalCompletedSessions = await prisma.studySession.count({
      where: { userId, completedAt: { not: null } },
    });

    const scoreAgg = await prisma.studySession.aggregate({
      where: { userId, completedAt: { not: null }, score: { not: null } },
      _avg: { score: true },
    });

    const totalGradableAttempts = await prisma.attempt.count({
      where: {
        sessionQuestion: {
          session: { userId, completedAt: { not: null } },
          question: { type: { in: [...AUTO_GRADABLE_TYPES] } },
        },
      },
    });

    const correctGradableAttempts = await prisma.attempt.count({
      where: {
        isCorrect: true,
        sessionQuestion: {
          session: { userId, completedAt: { not: null } },
          question: { type: { in: [...AUTO_GRADABLE_TYPES] } },
        },
      },
    });

    const recentSessions = await prisma.studySession.findMany({
      where: { userId, completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      take: 5,
      select: { id: true, name: true, mode: true, score: true, completedAt: true },
    });

    const recentProgress = await prisma.progress.findMany({
      where: { userId, lessonId: { not: null } },
      orderBy: { lastStudiedAt: "desc" },
      take: 5,
      select: { lessonId: true, lastStudiedAt: true, lesson: { select: { title: true } } },
    });

    const accuracy =
      totalGradableAttempts > 0 ? Math.round((correctGradableAttempts / totalGradableAttempts) * 100) : null;

    const dailyGoal = await getDailyGoalProgress(userId);

    const averageScore = toNumberOrNull(scoreAgg._avg.score);
    const roundedAverageScore = averageScore === null ? null : Math.round(averageScore);

    const recentActivity = [
      ...recentSessions.map((session) => ({
        type: "session" as const,
        id: session.id,
        name: session.name,
        mode: session.mode,
        score: toNumberOrNull(session.score),
        at: session.completedAt as Date,
      })),
      ...recentProgress.map((progress) => ({
        type: "lesson" as const,
        lessonId: progress.lessonId as string,
        title: progress.lesson?.title ?? "Lesson",
        at: progress.lastStudiedAt,
      })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime());

    res.status(200).json({
      streak: {
        currentStreakDays: streak?.currentStreakDays ?? 0,
        longestStreakDays: streak?.longestStreakDays ?? 0,
      },
      dailyGoal: {
        dailyGoalMinutes: dailyGoal.dailyGoalMinutes,
        minutesStudiedToday: dailyGoal.minutesStudiedToday,
        goalMet: dailyGoal.goalMet,
      },
      totalCompletedSessions,
      averageScore: roundedAverageScore,
      accuracy,
      recentActivity,
    });
  } catch (err) {
    next(err);
  }
}

router.get("/me", getMyProgress);

// GET /api/progress/readiness — predictive exam-readiness score (PRD V2).
//
// Pure aggregation over existing Attempt / Progress / Streak / Lesson rows — no new
// schema. Components are returned individually (0–100) so a future frontend can show a
// breakdown, not just the final number. Same sequential-await discipline as /me above
// (Section 4.9 pooler-concurrency lesson): never Promise.all here.
async function getExamReadiness(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { yearId: true },
    });
    if (!user) {
      throw new ApiError(404, "USER_NOT_FOUND", "User not found.");
    }

    // Last ~20 auto-gradable attempts from completed sessions, newest first. Same
    // QCM/QCS gate and completed-session restriction as GET /api/progress/me's accuracy
    // field — QROC/clinical-case attempts stay out of both numerator and denominator.
    const recentAttempts = await prisma.attempt.findMany({
      where: {
        sessionQuestion: {
          session: { userId, completedAt: { not: null } },
          question: { type: { in: [...AUTO_GRADABLE_TYPES] } },
        },
      },
      orderBy: { answeredAt: "desc" },
      take: READINESS_RECENT_WINDOW,
      select: { isCorrect: true },
    });

    const gradableAttemptCount = recentAttempts.length;

    // Curriculum coverage: published lessons in the student's year, university-scoped
    // the same way listLessonsForUnit is (FR-10a), that the student has a Progress row
    // for (i.e. opened at least once — same "viewed == attempted" convention as
    // GET /api/lessons/:id's progress upsert). No year on the profile → nothing in
    // curriculum → coverage 0, not an error.
    let curriculumCoverage = 0;
    if (user.yearId) {
      const viewerUniversityId = await resolveViewerUniversityId(prisma, userId);
      const lessonScope = {
        unit: { module: { yearId: user.yearId } },
        currentVersionId: { not: null },
        AND: [universityScopeFilter(viewerUniversityId)],
      };

      const lessonsInCurriculum = await prisma.lesson.count({ where: lessonScope });
      if (lessonsInCurriculum > 0) {
        const attemptedLessons = await prisma.progress.findMany({
          where: {
            userId,
            lessonId: { not: null },
            lesson: lessonScope,
          },
          select: { lessonId: true },
          distinct: ["lessonId"],
        });
        curriculumCoverage = Math.round((attemptedLessons.length / lessonsInCurriculum) * 100);
      }
    }

    const streak = await prisma.streak.findUnique({ where: { userId } });
    const currentStreakDays = streak?.currentStreakDays ?? 0;
    const consistency = Math.round(
      (Math.min(currentStreakDays, READINESS_STREAK_CAP_DAYS) / READINESS_STREAK_CAP_DAYS) * 100
    );

    // Not enough data for a meaningful accuracy signal — withhold the composite score
    // rather than return a misleading number built on a near-empty window. Coverage and
    // consistency are still returned so a future UI can show "open more questions" without
    // hiding the rest of the student's progress.
    if (gradableAttemptCount < READINESS_MIN_ATTEMPTS) {
      res.status(200).json({
        insufficientData: true,
        score: null,
        label: null,
        components: {
          recentAccuracy: null,
          curriculumCoverage,
          consistency,
        },
        gradableAttemptCount,
        minAttemptsRequired: READINESS_MIN_ATTEMPTS,
      });
      return;
    }

    const correctCount = recentAttempts.filter((attempt) => attempt.isCorrect === true).length;
    const recentAccuracy = Math.round((correctCount / gradableAttemptCount) * 100);

    const score = Math.round(
      READINESS_WEIGHTS.recentAccuracy * recentAccuracy +
        READINESS_WEIGHTS.curriculumCoverage * curriculumCoverage +
        READINESS_WEIGHTS.consistency * consistency
    );

    res.status(200).json({
      insufficientData: false,
      score,
      label: readinessLabel(score),
      components: {
        recentAccuracy,
        curriculumCoverage,
        consistency,
      },
      gradableAttemptCount,
      minAttemptsRequired: READINESS_MIN_ATTEMPTS,
    });
  } catch (err) {
    next(err);
  }
}

router.get("/readiness", getExamReadiness);

// GET /api/progress/qcm-stats — real counts for the profile page's "Statistiques QCM"
// grid. Every number is a DB aggregation (count/aggregate/$queryRaw), never an
// application-layer loop: this runs on every profile load. accuracyRecent20 follows the
// same auto-gradable gate as /readiness's recentAccuracy (QCM/QCS in completed sessions
// only — ungraded QROC attempts would dilute an accuracy figure with non-gradable rows),
// so the two surfaces can never disagree about "the last 20 answers".
// Sequential awaits throughout — pooler-concurrency discipline (see /me above).
async function getQcmStats(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;

    const sessionsCompleted = await prisma.studySession.count({
      where: { userId, completedAt: { not: null } },
    });

    const mockExamsCompleted = await prisma.studySession.count({
      where: { userId, isOfficialMock: true, completedAt: { not: null } },
    });

    // Attempts have no direct userId — they belong to the user through their session.
    const totalQuestionsAnswered = await prisma.attempt.count({
      where: { sessionQuestion: { session: { userId } } },
    });

    const correctCount = await prisma.attempt.count({
      where: { isCorrect: true, sessionQuestion: { session: { userId } } },
    });

    const incorrectCount = await prisma.attempt.count({
      where: { isCorrect: false, sessionQuestion: { session: { userId } } },
    });

    const recentGradable = await prisma.attempt.findMany({
      where: {
        isCorrect: { not: null },
        sessionQuestion: {
          session: { userId, completedAt: { not: null } },
          question: { type: { in: [...AUTO_GRADABLE_TYPES] } },
        },
      },
      orderBy: { answeredAt: "desc" },
      take: 20,
      select: { isCorrect: true },
    });
    const recentCorrect = recentGradable.filter((attempt) => attempt.isCorrect === true).length;
    const accuracyRecent20 =
      recentGradable.length > 0 ? Math.round((recentCorrect / recentGradable.length) * 100) : null;

    // Durations are computed entirely in SQL (EXTRACT(EPOCH FROM ...)) so no session
    // rows ever reach Node. int cast keeps the JSON clean of Decimal serialization.
    const durations = await prisma.$queryRaw<{ longest_seconds: number | null; average_seconds: number | null }[]>`
      SELECT
        MAX(EXTRACT(EPOCH FROM (completed_at - started_at)))::int AS longest_seconds,
        AVG(EXTRACT(EPOCH FROM (completed_at - started_at)))::int AS average_seconds
      FROM study_sessions
      WHERE user_id = ${userId}::uuid AND completed_at IS NOT NULL`;

    const streak = await prisma.streak.findUnique({
      where: { userId },
      select: { longestStreakDays: true },
    });

    res.status(200).json({
      sessionsCompleted,
      totalQuestionsAnswered,
      correctCount,
      incorrectCount,
      accuracyRecent20,
      mockExamsCompleted,
      longestSessionDurationSeconds: durations[0]?.longest_seconds ?? 0,
      averageSessionDurationSeconds: durations[0]?.average_seconds ?? 0,
      streakRecord: streak?.longestStreakDays ?? 0,
    });
  } catch (err) {
    next(err);
  }
}

router.get("/qcm-stats", getQcmStats);

// GET /api/progress/modules/:id — per-module tracking, FR-23.
async function getModuleProgress(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params;

    const courseModule = await prisma.module.findUnique({ where: { id }, select: { id: true } });
    if (!courseModule) {
      throw new ApiError(404, "MODULE_NOT_FOUND", "No module exists with this id.");
    }

    const [totalLessons, completedLessons] = await Promise.all([
      prisma.lesson.count({ where: { unit: { moduleId: id } } }),
      prisma.progress.findMany({
        where: { userId, lesson: { unit: { moduleId: id } } },
        select: { lessonId: true },
        distinct: ["lessonId"],
      }),
    ]);

    const completedCount = completedLessons.length;
    const percentage = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

    res.status(200).json({
      moduleId: id,
      totalLessons,
      completedLessons: completedCount,
      percentage,
    });
  } catch (err) {
    next(err);
  }
}

router.get("/modules/:id", validateParams(uuidParam("id")), getModuleProgress);

// GET /api/progress/by-module — per-module PERFORMANCE breakdown (accuracy),
// the companion to /modules/:id's COMPLETION tracking (lessons viewed).
// One row per module in the student's own faculty+year (no faculty/year on
// the profile → empty list, not an error — same convention as /readiness's
// coverage). aggregation rules, shared with the other accuracy surfaces:
//   - gradable types only (QCM/QCS — QROC/clinical never enter either side),
//   - completed sessions only (same gate as /readiness recentAccuracy),
//   - newest attempt per session_question (same dedup rule the scorer uses),
//   - denominator = answered attempts only (unanswered questions excluded,
//     same convention as /qcm-stats and /readiness).
// Completion columns reuse /modules/:id's exact semantics (all lessons under
// the module count toward the total, Progress rows mark viewed) so the two
// endpoints can never disagree. Everything aggregates in one SQL statement —
// no application-layer loops, no N+1 — with sequential-await discipline kept
// trivially (single query).
async function getPerformanceByModule(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;

    const viewer = await prisma.user.findUnique({
      where: { id: userId },
      select: { facultyId: true, yearId: true },
    });
    if (!viewer?.facultyId || !viewer?.yearId) {
      res.status(200).json({ modules: [] });
      return;
    }

    const rows = await prisma.$queryRaw<
      {
        module_id: string;
        module_name: string;
        year_id: string;
        year_label: string;
        total_lessons: number;
        completed_lessons: number;
        answered: number;
        correct: number;
      }[]
    >`
      WITH latest AS (
        SELECT DISTINCT ON (sq.id)
          sq.id AS sq_id,
          sq.question_id AS question_id,
          a.is_correct AS is_correct
        FROM session_questions sq
        JOIN study_sessions s ON s.id = sq.session_id
        LEFT JOIN attempts a ON a.session_question_id = sq.id
        WHERE s.user_id = ${userId}::uuid
          AND s.completed_at IS NOT NULL
        ORDER BY sq.id, a.answered_at DESC NULLS LAST
      )
      SELECT
        m.id AS module_id,
        m.name AS module_name,
        y.id AS year_id,
        y.label AS year_label,
        COUNT(DISTINCT les.id)::int AS total_lessons,
        COUNT(DISTINCT pr.lesson_id)::int AS completed_lessons,
        COUNT(DISTINCT l.sq_id) FILTER (WHERE l.is_correct IS NOT NULL)::int AS answered,
        COUNT(DISTINCT l.sq_id) FILTER (WHERE l.is_correct IS TRUE)::int AS correct
      FROM modules m
      JOIN years y ON y.id = m.year_id
      LEFT JOIN units u ON u.module_id = m.id
      LEFT JOIN lessons les ON les.unit_id = u.id
      LEFT JOIN progress pr ON pr.lesson_id = les.id AND pr.user_id = ${userId}::uuid
      LEFT JOIN questions q ON q.unit_id = u.id AND q.type IN ('QCM', 'QCS')
      LEFT JOIN latest l ON l.question_id = q.id
      WHERE y.faculty_id = ${viewer.facultyId}::uuid
        AND y.id = ${viewer.yearId}::uuid
      GROUP BY m.id, m.name, y.id, y.label, y.order_index, m.order_index
      ORDER BY y.order_index ASC, m.order_index ASC`;

    res.status(200).json({
      modules: rows.map((row) => {
        const incorrect = row.answered - row.correct;
        return {
          moduleId: row.module_id,
          moduleName: row.module_name,
          yearId: row.year_id,
          yearLabel: row.year_label,
          totalLessons: row.total_lessons,
          completedLessons: row.completed_lessons,
          completionPercentage:
            row.total_lessons > 0 ? Math.round((row.completed_lessons / row.total_lessons) * 100) : 0,
          answered: row.answered,
          correct: row.correct,
          incorrect,
          accuracy: row.answered > 0 ? Math.round((row.correct / row.answered) * 100) : null,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
}

router.get("/by-module", getPerformanceByModule);

export default router;
