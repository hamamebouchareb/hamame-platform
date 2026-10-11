import jwt from "jsonwebtoken";

export interface AccessTokenPayload {
  userId: string;
  tokenVersion?: number;
}

export interface VerifiedAccessToken {
  userId: string;
  /** Numeric "tv" claim, or null when the token predates versioning. */
  tokenVersion: number | null;
}

// Access tokens are short-lived-ish; refresh-token flow is not modeled yet (no such
// table in prisma/schema.prisma) and is out of scope for the current task.
const ACCESS_TOKEN_TTL = "7d";

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set.");
  }
  return secret;
}

// Used by POST /api/auth/register and POST /api/auth/login (auth.routes.ts).
// Embeds the user's tokenVersion as the numeric "tv" claim (default 1 for
// callers that don't pass one); see docs/state/14-token-invalidation-plan.md.
export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(
    { tv: payload.tokenVersion ?? 1 },
    getSecret(),
    { subject: payload.userId, expiresIn: ACCESS_TOKEN_TTL }
  );
}

export function verifyAccessToken(token: string): VerifiedAccessToken {
  const decoded = jwt.verify(token, getSecret());
  if (typeof decoded === "string" || !decoded.sub) {
    throw new Error("Token payload is missing a subject (userId) claim.");
  }
  const tv = (decoded as { tv?: unknown }).tv;
  return {
    userId: decoded.sub,
    tokenVersion: typeof tv === "number" && Number.isInteger(tv) ? tv : null,
  };
}
