import { prisma } from "../lib/prisma";
import { startOfUtcDay, getDailyGoalProgress } from "../lib/daily-goal";
import { sendPushToUser } from "../lib/push/send";

// V1 push feature — the two cron-driven reminder types (daily goal reminder,
// streak-at-risk). The third type (badgeEarned) is event-triggered, not scheduled — see
// src/lib/badge-awards.ts's notifyBadgeEarned instead.
//
// Deliberately NOT run once immediately at boot, unlike every other job in this
// directory (expireSubscriptions.ts, unsuspendUsers.ts, generateLeaderboardSnapshots.ts)
// — see src/server.ts's registration comment for why: those jobs are naturally
// idempotent (flipping a status, or fully replacing a snapshot), so re-running them on
// every dev-server restart is harmless. A push send is NOT naturally idempotent — this
// repo runs `tsx watch`, which re-executes server.ts on every file save, and a boot-run
// here would fire a real push to every subscribed student on every hot-reload.
//
// Only iterates users who have at least one PushSubscription — a user who has never
// granted push permission has nothing to notify (sendPushToUser would still write an
// in-app Notification row for them, which isn't the point of this scheduled job).
//
// Sequential per-user (no Promise.all), same Supabase-pooler concurrency rule as every
// other multi-query job/endpoint in this codebase (AGENTS.md). One user's failure is
// caught and logged per-iteration so it can't abort the rest of the run; the whole
// function ALSO has an outer try/catch so a cron job can never throw and crash the
// process (same contract as every job in this directory).
export async function sendDailyPushReminders(): Promise<{ dailyGoalReminders: number; streakAtRiskWarnings: number } | null> {
  try {
    const subscribedUserIds = await prisma.pushSubscription.findMany({
      distinct: ["userId"],
      select: { userId: true },
    });

    let dailyGoalReminders = 0;
    let streakAtRiskWarnings = 0;
    const today = startOfUtcDay(new Date());

    for (const { userId } of subscribedUserIds) {
      try {
        const progress = await getDailyGoalProgress(userId);
        if (!progress.goalMet) {
          const result = await sendPushToUser(userId, "daily_goal_reminder", {
            title: "Don't lose today's progress",
            body: `You've studied ${progress.minutesStudiedToday}/${progress.dailyGoalMinutes} minutes today — finish your daily goal.`,
          });
          if (result.sent) {
            dailyGoalReminders += 1;
          }
        }

        const streak = await prisma.streak.findUnique({ where: { userId } });
        const activeToday = streak ? streak.lastActiveDate.getTime() >= today.getTime() : false;
        if (streak && streak.currentStreakDays > 0 && !activeToday) {
          const result = await sendPushToUser(userId, "streak_at_risk", {
            title: "Your streak is at risk!",
            body: `Your ${streak.currentStreakDays}-day streak will reset if you don't study today.`,
          });
          if (result.sent) {
            streakAtRiskWarnings += 1;
          }
        }
      } catch (err) {
        console.error(`[cron] sendDailyPushReminders failed for user ${userId}:`, err);
      }
    }

    console.log(
      `[cron] Sent ${dailyGoalReminders} daily-goal reminders and ${streakAtRiskWarnings} streak-at-risk warnings`
    );
    return { dailyGoalReminders, streakAtRiskWarnings };
  } catch (err) {
    console.error("[cron] Failed to send daily push reminders:", err);
    return null;
  }
}
