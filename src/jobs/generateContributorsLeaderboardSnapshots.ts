import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

// BR-12 gamification job: regenerate the monthly "Top Contributors" leaderboard snapshots.
//
// This is the parallel, participation-based counterpart to generateLeaderboardSnapshots.ts
// (score-based). Same 30-day window, same (facultyId, yearId) pairing via the USER's own
// faculty/year, same ranking-descending + full-replace-per-pair shape — but the metric is
// the COUNT of completed StudySessions, not average score.
//
// Discriminator (see the decision recorded alongside the schema): the LeaderboardSnapshot
// model has no `type` column, so this job reuses the existing `period` string as the
// discriminator — `period` is 'monthly' for score rows (unchanged, untouched) and
// 'monthly_contributors' for contributor rows. Both jobs' deleteMany are scoped by their
// own period, so a full replace of one board can never delete the other board's rows.
//
// Deliberate difference from the score job: `score: { not: null }` is NOT required here.
// A completed session counts as participation even when it can't be auto-graded (QROC and
// clinical-case sessions legitimately keep score = null — see AGENTS.md), so gating on
// score would undercount exactly the participation this board measures.
//
// Returns the total number of rows inserted on success, or null on failure after logging —
// a cron job must never throw (same contract as the score job, see src/server.ts).
const PERIOD = "monthly_contributors";
const WINDOW_DAYS = 30;

export async function generateContributorsLeaderboardSnapshots(): Promise<number | null> {
  try {
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

    // Every (facultyId, yearId) pair that has at least one completed StudySession in the
    // last 30 days. Same shape as the score job's pair discovery — the pair is the USER's
    // own faculty/year (User.facultyId / User.yearId), never the session's.
    const pairs = await prisma.user.groupBy({
      by: ["facultyId", "yearId"],
      where: {
        status: { not: "deleted" },
        facultyId: { not: null },
        yearId: { not: null },
        studySessions: {
          some: { completedAt: { not: null, gte: since } },
        },
      },
    });

    let insertedRows = 0;

    for (const pair of pairs) {
      const { facultyId, yearId } = pair;
      if (!facultyId || !yearId) continue;

      // Completed-session count per user in the window, restricted to users whose own
      // faculty/year match this pair. Single grouped query (_count in SQL), sequential
      // awaits per pair — no Promise.all (known P1001 pooler concurrency limit).
      const counts = await prisma.studySession.groupBy({
        by: ["userId"],
        where: {
          user: { facultyId, yearId, status: { not: "deleted" } },
          completedAt: { not: null, gte: since },
        },
        _count: { _all: true },
      });

      // Rank descending by session count — rank 1 = most active. (No tie-breaker: equal
      // counts share no rule in this pass, stable-sort order decides.)
      const ranked = counts
        .map((entry) => ({ userId: entry.userId, sessionCount: entry._count._all }))
        .sort((a, b) => b.sessionCount - a.sessionCount)
        .map((entry, index) => ({ ...entry, rank: index + 1 }));

      if (ranked.length === 0) continue;

      // Full replace of THIS board's rows only: scoped by period = 'monthly_contributors',
      // so the score board's 'monthly' rows for the same pair are never touched.
      await prisma.$transaction([
        prisma.leaderboardSnapshot.deleteMany({
          where: { facultyId, yearId, period: PERIOD },
        }),
        prisma.leaderboardSnapshot.createMany({
          data: ranked.map((entry) => ({
            facultyId,
            yearId,
            period: PERIOD,
            userId: entry.userId,
            rank: entry.rank,
            // The `score` column is the model's only numeric metric column, so the
            // contribution count is stored there (as a Decimal, same as the score job's
            // average). The route labels it `score` in the response regardless of board —
            // for the contributors board it semantically reads as "sessions completed".
            score: new Prisma.Decimal(entry.sessionCount),
            generatedAt: new Date(),
          })),
        }),
      ]);

      insertedRows += ranked.length;
    }

    console.log(`[cron] Generated ${insertedRows} contributor leaderboard snapshot rows`);
    return insertedRows;
  } catch (err) {
    console.error("[cron] Failed to generate contributor leaderboard snapshots:", err);
    return null;
  }
}
