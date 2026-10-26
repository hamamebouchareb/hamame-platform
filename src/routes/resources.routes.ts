import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { validateBody, validateQuery, validateParams } from "../middleware/validate";
import { requireRole } from "../middleware/requireRole";
import { uuidParam } from "../lib/common-schemas";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { resolveViewerUniversityId } from "../lib/university-scope";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { lockWalletRow, postWalletEntry } from "../lib/wallet";
import { createNotificationBestEffort } from "./notifications.routes";

const router = Router();

// Paid resources (priceJetons > 0) are sold for wallet jetons. Same
// server-side enforcement stance as exam mode: the fileUrl is withheld from
// the response for anyone who doesn't own it, not merely hidden by the client.
async function ownedResourceIds(userId: string | undefined, resourceIds: string[]): Promise<Set<string>> {
  if (!userId || resourceIds.length === 0) return new Set();
  const rows = await prisma.resourcePurchase.findMany({
    where: { userId, resourceId: { in: resourceIds } },
    select: { resourceId: true },
  });
  return new Set(rows.map((row) => row.resourceId));
}

function withAccess<T extends { id: string; fileUrl: string; priceJetons: number }>(resource: T, owned: Set<string>) {
  const isOwned = owned.has(resource.id);
  const unlocked = resource.priceJetons === 0 || isOwned;
  return { ...resource, fileUrl: unlocked ? resource.fileUrl : null, owned: isOwned, locked: !unlocked };
}

const VISIBLE_FACULTY_ROLLOUT_STATUSES = ["beta", "live"] as const;

function isVisibleFacultyStatus(rolloutStatus: string): boolean {
  return VISIBLE_FACULTY_ROLLOUT_STATUSES.includes(rolloutStatus as any);
}

const LIST_RESOURCE_QUERY_SCHEMA = z.object({
  faculty: z.string().uuid().optional(),
  year: z.string().uuid().optional(),
  type: z.enum(["official_drive", "reference", "past_exam", "other"]).optional(),
});

// GET /api/resources — List resources, filterable by faculty/year/type
// Public route (optionalAuth): guests can browse; signed-in students' university
// is read for potential scoping, but resources are faculty-/year-scoped only
// (no universityId column per the data-model design). Faculty rolloutStatus gate
// applies: only beta/live faculties are visible.
async function listResources(req: Request, res: Response, next: NextFunction) {
  try {
    const { faculty, year, type } = req.query as z.infer<typeof LIST_RESOURCE_QUERY_SCHEMA>;

    const viewerUniversityId = await resolveViewerUniversityId(prisma, req.auth?.userId);

    const where: any = {};

    if (faculty) {
      where.facultyId = { equals: faculty };
    }
    if (year) {
      where.yearId = { equals: year };
    }
    if (type) {
      where.type = { equals: type };
    }

    const resources = await prisma.resource.findMany({
      where,
      orderBy: { title: "asc" },
    });
    const owned = await ownedResourceIds(
      req.auth?.userId,
      resources.filter((r) => r.priceJetons > 0).map((r) => r.id)
    );

    res.status(200).json({ resources: resources.map((r) => withAccess(r, owned)) });
  } catch (err) {
    next(err);
  }
}

router.get("/", optionalAuth, validateQuery(LIST_RESOURCE_QUERY_SCHEMA), listResources);

// GET /api/resources/:id — Resource detail / download link
// optionalAuth so the viewer's university can be read without requiring login;
// the route itself stays public for guests.
async function getResourceDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    const resource = await prisma.resource.findUnique({
      where: { id },
      include: {
        faculty: { select: { id: true, name: true } },
        year: { select: { id: true, label: true } },
      },
    });
    if (!resource) {
      throw new ApiError(404, "RESOURCE_NOT_FOUND", "No resource exists with this id.");
    }

    // Faculty gate: only resources belonging to faculties with beta/live rollout
    // status are visible. planned faculties hide their resources.
    if (resource.facultyId) {
      const faculty = await prisma.faculty.findFirst({
        where: { id: resource.facultyId },
        select: { rolloutStatus: true },
      });
      if (!faculty || !isVisibleFacultyStatus(faculty.rolloutStatus)) {
        throw new ApiError(404, "RESOURCE_NOT_FOUND", "No resource exists with this id.");
      }
    }

    const owned = await ownedResourceIds(req.auth?.userId, resource.priceJetons > 0 ? [resource.id] : []);
    res.status(200).json({ resource: withAccess(resource, owned) });
  } catch (err) {
    next(err);
  }
}

router.get(
  "/:id",
  validateParams(uuidParam("id")),
  optionalAuth,
  getResourceDetail
);

// POST /api/resources/:id/purchase — spend jetons on a paid resource. The
// ledger refId is the resource id, so a double-click or retry can never
// charge twice; the purchase row's unique key backs the same rule.
async function purchaseResource(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params as { id: string };
    const resource = await prisma.resource.findUnique({
      where: { id },
      select: { id: true, title: true, priceJetons: true, fileUrl: true, facultyId: true },
    });
    if (!resource) {
      throw new ApiError(404, "RESOURCE_NOT_FOUND", "No resource exists with this id.");
    }
    if (resource.facultyId) {
      const faculty = await prisma.faculty.findFirst({ where: { id: resource.facultyId }, select: { rolloutStatus: true } });
      if (!faculty || !isVisibleFacultyStatus(faculty.rolloutStatus)) {
        throw new ApiError(404, "RESOURCE_NOT_FOUND", "No resource exists with this id.");
      }
    }
    if (resource.priceJetons === 0) {
      throw new ApiError(409, "RESOURCE_IS_FREE", "This resource is free.");
    }
    const already = await prisma.resourcePurchase.findUnique({
      where: { userId_resourceId: { userId, resourceId: id } },
    });
    if (already) {
      throw new ApiError(409, "ALREADY_OWNED", "You already own this resource.");
    }

    const balance = await prisma.$transaction(
      async (tx) => {
        const account = await lockWalletRow(tx, userId);
        if (account.balance < resource.priceJetons) {
          throw new ApiError(
            409,
            "INSUFFICIENT_JETONS",
            `You need ${resource.priceJetons} jetons; you have ${account.balance}.`
          );
        }
        const posted = await postWalletEntry(tx, {
          userId,
          reason: "resource_purchase",
          refId: resource.id,
          delta: -resource.priceJetons,
        });
        if (posted.status !== "posted") {
          throw new ApiError(409, "ALREADY_OWNED", "You already own this resource.");
        }
        await tx.$executeRaw`
          INSERT INTO "resource_purchases" ("id", "user_id", "resource_id", "price_jetons")
          VALUES (gen_random_uuid(), ${userId}::uuid, ${resource.id}::uuid, ${resource.priceJetons}::int)
          ON CONFLICT ("user_id", "resource_id") DO NOTHING`;
        return posted.balance;
      },
      { maxWait: 10000, timeout: 20000 }
    );

    await createNotificationBestEffort({
      userId,
      category: "prix",
      title: "Achat confirmé",
      body: `« ${resource.title} » est débloqué (${resource.priceJetons} jetons).`,
    });
    res.status(201).json({ resourceId: resource.id, fileUrl: resource.fileUrl, balance });
  } catch (err) {
    next(err);
  }
}

router.post("/:id/purchase", requireAuth, validateParams(uuidParam("id")), purchaseResource);

const PRICE_SCHEMA = z.object({ priceJetons: z.number().int().min(0).max(100_000) });

// PATCH /api/resources/:id/price — admin sets the jeton price (0 = free).
// Existing buyers keep access whatever the new price.
async function setResourcePrice(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as { id: string };
    const { priceJetons } = req.body as z.infer<typeof PRICE_SCHEMA>;
    const existing = await prisma.resource.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      throw new ApiError(404, "RESOURCE_NOT_FOUND", "No resource exists with this id.");
    }
    const resource = await prisma.resource.update({
      where: { id },
      data: { priceJetons },
      select: { id: true, title: true, priceJetons: true },
    });
    res.json({ resource });
  } catch (err) {
    next(err);
  }
}

router.patch(
  "/:id/price",
  requireAuth,
  requireRole("admin", "super_admin"),
  validateParams(uuidParam("id")),
  validateBody(PRICE_SCHEMA),
  setResourcePrice
);

export default router;