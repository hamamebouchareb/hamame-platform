# 05 — Env and deploy (NAMES ONLY, verified 2026-10-02)

Rule: no values, no secrets below — names + where each is read.

## Backend env (read in src/; see .env.example for placeholders)

- `DATABASE_URL` — Prisma datasource (schema.prisma). REQUIRED. Session
  pooler `aws-0-eu-west-1.pooler.supabase.com:5432` is the only working
  host (no shadow DB: never `migrate dev`, only `migrate diff` + `deploy`).
- `PORT` — server.ts (default 3000). Server-only.
- `JWT_SECRET` — lib/jwt.ts. REQUIRED; throws when missing (fail-loud by
  design, unlike every optional integration).
- `ALLOWED_ORIGINS` — app.ts exact-origin CORS match (comma-separated);
  `CORS_ORIGIN` legacy fallback. Default `http://localhost:3001` (note:
  `127.0.0.1:3001` is a different origin and gets blocked).
- `FRONTEND_URL` — builds `/verify?token=` and OAuth redirect links
  (email.ts, sms.ts, oauth-google.ts, auth.routes.ts). Default localhost.
- `RESEND_API_KEY` + `EMAIL_FROM` — lib/email.ts. OPTIONAL warn-only:
  unset → registration succeeds, token via server log + non-prod response.
- `ANTHROPIC_API_KEY` — lib/ai/anthropic.ts (hints + explanations).
  OPTIONAL: unset → review hook logs+skips, hints endpoint 503
  AI_NOT_CONFIGURED, no credit spent.
- `SMS_PROVIDER` + `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM`
  — lib/sms.ts. OPTIONAL: non-twilio provider (or unset) → logs only.
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` + `GOOGLE_CALLBACK_URL` —
  lib/oauth-google.ts. OPTIONAL: unset → `/providers` false (button hidden),
  url/callback 501 OAUTH_NOT_CONFIGURED (fail-closed).
- `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` —
  lib/push/vapid.ts. OPTIONAL: unset → payloads logged, triggers still run.
- `NODE_ENV` — auth.routes.ts dev fallbacks (tokens in non-prod responses).
- `SEED_HEAVY_PASSWORD` — prisma/seed-heavy.ts only; aborts if unset
  (never a default password).

## Web env (`web/.env.local`)

- `NEXT_PUBLIC_API_URL` — lib/api.ts (default `http://localhost:3000/api`).
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — usePushSubscription.ts (default "").

## Deploy (verified via Railway + Vercel APIs 2026-10-01/02; tokens deleted)

- Backend — Railway service `hamame-platform`, project `friendly-strength`,
  env production, builder RAILPACK, no custom build/root/start commands
  (auto `npm run build` = `prisma generate && tsc`, start `npm start`).
  Latest deploy SUCCESS; ~34-deep history, zero FAILED.
- Frontend ×2 — `hamame-platform-wcpk` AND `hamame-platform-z3cq`
  (both `framework nextjs`, `rootDirectory web`, productionBranch main).
  Both READY on current main.
- REDUNDANT, UNDECIDED: third Vercel project `hamame-platform`
  (`framework express`, repo root) compiles the BACKEND on Vercel — red on
  every commit since the Sept-28 models (bare committed `tsc`, fixed by the
  generate commit, now READY). Keep as staging or delete it.
- CORS is env-driven: Railway `ALLOWED_ORIGINS` must list localhost:3001 +
  the Vercel URL(s); Vercel sets `NEXT_PUBLIC_API_URL` to the Railway `/api`.
- Node pin: `engines: { node: ">=20.9.0" }` in `web/package.json` (Vercel
  once failed exit-2 without it — do not remove). Root has no engines field;
  Railway resolved node 24.21.0.
- Build/postinstall: root `build` = `prisma generate && tsc -p tsconfig.json`,
  `postinstall` = `prisma generate` (the Sept-28→Oct-01 red streak was the
  committed script lacking generate; fixed, proven green on all remotes).
