import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { paginationQuery, uuidParam } from "../lib/common-schemas";
import { validateParams, validateQuery } from "../middleware/validate";
import { prisma } from "../lib/prisma";

// ---------------------------------------------------------------------------
// /api/associations — the PUBLIC, unauthenticated directory endpoint group
// (medspark.online community parity). Curated by admins only (see the admin
// counterparts in admin.routes.ts); here it is listing + detail with filter
// support. Verified rows come first, then most recently updated — the ranking
// encodes "the team vouches for this row" without a popularity model yet.
// ---------------------------------------------------------------------------
const router = Router();

// "Verified first" ordering CANNOT be one `orderBy: [{ verifiedAt: "desc" }]`
// call: Postgres sorts NULLs FIRST on DESC, so unverified rows would rank
// above verified ones — exactly the inverse of the intended ranking (caught
// live by the associations verification run). Two pools + manual pagination
// keeps the contract honest: verified pool ordered by verifiedAt desc, then
// unverified pool by updatedAt desc, sliced by (page, limit) across their
// concatenation.
const listQuerySchema = paginationQuery.extend({
  wilaya: z.string().trim().min(1).max(60).optional(),
  type: z.enum(["student_union", "charity", "club", "network"]).optional(),
  verified: z.enum(["true", "false"]).optional(),
});

function baseWhere(wilaya?: string, type?: "student_union" | "charity" | "club" | "network") {
  return {
    ...(wilaya ? { wilaya } : {}),
    ...(type ? { type } : {}),
  };
}

async function listAssociations(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, wilaya, type, verified } = req.query as unknown as {
      page: number;
      limit: number;
      wilaya?: string;
      type?: "student_union" | "charity" | "club" | "network";
      verified?: "true" | "false";
    };

    // The verified=true/false filter itself still maps directly.
    const verifiedOnly = verified === "true";
    const unverifiedOnly = verified === "false";
    const base = baseWhere(wilaya, type);
    if (verifiedOnly || unverifiedOnly) {
      const where = { ...base, ...(verifiedOnly ? { verifiedAt: { not: null } } : { verifiedAt: null }) };
      const [rows, total] = await Promise.all([
        prisma.studentAssociation.findMany({
          where,
          orderBy: verifiedOnly ? { verifiedAt: "desc" } : { updatedAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.studentAssociation.count({ where }),
      ]);
      res.json({
        associations: rows.map((row) => ({ ...row, verified: row.verifiedAt !== null })),
        pagination: { page, limit, total },
      });
      return;
    }

    const where = base;
    const offset = (page - 1) * limit;
    // Sequential (not Promise.all) per the pooler guidance in AGENTS.md.
    const verifiedCount = await prisma.studentAssociation.count({ where: { ...where, verifiedAt: { not: null } } });
    const unverifiedCount = await prisma.studentAssociation.count({ where: { ...where, verifiedAt: null } });
    const total = verifiedCount + unverifiedCount;

    // Slice 1: the rows the page takes from the verified pool.
    const verifiedTake = Math.max(0, Math.min(limit, verifiedCount - offset));
    const verifiedRows = verifiedTake > 0
      ? await prisma.studentAssociation.findMany({
          where: { ...where, verifiedAt: { not: null } },
          orderBy: { verifiedAt: "desc" },
          skip: offset,
          take: verifiedTake,
        })
      : [];

    // Slice 2: the remainder from the unverified pool.
    const unverifiedSkip = Math.max(0, offset - verifiedCount);
    const unverifiedTake = Math.max(0, limit - verifiedRows.length);
    const unverifiedRows = unverifiedTake > 0
      ? await prisma.studentAssociation.findMany({
          where: { ...where, verifiedAt: null },
          orderBy: { updatedAt: "desc" },
          skip: unverifiedSkip,
          take: unverifiedTake,
        })
      : [];

    const rows = [...verifiedRows, ...unverifiedRows];
    res.json({
      associations: rows.map((row) => ({ ...row, verified: row.verifiedAt !== null })),
      pagination: { page, limit, total },
    });
  } catch (err) {
    next(err);
  }
}

async function getAssociation(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as unknown as { id: string };
    const row = await prisma.studentAssociation.findUnique({ where: { id } });
    if (!row) {
      res.status(404).json({ error: { code: "ASSOCIATION_NOT_FOUND", message: "No association exists with this id." } });
      return;
    }
    res.json({ association: { ...row, verified: row.verifiedAt !== null } });
  } catch (err) {
    next(err);
  }
}

router.get("/", validateQuery(listQuerySchema), listAssociations);
router.get("/:id", validateParams(uuidParam("id")), getAssociation);

export default router;
