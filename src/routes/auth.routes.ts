import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { validateBody } from "../middleware/validate";
import { requireAuth } from "../middleware/auth";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { signAccessToken } from "../lib/jwt";

const BCRYPT_SALT_ROUNDS = 10;

const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// Verification tokens are valid longer than reset tokens (24h) since there's no
// password-change urgency — the user just needs to click before it lapses.
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Password reset tokens are stored hashed with sha256 (NOT bcrypt) — they're high-entropy
// single-use lookup tokens, not human-memorizable passwords, so a fast deterministic hash
// is the right trade-off: it still prevents a DB leak from exposing usable tokens while
// letting us look the user up directly by hash in reset-password.
function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// Fields safe to return to the client. Deliberately excludes passwordHash — callers
// must select passwordHash separately (e.g. for login's comparison) and pass the full
// row through toUserResponse, which strips it before it reaches any response body.
const safeUserSelect = {
  id: true,
  email: true,
  phone: true,
  fullName: true,
  facultyId: true,
  yearId: true,
  university: true,
  wilaya: true,
  uiLanguage: true,
  theme: true,
  status: true,
  createdAt: true,
} as const;

function toUserResponse(user: {
  id: string;
  email: string | null;
  phone: string | null;
  fullName: string | null;
  facultyId: string | null;
  yearId: string | null;
  university: string | null;
  wilaya: string | null;
  uiLanguage: string;
  theme: string;
  status: string;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    fullName: user.fullName,
    facultyId: user.facultyId,
    yearId: user.yearId,
    university: user.university,
    wilaya: user.wilaya,
    uiLanguage: user.uiLanguage,
    theme: user.theme,
    status: user.status,
    createdAt: user.createdAt,
  };
}

// docs/hamame_api_contract.md — "Auth & Account" section.
// These endpoints are inherently pre-authentication, so no requireAuth here.
const router = Router();

const identifierRefinement = <T extends { email?: string; phone?: string }>(data: T, ctx: z.RefinementCtx) => {
  if (!data.email && !data.phone) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Either email or phone is required.",
      path: ["email"],
    });
  }
};

// POST /api/auth/register — FR-1: register via email or phone.
const registerSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(6).optional(),
    password: z.string().min(8),
    fullName: z.string().min(1),
  })
  .superRefine(identifierRefinement);

async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, phone, password, fullName } = req.body as z.infer<typeof registerSchema>;

    const existing = await prisma.user.findFirst({
      where: {
        OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
      },
      select: { id: true },
    });
    if (existing) {
      throw new ApiError(409, "ALREADY_REGISTERED", "An account with this email or phone already exists.");
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    const user = await prisma.user.create({
      data: { email, phone, passwordHash, fullName },
      select: safeUserSelect,
    });

    // FR-3: mint a single-use verification token right after creation so the new account
    // is ready for POST /api/auth/verify immediately. Same hashing/expiry rationale as
    // the password reset token, but with a 24h TTL since verification isn't urgent.
    const rawVerificationToken = randomBytes(32).toString("hex");
    await prisma.user.update({
      where: { id: user.id },
      data: {
        verificationTokenHash: sha256(rawVerificationToken),
        verificationTokenExpiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
      },
    });

    // MVP workaround (same documented pattern as forgot-password): no email/SMS provider
    // exists, so the raw token is logged to the server console and additionally returned
    // in the response ONLY outside production so FR-3 is testable without real delivery.
    // Never include it in production.
    const verificationIdentifier = user.email ?? user.phone;
    console.log(`[DEV] Verification token for ${verificationIdentifier}: ${rawVerificationToken}`);

    // Every new registrant gets the default 'student_free' role (PRD Section 6). The
    // Role row is looked up by name rather than a hardcoded id since prisma/seed.ts
    // generates ids at seed time, not fixed ones. This shouldn't ever be missing once
    // the DB is seeded, but registration itself must not hard-fail on a seeding gap —
    // so a missing role only logs a warning and skips the assignment rather than
    // rejecting the whole signup (the same sequential-await style as the rest of this
    // handler, which has no existing transaction to join).
    const studentFreeRole = await prisma.role.findUnique({ where: { name: "student_free" } });
    if (studentFreeRole) {
      await prisma.userRole.create({ data: { userId: user.id, roleId: studentFreeRole.id } });
    } else {
      console.warn(
        `[auth.routes] 'student_free' role not found — skipping default role assignment for new user ${user.id}. Has prisma/seed.ts been run?`
      );
    }

    const accessToken = signAccessToken({ userId: user.id });

    const responseBody: {
      accessToken: string;
      user: ReturnType<typeof toUserResponse>;
      verificationToken?: string;
    } = { accessToken, user: toUserResponse(user) };
    if (process.env.NODE_ENV !== "production") {
      responseBody.verificationToken = rawVerificationToken;
    }
    res.status(201).json(responseBody);
  } catch (err) {
    next(err);
  }
}

router.post("/register", validateBody(registerSchema), register);

// POST /api/auth/login
const loginSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(6).optional(),
    password: z.string().min(1),
  })
  .superRefine(identifierRefinement);

async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, phone, password } = req.body as z.infer<typeof loginSchema>;

    const user = await prisma.user.findFirst({
      where: {
        OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
      },
      select: { ...safeUserSelect, passwordHash: true },
    });

    // Same 401 for "no such account" and "wrong password" to avoid leaking which
    // identifiers are registered.
    const invalidCredentials = () => new ApiError(401, "INVALID_CREDENTIALS", "Invalid email/phone or password.");

    if (!user) {
      throw invalidCredentials();
    }

    if (user.status === "deleted") {
      throw invalidCredentials();
    }

    let passwordMatches: boolean;
    try {
      passwordMatches = await bcrypt.compare(password, user.passwordHash);
    } catch {
      // A malformed/non-bcrypt hash is still an authentication failure, not a server error.
      passwordMatches = false;
    }
    if (!passwordMatches) {
      throw invalidCredentials();
    }

    const accessToken = signAccessToken({ userId: user.id });
    res.status(200).json({ accessToken, user: toUserResponse(user) });
  } catch (err) {
    next(err);
  }
}

router.post("/login", validateBody(loginSchema), login);

// POST /api/auth/forgot-password
const forgotPasswordSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(6).optional(),
  })
  .superRefine(identifierRefinement);

const RESET_TOKEN_GENERIC_MESSAGE = "If an account exists for that email or phone, a password reset token has been issued.";

async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, phone } = req.body as z.infer<typeof forgotPasswordSchema>;

    const user = await prisma.user.findFirst({
      where: {
        OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
      },
      select: { id: true, email: true, phone: true, status: true },
    });

    // Anti-enumeration: respond identically whether or not the identifier is registered.
    // Deleted accounts are treated as not-found too — we never mint a token for them, and
    // the identical 200 hides the difference, mirroring login's handling of deleted users.
    if (user && user.status !== "deleted") {
      const rawToken = randomBytes(32).toString("hex");
      const tokenHash = sha256(rawToken);
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetTokenHash: tokenHash,
          passwordResetTokenExpiresAt: expiresAt,
        },
      });

      // MVP workaround per PRD-section conventions (mirroring the documented
      // 'manual_assisted' payment placeholder): there is no email/SMS provider in this
      // project yet, so the raw token is logged to the server console, and additionally
      // returned in the response ONLY outside production so the flow is testable without
      // real delivery. Never include it in the response when NODE_ENV === 'production'.
      const identifier = user.email ?? user.phone;
      console.log(`[DEV] Password reset token for ${identifier}: ${rawToken}`);

      if (process.env.NODE_ENV !== "production") {
        res.status(200).json({ message: RESET_TOKEN_GENERIC_MESSAGE, resetToken: rawToken });
      } else {
        res.status(200).json({ message: RESET_TOKEN_GENERIC_MESSAGE });
      }
    } else {
      res.status(200).json({ message: RESET_TOKEN_GENERIC_MESSAGE });
    }
  } catch (err) {
    next(err);
  }
}

router.post("/forgot-password", validateBody(forgotPasswordSchema), forgotPassword);

// POST /api/auth/reset-password
const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

// Shared by reset-password and verify — keep the wording token-type-neutral so a
// verify failure doesn't claim the caller's "reset token" is bad.
const invalidOrExpiredToken = () =>
  new ApiError(400, "INVALID_OR_EXPIRED_TOKEN", "The token is invalid or has expired.");

async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { token, newPassword } = req.body as z.infer<typeof resetPasswordSchema>;

    const tokenHash = sha256(token);
    const user = await prisma.user.findFirst({
      where: {
        passwordResetTokenHash: tokenHash,
        passwordResetTokenExpiresAt: { gt: new Date() },
      },
      select: { id: true, status: true },
    });

    // Same error for "no matching token", "expired", and "deleted account" — the client
    // learns nothing beyond the token being unusable (no account-status enumeration).
    if (!user || user.status === "deleted") {
      throw invalidOrExpiredToken();
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

    // Single-use: consuming the token clears both reset fields so it can't be replayed.
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetTokenHash: null,
        passwordResetTokenExpiresAt: null,
      },
      select: safeUserSelect,
    });

    // Deliberately no accessToken here — resetting a password must not also log the user
    // in; they authenticate again via /login with the new password.
    res.status(200).json({ user: toUserResponse(updated) });
  } catch (err) {
    next(err);
  }
}

router.post("/reset-password", validateBody(resetPasswordSchema), resetPassword);

// POST /api/auth/verify — FR-3: email/phone verification.
const verifySchema = z.object({
  token: z.string().min(1),
});

async function verify(req: Request, res: Response, next: NextFunction) {
  try {
    const { token } = req.body as z.infer<typeof verifySchema>;

    const tokenHash = sha256(token);
    const user = await prisma.user.findFirst({
      where: {
        verificationTokenHash: tokenHash,
        verificationTokenExpiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        status: true,
        email: true,
        phone: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
      },
    });

    // Same error for "no matching token", "expired", and "deleted account" — the client
    // learns nothing beyond the token being unusable (no account-status enumeration).
    if (!user || user.status === "deleted") {
      throw invalidOrExpiredToken();
    }

    // Verify whichever identifier is still unverified — email takes precedence when both
    // exist. If both are already verified (or neither identifier is present), the token
    // is still consumed but the field write is a no-op.
    let emailVerifiedAt = user.emailVerifiedAt;
    let phoneVerifiedAt = user.phoneVerifiedAt;
    if (user.email && !user.emailVerifiedAt) {
      emailVerifiedAt = new Date();
    } else if (user.phone && !user.phoneVerifiedAt) {
      phoneVerifiedAt = new Date();
    }

    // Single-use: consuming the token clears both verification fields so it can't be replayed.
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt,
        phoneVerifiedAt,
        verificationTokenHash: null,
        verificationTokenExpiresAt: null,
      },
      select: safeUserSelect,
    });

    res.status(200).json({ user: toUserResponse(updated) });
  } catch (err) {
    next(err);
  }
}

router.post("/verify", validateBody(verifySchema), verify);

// POST /api/auth/change-password — authenticated self-service password change (settings
// page). The caller proves knowledge of the CURRENT password, so unlike reset-password
// there is nothing to invalidate: existing access tokens stay valid and no re-login is
// forced. This router is otherwise pre-auth, hence the per-route requireAuth.
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  // Same strength rule as register/reset-password: min 8.
  newPassword: z.string().min(8),
});

// One generic rejection for every failure mode (bad current password, deleted account)
// — mirroring login's anti-enumeration stance: the response must not reveal which check
// failed.
const changeFailed = () =>
  new ApiError(400, "PASSWORD_CHANGE_FAILED", "Unable to change the password. Verify the current password and try again.");

async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { currentPassword, newPassword } = req.body as z.infer<typeof changePasswordSchema>;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, passwordHash: true },
    });
    if (!user || user.status === "deleted") {
      throw changeFailed();
    }

    let currentPasswordMatches: boolean;
    try {
      currentPasswordMatches = await bcrypt.compare(currentPassword, user.passwordHash);
    } catch {
      // A malformed/non-bcrypt hash is a failed verification, not a server error.
      currentPasswordMatches = false;
    }
    if (!currentPasswordMatches) {
      throw changeFailed();
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
      select: safeUserSelect,
    });

    res.status(200).json({ message: "Password updated.", user: toUserResponse(updated) });
  } catch (err) {
    next(err);
  }
}

router.post("/change-password", requireAuth, validateBody(changePasswordSchema), changePassword);

export default router;
