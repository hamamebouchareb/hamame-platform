import { prisma } from "../lib/prisma";

// BR-7 data-correctness job: a subscription whose currentPeriodEnd has passed but is
// still status 'active' must be flipped to 'expired'. Nothing else in the codebase does
// this (see the "Gap" note in src/routes/subscriptions.routes.ts — cancellation only
// marks intent; actually expiring lapsed subscriptions needs a scheduled job), so this
// is that job.
//
// There is no job scheduler beyond node-cron invoking this on a schedule (see
// src/server.ts), so the function itself is a plain, dependency-free unit that can also
// be triggered manually via POST /api/admin/jobs/expire-subscriptions.
//
// Returns the number of rows flipped on success, or null on failure after logging — a
// cron job must never throw, or it would crash the whole process.
export async function expireSubscriptions(): Promise<number | null> {
  try {
    const result = await prisma.subscription.updateMany({
      where: {
        status: "active",
        currentPeriodEnd: { lt: new Date() },
      },
      data: { status: "expired" },
    });
    console.log(`[cron] Expired ${result.count} subscriptions`);
    return result.count;
  } catch (err) {
    console.error("[cron] Failed to expire subscriptions:", err);
    return null;
  }
}
