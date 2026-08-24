import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

// BR-12 gamification job: regenerate the monthly leaderboard snapshots.
//
// `period` is always 'monthly' in this pass — these snapshots represent the "current
// rolling leaderboard", not a stored history — so each run FULLY REPLACES the rows for a
// given (facultyId, yearId) pair rather than appending a new period slice. See
// prisma/schema.prisma's LeaderboardSnapshot model.
//
// Returns the total number of rows inserted on success, or null on failure after
// logging — a cron job must never throw, or it would crash the whole process (same
// contract as expireSubscriptions.ts / unsuspendUsers.ts, see src/server.ts).
const PERIOD = "monthly";
const WINDOW_DAYS = 30;

export async function generateLeaderboardSnapshots(): Promise<number | null> {
  try {
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

    // Every (facultyId, yearId) pair that has at least one completed-and-scored
    // StudySession in the last 30 days. The pair is the USER's own faculty/year
    // (User.facultyId / User.yearId — see prisma/schema.prisma line 69-70) — the session
    // itself carries no faculty/year, so the pairing is resolved via the user, never the
    // session.
    const pairs = await prisma.user.groupBy({
      by: ["facultyId", "yearId"],
      where: {
        status: { not: "deleted" },
        facultyId: { not: null },
        yearId: { not: null },
        studySessions: {
          some: { completedAt: { not: null, gte: since }, score: { not: null } },
        },
      },
    });

    let insertedRows = 0;

    for (const pair of pairs) {
      const { facultyId, yearId } = pair;
      if (!facultyId || !yearId) continue;

      // Average score per user over their completed-and-scored sessions in the window,
      // restricted to users whose own faculty/year match this pair. Done as a single
      // grouped query (avg in SQL) rather than fetching every session into JS.
      const averages = await prisma.studySession.groupBy({
        by: ["userId"],
        where: {
          user: { facultyId, yearId, status: { not: "deleted" } },
          completedAt: { not: null, gte: since },
          score: { not: null },
        },
        _avg: { score: true },
      });

      // Rank descending by average score — rank 1 = highest. (No tie-breaker: equal
      // averages share no rule in this pass, stable-sort order decides.)
      const ranked = averages
        .map((entry) => ({ userId: entry.userId, avgScore: entry._avg.score?.toNumber() ?? 0 }))
        .sort((a, b) => b.avgScore - a.avgScore)
        .map((entry, index) => ({ ...entry, rank: index + 1 }));

      if (ranked.length === 0) continue;

      // Full replace, not merge: delete this pair's existing 'monthly' rows, then insert
      // the freshly computed ranking.
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
            score: new Prisma.Decimal(entry.avgScore),
            generatedAt: new Date(),
          })),
        }),
      ]);

      insertedRows += ranked.length;
    }

    console.log(`[cron] Generated ${insertedRows} leaderboard snapshot rows`);
    return insertedRows;
  } catch (err) {
    console.error("[cron] Failed to generate leaderboard snapshots:", err);
    return null;
  }
}
