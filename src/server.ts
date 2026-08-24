import "dotenv/config";
import cron from "node-cron";
import { createApp } from "./app";
import { expireSubscriptions } from "./jobs/expireSubscriptions";
import { unsuspendUsers } from "./jobs/unsuspendUsers";
import { generateLeaderboardSnapshots } from "./jobs/generateLeaderboardSnapshots";
import { generateContributorsLeaderboardSnapshots } from "./jobs/generateContributorsLeaderboardSnapshots";
import { sendDailyPushReminders } from "./jobs/sendDailyPushReminders";

const port = Number(process.env.PORT ?? 3000);
const app = createApp();

// BR-7: flip lapsed 'active' subscriptions to 'expired' once a day at 03:00 (node-cron,
// no external scheduler). Also run once immediately at boot so a fresh deploy doesn't
// wait up to 24h to catch up on stale rows during dev/testing. The job swallows its own
// errors, so a DB hiccup at boot or on a tick can never crash the server.
cron.schedule("0 3 * * *", () => {
  expireSubscriptions();
});
expireSubscriptions();

// Time-based moderation: unsuspend users whose suspendedUntil has passed, once a day at
// 03:00 plus once immediately at boot (same rationale and error-swallowing as above).
cron.schedule("0 3 * * *", () => {
  unsuspendUsers();
});
unsuspendUsers();

// BR-12: regenerate monthly leaderboard snapshots once a day at 03:00 plus once
// immediately at boot (same rationale and error-swallowing as the jobs above).
cron.schedule("0 3 * * *", () => {
  generateLeaderboardSnapshots();
});
generateLeaderboardSnapshots();

// BR-12: regenerate the parallel "Top Contributors" (participation) leaderboard on the
// same schedule as the score-based one above — daily at 03:00 plus once at boot. Runs
// independently: it writes rows with a different `period` discriminator
// ('monthly_contributors'), so it can never collide with or overwrite the score board's
// 'monthly' rows for the same pair.
cron.schedule("0 3 * * *", () => {
  generateContributorsLeaderboardSnapshots();
});
generateContributorsLeaderboardSnapshots();

// Push notifications (V1 feature) — daily goal reminder + streak-at-risk warning, once a
// day at 19:00 UTC (~20:00 Algiers), an evening nudge rather than the 03:00 maintenance
// slot the jobs above use. Deliberately NO immediate boot-time run, unlike every job
// above — see src/jobs/sendDailyPushReminders.ts's doc comment for why: those jobs are
// idempotent status-flips/snapshot-replaces safe to repeat on every dev-server restart
// (tsx watch), a push send is not, and a boot-run here would spam real pushes on every
// hot-reload.
cron.schedule("0 19 * * *", () => {
  sendDailyPushReminders();
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Hamame API listening on port ${port}`);
});
