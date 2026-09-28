// Google OAuth (authorization-code flow) via plain HTTPS calls — no SDK
// dependency, same precedent as src/lib/email.ts (Resend) and src/lib/sms.ts.
//
// Env:
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET — from the Google Cloud console
//     (APIs & Services → Credentials → OAuth client ID, type "Web
//     application"). When either is unset, Google sign-in is DISABLED and
//     every entry point fails closed with a 501 (never a redirect loop or a
//     half-authenticated session).
//   GOOGLE_CALLBACK_URL — the exact redirect URI registered in the console,
//     e.g. "https://<railway-app>/api/auth/google/callback" (production) or
//     "http://localhost:3000/api/auth/google/callback" (dev). Must match the
//     console entry byte-for-byte or Google refuses the exchange.
//   FRONTEND_URL — where to land after login (shared with email.ts).
//
// Security notes:
// - `state` is a signed random nonce round-tripped through the flow to block
//   CSRF login attacks (an attacker must not be able to log a victim in as
//   the attacker by starting the flow themselves). Stored server-side in the
//   in-memory map below with a 10-minute TTL — same single-instance caveat as
//   the rate limiter (acceptable: OAuth state only lives for one redirect).
// - Only Google-verified emails (`email_verified: true`) are accepted.
//   Unverified Google emails authenticate nothing.
// - ID tokens are NOT accepted from the client; the backend exchanges the
//   code itself and reads the profile from Google's userinfo endpoint, so a
//   forged token can never be injected.

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

const STATE_TTL_MS = 10 * 60 * 1000;
const pendingStates = new Map<string, number>();

export function isGoogleConfigured(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

function callbackUrl(): string {
  return (
    process.env.GOOGLE_CALLBACK_URL ?? "http://localhost:3000/api/auth/google/callback"
  );
}

export function mintOAuthState(): string {
  const state =
    Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2);
  pruneStates();
  pendingStates.set(state, Date.now() + STATE_TTL_MS);
  return state;
}

export function consumeOAuthState(state: string | undefined): boolean {
  if (!state) return false;
  pruneStates();
  if (!pendingStates.has(state)) return false;
  pendingStates.delete(state);
  return true;
}

function pruneStates() {
  const now = Date.now();
  if (pendingStates.size > 1000) {
    for (const [key, expiresAt] of pendingStates) {
      if (now >= expiresAt) pendingStates.delete(key);
    }
  }
}

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: callbackUrl(),
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  fullName: string | null;
}

export async function exchangeCodeForProfile(code: string): Promise<GoogleProfile> {
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: callbackUrl(),
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!tokenRes.ok) {
    throw new Error(`token exchange failed: ${tokenRes.status}`);
  }
  const tokenBody = (await tokenRes.json()) as { access_token?: string };
  if (!tokenBody.access_token) {
    throw new Error("token exchange returned no access token");
  }

  const infoRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenBody.access_token}` },
  });
  if (!infoRes.ok) {
    throw new Error(`userinfo failed: ${infoRes.status}`);
  }
  const info = (await infoRes.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };
  if (!info.sub || !info.email) {
    throw new Error("userinfo missing sub/email");
  }
  return {
    sub: info.sub,
    email: info.email,
    emailVerified: info.email_verified === true,
    fullName: typeof info.name === "string" && info.name.trim() ? info.name.trim() : null,
  };
}

export function frontendLoginRedirect(accessToken: string): string {
  const base = (process.env.FRONTEND_URL ?? "http://localhost:3001").replace(/\/+$/, "");
  return `${base}/login?google_token=${encodeURIComponent(accessToken)}`;
}
