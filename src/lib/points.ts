// Points economy (medspark.online-parity): award/spend engine.
//
// Invariants:
// 1. points_ledger is the source of truth — every balance change writes one
//    row in the same transaction; points_accounts.balance must equal
//    SUM(delta) and is stored only as a read-path optimization.
// 2. Idempotency lives on the (userId, reason, refId) unique key — and is
//    implemented with a raw INSERT ... ON CONFLICT DO NOTHING that NEVER
//    RAISES (RETURNING decides awarded vs skipped). This is the lesson from
//    src/lib/badge-awards.ts: in Postgres a raised unique violation aborts the
//    enclosing transaction no matter how the client swallows it later, so a
//    "catch P2002" implementation would roll back session submits on a
//    replayed award. Raw ON CONFLICT never raises; it is the settled repo
//    pattern (badge awards, review-queue inserts).
// 3. Concurrent awards serialize on the points_accounts row (SELECT ... FOR
//    UPDATE), so balance_after on two racing rows can never use stale values.
//
// Never run transaction-less mutations of points state through here: award
// calls belong inside a Prisma transaction (session submit's own tx, the
// redeem endpoint's tx), exactly like the streak-update discipline.
import { PrismaClient, Prisma } from "@prisma/client";
type TransactionClient = Prisma.TransactionClient | PrismaClient;

export const POINTS_REASONS = [
  "daily_bonus",
  "session_complete",
  "streak_milestone",
  "admin_grant",
  "shop_redeem",
] as const;
export type PointsReason = (typeof POINTS_REASONS)[number];

// Award rules (documented for the /points page — keep the constants in sync):
const DAILY_BONUS_POINTS = 5; // first submit of a UTC day
const SESSION_BASE_POINTS = 5; // per first-time submitted session
const SESSION_CORRECT_POINTS = 1; // +1 per gradable-answer correct
const STREAK_MILESTONE_POINTS = 15; // per newly-reached milestone
// Milestones are awarded flat and RETROACTIVELY: a student whose streak jumped
// past several thresholds (or predates this feature) collects all unclaimed
// ones up to their current value on their next first-session submit. `m<value>`
// refs make each milestone once-ever per user.
const STREAK_MILESTONES = [7, 14, 30, 60, 90, 180, 365];

export function utcDateRef(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

// Locks (and lazily creates) the user's points account row. Returns the
// pre-mutation balance; call sites compute balance_after from it while still
// holding the row lock, so racing awards can't interleave their arithmetic.
export async function lockPointsRow(
  tx: TransactionClient,
  userId: string
): Promise<{ balance: number; earnedTotal: number; spentTotal: number }> {
  // updated_at carries now() explicitly: the raw insert bypasses Prisma's
  // @updatedAt, and migration 26 has no DB-level default on the column.
  await tx.$executeRaw`INSERT INTO "points_accounts" ("user_id", "balance", "earned_total", "spent_total", "updated_at") VALUES (${userId}::uuid, 0, 0, 0, NOW()) ON CONFLICT ("user_id") DO NOTHING`;
  const rows = await tx.$queryRaw<
    Array<{ balance: number; earned_total: number; spent_total: number }>
  >`SELECT "balance", "earned_total", "spent_total" FROM "points_accounts" WHERE "user_id" = ${userId}::uuid FOR UPDATE`;
  const row = rows[0];
  if (!row) throw new Error(`points account row vanished for ${userId}`);
  return {
    balance: row.balance,
    earnedTotal: row.earned_total,
    spentTotal: row.spent_total,
  };
}

export type AwardResult = { status: "awarded" | "skipped"; balance: number };

export async function awardPoints(
  tx: TransactionClient,
  args: { userId: string; reason: PointsReason; refId: string; delta: number }
): Promise<AwardResult> {
  const { userId, reason, refId, delta } = args;
  if (delta === 0) throw new Error("awardPoints: delta must be non-zero");
  if (!refId) throw new Error("awardPoints: refId is mandatory (it keys the unique idempotency index)");
  const account = await lockPointsRow(tx, userId);
  const balanceAfter = account.balance + delta;
  // Raw claim: row-count 0 means this exact award already exists (replay) —
  // never raises, so it is safe inside any transaction, like awardBadgeIdempotent.
  const insertedRows = await tx.$executeRaw`
    INSERT INTO "points_ledger" ("id", "user_id", "delta", "reason", "ref_id", "balance_after")
    VALUES (gen_random_uuid(), ${userId}::uuid, ${delta}::int, ${reason}, ${refId}, ${balanceAfter}::int)
    ON CONFLICT ("user_id", "reason", "ref_id") DO NOTHING`;
  if (insertedRows === 0) {
    return { status: "skipped", balance: account.balance };
  }
  await tx.pointsAccount.update({
    where: { userId },
    data: {
      balance: balanceAfter,
      ...(delta > 0 ? { earnedTotal: { increment: delta } } : {}),
      ...(delta < 0 ? { spentTotal: { increment: -delta } } : {}),
    },
  });
  return { status: "awarded", balance: balanceAfter };
}

export type SessionPointSummary = {
  sessionAwarded: boolean;
  dailyAwarded: boolean;
  milestoneAwardedCount: number;
  totalAwarded: number;
};

// The submit-time hook. Called INSIDE the session-submit transaction (same
// discipline as updateStreakForUser); the submit route wraps it in its own
// try/catch so a points failure can never block session completion, exactly
// like the badge-award and review-queue hooks already there.
export async function awardSessionPoints(
  tx: TransactionClient,
  args: { userId: string; sessionId: string; streakDays: number; correctCount: number }
): Promise<SessionPointSummary> {
  const { userId, sessionId, streakDays, correctCount } = args;
  const summary: SessionPointSummary = {
    sessionAwarded: false,
    dailyAwarded: false,
    milestoneAwardedCount: 0,
    totalAwarded: 0,
  };

  const sessionAward = await awardPoints(tx, {
    userId,
    reason: "session_complete",
    refId: sessionId,
    delta: SESSION_BASE_POINTS + SESSION_CORRECT_POINTS * correctCount,
  });
  if (sessionAward.status === "awarded") {
    summary.sessionAwarded = true;
    summary.totalAwarded += SESSION_BASE_POINTS + SESSION_CORRECT_POINTS * correctCount;
  }

  const dailyAward = await awardPoints(tx, {
    userId,
    reason: "daily_bonus",
    refId: utcDateRef(),
    delta: DAILY_BONUS_POINTS,
  });
  if (dailyAward.status === "awarded") {
    summary.dailyAwarded = true;
    summary.totalAwarded += DAILY_BONUS_POINTS;
  }

  for (const milestone of STREAK_MILESTONES) {
    if (streakDays < milestone) break;
    const milestoneAward = await awardPoints(tx, {
      userId,
      reason: "streak_milestone",
      refId: `m${milestone}`,
      delta: STREAK_MILESTONE_POINTS,
    });
    if (milestoneAward.status === "awarded") {
      summary.milestoneAwardedCount += 1;
      summary.totalAwarded += STREAK_MILESTONE_POINTS;
    }
  }

  return summary;
}
