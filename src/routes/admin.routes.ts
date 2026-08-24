import { NextFunction, Request, Response, Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { validateBody, validateParams, validateQuery } from "../middleware/validate";
import { jsonObject, uuidParam } from "../lib/common-schemas";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { expireSubscriptions } from "../jobs/expireSubscriptions";
import { unsuspendUsers } from "../jobs/unsuspendUsers";
import { generateLeaderboardSnapshots } from "../jobs/generateLeaderboardSnapshots";
import { generateContributorsLeaderboardSnapshots } from "../jobs/generateContributorsLeaderboardSnapshots";
import { sendDailyPushReminders } from "../jobs/sendDailyPushReminders";
import { awardBadgeIdempotent, notifyBadgeEarned } from "../lib/badge-awards";

// ============================================================================
// SECURITY GAP CLOSED — role enforcement is now in place on this router.
//
// This router previously ran only `requireAuth` (verifies a valid Bearer token exists —
// i.e. "is this a logged-in user?") with NO check on WHICH logged-in user it was or what
// they were allowed to do. Concretely, ANY authenticated account — including a brand
// new student_free signup — could call these endpoints to suspend/restrict other users'
// accounts, flip a faculty's public rollout status, reconfigure subscription
// plans/pricing, or read business-wide analytics.
//
// That gap is closed as of this task: every route below now also runs
// `requireRole("admin", "super_admin")` (src/middleware/requireRole.ts) after
// `requireAuth`, so only accounts actually holding one of those roles (via
// prisma/schema.prisma's Role/UserRole tables) can reach these handlers. This comment
// is kept (rather than deleted) as a record of the gap that existed and was fixed here.
// ============================================================================

const router = Router();
router.use(requireAuth);

const requireAdmin = requireRole("admin", "super_admin");

// Subscription/Plan Decimal fields serialize to JSON strings unless normalized — mirrors
// serializeDecimal/serializePlan in src/routes/subscriptions.routes.ts (not exported from
// there, so duplicated here).
function serializeDecimal(value: { toNumber: () => number } | null): number | null {
  return value === null ? null : value.toNumber();
}

function serializePlan(plan: { priceDzd: { toNumber: () => number } | null }) {
  return { ...plan, priceDzd: serializeDecimal(plan.priceDzd) };
}

// GET /api/admin/analytics — business-wide snapshot for admin dashboards.
//
// Exposes potentially sensitive, business-wide data (user counts, revenue-adjacent
// subscription breakdowns, content pipeline stats) — role-gated to Admins/Super Admins
// via requireRole below (see the top-of-file comment).
async function getAdminAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    // Excludes 'deleted' accounts: a soft-deleted user (see DELETE /api/users/me) is no
    // longer a real user of the product, so counting them as part of "total users" would
    // overstate the platform's actual user base.
    const totalUsersPromise = prisma.user.count({ where: { status: { not: "deleted" } } });

    const activeSubscriptionGroupsPromise = prisma.subscription.groupBy({
      by: ["planId"],
      where: { status: "active" },
      _count: true,
    });

    const totalCompletedStudySessionsPromise = prisma.studySession.count({
      where: { completedAt: { not: null } },
    });

    // Literal reading of "approved lessons" = LessonVersion rows with status 'approved'
    // (not distinct Lessons with a currentVersionId set) — the two can diverge slightly
    // since nothing in this codebase yet demotes a lesson's older approved versions to
    // 'archived' when a newer version is approved (see review.routes.ts's approveContent),
    // so a lesson with multiple historically-approved versions is counted once per
    // version here, not once per lesson.
    const totalApprovedLessonsPromise = prisma.lessonVersion.count({ where: { status: "approved" } });

    const totalApprovedQuestionsPromise = prisma.question.count({ where: { status: "approved" } });

    const openReportCountPromise = prisma.report.count({ where: { status: "open" } });

    const facultiesPromise = prisma.faculty.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    const [
      totalUsers,
      activeSubscriptionGroups,
      totalCompletedStudySessions,
      totalApprovedLessons,
      totalApprovedQuestions,
      openReportCount,
      faculties,
    ] = await Promise.all([
      totalUsersPromise,
      activeSubscriptionGroupsPromise,
      totalCompletedStudySessionsPromise,
      totalApprovedLessonsPromise,
      totalApprovedQuestionsPromise,
      openReportCountPromise,
      facultiesPromise,
    ]);

    // Subscription.groupBy only returns planId, not the plan's name, so a second batched
    // lookup resolves the names actually used (never one query per subscription/plan).
    const planIds = activeSubscriptionGroups.map((group) => group.planId);
    const plans = await prisma.plan.findMany({ where: { id: { in: planIds } }, select: { id: true, name: true } });
    const planNameById = new Map(plans.map((plan) => [plan.id, plan.name]));

    const activeSubscriptionsByPlan: Record<string, number> = {};
    for (const group of activeSubscriptionGroups) {
      const planName = planNameById.get(group.planId) ?? group.planId;
      activeSubscriptionsByPlan[planName] = group._count;
    }

    // Faculties are a small, bounded set (per docs/hamame_database_schema.md, this is
    // meant to stay faculty-agnostic but not high-cardinality), and Lesson/Question don't
    // carry a facultyId directly — they only reach it via unit -> module -> year ->
    // faculty. A single grouped Prisma query across that whole chain for two different
    // models isn't expressible without raw SQL, so this runs 2 queries per faculty
    // (in parallel) instead of one query per faculty per model in a serial loop, per
    // BR-15 rollout-gating needs.
    const facultyContentCoverage = await Promise.all(
      faculties.map(async (faculty) => {
        const [approvedLessonCount, approvedQuestionCount] = await Promise.all([
          prisma.lessonVersion.count({
            where: {
              status: "approved",
              lesson: { unit: { module: { year: { facultyId: faculty.id } } } },
            },
          }),
          prisma.question.count({
            where: {
              status: "approved",
              unit: { module: { year: { facultyId: faculty.id } } },
            },
          }),
        ]);
        return {
          facultyId: faculty.id,
          facultyName: faculty.name,
          approvedLessonCount,
          approvedQuestionCount,
        };
      })
    );

    res.status(200).json({
      totalUsers,
      activeSubscriptionsByPlan,
      totalCompletedStudySessions,
      totalApprovedLessons,
      totalApprovedQuestions,
      openReportCount,
      facultyContentCoverage,
    });
  } catch (err) {
    next(err);
  }
}

router.get("/analytics", requireAdmin, getAdminAnalytics);

const rolloutStatusSchema = z.object({
  rolloutStatus: z.enum(["planned", "beta", "live"]),
});

// PUT /api/admin/faculties/:id/rollout-status — FR-64, BR-15.
//
// Can flip a faculty's public visibility (curriculum.routes.ts only shows
// 'beta'/'live') — role-gated to Admins/Super Admins via requireRole below (see the
// top-of-file comment).
async function setFacultyRolloutStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { rolloutStatus } = req.body as z.infer<typeof rolloutStatusSchema>;

    const faculty = await prisma.faculty.findUnique({ where: { id } });
    if (!faculty) {
      throw new ApiError(404, "FACULTY_NOT_FOUND", "No faculty exists with this id.");
    }

    const updated = await prisma.faculty.update({ where: { id }, data: { rolloutStatus } });

    res.status(200).json({ faculty: updated });
  } catch (err) {
    next(err);
  }
}

router.put(
  "/faculties/:id/rollout-status",
  requireAdmin,
  validateParams(uuidParam("id")),
  validateBody(rolloutStatusSchema),
  setFacultyRolloutStatus
);

const updatePlanSchema = z.object({
  name: z.string().min(1).optional(),
  priceDzd: z.number().nonnegative().nullable().optional(),
  billingPeriod: z.enum(["monthly", "yearly"]).nullable().optional(),
  features: jsonObject.optional(),
  isActive: z.boolean().optional(),
});

// PUT /api/admin/plans/:id — BR-1, BR-6 to BR-9 monetization config.
//
// Can reconfigure pricing/plan features platform-wide — role-gated to Admins/Super
// Admins via requireRole below (see the top-of-file comment).
async function updatePlan(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { name, priceDzd, billingPeriod, features, isActive } = req.body as z.infer<typeof updatePlanSchema>;

    const plan = await prisma.plan.findUnique({ where: { id } });
    if (!plan) {
      throw new ApiError(404, "PLAN_NOT_FOUND", "No plan exists with this id.");
    }

    // Only fields actually present in the body are updated — Prisma treats an explicit
    // `undefined` the same as "not provided", so omitted optional fields are simply
    // passed through untouched. Fields validated as nullable (priceDzd, billingPeriod)
    // can still be deliberately reset to null this way, distinct from being omitted.
    const updated = await prisma.plan.update({
      where: { id },
      data: {
        name,
        priceDzd,
        billingPeriod,
        features: features as Prisma.InputJsonValue | undefined,
        isActive,
      },
    });

    res.status(200).json({ plan: serializePlan(updated) });
  } catch (err) {
    next(err);
  }
}

router.put(
  "/plans/:id",
  requireAdmin,
  validateParams(uuidParam("id")),
  validateBody(updatePlanSchema),
  updatePlan
);

// PromoCode.type is a plain String in the schema ('referral' | 'discount') — validate the
// known values here so junk types never reach the DB.
const promoCodeType = z.enum(["referral", "discount"]);

// PromoCode.value is JsonB — the schema stores the grant configuration in it (there is no
// dedicated grantsDays column). POST /api/promo-codes/redeem reads value.grantsDays to
// extend the user's premium Subscription, so creation REQUIRES a positive-integer
// grantsDays. benefitType is optional metadata; .passthrough() keeps legacy payloads like
// { "type": "discount", "amountDzd": 500 } valid.
const promoCodeValueSchema = z
  .object({
    grantsDays: z.number().int().min(1),
    benefitType: z.string().optional(),
  })
  .passthrough();

const createPromoCodeSchema = z.object({
  code: z.string().min(1),
  type: promoCodeType,
  value: promoCodeValueSchema,
  maxUsesPerAccount: z.number().int().min(1).optional().default(1),
  expiresAt: z.coerce.date().optional(),
});

// POST /api/admin/promo-codes — create a promo code (V2 monetization).
//
// Codes are stored normalized to UPPERCASE (see handler below) so the @unique code column
// is case-insensitive in practice: create and redeem both normalize before
// findUnique, so "Welcome30" and "welcome30" can never collide or bypass the check.
// `value` MUST contain grantsDays (positive integer) — that is how many days of Premium
// the code grants when redeemed. `maxUsesPerAccount` defaults to 1 (BR-16); there is no
// global maxUses column, so codes are globally unlimited by design. `expiresAt` accepts an
// ISO date string and is stored as a timestamp. Role-gated to Admins/Super Admins via
// requireRole below (see the top-of-file comment).
async function createPromoCode(req: Request, res: Response, next: NextFunction) {
  try {
    const { code, type, value, maxUsesPerAccount, expiresAt } = req.body as z.infer<
      typeof createPromoCodeSchema
    >;

    const normalizedCode = code.trim().toUpperCase();

    const existing = await prisma.promoCode.findUnique({ where: { code: normalizedCode } });
    if (existing) {
      throw new ApiError(409, "PROMO_CODE_ALREADY_EXISTS", "A promo code with this code already exists.");
    }

    const promoCode = await prisma.promoCode.create({
      data: {
        code: normalizedCode,
        type,
        value: value as Prisma.InputJsonValue,
        maxUsesPerAccount,
        expiresAt,
      },
    });

    res.status(201).json({ promoCode });
  } catch (err) {
    next(err);
  }
}

router.post("/promo-codes", requireAdmin, validateBody(createPromoCodeSchema), createPromoCode);

// GET /api/admin/promo-codes — list all promo codes with redemption counts.
//
// Two sequential queries (all codes, then one grouped aggregate across all redemptions) —
// no per-code count loop and no Promise.all, respecting the known pooler concurrency
// limit (~10 connections).
async function listPromoCodes(req: Request, res: Response, next: NextFunction) {
  try {
    const promoCodes = await prisma.promoCode.findMany({ orderBy: { code: "asc" } });
    const counts = await prisma.promoCodeRedemption.groupBy({
      by: ["promoCodeId"],
      _count: { _all: true },
    });
    const redemptionCounts = new Map(counts.map((row) => [row.promoCodeId, row._count._all]));

    res.status(200).json({
      promoCodes: promoCodes.map((code) => ({
        ...code,
        redemptionCount: redemptionCounts.get(code.id) ?? 0,
      })),
    });
  } catch (err) {
    next(err);
  }
}

router.get("/promo-codes", requireAdmin, listPromoCodes);

// PATCH /api/admin/promo-codes/:id — update expiresAt only.
//
// `code` is immutable after creation and there is no isActive column (a code is "active"
// while unexpired), so expiresAt is the only editable field. Sending null clears the
// expiry; omitting the field leaves it unchanged. Role-gated via requireRole below (see
// the top-of-file comment).
const updatePromoCodeSchema = z.object({
  expiresAt: z.coerce.date().nullish(),
});

async function updatePromoCode(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { expiresAt } = req.body as z.infer<typeof updatePromoCodeSchema>;

    const promoCode = await prisma.promoCode.findUnique({ where: { id } });
    if (!promoCode) {
      throw new ApiError(404, "PROMO_CODE_NOT_FOUND", "No promo code exists with this id.");
    }

    const updated = await prisma.promoCode.update({
      where: { id },
      data: { ...(expiresAt === undefined ? {} : { expiresAt }) },
    });

    res.status(200).json({ promoCode: updated });
  } catch (err) {
    next(err);
  }
}

router.patch(
  "/promo-codes/:id",
  requireAdmin,
  validateParams(uuidParam("id")),
  validateBody(updatePromoCodeSchema),
  updatePromoCode
);

const createBadgeSchema = z.object({
  name: z.string().min(1),
  criteria: jsonObject,
});

// POST /api/admin/badges — create a badge in the catalog (V2 gamification).
//
// Catalog management, not awarding (that's POST /api/admin/users/:id/badges below).
// `criteria` is any plain JSON object (e.g. { "type": "streak", "days": 30 }) — the
// shape is a frontend/definition concern, this only validates it's an object. Role-gated
// to Admins/Super Admins via requireRole below (see the top-of-file comment).
async function createBadge(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, criteria } = req.body as z.infer<typeof createBadgeSchema>;

    const badge = await prisma.badge.create({
      data: { name, criteria: criteria as Prisma.InputJsonValue },
    });

    res.status(201).json({ badge });
  } catch (err) {
    next(err);
  }
}

router.post("/badges", requireAdmin, validateBody(createBadgeSchema), createBadge);

// POST /api/admin/jobs/expire-subscriptions — BR-7 manual trigger.
//
// Exposes the exact same expireSubscriptions() that the node-cron daily job in
// src/server.ts runs, so lapsed 'active' subscriptions can be repaired on demand instead
// of waiting for the next 03:00 tick (or the boot-time run). No business logic lives
// here — it's purely a manual invocation of that function for testing. Role-gated to
// Admins/Super Admins via requireRole below (see the top-of-file comment).
async function runExpireSubscriptionsJob(req: Request, res: Response, next: NextFunction) {
  try {
    const expiredSubscriptions = await expireSubscriptions();
    res.status(200).json({ message: "Job executed", expiredSubscriptions });
  } catch (err) {
    next(err);
  }
}

router.post("/jobs/expire-subscriptions", requireAdmin, runExpireSubscriptionsJob);

// POST /api/admin/jobs/unsuspend-users — time-based unsuspension manual trigger.
//
// Exposes the exact same unsuspendUsers() that the node-cron daily job in src/server.ts
// runs, so users whose suspendedUntil has passed can be lifted on demand instead of
// waiting for the next 03:00 tick (or the boot-time run). No business logic lives here —
// it's purely a manual invocation of that function for testing. Role-gated to
// Admins/Super Admins via requireRole below (see the top-of-file comment).
async function runUnsuspendUsersJob(req: Request, res: Response, next: NextFunction) {
  try {
    const unsuspendedUsers = await unsuspendUsers();
    res.status(200).json({ message: "Job executed", unsuspendedUsers });
  } catch (err) {
    next(err);
  }
}

router.post("/jobs/unsuspend-users", requireAdmin, runUnsuspendUsersJob);

// POST /api/admin/jobs/generate-leaderboard — BR-12 manual trigger.
//
// Exposes the exact same generateLeaderboardSnapshots() that the node-cron daily job in
// src/server.ts runs, so a stale leaderboard can be rebuilt on demand instead of waiting
// for the next 03:00 tick (or the boot-time run). No business logic lives here — it's
// purely a manual invocation of that function for testing. Role-gated to Admins/Super
// Admins via requireRole below (see the top-of-file comment).
async function runGenerateLeaderboardJob(req: Request, res: Response, next: NextFunction) {
  try {
    const insertedRows = await generateLeaderboardSnapshots();
    res.status(200).json({ message: "Job executed", insertedRows });
  } catch (err) {
    next(err);
  }
}

router.post("/jobs/generate-leaderboard", requireAdmin, runGenerateLeaderboardJob);

// POST /api/admin/jobs/generate-contributors-leaderboard — BR-12 manual trigger for the
// participation-based board.
//
// Same pattern as runGenerateLeaderboardJob: a pure manual invocation of the same
// generateContributorsLeaderboardSnapshots() the node-cron daily job in src/server.ts
// runs, so a stale contributors board can be rebuilt on demand. Role-gated to
// Admins/Super Admins via requireRole below (see the top-of-file comment).
async function runGenerateContributorsLeaderboardJob(req: Request, res: Response, next: NextFunction) {
  try {
    const insertedRows = await generateContributorsLeaderboardSnapshots();
    res.status(200).json({ message: "Job executed", insertedRows });
  } catch (err) {
    next(err);
  }
}

router.post("/jobs/generate-contributors-leaderboard", requireAdmin, runGenerateContributorsLeaderboardJob);

// POST /api/admin/jobs/send-daily-push-reminders — push notifications manual trigger.
//
// Exposes the exact same sendDailyPushReminders() that the node-cron job in
// src/server.ts runs at 19:00 UTC daily (deliberately NOT run at boot — see that job's
// doc comment). No business logic lives here — it's purely a manual invocation for
// testing. Role-gated to Admins/Super Admins via requireRole below (see the top-of-file
// comment).
async function runSendDailyPushRemindersJob(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await sendDailyPushReminders();
    res.status(200).json({ message: "Job executed", result });
  } catch (err) {
    next(err);
  }
}

router.post("/jobs/send-daily-push-reminders", requireAdmin, runSendDailyPushRemindersJob);

// ============================================================================
// Admin role management — POST/DELETE /api/admin/users/:id/roles(/:roleName).
//
// Roles are otherwise seed-script-only (prisma/seed.ts ROLE_NAMES), so these are the only
// endpoints that promote/demote a user's roles without direct DB access. Both routes are
// role-gated to Admins/Super Admins via requireRole below (see the top-of-file comment),
// and both are idempotent: granting an already-held role or revoking a never-held one
// returns 200 with the unchanged list rather than erroring.
// ============================================================================

// Authoritative list from prisma/seed.ts ROLE_NAMES (mirrors the Role.name comment in
// prisma/schema.prisma). Single source shared by the grant body and the revoke path
// param so the two endpoints can never drift apart.
const roleNameSchema = z.enum([
  "guest",
  "student_free",
  "student_premium",
  "instructor",
  "academic_reviewer",
  "moderator",
  "support_agent",
  "institution_admin",
  "admin",
  "super_admin",
]);

const grantRoleSchema = z.object({ roleName: roleNameSchema });

const revokeRoleParamsSchema = z.object({
  id: z.string().uuid(),
  roleName: roleNameSchema,
});

// Current role names for a user (join userRoles -> role, alphabetical). Both endpoints
// respond with this after mutating so the caller always sees the authoritative state.
async function getRoleNames(userId: string): Promise<string[]> {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: { role: true },
    orderBy: { role: { name: "asc" } },
  });
  return userRoles.map((userRole) => userRole.role.name);
}

// Shared role-grant helper: grants `roleName` to `userId` unless already held —
// idempotent, no-op when the user already has the role. Used by the POST
// /users/:id/roles endpoint AND the instructor-application approve flow (which grants
// inside its status-update transaction), so the lookup-or-create business rule lives in
// exactly one place. `db` defaults to the global client but accepts a transaction client.
// Returns true when the row was created, false when the role was already granted.
async function grantRoleByName(
  db: Prisma.TransactionClient | typeof prisma,
  userId: string,
  roleName: string
): Promise<boolean> {
  const role = await db.role.findUnique({ where: { name: roleName } });
  if (!role) {
    // Shouldn't happen post-seed (name is @unique and ROLE_NAMES is seeded), but a
    // missing row would otherwise surface as a confusing FK error on create.
    throw new ApiError(404, "ROLE_NOT_FOUND", `No role named '${roleName}' exists.`);
  }

  const existing = await db.userRole.findUnique({
    where: { userId_roleId: { userId, roleId: role.id } },
  });
  if (existing) {
    return false;
  }

  await db.userRole.create({ data: { userId, roleId: role.id } });
  return true;
}

// POST /api/admin/users/:id/roles — grant a role.
async function grantRole(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { roleName } = req.body as z.infer<typeof grantRoleSchema>;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new ApiError(404, "USER_NOT_FOUND", "No user exists with this id.");
    }

    const granted = await grantRoleByName(prisma, id, roleName);

    const roles = await getRoleNames(id);
    // granted=true → role was just added (201); granted=false → already held (200).
    res.status(granted ? 201 : 200).json({ user: { id, roles } });
  } catch (err) {
    next(err);
  }
}

router.post(
  "/users/:id/roles",
  requireAdmin,
  validateParams(uuidParam("id")),
  validateBody(grantRoleSchema),
  grantRole
);

// DELETE /api/admin/users/:id/roles/:roleName — revoke a role.
async function revokeRole(req: Request, res: Response, next: NextFunction) {
  try {
    const { id, roleName } = req.params;

    // Self-lockout protection: an admin must not be able to strip their own gate.
    // Removing another user's admin/super_admin, or your own non-admin roles, stays fine.
    if (req.auth!.userId === id && (roleName === "admin" || roleName === "super_admin")) {
      throw new ApiError(
        400,
        "CANNOT_SELF_REVOKE_ADMIN",
        "You cannot remove your own admin or super_admin role via this endpoint."
      );
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new ApiError(404, "USER_NOT_FOUND", "No user exists with this id.");
    }

    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) {
      throw new ApiError(404, "ROLE_NOT_FOUND", `No role named '${roleName}' exists.`);
    }

    const existing = await prisma.userRole.findUnique({
      where: { userId_roleId: { userId: id, roleId: role.id } },
    });
    if (!existing) {
      // Idempotent success: the user doesn't hold this role, so nothing to remove.
      const roles = await getRoleNames(id);
      return res.status(200).json({ user: { id, roles } });
    }

    await prisma.userRole.delete({ where: { userId_roleId: { userId: id, roleId: role.id } } });

    const roles = await getRoleNames(id);
    res.status(200).json({ user: { id, roles } });
  } catch (err) {
    next(err);
  }
}

router.delete(
  "/users/:id/roles/:roleName",
  requireAdmin,
  validateParams(revokeRoleParamsSchema),
  revokeRole
);

// ============================================================================
// Admin review of instructor applications — GET list, POST approve/reject.
//
// These close the loop on the self-service application flow (instructorApplications
// .routes.ts): a regular user submits, an admin reviews here. Approving flips the
// application to 'approved' AND grants the 'instructor' role in the same transaction —
// reusing grantRoleByName above, so the role-grant logic is not duplicated. All three
// routes are role-gated to Admins/Super Admins via requireRole below (see the
// top-of-file comment).
// ============================================================================

const instructorApplicationStatusSchema = z.enum(["pending", "approved", "rejected"]);

const instructorApplicationListQuerySchema = z.object({
  status: instructorApplicationStatusSchema.optional().default("pending"),
});

// Basic applicant info only — deliberately a small explicit select (id/email/fullName)
// rather than a full safe-user profile; there's no richer profile worth exposing here.
const applicantSelect = {
  id: true,
  email: true,
  fullName: true,
} as const;

// GET /api/admin/instructor-applications?status=pending — list, newest first.
async function listInstructorApplications(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = req.query as unknown as z.infer<typeof instructorApplicationListQuerySchema>;

    const applications = await prisma.instructorApplication.findMany({
      where: { status },
      orderBy: { createdAt: "desc" },
      include: { user: { select: applicantSelect } },
    });

    res.status(200).json({ applications });
  } catch (err) {
    next(err);
  }
}

router.get(
  "/instructor-applications",
  requireAdmin,
  validateQuery(instructorApplicationListQuerySchema),
  listInstructorApplications
);

// POST /api/admin/instructor-applications/:id/approve — grant the role.
async function approveInstructorApplication(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const reviewerId = req.auth!.userId;

    const application = await prisma.instructorApplication.findUnique({ where: { id } });
    if (!application) {
      throw new ApiError(404, "INSTRUCTOR_APPLICATION_NOT_FOUND", "No instructor application exists with this id.");
    }
    if (application.status !== "pending") {
      throw new ApiError(
        409,
        "INVALID_STATUS",
        `This application cannot be approved from status '${application.status}'.`
      );
    }

    // Grant the 'instructor' role in the same transaction as the status flip. grantRoleByName
    // is idempotent, so even an already-instructor applicant (edge case) approves cleanly.
    const updated = await prisma.$transaction(async (tx) => {
      await grantRoleByName(tx, application.userId, "instructor");
      return tx.instructorApplication.update({
        where: { id },
        data: { status: "approved", reviewedBy: reviewerId, reviewedAt: new Date() },
      });
    });

    res.status(200).json({ application: updated });
  } catch (err) {
    next(err);
  }
}

router.post(
  "/instructor-applications/:id/approve",
  requireAdmin,
  validateParams(uuidParam("id")),
  approveInstructorApplication
);

// POST /api/admin/instructor-applications/:id/reject — mandatory review comment, same
// pattern as the content-review reject endpoints (review.routes.ts).
const rejectApplicationSchema = z.object({
  reviewComment: z.string().min(1),
});

async function rejectInstructorApplication(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { reviewComment } = req.body as z.infer<typeof rejectApplicationSchema>;
    const reviewerId = req.auth!.userId;

    const application = await prisma.instructorApplication.findUnique({ where: { id } });
    if (!application) {
      throw new ApiError(404, "INSTRUCTOR_APPLICATION_NOT_FOUND", "No instructor application exists with this id.");
    }
    if (application.status !== "pending") {
      throw new ApiError(
        409,
        "INVALID_STATUS",
        `This application cannot be rejected from status '${application.status}'.`
      );
    }

    const updated = await prisma.instructorApplication.update({
      where: { id },
      data: { status: "rejected", reviewedBy: reviewerId, reviewedAt: new Date(), reviewComment },
    });

    res.status(200).json({ application: updated });
  } catch (err) {
    next(err);
  }
}

router.post(
  "/instructor-applications/:id/reject",
  requireAdmin,
  validateParams(uuidParam("id")),
  validateBody(rejectApplicationSchema),
  rejectInstructorApplication
);

const awardBadgeSchema = z.object({ badgeId: z.string().uuid() });

// POST /api/admin/users/:id/badges — manually award a badge to a user.
//
// Idempotent, mirroring the role-grant endpoints: an already-awarded badge returns the
// existing UserBadge row as-is (200) instead of erroring. FK guards on both user and
// badge so a bad id surfaces as a clean 404 rather than a confusing P2003 FK error on
// create. Role-gated to Admins/Super Admins via requireRole below (see the top-of-file
// comment).
//
// Uses the same awardBadgeIdempotent primitive as the automatic award trigger in
// src/lib/badge-awards.ts (finalizeSession, sessions.routes.ts), so a manual award racing
// an automatic one for the same (user, badge) can't produce inconsistent 200-vs-201
// semantics between the two paths — both resolve through the identical
// `ON CONFLICT DO NOTHING` insert.
async function awardBadge(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { badgeId } = req.body as z.infer<typeof awardBadgeSchema>;

    const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) {
      throw new ApiError(404, "USER_NOT_FOUND", "No user exists with this id.");
    }

    const badge = await prisma.badge.findUnique({ where: { id: badgeId }, select: { id: true } });
    if (!badge) {
      throw new ApiError(404, "BADGE_NOT_FOUND", "No badge exists with this id.");
    }

    const { userBadge, created } = await awardBadgeIdempotent(prisma, id, badgeId);
    // Same badge-earned push hook as the automatic trigger (sessions.routes.ts) — see
    // notifyBadgeEarned's doc comment in src/lib/badge-awards.ts for why both call sites
    // trigger it themselves rather than it living inside awardBadgeIdempotent. Only on
    // `created`, matching the same "no duplicate award" semantics as the 200-vs-201 above
    // — a re-award of an already-earned badge must not re-notify.
    if (created) {
      await notifyBadgeEarned(prisma, id, badgeId);
    }
    res.status(created ? 201 : 200).json({ userBadge });
  } catch (err) {
    next(err);
  }
}

router.post(
  "/users/:id/badges",
  requireAdmin,
  validateParams(uuidParam("id")),
  validateBody(awardBadgeSchema),
  awardBadge
);

export default router;
