import { NextFunction, Request, Response } from "express";
import { ApiError } from "../lib/errors";
import { verifyAccessToken } from "../lib/jwt";

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
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
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

  next();
}

// For endpoints that are public but want to know who's asking when they happen to be
// logged in (e.g. GET /api/lessons/:id tracking progress for signed-in viewers). Unlike
// requireAuth, a missing or invalid token is never an error here — it just means the
// request is treated as anonymous, same as before this middleware existed.
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ") && header.slice(7).trim().length > 0) {
    const token = header.slice(7).trim();
    try {
      req.auth = verifyAccessToken(token);
    } catch {
      // Invalid/expired token on a public endpoint — stay anonymous rather than 401ing.
    }
  }

  next();
}
