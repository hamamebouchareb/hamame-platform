import { prisma } from "../prisma";
import { startOfUtcDay } from "../daily-goal";
import { isPushConfigured, webpush } from "./vapid";

// The exact 3 V1 push types (per the confirmed decisions — no others exist yet).
// `category` on the Notification row and the type string sent in the push payload are
// both this exact value, so a client can dispatch on it without a separate mapping table.
export type PushNotificationType = "daily_goal_reminder" | "streak_at_risk" | "badge_earned";

// Only the two cron-driven reminder types are day-scoped for the "already sent today"
// idempotency guard (see file header note below) — badge_earned is a distinct event per
// badge and must never be suppressed by an earlier, different badge's send the same day.
const DAY_SCOPED_TYPES: ReadonlySet<PushNotificationType> = new Set(["daily_goal_reminder", "streak_at_risk"]);

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface SendResult {
  sent: boolean;
  reason?: "preference_disabled" | "already_sent_today" | "push_not_configured" | "no_subscriptions";
}

// No PushPreference row = all four booleans default true (see prisma/schema.prisma's
// PushPreference doc comment) — mirrors the Streak/ReviewSettings "missing row -> column
// default" convention already used elsewhere in this codebase.
async function isTypeEnabled(userId: string, type: PushNotificationType): Promise<boolean> {
  const pref = await prisma.pushPreference.findUnique({ where: { userId } });
  if (!pref) {
    return true;
  }
  if (!pref.masterEnabled) {
    return false;
  }
  switch (type) {
    case "daily_goal_reminder":
      return pref.dailyGoalReminder;
    case "streak_at_risk":
      return pref.streakAtRisk;
    case "badge_earned":
      return pref.badgeEarned;
  }
}

// Idempotency guard for the two daily cron-driven types (Step 0 concern #3's second half
// — the daily reminder job double-firing on the same UTC day, e.g. an admin manually
// re-triggering it for a test, must not double-push). Not a race-condition fix (this
// process runs the reminder job sequentially, never concurrently with itself), just a
// plain "did we already do this today" check — see src/lib/push/send.ts's module header
// in the Step 0 report for why that's sufficient here.
async function alreadySentToday(userId: string, type: PushNotificationType): Promise<boolean> {
  if (!DAY_SCOPED_TYPES.has(type)) {
    return false;
  }
  const existing = await prisma.notification.findFirst({
    where: { userId, category: type, createdAt: { gte: startOfUtcDay(new Date()) } },
    select: { id: true },
  });
  return existing !== null;
}

// Sends one of the 3 V1 push notification types to every device a user has subscribed
// on, respecting their preferences and same-day dedup. Best-effort by design — never
// throws; callers (the reminder job, the badge-award hook) must never have a push
// failure block or roll back the business logic that triggered it.
//
// Always writes a Notification row first (in-app history, FR-43, and the durable record
// the same-day idempotency check above reads back) regardless of whether the user has
// any push subscription — a student who hasn't granted push permission yet still gets
// the in-app record; push is the extra delivery channel layered on top when subscriptions
// exist.
export async function sendPushToUser(
  userId: string,
  type: PushNotificationType,
  payload: PushPayload
): Promise<SendResult> {
  if (!(await isTypeEnabled(userId, type))) {
    return { sent: false, reason: "preference_disabled" };
  }
  if (await alreadySentToday(userId, type)) {
    return { sent: false, reason: "already_sent_today" };
  }

  await prisma.notification.create({
    data: { userId, category: type, title: payload.title, body: payload.body },
  });

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });

  // No VAPID keys configured (fresh clone, CI, a dev box mid-setup) — log the payload
  // that WOULD have been sent rather than attempting a real Push API call. This is also
  // the verification approach used for this feature: see docs/HAMAME_MASTER_HANDOFF.md's
  // push-notifications section for the live-verified log output.
  if (!isPushConfigured()) {
    // eslint-disable-next-line no-console
    console.log(`[push:${type}] VAPID not configured — logging payload instead of sending`, {
      userId,
      subscriptionCount: subscriptions.length,
      payload,
    });
    return { sent: false, reason: "push_not_configured" };
  }

  if (subscriptions.length === 0) {
    return { sent: false, reason: "no_subscriptions" };
  }

  const serializedPayload = JSON.stringify({ type, title: payload.title, body: payload.body, data: payload.data });

  // Sequential, not Promise.all — same Supabase-pooler concurrency rule as everywhere
  // else in this codebase (AGENTS.md), plus a user rarely has more than 2-3 devices.
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dhKey, auth: subscription.authKey } },
        serializedPayload
      );
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // Push service confirms this subscription is gone (user revoked permission,
        // uninstalled, or cleared site data) — garbage-collect so this dead endpoint
        // isn't retried forever. Swallowed defensively: a GC failure must not surface as
        // a send failure.
        await prisma.pushSubscription.delete({ where: { id: subscription.id } }).catch(() => {});
      } else {
        console.error(`[push:${type}] send failed for subscription ${subscription.id}`, err);
      }
    }
  }

  return { sent: true };
}
