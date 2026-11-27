import { Prisma, PrismaClient } from "@prisma/client";

// Premium = an active, unexpired subscription on a paid plan. It unlocks every
// question and resource of ONE faculty-year (Subscription.facultyId/yearId).
// Grants without a stored scope (promo codes, points shop) fall back to the
// student's profile faculty/year. Free students get a daily question limit
// (plans.features.dailyQuestionLimit on the free plan), counted only on
// questions outside their Premium year.

type Client = PrismaClient | Prisma.TransactionClient;

export const FALLBACK_DAILY_QUESTION_LIMIT = 20;

export interface PremiumScope {
  subscriptionId: string;
  planName: string;
  facultyId: string | null;
  yearId: string | null;
  currentPeriodEnd: Date;
  /** Admin and super-admin: every question and resource is unlocked. */
  unrestricted?: boolean;
  /** Paid plan flag: Résidanat subscription covers all 10 Résidanat faculties. */
  allResidanatFaculties?: boolean;
}

export function parsePlanFeatures(features: Prisma.JsonValue | undefined): Record<string, unknown> | null {
  if (!features || typeof features !== "object" || Array.isArray(features)) return null;
  return features as Record<string, unknown>;
}

const UNRESTRICTED_ROLES = ["admin", "super_admin"] as const;

export async function hasUnrestrictedAccess(client: Client, userId: string): Promise<boolean> {
  const row = await client.userRole.findFirst({
    where: { userId, role: { name: { in: [...UNRESTRICTED_ROLES] } } },
    select: { userId: true },
  });
  return row !== null;
}

export async function resolvePremiumScope(client: Client, userId: string): Promise<PremiumScope | null> {
  if (await hasUnrestrictedAccess(client, userId)) {
    return {
      subscriptionId: "admin",
      planName: "Admin",
      facultyId: null,
      yearId: null,
      currentPeriodEnd: new Date("2999-01-01T00:00:00.000Z"),
      unrestricted: true,
      allResidanatFaculties: true,
    };
  }

  const subscription = await client.subscription.findFirst({
    where: {
      userId,
      status: "active",
      currentPeriodEnd: { gt: new Date() },
      plan: { priceDzd: { gt: 0 } },
    },
    orderBy: { currentPeriodEnd: "desc" },
    select: {
      id: true,
      facultyId: true,
      yearId: true,
      currentPeriodEnd: true,
      plan: { select: { name: true, features: true } },
    },
  });
  if (!subscription) return null;

  let { facultyId, yearId } = subscription;
  if (!yearId) {
    const profile = await client.user.findUnique({ where: { id: userId }, select: { facultyId: true, yearId: true } });
    facultyId = facultyId ?? profile?.facultyId ?? null;
    yearId = profile?.yearId ?? null;
  }

  const planFeatures = parsePlanFeatures(subscription.plan.features);

  return {
    subscriptionId: subscription.id,
    planName: subscription.plan.name,
    facultyId,
    yearId,
    currentPeriodEnd: subscription.currentPeriodEnd,
    allResidanatFaculties: planFeatures?.residanatAllFaculties === true,
  };
}

// Resources: year-scoped ones need the same year; faculty-wide ones the same
// faculty; global ones are covered by any scoped Premium.
export function premiumCoversResource(
  scope: PremiumScope | null,
  resource: { facultyId: string | null; yearId: string | null }
): boolean {
  if (!scope) return false;
  if (scope.unrestricted) return true;
  if (!scope.yearId) return false;
  if (resource.yearId) return resource.yearId === scope.yearId;
  if (resource.facultyId) return resource.facultyId === scope.facultyId;
  return true;
}

export interface DailyQuestionPolicy {
  limit: number;
  isUnlimited: boolean;
}

/** Pure policy resolver so unit tests can verify every override/global switch without DB. */
export function computeDailyQuestionPolicy(opts: {
  freePlanFeatures: Prisma.JsonValue | undefined;
  isAdmin?: boolean;
  userOverride?: {
    dailyQuestionLimitOverride: number | null;
    unlimitedQuestionsOverride: boolean;
  } | null;
}): DailyQuestionPolicy {
  const features = parsePlanFeatures(opts.freePlanFeatures);
  const rawPlanLimit = features?.dailyQuestionLimit;
  const planLimit =
    typeof rawPlanLimit === "number" && Number.isInteger(rawPlanLimit) && rawPlanLimit >= 0
      ? rawPlanLimit
      : FALLBACK_DAILY_QUESTION_LIMIT;
  const globalUnlimited = features?.unlimitedFreeAccess === true;
  const overrideLimit = opts.userOverride?.dailyQuestionLimitOverride;
  const limit =
    typeof overrideLimit === "number" && Number.isInteger(overrideLimit) && overrideLimit >= 0
      ? overrideLimit
      : planLimit;
  const isUnlimited =
    Boolean(opts.isAdmin) || globalUnlimited || Boolean(opts.userOverride?.unlimitedQuestionsOverride);
  return { limit, isUnlimited };
}

export async function resolveDailyQuestionPolicy(client: Client, userId?: string): Promise<DailyQuestionPolicy> {
  const freePlan = await client.plan.findFirst({ where: { name: "free", isActive: true }, select: { features: true } });
  let isAdmin = false;
  let userOverride: { dailyQuestionLimitOverride: number | null; unlimitedQuestionsOverride: boolean } | null = null;
  if (userId) {
    isAdmin = await hasUnrestrictedAccess(client, userId);
    if (!isAdmin) {
      userOverride = await client.user.findUnique({
        where: { id: userId },
        select: { dailyQuestionLimitOverride: true, unlimitedQuestionsOverride: true },
      });
    }
  }
  return computeDailyQuestionPolicy({
    freePlanFeatures: freePlan?.features,
    isAdmin,
    userOverride,
  });
}

export async function resolveDailyQuestionLimit(client: Client, userId?: string): Promise<number> {
  const policy = await resolveDailyQuestionPolicy(client, userId);
  return policy.limit;
}

export function utcDay(from: Date = new Date()): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
}

export function nextUtcDay(from: Date = new Date()): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 1));
}

export async function questionsUsedToday(client: Client, userId: string): Promise<number> {
  const row = await client.dailyQuestionUsage.findUnique({
    where: { userId_day: { userId, day: utcDay() } },
    select: { used: true },
  });
  return row?.used ?? 0;
}

export interface DailyQuestionsView {
  limit: number;
  usedToday: number;
  remaining: number;
  resetAt: string;
  isUnlimited: boolean;
}

export async function getDailyQuestionsView(client: Client, userId: string): Promise<DailyQuestionsView> {
  const { limit, isUnlimited } = await resolveDailyQuestionPolicy(client, userId);
  const usedToday = await questionsUsedToday(client, userId);
  return {
    limit,
    usedToday,
    remaining: isUnlimited ? limit : Math.max(limit - usedToday, 0),
    resetAt: nextUtcDay().toISOString(),
    isUnlimited,
  };
}
