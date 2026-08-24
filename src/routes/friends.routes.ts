import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { validateBody, validateParams } from "../middleware/validate";
import { uuidParam } from "../lib/common-schemas";
import { requireAuth } from "../middleware/auth";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";

// V2 social: friends/following via the Friendship model (prisma/schema.prisma).
//
// DIRECTIONAL CONVENTION (documented here because the schema does not enforce it — the
// composite PK is just (userIdA, userIdB) with no explicit requestedBy field):
//   - userIdA = the user who SENT the request
//   - userIdB = the user who RECEIVED it
//   - status: 'pending' | 'accepted'
// Every endpoint below relies on this reading of A/B. The schema allows both
// (A,B) and (B,A) rows to exist independently; the route logic treats them as two
// directions of the SAME relationship and never creates a duplicate opposite row.
const router = Router();

router.use(requireAuth);

const sendRequestSchema = z.object({ userId: z.string().uuid() });

// POST /api/friends — send a friend request (or return the existing row idempotently).
//
// Guards: no self-friending, target must exist and be active (not soft-deleted), and an
// existing row in EITHER direction — 'accepted' (already friends) or 'pending' (request
// already in flight one way or the other) — is handed back as-is with 200 instead of
// duplicating or erroring.
async function sendFriendRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const me = req.auth!.userId;
    const { userId } = req.body as z.infer<typeof sendRequestSchema>;

    if (userId === me) {
      throw new ApiError(400, "CANNOT_FRIEND_SELF", "You cannot send a friend request to yourself.");
    }

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, status: true } });
    if (!target || target.status !== "active") {
      throw new ApiError(404, "USER_NOT_FOUND", "No active user exists with this id.");
    }

    // Check both directions before creating, so (me,them) and (them,me) are never both
    // created for the same relationship.
    const existing = await prisma.friendship.findFirst({
      where: { OR: [{ userIdA: me, userIdB: userId }, { userIdA: userId, userIdB: me }] },
    });
    if (existing) {
      return res.status(200).json({ friendship: existing });
    }

    const friendship = await prisma.friendship.create({
      data: { userIdA: me, userIdB: userId, status: "pending" },
    });

    res.status(201).json({ friendship });
  } catch (err) {
    next(err);
  }
}

router.post("/", validateBody(sendRequestSchema), sendFriendRequest);

// POST /api/friends/:userId/accept — accept an INCOMING pending request.
//
// Only matches userIdA=:userId (the original sender) AND userIdB=me (the recipient).
// Because the query is fixed in that direction, a user can never "accept" their own
// outgoing request — that would need userIdA=me, which this where won't match — so a
// wrong/absent row surfaces as a clean 404 rather than an unauthorized state flip.
async function acceptFriendRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const me = req.auth!.userId;
    const { userId } = req.params;

    const friendship = await prisma.friendship.findUnique({
      where: { userIdA_userIdB: { userIdA: userId, userIdB: me } },
    });
    if (!friendship || friendship.status !== "pending") {
      throw new ApiError(404, "FRIEND_REQUEST_NOT_FOUND", "No pending friend request exists in this direction.");
    }

    const updated = await prisma.friendship.update({
      where: { userIdA_userIdB: { userIdA: userId, userIdB: me } },
      data: { status: "accepted" },
    });

    res.status(200).json({ friendship: updated });
  } catch (err) {
    next(err);
  }
}

router.post("/:userId/accept", validateParams(uuidParam("userId")), acceptFriendRequest);

// DELETE /api/friends/:userId — remove a friendship OR decline/cancel a pending request.
//
// Checks BOTH directions and deletes whichever row exists regardless of status. Idempotent
// by design: returns 200 even when nothing was deleted, so the endpoint never leaks
// whether a request/friendship ever existed (no 404 either way).
async function removeFriend(req: Request, res: Response, next: NextFunction) {
  try {
    const me = req.auth!.userId;
    const { userId } = req.params;

    const friendship = await prisma.friendship.findFirst({
      where: { OR: [{ userIdA: me, userIdB: userId }, { userIdA: userId, userIdB: me }] },
    });
    if (friendship) {
      await prisma.friendship.delete({
        where: { userIdA_userIdB: { userIdA: friendship.userIdA, userIdB: friendship.userIdB } },
      });
    }

    res.status(200).json({ message: "OK" });
  } catch (err) {
    next(err);
  }
}

router.delete("/:userId", validateParams(uuidParam("userId")), removeFriend);

// GET /api/friends — accepted friendships in both directions; only the OTHER user's
// basic info (id, fullName — deliberately no email/PII).
async function listFriends(req: Request, res: Response, next: NextFunction) {
  try {
    const me = req.auth!.userId;

    const friendships = await prisma.friendship.findMany({
      where: {
        status: "accepted",
        OR: [{ userIdA: me }, { userIdB: me }],
      },
      include: {
        userA: { select: { id: true, fullName: true } },
        userB: { select: { id: true, fullName: true } },
      },
    });

    res.status(200).json({
      friends: friendships.map((row) => {
        const other = row.userIdA === me ? row.userB : row.userA;
        return { id: other.id, fullName: other.fullName };
      }),
    });
  } catch (err) {
    next(err);
  }
}

router.get("/", listFriends);

// GET /api/friends/requests — incoming pending requests (caller is userIdB, the
// recipient), with the requester's (userIdA's) basic info, oldest-first determinism via
// requester id (no createdAt on the schema).
async function listFriendRequests(req: Request, res: Response, next: NextFunction) {
  try {
    const me = req.auth!.userId;

    const requests = await prisma.friendship.findMany({
      where: { userIdB: me, status: "pending" },
      orderBy: { userIdA: "asc" },
      include: { userA: { select: { id: true, fullName: true } } },
    });

    res.status(200).json({
      requests: requests.map((row) => ({ userId: row.userA.id, fullName: row.userA.fullName })),
    });
  } catch (err) {
    next(err);
  }
}

router.get("/requests", listFriendRequests);

export default router;
