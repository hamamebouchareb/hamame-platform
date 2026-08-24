import { Prisma, PrismaClient, UserBadge } from "@prisma/client";
import { z } from "zod";
import { sendPushToUser } from "./push/send";

// Automatic badge-award triggers (Section 9 item 5 of the handoff — previously deferred,
// same risk category as the auto-enqueue change). Badges themselves were catalog +
// manual-award only (badges.routes.ts / admin.routes.ts); this adds the actual
// criteria-evaluation logic and wires it into the one natural trigger point that already
// has the data these criteria need: session submission (see sessions.routes.ts).
//
// CRITERIA SHAPE — a deliberate, minimal taxonomy, not an existing contract.
// Badge.criteria is untyped JsonB (see createBadgeSchema in admin.routes.ts) with no
// prior seeded badges and no fixed shape documented anywhere except a comment example
// (`{ "type": "streak", "days": 30 }`) and FR-38's examples (streak length, mock exam
// count, modules completed). This defines exactly three types, matching the three
// examples given for this task (streak / session count / accuracy) and leaving anything
// else (e.g. a future "modules completed" type sourced from Progress) as a deliberate
// non-goal for this pass — see checkAndAwardBadges's doc comment for why that one specific
// omission was made. A badge whose criteria doesn't parse against this schema (wrong
// shape, unrecognized `type`, admin-authored typo) is silently skipped, never thrown —
// this runs best-effort inside session submission and a malformed badge must never block
// a student's session from completing.
const badgeCriteriaSchema = z.discriminatedUnion("type", [
  // currentStreakDays >= days
  z.object({ type: z.literal("streak"), days: z.number().int().positive() }),
  // count of the user's completed StudySessions >= count
  z.object({ type: z.literal("session_count"), count: z.number().int().positive() }),
  // percentage of correct auto-gradable attempts >= threshold, gated on minAttempts so a
  // single lucky answer can't earn a 100%-accuracy badge (default 1, i.e. no gate, if the
  // badge author omits it).
  z.object({
    type: z.literal("accuracy"),
    threshold: z.number().min(0).max(100),
    minAttempts: z.number().int().positive().optional(),
  }),
]);

type BadgeCriteria = z.infer<typeof badgeCriteriaSchema>;

function parseBadgeCriteria(criteria: Prisma.JsonValue): BadgeCriteria | null {
  const result = badgeCriteriaSchema.safeParse(criteria);
  return result.success ? result.data : null;
}

// Same set used for score computation in sessions.routes.ts and the accuracy field in
// GET /api/progress/me — QROC/clinical-case attempts are not auto-gradable (isCorrect
// stays null) and must never count toward an accuracy badge in either direction. Kept as
// a local copy rather than an import, matching this repo's established pattern of small
// duplicated constants over cross-module coupling (see flashcard-from-question.ts's own
// copy of VISIBLE_ROLLOUT_STATUSES) — if this set ever changes, all three copies must
// change together.
const AUTO_GRADABLE_TYPES = ["QCM", "QCS"] as const;

// Idempotent award, used by both the auto-award trigger below and the manual
// POST /api/admin/users/:id/badges endpoint (admin.routes.ts), so the two can't drift on
// how a duplicate award is handled.
//
// CONCURRENCY NOTE — this table is NOT the same situation as the pre-fix
// ReviewQueueItem race (migrations 11/12 earlier this session). UserBadge's primary key
// is already the composite (userId, badgeId) — see prisma/schema.prisma's
// `@@id([userId, badgeId])` — so two concurrent awards of the same badge to the same user
// can never produce two persisted rows; the schema has enforced that from the start.
// What a naive findUnique-then-create WOULD still get wrong is the exact same
// transaction-abort failure mode already fixed for the review queue: this function is
// called from inside sessions.routes.ts's finalizeSession $transaction, and in Postgres a
// raised unique-violation aborts the whole transaction — a caught P2002 here could not
// keep that transaction alive, and the session submission itself would roll back. Raw
// `ON CONFLICT DO NOTHING` never raises, so it's safe both inside and outside a
// transaction, for the same reason it was chosen for enqueueReviewQueueItem.
export async function awardBadgeIdempotent(
  client: Prisma.TransactionClient | PrismaClient,
  userId: string,
  badgeId: string
): Promise<{ userBadge: UserBadge; created: boolean }> {
  const earnedAt = new Date();

  const inserted = await client.$executeRaw`
    INSERT INTO "user_badges" ("user_id", "badge_id", "earned_at")
    VALUES (${userId}::uuid, ${badgeId}::uuid, ${earnedAt})
    ON CONFLICT ("user_id", "badge_id") DO NOTHING`;

  // On conflict, earnedAt is deliberately NOT updated — re-meeting criteria (or a manual
  // admin re-award) must not reset when the student originally earned it.
  const userBadge = await client.userBadge.findUniqueOrThrow({
    where: { userId_badgeId: { userId, badgeId } },
  });

  return { userBadge, created: inserted > 0 };
}

export interface BadgeAwardContext {
  userId: string;
  // Read from the Streak row this same trigger just wrote (updateStreakForUser's return
  // value in sessions.routes.ts), not re-queried — the transaction already has the
  // authoritative post-update value in hand, and re-querying inside the same transaction
  // would just read back what it itself wrote.
  currentStreakDays: number;
}

// Evaluates every badge the user hasn't already earned and awards the ones whose
// criteria are now met. Called best-effort from finalizeSession (sessions.routes.ts) —
// callers must wrap this in their own try/catch, matching the existing review-enqueue
// hook's pattern, since a badge-evaluation failure must never block session completion.
//
// SCOPE NOTE: only `streak` and `session_count` and `accuracy` are evaluated, matching
// the three examples given for this task. FR-38 also names "modules completed" as a
// possible badge criterion, sourced from Progress — deliberately NOT included here: its
// natural trigger point is the lesson-view handler in curriculum.routes.ts
// (GET /api/lessons/:id), a distinct, unauthenticated-by-default route far from
// session submission, and wiring it in would roughly double this change's surface for a
// criterion type nobody has actually asked to seed yet. A `modules_completed` criteria
// type can be added the same way if/when that's needed — this file's shape doesn't need
// to change, only a new trigger call site sharing the same `checkAndAwardBadges` core.
//
// All queries here run sequentially (no Promise.all) inside the caller's transaction, so
// this never adds concurrent connections beyond the one the transaction already holds —
// it can't trip the Supabase session pooler's concurrency limit (Section 1 of the
// handoff) the way a batch of parallel queries could.
export async function checkAndAwardBadges(
  client: Prisma.TransactionClient | PrismaClient,
  context: BadgeAwardContext
): Promise<UserBadge[]> {
  const { userId, currentStreakDays } = context;

  const badges = await client.badge.findMany({ select: { id: true, criteria: true } });
  if (badges.length === 0) {
    return [];
  }

  const earned = await client.userBadge.findMany({ where: { userId }, select: { badgeId: true } });
  const earnedIds = new Set(earned.map((row) => row.badgeId));
  const candidates = badges.filter((badge) => !earnedIds.has(badge.id));
  if (candidates.length === 0) {
    return [];
  }

  // Computed at most once each, and only if some candidate badge actually needs them —
  // most session submits will have zero or one candidate badge, not the full catalog.
  let sessionCount: number | null = null;
  let accuracyStats: { total: number; correct: number } | null = null;

  const newlyAwarded: UserBadge[] = [];

  for (const badge of candidates) {
    const criteria = parseBadgeCriteria(badge.criteria);
    if (!criteria) {
      continue;
    }

    let met: boolean;
    switch (criteria.type) {
      case "streak": {
        met = currentStreakDays >= criteria.days;
        break;
      }
      case "session_count": {
        if (sessionCount === null) {
          sessionCount = await client.studySession.count({
            where: { userId, completedAt: { not: null } },
          });
        }
        met = sessionCount >= criteria.count;
        break;
      }
      case "accuracy": {
        if (accuracyStats === null) {
          // Same where-clause shape as GET /api/progress/me's accuracy field
          // (progress.routes.ts) — kept in sync deliberately, not imported, for the same
          // small-local-constant reasoning as AUTO_GRADABLE_TYPES above.
          const total = await client.attempt.count({
            where: {
              sessionQuestion: {
                session: { userId, completedAt: { not: null } },
                question: { type: { in: [...AUTO_GRADABLE_TYPES] } },
              },
            },
          });
          const correct = await client.attempt.count({
            where: {
              isCorrect: true,
              sessionQuestion: {
                session: { userId, completedAt: { not: null } },
                question: { type: { in: [...AUTO_GRADABLE_TYPES] } },
              },
            },
          });
          accuracyStats = { total, correct };
        }
        const minAttempts = criteria.minAttempts ?? 1;
        met =
          accuracyStats.total >= minAttempts &&
          (accuracyStats.correct / accuracyStats.total) * 100 >= criteria.threshold;
        break;
      }
    }

    if (met) {
      const { userBadge, created } = await awardBadgeIdempotent(client, userId, badge.id);
      if (created) {
        newlyAwarded.push(userBadge);
      }
    }
  }

  return newlyAwarded;
}

// Push notifications — badge-earned type (V1 push feature, confirmed decisions: fires
// immediately when a badge is awarded, reusing this exact hook point rather than a new
// trigger). Deliberately NOT called from inside awardBadgeIdempotent itself even though
// that's the one place both the automatic (finalizeSession) and manual
// (POST /api/admin/users/:id/badges) award paths share — awardBadgeIdempotent runs
// inside finalizeSession's DB transaction, and a push send is a slow, unreliable network
// call to an external push service that must never hold a pooled DB connection open
// while it retries. Both call sites instead call this AFTER their own write has
// committed: sessions.routes.ts after prisma.$transaction returns, admin.routes.ts after
// its plain (non-transactional) awardBadgeIdempotent call.
//
// Best-effort, matches every other post-transaction hook in this codebase — a push
// failure must never surface as a 500 on the request that legitimately just earned the
// badge. sendPushToUser itself never throws, but this wrapper exists so a future change
// to that contract can't silently break this call site.
export async function notifyBadgeEarned(
  client: Prisma.TransactionClient | PrismaClient,
  userId: string,
  badgeId: string
): Promise<void> {
  try {
    const badge = await client.badge.findUnique({ where: { id: badgeId }, select: { name: true } });
    if (!badge) {
      return;
    }
    await sendPushToUser(userId, "badge_earned", {
      title: "New badge earned!",
      body: `You've earned the "${badge.name}" badge.`,
      data: { badgeId },
    });
  } catch (err) {
    console.error(`[badge-awards] badge-earned push notification failed for user ${userId}, badge ${badgeId}`, err);
  }
}
