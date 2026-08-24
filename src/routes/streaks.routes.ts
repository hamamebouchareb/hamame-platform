import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { prisma } from "../lib/prisma";
import {
  DEFAULT_DAILY_GOAL_MINUTES,
  MAX_DAILY_GOAL_MINUTES,
  MIN_DAILY_GOAL_MINUTES,
  NEVER_ACTIVE_DATE,
  getDailyGoalProgress,
  serializeLastActiveDate,
} from "../lib/daily-goal";

// docs/hamame_api_contract.md — "Gamification & Social" section (streaks + daily goals).
// Leaderboard/badges/friends live in their own route files under /api/leaderboard,
// /api/badges, and /api/friends — not scaffolded here.
const router = Router();

router.use(requireAuth);

// GET /api/streaks/me — current/longest streak (V1). Streak rows are only created the
// first time a user submits a session (see src/routes/sessions.routes.ts) or sets a
// daily goal below, so a brand new user has no row yet — that's a zero streak, not a 404.
async function getMyStreak(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const streak = await prisma.streak.findUnique({ where: { userId } });

    res.status(200).json({
      streak: {
        currentStreakDays: streak?.currentStreakDays ?? 0,
        longestStreakDays: streak?.longestStreakDays ?? 0,
        lastActiveDate: serializeLastActiveDate(streak),
      },
    });
  } catch (err) {
    next(err);
  }
}

router.get("/me", getMyStreak);

// GET /api/streaks/goal — the caller's daily study goal. Mirrors the
// /api/reviews/settings pattern: returns the column default rather than 404-ing when
// no row exists yet, so the client always has a number to render.
async function getDailyGoal(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const streak = await prisma.streak.findUnique({ where: { userId } });

    res.status(200).json({
      goal: { dailyGoalMinutes: streak?.dailyGoalMinutes ?? DEFAULT_DAILY_GOAL_MINUTES },
    });
  } catch (err) {
    next(err);
  }
}

router.get("/goal", getDailyGoal);

// PUT /api/streaks/goal — upsert keyed on userId.
const updateGoalSchema = z.object({
  dailyGoalMinutes: z.number().int().min(MIN_DAILY_GOAL_MINUTES).max(MAX_DAILY_GOAL_MINUTES),
});

async function updateDailyGoal(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { dailyGoalMinutes } = req.body as z.infer<typeof updateGoalSchema>;

    // The update branch touches dailyGoalMinutes ONLY — currentStreakDays /
    // longestStreakDays / lastActiveDate are owned by updateStreakForUser in
    // sessions.routes.ts, and setting a goal must never disturb streak state.
    // Symmetrically, that function's update branch omits dailyGoalMinutes, so
    // submitting a session can't clobber the goal. See NEVER_ACTIVE_DATE in
    // src/lib/daily-goal.ts for why the create branch backdates lastActiveDate.
    const streak = await prisma.streak.upsert({
      where: { userId },
      update: { dailyGoalMinutes },
      create: {
        userId,
        dailyGoalMinutes,
        currentStreakDays: 0,
        longestStreakDays: 0,
        lastActiveDate: NEVER_ACTIVE_DATE,
      },
    });

    res.status(200).json({ goal: { dailyGoalMinutes: streak.dailyGoalMinutes } });
  } catch (err) {
    next(err);
  }
}

router.put("/goal", validateBody(updateGoalSchema), updateDailyGoal);

// GET /api/streaks/today — progress toward today's goal, computed live from today's
// completed sessions (no cron job, no stored counter).
async function getTodayGoalProgress(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const progress = await getDailyGoalProgress(userId);

    res.status(200).json({
      today: {
        dailyGoalMinutes: progress.dailyGoalMinutes,
        minutesStudiedToday: progress.minutesStudiedToday,
        goalMet: progress.goalMet,
      },
    });
  } catch (err) {
    next(err);
  }
}

router.get("/today", getTodayGoalProgress);

export default router;
