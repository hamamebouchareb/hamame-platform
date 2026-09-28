import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { validateBody, validateParams, validateQuery } from "../middleware/validate";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { uuidParam } from "../lib/common-schemas";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { buildSessionForUser } from "./sessions.routes";

// Scheduled simulations (P12 big half): exam events students register for,
// then take as official-mock sessions while live.
//
// Status is DERIVED from scheduledAt/durationMinutes/cancelledAt — never
// stored, so no cron/job is needed for transitions:
//   cancelled — cancelledAt set (admin-cancelled, terminal)
//   completed — now past the end
//   live      — now inside [start, end]
//   scheduled — now before the start
export type SimulationStatus = "scheduled" | "live" | "completed" | "cancelled";

export function simulationStatusOf(sim: {
  scheduledAt: Date;
  durationMinutes: number;
  cancelledAt: Date | null;
}): { status: SimulationStatus; endsAt: Date } {
  const endsAt = new Date(sim.scheduledAt.getTime() + sim.durationMinutes * 60_000);
  if (sim.cancelledAt !== null) return { status: "cancelled", endsAt };
  const now = new Date();
  if (now < sim.scheduledAt) return { status: "scheduled", endsAt };
  if (now > endsAt) return { status: "completed", endsAt };
  return { status: "live", endsAt };
}

const router = Router();

const listQuerySchema = z.object({
  facultyId: z.string().uuid().optional(),
  yearId: z.string().uuid().optional(),
  status: z.enum(["scheduled", "live", "completed", "cancelled"]).optional(),
});

// GET /api/simulations — upcoming/live/past scheduled exams. Public
// (optionalAuth): guests see the catalog; signed-in students also see their
// own registration flags. Only beta/live faculties are listed — a sim under
// a hidden faculty is indistinguishable from a missing one (same convention
// as the curriculum and question-list gates).
async function listSimulations(req: Request, res: Response, next: NextFunction) {
  try {
    const { facultyId, yearId, status } = req.query as z.infer<typeof listQuerySchema>;
    const viewerId = req.auth?.userId ?? null;

    const sims = await prisma.simulation.findMany({
      where: {
        ...(facultyId ? { facultyId } : {}),
        ...(yearId ? { yearId } : {}),
        faculty: { rolloutStatus: { in: ["beta", "live"] } },
      },
      include: {
        faculty: { select: { id: true, name: true } },
        year: { select: { id: true, label: true } },
        _count: { select: { registrations: true } },
        ...(viewerId
          ? { registrations: { where: { userId: viewerId }, select: { id: true } } }
          : {}),
      },
      orderBy: { scheduledAt: "asc" },
    });

    const items = sims
      .map((sim) => {
        const { status: derived, endsAt } = simulationStatusOf(sim);
        return {
          id: sim.id,
          title: sim.title,
          description: sim.description,
          faculty: sim.faculty,
          year: sim.year,
          scheduledAt: sim.scheduledAt,
          endsAt,
          durationMinutes: sim.durationMinutes,
          questionCount: sim.questionCount,
          status: derived,
          registeredCount: sim._count.registrations,
          registered:
            viewerId !== null ? (sim as { registrations?: { id: string }[] }).registrations!.length > 0 : false,
        };
      })
      .filter((item) => (status ? item.status === status : true));

    // Live first, then scheduled, then the terminal states — the action that
    // matters (starting now) always sorts to the top.
    const rank = { live: 0, scheduled: 1, completed: 2, cancelled: 3 } as const;
    items.sort(
      (a, b) => rank[a.status] - rank[b.status] || a.scheduledAt.getTime() - b.scheduledAt.getTime()
    );

    res.status(200).json({ simulations: items });
  } catch (err) {
    next(err);
  }
}

router.get("/", optionalAuth, validateQuery(listQuerySchema), listSimulations);

// Shared lookup: sim must exist AND sit under a visible faculty, otherwise an
// indistinguishable 404 (same convention as lessons/questions).
async function findVisibleSimulation(id: string) {
  const sim = await prisma.simulation.findFirst({
    where: { id, faculty: { rolloutStatus: { in: ["beta", "live"] } } },
    include: {
      faculty: { select: { id: true, name: true } },
      year: { select: { id: true, label: true } },
    },
  });
  if (!sim) {
    throw new ApiError(404, "SIMULATION_NOT_FOUND", "No simulation exists with this id.");
  }
  return sim;
}

// POST /api/simulations/:id/register — idempotent: registering twice returns
// the same 200 rather than a 409 (re-taps and double-clicks must be safe).
async function registerForSimulation(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params as { id: string };
    const sim = await findVisibleSimulation(id);
    const { status } = simulationStatusOf(sim);
    if (status === "cancelled") {
      throw new ApiError(409, "SIMULATION_CANCELLED", "This simulation has been cancelled.");
    }
    if (status === "completed") {
      throw new ApiError(409, "SIMULATION_ENDED", "This simulation has already ended.");
    }

    await prisma.simulationRegistration.upsert({
      where: { simulationId_userId: { simulationId: id, userId } },
      update: {},
      create: { simulationId: id, userId },
    });
    res.status(200).json({ registered: true, simulationId: id });
  } catch (err) {
    next(err);
  }
}

router.post("/:id/register", requireAuth, validateParams(uuidParam("id")), registerForSimulation);

// DELETE /api/simulations/:id/register — idempotent unregister.
async function unregisterFromSimulation(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params as { id: string };
    await findVisibleSimulation(id);
    await prisma.simulationRegistration.deleteMany({ where: { simulationId: id, userId } });
    res.status(200).json({ registered: false, simulationId: id });
  } catch (err) {
    next(err);
  }
}

router.delete("/:id/register", requireAuth, validateParams(uuidParam("id")), unregisterFromSimulation);

// POST /api/simulations/:id/start — registered students take the sim as an
// official-mock exam session while it is live. Reuses the shared session
// builder (same gates, same BR-4 shuffle), so sim sessions are ordinary exam
// sessions: size capped like any session, timer = the sim duration.
async function startSimulation(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params as { id: string };
    const sim = await findVisibleSimulation(id);
    const { status } = simulationStatusOf(sim);

    const registration = await prisma.simulationRegistration.findUnique({
      where: { simulationId_userId: { simulationId: id, userId } },
      select: { id: true },
    });
    if (!registration) {
      throw new ApiError(403, "SIMULATION_NOT_REGISTERED", "Register for this simulation before starting it.");
    }
    if (status === "cancelled") {
      throw new ApiError(409, "SIMULATION_CANCELLED", "This simulation has been cancelled.");
    }
    if (status === "scheduled") {
      throw new ApiError(409, "SIMULATION_NOT_LIVE", "This simulation has not started yet.");
    }
    if (status === "completed") {
      throw new ApiError(409, "SIMULATION_ENDED", "This simulation has already ended.");
    }

    const session = await buildSessionForUser(userId, {
      name: sim.title,
      mode: "exam",
      facultyId: sim.facultyId,
      ...(sim.yearId ? { yearId: sim.yearId } : {}),
      size: Math.min(sim.questionCount, 200),
      isOfficialMock: true,
      timeLimitSeconds: sim.durationMinutes * 60,
      sort: "random",
      showStats: true,
    });
    res.status(201).json({ session });
  } catch (err) {
    next(err);
  }
}

router.post("/:id/start", requireAuth, validateParams(uuidParam("id")), startSimulation);

export default router;
