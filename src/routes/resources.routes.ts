import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { validateQuery, validateParams } from "../middleware/validate";
import { uuidParam } from "../lib/common-schemas";
import { optionalAuth } from "../middleware/auth";
import { resolveViewerUniversityId } from "../lib/university-scope";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";

const router = Router();

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

    res.status(200).json({ resources });
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

    res.status(200).json({ resource });
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

export default router;