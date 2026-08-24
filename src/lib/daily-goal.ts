import { prisma } from "./prisma";

// Daily study goal (FR-?? gamification, V1). Students set a personal per-day
// minutes target stored on Streak.dailyGoalMinutes; progress toward it is computed
// live on read from today's completed StudySessions. There is deliberately no cron
// job and no stored "minutes studied" counter — a stored counter would need
// backfilling, would drift from the session rows, and would need its own midnight
// rollover. Recomputing is cheap (one indexed query over a single day).

export const MIN_DAILY_GOAL_MINUTES = 5;
export const MAX_DAILY_GOAL_MINUTES = 300;

// Mirrors the DB default on streaks.daily_goal_minutes (see migration
// 20260101000011_add_daily_goal_minutes). Used when a user has no Streak row yet, so
// that a student who has never completed a session still sees the same goal they
// would get the moment their first row is created.
export const DEFAULT_DAILY_GOAL_MINUTES = 20;

// Day boundaries are UTC, matching Streak.lastActiveDate's @db.Date column and the
// streak bookkeeping in src/routes/sessions.routes.ts (startOfUtcDay/daysBetweenUtc).
// This MUST stay consistent with that file: if goal-progress and streak-increment
// disagreed about where "today" starts, a session could extend the streak while not
// counting toward the goal (or vice versa).
export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

// Streak.lastActiveDate is NOT NULL with no default, so a row created by the goal
// endpoints (before the user has ever completed a session) has to put *something*
// there. A far-past sentinel is used rather than "today": writing today would make
// daysBetweenUtc return 0 on the user's first session submit, which
// updateStreakForUser reads as "already active today" and would leave
// currentStreakDays at 0 — silently swallowing the first day of their streak.
// With the sentinel the gap is >= 2 days, so the first submit correctly starts the
// streak at 1. serializeLastActiveDate() keeps the sentinel out of API responses.
export const NEVER_ACTIVE_DATE = new Date(Date.UTC(1970, 0, 1));

// currentStreakDays is only ever set to >= 1 by updateStreakForUser, so a row still
// sitting at 0 is by definition one created by the goal endpoints with the sentinel
// date and no session activity yet. Report that as null rather than leaking 1970.
export function serializeLastActiveDate(
  streak: { currentStreakDays: number; lastActiveDate: Date } | null
): Date | null {
  if (!streak || streak.currentStreakDays <= 0) {
    return null;
  }
  return streak.lastActiveDate;
}

export interface DailyGoalProgress {
  dailyGoalMinutes: number;
  minutesStudiedToday: number;
  goalMet: boolean;
  // Diagnostics — not part of any HTTP response body, used to gauge how often the
  // uncapped fallback below is taken.
  sessionsCountedToday: number;
  sessionsWithoutTimeLimit: number;
}

// Sums today's completed sessions, clamping each session's contribution to its own
// declared time limit.
//
// Why clamp: startedAt is stamped at session *creation*, not at first answer, so a
// session left open in a background tab for three hours and then submitted would
// otherwise book three hours of "study". Clamping to timeLimitSeconds bounds each
// session by the limit the student actually agreed to.
//
// Sessions with a null timeLimitSeconds (e.g. untimed practice mode) have no bound
// to clamp to, so they fall back to the raw elapsed duration and remain inflatable
// by an idle tab. That gap is tracked via sessionsWithoutTimeLimit.
export async function getDailyGoalProgress(userId: string): Promise<DailyGoalProgress> {
  const streak = await prisma.streak.findUnique({ where: { userId } });
  const dailyGoalMinutes = streak?.dailyGoalMinutes ?? DEFAULT_DAILY_GOAL_MINUTES;

  const dayStart = startOfUtcDay(new Date());
  const dayEnd = addUtcDays(dayStart, 1);

  // Attributed by completedAt, not startedAt: a session counts toward the day it was
  // finished, which is the same day that extends the streak.
  const sessions = await prisma.studySession.findMany({
    where: { userId, completedAt: { gte: dayStart, lt: dayEnd } },
    select: { startedAt: true, completedAt: true, timeLimitSeconds: true },
  });

  let totalSeconds = 0;
  let sessionsWithoutTimeLimit = 0;

  for (const session of sessions) {
    if (!session.completedAt) {
      continue; // Unreachable given the where clause; keeps TS honest about the nullable column.
    }

    // Floored at 0 defensively — a negative duration would mean clock skew or bad
    // data, and must never subtract from the day's total.
    const rawSeconds = Math.max(0, (session.completedAt.getTime() - session.startedAt.getTime()) / 1000);

    if (session.timeLimitSeconds === null) {
      sessionsWithoutTimeLimit += 1;
      totalSeconds += rawSeconds;
    } else {
      totalSeconds += Math.min(rawSeconds, session.timeLimitSeconds);
    }
  }

  // Rounded once at the end rather than per session, and goalMet is compared against
  // the same rounded number that gets rendered — otherwise the UI could show "20/20"
  // while goalMet stayed false on a hidden fraction of a minute.
  const minutesStudiedToday = Math.round(totalSeconds / 60);

  return {
    dailyGoalMinutes,
    minutesStudiedToday,
    goalMet: minutesStudiedToday >= dailyGoalMinutes,
    sessionsCountedToday: sessions.length,
    sessionsWithoutTimeLimit,
  };
}
