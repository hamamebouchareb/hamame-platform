import "dotenv/config";

// Forcing "unconfigured" BEFORE anything else runs (isPushConfigured() in
// src/lib/push/vapid.ts memoizes on first call) — this verification deliberately uses
// the "log the payload instead of calling the real Push API" approach for the checks
// below, since this repo's .env carries a REAL dev VAPID keypair and letting these
// checks hit the real Push API with made-up test endpoints/keys would mean asserting on
// web-push's own key-format validation instead of on this feature's actual logic.
//
// Deliberately OVERWRITING with an empty string, not `delete`-ing: @prisma/client
// auto-loads the whole .env file itself (independent of this script's own
// `import "dotenv/config"`) the first time a query actually runs, and that loader only
// fills in keys that are ABSENT from process.env — a deleted key gets silently restored
// on the first Prisma query, but an overwritten (present-but-empty) one does not. Same
// trick verify-contextual-hints.ts uses on ANTHROPIC_API_KEY, generalized to 3 vars.
process.env.VAPID_PUBLIC_KEY = "";
process.env.VAPID_PRIVATE_KEY = "";
process.env.VAPID_SUBJECT = "";

import { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../app";
import { sendPushToUser } from "../lib/push/send";
import { sendDailyPushReminders } from "../jobs/sendDailyPushReminders";
import { startOfUtcDay } from "../lib/daily-goal";

// Verification harness for push notifications (native Web Push / VAPID, V1 feature).
// Manual-only, imported by nothing, same placement/pattern as verify-contextual-hints.ts.
//
// Usage: npx tsx src/scripts/verify-push-notifications.ts

const prisma = new PrismaClient();

const CARDIAC_PHYSIOLOGY_UNIT_ID = "00000000-0000-0000-0000-000000000040";
const SEED_QCM_QUESTION_ID = "00000000-0000-0000-0000-000000000070";
const PASSWORD = "VerifyPush!2026";

let passCount = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = ""): boolean {
  if (ok) {
    passCount += 1;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
  return ok;
}

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

let baseUrl = "";

interface Student {
  userId: string;
  token: string;
}

async function registerOrLogin(email: string, fullName: string): Promise<Student> {
  const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, fullName }),
  });
  if (registerResponse.status === 201) {
    const body = (await registerResponse.json()) as { accessToken: string; user: { id: string } };
    return { userId: body.user.id, token: body.accessToken };
  }
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = (await loginResponse.json()) as { accessToken: string; user: { id: string } };
  return { userId: body.user.id, token: body.accessToken };
}

// `body` typed `any` deliberately — this is a test harness asserting on whatever shape
// each endpoint happens to return, not production code that should stay strictly typed.
async function apiCall(
  token: string,
  path: string,
  method: string,
  requestBody?: unknown
): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: requestBody !== undefined ? JSON.stringify(requestBody) : undefined,
  });
  const json = await response.json().catch(() => null);
  return { status: response.status, body: json };
}

async function wipeTestData(): Promise<void> {
  const testUsers = await prisma.user.findMany({
    where: { email: { contains: "verify-push" } },
    select: { id: true },
  });
  const userIds = testUsers.map((u) => u.id);
  if (userIds.length === 0) return;

  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.pushSubscription.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.pushPreference.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.attempt.deleteMany({ where: { sessionQuestion: { session: { userId: { in: userIds } } } } });
  await prisma.sessionQuestion.deleteMany({ where: { session: { userId: { in: userIds } } } });
  await prisma.studySession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.userBadge.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.streak.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.badge.deleteMany({ where: { name: { contains: "verify-push" } } });
}

async function notificationCount(userId: string, category: string): Promise<number> {
  return prisma.notification.count({ where: { userId, category } });
}

// ---------------------------------------------------------------------------
// Section 1 — subscription create + duplicate-subscribe idempotency (Step 0 concern)
// ---------------------------------------------------------------------------
async function runSubscriptionChecks(student: Student): Promise<{ endpointA: string }> {
  section("Push subscription create + duplicate-subscribe idempotency");

  const endpointA = `https://verify-push.example/ep/${randomUUID()}`;
  const first = await apiCall(student.token, "/push/subscribe", "POST", {
    endpoint: endpointA,
    keys: { p256dh: "key-p256dh-v1", auth: "key-auth-v1" },
    userAgent: "verify-push-script/1",
  });
  check("first subscribe returns 200", first.status === 200, String(first.status));

  const rowsAfterFirst = await prisma.pushSubscription.findMany({ where: { endpoint: endpointA } });
  check("exactly one row exists after first subscribe", rowsAfterFirst.length === 1, `count=${rowsAfterFirst.length}`);

  // Simulate the exact scenario flagged in Step 0: permission re-granted / two tabs both
  // subscribing on load. The browser would return the SAME endpoint but the Push API can
  // hand back refreshed keys — the row must be UPDATED in place, never duplicated.
  const second = await apiCall(student.token, "/push/subscribe", "POST", {
    endpoint: endpointA,
    keys: { p256dh: "key-p256dh-v2-refreshed", auth: "key-auth-v2-refreshed" },
    userAgent: "verify-push-script/1",
  });
  check("duplicate subscribe (same endpoint) returns 200", second.status === 200, String(second.status));

  const rowsAfterSecond = await prisma.pushSubscription.findMany({ where: { endpoint: endpointA } });
  check(
    "still exactly one row after re-subscribing the same endpoint (no duplicate row)",
    rowsAfterSecond.length === 1,
    `count=${rowsAfterSecond.length}`
  );
  check(
    "the single row's keys were updated to the newest values",
    rowsAfterSecond[0]?.p256dhKey === "key-p256dh-v2-refreshed",
    rowsAfterSecond[0]?.p256dhKey
  );

  // A second, genuinely different device for the same user must NOT collapse into the
  // first — two rows is correct here (one per physical device).
  const endpointB = `https://verify-push.example/ep/${randomUUID()}`;
  await apiCall(student.token, "/push/subscribe", "POST", {
    endpoint: endpointB,
    keys: { p256dh: "key-p256dh-device-b", auth: "key-auth-device-b" },
  });
  const allRowsForUser = await prisma.pushSubscription.findMany({ where: { userId: student.userId } });
  check(
    "a second, different device adds a second row (not collapsed with the first)",
    allRowsForUser.length === 2,
    `count=${allRowsForUser.length}`
  );

  // Unsubscribe device B and confirm only that row is removed.
  const unsub = await apiCall(student.token, "/push/unsubscribe", "POST", { endpoint: endpointB });
  check("unsubscribe returns 200", unsub.status === 200, String(unsub.status));
  const remaining = await prisma.pushSubscription.findMany({ where: { userId: student.userId } });
  check(
    "only device B's row was removed; device A's row remains",
    remaining.length === 1 && remaining[0]?.endpoint === endpointA,
    `remaining=${remaining.map((r) => r.endpoint).join(",")}`
  );

  return { endpointA };
}

// ---------------------------------------------------------------------------
// Section 2 — preferences: defaults, partial update, master switch suppression
// ---------------------------------------------------------------------------
async function runPreferenceChecks(student: Student): Promise<void> {
  section("Preferences — defaults, partial update, per-type + master toggle enforcement");

  const defaults = await apiCall(student.token, "/push/preferences", "GET");
  check(
    "GET preferences with no row yet defaults every field to true",
    defaults.status === 200 &&
      defaults.body.preferences.masterEnabled === true &&
      defaults.body.preferences.dailyGoalReminder === true &&
      defaults.body.preferences.streakAtRisk === true &&
      defaults.body.preferences.badgeEarned === true,
    JSON.stringify(defaults.body.preferences)
  );

  const disableBadges = await apiCall(student.token, "/push/preferences", "PUT", { badgeEarned: false });
  check(
    "partial update (badgeEarned:false) only changes that field",
    disableBadges.status === 200 &&
      disableBadges.body.preferences.badgeEarned === false &&
      disableBadges.body.preferences.dailyGoalReminder === true &&
      disableBadges.body.preferences.streakAtRisk === true &&
      disableBadges.body.preferences.masterEnabled === true,
    JSON.stringify(disableBadges.body.preferences)
  );

  // Toggled-off type must NOT receive that type — verified directly against
  // sendPushToUser (the single choke point every trigger goes through), and against the
  // durable side effect (no Notification row at all, not even a suppressed one).
  const beforeBadgeCount = await notificationCount(student.userId, "badge_earned");
  const badgeResult = await sendPushToUser(student.userId, "badge_earned", { title: "t", body: "b" });
  check("sendPushToUser reports not-sent for a disabled type", !badgeResult.sent && badgeResult.reason === "preference_disabled", JSON.stringify(badgeResult));
  check(
    "no Notification row was created for the disabled type",
    (await notificationCount(student.userId, "badge_earned")) === beforeBadgeCount
  );

  // Re-enable and confirm the preference gate lets it through this time (not suppressed
  // as "preference_disabled" anymore — "push_not_configured" is the expected reason here
  // since this script deliberately runs with VAPID unconfigured; that's a delivery-layer
  // detail, not a preference-logic one).
  await apiCall(student.token, "/push/preferences", "PUT", { badgeEarned: true });
  const enabledResult = await sendPushToUser(student.userId, "badge_earned", { title: "t", body: "b" });
  check(
    "sendPushToUser no longer blocks on the preference once re-enabled",
    enabledResult.reason !== "preference_disabled",
    JSON.stringify(enabledResult)
  );
  check(
    "a Notification row now exists for the re-enabled type",
    (await notificationCount(student.userId, "badge_earned")) === beforeBadgeCount + 1
  );

  // Master switch off must suppress ALL 3 types, even ones individually left "on".
  await apiCall(student.token, "/push/preferences", "PUT", {
    masterEnabled: false,
    dailyGoalReminder: true,
    streakAtRisk: true,
    badgeEarned: true,
  });
  const beforeMasterOffCounts = {
    daily: await notificationCount(student.userId, "daily_goal_reminder"),
    streak: await notificationCount(student.userId, "streak_at_risk"),
    badge: await notificationCount(student.userId, "badge_earned"),
  };
  const results = await Promise.all([
    sendPushToUser(student.userId, "daily_goal_reminder", { title: "t", body: "b" }),
    sendPushToUser(student.userId, "streak_at_risk", { title: "t", body: "b" }),
    sendPushToUser(student.userId, "badge_earned", { title: "t", body: "b" }),
  ]);
  check(
    "master switch off suppresses all 3 types, individually-enabled or not",
    results.every((r) => !r.sent && r.reason === "preference_disabled"),
    JSON.stringify(results)
  );
  check(
    "no new Notification rows were created for any type while master is off",
    (await notificationCount(student.userId, "daily_goal_reminder")) === beforeMasterOffCounts.daily &&
      (await notificationCount(student.userId, "streak_at_risk")) === beforeMasterOffCounts.streak &&
      (await notificationCount(student.userId, "badge_earned")) === beforeMasterOffCounts.badge
  );

  // Restore master on for the rest of the run.
  await apiCall(student.token, "/push/preferences", "PUT", { masterEnabled: true });

  // This section's direct sendPushToUser calls deliberately created a few synthetic
  // Notification rows (title/body "t"/"b") to observe the durable side effect — clean
  // them up so Section 3's real end-to-end badge-award assertions start from a known-zero
  // baseline instead of having to account for this section's leftovers.
  await prisma.notification.deleteMany({ where: { userId: student.userId } });
}

// ---------------------------------------------------------------------------
// Section 3 — badge-earned fires end-to-end through the REAL award trigger
// (finalizeSession -> checkAndAwardBadges -> notifyBadgeEarned), not a direct call.
// ---------------------------------------------------------------------------
async function createSession(token: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: `verify-push ${randomUUID().slice(0, 8)}`,
      mode: "practice",
      unitIds: [CARDIAC_PHYSIOLOGY_UNIT_ID],
      size: 1,
    }),
  });
  if (!response.ok) {
    throw new Error(`Session creation failed: ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { session: { id: string } };
  return body.session.id;
}

async function runBadgeEarnedChecks(student: Student): Promise<void> {
  section("Badge-earned push — real end-to-end trigger (session submit -> award -> push)");

  const badge1 = await prisma.badge.create({
    data: { name: `verify-push badge one ${randomUUID().slice(0, 6)}`, criteria: { type: "session_count", count: 1 } },
  });
  const badge2 = await prisma.badge.create({
    data: { name: `verify-push badge two ${randomUUID().slice(0, 6)}`, criteria: { type: "session_count", count: 2 } },
  });

  // Disable badgeEarned before the FIRST award: the badge must still be recorded
  // (UserBadge row exists) but no push/Notification should follow.
  await apiCall(student.token, "/push/preferences", "PUT", { badgeEarned: false });

  const sessionId1 = await createSession(student.token);
  const submit1 = await apiCall(student.token, `/sessions/${sessionId1}/submit`, "POST");
  check("first session submits successfully", submit1.status === 200, String(submit1.status));

  const userBadge1 = await prisma.userBadge.findUnique({ where: { userId_badgeId: { userId: student.userId, badgeId: badge1.id } } });
  check("badge 1 was actually awarded (UserBadge row exists) despite the type being disabled", userBadge1 !== null);
  check(
    "no badge_earned Notification was created while the type is disabled",
    (await notificationCount(student.userId, "badge_earned")) === 0
  );

  // Re-enable and earn the SECOND badge — this one must produce a Notification.
  await apiCall(student.token, "/push/preferences", "PUT", { badgeEarned: true });

  const sessionId2 = await createSession(student.token);
  const submit2 = await apiCall(student.token, `/sessions/${sessionId2}/submit`, "POST");
  check("second session submits successfully", submit2.status === 200, String(submit2.status));

  const userBadge2 = await prisma.userBadge.findUnique({ where: { userId_badgeId: { userId: student.userId, badgeId: badge2.id } } });
  check("badge 2 was awarded", userBadge2 !== null);

  const badgeNotifications = await prisma.notification.findMany({
    where: { userId: student.userId, category: "badge_earned" },
  });
  check(
    "exactly one badge_earned Notification exists (for badge 2, not badge 1)",
    badgeNotifications.length === 1,
    `count=${badgeNotifications.length}`
  );
  check(
    "the notification body names the correct (second) badge",
    badgeNotifications[0]?.body.includes(badge2.name) ?? false,
    badgeNotifications[0]?.body
  );
}

// ---------------------------------------------------------------------------
// Section 4 — daily reminder job: fires exactly under the right conditions
// ---------------------------------------------------------------------------
async function runReminderConditionChecks(atRiskStudent: Student, goalMetStudent: Student): Promise<void> {
  section("Daily reminder job — fires only when the condition is actually true");

  const today = startOfUtcDay(new Date());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

  // Subscribe both so the job actually considers them.
  for (const student of [atRiskStudent, goalMetStudent]) {
    await apiCall(student.token, "/push/subscribe", "POST", {
      endpoint: `https://verify-push.example/ep/${randomUUID()}`,
      keys: { p256dh: "k", auth: "a" },
    });
  }

  // atRiskStudent: goal unmet (no sessions today, default 20-min goal) AND a streak that
  // hasn't been extended today -> BOTH reminder types should fire.
  await prisma.streak.upsert({
    where: { userId: atRiskStudent.userId },
    update: { currentStreakDays: 4, longestStreakDays: 4, lastActiveDate: yesterday, dailyGoalMinutes: 20 },
    create: { userId: atRiskStudent.userId, currentStreakDays: 4, longestStreakDays: 4, lastActiveDate: yesterday, dailyGoalMinutes: 20 },
  });

  // goalMetStudent: goal met (one completed session today satisfying a 1-minute goal)
  // AND active today (streak already extended today) -> NEITHER type should fire.
  await prisma.streak.upsert({
    where: { userId: goalMetStudent.userId },
    update: { currentStreakDays: 6, longestStreakDays: 6, lastActiveDate: today, dailyGoalMinutes: 1 },
    create: { userId: goalMetStudent.userId, currentStreakDays: 6, longestStreakDays: 6, lastActiveDate: today, dailyGoalMinutes: 1 },
  });
  const startedAt = new Date();
  const completedAt = new Date(startedAt.getTime() + 90_000); // 90s -> 1.5 minutes studied
  await prisma.studySession.create({
    data: { userId: goalMetStudent.userId, name: "verify-push goal-met filler", mode: "practice", startedAt, completedAt },
  });

  const result = await sendDailyPushReminders();
  check("job run completes and returns counters", result !== null, JSON.stringify(result));

  check(
    "at-risk student received a daily_goal_reminder",
    (await notificationCount(atRiskStudent.userId, "daily_goal_reminder")) === 1
  );
  check(
    "at-risk student received a streak_at_risk warning",
    (await notificationCount(atRiskStudent.userId, "streak_at_risk")) === 1
  );
  check(
    "goal-met/active-today student received NEITHER reminder type",
    (await notificationCount(goalMetStudent.userId, "daily_goal_reminder")) === 0 &&
      (await notificationCount(goalMetStudent.userId, "streak_at_risk")) === 0
  );

  // Step 0 concern: the job double-firing on the same day (manual re-trigger, or a
  // boot+cron proximity edge case on some other deployment) must NOT double-send.
  const secondRun = await sendDailyPushReminders();
  check("second same-day run also completes cleanly", secondRun !== null);
  check(
    "re-running the job the same day does NOT duplicate the daily_goal_reminder",
    (await notificationCount(atRiskStudent.userId, "daily_goal_reminder")) === 1
  );
  check(
    "re-running the job the same day does NOT duplicate the streak_at_risk warning",
    (await notificationCount(atRiskStudent.userId, "streak_at_risk")) === 1
  );
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const app = createApp();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  console.log(`Push notification verification (server on ${baseUrl})`);
  console.log("VAPID keys deliberately unset for this run — every send takes the logged-payload path (see file header).");

  try {
    await wipeTestData();

    const seedAuthor = await prisma.user.findUnique({ where: { email: "seed-author@hamame.dz" } });
    if (!seedAuthor) {
      throw new Error("Seed data missing — run `npx tsx prisma/seed.ts` first.");
    }

    const studentA = await registerOrLogin("verify-push-a@verify.hamame.dz", "Push Verify A");
    const studentAtRisk = await registerOrLogin("verify-push-atrisk@verify.hamame.dz", "Push Verify AtRisk");
    const studentGoalMet = await registerOrLogin("verify-push-goalmet@verify.hamame.dz", "Push Verify GoalMet");

    await runSubscriptionChecks(studentA);
    await runPreferenceChecks(studentA);
    await runBadgeEarnedChecks(studentA);
    await runReminderConditionChecks(studentAtRisk, studentGoalMet);
  } finally {
    server.close();
    await prisma.$disconnect();
  }

  console.log(`\n${passCount} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.log("Failed checks:");
    for (const failure of failures) {
      console.log(`  - ${failure}`);
    }
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
