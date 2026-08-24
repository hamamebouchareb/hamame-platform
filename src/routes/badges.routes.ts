import { NextFunction, Request, Response, Router } from "express";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../lib/prisma";

// BR-related gamification (V2): badge catalog + the caller's earned badges. Automatic
// award-on-criteria-met logic lives in src/lib/badge-awards.ts, triggered from
// sessions.routes.ts's finalizeSession (streak/session-count/accuracy criteria) — this
// file only serves the read endpoints. Admin-side catalog/manual-award endpoints live in
// admin.routes.ts.
const router = Router();

router.use(requireAuth);

// GET /api/badges — full catalog plus which badges the caller has earned and when
// (left join against the caller's UserBadge rows — unearned badges get earnedAt null).
async function getBadges(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;

    const badges = await prisma.badge.findMany({
      orderBy: { name: "asc" },
      include: {
        userBadges: { where: { userId }, select: { earnedAt: true } },
      },
    });

    res.status(200).json({
      badges: badges.map((badge) => ({
        id: badge.id,
        name: badge.name,
        criteria: badge.criteria,
        earnedAt: badge.userBadges[0]?.earnedAt ?? null,
      })),
    });
  } catch (err) {
    next(err);
  }
}

router.get("/", getBadges);

// GET /api/badges/me — just the caller's earned badges (UserBadge -> Badge), most recent
// first.
async function getMyBadges(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;

    const userBadges = await prisma.userBadge.findMany({
      where: { userId },
      orderBy: { earnedAt: "desc" },
      include: { badge: true },
    });

    res.status(200).json({
      badges: userBadges.map((entry) => ({
        id: entry.badge.id,
        name: entry.badge.name,
        criteria: entry.badge.criteria,
        earnedAt: entry.earnedAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}

router.get("/me", getMyBadges);

export default router;
