import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { validateBody } from "../middleware/validate";
import { requireAuth } from "../middleware/auth";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";

// Self-service "Apply as Instructor" — the only non-admin path toward the instructor
// role. A logged-in user submits an application; an admin approves/rejects it via
// /api/admin/instructor-applications (which grants the role on approval). Only the
// user-facing half lives here — the admin half is in admin.routes.ts.
const router = Router();

router.use(requireAuth);

// POST /api/instructor-applications — submit an application.
const createApplicationSchema = z.object({
  // Require some real content (a bare one-liner isn't a viable application).
  motivationText: z.string().min(20),
});

async function createApplication(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { motivationText } = req.body as z.infer<typeof createApplicationSchema>;

    // Already an instructor → nothing to apply for. Defensive 404 on the role row
    // (shouldn't happen post-seed) keeps the error explicit rather than an FK failure.
    const instructorRole = await prisma.role.findUnique({ where: { name: "instructor" } });
    if (!instructorRole) {
      throw new ApiError(404, "ROLE_NOT_FOUND", "No 'instructor' role exists.");
    }
    const alreadyInstructor = await prisma.userRole.findUnique({
      where: { userId_roleId: { userId, roleId: instructorRole.id } },
    });
    if (alreadyInstructor) {
      throw new ApiError(400, "ALREADY_INSTRUCTOR", "You already hold the instructor role.");
    }

    // One pending application at a time — no spamming duplicates while a decision is out.
    const pendingApplication = await prisma.instructorApplication.findFirst({
      where: { userId, status: "pending" },
    });
    if (pendingApplication) {
      throw new ApiError(409, "APPLICATION_ALREADY_PENDING", "You already have a pending application.");
    }

    const application = await prisma.instructorApplication.create({
      data: { userId, motivationText },
    });

    res.status(201).json({ application });
  } catch (err) {
    next(err);
  }
}

router.post("/", validateBody(createApplicationSchema), createApplication);

// GET /api/instructor-applications/me — the caller's own applications, newest first, so
// they can check status without bothering an admin.
async function getMyApplications(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const applications = await prisma.instructorApplication.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    res.status(200).json({ applications });
  } catch (err) {
    next(err);
  }
}

router.get("/me", getMyApplications);

export default router;
