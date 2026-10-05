import { NextFunction, Request, Response, Router } from "express";
import { prisma } from "../lib/prisma";
import authRoutes from "./auth.routes";
import usersRoutes from "./users.routes";
import curriculumRoutes from "./curriculum.routes";
import questionsRoutes from "./questions.routes";
import sessionsRoutes from "./sessions.routes";
import notesRoutes from "./notes.routes";
import flashcardsRoutes from "./flashcards.routes";
import progressRoutes from "./progress.routes";
import streaksRoutes from "./streaks.routes";
import plansRoutes from "./plans.routes";
import subscriptionsRoutes from "./subscriptions.routes";
import promoCodesRoutes from "./promoCodes.routes";
import activationCodesRoutes, { adminActivationCodesRouter } from "./activationCodes.routes";
import authoringRoutes from "./authoring.routes";
import reviewRoutes from "./review.routes";
import resourcesRoutes from "./resources.routes";
import reviewsRoutes from "./reviews.routes";
import moderationRoutes from "./moderation.routes";
import instructorApplicationsRoutes from "./instructorApplications.routes";
import adminRoutes from "./admin.routes";
import leaderboardRoutes from "./leaderboard.routes";
import badgesRoutes from "./badges.routes";
import friendsRoutes from "./friends.routes";
import simulationsRoutes from "./simulations.routes";
import notificationsRoutes, { adminNotificationsRouter } from "./notifications.routes";
import pushRoutes from "./push.routes";
import aiRoutes from "./ai.routes";

// Mounts every implemented route group under /api.
//
// Deliberately NOT mounted here (still out of scope):
//   - /api/admin/ai-credits [AI credit governance admin surface]
const router = Router();

// GET /api/health — public liveness probe (no auth). Returns process uptime
// plus a cheap database check (`SELECT 1` through Prisma, 2s cap). Never
// exposes versions, env values, or row contents: the body is three fixed
// strings/numbers. 200 when the database answers, 503 otherwise.
async function getHealth(req: Request, res: Response, next: NextFunction) {
  try {
    const uptime = Math.floor(process.uptime());
    const dbOk = await Promise.race([
      prisma.$queryRaw`SELECT 1`.then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 2000)),
    ]);
    if (!dbOk) {
      res.status(503).json({ status: "degraded", uptime, database: "unreachable" });
      return;
    }
    res.status(200).json({ status: "ok", uptime, database: "ok" });
  } catch (err) {
    next(err);
  }
}

router.get("/health", getHealth);

router.use("/auth", authRoutes);
router.use("/users", usersRoutes);
router.use("/", curriculumRoutes);
router.use("/", questionsRoutes);
router.use("/sessions", sessionsRoutes);
router.use("/notes", notesRoutes);
router.use("/flashcards", flashcardsRoutes);
router.use("/progress", progressRoutes);
router.use("/streaks", streaksRoutes);
router.use("/plans", plansRoutes);
router.use("/subscriptions", subscriptionsRoutes);
router.use("/promo-codes", promoCodesRoutes);
router.use("/authoring", authoringRoutes);
router.use("/resources", resourcesRoutes);
router.use("/review", reviewRoutes);
router.use("/reviews", reviewsRoutes);
router.use("/moderation", moderationRoutes);
router.use("/instructor-applications", instructorApplicationsRoutes);
// Support Agent/Admin activation-code management. MUST be mounted before
// router.use("/admin", adminRoutes) below: Express matches prefix-wise, and
// admin.routes.ts's router-level gate is admin-only, while issuing codes is
// Support Agent OR Admin (FR-65/BR-18).
router.use("/admin/activation-codes", adminActivationCodesRouter);
router.use("/activation-codes", activationCodesRoutes);
router.use("/admin", adminRoutes);
router.use("/leaderboard", leaderboardRoutes);
router.use("/badges", badgesRoutes);
router.use("/friends", friendsRoutes);
router.use("/simulations", simulationsRoutes);
router.use("/notifications", notificationsRoutes);
router.use("/admin/notifications", adminNotificationsRouter);
router.use("/push", pushRoutes);
router.use("/ai", aiRoutes);

export default router;
