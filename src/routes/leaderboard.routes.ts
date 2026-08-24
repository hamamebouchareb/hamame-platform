import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { validateQuery } from "../middleware/validate";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../lib/prisma";

// BR-12 gamification: GET /api/leaderboard — current snapshot for a faculty+year pair.
//
// Two parallel boards, discriminated by the snapshot `period` column (the model has no
// `type` column):
//   - default / ?type=score        → period 'monthly'               (score-based, produced
//     by src/jobs/generateLeaderboardSnapshots.ts)
//   - ?type=contributors           → period 'monthly_contributors'  (participation-based,
//     produced by src/jobs/generateContributorsLeaderboardSnapshots.ts)
// For the contributors board, `score` in the response semantically reads as "sessions
// completed in the last 30 days".
//
// Strict backward compatibility: with no `type` param the query, period filter, response
// shape, and ordering are EXACTLY what they were before this variant existed.
//
// Public-within-cohort by design: each row exposes the user's fullName and nothing else
// about them (no id, email, or other PII). Requires auth so only logged-in students can
// read their cohort's leaderboard.
const router = Router();

router.use(requireAuth);

// period lookup for each accepted type. The default (score) maps to the same 'monthly'
// the endpoint always used — omitting `type` is indistinguishable from passing type=score.
const PERIOD_BY_TYPE: Record<string, string> = {
  score: "monthly",
  contributors: "monthly_contributors",
};

const leaderboardQuerySchema = z.object({
  facultyId: z.string().uuid(),
  yearId: z.string().uuid(),
  type: z.enum(["score", "contributors"]).optional().default("score"),
});

async function getLeaderboard(req: Request, res: Response, next: NextFunction) {
  try {
    const { facultyId, yearId, type } = req.query as z.infer<typeof leaderboardQuerySchema>;

    const rows = await prisma.leaderboardSnapshot.findMany({
      where: { facultyId, yearId, period: PERIOD_BY_TYPE[type] },
      orderBy: { rank: "asc" },
      select: {
        rank: true,
        score: true,
        user: { select: { fullName: true } },
      },
    });

    res.status(200).json({
      leaderboard: rows.map((row) => ({
        rank: row.rank,
        score: row.score.toNumber(),
        fullName: row.user.fullName,
      })),
    });
  } catch (err) {
    next(err);
  }
}

router.get("/", validateQuery(leaderboardQuerySchema), getLeaderboard);

export default router;
