import crypto from "node:crypto";
import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { validateBody } from "../middleware/validate";
import { requireAuth } from "../middleware/auth";
import { stubHandler } from "../lib/stub";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";

// docs/hamame_api_contract.md — "Auth & Account" section (profile-related endpoints).
const router = Router();

router.use(requireAuth);

// Safe profile fields only — never include passwordHash.
const safeUserSelect = {
  id: true,
  email: true,
  phone: true,
  fullName: true,
  facultyId: true,
  yearId: true,
  university: true,
  universityId: true,
  wilaya: true,
  uiLanguage: true,
  theme: true,
  status: true,
  createdAt: true,
} as const;

// GET /api/users/me — current profile plus role names (for frontend role-aware UI).
async function getCurrentProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...safeUserSelect,
        userRoles: {
          select: { role: { select: { name: true } } },
        },
      },
    });

    if (!user) {
      throw new ApiError(404, "USER_NOT_FOUND", "User not found.");
    }

    const { userRoles, ...profile } = user;
    res.status(200).json({
      ...profile,
      roles: userRoles.map((ur) => ur.role.name),
    });
  } catch (err) {
    next(err);
  }
}

router.get("/me", getCurrentProfile);

// PUT /api/users/me — FR-4: full_name, faculty, year, university, wilaya, photo.
//
// universityId is what drives FR-10a content visibility (src/lib/university-scope.ts), so
// it is validated against the universities table rather than trusted: an unknown id must
// not be persisted, or the user would silently resolve to a scope that matches nothing.
// Passing null explicitly clears it, returning the user to global-content-only.
const updateProfileSchema = z.object({
  fullName: z.string().min(1).nullable().optional(),
  facultyId: z.string().uuid().nullable().optional(),
  yearId: z.string().uuid().nullable().optional(),
  university: z.string().min(1).nullable().optional(),
  universityId: z.string().uuid().nullable().optional(),
  wilaya: z.string().min(1).nullable().optional(),
  profilePhotoUrl: z.string().url().nullable().optional(),
});

async function updateCurrentProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const body = req.body as z.infer<typeof updateProfileSchema>;

    // Each referenced row is checked sequentially rather than with Promise.all, per the
    // session pooler's concurrency limit.
    if (body.facultyId) {
      const faculty = await prisma.faculty.findUnique({ where: { id: body.facultyId }, select: { id: true } });
      if (!faculty) {
        throw new ApiError(404, "FACULTY_NOT_FOUND", "No faculty exists with this id.");
      }
    }

    if (body.yearId) {
      const year = await prisma.year.findUnique({ where: { id: body.yearId }, select: { facultyId: true } });
      if (!year) {
        throw new ApiError(404, "YEAR_NOT_FOUND", "No year exists with this id.");
      }
      // A year belongs to exactly one faculty, so an inconsistent pair would leave the
      // profile describing a curriculum position that doesn't exist.
      const effectiveFacultyId =
        body.facultyId ??
        (await prisma.user.findUnique({ where: { id: userId }, select: { facultyId: true } }))?.facultyId;
      if (effectiveFacultyId && year.facultyId !== effectiveFacultyId) {
        throw new ApiError(400, "YEAR_FACULTY_MISMATCH", "This year does not belong to the selected faculty.");
      }
    }

    if (body.universityId) {
      const university = await prisma.university.findUnique({
        where: { id: body.universityId },
        select: { id: true },
      });
      if (!university) {
        throw new ApiError(404, "UNIVERSITY_NOT_FOUND", "No university exists with this id.");
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
      // Only keys actually present in the body are written, so omitting a field leaves it
      // untouched while an explicit null on universityId clears it.
      data: {
        ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
        ...(body.facultyId !== undefined ? { facultyId: body.facultyId } : {}),
        ...(body.yearId !== undefined ? { yearId: body.yearId } : {}),
        ...(body.university !== undefined ? { university: body.university } : {}),
        ...(body.universityId !== undefined ? { universityId: body.universityId } : {}),
        ...(body.wilaya !== undefined ? { wilaya: body.wilaya } : {}),
        ...(body.profilePhotoUrl !== undefined ? { profilePhotoUrl: body.profilePhotoUrl } : {}),
      },
      select: safeUserSelect,
    });

    res.status(200).json(user);
  } catch (err) {
    next(err);
  }
}

router.put("/me", validateBody(updateProfileSchema), updateCurrentProfile);

// PUT /api/users/me/preferences — FR-5, FR-6: language, theme, notification prefs.
const updatePreferencesSchema = z.object({
  uiLanguage: z.enum(["fr", "ar"]).optional(),
  theme: z.enum(["light", "dark"]).optional(),
  notificationPreferences: z
    .array(
      z.object({
        category: z.enum(["revision", "subscription", "content_update", "moderation", "social"]),
        channel: z.enum(["in_app", "email", "push"]),
        enabled: z.boolean(),
      })
    )
    .optional(),
});

router.put(
  "/me/preferences",
  validateBody(updatePreferencesSchema),
  stubHandler("Update preferences")
);

// GET /api/users/me/export — FR-8 / NFR-5: Law 18-07 data portability compliance (same
// legal category as the account-deletion endpoint below).
//
// Read-only snapshot of everything the requesting user owns, returned as a downloadable
// JSON attachment (Content-Disposition) so the data can be taken elsewhere. Deliberately
// no :id param — a user can only export their own data (req.auth.userId). All queries
// are read-only and scoped to the caller's id. NOTE: deliberately executed SEQUENTIALLY
// (one await at a time, no Promise.all) — this endpoint is not a hot path (a user
// exports rarely), and firing all queries concurrently trips the Supabase session
// pooler's connection limit (reproduced as intermittent P1001). Serial execution trades
// a little latency for reliability. The profile uses safeUserSelect (no passwordHash /
// no reset/verification token hashes).
async function exportCurrentUserData(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;

    const profile = await prisma.user.findUnique({ where: { id: userId }, select: safeUserSelect });

    const studySessions = await prisma.studySession.findMany({
      where: { userId },
      include: { sessionQuestions: { include: { attempts: true } } },
      orderBy: { createdAt: "desc" },
    });

    const notes = await prisma.note.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });

    const progress = await prisma.progress.findMany({ where: { userId }, orderBy: { lastStudiedAt: "desc" } });

    const streak = await prisma.streak.findUnique({ where: { userId } });

    const subscriptions = await prisma.subscription.findMany({
      where: { userId },
      include: { payments: true },
      orderBy: { startedAt: "desc" },
    });

    // Authored content: only identity/status fields + title (via lesson relation) —
    // deliberately no reviewer-only fields (reviewedBy/reviewedAt/reviewComment).
    const authoredLessonVersions = await prisma.lessonVersion.findMany({
      where: { authoredBy: userId },
      select: {
        id: true,
        lesson: { select: { title: true } },
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Same shape as lesson versions: identity + status fields. Questions have no title,
    // so type/source stand in as the identifying label.
    const authoredQuestions = await prisma.question.findMany({
      where: { authoredBy: userId },
      select: { id: true, type: true, source: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    const reports = await prisma.report.findMany({ where: { reporterUserId: userId }, orderBy: { createdAt: "desc" } });

    const notificationPreferences = await prisma.notificationPreference.findMany({ where: { userId } });

    if (!profile) {
      throw new ApiError(404, "USER_NOT_FOUND", "User not found.");
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="hamame-data-export-${userId}.json"`);
    res.status(200).json({
      exportedAt: new Date().toISOString(),
      profile,
      studySessions,
      notes,
      progress,
      streak,
      subscriptions,
      authoredContent: {
        lessonVersions: authoredLessonVersions,
        questions: authoredQuestions,
      },
      reports,
      notificationPreferences,
    });
  } catch (err) {
    next(err);
  }
}

router.get("/me/export", exportCurrentUserData);

// DELETE /api/users/me — FR-8 / NFR-5, per docs/hamame-user-deletion-policy.md Part 1.
//
// This is a SOFT delete, not `DELETE FROM users`: the row and its id stay intact (so
// every FK referencing it — subscriptions, payments, authored content, moderation
// reports — stays valid), status flips to 'deleted', and PII fields are scrubbed to
// anonymized placeholders. email/phone placeholders embed the user's id to satisfy
// their @unique constraints across multiple deleted accounts.
async function deleteCurrentUser(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;

    const anonymizedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        status: "deleted",
        email: `deleted-${userId}@hamame.invalid`,
        phone: `deleted-${userId}`,
        fullName: "Deleted User",
        profilePhotoUrl: null,
        // Invalidates the password outright — no real hash could ever match this.
        passwordHash: crypto.randomBytes(32).toString("hex"),
      },
      select: { id: true, status: true },
    });

    res.status(200).json({ id: anonymizedUser.id, status: anonymizedUser.status });
  } catch (err) {
    next(err);
  }
}

router.delete("/me", deleteCurrentUser);

export default router;
