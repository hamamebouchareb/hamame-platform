import { randomUUID } from "crypto";
import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { prisma } from "../lib/prisma";

// Push notifications (native Web Push / VAPID — confirmed decision, no third-party
// provider). See src/lib/push/send.ts for the send primitive and src/jobs for the two
// cron-driven reminder types; the third type (badgeEarned) is triggered from
// sessions.routes.ts / admin.routes.ts's badge-award paths, not from here.
const router = Router();

router.use(requireAuth);

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().optional(),
});

// POST /api/push/subscribe — register (or re-register) a browser/device subscription.
//
// IDEMPOTENCY (Step 0 concern): the Push API guarantees the SAME browser+origin+service-
// worker registration returns the SAME `endpoint` on every subscribe call, so `endpoint`
// (globally unique — see prisma/schema.prisma's PushSubscription doc comment) is the
// natural dedupe key. Re-subscribing the same device (permission re-granted, two tabs
// both subscribing on load) must update the existing row in place, never insert a second
// one — a second row for the same physical device would mean that device receives every
// push twice. `INSERT ... ON CONFLICT (endpoint) DO UPDATE` (never a caught P2002) is the
// same idempotent-write idiom already used for UserBadge/ReviewQueueItem elsewhere in
// this codebase, and is safe under concurrent double-submits (e.g. two tabs racing) for
// the same reason those are.
async function subscribe(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { endpoint, keys, userAgent } = req.body as z.infer<typeof subscribeSchema>;
    const id = randomUUID();

    await prisma.$executeRaw`
      INSERT INTO "push_subscriptions" ("id", "user_id", "endpoint", "p256dh_key", "auth_key", "user_agent")
      VALUES (${id}::uuid, ${userId}::uuid, ${endpoint}, ${keys.p256dh}, ${keys.auth}, ${userAgent ?? null})
      ON CONFLICT ("endpoint") DO UPDATE SET
        "user_id" = ${userId}::uuid,
        "p256dh_key" = ${keys.p256dh},
        "auth_key" = ${keys.auth},
        "user_agent" = ${userAgent ?? null},
        "last_seen_at" = now()`;

    const subscription = await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint } });
    res.status(200).json({ subscription });
  } catch (err) {
    next(err);
  }
}

router.post("/subscribe", validateBody(subscribeSchema), subscribe);

const unsubscribeSchema = z.object({ endpoint: z.string().url() });

// POST /api/push/unsubscribe — deregister a device. Scoped to the caller's own
// subscriptions (deleteMany with userId in the where-clause) so a stolen/guessed
// endpoint string can't be used to unsubscribe someone else's device; a no-op delete
// (already unsubscribed, or belongs to another user) still returns 200 — this is a
// "make it so", not a "prove it existed" endpoint.
async function unsubscribe(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { endpoint } = req.body as z.infer<typeof unsubscribeSchema>;

    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
    res.status(200).json({ message: "Unsubscribed" });
  } catch (err) {
    next(err);
  }
}

router.post("/unsubscribe", validateBody(unsubscribeSchema), unsubscribe);

// GET /api/push/preferences — returns the column defaults (all true) when no row exists
// yet, same "missing row -> default" convention as /api/streaks/goal and
// /api/reviews/settings.
async function getPreferences(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const pref = await prisma.pushPreference.findUnique({ where: { userId } });

    res.status(200).json({
      preferences: {
        masterEnabled: pref?.masterEnabled ?? true,
        dailyGoalReminder: pref?.dailyGoalReminder ?? true,
        streakAtRisk: pref?.streakAtRisk ?? true,
        badgeEarned: pref?.badgeEarned ?? true,
      },
    });
  } catch (err) {
    next(err);
  }
}

router.get("/preferences", getPreferences);

const updatePreferencesSchema = z.object({
  masterEnabled: z.boolean().optional(),
  dailyGoalReminder: z.boolean().optional(),
  streakAtRisk: z.boolean().optional(),
  badgeEarned: z.boolean().optional(),
});

// PUT /api/push/preferences — partial update, upserted. Only keys actually present in
// the body are written (mirrors PUT /api/users/me's pattern in users.routes.ts) so
// toggling one switch can never clobber the others back to their defaults.
async function updatePreferences(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const body = req.body as z.infer<typeof updatePreferencesSchema>;

    const pref = await prisma.pushPreference.upsert({
      where: { userId },
      update: { ...body },
      create: {
        userId,
        masterEnabled: body.masterEnabled ?? true,
        dailyGoalReminder: body.dailyGoalReminder ?? true,
        streakAtRisk: body.streakAtRisk ?? true,
        badgeEarned: body.badgeEarned ?? true,
      },
    });

    res.status(200).json({
      preferences: {
        masterEnabled: pref.masterEnabled,
        dailyGoalReminder: pref.dailyGoalReminder,
        streakAtRisk: pref.streakAtRisk,
        badgeEarned: pref.badgeEarned,
      },
    });
  } catch (err) {
    next(err);
  }
}

router.put("/preferences", validateBody(updatePreferencesSchema), updatePreferences);

export default router;
