import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { validateBody, validateParams } from "../middleware/validate";
import { uuidParam } from "../lib/common-schemas";
import { requireAuth } from "../middleware/auth";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { createNotificationBestEffort } from "./notifications.routes";

// Study invitations ("Invitation d'étude") — MedSparkDZ-parity: a friend
// invites another friend to study, optionally naming a module; the recipient
// accepts or declines, and both outcomes notify the sender. Invites ride the
// existing Friendship social graph (accepted friends only) and the existing
// notification center (category "social").
const router = Router();

router.use(requireAuth);

const createInviteSchema = z.object({
  recipientId: z.string().uuid(),
  moduleId: z.string().uuid().optional(),
});

async function requireAcceptedFriendship(me: string, other: string): Promise<void> {
  const friendship = await prisma.friendship.findFirst({
    where: {
      status: "accepted",
      OR: [
        { userIdA: me, userIdB: other },
        { userIdA: other, userIdB: me },
      ],
    },
    select: { userIdA: true },
  });
  if (!friendship) {
    throw new ApiError(403, "NOT_FRIENDS", "Study invites are limited to accepted friends.");
  }
}

const inviteInclude = {
  sender: { select: { id: true, fullName: true } },
  recipient: { select: { id: true, fullName: true } },
  module: { select: { id: true, name: true } },
} as const;

// POST /api/study-invites — send an invitation. Idempotent against an exact
// duplicate: an existing PENDING invite from me to this recipient re-uses the
// same row (200) instead of piling up duplicates. A pending invite in the
// OTHER direction does not block — both sides may invite each other.
async function createInvite(req: Request, res: Response, next: NextFunction) {
  try {
    const me = req.auth!.userId;
    const { recipientId, moduleId } = req.body as z.infer<typeof createInviteSchema>;

    if (recipientId === me) {
      throw new ApiError(400, "CANNOT_INVITE_SELF", "You cannot invite yourself to study.");
    }

    const recipient = await prisma.user.findUnique({ where: { id: recipientId }, select: { id: true, status: true } });
    if (!recipient || recipient.status !== "active") {
      throw new ApiError(404, "USER_NOT_FOUND", "No active user exists with this id.");
    }

    await requireAcceptedFriendship(me, recipientId);

    if (moduleId) {
      const moduleExists = await prisma.module.findUnique({ where: { id: moduleId }, select: { id: true } });
      if (!moduleExists) {
        throw new ApiError(404, "MODULE_NOT_FOUND", "No module exists with this id.");
      }
    }

    const existing = await prisma.studyInvite.findFirst({
      where: { senderId: me, recipientId, status: "pending" },
    });
    if (existing) {
      return res.status(200).json({ invite: existing });
    }

    const invite = await prisma.studyInvite.create({
      data: { senderId: me, recipientId, moduleId: moduleId ?? null },
      include: inviteInclude,
    });

    const sender = await prisma.user.findUnique({ where: { id: me }, select: { fullName: true } });
    await createNotificationBestEffort({
      userId: recipientId,
      category: "social",
      title: "Invitation d'étude",
      body: `${sender?.fullName ?? "Un camarade"} vous invite à étudier${invite.module ? ` (${invite.module.name})` : ""}.`,
    });

    res.status(201).json({ invite });
  } catch (err) {
    next(err);
  }
}

router.post("/", validateBody(createInviteSchema), createInvite);

// GET /api/study-invites — my pending incoming invites plus every outgoing
// invite I sent (any status), incoming first. Deterministic ordering via
// createdAt desc (the column exists here, unlike Friendship).
async function listInvites(req: Request, res: Response, next: NextFunction) {
  try {
    const me = req.auth!.userId;

    const [incoming, outgoing] = await Promise.all([
      prisma.studyInvite.findMany({
        where: { recipientId: me, status: "pending" },
        orderBy: { createdAt: "desc" },
        include: inviteInclude,
      }),
      prisma.studyInvite.findMany({
        where: { senderId: me },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: inviteInclude,
      }),
    ]);

    res.status(200).json({
      incoming: incoming.map((invite) => ({
        id: invite.id,
        sender: invite.sender,
        module: invite.module,
        createdAt: invite.createdAt,
      })),
      outgoing: outgoing.map((invite) => ({
        id: invite.id,
        recipient: invite.recipient,
        module: invite.module,
        status: invite.status,
        createdAt: invite.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}

router.get("/", listInvites);

// Shared recipient-decision logic for accept/decline: only the recipient of a
// PENDING invite may decide it; the outcome flips status, stamps decidedAt and
// notifies the sender best-effort.
async function decideInvite(req: Request, res: Response, next: NextFunction, decision: "accepted" | "declined") {
  try {
    const me = req.auth!.userId;
    const { id } = req.params;

    const invite = await prisma.studyInvite.findUnique({ where: { id }, include: inviteInclude });
    if (!invite || invite.recipientId !== me) {
      throw new ApiError(404, "INVITE_NOT_FOUND", "No study invite exists with this id for you.");
    }
    if (invite.status !== "pending") {
      throw new ApiError(409, "INVITE_ALREADY_DECIDED", "This invite has already been decided.");
    }

    const updated = await prisma.studyInvite.update({
      where: { id },
      data: { status: decision, decidedAt: new Date() },
      include: inviteInclude,
    });

    const decider = await prisma.user.findUnique({ where: { id: me }, select: { fullName: true } });
    await createNotificationBestEffort({
      userId: invite.senderId,
      category: "social",
      title: "Invitation d'étude",
      body:
        decision === "accepted"
          ? `${decider?.fullName ?? "Un camarade"} a accepté votre invitation d'étude.`
          : `${decider?.fullName ?? "Un camarade"} a décliné votre invitation d'étude.`,
    });

    res.status(200).json({ invite: updated });
  } catch (err) {
    next(err);
  }
}

// POST /api/study-invites/:id/accept
async function acceptInvite(req: Request, res: Response, next: NextFunction) {
  await decideInvite(req, res, next, "accepted");
}

// POST /api/study-invites/:id/decline
async function declineInvite(req: Request, res: Response, next: NextFunction) {
  await decideInvite(req, res, next, "declined");
}

router.post("/:id/accept", validateParams(uuidParam("id")), acceptInvite);
router.post("/:id/decline", validateParams(uuidParam("id")), declineInvite);

// DELETE /api/study-invites/:id — the SENDER cancels a still-pending invite.
// Idempotent-shaped: cancelling an already-decided invite is a 409 (the
// recipient's decision is history, not something the sender can overwrite).
async function cancelInvite(req: Request, res: Response, next: NextFunction) {
  try {
    const me = req.auth!.userId;
    const { id } = req.params;

    const invite = await prisma.studyInvite.findUnique({ where: { id } });
    if (!invite || invite.senderId !== me) {
      throw new ApiError(404, "INVITE_NOT_FOUND", "No study invite exists with this id for you.");
    }
    if (invite.status !== "pending") {
      throw new ApiError(409, "INVITE_ALREADY_DECIDED", "This invite has already been decided.");
    }

    const updated = await prisma.studyInvite.update({
      where: { id },
      data: { status: "cancelled", decidedAt: new Date() },
    });

    res.status(200).json({ invite: updated });
  } catch (err) {
    next(err);
  }
}

router.delete("/:id", validateParams(uuidParam("id")), cancelInvite);

export default router;
