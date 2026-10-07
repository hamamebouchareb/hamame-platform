// Suspension truth (BR-5): is an account effectively suspended right now?
//
// Pure function (no Prisma, no clock mocking needed — `now` injects for
// tests). True ONLY when status is exactly "suspended" AND the suspension
// has no end date (indefinite) or the end date is still in the future. A
// suspension whose date has passed counts as lifted even if the daily
// unsuspend job has not run yet — callers must treat that account as active.
// Every other status (including "deleted", which callers handle separately)
// returns false.

export function isEffectivelySuspended(
  status: string,
  suspendedUntil: Date | null | undefined,
  now: Date = new Date()
): boolean {
  if (status !== "suspended") return false;
  if (suspendedUntil === null || suspendedUntil === undefined) return true;
  return suspendedUntil.getTime() > now.getTime();
}
