import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { paginationQuery, uuidParam } from "../lib/common-schemas";
import { validateBody, validateParams, validateQuery } from "../middleware/validate";
import { requireAuth } from "../middleware/auth";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { resolveViewerUniversityId, universityScopeFilter } from "../lib/university-scope";
import { createNotificationBestEffort } from "./notifications.routes";

// ---------------------------------------------------------------------------
// /api/groups — study groups (medspark.online-parity: GroupSpace, Hamame
// shape). Faculty/year-scoped cohorts; FR-10a university layering applies
// through the SHARED university-scope lib (never hand-rolled, never wrapped
// in `if (view)…`). Chat/announcements/attachments are polling+CRUD; no
// realtime transport (zero-new-dependency precedent).
// ---------------------------------------------------------------------------
const router = Router();
router.use(requireAuth);

const VISIBLE_ROLLOUT = ["beta", "live"] as const;

const createGroupBody = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  facultyId: z.string().uuid(),
  yearId: z.string().uuid(),
  joinPolicy: z.enum(["open", "request"]).default("open"),
});

const messageBody = z.object({
  body: z.string().min(1).max(2000),
});

const announcementBody = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(5000),
});

const attachmentBody = z.object({
  title: z.string().min(1).max(200),
  url: z.string().url().max(2000),
});

const messagesQuery = paginationQuery.extend({
  after: z.string().datetime().optional(),
});

const decideBody = z.object({
  action: z.enum(["approve", "reject"]),
});

function serializeGroup(
  group: {
    id: string;
    name: string;
    description: string | null;
    facultyId: string;
    yearId: string;
    universityId: string | null;
    joinPolicy: string;
    createdAt: Date;
    faculty: { id: string; name: string };
    year: { id: string; label: string };
    _count?: { members: number };
  },
  myRole: string | null
) {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    faculty: { id: group.faculty.id, name: group.faculty.name },
    year: { id: group.year.id, label: group.year.label },
    joinPolicy: group.joinPolicy,
    memberCount: group._count?.members ?? null,
    myRole,
    createdAt: group.createdAt,
  };
}

async function getGroupOrNotFound(groupId: string, viewerUserId: string, viewerUniversityId: string | null) {
  // Single shared predicate: faculty visibility AND university layering — composed
  // the same way the bank and the library compose theirs (via AND).
  const where = {
    id: groupId,
    faculty: { rolloutStatus: { in: [...VISIBLE_ROLLOUT] } },
    ...universityScopeFilter(viewerUniversityId),
  };
  const group = await prisma.studyGroup.findFirst({
    where,
    include: {
      faculty: { select: { id: true, name: true } },
      year: { select: { id: true, label: true } },
      members: { where: { userId: viewerUserId }, select: { role: true } },
      _count: { select: { members: true } },
    },
  });
  if (!group) {
    throw new ApiError(404, "GROUP_NOT_FOUND", "This group does not exist or is not visible to you.");
  }
  return group;
}

type GroupWithMembership = NonNullable<Awaited<ReturnType<typeof getGroupOrNotFound>>>;

function requireMembership(group: GroupWithMembership): { role: string } {
  const membership = group.members[0];
  if (!membership) {
    throw new ApiError(403, "NOT_A_MEMBER", "You must be a member of this group to do that.");
  }
  return membership;
}

function requireGroupOwner(group: GroupWithMembership): void {
  const membership = group.members[0];
  if (!membership || membership.role !== "owner") {
    throw new ApiError(403, "NOT_GROUP_OWNER", "Only the group owner can do that.");
  }
}

// POST /api/groups — create a group for the caller's own faculty/year; the
// university scoping comes from the CREATOR's profile (never from the client).
async function createGroup(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const body = req.body as {
      name: string;
      description?: string | null;
      facultyId: string;
      yearId: string;
      joinPolicy: "open" | "request";
    };

    const faculty = await prisma.faculty.findFirst({
      where: { id: body.facultyId, rolloutStatus: { in: [...VISIBLE_ROLLOUT] } },
    });
    if (!faculty) {
      throw new ApiError(400, "FACULTY_NOT_VISIBLE", "The faculty must exist and be beta/live.");
    }
    const year = await prisma.year.findFirst({ where: { id: body.yearId, facultyId: body.facultyId } });
    if (!year) {
      throw new ApiError(400, "YEAR_MISMATCH", "The year must belong to the given faculty.");
    }

    const creator = await prisma.user.findUnique({
      where: { id: userId },
      select: { universityId: true },
    });
    if (!creator) throw new ApiError(401, "UNKNOWN_USER", "Your account no longer exists.");

    const group = await prisma.$transaction(async (tx) => {
      const created = await tx.studyGroup.create({
        data: {
          name: body.name,
          description: body.description ?? null,
          facultyId: body.facultyId,
          yearId: body.yearId,
          universityId: creator.universityId,
          joinPolicy: body.joinPolicy,
          createdBy: userId,
        },
      });
      await tx.groupMember.create({
        data: { groupId: created.id, userId, role: "owner" },
      });
      return created;
    });

    const full = await prisma.studyGroup.findUniqueOrThrow({
      where: { id: group.id },
      include: {
        faculty: { select: { id: true, name: true } },
        year: { select: { id: true, label: true } },
        _count: { select: { members: true } },
      },
    });
    res.status(201).json({ group: serializeGroup(full, "owner") });
  } catch (err) {
    next(err);
  }
}

// GET /api/groups — visible list. facultyId/yearId optional filters; mine=true
// restricts to groups the caller belongs to (filters compose with visibility).
async function listGroups(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { page, limit, facultyId, yearId, mine } = req.query as unknown as {
      page: number;
      limit: number;
      facultyId?: string;
      yearId?: string;
      mine?: string;
    };
    const viewerUniversityId = await resolveViewerUniversityId(prisma, userId);
    const where = {
      faculty: { rolloutStatus: { in: [...VISIBLE_ROLLOUT] } },
      ...universityScopeFilter(viewerUniversityId),
      ...(facultyId ? { facultyId } : {}),
      ...(yearId ? { yearId } : {}),
      ...(mine === "true" ? { members: { some: { userId } } } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.studyGroup.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          faculty: { select: { id: true, name: true } },
          year: { select: { id: true, label: true } },
          members: { where: { userId }, select: { role: true } },
          _count: { select: { members: true } },
        },
      }),
      prisma.studyGroup.count({ where }),
    ]);
    res.json({
      groups: rows.map((g) => serializeGroup(g, g.members[0]?.role ?? null)),
      pagination: { page, limit, total },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/groups/:id
async function getGroup(req: Request, res: Response, next: NextFunction) {
  try {
    const viewerUniversityId = await resolveViewerUniversityId(prisma, req.auth!.userId);
    const group = await getGroupOrNotFound(req.params.id, req.auth!.userId, viewerUniversityId);
    res.json({
      group: serializeGroup(group, group.members[0]?.role ?? null),
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/groups/:id/join — 'open' joins directly; 'request' files a
// pending join request (owner decides). Both idempotent on their composite keys.
async function joinGroup(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const viewerUniversityId = await resolveViewerUniversityId(prisma, userId);
    const group = await getGroupOrNotFound(req.params.id, userId, viewerUniversityId);
    if (group.members[0]) {
      res.status(200).json({ status: "member", role: group.members[0].role });
      return;
    }
    if (group.joinPolicy === "open") {
      await prisma.groupMember.create({ data: { groupId: group.id, userId, role: "member" } });
      res.status(201).json({ status: "joined" });
      return;
    }
    await prisma.groupJoinRequest.upsert({
      where: { groupId_userId: { groupId: group.id, userId } },
      update: { status: "pending" },
      create: { groupId: group.id, userId },
    });
    res.status(202).json({ status: "requested" });
  } catch (err) {
    next(err);
  }
}

// POST /api/groups/:id/leave — owner cannot leave (must delete the group).
async function leaveGroup(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: req.params.id, userId } },
    });
    if (!membership) {
      throw new ApiError(404, "NOT_A_MEMBER", "You are not a member of this group.");
    }
    if (membership.role === "owner") {
      throw new ApiError(409, "OWNER_MUST_DELETE", "The owner cannot leave; delete the group instead.");
    }
    await prisma.groupMember.delete({ where: { groupId_userId: { groupId: req.params.id, userId } } });
    res.json({ left: true });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/groups/:id — owner only; hard delete (cascades all children).
async function deleteGroup(req: Request, res: Response, next: NextFunction) {
  try {
    const viewerUniversityId = await resolveViewerUniversityId(prisma, req.auth!.userId);
    const group = await getGroupOrNotFound(req.params.id, req.auth!.userId, viewerUniversityId);
    requireGroupOwner(group);
    await prisma.studyGroup.delete({ where: { id: group.id } });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
}

async function listMembers(req: Request, res: Response, next: NextFunction) {
  try {
    const viewerUniversityId = await resolveViewerUniversityId(prisma, req.auth!.userId);
    const group = await getGroupOrNotFound(req.params.id, req.auth!.userId, viewerUniversityId);
    requireMembership(group);
    const members = await prisma.groupMember.findMany({
      where: { groupId: group.id },
      orderBy: { joinedAt: "asc" },
      include: { user: { select: { id: true, fullName: true, profilePhotoUrl: true } } },
    });
    res.json({
      members: members.map((m) => ({
        userId: m.userId,
        role: m.role,
        joinedAt: m.joinedAt,
        fullName: m.user?.fullName ?? null,
        profilePhotoUrl: m.user?.profilePhotoUrl ?? null,
      })),
    });
  } catch (err) {
    next(err);
  }
}

async function listJoinRequests(req: Request, res: Response, next: NextFunction) {
  try {
    const viewerUniversityId = await resolveViewerUniversityId(prisma, req.auth!.userId);
    const group = await getGroupOrNotFound(req.params.id, req.auth!.userId, viewerUniversityId);
    requireGroupOwner(group);
    const requests = await prisma.groupJoinRequest.findMany({
      where: { groupId: group.id, status: "pending" },
      orderBy: { requestedAt: "asc" },
      include: { user: { select: { id: true, fullName: true } } },
    });
    res.json({
      requests: requests.map((r) => ({
        userId: r.userId,
        fullName: r.user?.fullName ?? null,
        requestedAt: r.requestedAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}

async function decideJoinRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const ownerUserId = req.auth!.userId;
    const { id, requesterId } = req.params as unknown as { id: string; requesterId: string };
    const body = req.body as { action: "approve" | "reject" };
    const ownerViewerUniversityId = await resolveViewerUniversityId(prisma, ownerUserId);
    const group = await getGroupOrNotFound(id, ownerUserId, ownerViewerUniversityId);
    requireGroupOwner(group);
    const request = await prisma.groupJoinRequest.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: requesterId } },
    });
    if (!request || request.status !== "pending") {
      throw new ApiError(404, "REQUEST_NOT_FOUND", "No pending join request from this user.");
    }
    await prisma.$transaction(async (tx) => {
      if (body.action === "approve") {
        await tx.groupMember.upsert({
          where: { groupId_userId: { groupId: group.id, userId: requesterId } },
          update: {},
          create: { groupId: group.id, userId: requesterId, role: "member" },
        });
      }
      await tx.groupJoinRequest.update({
        where: { groupId_userId: { groupId: group.id, userId: requesterId } },
        data: { status: body.action === "approve" ? "approved" : "rejected" },
      });
    });
    void createNotificationBestEffort({
      userId: requesterId,
      category: "social",
      title: body.action === "approve" ? "Demande acceptée" : "Demande refusée",
      body:
        body.action === "approve"
          ? `Votre demande pour rejoindre « ${group.name} » a été acceptée.`
          : `Votre demande pour rejoindre « ${group.name} » a été refusée.`,
    });
    res.json({ status: body.action === "approve" ? "approved" : "rejected" });
  } catch (err) {
    next(err);
  }
}

// Group chat — polling with the same ?after= ISO cursor as DMs (rows created
// after the cursor, ascending, capped at 100; default = last 50 ascending).
const MESSAGE_PAGE_CAP = 100;

function serializeMessage(m: {
  id: string;
  userId: string;
  body: string;
  createdAt: Date;
  user?: { fullName: string | null } | null;
}) {
  return {
    id: m.id,
    userId: m.userId,
    senderName: m.user?.fullName ?? null,
    body: m.body,
    createdAt: m.createdAt,
  };
}

async function listMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const viewerUniversityId = await resolveViewerUniversityId(prisma, req.auth!.userId);
    const group = await getGroupOrNotFound(req.params.id, req.auth!.userId, viewerUniversityId);
    requireMembership(group);
    const { after } = req.query as unknown as { after?: string };
    if (after) {
      const rows = await prisma.groupMessage.findMany({
        where: { groupId: group.id, createdAt: { gt: new Date(after) } },
        orderBy: { createdAt: "asc" },
        take: MESSAGE_PAGE_CAP,
        include: { user: { select: { id: true, fullName: true } } },
      });
      res.json({ messages: rows.map(serializeMessage) });
      return;
    }
    const rows = await prisma.groupMessage.findMany({
      where: { groupId: group.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: { id: true, fullName: true } } },
    });
    res.json({ messages: rows.reverse().map(serializeMessage) });
  } catch (err) {
    next(err);
  }
}

async function postMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const viewerUniversityId = await resolveViewerUniversityId(prisma, req.auth!.userId);
    const group = await getGroupOrNotFound(req.params.id, req.auth!.userId, viewerUniversityId);
    requireMembership(group);
    const { body } = req.body as { body: string };
    const message = await prisma.groupMessage.create({
      data: { groupId: group.id, userId: req.auth!.userId, body },
    });
    res.status(201).json({ message: serializeMessage(message) });
  } catch (err) {
    next(err);
  }
}

async function listAnnouncements(req: Request, res: Response, next: NextFunction) {
  try {
    const viewerUniversityId = await resolveViewerUniversityId(prisma, req.auth!.userId);
    const group = await getGroupOrNotFound(req.params.id, req.auth!.userId, viewerUniversityId);
    requireMembership(group);
    const rows = await prisma.groupAnnouncement.findMany({
      where: { groupId: group.id },
      orderBy: { createdAt: "desc" },
      include: { author: { select: { fullName: true } } },
    });
    res.json({
      announcements: rows.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        authorName: a.author?.fullName ?? null,
        createdAt: a.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}

async function postAnnouncement(req: Request, res: Response, next: NextFunction) {
  try {
    const viewerUniversityId = await resolveViewerUniversityId(prisma, req.auth!.userId);
    const group = await getGroupOrNotFound(req.params.id, req.auth!.userId, viewerUniversityId);
    requireGroupOwner(group);
    const { title, body } = req.body as { title: string; body: string };
    const row = await prisma.groupAnnouncement.create({
      data: { groupId: group.id, authorId: req.auth!.userId, title, body },
    });
    res.status(201).json({
      announcement: {
        id: row.id,
        title: row.title,
        body: row.body,
        createdAt: row.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function listAttachments(req: Request, res: Response, next: NextFunction) {
  try {
    const viewerUniversityId = await resolveViewerUniversityId(prisma, req.auth!.userId);
    const group = await getGroupOrNotFound(req.params.id, req.auth!.userId, viewerUniversityId);
    requireMembership(group);
    const rows = await prisma.groupAttachment.findMany({
      where: { groupId: group.id },
      orderBy: { createdAt: "desc" },
      include: { uploader: { select: { fullName: true } } },
    });
    res.json({
      attachments: rows.map((a) => ({
        id: a.id,
        title: a.title,
        url: a.url,
        uploadedBy: a.uploader?.fullName ?? null,
        createdAt: a.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}

async function postAttachment(req: Request, res: Response, next: NextFunction) {
  try {
    const viewerUniversityId = await resolveViewerUniversityId(prisma, req.auth!.userId);
    const group = await getGroupOrNotFound(req.params.id, req.auth!.userId, viewerUniversityId);
    requireMembership(group);
    const { title, url } = req.body as { title: string; url: string };
    const row = await prisma.groupAttachment.create({
      data: { groupId: group.id, uploaderId: req.auth!.userId, title, url },
    });
    res.status(201).json({ attachment: { id: row.id, title: row.title, url: row.url, createdAt: row.createdAt } });
  } catch (err) {
    next(err);
  }
}

async function deleteAttachment(req: Request, res: Response, next: NextFunction) {
  try {
    const viewerUniversityId = await resolveViewerUniversityId(prisma, req.auth!.userId);
    const group = await getGroupOrNotFound(req.params.id, req.auth!.userId, viewerUniversityId);
    const { attachmentId } = req.params as unknown as { attachmentId: string };
    const attachment = await prisma.groupAttachment.findFirst({
      where: { id: attachmentId, groupId: group.id },
    });
    if (!attachment) {
      throw new ApiError(404, "ATTACHMENT_NOT_FOUND", "This attachment does not belong to the group.");
    }
    const membership = group.members[0];
    const isOwner = membership?.role === "owner";
    const isUploader = attachment.uploaderId === req.auth!.userId;
    if (!isOwner && !isUploader) {
      throw new ApiError(403, "NOT_ALLOWED", "Only the owner or the uploader can remove this attachment.");
    }
    await prisma.groupAttachment.delete({ where: { id: attachment.id } });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
}

const idParams = uuidParam("id");
const requesterParams = z.object({ id: z.string().uuid(), requesterId: z.string().uuid() });
const attachmentParams = z.object({ id: z.string().uuid(), attachmentId: z.string().uuid() });

router.post("/", validateBody(createGroupBody), createGroup);
router.get("/", validateQuery(paginationQuery), listGroups);
router.get("/:id", validateParams(idParams), getGroup);
router.post("/:id/join", validateParams(idParams), joinGroup);
router.post("/:id/leave", validateParams(idParams), leaveGroup);
router.delete("/:id", validateParams(idParams), deleteGroup);
router.get("/:id/members", validateParams(idParams), listMembers);
router.get("/:id/requests", validateParams(idParams), listJoinRequests);
router.post(
  "/:id/requests/:requesterId/decide",
  validateParams(requesterParams),
  validateBody(decideBody),
  decideJoinRequest
);
router.get("/:id/messages", validateParams(idParams), validateQuery(messagesQuery), listMessages);
router.post("/:id/messages", validateParams(idParams), validateBody(messageBody), postMessage);
router.get("/:id/announcements", validateParams(idParams), listAnnouncements);
router.post("/:id/announcements", validateParams(idParams), validateBody(announcementBody), postAnnouncement);
router.get("/:id/attachments", validateParams(idParams), listAttachments);
router.post("/:id/attachments", validateParams(idParams), validateBody(attachmentBody), postAttachment);
router.delete("/:id/attachments/:attachmentId", validateParams(attachmentParams), deleteAttachment);

export default router;
