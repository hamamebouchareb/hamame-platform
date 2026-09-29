# Hamame — Agent Guidance

> **Before anything else, read `docs/HAMAME_MASTER_HANDOFF.md`.** It is the
> ground-truth record for this project (1,600+ lines of what was built, tested,
> fixed, and deliberately decided). Where any other document — including this
> one — conflicts with it, trust the handoff doc, then correct the stale file.

---

## Project overview

Hamame is an Algerian medical-exam preparation platform: students drill QCM/QCS
question banks scoped to a `faculty → year → module → unit → lesson` curriculum,
track progress and streaks, take spaced-repetition reviews, and sit scheduled
mock simulations. It is a **monorepo with two workspaces** — the repo root is an
Express + TypeScript REST API (CommonJS, ES2022) using Prisma against Supabase
PostgreSQL, and `web/` is a Next.js 16 frontend (React 19, Tailwind CSS v4) on
port 3001. The product is a **from-scratch build inspired by, not copied from**, a
competitor named MedSparkDZ: structural and interaction patterns were studied
live and deliberately re-implemented against Hamame's own schema, palette, and
naming. Parity work is tracked phase-by-phase in
`docs/MEDSPARKDZ_COMPLETE_GAP_ANALYSIS.md` — all 37 originally-identified gaps
are closed; what remains is explicitly gated on product decisions, not backlog.

## Setup & running locally

```bash
npm install                 # repo root — backend deps
npm install --prefix web    # frontend deps
```

Two servers, three terminals (backend, frontend, and one for commands):

| Scope | Command | What |
|---|---|---|
| root | `npm run dev` | API via `tsx watch src/server.ts` on port 3000 |
| root | `npm run build` | `tsc -p tsconfig.json` → `dist/` |
| root | `npm start` | `node dist/server.js` (production entry) |
| root | `npx tsc --noEmit` | Backend typecheck (no `typecheck` script exists) |
| root | `npm run prisma:studio` | DB browser |
| root | `npm run prisma:generate` | Regenerate the Prisma client |
| root | `npm run prisma:validate` / `:format` | Lint / format `schema.prisma` |
| root | `npm run prisma:migrate:deploy` | Apply pending migrations (the sanctioned one) |
| root | `npx tsx prisma/seed.ts` | Idempotent seed (fixed UUIDs, safe to re-run) |
| root | `npx tsx prisma/seed-heavy.ts` | Heavy-volume QA account (wipes + recreates only its own rows) |
| web | `npm run dev --prefix web` | Next.js dev server on port 3001 |
| web | `npm run build --prefix web` | Production build |
| web | `npm run lint --prefix web` | ESLint (flat config, `web/eslint.config.mjs`) |
| web | `npx tsc --noEmit -p web/tsconfig.json` | Frontend typecheck |
| web | `npm run test:e2e --prefix web` | Playwright smoke (`web/e2e/`, `web/playwright.config.ts`) |

There is **no `/api/health` route** — probe `GET /api/plans` (public) to confirm
the API is up.

Five feature-specific verification harnesses are wired as npm scripts and are the
fastest way to re-check those subsystems: `verify:hints` (and `verify:hints:ai`,
which does spend API credits), `verify:push`, `verify:readiness`, `verify:credits`.
There is also `ai:backfill-explanations`. All live in `src/scripts/`.

### Environment variables

Copy `.env.example` → `.env` at the repo root and fill it in. `.env`, `.env.local`,
and `.env.*.local` are gitignored — but `.env.example` is **tracked**, so only ever
put placeholder names in it, never real values. Names only:

- **Required:** `DATABASE_URL`, `JWT_SECRET`
- **Server:** `PORT`, `ALLOWED_ORIGINS` (comma-separated; `CORS_ORIGIN` is a
  legacy fallback — see `src/app.ts`), `FRONTEND_URL`, `NODE_ENV`
- **Optional, all warn-only when unset:** `ANTHROPIC_API_KEY` (AI explanations +
  hints), `RESEND_API_KEY` / `EMAIL_FROM` (email), `VAPID_PUBLIC_KEY` /
  `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` (Web Push),
  `SMS_PROVIDER` / `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM`
  (SMS), `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL`
  (OAuth)
- **Frontend (`web/.env.local`):** `NEXT_PUBLIC_API_URL` (defaults to
  `http://localhost:3000/api`), `NEXT_PUBLIC_VAPID_PUBLIC_KEY`

⚠️ `.env.example` currently documents only the first three optional groups — the
`GOOGLE_*` and `SMS_PROVIDER`/`TWILIO_*` names above are real but **absent from
it**. Add them there rather than inventing new names.

Every optional integration is deliberately **warn-only**: with no key it logs and
degrades (dev fallbacks return tokens in non-production responses) instead of
throwing. `JWT_SECRET` is the opposite and intentionally so — it **throws** when
missing (`src/lib/jwt.ts`). Keep that asymmetry.

## Database & migrations

PostgreSQL on Supabase via Prisma (45 models in `prisma/schema.prisma`).
Snake_case tables mapped with `@@map`/`@map`.

**Only the Session pooler works for Prisma:** `aws-0-eu-west-1.pooler.supabase.com`
on port **5432** (not 6543).

### The pooler-safe migration pattern — the only allowed one

```powershell
# 1. Generate the SQL by diffing the live DB against schema.prisma
npx prisma migrate diff --from-url $env:DATABASE_URL `
  --to-schema-datamodel ./prisma/schema.prisma --script

# 2. Hand-copy ONLY the statements for your change into
#    prisma/migrations/<timestamp>_<name>/migration.sql   (see warning below)

# 3. Apply, then confirm
npx prisma migrate deploy
npx prisma migrate status
```

⚠️ **Do not redirect that diff straight into a migration file.** The live DB has
pre-existing drift, so the diff also emits unrelated statements — `resources`
foreign keys and indexes, `lesson_attachments.file_url` — which would silently
rewrite tables you never touched. Every migration written this way so far
(`…_add_question_sitting_columns`, `…_add_note_tags_favorite`,
`…_add_simulations`) extracted only its own statements verbatim and recorded the
exclusion in a comment. Do the same.

**Never run `prisma migrate dev`.** The session pooler has **no shadow database**,
which `migrate dev` requires. Note that `npm run prisma:migrate:dev` *exists* in
`package.json` — it is a leftover and must not be used. `prisma migrate status`
does work (an older doc claimed otherwise; that note is stale).

After `prisma generate` or `migrate deploy`, **manually restart the API** — `tsx
watch` reloads on save but not on generated-client changes.

### Test accounts

Real accounts exist for `hamamebouchareb@gmail.com`, `heavy@hamame.dz`,
`norole@hamame.dz`, and `student2@hamame.dz`. **Passwords are not recorded in this
repo.** They were **rotated 2026-09-12** because earlier values leaked into public
GitHub history, and the new ones were issued out-of-band to the owner — see
`docs/HAMAME_MASTER_HANDOFF.md` §7 for the account/role matrix and the rotation
notice. Do not paste credentials into this file, a commit message, or a test
script.

Two traps worth knowing: `norole@hamame.dz` is **no longer role-less** (it has
`student_free`), so it is an imperfect "no permissions" probe; and
`seed-heavy.ts` still stamps the burned `testpass123` on recreate, so only run it
against a throwaway DB or rotate afterward.

## Verification discipline — the most important section

This project has a strict, repeatedly-enforced evidence standard. **Two earlier
acceptance reports for the same feature were rejected** for describing source code
and using conditional claims ("would return 0", "renders as X") instead of
producing real output. Treat any "complete" claim without raw evidence as
unverified — including your own.

**A task is not complete until raw command + raw output exists on disk, no matter
what any summary claims.**

The actual pattern, as practiced throughout `docs/verification/`:

1. **Raw evidence only.** Real terminal output, full HTTP request/response bodies,
   real SQL rows, real DOM strings with matching hrefs/classes. Never a prose
   summary standing in for output. **Mocked DOM is not evidence** — a pass once
   captured empty-states against `fetch` mocks and the live DOM turned out to be
   structurally different, which would have been false confidence.
2. **Snapshot before mutating.** If a test touches a *real* row, capture the full
   row first, then restore and diff byte-for-byte against the snapshot. Do not
   reconstruct soundness afterward. (This rule was added after a task reverted
   real rows and could only audit the revert post-hoc.)
3. **Tag fixture data implausibly** so any cleanup failure is loud instead of
   silently corrupting real data. Established conventions: `examYear: 1900`
   (no real sitting could be 1900) and a `VERIFY-` prefix on labels such as
   `sittingLabel: 'VERIFY-SITTING'`.
4. **Clean up, then prove it with a fresh query.** Explicit before/after counts,
   re-queried after deletion — "cleanup done" is not acceptable. Where possible,
   re-probe from the test account's own API call, not just a DB query. Prefer
   removing disposable *accounts* through the platform's own
   `DELETE /api/users/me` rather than SQL.
5. **Persist the log.** Raw evidence lives in `docs/verification/` (gitignored
   `*.log` is explicitly re-included for this folder — see `.gitignore`), not
   just in chat. Tokens/JWTs are redacted before anything lands there.
6. **Disclose bugs and gaps you hit**, including ones in your own test harness.
   Several logs record harness bugs that produced false negatives; that honesty
   is the standard, not a flaw.
7. **Re-verify claims you inherit.** The handoff doc itself was found stale in six
   places. Check against live code, DB, or a real API call.

## Known environment gotchas

These are all real and observed on this machine — not hypothetical.

- **The shell/filesystem hangs.** Commands silently hang with no output, sometimes
  for an entire session (the 2026-09-28 deployment work ran every command through
  the owner because the agent shell was hung). Even trivial commands can stall.
  **The fix is restarting the terminal or the agent session, not debugging inside
  the hung one.** Retry before investigating.
- **Filesystem corruption episodes.** Next.js prints "Slow filesystem detected."
  Once, `web/src/app/profile/page.tsx` was found **zero-filled with 14 KB of
  NULs**; five committed docs files vanished from disk and were restored with
  `git checkout -- docs/`. If a file reads as binary garbage, run `git status`
  before assuming the code is broken.
- **CORS is an exact origin-string match.** Browser tests must hit
  `http://localhost:3001` — **not** `http://127.0.0.1:3001`, which is a different
  origin string and gets preflight-blocked. Default allowlist is
  `http://localhost:3001` (`src/app.ts`).
- **Supabase pooler limits.** More than ~10 simultaneous Prisma queries throws
  intermittent `P1001` — prefer sequential `await` over large `Promise.all` on
  multi-query endpoints. The free tier also drops idle connections with `P1017`
  mid-session. **A single P1001/P1017 on a clean code path is noise — retry before
  investigating.** Don't open excessive concurrent connections in scripts.
- **Orphaned `node.exe` holding port 3000** → `EADDRINUSE` or unexplained
  `INTERNAL_ERROR` on every request. Check `netstat -ano | findstr :3000` first.
  The inverse also happens: a backgrounded dev server **dies silently** between
  sessions. Confirm both servers are actually up before debugging endpoints.
- **The Windows console lies about encoding.** The shell runs under codepage 850,
  so valid UTF-8 (accents, em-dashes) renders as `??` / `Ǹ` in `git diff`, `curl`,
  and script output. This was investigated at byte level and closed as **NOT a
  bug** (handoff §12.2): files, Postgres (`server_encoding=UTF8`), and API JSON
  (`charset=utf-8`) are all correct. **Never judge encoding from rendered console
  text — compare hex/codepoints.**
- **PowerShell `curl` is `Invoke-WebRequest`,** and `curl -d` mangles inline JSON
  (a body containing a space gets split mid-JSON). Write the JSON to a file and
  send it with `curl.exe --data-binary "@file.json"`.
- **PowerShell has no `&&`.** Chain with `;`. Variables don't carry across
  terminals, and `$VAR` syntax is PowerShell-only — shell confusion (PowerShell vs
  cmd) is a recurring failure mode here.
- **Inline `node -e` loses double quotes** (the shell layer strips `"` even inside
  single quotes). Use single quotes only, or write a gitignored `tmp-*.ts` /
  `tmp-*.mjs` script file and run that.
- **`next dev` may serve SSR HTML but never hydrate** on this machine (React
  fibers absent, clicks inert, no page errors; the HMR websocket fails with
  `ERR_INVALID_HTTP_RESPONSE`). It's a dev-server transport issue, not app code —
  **re-verify under `next start` before blaming the code.** Turbopack's dev cache
  can also corrupt and panic, serving spurious 404s; clear `web/.next` and
  restart.
- **Never commit raw phone-camera dumps.** `docs/screenshotes/` (~101 MB) is
  gitignored on purpose. Transcribe findings into `docs/*.md` and leave the
  binaries untracked on disk.

## Code conventions

### Backend architecture

- **Entry:** `src/server.ts` → `src/app.ts` (`createApp`) → `src/routes/index.ts`
- **Error shape, every endpoint:** `{ error: { code, message } }`
- **Auth:** Bearer JWT via `src/middleware/auth.ts` (`requireAuth`,
  `optionalAuth`); token TTL 7d
- **Roles:** `requireRole(...names)` — must run **after** `requireAuth`; it is the
  real security boundary for authoring/review/moderation/admin
- **Validation:** Zod via `src/middleware/validate.ts` (`validateBody`,
  `validateQuery`, `validateParams`); UUID params via `uuidParam("name")` from
  `src/lib/common-schemas.ts`
- **Pagination:** `?page=&limit=` (defaults 1 / 20, max 100)
- **Rate limiting:** `src/middleware/rateLimit.ts` — in-memory sliding window,
  zero deps. Client IP is the **last** `X-Forwarded-For` entry (spoof-resistant
  behind one proxy hop). Per-process `Map`, correct for single-instance only.
- **Zero-new-dependency precedent:** `email.ts` (Resend), `sms.ts` (Twilio),
  `oauth-google.ts`, and `rateLimit.ts` are all plain `fetch`/stdlib. Follow it —
  don't add an SDK for one HTTP call.

### Rules

- **Migrations:** pooler-safe `migrate diff` + `migrate deploy` only (see above).
- **Never hardcode secrets, passwords, or tokens in source.** Env vars only, and
  fail loud (throw/exit) when a required one is missing — never a silent insecure
  default. `src/lib/jwt.ts` is the reference implementation.
- **Git commits: stage specific paths** with `git add <path>`, never `git add -A`,
  so commits stay attributable and reviewable. This is not theoretical — a
  `git add -A` here would have committed a 101 MB phone-camera dump, and the tree
  has repeatedly held unrelated in-flight work. Commit at session start and after
  each completed task. If `git status` shows changes you didn't make, **stop and
  report** rather than sweeping them into your commit.
- **Scratch and one-off verification scripts live in `src/scripts/`,** which is
  excluded from the TypeScript build (`tsconfig.json` `exclude`) precisely so a
  broken throwaway script can never fail the Railway build — this already happened
  once. New ones are gitignored via `src/scripts/verify-*.ts`; note that **4 older
  `verify-*.ts` files are already tracked** and gitignore cannot untrack them.
  Ephemeral harnesses belong in gitignored `tmp-*.ts` files at the root.
- **UI copy is FR/EN** via `web/src/lib/i18n.ts` — hand-maintained `fr`/`en`
  tables where `en` is typed `Record<I18nKey, string>`, so a missing translation
  **fails `tsc`**. Never hard-code user-facing French or English in a component:
  add both languages and use `t()` from `useLanguage()`. Plurals are
  caller-selected key pairs (FR and EN inflect differently); `{var}` interpolation
  only. Deliberately untranslated: player report `reason` text (stored verbatim
  for the moderation queue), wilaya/faculty/year labels, currency, brand, and all
  backend email/SMS/question/lesson content.
- **`web/src/lib/nav.ts` is the single source of truth for navigation**
  (`PRIMARY_NAV` = 5 tabs, `SECONDARY_NAV` = avatar menu), storing dictionary keys
  resolved by `AppHeader`. **Do not reintroduce per-route `HEADER_NAV` arrays** —
  ~15 hand-rolled copies silently drifted per route, and that was the exact bug
  fixed in handoff §2C.
- **Design tokens live only in `web/src/styles/tokens.css`.** Don't start a
  competing token system or hard-code hexes.

## Frontend notes

- **This is NOT the Next.js you know.** Next.js 16 has breaking changes — APIs,
  conventions, and file structure may all differ from your training data. **Read
  the relevant guide in `web/node_modules/next/dist/docs/` before writing
  frontend code.** Heed deprecation notices.
- Auth token persists in **localStorage** under `hamame_auth` (a deliberate MVP
  choice over httpOnly cookies — the backend only reads the `Authorization`
  header, so this can be revisited frontend-only).
- `web/src/lib/api.ts` reads the token from localStorage automatically and takes a
  raw `RequestInit` — **`JSON.stringify` your body yourself** (passing an object
  once sent `[object Object]`).
- `web/src/context/AuthContext.tsx` hydrates from localStorage on mount; use the
  `useRequireAuth()` hook for protected pages.
- Frontend type-safety rests on `npx tsc --noEmit -p web/tsconfig.json` plus
  `next build`; both should be exit 0 before you call frontend work done.

## Data model & business rules

- **User deletion is a SOFT delete** — `status` flips to `'deleted'`, PII is
  scrubbed, email becomes `deleted-<uuid>@hamame.invalid`, but the row and all FKs
  stay intact. Policy: `docs/hamame-user-deletion-policy.md`.
- **BR-2 validation gate:** only `status='approved'` questions are visible to
  students, enforced in `buildQuestionWhere` (`src/lib/question-filters.ts`).
- **Lessons with `currentVersionId = null` return 404** (no published version).
- **Faculty visibility:** only `beta`/`live` `rolloutStatus` values are visible;
  `planned` and anything else are hidden.
- **Per-university scoping (FR-10a) is LAYERED, not siloed.**
  `Lesson.universityId` / `Question.universityId` `null` = global (visible to
  all); a value = that university only, ANDed with the faculty gate. Use the
  shared `universityScopeFilter` / `resolveViewerUniversityId` from
  `src/lib/university-scope.ts` — never hand-roll it, and **never wrap it in
  `if (universityId)`**: it must apply unconditionally, since guests and students
  with no university must resolve to global-only, not to "no filter". **Never
  express it as `{ in: [null, id] }`** — SQL `IN` uses `= NULL` semantics and
  matches nothing.
- **`aiEnhancedExplanation: null` is a Prisma validation error** on Json fields.
  Filter nullable JsonB with `{ equals: Prisma.DbNull }`.
- **QROC / clinical-case answers are NOT auto-graded** (`isCorrect` stays null);
  automated grading is a V2 AI feature.
- **Score computation** excludes non-auto-gradable types from both numerator and
  denominator. Unanswered gradable questions count as wrong. Correctness always
  means the **newest attempt per `session_question`** — every accuracy surface
  (`/qcm-stats`, `/readiness`, `/by-module`) shares this dedup rule so they can
  never disagree.
- **Practice vs exam mode is enforced server-side.** Practice reveals `isCorrect`,
  `correctOptionIds`, and explanations immediately; exam mode withholds them from
  the API response until results are requested — not merely hidden by the client.
  MedSparkDZ enforces this client-side only and is exploitable by reload;
  **never "simplify" Hamame's exam mode toward that pattern.**
- **Streak updates happen inside the session-submit transaction.**
- **Review-queue / flashcard / user-badge awards use `INSERT … ON CONFLICT DO
  NOTHING`** (not catch-P2002), so a unique conflict inside a transaction cannot
  abort session submit.
- **Simulation status is derived, never stored** — computed from `cancelledAt` plus
  the `[start, end]` window at read time. No cron job exists because no transition
  needs one.
- `EXAM_SECONDS_PER_QUESTION = 90` is Hamame's documented convention for exam
  time presets (independently measured against MedSparkDZ at 90.7s/question).

### Route surface

All route groups have real handlers; **no known 501 stubs remain.**
`PUT /api/users/me/preferences` is real persistence (`User.uiLanguage`/`theme` +
`NotificationPreference` upserts) and is distinct from `PUT /api/push/preferences`
— older sections of the handoff doc still call it a stub, which is stale (§12.3).

`/api/auth/*` (incl. `change-password`, `resend-verification`, Google OAuth) ·
`/api/users/me` (GET/PUT/DELETE/export; nullable fields accept explicit `null` to
clear) · curriculum (`/faculties`, `/years`, `/modules`, `/units`, `/lessons`) ·
`/api/questions` (+ `/counts`, `/:id/answer-stats`, `/:id/report`) ·
`/api/sessions/*` · `/api/notes`, `/api/flashcards`, `/api/progress` (incl.
`/readiness`, `/qcm-stats`, `/by-module`), `/api/streaks` · `/api/reviews/*` ·
`/api/plans`, `/api/subscriptions`, `/api/promo-codes`, `/api/activation-codes` ·
`/api/resources` · `/api/simulations` · `/api/notifications`, `/api/push/*` ·
`/api/authoring`, `/api/review`, `/api/moderation`, `/api/admin` ·
`/api/instructor-applications` · `/api/leaderboard`, `/api/badges`,
`/api/friends`. Full contract: `docs/hamame_api_contract.md`.

Two known small gaps (real, not urgent): there is no `GET` list of an author's own
drafts (only aggregate `/authoring/me/stats`), and there is no `submittedAt`
column, so the review queue sorts by `createdAt`.

## Deployment

Live today, all connected to Supabase:

- **Frontend — Vercel:** `https://hamame-platform-wcpk.vercel.app`
  (project root directory is `web`)
- **Backend API — Railway:** `https://hamame-platform-production.up.railway.app`
  (API base `…/api`)

CORS between them is env-driven: Railway sets `ALLOWED_ORIGINS` to a
comma-separated list including both `http://localhost:3001` and the Vercel URL.
Vercel sets `NEXT_PUBLIC_API_URL` to the Railway `/api` base.

**Do not remove `engines: { node: ">=20.9.0" }` from `web/package.json`** — a
Vercel deploy once failed with `npm run build exited with 2` on code that built
green locally, and the missing Node pin was the root cause.

Full deployment record, current URLs, and the email/SMS go-live checklists:
`docs/HAMAME_MASTER_HANDOFF.md` §11 (plus §13 for SMS and §16 for OAuth).

## What NOT to do

- **Don't rebuild MedSparkDZ's visual design.** Hamame deliberately uses its own
  **Blue → Violet** palette (`#2563EB → #5B54E8 → #7C3AED`) and a **solid full-pill
  CTA** shape — not MedSpark's orange/pink/purple gradients, whose CTAs fail WCAG
  AA contrast where Hamame's pass (5.17–5.70:1). This was an approved checkpoint
  decision (handoff §9.0 Phase 8) that explicitly *reversed* the earlier
  volt-lime/navy direction, so §2C's palette note is stale. Copy structure and
  interaction feel; never the hues.
- **Don't assume something is missing because it looks different from MedSparkDZ.**
  Check `docs/MEDSPARKDZ_COMPLETE_GAP_ANALYSIS.md` and the handoff doc first — most
  apparent gaps turn out to be deliberate decisions or already-built features in a
  different shape. Worked examples: `/couverture` counts **bank coverage**, not
  MedSpark's exam-appearance "Hypertombables" (different metric, honestly labeled);
  friends search is email-or-name-prefix because Hamame has no `username` column;
  cross-module multi-select is **closed permanently**, not pending. MedSparkDZ also
  drifts — several prior findings went stale, so re-check live before building.
- **Don't touch decision-gated work without the owner's sign-off.** Check the
  handoff doc's gate sections first. Google OAuth is **code-complete but its live
  round-trip is unproven** (§16, blocked on console credentials); EN/FR was gated
  and has since been signed off and built (§14); scheduled simulations were gated
  and built (§15); a real scheduled-simulations *product* expansion, per-mode
  scoring, and automated self-service payment (CIB/SATIM) remain **deliberate
  deferrals, not oversights**.
- **Don't build AI features against a live model without the key decision.**
  `ANTHROPIC_API_KEY` is intentionally absent; both AI features are code-complete
  and degrade cleanly. Add the key only when explicitly judging AI output quality.
- **Don't add dependencies reflexively.** Email, SMS, OAuth, and rate limiting are
  all plain `fetch`/stdlib on purpose.
- **Don't trust a "done/verified" claim** — including one in this file — without
  the raw log behind it. See the verification section.
