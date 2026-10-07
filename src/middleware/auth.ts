import { NextFunction, Request, Response } from "express";
import { ApiError } from "../lib/errors";
import { verifyAccessToken } from "../lib/jwt";
import { prisma } from "../lib/prisma";
import { isEffectivelySuspended } from "../lib/suspension";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { userId: string };
    }
  }
}

// Verifies the Bearer JWT (docs/hamame_api_contract.md: "Auth via Bearer JWT unless
// noted") and populates req.auth.userId. Tokens are issued by POST /api/auth/register
// and POST /api/auth/login via signAccessToken in src/lib/jwt.ts.
//
// Suspension/deletion enforcement lives here too (BR-5): after the token
// checks out, exactly one indexed PK lookup reads status + suspendedUntil.
// Results are cached 30s per user (see below); a suspended account gets 403
// ACCOUNT_SUSPENDED (with the end date or null in details), a deleted one
// 401. Async by necessity (Express 4: errors funnelled via next, never
// thrown).
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ") || header.slice(7).trim().length === 0) {
    return next(new ApiError(401, "UNAUTHENTICATED", "A Bearer token is required for this endpoint."));
  }

  const token = header.slice(7).trim();
  try {
    req.auth = verifyAccessToken(token);
  } catch {
    return next(new ApiError(401, "UNAUTHENTICATED", "The provided token is invalid or expired."));
  }

  try {
    const state = await accountState(req.auth.userId);
    if (state === null) {
      delete req.auth;
      return next(new ApiError(401, "UNAUTHENTICATED", "The provided token is invalid or expired."));
    }
    if (state.status === "deleted") {
      delete req.auth;
      return next(new ApiError(401, "ACCOUNT_DELETED", "This account has been deleted."));
    }
    if (isEffectivelySuspended(state.status, state.suspendedUntil)) {
      delete req.auth;
      return next(
        new ApiError(403, "ACCOUNT_SUSPENDED", "This account is suspended.", {
          suspendedUntil: state.suspendedUntil ? state.suspendedUntil.toISOString() : null,
        })
      );
    }
  } catch (err) {
    return next(err);
  }

  next();
}

// For endpoints that are public but want to know who's asking when they happen to be
// logged in (e.g. GET /api/lessons/:id tracking progress for signed-in viewers). Unlike
// requireAuth, a missing or invalid token is never an error here — it just means the
// request is treated as anonymous, same as before this middleware existed. A
// suspended (or deleted) token holder is likewise treated as anonymous: public
// pages keep working, and no privileged view can leak through the identity.
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ") && header.slice(7).trim().length > 0) {
    const token = header.slice(7).trim();
    try {
      req.auth = verifyAccessToken(token);
    } catch {
      // Invalid/expired token on a public endpoint — stay anonymous rather than 401ing.
    }
  }

  if (req.auth) {
    try {
      const state = await accountState(req.auth.userId);
      if (
        state === null ||
        state.status === "deleted" ||
        isEffectivelySuspended(state.status, state.suspendedUntil)
      ) {
        delete req.auth;
      }
    } catch (err) {
      return next(err);
    }
  }

  next();
}

// Account-state cache for the middlewares above: one indexed PK lookup per
// user per 30s instead of per request. Trade-offs, stated plainly: a freshly
// suspended user keeps working for up to 30s (restrict invalidates their
// entry immediately, so the real window is one in-flight request, not 30s);
// a user unsuspended by the daily job (or re-activated) waits up to 30s for
// access to return. Both bounds beat a DB round-trip on every one of the ~25
// authenticated routers, and the pooler stays quiet. Single-process Map —
// correct for the current single-instance deploy, same documented limit as
// the rate limiter.
const ACCOUNT_STATE_TTL_MS = 30_000;
const MAX_ACCOUNT_STATE_ENTRIES = 5000;

interface AccountState {
  status: string;
  suspendedUntil: Date | null;
}

const accountStateCache = new Map<string, { at: number; state: AccountState }>();

async function accountState(userId: string): Promise<AccountState | null> {
  const now = Date.now();
  const cached = accountStateCache.get(userId);
  if (cached && now - cached.at < ACCOUNT_STATE_TTL_MS) return cached.state;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true, suspendedUntil: true },
  });
  if (!user) {
    accountStateCache.delete(userId);
    return null;
  }
  if (accountStateCache.size >= MAX_ACCOUNT_STATE_ENTRIES) accountStateCache.clear();
  const state: AccountState = { status: user.status, suspendedUntil: user.suspendedUntil };
  accountStateCache.set(userId, { at: now, state });
  return state;
}

/** Drop one user's cached account state immediately (call after writes that
 *  change status/suspendedUntil — restrict, self-delete — so enforcement
 *  applies to the very next request, not up to 30s later). */
export function invalidateAccountState(userId: string): void {
  accountStateCache.delete(userId);
}
