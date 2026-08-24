import { Router } from "express";
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
import authoringRoutes from "./authoring.routes";
import reviewRoutes from "./review.routes";
import reviewsRoutes from "./reviews.routes";
import moderationRoutes from "./moderation.routes";
import instructorApplicationsRoutes from "./instructorApplications.routes";
import adminRoutes from "./admin.routes";
import leaderboardRoutes from "./leaderboard.routes";
import badgesRoutes from "./badges.routes";
import friendsRoutes from "./friends.routes";
import pushRoutes from "./push.routes";
import aiRoutes from "./ai.routes";

// Mounts every implemented route group under /api.
//
// Deliberately NOT mounted here (still out of scope):
//   - /api/admin/ai-credits [AI credit governance admin surface]
const router = Router();

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
router.use("/review", reviewRoutes);
router.use("/reviews", reviewsRoutes);
router.use("/moderation", moderationRoutes);
router.use("/instructor-applications", instructorApplicationsRoutes);
router.use("/admin", adminRoutes);
router.use("/leaderboard", leaderboardRoutes);
router.use("/badges", badgesRoutes);
router.use("/friends", friendsRoutes);
router.use("/push", pushRoutes);
router.use("/ai", aiRoutes);

export default router;
