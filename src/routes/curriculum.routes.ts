import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { validateParams, validateQuery } from "../middleware/validate";
import { uuidParam } from "../lib/common-schemas";
import { optionalAuth } from "../middleware/auth";
import { resolveViewerUniversityId, universityScopeFilter } from "../lib/university-scope";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";

// docs/hamame_api_contract.md — "Curriculum" section. Faculty → Year → Module → Unit →
// Lesson, per FR-9/FR-10. Left public (no requireAuth) so guests can browse per the
// Guest role description in the PRD (Section 6) — revisit if that assumption is wrong.
const router = Router();

// Faculties with this status are never visible here. No admin auth exists yet (see
// src/middleware/auth.ts), so there is currently no way to lift this — revisit once
// an admin role check exists.
const VISIBLE_ROLLOUT_STATUSES = ["beta", "live"] as const;

function isVisibleFacultyStatus(rolloutStatus: string): boolean {
  return (VISIBLE_ROLLOUT_STATUSES as readonly string[]).includes(rolloutStatus);
}

const FACULTY_NOT_FOUND = () =>
  new ApiError(404, "FACULTY_NOT_FOUND", "No faculty exists with this id.");

// GET /api/faculties — rollout_status filter.
const listFacultiesQuerySchema = z.object({
  rolloutStatus: z.enum(["planned", "beta", "live"]).optional(),
});

async function listFaculties(req: Request, res: Response, next: NextFunction) {
  try {
    const { rolloutStatus } = req.query as unknown as z.infer<typeof listFacultiesQuerySchema>;

    // Intersecting with VISIBLE_ROLLOUT_STATUSES means a request for rolloutStatus=planned
    // resolves to an empty `in` list (i.e. no results) rather than leaking planned faculties.
    const statusesToReturn: readonly string[] = rolloutStatus
      ? VISIBLE_ROLLOUT_STATUSES.filter((s) => s === rolloutStatus)
      : VISIBLE_ROLLOUT_STATUSES;

    const faculties = await prisma.faculty.findMany({
      where: { rolloutStatus: { in: [...statusesToReturn] } },
      orderBy: { name: "asc" },
    });

    res.status(200).json({ faculties });
  } catch (err) {
    next(err);
  }
}

router.get("/faculties", validateQuery(listFacultiesQuerySchema), listFaculties);

// GET /api/faculties/:id/years
async function listYearsForFaculty(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    // Non-existent and hidden ('planned') faculties both resolve to the same 404 here,
    // so a single query covering both cases is enough — no need to distinguish them.
    const faculty = await prisma.faculty.findFirst({
      where: { id, rolloutStatus: { in: [...VISIBLE_ROLLOUT_STATUSES] } },
      select: { id: true },
    });
    if (!faculty) {
      throw FACULTY_NOT_FOUND();
    }

    const years = await prisma.year.findMany({
      where: { facultyId: id },
      orderBy: { orderIndex: "asc" },
    });

    res.status(200).json({ years });
  } catch (err) {
    next(err);
  }
}

router.get("/faculties/:id/years", validateParams(uuidParam("id")), listYearsForFaculty);

// GET /api/years/:id/modules
async function listModulesForYear(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    const year = await prisma.year.findUnique({
      where: { id },
      select: { id: true, faculty: { select: { rolloutStatus: true } } },
    });
    if (!year) {
      throw new ApiError(404, "YEAR_NOT_FOUND", "No year exists with this id.");
    }
    if (!isVisibleFacultyStatus(year.faculty.rolloutStatus)) {
      throw FACULTY_NOT_FOUND();
    }

    const modules = await prisma.module.findMany({
      where: { yearId: id },
      orderBy: { orderIndex: "asc" },
    });

    res.status(200).json({ modules });
  } catch (err) {
    next(err);
  }
}

router.get("/years/:id/modules", validateParams(uuidParam("id")), listModulesForYear);

// GET /api/modules/:id/units
async function listUnitsForModule(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    const courseModule = await prisma.module.findUnique({
      where: { id },
      select: { id: true, year: { select: { faculty: { select: { rolloutStatus: true } } } } },
    });
    if (!courseModule) {
      throw new ApiError(404, "MODULE_NOT_FOUND", "No module exists with this id.");
    }
    if (!isVisibleFacultyStatus(courseModule.year.faculty.rolloutStatus)) {
      throw FACULTY_NOT_FOUND();
    }

    const units = await prisma.unit.findMany({
      where: { moduleId: id },
      orderBy: { orderIndex: "asc" },
    });

    res.status(200).json({ units });
  } catch (err) {
    next(err);
  }
}

router.get("/modules/:id/units", validateParams(uuidParam("id")), listUnitsForModule);

// GET /api/units/:id/lessons — summary only (id, title, contentTier); full body lives
// behind GET /api/lessons/:id.
async function listLessonsForUnit(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    const unit = await prisma.unit.findUnique({
      where: { id },
      select: {
        id: true,
        module: { select: { year: { select: { faculty: { select: { rolloutStatus: true } } } } } },
      },
    });
    if (!unit) {
      throw new ApiError(404, "UNIT_NOT_FOUND", "No unit exists with this id.");
    }
    if (!isVisibleFacultyStatus(unit.module.year.faculty.rolloutStatus)) {
      throw FACULTY_NOT_FOUND();
    }

    // FR-10a university gate, ANDed with the faculty gate checked above. Applied
    // unconditionally: this route is public, and an anonymous caller (or a student with no
    // university set) resolves to null, meaning global lessons only.
    const viewerUniversityId = await resolveViewerUniversityId(prisma, req.auth?.userId);

    const lessons = await prisma.lesson.findMany({
      where: { unitId: id, AND: [universityScopeFilter(viewerUniversityId)] },
      select: { id: true, title: true, contentTier: true },
    });

    res.status(200).json({ lessons });
  } catch (err) {
    next(err);
  }
}

// optionalAuth so a signed-in student's university can be read for the FR-10a gate; the
// route itself stays public for guests.
router.get("/units/:id/lessons", optionalAuth, validateParams(uuidParam("id")), listLessonsForUnit);

// GET /api/lessons/:id — current approved version only, for students.
async function getLessonDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    // findFirst, not findUnique, so the FR-10a scope predicate can be ANDed onto the id
    // lookup: a lesson scoped to another university 404s here, staying indistinguishable
    // from a missing one — the same rule already applied to hidden faculties below.
    const viewerUniversityId = await resolveViewerUniversityId(prisma, req.auth?.userId);

    const lesson = await prisma.lesson.findFirst({
      where: { id, AND: [universityScopeFilter(viewerUniversityId)] },
      include: {
        unit: { select: { module: { select: { year: { select: { faculty: { select: { rolloutStatus: true } } } } } } } },
      },
    });
    if (!lesson) {
      throw new ApiError(404, "LESSON_NOT_FOUND", "No lesson exists with this id.");
    }
    if (!isVisibleFacultyStatus(lesson.unit.module.year.faculty.rolloutStatus)) {
      throw FACULTY_NOT_FOUND();
    }
    if (!lesson.currentVersionId) {
      throw new ApiError(404, "LESSON_NOT_PUBLISHED", "This lesson has no published version yet.");
    }

    const currentVersion = await prisma.lessonVersion.findUnique({
      where: { id: lesson.currentVersionId },
    });
    if (!currentVersion) {
      // Data-integrity edge case: currentVersionId points at a row that no longer
      // exists. Still a 404 to the client, not a broken/empty response.
      throw new ApiError(404, "LESSON_NOT_PUBLISHED", "This lesson has no published version yet.");
    }

    // Progress tracking, FR-22 — only when a valid token happens to be present (this
    // endpoint stays public/unauthenticated otherwise; anonymous browsing must keep
    // working exactly as before). "Viewed the lesson" == "completed" is a deliberate
    // simplification for now, not partial-reading tracking. Keyed on the
    // @@unique([userId, lessonId]) constraint so concurrent views can't race into
    // duplicate Progress rows.
    if (req.auth?.userId) {
      await prisma.progress.upsert({
        where: {
          userId_lessonId: {
            userId: req.auth.userId,
            lessonId: lesson.id,
          },
        },
        create: {
          userId: req.auth.userId,
          lessonId: lesson.id,
          percentage: 100,
          lastStudiedAt: new Date(),
        },
        update: {
          percentage: 100,
          lastStudiedAt: new Date(),
        },
      });
    }

    res.status(200).json({
      id: lesson.id,
      unitId: lesson.unitId,
      title: lesson.title,
      contentTier: lesson.contentTier,
      createdAt: lesson.createdAt,
      currentVersion: {
        id: currentVersion.id,
        versionNumber: currentVersion.versionNumber,
        status: currentVersion.status,
        bodyRichtext: currentVersion.bodyRichtext,
        reviewedAt: currentVersion.reviewedAt,
        createdAt: currentVersion.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

router.get("/lessons/:id", optionalAuth, validateParams(uuidParam("id")), getLessonDetail);

export default router;
