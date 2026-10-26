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
}

export async function resolvePremiumScope(client: Client, userId: string): Promise<PremiumScope | null> {
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
      plan: { select: { name: true } },
    },
  });
  if (!subscription) return null;

  let { facultyId, yearId } = subscription;
  if (!yearId) {
    const profile = await client.user.findUnique({ where: { id: userId }, select: { facultyId: true, yearId: true } });
    facultyId = facultyId ?? profile?.facultyId ?? null;
    yearId = profile?.yearId ?? null;
  }

  return {
    subscriptionId: subscription.id,
    planName: subscription.plan.name,
    facultyId,
    yearId,
    currentPeriodEnd: subscription.currentPeriodEnd,
  };
}

// Resources: year-scoped ones need the same year; faculty-wide ones the same
// faculty; global ones are covered by any scoped Premium.
export function premiumCoversResource(
  scope: PremiumScope | null,
  resource: { facultyId: string | null; yearId: string | null }
): boolean {
  if (!scope || !scope.yearId) return false;
  if (resource.yearId) return resource.yearId === scope.yearId;
  if (resource.facultyId) return resource.facultyId === scope.facultyId;
  return true;
}

export async function resolveDailyQuestionLimit(client: Client): Promise<number> {
  const freePlan = await client.plan.findFirst({ where: { name: "free", isActive: true }, select: { features: true } });
  const features = freePlan?.features;
  if (features && typeof features === "object" && !Array.isArray(features)) {
    const value = (features as Record<string, unknown>).dailyQuestionLimit;
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  }
  return FALLBACK_DAILY_QUESTION_LIMIT;
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
}

export async function getDailyQuestionsView(client: Client, userId: string): Promise<DailyQuestionsView> {
  const limit = await resolveDailyQuestionLimit(client);
  const usedToday = await questionsUsedToday(client, userId);
  return { limit, usedToday, remaining: Math.max(limit - usedToday, 0), resetAt: nextUtcDay().toISOString() };
}
