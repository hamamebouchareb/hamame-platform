import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { validateBody, validateParams, validateQuery } from "../middleware/validate";
import { paginationQuery, uuidParam } from "../lib/common-schemas";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";

// Notification center (FR-41 to FR-43; model + `notifications` table already
// existed in prisma/schema.prisma — this file adds the missing API surface).
// Categories mirror the MedSparkDZ live reference tabs (Tout/Social/Prix/
// Système — gap analysis N2): stored slugs are social|prix|systeme.
const router = Router();

router.use(requireAuth);

const NOTIFICATION_CATEGORIES = ["social", "prix", "systeme"] as const;
type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const notificationCategories = NOTIFICATION_CATEGORIES;

// Shared helper for product-event hooks (friend accept, activation redeem,
// badge award, …). Best-effort: never throws, so a notification write can
// never fail the user-facing flow that triggered it.
export async function createNotificationBestEffort(args: {
  userId: string;
  category: NotificationCategory;
  title: string;
  body: string;
}): Promise<void> {
  try {
    await prisma.notification.create({
      data: { userId: args.userId, category: args.category, title: args.title, body: args.body },
    });
  } catch {
    return undefined;
  }
}

// GET /api/notifications — list the current user's notifications, newest first.
// Filters: category (single slug), unreadOnly ("true" → readAt null only).
const listNotificationsQuerySchema = paginationQuery.extend({
  category: z.enum(NOTIFICATION_CATEGORIES).optional(),
  unreadOnly: z.enum(["true", "false"]).optional(),
});

async function listNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { page, limit, category, unreadOnly } = req.query as unknown as z.infer<
      typeof listNotificationsQuerySchema
    >;

    const where: { userId: string; category?: string; readAt?: null } = { userId };
    if (category) where.category = category;
    if (unreadOnly === "true") where.readAt = null;

    const [total, unreadCount, notifications] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId, readAt: null } }),
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: { id: true, category: true, title: true, body: true, readAt: true, createdAt: true },
      }),
    ]);

    res.status(200).json({
      notifications: notifications.map((n) => ({
        id: n.id,
        category: n.category,
        title: n.title,
        body: n.body,
        isRead: n.readAt !== null,
        readAt: n.readAt,
        createdAt: n.createdAt,
      })),
      unreadCount,
      pagination: { page, limit, total },
    });
  } catch (err) {
    next(err);
  }
}

router.get("/", validateQuery(listNotificationsQuerySchema), listNotifications);

// GET /api/notifications/unread-count — badge count for the header bell.
async function unreadCount(req: Request, res: Response, next: NextFunction) {
  try {
    const unread = await prisma.notification.count({
      where: { userId: req.auth!.userId, readAt: null },
    });
    res.status(200).json({ unreadCount: unread });
  } catch (err) {
    next(err);
  }
}

router.get("/unread-count", unreadCount);

// PATCH /api/notifications/:id/read — mark one notification read. Unknown ids
// AND other users' ids both 404 (no existence/or ownership leak).
async function markRead(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params as unknown as z.infer<ReturnType<typeof uuidParam>>;
    const existing = await prisma.notification.findFirst({ where: { id, userId } });
    if (!existing) {
      throw new ApiError(404, "NOTIFICATION_NOT_FOUND", "No notification exists with this id.");
    }
    const updated =
      existing.readAt !== null
        ? existing
        : await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
    res.status(200).json({
      notification: {
        id: updated.id,
        category: updated.category,
        title: updated.title,
        body: updated.body,
        isRead: updated.readAt !== null,
        readAt: updated.readAt,
        createdAt: updated.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

router.patch("/:id/read", validateParams(uuidParam("id")), markRead);

// POST /api/notifications/read-all — mark all of the current user's read.
async function markAllRead(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await prisma.notification.updateMany({
      where: { userId: req.auth!.userId, readAt: null },
      data: { readAt: new Date() },
    });
    res.status(200).json({ updated: result.count });
  } catch (err) {
    next(err);
  }
}

router.post("/read-all", markAllRead);

export default router;

// Admin-issued notifications (manual ops / announcements). Mounted at
// /admin/notifications (see routes/index.ts) — same split-router pattern as
// activationCodes.routes.ts, since admin.routes.ts is admin-only gated.
const adminNotificationsRouter = Router();

adminNotificationsRouter.use(requireAuth);
adminNotificationsRouter.use(requireRole("admin", "super_admin"));

const adminCreateSchema = z.object({
  userId: z.string().uuid(),
  category: z.enum(NOTIFICATION_CATEGORIES),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(2000),
});

async function adminCreate(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body as z.infer<typeof adminCreateSchema>;
    const target = await prisma.user.findFirst({ where: { id: body.userId } });
    if (!target) {
      throw new ApiError(404, "USER_NOT_FOUND", "No user exists with this id.");
    }
    const created = await prisma.notification.create({
      data: { userId: body.userId, category: body.category, title: body.title, body: body.body },
      select: { id: true, category: true, title: true, body: true, readAt: true, createdAt: true },
    });
    res.status(201).json({
      notification: {
        id: created.id,
        category: created.category,
        title: created.title,
        body: created.body,
        isRead: false,
        readAt: null,
        createdAt: created.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

adminNotificationsRouter.post("/", validateBody(adminCreateSchema), adminCreate);

export { adminNotificationsRouter };
