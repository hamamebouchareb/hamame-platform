import { prisma } from "../lib/prisma";

// Time-based moderation unsuspension: a user suspended with a finite suspendedUntil (set
// by POST /api/moderation/users/:id/restrict when durationDays is provided) whose
// timestamp has now passed is flipped back to status 'active' and cleared. Rows with
// suspendedUntil null are indefinite suspensions and are deliberately left alone.
//
// Same scheduling/tooling structure as src/jobs/expireSubscriptions.ts — invoked by
// node-cron in src/server.ts and manually via POST /api/admin/jobs/unsuspend-users.
//
// Returns the number of rows flipped on success, or null on failure after logging — a
// cron job must never throw, or it would crash the whole process.
export async function unsuspendUsers(): Promise<number | null> {
  try {
    const result = await prisma.user.updateMany({
      where: {
        status: "suspended",
        suspendedUntil: { not: null, lt: new Date() },
      },
      data: { status: "active", suspendedUntil: null },
    });
    console.log(`[cron] Unsuspended ${result.count} users`);
    return result.count;
  } catch (err) {
    console.error("[cron] Failed to unsuspend users:", err);
    return null;
  }
}
