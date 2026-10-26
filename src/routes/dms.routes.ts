import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { validateBody, validateParams, validateQuery } from "../middleware/validate";
import { paginationQuery, uuidParam } from "../lib/common-schemas";
import { requireAuth } from "../middleware/auth";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { createNotificationBestEffort } from "./notifications.routes";
import { isOnline } from "../lib/presence";

// Direct messages (DMs) between accepted friends. MedSparkDZ-parity feature —
// their client talks to a Supabase `conversations` table with Realtime
// subscriptions; Hamame's stack has no realtime transport and the zero-new-
// dependency precedent forbids adding one, so this surface is POLLING-based:
// the thread endpoint supports an `after` ISO-datetime cursor for cheap
// incremental polls, and the conversation list carries unread counts derived
// from unread message rows (no denormalized counters to drift).
//
// PAIR CONVENTION (mirrors the Friendship A/B convention in friends.routes.ts):
//   - conversation rows store the user pair SORTED (lexicographically smaller
//     id in userAId), with a unique constraint, so a pair of users has exactly
//     one conversation and (me,them)/(them,me) resolve to the same row.
const router = Router();

router.use(requireAuth);

const MAX_MESSAGE_LENGTH = 2000;

function conversationPair(a: string, b: string): { userAId: string; userBId: string } {
  return a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a };
}

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
    throw new ApiError(403, "NOT_FRIENDS", "Direct messages are limited to accepted friends.");
  }
}

async function getConversationForMe(me: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, OR: [{ userAId: me }, { userBId: me }] },
    include: {
      userA: { select: { id: true, fullName: true } },
      userB: { select: { id: true, fullName: true } },
    },
  });
  if (!conversation) {
    throw new ApiError(404, "CONVERSATION_NOT_FOUND", "No conversation exists with this id for you.");
  }
  const other = conversation.userAId === me ? conversation.userB : conversation.userA;
  return { conversation, other };
}

// POST /api/dms/conversations — open (or return, idempotently) the conversation
// with another accepted friend. The friend gate keeps DMs inside the existing
// social graph; a non-friend or soft-deleted user surfaces as 404/403.
const openConversationSchema = z.object({ userId: z.string().uuid() });

async function openConversation(req: Request, res: Response, next: NextFunction) {
  try {
    const me = req.auth!.userId;
    const { userId } = req.body as z.infer<typeof openConversationSchema>;

    if (userId === me) {
      throw new ApiError(400, "CANNOT_MESSAGE_SELF", "You cannot open a conversation with yourself.");
    }

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, status: true } });
    if (!target || target.status !== "active") {
      throw new ApiError(404, "USER_NOT_FOUND", "No active user exists with this id.");
    }

    await requireAcceptedFriendship(me, userId);

    const pair = conversationPair(me, userId);
    const conversation = await prisma.conversation.upsert({
      where: { userAId_userBId: { userAId: pair.userAId, userBId: pair.userBId } },
      create: pair,
      update: {},
      select: { id: true, userAId: true, userBId: true, createdAt: true },
    });

    res.status(200).json({ conversation });
  } catch (err) {
    next(err);
  }
}

router.post("/conversations", validateBody(openConversationSchema), openConversation);

// GET /api/dms/conversations — my conversations, most recently active first,
// each with the other user's basic info, the latest message preview and the
// count of my unread incoming messages.
async function listConversations(req: Request, res: Response, next: NextFunction) {
  try {
    const me = req.auth!.userId;
    const { page, limit } = req.query as unknown as z.infer<typeof paginationQuery>;

    const conversations = await prisma.conversation.findMany({
      where: { OR: [{ userAId: me }, { userBId: me }] },
      orderBy: { lastMessageAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        userA: { select: { id: true, fullName: true, lastActiveAt: true } },
        userB: { select: { id: true, fullName: true, lastActiveAt: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, senderId: true, createdAt: true } },
      },
    });

    const ids = conversations.map((c) => c.id);
    // groupBy unread counts for this page's conversations only. Sequential
    // await (never Promise.all) per the Supabase pooler limit.
    const unreadRows = ids.length
      ? await prisma.directMessage.groupBy({
          by: ["conversationId"],
          where: { conversationId: { in: ids }, senderId: { not: me }, readAt: null },
          _count: { _all: true },
        })
      : [];
    const unreadByConversation = new Map(unreadRows.map((row) => [row.conversationId, row._count._all]));

    const total = await prisma.conversation.count({ where: { OR: [{ userAId: me }, { userBId: me }] } });

    res.status(200).json({
      conversations: conversations.map((c) => {
        const other = c.userAId === me ? c.userB : c.userA;
        const last = c.messages[0] ?? null;
        return {
          id: c.id,
          otherUser: { id: other.id, fullName: other.fullName, online: isOnline(other.lastActiveAt) },
          lastMessage: last ? { body: last.body, fromMe: last.senderId === me, createdAt: last.createdAt } : null,
          unreadCount: unreadByConversation.get(c.id) ?? 0,
          lastMessageAt: c.lastMessageAt,
        };
      }),
      pagination: { page, limit, total },
    });
  } catch (err) {
    next(err);
  }
}

router.get("/conversations", validateQuery(paginationQuery), listConversations);

// GET /api/dms/conversations/:id/messages — thread messages ascending.
// Pagination: `?after=<ISO datetime>` returns everything created strictly
// after that cursor (the polling path); without `after`, the most recent
// `limit` messages are returned ascending (the initial-load path). `after`
// and `page` are mutually exclusive — `after` wins when both are sent.
const messagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  after: z.string().datetime().optional(),
});

async function listMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const me = req.auth!.userId;
    const { id } = req.params;
    const { limit, after } = req.query as unknown as z.infer<typeof messagesQuerySchema>;

    await getConversationForMe(me, id);

    const messages = await prisma.directMessage.findMany({
      where: { conversationId: id, ...(after ? { createdAt: { gt: new Date(after) } } : {}) },
      orderBy: { createdAt: after ? "asc" : "desc" },
      take: limit,
      select: { id: true, senderId: true, body: true, readAt: true, createdAt: true },
    });
    if (!after) messages.reverse();

    res.status(200).json({ messages });
  } catch (err) {
    next(err);
  }
}

router.get("/conversations/:id/messages", validateParams(uuidParam("id")), validateQuery(messagesQuerySchema), listMessages);

// POST /api/dms/conversations/:id/messages — send a message. Bumps the
// conversation's lastMessageAt in the same transaction as the insert, and
// notifies the recipient best-effort (never fails the send).
const SHARE_PREFIX = "[[hamame]]";

const sendMessageSchema = z
  .object({
    body: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH).optional(),
    questionId: z.string().uuid().optional(),
    resourceId: z.string().uuid().optional(),
    imageUrl: z.string().trim().url().max(500).optional(),
  })
  .refine((value) => Boolean(value.body || value.questionId || value.resourceId || value.imageUrl), {
    message: "A message needs text or something to share.",
  });

function snippet(raw: string): string {
  return raw.replace(/[{}"\\[\]]/g, " ").replace(/\b(text|type|content|attrs)\s*:/gi, " ").replace(/\s+/g, " ").trim().slice(0, 140);
}

async function composeBody(input: z.infer<typeof sendMessageSchema>): Promise<{ stored: string; preview: string }> {
  const note = input.body?.trim();
  if (input.questionId) {
    const question = await prisma.question.findFirst({
      where: { id: input.questionId, status: "approved" },
      select: { id: true, unitId: true, bodyRichtext: true },
    });
    if (!question) throw new ApiError(404, "QUESTION_NOT_FOUND", "That question is not available to share.");
    const payload = {
      kind: "question" as const,
      id: question.id,
      unitId: question.unitId,
      title: snippet(JSON.stringify(question.bodyRichtext)),
      note: note || undefined,
    };
    return { stored: SHARE_PREFIX + JSON.stringify(payload), preview: payload.title || "Question" };
  }
  if (input.resourceId) {
    const resource = await prisma.resource.findUnique({
      where: { id: input.resourceId },
      select: { id: true, title: true },
    });
    if (!resource) throw new ApiError(404, "RESOURCE_NOT_FOUND", "That resource is not available to share.");
    const payload = { kind: "resource" as const, id: resource.id, title: resource.title, note: note || undefined };
    return { stored: SHARE_PREFIX + JSON.stringify(payload), preview: resource.title };
  }
  if (input.imageUrl) {
    if (!input.imageUrl.startsWith("https://")) {
      throw new ApiError(400, "IMAGE_URL_INVALID", "A shared photo must be an https link.");
    }
    const payload = { kind: "image" as const, url: input.imageUrl, note: note || undefined };
    return { stored: SHARE_PREFIX + JSON.stringify(payload), preview: "Photo" };
  }
  return { stored: note ?? "", preview: note ?? "" };
}

async function sendMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const me = req.auth!.userId;
    const { id } = req.params;
    const input = req.body as z.infer<typeof sendMessageSchema>;
    const { stored, preview } = await composeBody(input);

    const { conversation, other } = await getConversationForMe(me, id);

    const [message] = await prisma.$transaction([
      prisma.directMessage.create({
        data: { conversationId: conversation.id, senderId: me, body: stored },
        select: { id: true, senderId: true, body: true, readAt: true, createdAt: true },
      }),
      prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
        select: { id: true },
      }),
    ]);

    const sender = await prisma.user.findUnique({ where: { id: me }, select: { fullName: true } });
    await createNotificationBestEffort({
      userId: other.id,
      category: "social",
      title: `${sender?.fullName ?? "Un camarade"} vous a écrit`,
      body: preview.length > 80 ? `${preview.slice(0, 80)}…` : preview,
    });

    res.status(201).json({ message });
  } catch (err) {
    next(err);
  }
}

router.post("/conversations/:id/messages", validateParams(uuidParam("id")), validateBody(sendMessageSchema), sendMessage);

// POST /api/dms/conversations/:id/read — mark all my unread incoming messages
// in this conversation as read. Idempotent; the updateMany matches nothing
// when there is nothing unread.
async function markConversationRead(req: Request, res: Response, next: NextFunction) {
  try {
    const me = req.auth!.userId;
    const { id } = req.params;

    await getConversationForMe(me, id);

    const result = await prisma.directMessage.updateMany({
      where: { conversationId: id, senderId: { not: me }, readAt: null },
      data: { readAt: new Date() },
    });

    res.status(200).json({ markedRead: result.count });
  } catch (err) {
    next(err);
  }
}

router.post("/conversations/:id/read", validateParams(uuidParam("id")), markConversationRead);

export default router;
