import jwt from "jsonwebtoken";

export interface AccessTokenPayload {
  userId: string;
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
export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign({}, getSecret(), { subject: payload.userId, expiresIn: ACCESS_TOKEN_TTL });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, getSecret());
  if (typeof decoded === "string" || !decoded.sub) {
    throw new Error("Token payload is missing a subject (userId) claim.");
  }
  return { userId: decoded.sub };
}
