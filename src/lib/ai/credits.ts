import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

// BR-6 AI credit governance — the first real user-facing consumer of ai_credit_balances
// (contextual hints, FR-29). Everything here is shared infrastructure: any future AI
// feature (chat, note-maker, answer-locator, audio) consumes the SAME per-user daily
// pool rather than getting its own counter, which is why the allowance keys live under a
// generic `aiCredits` object in plans.features and not under a hint-specific key.
//
// Allowances are ADMIN-CONFIGURABLE CONFIG, not product constants (BR-6, PRD FR-64):
// they are read from plans.features.aiCredits, editable live via
// PUT /api/admin/plans/:id. Nothing in this file hardcodes a tier's limit except the
// last-resort fallback below.

// Used only when the resolved plan has no usable aiCredits config at all — e.g. an admin
// edits features and drops the key, or a user has no subscription and the seeded 'free'
// plan row is missing. Deliberately the conservative free-tier number: a config mistake
// must degrade to "few credits", never to "unlimited".
export const FALLBACK_AI_CREDITS = { dailyAllowance: 5, monthlyAllowance: 150 } as const;

export interface AiCreditAllowances {
  dailyAllowance: number;
  monthlyAllowance: number;
}

// Tolerant on purpose: features is free-form JSONB that predates this feature and is
// admin-editable, so an unrelated shape must never throw — it falls back instead.
const aiCreditsSchema = z.object({
  dailyAllowance: z.number().int().min(0),
  monthlyAllowance: z.number().int().min(0),
});

export function parseAiCreditAllowances(features: Prisma.JsonValue | undefined): AiCreditAllowances | null {
  if (!features || typeof features !== "object" || Array.isArray(features)) {
    return null;
  }
  const parsed = aiCreditsSchema.safeParse((features as Record<string, unknown>).aiCredits);
  return parsed.success ? parsed.data : null;
}

// Resolves the allowances that apply to this user right now: their active subscription's
// plan if they have one, otherwise the seeded 'free' plan (a user with no subscription row
// is implicitly on the free tier — same assumption as GET /api/subscriptions/me).
//
// Sequential awaits, never Promise.all: the Supabase session pooler throws intermittent
// P1001 under ~10+ concurrent Prisma queries (handoff Section 1).
export async function resolveAiCreditAllowances(
  client: PrismaClient,
  userId: string
): Promise<AiCreditAllowances> {
  const subscription = await client.subscription.findFirst({
    where: { userId, status: "active" },
    orderBy: { startedAt: "desc" },
    select: { plan: { select: { features: true } } },
  });

  const subscribedAllowances = parseAiCreditAllowances(subscription?.plan.features);
  if (subscribedAllowances) {
    return subscribedAllowances;
  }

  const freePlan = await client.plan.findFirst({
    where: { name: "free", isActive: true },
    select: { features: true },
  });

  return parseAiCreditAllowances(freePlan?.features) ?? { ...FALLBACK_AI_CREDITS };
}

// Creates the balance row on first AI use and keeps the cached allowance columns in sync
// with the user's current plan (a student who upgrades mid-day gets the premium daily cap
// immediately). Counters are deliberately NOT touched here — only the caps — so an upgrade
// can never be used to wipe today's usage.
export async function ensureAiCreditBalance(
  client: PrismaClient,
  userId: string,
  allowances: AiCreditAllowances
): Promise<void> {
  await client.aiCreditBalance.upsert({
    where: { userId },
    update: { dailyAllowance: allowances.dailyAllowance, monthlyAllowance: allowances.monthlyAllowance },
    create: {
      userId,
      dailyAllowance: allowances.dailyAllowance,
      monthlyAllowance: allowances.monthlyAllowance,
      // Day-granularity in UTC, matching Streak.lastActiveDate's convention.
      resetAt: nextUtcMidnight(new Date()),
    },
  });
}

export function nextUtcMidnight(from: Date): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 1));
}

export interface AiCreditReservation {
  reserved: boolean;
  usedToday: number;
  dailyAllowance: number;
  remainingToday: number;
  // The reset boundary observed at reservation time. Passed back to refundAiCredit so a
  // refund can never cross a day boundary and eat a credit from a fresh day.
  resetAt: Date;
}

interface ReserveRow {
  used_today: number;
  daily_allowance: number;
  reset_at: Date;
}

// RESERVE-THEN-GENERATE: the credit is taken BEFORE the (billable, externally-visible)
// model call, and refunded if that call fails. The inverse order — generate, then debit —
// would hand out free unlimited hints to any client that retries after a debit failure.
//
// One single atomic UPDATE does three things that must not be separable:
//   1. the lazy daily reset (used_today -> 0 once reset_at has passed),
//   2. the allowance check,
//   3. the increment,
// so two concurrent requests on a student's last credit can never both succeed. A
// read-then-write version of this is exactly the race that would allow it.
//
// The daily reset is lazy (on next use) rather than a cron job on purpose: it needs no
// scheduled infrastructure, it can't drift for inactive users, and it is directly
// testable by backdating reset_at.
//
// used_this_month is maintained but NOT enforced in v1 (the confirmed decision is a
// daily 5/30 cap). It resets when the crossed day boundary lands in a new month:
// reset_at - 1 day is by construction the day the counters were last valid for.
export async function reserveAiCredit(client: PrismaClient, userId: string): Promise<AiCreditReservation> {
  const rows = await client.$queryRaw<ReserveRow[]>`
    UPDATE "ai_credit_balances" SET
      "used_today" = CASE WHEN "reset_at" <= now() THEN 1 ELSE "used_today" + 1 END,
      "used_this_month" = CASE
          WHEN "reset_at" <= now()
           AND date_trunc('month', "reset_at" - interval '1 day') <> date_trunc('month', now())
          THEN 1
          ELSE "used_this_month" + 1
        END,
      "reset_at" = CASE
          WHEN "reset_at" <= now()
          THEN (date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day') AT TIME ZONE 'UTC'
          ELSE "reset_at"
        END
    WHERE "user_id" = ${userId}::uuid
      AND (CASE WHEN "reset_at" <= now() THEN 0 ELSE "used_today" END) < "daily_allowance"
    RETURNING "used_today", "daily_allowance", "reset_at"`;

  const row = rows[0];
  if (row) {
    return {
      reserved: true,
      usedToday: row.used_today,
      dailyAllowance: row.daily_allowance,
      remainingToday: Math.max(row.daily_allowance - row.used_today, 0),
      resetAt: row.reset_at,
    };
  }

  // Zero rows updated means the allowance is exhausted (the row itself is guaranteed to
  // exist — ensureAiCreditBalance runs first). Re-read purely to report an accurate
  // balance and reset time in the 429 response.
  const balance = await client.aiCreditBalance.findUnique({ where: { userId } });
  return {
    reserved: false,
    usedToday: balance?.usedToday ?? 0,
    dailyAllowance: balance?.dailyAllowance ?? 0,
    remainingToday: 0,
    resetAt: balance?.resetAt ?? nextUtcMidnight(new Date()),
  };
}

// Gives the credit back when the work it was reserved for failed (API error, or a hint
// that failed the leak check and was never shown). Guarded on reset_at so a refund
// arriving after midnight is dropped rather than crediting the new day, and floored at 0
// so a double refund can't manufacture credits.
export async function refundAiCredit(
  client: PrismaClient,
  userId: string,
  reservation: AiCreditReservation
): Promise<void> {
  await client.$executeRaw`
    UPDATE "ai_credit_balances" SET
      "used_today" = GREATEST("used_today" - 1, 0),
      "used_this_month" = GREATEST("used_this_month" - 1, 0)
    WHERE "user_id" = ${userId}::uuid
      AND "reset_at" = ${reservation.resetAt}`;
}

export interface AiCreditBalanceView {
  dailyAllowance: number;
  usedToday: number;
  remainingToday: number;
  resetAt: Date;
}

// Read-only companion for GET /api/ai/credits (Section 4.14 designed this endpoint but
// left it unbuilt). Reuses the same resolve → ensure bootstrap the hints reserve flow
// uses, then applies the SAME lazy daily-reset CASE logic as reserveAiCredit — without
// incrementing — so the numbers a student sees match what the next hint request would
// actually charge against. Deliberately does NOT call reserveAiCredit: that would
// consume a credit just for looking at the balance.
export async function getAiCreditBalance(
  client: PrismaClient,
  userId: string
): Promise<AiCreditBalanceView> {
  const allowances = await resolveAiCreditAllowances(client, userId);
  await ensureAiCreditBalance(client, userId, allowances);

  // Mirrors the reset half of reserveAiCredit's atomic UPDATE (same CASE expressions,
  // same UTC midnight roll), but sets counters to 0 on a crossed boundary rather than
  // to 1. Kept as its own statement rather than shared with reserve on purpose: reserve
  // must stay a single conditional UPDATE so two concurrent last-credit requests can
  // never both succeed — factoring the reset out of that path would reopen that race.
  await client.$executeRaw`
    UPDATE "ai_credit_balances" SET
      "used_today" = CASE WHEN "reset_at" <= now() THEN 0 ELSE "used_today" END,
      "used_this_month" = CASE
          WHEN "reset_at" <= now()
           AND date_trunc('month', "reset_at" - interval '1 day') <> date_trunc('month', now())
          THEN 0
          ELSE "used_this_month"
        END,
      "reset_at" = CASE
          WHEN "reset_at" <= now()
          THEN (date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day') AT TIME ZONE 'UTC'
          ELSE "reset_at"
        END
    WHERE "user_id" = ${userId}::uuid`;

  const balance = await client.aiCreditBalance.findUniqueOrThrow({ where: { userId } });
  return {
    dailyAllowance: balance.dailyAllowance,
    usedToday: balance.usedToday,
    remainingToday: Math.max(balance.dailyAllowance - balance.usedToday, 0),
    resetAt: balance.resetAt,
  };
}
