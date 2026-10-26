import { prisma } from "./prisma";

// Presence for the Facebook-style online dot (Hamame build, 2026-10-26).
//
// Model: a user is "online" when an authenticated request of theirs arrived
// within ONLINE_WINDOW_MS. Source of truth is users.last_active_at, refreshed
// by a per-user-throttled write (TOUCH_THROTTLE_MS) fired by requireAuth /
// optionalAuth. Trade-off, stated plainly: "online" means "active in the last
// 2 minutes", not a real-time socket heartbeat — enough for the green dot and
// zero new infrastructure (no websocket server, no new dependency).
//
// The throttle Map is optionally per-process (single-instance deploy, same
// documented limit as the rate limiter and account-state cache). Entries are
// capped and cleared wholesale like the account-state cache.

export const ONLINE_WINDOW_MS = 2 * 60_000;
const TOUCH_THROTTLE_MS = 60_000;
const MAX_TOUCH_ENTRIES = 5000;

const lastTouch = new Map<string, number>();

export function isOnline(lastActiveAt: Date | null): boolean {
  if (!lastActiveAt) return false;
  return Date.now() - lastActiveAt.getTime() <= ONLINE_WINDOW_MS;
}

export function touchPresence(userId: string): void {
  const now = Date.now();
  const previous = lastTouch.get(userId);
  if (previous && now - previous < TOUCH_THROTTLE_MS) return;
  lastTouch.set(userId, now);
  if (lastTouch.size >= MAX_TOUCH_ENTRIES) lastTouch.clear();
  // Plain PK update, unconditional: one write per active user per minute,
  // fire-and-forget so a presence failure can never delay a request.
  void prisma.user
    .update({ where: { id: userId }, data: { lastActiveAt: new Date() } })
    .catch(() => undefined);
}
