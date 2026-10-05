# 12 — Launch readiness audit (READ-ONLY, 2026-10-04 — no code, schema, migration, env, or data changed here)

Method: code and live-DB reads only. Every claim cites `file:line` or real
command output; anything else is marked UNVERIFIED. No secrets printed (env
var names only, no values, tokens, keys, or emails).

## 1. Legal and trust

- EXISTS: account export `GET /api/users/me/export` (`src/routes/users.routes.ts:354`,
  FR-8/NFR-5 portability, `Content-Disposition` attachment) and soft-delete
  `DELETE /api/users/me` (`users.routes.ts:387`, status flips to `deleted`,
  PII scrubbed, FK rows kept — policy `docs/hamame-user-deletion-policy.md`).
- MISSING: Terms of use and Privacy policy pages — no `terms`/`privacy`
  route exists under `web/src/app`, and the landing `Footer` renders with zero
  links (`web/src/app/page.tsx:147` renders `<Footer />`; `Footer.tsx:18`
  defaults `links` to `[]`). Registration mentions no terms
  (`register/page.tsx` has no terms/privacy/consent copy).
- MISSING: cookie/analytics consent — none exists; the only `cookie` hit in
  `web/src` is a comment about httpOnly cookies (`AuthContext.tsx:80`), and no
  analytics vendor (gtag/umami/plausible) is referenced anywhere.
- WEAK: minors handling (BR-11). `isMinor` exists ONLY as a schema column
  (`prisma/schema.prisma:92`, default false) with zero references anywhere in
  `src/` — no enforcement, no parental flow, no retention difference.
- NEXT: owner commissions Terms + Privacy (Algerian Law 18-07 aligned),
  adds `/terms` + `/privacy` routes linked from `Footer` and registration,
  and decides whether BR-11 needs real enforcement or the column goes.

## 2. Accounts

- EXISTS: registration (`POST /api/auth/register`, `auth.routes.ts:204`,
  email-or-phone via `identifierRefinement`, `auth.routes.ts:102-109`),
  email verification + resend (`:441`, `:521`), password reset with generic
  responses (`:326`, `:379`, constant message `:266`), password change
  (`:576`), Google OAuth code flow (env-gated, live round-trip UNVERIFIED).
- Phone-only accounts are first-class (FR-1): register/login/reset accept
  phone, SMS via Twilio is warn-only (`src/lib/sms.ts:5-14`).
- Delivery failure UX: registration returns `verificationEmailSent` /
  `verificationSmsSent` booleans (`auth.routes.ts:173-194`) so the UI can say
  so; sending itself never throws (`email.ts:13-14`, `sms.ts:13-14` — the
  flows stay usable and tokens remain valid). The register handler logs a
  `[DEV] Verification token` server-side (`auth.routes.ts:149`).
- UNVERIFIED: whether the sender domain in `EMAIL_FROM` (default domain in
  `src/lib/email.ts:47`) is actually a verified Resend sender/domain — code
  cannot prove DNS. NEXT: owner verifies the domain in Resend and sends one
  real email + one real Algerian SMS before launch.

## 3. Payments path (manual activation codes)

- EXISTS end to end: agent issues a code after off-platform payment
  (`POST /api/admin/activation-codes`, `activationCodes.routes.ts:243`,
  support_agent/admin, uppercase opaque `AC-` + 20 hex chars); student redeems
  in-app via `ActivationCodeCard` on the subscription page
  (`web/src/components/ActivationCodeCard.tsx:15-34`, error codes surface
  verbatim); redemption grants a fixed 30-day premium (`ACTIVATION_GRANT_DAYS`,
  `activationCodes.routes.ts:29`) with an atomic conditional claim
  (`:100-106`); admin UI covers list/issue/revoke (`/admin/codes`,
  proven in a real browser 2026-10-04).
- How they ask/pay today: out-of-band (no in-app request or payment UI).
  `activation.desc` copy says so (`i18n.ts:1047-1048`).
- MISSING: self-service payment (CIB/SATIM) — deliberate deferral, manual
  codes are the live mechanism; no in-app "request a code" surface; grant is
  blanket premium (subscriptions carry no scope columns — now stated in the
  issue-form helper `admin.codesScopeNote`).
- NEXT: owner documents the pay-and-ask channel (phone/WhatsApp/counter) on
  the subscription page, then watches code volume to trigger the CIB
  product call.

## 4. Data safety

- EXISTS in-repo: nothing scheduled — no dump script, no restore doc, no
  backup job in `src/` or `prisma/`. The handoff's "snapshot" references are
  per-row verification snapshots, not database backups.
- UNVERIFIED: what the current Supabase plan actually provides (PITR window,
  daily backups, region). The repo cannot prove this — do not assume the free
  tier keeps you safe. NEXT: owner opens the Supabase dashboard, records plan
  + PITR window + backup schedule here, and enables what is missing.
- Export today: per-user JSON via `GET /api/users/me/export` only; no
  whole-bank export (questions/lessons/curriculum) exists. NEXT: add a
  `pg_dump --format=custom` nightly (cron or Supabase scheduled backup) stored
  off-site, plus a documented restore drill: restore to a throwaway project,
  run `npx prisma migrate status`, boot the API against it, and run the
  Playwright smoke — paste all four outputs into `docs/verification/`.

## 5. Reliability

- EXISTS: warn-only degradation for email/SMS/AI/push (flows never hard-fail);
  rate limits on register/login/forgot/resend (`auth.routes.ts:204,256,326,521`,
  in-memory sliding window, single-instance only — `rateLimit.ts:11-12`);
  pagination everywhere (`page` default 1, `limit` default 20 max 100,
  `common-schemas.ts:9-10`); scope indexes on hot paths
  (`@@index` at `schema.prisma:301,385` university scoping, `:901-902`
  simulation scheduling, `:946` push lookup).
- MISSING: no health endpoint (no `/api/health` route exists; probe target is
  `GET /api/plans`); error monitoring is `console.warn/error` only — zero
  Sentry/Datadog/Logtail references in `src/`; no offline/maintenance banner
  in `web/src` (API-down UX is per-page `ErrorState` + retry, which is honest
  but silent at platform level).
- UNVERIFIED: Railway cold-start behaviour, pooler behaviour at launch-day
  concurrency (the ~10-connection P1001 ceiling is documented from dev
  experience, not load-tested), per-query index sufficiency beyond the scope
  columns. NEXT: add a tiny public health route, wire an error tracker
  (or at minimum a log drain), and load-test session-submit bursts.

## 6. Security

- EXISTS: `.env` gitignored, `JWT_SECRET` throws when missing
  (`src/lib/jwt.ts:14`); JWT TTL 7d (`jwt.ts:9`), Bearer in `Authorization`
  header, token in localStorage `hamame_auth` (deliberate MVP trade-off,
  documented `AuthContext.tsx:80-83`); admin routers role-gated
  (`admin.routes.ts:37` admin/super_admin, activation codes
  support_agent/admin at `activationCodes.routes.ts:190`, admin notifications
  at `notifications.routes.ts:160`); CORS exact-origin allowlist
  (`ALLOWED_ORIGINS`, `src/app.ts`); self-revoke guard
  (`CANNOT_SELF_REVOKE_ADMIN`); no `TODO/FIXME` in `src/`+`web/src`.
- `npm audit --omit=dev` (real output, 2026-10-04): backend **6
  vulnerabilities (3 moderate, 3 high)** — `qs` 2.2.5-6.15.3 via
  `body-parser` via `express` (2 advisories), `deepmerge-ts` via
  `@prisma/config` via `prisma` (dev-chain). Web **5 vulnerabilities
  (1 moderate, 3 high, 1 critical)** — `next` 9.3.4-canary.0-16.3.5 (12
  advisories incl. RCE/SSRF/cache-confusion; fix is `next@16.3.8`, outside the
  stated range, needs `audit fix --force`), plus `postcss`, `sharp`,
  `nanoid`, `baseline-browser-mapping`. Both commands exit 1.
- UNVERIFIED: repo visibility (owner action, still open) and whether any
  secret ever touched history beyond the rotated 2026-09-12 passwords.
- NEXT: owner confirms repo visibility; plan the `next@16.3.8` upgrade on a
  branch (breaking-range change — full gates + smoke before merge); rotate
  `JWT_SECRET` if it predates the team.

## 7. Product basics

- EXISTS: public landing (`web/src/app/page.tsx`, hero + 2 CTAs,
  `landing.*` keys, metadata title "Hamame" + description
  `layout.tsx:19-21`); mobile bottom 5-tab bar + drawer + desktop sidebar
  (all routes); empty states on library/coverage (`faculties/page.tsx:78,118`,
  `couverture/page.tsx:119-121`); FR/EN completeness enforced by `tsc`
  (`en: Record<I18nKey, string>`, `i18n.ts:8,1076-1078`).
- MISSING: `not-found.tsx` / `error.tsx` / `loading.tsx` — none exist under
  `web/src/app`, so 404s and route crashes fall back to Next defaults.
- Metadata is thin (title + one-line description, no OG/Twitter cards).
- NEXT: add branded 404 + 500 pages (FR+EN), OG metadata, and walk the
  empty-bank states (dentistry `planned` + Internat honest empties) in a real
  browser before launch.

## 8. Cleanup before real users (live counts, 2026-10-04)

Real output from a read-only script (counts only, no PII):
`users-total=46 users-active=31 users-suspended=0 users-deleted=15
sessions=91 attempts=201 notes=13 user-badges=14 subscriptions=8 payments=5`.

- Test-vs-real attribution at row level is UNVERIFIED from counts alone (the
  owner knows the test addresses; the 4 role-matrix accounts plus the heavy-QA
  account are named in handoff §7). The 15 `deleted` rows include this
  session's own disposable verifications (soft-deleted, PII scrubbed —
  the mechanism works).
- Safe purge deletes, per account via the platform's own `DELETE
  /api/users/me` (never raw SQL, FK rows stay valid): every test account
  except none — real students do not exist yet, so everything except the
  owner's account(s) goes. MUST KEEP: the schema, all curriculum/content
  (approved bank), plans, roles, faculties/years/modules/units, badge
  catalog. Test sessions/attempts/notes/badges/subscriptions/payments vanish
  with their accounts (or stay only where FKs require — recount after).
- The 41-test-account figure from `10-owner-actions.md` is consistent with
  46 total minus owner/seed accounts; exact list = owner-provided.
- NEXT: owner supplies the keep-list (1 line: which accounts survive), then
  purge + recount (`users-active` must equal the keep-list size, sessions and
  attempts from test accounts must be 0).

## Prioritised list

MUST before launch: verify Resend sender domain + one real email and one real Algerian SMS; confirm Supabase backups/PITR in the dashboard and store one off-site dump; confirm repo visibility; purge test accounts to the keep-list and recount; add Terms + Privacy pages linked from footer and registration; upgrade `next` past the critical advisories (or record accepted risk); decide BR-11 (enforce or drop the column).
SHOULD: public health endpoint + error tracker/log drain; branded 404/500 + OG metadata; document the pay-and-ask channel on the subscription page; run the restore drill and file its four outputs.
LATER: self-service CIB/SATIM payment; in-app code-request surface; promo/activation analytics; per-query index audit under load; offline/maintenance banner; cookie consent only if analytics is ever added (none exists today).
