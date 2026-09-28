import { NextFunction, Request, Response } from "express";

// In-memory sliding-window rate limiter (zero new dependencies — same precedent
// as src/lib/email.ts using plain fetch instead of an SDK).
//
// Why this exists: register / forgot-password / resend-verification each send a
// real Resend email per call, and login is a credential-guessing surface. All
// four were unthrottled, so one abusive IP could burn the Resend quota or
// brute-force passwords. This caps calls per client IP per endpoint.
//
// Deliberate limitations (MVP-appropriate, do not "fix" without a real cause):
// - Per-process memory: Railway runs a single API instance, so one Map is the
//   whole store. Buckets reset on restart/deploy and are NOT shared across
//   instances — revisit only if the API ever scales horizontally (then use
//   Redis or a gateway-level limiter).
// - Client identity is the IP, taken as the LAST X-Forwarded-For entry.
//   Railway fronts the API, so req.socket.remoteAddress alone would be the
//   proxy for everyone. Last-entry (not first) is deliberate: with a single
//   trusted proxy hop, the last entry is the IP the proxy itself observed —
//   an attacker cannot spoof it, and cannot frame someone else's bucket by
//   sending a forged XFF (their forgery lands left of the proxy-added entry).
//   Accepted residual: this is abuse friction + quota protection, not a
//   security boundary; auth itself stays the boundary.
// - Responses use the standard { error: { code, message } } shape plus a
//   Retry-After header (seconds). The message is generic on purpose —
//   throttling must not leak whether an account exists (same rule as the
//   forgot-password generic response).
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

const MAX_BUCKETS = 5000;

function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    const parts = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return req.socket?.remoteAddress ?? "unknown";
}

function rateLimit(windowMs: number, max: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    // originalUrl ("/api/auth/register") — unique across routers, unlike the
    // router-relative req.path ("/register" could exist under two mounts).
    const pathname = req.originalUrl.split("?")[0];
    const key = `${clientIp(req)}:${pathname}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    // Lazy prune: only sweep when the map grows past a bound, so the common
    // case stays O(1). Expired buckets are also recycled on next hit above.
    if (buckets.size > MAX_BUCKETS) {
      for (const [k, v] of buckets) {
        if (now >= v.resetAt) buckets.delete(k);
      }
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        error: { code: "RATE_LIMITED", message: "Too many requests. Please try again later." },
      });
    }
    next();
  };
}

// Authenticated-or-not endpoints that send a real email per call (Resend
// quota protection). 5 attempts per 10 minutes per IP per endpoint.
export const limitEmailSends = rateLimit(10 * 60 * 1000, 5);

// Password-guessing friction on login. 20 per 10 minutes per IP — high enough
// that shared networks (campus NAT) don't trip it in normal use, low enough
// to make online brute force impractical (bcrypt at 10 rounds already makes
// each attempt expensive server-side).
export const limitLogins = rateLimit(10 * 60 * 1000, 20);
