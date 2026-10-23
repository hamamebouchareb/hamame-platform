import { randomUUID } from "crypto";
import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { paginationQuery, uuidParam } from "../lib/common-schemas";
import { validateBody, validateParams, validateQuery } from "../middleware/validate";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { createNotificationBestEffort } from "./notifications.routes";
import { awardBadgeIdempotent } from "../lib/badge-awards";
import { awardPoints, lockPointsRow, utcDateRef } from "../lib/points";

// ---------------------------------------------------------------------------
// /api/points — Hamame's points economy (medspark.online-parity, Sparx
// equivalent without any real-money rail). Earn rules live in src/lib/points.ts;
// the shop maps onto the only two durable mechanisms Hamame already has:
// plan-day subscription grants and one-time badge grants.
// ---------------------------------------------------------------------------
const router = Router();
router.use(requireAuth);

const requireAdmin = requireRole("admin", "super_admin");
const SHOP_KINDS = ["plan_days", "badge"] as const;
type ShopKind = (typeof SHOP_KINDS)[number];

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

function serializeItem(item: {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  costPoints: number;
  amount: number;
  planId: string | null;
  badgeId: string | null;
  isActive: boolean;
  plan?: { id: string; name: string } | null;
  badge?: { id: string; name: string } | null;
}) {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    kind: item.kind,
    costPoints: item.costPoints,
    amount: item.amount,
    planId: item.planId,
    badgeId: item.badgeId,
    isActive: item.isActive,
    planName: item.plan?.name ?? null,
    badgeName: item.badge?.name ?? null,
  };
}

// GET /api/points — the caller's account, created lazily on first touch.
async function getPointsAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const account = await prisma.pointsAccount.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    res.json({
      balance: account.balance,
      earnedTotal: account.earnedTotal,
      spentTotal: account.spentTotal,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/points/claim-daily — once per UTC day (ledger (user, reason, date)
// unique key makes this idempotent; a replay returns the unchanged balance).
async function claimDaily(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const result = await prisma.$transaction(async (tx) =>
      awardPoints(tx, { userId, reason: "daily_bonus", refId: utcDateRef(), delta: 5 })
    );
    res.status(result.status === "awarded" ? 201 : 200).json({
      status: result.status,
      balance: result.balance,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/points/ledger — the caller's own movement history, newest first.
async function listLedger(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { page, limit } = req.query as unknown as { page: number; limit: number };
    const [rows, total] = await Promise.all([
      prisma.pointsLedger.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.pointsLedger.count({ where: { userId } }),
    ]);
    res.json({
      ledger: rows.map((row) => ({
        id: row.id,
        delta: row.delta,
        reason: row.reason,
        balanceAfter: row.balanceAfter,
        createdAt: row.createdAt,
      })),
      pagination: { page, limit, total },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/points/shop — active items only (admin CRUD below sees inactive ones too).
async function listShop(req: Request, res: Response, next: NextFunction) {
  try {
    const items = await prisma.pointsShopItem.findMany({
      where: { isActive: true },
      orderBy: { costPoints: "asc" },
      include: { plan: { select: { id: true, name: true } }, badge: { select: { id: true, name: true } } },
    });
    res.json({ items: items.map(serializeItem) });
  } catch (err) {
    next(err);
  }
}

// POST /api/points/shop/:itemId/redeem — spend points on a durable grant.
// The whole mutation (ledger claim + account drop + subscription/badge grant +
// redemption audit row) is one transaction: a grant failure rolls the spend
// back. The ledger spend row keys off a fresh UUID so concurrent replays can
// never alias onto an older redemption.
async function redeemItem(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { itemId } = req.params as unknown as { itemId: string };

    const item = await prisma.pointsShopItem.findUnique({ where: { id: itemId } });
    if (!item || !item.isActive) {
      throw new ApiError(404, "SHOP_ITEM_NOT_FOUND", "This shop item does not exist.");
    }
    if (item.kind === "plan_days" && !item.planId) {
      throw new ApiError(500, "SHOP_ITEM_UNCONFIGURED", "plan_days item has no plan configured.");
    }
    if (item.kind === "badge" && !item.badgeId) {
      throw new ApiError(500, "SHOP_ITEM_UNCONFIGURED", "badge item has no badge configured.");
    }
    if (item.kind === "badge" && item.badgeId) {
      const alreadyOwned = await prisma.userBadge.findUnique({
        where: { userId_badgeId: { userId, badgeId: item.badgeId } },
      });
      if (alreadyOwned) {
        throw new ApiError(409, "ALREADY_OWNED", "You already own this badge.");
      }
    }

    const granted = await prisma.$transaction(async (tx) => {
      const account = await lockPointsRow(tx, userId);
      if (account.balance < item.costPoints) {
        throw new ApiError(
          409,
          "INSUFFICIENT_POINTS",
          `You need ${item.costPoints} points; you have ${account.balance}.`
        );
      }
      // Spend first (claims the ledger row), grant second: if the grant throws,
      // the transaction rolls back and the balance is untouched.
      const awarded = await awardPoints(tx, {
        userId,
        reason: "shop_redeem",
        refId: randomUUID(),
        delta: -item.costPoints,
      });

      let subscriptionId: string | null = null;
      if (item.kind === "plan_days" && item.planId) {
        const now = new Date();
        const activeSubscription = await tx.subscription.findFirst({
          where: { userId, status: "active" },
        });
        // Same extend-or-create + plan-switch semantics as the activation-code
        // redeem path (src/routes/activationCodes.routes.ts): a stale still-
        // 'active' row gets a full period anyway; a healthy future expiry
        // extends from itself; a non-matching plan is switched onto the
        // rewarded plan.
        if (activeSubscription) {
          const base = activeSubscription.currentPeriodEnd > now ? activeSubscription.currentPeriodEnd : now;
          const updated = await tx.subscription.update({
            where: { id: activeSubscription.id },
            data: {
              ...(activeSubscription.planId !== item.planId ? { planId: item.planId } : {}),
              currentPeriodEnd: addDays(base, item.amount),
            },
          });
          subscriptionId = updated.id;
        } else {
          const created = await tx.subscription.create({
            data: {
              userId,
              planId: item.planId,
              status: "active",
              startedAt: now,
              currentPeriodEnd: addDays(now, item.amount),
              autoRenew: true,
            },
          });
          subscriptionId = created.id;
        }
      }

      if (item.kind === "badge" && item.badgeId) {
        const { created } = await awardBadgeIdempotent(tx, userId, item.badgeId);
        if (!created) {
          // Concurrent duplicate — aborting rolls the point spend back.
          throw new ApiError(409, "ALREADY_OWNED", "This badge was already granted.");
        }
      }

      const redemption = await tx.pointsRedemption.create({
        data: { userId, itemId: item.id, costPoints: item.costPoints },
      });
      return {
        redemptionId: redemption.id,
        grantedAt: redemption.grantedAt,
        balance: awarded.balance,
        subscriptionId,
      };
    });

    await createNotificationBestEffort({
      userId,
      category: "prix",
      title: "Points dépensés",
      body: `Vous avez échangé ${item.costPoints} points contre « ${item.name} ».`,
    });

    res.status(201).json({
      redemptionId: granted.redemptionId,
      grantedAt: granted.grantedAt,
      balance: granted.balance,
      subscriptionId: granted.subscriptionId || null,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/points/redemptions — the caller's purchase history.
async function listMyRedemptions(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { page, limit } = req.query as unknown as { page: number; limit: number };
    const [rows, total] = await Promise.all([
      prisma.pointsRedemption.findMany({
        where: { userId },
        orderBy: { grantedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { item: { select: { name: true, kind: true } } },
      }),
      prisma.pointsRedemption.count({ where: { userId } }),
    ]);
    res.json({
      redemptions: rows.map((row) => ({
        id: row.id,
        itemName: row.item?.name ?? "(deleted item)",
        kind: row.item?.kind ?? null,
        costPoints: row.costPoints,
        grantedAt: row.grantedAt,
      })),
      pagination: { page, limit, total },
    });
  } catch (err) {
    next(err);
  }
}

// --- admin surface ----------------------------------------------------------

const shopItemBody = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  kind: z.enum(SHOP_KINDS),
  costPoints: z.number().int().min(1).max(1_000_000),
  amount: z.number().int().min(1).max(365).optional(),
  planId: z.string().uuid().optional(),
  badgeId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
});

function assertKindInvariants(kind: ShopKind, body: { planId?: string; badgeId?: string }) {
  if (kind === "plan_days" && !body.planId) {
    throw new ApiError(400, "PLAN_REQUIRED", "plan_days items require planId.");
  }
  if (kind === "badge" && !body.badgeId) {
    throw new ApiError(400, "BADGE_REQUIRED", "badge items require badgeId.");
  }
}

async function createShopItem(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body as {
      name: string;
      description?: string | null;
      kind: ShopKind;
      costPoints: number;
      amount?: number;
      planId?: string;
      badgeId?: string;
      isActive?: boolean;
    };
    assertKindInvariants(body.kind, body);
    if (body.kind === "plan_days" && body.planId) {
      const plan = await prisma.plan.findFirst({ where: { id: body.planId, isActive: true } });
      if (!plan) {
        throw new ApiError(400, "PLAN_NOT_FOUND", "No active plan with this id exists.");
      }
    }
    if (body.kind === "badge" && body.badgeId) {
      const badge = await prisma.badge.findUnique({ where: { id: body.badgeId } });
      if (!badge) {
        throw new ApiError(400, "BADGE_NOT_FOUND", "No badge with this id exists.");
      }
    }
    const item = await prisma.pointsShopItem.create({
      data: {
        name: body.name,
        description: body.description ?? undefined,
        kind: body.kind,
        costPoints: body.costPoints,
        amount: body.amount ?? 1,
        planId: body.planId,
        badgeId: body.badgeId,
        isActive: body.isActive ?? true,
      },
      include: { plan: { select: { id: true, name: true } }, badge: { select: { id: true, name: true } } },
    });
    res.status(201).json({ item: serializeItem(item) });
  } catch (err) {
    next(err);
  }
}

async function updateShopItem(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as unknown as { id: string };
    const body = req.body as Partial<{ description: string | null; costPoints: number; amount: number; planId: string; badgeId: string; isActive: boolean; name: string }>;
    const existing = await prisma.pointsShopItem.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiError(404, "SHOP_ITEM_NOT_FOUND", "This shop item does not exist.");
    }
    const nextKind = existing.kind as ShopKind;
    assertKindInvariants(nextKind, {
      planId: body.planId ?? existing.planId ?? undefined,
      badgeId: body.badgeId ?? existing.badgeId ?? undefined,
    });
    const item = await prisma.pointsShopItem.update({
      where: { id },
      data: body,
      include: { plan: { select: { id: true, name: true } }, badge: { select: { id: true, name: true } } },
    });
    res.json({ item: serializeItem(item) });
  } catch (err) {
    next(err);
  }
}

async function deleteShopItem(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as unknown as { id: string };
    const redemptions = await prisma.pointsRedemption.count({ where: { itemId: id } });
    if (redemptions > 0) {
      // FK restrict would throw P2003 — a redeemed item is history, so it goes
      // inactive instead of disappearing from redemption records.
      await prisma.pointsShopItem.update({ where: { id }, data: { isActive: false } });
      res.status(200).json({ id, isActive: false, message: "Item has redemptions; deactivated in place." });
      return;
    }
    await prisma.pointsShopItem.delete({ where: { id } });
    res.status(200).json({ id, deleted: true });
  } catch (err) {
    next(err);
  }
}

async function grantPoints(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body as { userId: string; delta: number };
    const target = await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true, status: true } });
    if (!target || target.status === "deleted") {
      throw new ApiError(404, "USER_NOT_FOUND", "No active user with this id exists.");
    }
    const result = await prisma.$transaction(async (tx) =>
      awardPoints(tx, {
        userId: body.userId,
        reason: "admin_grant",
        refId: randomUUID(),
        delta: body.delta,
      })
    );
    await createNotificationBestEffort({
      userId: body.userId,
      category: "prix",
      title: "Crédit de points",
      body: `${body.delta} points ont été ajoutés à votre compte par l'équipe Hamame.`,
    });
    res.status(201).json({ status: result.status, balance: result.balance });
  } catch (err) {
    next(err);
  }
}

const adminRedemptionsQuery = paginationQuery.extend({
  userId: z.string().uuid().optional(),
});

async function listAdminRedemptions(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, userId } = req.query as unknown as { page: number; limit: number; userId?: string };
    const where = userId ? { user: { id: userId } } : {};
    const [rows, total] = await Promise.all([
      prisma.pointsRedemption.findMany({
        where,
        orderBy: { grantedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          item: { select: { name: true, kind: true } },
          user: { select: { id: true, email: true, fullName: true } },
        },
      }),
      prisma.pointsRedemption.count({ where }),
    ]);
    res.json({
      redemptions: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        userEmail: row.user?.email ?? null,
        itemName: row.item?.name ?? "(deleted item)",
        kind: row.item?.kind ?? null,
        costPoints: row.costPoints,
        grantedAt: row.grantedAt,
      })),
      pagination: { page, limit, total },
    });
  } catch (err) {
    next(err);
  }
}

const grantBody = z.object({
  userId: z.string().uuid(),
  delta: z.number().int().min(1).max(1_000_000),
});

router.get("/", getPointsAccount);
router.post("/claim-daily", claimDaily);
router.get("/ledger", validateQuery(paginationQuery), listLedger);
router.get("/shop", listShop);
router.post(
  "/shop/:itemId/redeem",
  validateParams(uuidParam("itemId")),
  redeemItem
);
router.get("/redemptions", validateQuery(paginationQuery), listMyRedemptions);

router.use("/admin", requireAdmin);
router.post("/admin/shop-items", validateBody(shopItemBody), createShopItem);
router.patch("/admin/shop-items/:id", validateParams(uuidParam("id")), validateBody(shopItemBody.partial()), updateShopItem);
router.delete("/admin/shop-items/:id", validateParams(uuidParam("id")), deleteShopItem);
router.post("/admin/grant", validateBody(grantBody), grantPoints);
router.get("/admin/redemptions", validateQuery(adminRedemptionsQuery), listAdminRedemptions);

export default router;
