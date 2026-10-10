# 16 — Auth rate-limit plan (PLAN ONLY — no code, schema, migration, env, or data changed here)

Problem: register/login/forgot-password/resend-verification are capped per
client IP (5 email-sends / 20 logins per 10 min per endpoint,
`rateLimit.ts:84-91`). A campus NAT puts hundreds of students behind one
egress IP — one shared bucket fails legit signups.

## What identifies the client today

- `clientIp` (`src/middleware/rateLimit.ts:37-47`): the LAST
  `X-Forwarded-For` entry, else socket remoteAddress. Rationale in-code
  (`:16-23`): with exactly one trusted proxy hop (Railway), the last entry
  is the IP the proxy observed — unspoofable, unframeable.
- Express `trust proxy` is NOT set (`src/app.ts` has no `app.set` call at
  all); `req.ip` is unused. Only the manual XFF parse matters.
- Buckets are per-process memory, keyed `ip + endpoint path`, reset on
  deploy, unshared (`rateLimit.ts:12-15,54`).

## What breaks if Railway adds hops

- With two hops (client → proxy1 → proxy2 → app), XFF reads
  `client, proxy1` and the LAST entry is proxy1's address, not the client's:
  every user behind proxy1 shares one bucket (campus problem arrives via
  infrastructure, not NAT), and the anti-spoofing argument weakens (entries
  left of the last are still attacker-controlled).
- Detection is currently impossible from outside: no endpoint echoes the
  computed IP.

## How to verify the real client IP on Railway (read-only, one request)

- Compare Railway's edge/request logs for one test request (they show the
  connecting-IP chain) against the single-hop assumption; confirm the last
  XFF entry equals a real client IP, not a proxy address.
- If logs are inconclusive: add a temporary `[DEBUG] clientIp=` console line
  in `clientIp` behind an env flag, deploy, hit register once from a known
  IP, read the log, then remove the line. One request, no data change.

## Options compared

- Keep per-IP, raise limits: one-line change, but re-opens quota burn
  (Resend) and password brute force; does not fix multi-hop attribution.
- Per-IP + per-email composite (RECOMMENDED): bucket key becomes
  `ip + endpoint + normalized email` for the three email-taking endpoints
  (register/login/forgot-password; `normalizeEmail` already exists in
  `src/lib/normalize-email.ts`), keeping a looser per-IP ceiling above it.
  Campus users have distinct emails so legit traffic flows; an attacker
  rotating emails still hits the IP ceiling. Small middleware-only change,
  no migration, no schema, no new dependency.
- Captcha later: real bot defense, but needs a provider, keys, UI, and a
  product decision — LATER, not this change.

## Exact files to change (when approved)

1. `src/middleware/rateLimit.ts` — composite key builder + per-endpoint
   email extractor (body field only, never logged).
2. `src/routes/auth.routes.ts` — pass the email-aware limiter on the three
   endpoints (resend-verification already keys on the authed user; leave it).
3. Harness proof: shared-IP simulation (same XFF, distinct emails) —
   N distinct registrations succeed where one bucket would have 429'd;
   N+1st same-email attempt 429s.
