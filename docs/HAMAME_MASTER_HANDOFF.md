# Hamame — Master Handoff (Full History → End of This Session)

**Read this entire document before doing anything else in a new chat.** This
consolidates: the original project handoff (`HAMAME_HANDOFF.md`, prior sessions), the
API contract, database schema notes, deletion policy doc, and everything built,
tested, and fixed across sessions — including full V1 backlog closure, 5 V2 features,
a PRD update, promo code completion, a new Top Contributors leaderboard, daily study
goals, and flashcards as a distinct content type (closing out all four
MBset-gap-analysis "quick wins"), plus — **this session** — the `GET /api/progress/me`
P1001 fix, automatic badge-award triggers, a cosmetic cleanup pass, AI-enhanced
MCQ explanation infrastructure (code complete, execution deliberately deferred —
see Section 4.12), per-university content scoping (Section 4.13), and Contextual
Hints (Section 4.14 — the first feature pulled directly from the PRD after the
original backlog closed, also code-complete with live-model verification
deliberately deferred alongside 4.12). This closes out the entire original backlog
from Section 9 except the two items always meant to stay deferred by design, plus
makes real progress on the PRD's Version 2 roadmap. Where this document conflicts
with an older doc, **trust this one** — it's the most current ground truth, verified
against the live database, not against any AI tool's self-reported summary.

---

## 0. Critical environment facts — read this first

- **Working directory is `C:\dev\hamame1`** (backend) and `C:\dev\hamame1\web`
  (frontend). The project was moved here from `C:\Users\imad\Desktop\hamame1` mid-session.
  **The Desktop copy is stale and abandoned — never use it again, for anything.**
- **Add `C:\dev\hamame1` to Windows Defender exclusions** if not already done
  (Virus & threat protection → Manage settings → Exclusions → Add folder). This fixed
  major dev-server slowness/crashes this session (filesystem benchmark went from
  7000ms+ down to ~240ms).
- **Tooling this session: OpenCode** (free models — Big Pickle, GPT-5.6 Luna), not
  Cursor Pro, because the Cursor Pro subscription lapsed temporarily.
  **Cursor Pro is expected back within about a week of this session ending.** When it
  returns, keep working in `C:\dev\hamame1` — don't go back to the Desktop copy.
- **Launch OpenCode from `C:\dev\hamame1`**, not from Desktop, or it'll silently
  operate on the wrong project root. Check the bottom-left of OpenCode's screen — it
  shows the current project path (`~\Desktop\hamame1` = wrong, close and relaunch from
  the right folder).
- **OpenCode's model picker can silently revert to the free/default model
  (`Big Pickle`) between messages**, even after explicitly selecting an
  AgentRouter-routed model earlier in the same session. Confirmed happening at
  least twice this session — the active model shown in the response header must
  be checked before every message that matters, not assumed to persist from an
  earlier selection.
- **AgentRouter (agentrouter.org)** is a third-party, non-official API gateway
  used this session as an alternative to OpenCode's bundled free models, giving
  paid-tier access to Claude Opus 5 and other models via a wallet balance. It
  does not accept card top-ups directly — only redemption codes. Not an
  Anthropic or OpenAI product; fine for this project's non-sensitive test data,
  worth reconsidering once real user data is involved.
- **Recurring problem across sessions: orphaned `node.exe` processes holding port
  3000.** Closing a terminal window without first pressing `Ctrl+C` and waiting for the
  process to actually exit leaves a zombie Node process running invisibly, causing
  `EADDRINUSE` on the next `npm run dev` — or, more confusingly, causing **every
  request to return a generic `{"error":{"code":"INTERNAL_ERROR"}}`** if a stale
  process is still half-listening. If login or any endpoint returns an unexplained
  500/`INTERNAL_ERROR`, check this **before** debugging anything else:
  ```
  netstat -ano | findstr :3000
  taskkill /PID <that number> /F
  npm run dev
  ```
  **Prevention going forward:** always `Ctrl+C` and wait for full exit before closing
  any terminal running `npm run dev`. Separately, **OpenCode starting the dev server
  as a hidden background process** (`Start-Process ... -WindowStyle Hidden`) proved
  unreliable this session — the process could die silently without the visible
  terminal showing why, producing confusing "connection refused" errors later.
  Prefer running `npm run dev` yourself in a visible terminal you control.
- **Shell confusion is a recurring failure mode.** `$VAR = "..."` syntax (for tokens
  like `$ADMIN`/`$STUDENT`) only works in **PowerShell**, not `cmd.exe`. Tell them
  apart by the prompt: `PS C:\dev\hamame1>` = PowerShell (correct), plain
  `C:\dev\hamame1>` = cmd.exe (wrong for this workflow). In WezTerm, a new tab may
  default to cmd.exe even if you "know" you're using PowerShell elsewhere — if a `#`
  comment throws `'#' is not recognized as an internal or external command`, or
  `$PSVersionTable` throws the same error, you're in cmd. Fix by typing
  `powershell.exe` inside that same window to drop into a real PowerShell session
  (or set `default_prog` in WezTerm's config to avoid this permanently). Variables set
  in one PowerShell window/tab do **not** carry over to another — they must be
  re-set per session.
- **PowerShell + curl `-d` gotcha:** inline `-d '{"json":"here"}'` gets mangled by
  PowerShell's quoting. Always write the JSON body to a file first
  (`'...' | Out-File -Encoding ascii payload.json`, prefer `ascii` over `utf8` to avoid
  BOM issues that can break JSON parsing) and send it with
  `curl.exe --data-binary "@payload.json"`.
- **`tsx watch` auto-reloads on file save** — you don't need to manually restart the
  backend after every code edit. You **do** need a manual restart after
  `prisma generate` / `prisma migrate deploy`, because the Prisma Client changes and the
  already-running process has the old one in memory.
- **OpenCode "Applied"/"Done"/"verified last turn" claims must be independently
  re-verified, every time, not trusted at face value.** Two confirmed incidents across
  sessions: (1) a diff was shown as needing confirmation, then silently never applied —
  a later file check found the change genuinely missing from disk; (2) a "verified last
  turn" claim about promo codes turned out to be blocked by an unrelated port conflict
  the whole time, only caught by re-running the curl/SQL checks live in the new
  session. **Always re-verify via a fresh file check (`findstr`), a live curl call, or
  a direct Supabase query — never take a self-reported "done" as ground truth,
  regardless of how detailed or confident the report sounds.**
- **Two servers, three terminals minimum:** backend (`C:\dev\hamame1`, port 3000),
  frontend (`C:\dev\hamame1\web`, port 3001), and a third terminal for running commands
  (curl, git, etc.) — never type commands into a terminal that's actively running a
  dev server.

---

## 1. Tech stack & infrastructure

- **Backend:** Node/Express + TypeScript, Prisma ORM
- **Frontend:** Next.js (Turbopack), Tailwind, plain styling (no design system —
  deliberate for now)
- **Database:** Supabase PostgreSQL, project ID `drjlelyuxgqdzsgwqtgv` (`eu-west-1`)
  - **Only the Session pooler works for Prisma**: `aws-0-eu-west-1.pooler.supabase.com`,
    port **5432** (not 6543)
  - `DATABASE_URL` format:
    `postgresql://postgres.drjlelyuxgqdzsgwqtgv:<PASSWORD>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`
  - The free tier can auto-pause; an `ENOTFOUND`/connection error may just mean the
    project needs restoring — check `Supabase:list_projects` / `get_project` status
    first before assuming a config bug. Status was confirmed `ACTIVE_HEALTHY` as of
    this session's end.
  - **Concurrency limit discovered in an earlier session:** more than ~10 simultaneous
    Prisma queries against this pooler can throw `P1001` intermittently. If you see
    that on any multi-query endpoint, switch from `Promise.all([...])` to sequential
    `await` calls (exactly what was done to fix `GET /api/users/me/export`). A single
    `P1001` seen at server boot this session (inside the immediate-run leaderboard
    cron job) was a one-off transient hiccup, not reproducible on manual re-trigger —
    treat isolated boot-time P1001s as noise unless they recur.
- **Migrations:** `prisma migrate diff --from-schema-datamodel <old> --to-schema-datamodel
  <new> --script` (offline, generates the SQL file) + `prisma migrate deploy` (applies
  it). **`prisma migrate dev` does NOT work here** — no shadow database support on this
  pooler. Never use it, ever, even if a tool suggests it.

---

## 2. Full migration history (14 total as of migration `20260101000013_add_university_scoping` — this count was stale at "10" as of last update, caught during Section 4.14's Step 0; all applied and confirmed)

| # | Migration | What it did |
|---|---|---|
| 1 | `20260101000000_init` | Initial schema |
| 2 | `20260101000001_add_cascade_deletes` | 16 `onDelete: Cascade` relations (see Section 8, deletion policy) |
| 3 | `20260101000002_make_email_university_wilaya_nullable` | Nullability fix |
| 4 | `20260101000003_add_review_comment` | `reviewComment` on Question/LessonVersion |
| 5 | `20260101000004_add_progress_unique_constraint` | Was blocked at the start of an earlier session (transient pooler `ENOTFOUND`, not a real bug) — resolved. `@@unique([userId, lessonId])` on Progress, confirmed live as index `progress_user_id_lesson_id_key` |
| 6 | `20260101000005_add_password_reset_fields` | `passwordResetTokenHash`, `passwordResetTokenExpiresAt` on User |
| 7 | `20260101000006_add_verification_fields` | `verificationTokenHash`, `verificationTokenExpiresAt` on User |
| 8 | `20260101000007_add_suspended_until` | `suspendedUntil` on User (time-based moderation unsuspend) |
| 9 | `20260101000008_add_instructor_applications` | New `instructor_applications` table |
| 10 | `20260101000009_add_promo_code_redemptions` | New `promo_code_redemptions` table (PromoCode existed but had no way to enforce `maxUsesPerAccount` without this) |
| 11 | `20260101000011_add_daily_goal_minutes` | `Streak.dailyGoalMinutes`, `INTEGER NOT NULL DEFAULT 20` (Section 4.7) |
| 12 | `20260101000012_add_review_queue_and_flashcard_unique_constraints` | Four unique indexes closing the enqueue-race condition (Section 4.8): `review_queue_items(user_id, lesson_id)`, `review_queue_items(user_id, question_id)`, `review_queue_items(user_id, flashcard_id)`, `flashcards(user_id, source_question_id)` |

**This session added migrations 11 and 12** — daily study goals (Section 4.7) and
the enqueue-race fix (Section 4.8). Both additive-only, no existing columns touched.

---

## 3. V1 backend — status: 100% complete, every gap closed

All of the following were stubs, missing, or broken at the start of the original
session and are now **implemented and individually verified against the live
database** (not just build-passing):

### Auth
- `POST /api/auth/forgot-password` — generates a token, sha256-hashes it for storage,
  1h expiry, logs raw token to console, returns it in the response body **only when
  `NODE_ENV !== 'production'`** (no email/SMS provider exists — deliberate MVP
  workaround, same pattern as manual-assisted payments)
- `POST /api/auth/reset-password` — consumes token (single-use), bcrypt-hashes new
  password
- `POST /api/auth/verify` — same token pattern, 24h expiry, sets `emailVerifiedAt` or
  `phoneVerifiedAt`. `register` now auto-mints this token, returned dev-only.

### Jobs / cron (in `src/jobs/`, scheduled via `node-cron` in `src/server.ts`, daily +
one immediate run at boot)
- `expireSubscriptions.ts` — flips lapsed `active` subscriptions to `expired`
- `unsuspendUsers.ts` — flips lapsed `suspended` users back to `active`
- `generateLeaderboardSnapshots.ts` — see Section 4.2
- `generateContributorsLeaderboardSnapshots.ts` — new this session, see Section 4.6
- Manual triggers for testing: `POST /api/admin/jobs/expire-subscriptions`,
  `/unsuspend-users`, `/generate-leaderboard`, `/generate-contributors-leaderboard`
  (all admin-only)
- **`node-cron@4.6.0`** installed (not v3 — bundles its own types).
  `@types/node-cron@3.0.11` is now redundant/harmless, sitting in `dependencies` not
  `devDependencies` — cosmetic, not urgent.

### Content authoring
- `PUT /api/authoring/:type/:id` — edit a `draft`/`rejected` lesson or question. Resets
  status to `draft`, clears `reviewComment`. Question options/clinicalCaseParts are
  replaced wholesale (delete-then-recreate, confirmed via option IDs changing on edit).
  The pre-existing `POST /:type/:id/submit` (untouched) is what resubmits afterward.
  Closes the "rejected content has no path back to draft" gap.

### Admin — role management
- `POST /api/admin/users/:id/roles` — grant a role, idempotent (200 if already held)
- `DELETE /api/admin/users/:id/roles/:roleName` — revoke, idempotent, **self-lockout
  guarded**: an admin cannot revoke their own `admin`/`super_admin` via this endpoint
  (`400 CANNOT_SELF_REVOKE_ADMIN`) — confirmed tested, this is the single most
  safety-critical check built in the original session

### Instructor applications (`src/routes/instructorApplications.routes.ts`, mounted at
`/api/instructor-applications`)
- `POST /api/instructor-applications` — apply (motivationText min 20 chars), blocks
  duplicate pending applications and blocks existing instructors
- `GET /api/instructor-applications/me` — own history
- `GET /api/admin/instructor-applications?status=` — admin queue, defaults `pending`
- `POST /api/admin/instructor-applications/:id/approve` — **transactionally** grants
  the `instructor` role via a shared `grantRoleByName` helper (reused from the role-grant
  endpoint, not duplicated)
- `POST /api/admin/instructor-applications/:id/reject` — requires `reviewComment`,
  grants nothing (confirmed via DB check)

### Data export
- `GET /api/users/me/export` — full JSON snapshot (profile, sessions+attempts, notes,
  progress, streak, subscriptions+payments, authored content, reports, notification
  prefs), downloadable attachment, **no passwordHash or token hashes** (confirmed via
  grep). **Known bug caught and fixed:** originally used `Promise.all` for 10 parallel
  queries, intermittently threw `P1001` on this pooler — fixed by switching to
  sequential `await` calls. If you see similar intermittent connection errors on any
  other multi-query endpoint, this is the same root cause and same fix.

### CORS
- `app.ts` — origin now read from `CORS_ORIGIN` env var (comma-separated list),
  defaults to `http://localhost:3001` if unset. `.env.example` updated. Everything else
  (methods, headers, no `credentials: true`, mounted before `express.json()`) unchanged.

---

## 4. V2 features — status: all 6 built and live-verified

### 4.1 Spaced repetition (`src/routes/reviews.routes.ts`, mounted `/api/reviews`)
- `GET/PUT /api/reviews/settings` — per-user enable/config, upsert
- `POST /api/reviews/enqueue` — manually queue a lesson/question, idempotent
- `GET /api/reviews/due` — items due now
- `POST /api/reviews/:id/complete` — **SM-2-inspired** grading (quality 0-5):
  - quality < 3: `dueAt` = +1 day, `easeFactor` and `lastReviewedAt` left unchanged
    (deliberate — keeps "first success" logic meaningful, avoids compounding punishment)
  - quality ≥ 3: verbatim SM-2 ease-factor formula (verified exact: quality 5 always
    adds +0.1), interval = 1 day on first success, else `elapsed days × new ease
    factor`, capped at 180 days
  - **Honest limitation, documented in code:** the schema has no repetition-count or
    previous-interval field, so this is SM-2-*inspired*, not byte-exact SM-2. The PRD
    names **FSRS** as the actual target algorithm for a future upgrade — this is a
    deliberate interim implementation, not the final goal.
- **Auto-enqueue hook** (in `src/routes/sessions.routes.ts`, inside the existing
  `finalizeSession` transaction): any gradable (QCM/QCS) question answered wrong
  auto-enqueues for review, **only if the user has `ReviewSettings.isEnabled = true`**.
  Wrapped in try/catch so a queue failure can never block session submission.
  - The shared enqueue logic was factored into an exported helper
    (`enqueueReviewQueueItem`) in `reviews.routes.ts` and imported into
    `sessions.routes.ts`, rather than duplicated.

### 4.2 Score-based leaderboard (`src/jobs/generateLeaderboardSnapshots.ts` + `src/routes/leaderboard.routes.ts`, mounted `/api/leaderboard`)
- Job: for each distinct (facultyId, yearId) pair with users who have completed
  sessions (with a non-null score) in the last 30 days, computes each user's average
  score, ranks descending, **full delete+replace** of that pair's snapshot rows each
  run (scoped by `period: 'monthly'`) — not a merge/history
- `GET /api/leaderboard?facultyId=&yearId=` — returns current ranked snapshot,
  `fullName` only (no email/PII), filters `period: 'monthly'` explicitly
- Live-verified this session with real account data: Hamame (5 completed sessions,
  three scored 50 / two scored 0, avg = 30) vs Test Student Two (1 session, score 50)
  → correctly ranked Test Student Two #1 (score 50) over Hamame #2 (avg 30)

### 4.3 Badges (`src/routes/badges.routes.ts`, mounted `/api/badges`; admin endpoints in `admin.routes.ts`)
- `GET /api/badges` — full catalog + caller's earned status (`earnedAt: null` if not earned)
- `GET /api/badges/me` — caller's earned badges only
- `POST /api/admin/badges` — create catalog entry (name + arbitrary JSON criteria)
- `POST /api/admin/users/:id/badges` — manually award, idempotent (200 if already
  awarded, timestamp not overwritten)
- **Scope deliberately limited to catalog + manual award** — no automatic
  award-on-achievement trigger built yet (see Section 9, item 4)

### 4.4 Friends/social (`src/routes/friends.routes.ts`, mounted `/api/friends`)
- Directional convention (documented in code, not schema-enforced): `userIdA` = sender,
  `userIdB` = recipient, `status: 'pending' | 'accepted'`
- `POST /api/friends` — send request, idempotent in both directions (existing
  pending/accepted row returned as-is, never duplicated)
- `POST /api/friends/:userId/accept` — **structurally prevents self-accept** (query only
  matches `userIdA=:userId, userIdB=me`, so accepting your own outgoing request is
  impossible by construction, not just by a guard clause)
- `DELETE /api/friends/:userId` — bidirectional, idempotent, no existence leak (always
  200)
- `GET /api/friends` — accepted friendships, other party's `id`/`fullName` only
- `GET /api/friends/requests` — incoming pending requests

### 4.5 Promo codes — ✅ complete, fully live-verified this session
(Migration #10, an earlier session, added `PromoCodeRedemption` since `PromoCode`
existed but had no way to enforce `maxUsesPerAccount`. **This session completed the
actual grant/extend logic**, which a prior session had left as record-only.)

- Model (`prisma/schema.prisma:637-661`):
  - `PromoCode`: `id`, `code` (unique), `type` (`'referral' | 'discount'`),
    `value` (Json/JsonB — holds `grantsDays`/`benefitType`, no dedicated columns),
    `maxUsesPerAccount` (Int, default 1), `expiresAt` (nullable). No `maxUses`
    (global) or `isActive` column exists — global use is unlimited by design,
    "active" is inferred purely from `expiresAt` being null or in the future.
  - `PromoCodeRedemption`: `id`, `promoCodeId`, `userId`, `redeemedAt`
- `POST /api/promo-codes/redeem` (`src/routes/promoCodes.routes.ts`) — case-insensitive
  lookup, rejects expired codes, enforces `maxUsesPerAccount`, then in a single
  transaction: creates the redemption row **and** creates/extends the user's Premium
  `Subscription`. Extension is calculated **from the subscription's current
  `currentPeriodEnd`, not from today** — confirmed live this session: a 30-day code
  set `currentPeriodEnd` to 2026-09-06, and a second (stacked) 15-day code correctly
  extended it to 2026-09-21, not 2026-08-22.
- `POST /api/admin/promo-codes` — create (uppercase-normalized, `409` on
  case-insensitive duplicate)
- `GET /api/admin/promo-codes` — list with `redemptionCount` per code (single
  `groupBy`, not `Promise.all`, per the known pooler concurrency limit)
- `PATCH /api/admin/promo-codes/:id` — updates `expiresAt` only; `code` is immutable.
  This is also the mechanism for **manually deactivating a code early** (e.g. a leaked
  code) — set `expiresAt` to a past date, since there's no separate `isActive` flag.
- Live-verified this session, in order: create (201) → redeem case-insensitive (200,
  real `Subscription` object returned with correct `currentPeriodEnd`) → redeem again
  same user (400 `PROMO_CODE_ALREADY_USED`) → admin list shows `redemptionCount: 1` →
  second code stacked correctly (see above) → both test codes neutralized via PATCH
  (`expiresAt` set to a past date, not deleted) — their redemption rows and the
  resulting test subscription were left in place as harmless artifacts, not cleaned up.

### 4.6 Top Contributors leaderboard — ✅ new this session, complete and live-verified
A participation-based alternative to the score-based leaderboard (Section 4.2),
directly addressing a "quick win" flagged in the MBset gap analysis (Section 6).

- **No migration needed.** The existing `LeaderboardSnapshot` model has no
  type/metric discriminator column — instead of adding one, the existing `period`
  string column (already used for delete-scoping and route filtering) was reused:
  the new job writes `period: 'monthly_contributors'` instead of `'monthly'`. Since
  both jobs scope their delete+replace strictly by `period`, they can never
  interfere with each other, and the existing route's explicit `period: 'monthly'`
  filter means default behavior is unaffected with zero code changes to the
  original job or route logic.
- New job: `src/jobs/generateContributorsLeaderboardSnapshots.ts` — same
  (facultyId, yearId) pairing and 30-day window as the score job, but ranks by
  **count of completed sessions**, deliberately **not** gated on `score: not null`
  (QROC/clinical-case sessions can legitimately have a null score, and participation
  shouldn't undercount them — this is a real behavioral difference from the score
  job, not an oversight).
- New admin trigger: `POST /api/admin/jobs/generate-contributors-leaderboard`
- `GET /api/leaderboard` extended with optional `?type=contributors`; default
  (no param) response confirmed byte-identical to pre-feature behavior.
- Live-verified this session with real account data (not synthetic, and not
  self-reported by the AI tool — independently re-run): Hamame (5 completed
  sessions) vs Test Student Two (1 session) → contributors board correctly ranked
  Hamame #1 (count 5) over Test Student Two #2 (count 1) — the **inverse** of the
  score board's ordering for the same two users, confirming the two metrics are
  genuinely independent, not one silently mirroring the other.
- **Side effect from testing, intentional, not a bug:** neither test account had a
  `facultyId`/`yearId` set before this session (confirmed via SQL — zero users in the
  whole database had both fields set AND completed sessions, which is *why* both
  leaderboard jobs had been silently returning `insertedRows: 0` every time they were
  manually triggered up to this point). Both `hamamebouchareb@gmail.com` and
  `Test Student Two` were assigned to Medicine / Year 1
  (`facultyId: b37b039e-2208-4837-b5d5-28b1c338a2cf`,
  `yearId: 00000000-0000-0000-0000-000000000020`) directly via SQL to make live
  verification possible. Left in place as realistic data rather than reverted.

### 4.7 Daily study goals — ✅ new this session, complete and live-verified
Addresses the remaining quick win named in the MBset gap analysis (Section 6):
students set a personal daily minutes-studied target, and the dashboard shows
live progress toward it.

- **Migration `20260101000011_add_daily_goal_minutes`** — added
  `Streak.dailyGoalMinutes` (`INTEGER NOT NULL DEFAULT 20`). Kept `NOT NULL`
  deliberately rather than nullable — nothing downstream needs to distinguish
  "never set a goal" from "using the default," so nullable would only add
  null-handling for no functional gain.
- New `src/lib/daily-goal.ts` — shared computation, not duplicated across
  routes:
  - `startOfUtcDay` — day boundaries are **UTC**, matching the existing
    `Streak`/session logic exactly (deliberate: consistency with already-tested
    streak-increment code matters more than local-time accuracy for a solo
    MVP). **Known limitation, not a bug:** Algeria is UTC+1, so a session
    between 00:00-01:00 local time counts toward the previous UTC day.
  - `getDailyGoalProgress(userId)` — sums today's completed sessions' minutes,
    **clamped per-session to `timeLimitSeconds`** so an idle tab left open for
    hours can't inflate the total. Sessions with `timeLimitSeconds: null`
    (untimed practice mode) fall back to raw duration and remain inflatable.
    **Real, non-trivial gap, not just theoretical:** DB-wide, 38% of all
    sessions (5 of 13 at last check) have no time limit. Left as a known
    limitation — fixing it needs a product decision (what's a fair
    contribution cap for untimed study?), not a quick patch.
  - `NEVER_ACTIVE_DATE` sentinel (1970-01-01) — used when a `Streak` row is
    created by the goal endpoints before the user has ever completed a
    session, so that `lastActiveDate` has to hold *something* (`NOT NULL`, no
    default) without accidentally reading as "already active today" and
    suppressing day one of a real streak later. Confirmed live: setting a goal
    first, then completing a real session, correctly started the streak at 1.
- `GET/PUT /api/streaks/goal` — validated range 5–300 minutes; upsert touches
  only `dailyGoalMinutes`, never disturbs `currentStreakDays`/
  `longestStreakDays`/`lastActiveDate` (and vice versa — the existing
  streak-update code in `sessions.routes.ts` was deliberately left untouched
  and omits `dailyGoalMinutes` from its own update, so the two write paths
  can't clobber each other).
- `GET /api/streaks/today` — new dedicated endpoint returning
  `{ dailyGoalMinutes, minutesStudiedToday, goalMet }`, live-computed on every
  read (no cron job, no stored counter — recomputing is cheap and avoids
  needing a midnight-rollover job).
- `GET /api/progress/me` — extended with the same `dailyGoal` block, added as
  a **sequential `await` after** the endpoint's existing 6-way `Promise.all`,
  which was deliberately left untouched (matches the known pooler-concurrency
  constraint without refactoring already-tested code).
- Live-verified on a real account (not synthetic): `GET /api/streaks/today`
  and `GET /api/progress/me` returned **byte-identical** `dailyGoal` values
  (`dailyGoalMinutes: 20, minutesStudiedToday: 0, goalMet: false`), confirming
  the two endpoints can't disagree about progress.
- **Bug found during this session's live verification, NOT introduced by this
  feature:** the pre-existing `GET /api/progress/me` `Promise.all` (6-way,
  lines 26-65) hit the known P1001 pooler-concurrency issue (Section 1) on the
  very first request after a cold server restart, then succeeded cleanly on
  retry. Same root cause, same fix already applied elsewhere
  (`GET /api/users/me/export`) — this endpoint needs the same
  `Promise.all` → sequential-`await` conversion. Not fixed this session since
  it's pre-existing, unrelated churn outside this task's scope — flagged as
  the next small cleanup item (Section 9).

### 4.8 Flashcards as a distinct content type — ✅ new this session, complete and live-verified
The last of the four MBset-gap-analysis "quick wins" (Sections 4.5, 4.6, 4.7 cover
the other three). The largest of the four — touches the content model, authoring
surface, and the spaced-repetition system all at once.

- **Discovery, not build-from-scratch:** the `Flashcard` model, its migration,
  `flashcards.routes.ts` (CRUD + `POST /from-question`), and
  `review_queue_items.flashcard_id` **already existed**, applied and live —
  confirmed independently via direct schema query, not just OpenCode's claim
  (same "repo is not a clean build" pattern as the promo-code routes earlier
  this session). **This existing work is undocumented anywhere else — a real
  gap in project history-keeping, not a code problem.**
- **Model decision:** kept `Flashcard` as its own model, did **not** fold it into
  `Question` with a new `type: 'FLASHCARD'` — a flashcard has no faculty/unit
  scoping, no options, no grading semantics; genuinely a different shape, not a
  Question variant.
- **New piece built this session — auto-generate from missed questions**
  (`src/lib/flashcard-from-question.ts`, shared by both the manual
  `POST /from-question` route and the new auto-hook, so they can't drift):
  - Extended the existing best-effort auto-enqueue block in
    `sessions.routes.ts` (same block documented in Section 4.1) — on a wrong
    answer, both the existing question-requeue **and** a new flashcard are
    created/enqueued (kept both, additive, zero change to existing behavior).
  - **Deduped per (user, source question)** — repeat wrong answers on the same
    question across sessions don't stack duplicate cards. Live-verified: two
    separate wrong-answer sessions on the same question produced exactly 1
    auto-generated card, not 2.
  - Gated on the existing `ReviewSettings.isEnabled` flag — no new settings
    column, no migration (matches the "reuse before you add" pattern from
    every other feature tonight).
  - **Security fix included in the same pass, not deferred:** `POST
    /api/flashcards/from-question/:id` did not previously verify the source
    question was approved and in a visible (`beta`/`live`) faculty — the same
    bug class as the documented faculty-visibility leak earlier in this
    project's history. Fixed and live-verified: a `pending_review` question
    and a question in a `planned`-rollout faculty (a temporary Dentistry
    fixture, created and cleaned up for the test) both correctly return `404
    QUESTION_NOT_FOUND`; an approved, live-faculty question correctly returns
    `201`.
- Live-verified end-to-end via a real registered test account (cleaned up
  after): visibility gate (3 cases above), auto-creation on wrong answer,
  dedup on a second wrong answer, both a question-type and a flashcard-type
  item appearing in `GET /api/reviews/due` side by side, and (**at the time**;
  see the enqueue-race fix below for a later, deliberate change to this
  specific behavior) the manual from-question card initially remaining
  distinct from the auto-generated one.

**Follow-on fix, same session — the enqueue-race condition (Section 9 item 4,
now closed):**
- **Migration `20260101000012_add_review_queue_and_flashcard_unique_constraints`**
  — four unique indexes, independently confirmed live via direct schema
  query: `review_queue_items(user_id, lesson_id)`,
  `review_queue_items(user_id, question_id)`,
  `review_queue_items(user_id, flashcard_id)`, and
  `flashcards(user_id, source_question_id)`.
- **Root fix:** `enqueueReviewQueueItem` now uses a raw
  `INSERT ... ON CONFLICT DO NOTHING`, not a Prisma `upsert` or a caught
  `P2002`. This was a load-bearing choice, not a style preference: the
  session-submit path calls this inside a Prisma transaction (`tx`), and in
  Postgres a raised unique-violation error poisons that transaction —
  catching the JS-level `P2002` error cannot un-abort it at the database
  level, so a naive constraint-plus-catch approach would have converted a
  harmless duplicate-review-item race into **lost student answers** on
  session submit. `ON CONFLICT DO NOTHING` never raises, so it's safe both
  inside and outside a transaction. Verified directly: a conflict mid-
  transaction followed by further writes on the same transaction still
  commits cleanly, and two concurrent transactions enqueueing the same
  target both commit with exactly one row surviving.
- **A second, related race was found and fixed in the same pass:**
  `createFlashcardFromQuestion` had its own check-then-create dedup (a
  `findFirst` in the session hook) — the same race pattern, one level up.
  Without fixing this too, the *symptom* would have survived a queue-only
  fix: two racing requests could still create two distinct `Flashcard` rows
  for the same source question, each of which would then pass the new
  `review_queue_items` unique index cleanly (since they're genuinely
  different flashcard IDs). Fixed using the same `ON CONFLICT DO NOTHING`
  primitive.
- **Deliberate behavior change, confirmed and approved:**
  `POST /api/flashcards/from-question/:id` is now **idempotent** rather than
  always creating a new card — `201` the first time, `200` with the existing
  card on any repeat call for the same (user, question) pair. This
  supersedes the "manual card stays distinct from the auto-generated one"
  behavior described earlier in this section when it was first built a few
  hours earlier in the same session — with the new unique constraint, a
  manual and an auto-generated card for the same source question are now
  structurally the same row, which is the more sensible product behavior
  (no reason for one user to have two separate flashcards for one missed
  question).
- **A related consequence, handled correctly:** the generic
  `POST /api/flashcards` endpoint also accepts an optional `sourceQuestionId`
  — without a fix, the new unique constraint would have turned a second
  card tagged to the same question into an unexplained `500 INTERNAL_ERROR`.
  This path now returns `409 FLASHCARD_ALREADY_EXISTS` instead — deliberately
  an error rather than silently idempotent, because this caller supplies its
  own `front`/`back` text, and silently returning a pre-existing card with
  different content would be misleading. Free-form cards with no
  `sourceQuestionId` remain unlimited, confirmed unaffected.
- **Verification depth:** three rounds, fifty checks total — 22 at the helper
  level (6-way concurrency across all three target types, sequential dedup
  regression, scheduling-state preservation on re-enqueue, the single-target
  guard, per-user rather than global scoping), 9 on transaction safety
  specifically, and 19 over live HTTP against the running server. One result
  worth noting rather than glossing over: the first HTTP concurrency run
  showed two `500`s at 6-way concurrency on `POST /api/reviews/enqueue` —
  investigated rather than dismissed, and confirmed via server logs to be
  the **known P1001 pooler-ceiling issue** (Section 1) on a *pre-existing*
  FK-guard query unrelated to the new code (that endpoint issues 3 queries
  per request; 6 concurrent requests × 3 queries exceeds the pooler's ~10
  ceiling). Re-ran at 3-way concurrency: clean. The dedup logic itself held
  correctly even while the endpoint was erroring for an unrelated reason —
  the database never showed more than one row.
- All test data cleaned up; database confirmed back at its 5-queue-item /
  4-flashcard baseline after verification.

### 4.9 `GET /api/progress/me` Promise.all → sequential fix — ✅ this session, closed
Closed the item flagged at the end of Section 4.7 and tracked in Section 9.

- `getMyProgress` (`src/routes/progress.routes.ts:27-66`) fired a 6-way
  `Promise.all` with one nested 2-way `Promise.all` inside it — 7 concurrent
  queries total (`streak.findUnique`, `studySession.count`,
  `studySession.aggregate`, two nested `attempt.count` calls,
  `studySession.findMany`, `progress.findMany`).
- Converted to 7 sequential `await`s, following the exact precedent already
  set in `GET /api/users/me/export` (`src/routes/users.routes.ts:107-180`) —
  same comment style, same reasoning cross-referenced in a comment.
- Confirmed first: none of the 7 queries used `prisma.$transaction`/a `tx`
  client, all were independent read-only lookups scoped to `userId` — no
  cross-query dependency, nothing to flag before changing.
- `getModuleProgress`'s separate, smaller `Promise.all` was deliberately left
  untouched — outside the reported bug, outside scope.
- Verified: clean build, 3 live calls in a row returned byte-identical,
  correctly-shaped `200` JSON with zero errors in the server log.

### 4.10 Automatic badge-award triggers — ✅ this session, complete and live-verified
Closed Section 9's "currently manual-only by design" item. Investigated for a
race condition first, per the same discipline used on the enqueue-race fix —
found a materially different, lower-risk situation and proceeded accordingly.

- **Schema:** `Badge` (`criteria: Json`, no fixed shape — no badges were
  seeded anywhere, no taxonomy existed to follow) and `UserBadge` with
  `@@id([userId, badgeId])` as its composite primary key.
- **Criteria taxonomy defined** (zod-validated, minimal, covers exactly what
  was asked for): `streak` (days), `session_count` (count), `accuracy`
  (threshold %, with an optional `minAttempts` gate so one lucky answer can't
  earn 100%). A badge with unrecognized/malformed criteria is silently
  skipped, never thrown — verified live with a deliberately malformed test
  badge that never got awarded across three trigger attempts.
- **Trigger point:** `finalizeSession` (`sessions.routes.ts`) — the only
  site where score and streak (via `updateStreakForUser`) are both already
  computed inside the same transaction. A second candidate (the `Progress`
  upsert in `GET /api/lessons/:id`, for a future "modules completed" badge)
  was deliberately left unwired and flagged in code as a non-goal, not
  silently dropped.
- **The race-condition question, resolved with more precision than a flat
  yes/no:**
  - *Duplicate-row risk:* none. `UserBadge`'s composite primary key has
    existed since the original schema — two concurrent session submits can
    never produce two persisted rows for the same (user, badge). No
    migration needed; this is the "constraint already exists, proceed" case.
  - *Transaction-abort risk:* yes, if implemented naively — same failure
    mode as the enqueue bug, on a table that already has the right
    constraint. A plain `findUnique`-then-`create()` racing inside
    `finalizeSession`'s transaction would raise a real unique-violation on
    the second writer, aborting the whole transaction (losing the score and
    streak update that transaction was also writing). Avoided the same way:
    `awardBadgeIdempotent` uses a raw `INSERT ... ON CONFLICT (user_id,
    badge_id) DO NOTHING`, never a caught `P2002`.
- The manual admin badge-award route (`POST /api/admin/users/:id/badges`)
  was refactored onto the same `awardBadgeIdempotent` primitive, so the
  manual and automatic paths can't disagree about 200-vs-201 semantics for
  the same race.
- Verified: clean build, one live flow (login → 3 real sessions against 2
  real approved questions) drove all three criteria types to completion —
  24 assertions covering correct-threshold awarding, the malformed-badge
  no-award case, and no duplicate `UserBadge` row / unchanged `earnedAt` on
  three separate re-triggers after a badge was already earned, for all three
  types plus the manual-award path.

### 4.11 Cosmetic cleanup pass — ✅ this session, complete
Comment/dead-code-only pass, zero logic changes. Run on **Grok 4.5** (Cursor
Pro's included model, not Sonnet/Opus quota) as a deliberate first test of
that model for low-stakes work — result: reliable, good judgment on what to
leave alone, worth trusting for this tier going forward.

Stale comments/docs corrected in: `reviews.routes.ts` (file header wrongly
claimed enqueue was manual-only), `sessions.routes.ts` (stale "deferred half
of the engine" wording), `progress.routes.ts`, `streaks.routes.ts`,
`subscriptions.routes.ts` (each had a header claiming a now-built feature was
unscaffolded), `routes/index.ts` (stale V1-scope mount comment),
`middleware/auth.ts` and `lib/jwt.ts` (claimed register/login were still
stubs), `lib/stub.ts` (implied the whole API was scaffold-only),
`auth.routes.ts` (shared error helper said "reset token" even for
verify-token failures), `package.json` (`@types/node-cron` moved to
`devDependencies`), `AGENTS.md` (route-status table still listed several
real, live routes as `501` stubs — refreshed, plus migration/pooler
guidance). Nothing removed that couldn't be confirmed dead; build clean,
fresh boot on a spare port with zero new errors.

### 4.12 AI-enhanced MCQ explanations — 🟡 code complete, execution deliberately deferred
Closes the design side of Section 9's "AI provider decision" — the single
biggest gap named in `MBSET_GAP_ANALYSIS.md`. **Decision made:** Anthropic
API, Claude Haiku 4.5. Estimated one-time cost to backfill the entire
2000+-question bank: **roughly $3–6** (well under $12 even on Sonnet 5,
lower with Batch API pricing) — this is a one-time cost per question, not a
recurring per-user cost, since output is generated once and cached
permanently. Designed and built on **Opus 5 High** (novel integration, real
budget/architecture tradeoffs).

- `src/lib/ai/anthropic.ts` — lazily-initialized SDK client; a process with
  no key configured doesn't crash or misbehave.
- `src/lib/ai/mcq-explanation.ts` — the single shared generator used by both
  the backfill script and the approval hook, so the prompt and validation
  logic can't drift between them. **Ground-truth safety property:** the
  database's `isCorrect` is authoritative; the model returns its own verdict
  per option only to be checked for agreement against the DB value, then
  discarded — a `VERDICT_MISMATCH` throws rather than trusting the model's
  judgment over the validated answer key. This is the property to check
  first if an explanation ever looks wrong.
- `storeMcqExplanation` writes conditionally on `aiEnhancedExplanation`
  still being `null` (`updateMany` with a `DbNull` guard in the `where`
  clause) — same "only-if-missing" idempotency pattern as the enqueue and
  badge fixes, so a backfill run and the approval hook can never
  double-write or double-spend on the same question.
- `src/scripts/backfill-mcq-explanations.ts` — manual-only, run via
  `npm run ai:backfill-explanations`, imported by nothing, never runs
  automatically. Deliberately placed under `src/scripts/` (not a top-level
  `scripts/`) so `npm run build`'s TypeScript check actually covers it.
  Resumable/idempotent by design (re-running skips already-completed
  questions), logs per-question progress and failures without aborting the
  whole run on one bad question.
- The approval hook (in `review.routes.ts`, ~1 line plus a local helper)
  fires only on approval, not submission, and is best-effort/non-blocking —
  matches the same pattern as the badge-award and review-enqueue hooks;
  approval must never fail or stall because an AI call failed.
- **Design choice, confirmed:** sequential-only for now, not the Batch API —
  batch behavior genuinely can't be validated at a 3-question test scale;
  add a `--batch` flag once the real 2000+-question import runs. Also
  confirmed: generation does **not** write to `ai_interactions` /
  `ai_credit_balances` — those are per-user BR-6 credit tables for a
  different future feature; provenance for this backfill goes in the
  explanation JSON itself, at zero migration cost.
- **Verified so far, at zero API cost:** with no key configured, the script
  exits cleanly with a clear message and does no work. With a deliberately
  invalid key (401s aren't billed), the full plumbing — 3-way concurrency,
  per-question independent failure handling, progress tally, resume
  guidance — was confirmed end-to-end against the 3 real approved
  QCM/QCS questions currently in the database.
- **Blocked only on:** a real `ANTHROPIC_API_KEY` in `.env` (file exists,
  confirmed gitignored). **Deliberately deferred to later in the project** —
  no urgency, nothing else depends on it, cost doesn't change over time. Do
  **not** add a real billing-enabled key to `.env` while this stays
  deferred. Next step when picked back up: run `--dry-run` (writes nothing
  to the DB) and read the 3 generated explanations for actual medical
  accuracy before running it for real or at scale.

### 4.13 Per-university content scoping — ✅ this session, complete and live-verified
Closes the item explicitly flagged as out-of-scope-unless-demanded in
Section 9/6. Designed and implemented on **Opus 5 High** — a real migration
touching the same security-sensitive visibility-filtering code as the
faculty-gating fixes in Section 5, so given the same level of care.

- **Model chosen, deliberately not strict silos:** a **layered** model.
  All existing content stays global/shared, visible to every student
  regardless of university. Going forward, an optional `university_id` on
  content-bearing tables: `null` = global (visible to everyone in the right
  faculty), a real value = scoped to that university only. University
  scoping **composes with** existing faculty gating via AND logic — a
  student sees content matching their faculty that is *either* global *or*
  scoped to their own university. (Strict per-university silos were
  considered and rejected: as a solo developer with one question bank,
  silos would leave the platform empty for any university without
  dedicated content.)
- **Migration `20260101000013_add_university_scoping`** — purely additive:
  one `CREATE TABLE` (University), three nullable `ADD COLUMN`s, FKs and
  indexes. No `UPDATE`, no `NOT NULL`, no defaults — zero existing rows
  rewritten, confirmed.
- **Real exposure path caught before it shipped, by reading the generated
  migration SQL rather than trusting the ORM default:** Prisma's default
  for an optional relation is `ON DELETE SET NULL` — under this layered
  model, `null` means globally visible, so deleting a university would have
  **silently made all its scoped content visible to everyone**. Fixed by
  setting `onDelete: Restrict` on both content foreign keys (deleting a
  university with content now fails outright); `users.university_id`
  correctly keeps `SET NULL`. A passing test asserts this directly.
- **A second gap found and fixed in the same pass:** `GET /api/questions`
  and `GET /api/units/:id/lessons` were fully unauthenticated
  (`req.auth` always undefined), meaning a signed-in student would have
  been silently treated as a guest and denied their own university's
  scoped content. Both routes now use `optionalAuth` and remain public for
  guests.
- **Verification — 48 assertions, live, against 4 real identities** (guest,
  a student with no university, one at a seeded Algiers university, one at
  a seeded Oran university):
  - Zero-regression check: captured a full baseline of what all 4 viewers
    saw *before* any scoped content existed, re-checked after — guest and
    no-university sets came back identical by set comparison (not
    assumption), university students saw baseline + only their own.
  - Cross-university isolation held on both list endpoints and direct-ID
    probes (an Algiers-scoped lesson returns `404` for the Oran student and
    guest, not just excluded from a list).
  - **Combination test:** a question scoped to Algiers, placed under a
    hidden `planned`-rollout Dentistry faculty — the Algiers student, whose
    university matches exactly, still could not see it. Faculty gating
    wins regardless of university scoping, confirmed under the most
    adversarial case tried.
  - Session building respects scope: an Oran student's session only ever
    drew Oran/global questions, never Algiers-scoped ones, and vice versa.
  - First run reported 44/2 — investigated rather than dismissed: the two
    failures were caused by the *test script* reading session question IDs
    from the wrong path (all `null`), which meant the isolation assertions
    were passing trivially. Fixed the extraction, added guard assertions
    so that class of check can't silently pass on empty data again. 48/0
    on the corrected run.
- **Side effect, implemented and confirmed:** since it needed to validate
  `universityId` input, `PUT /api/users/me` is now real rather than `501` —
  validates `facultyId`/`yearId`/`universityId` against their tables,
  rejects a year that doesn't belong to the selected faculty, only writes
  keys present in the request body (an explicit `universityId: null` clears
  scope; omitting it leaves the field untouched). Worth a read before
  trusting this validation logic in a future session, since it went
  slightly beyond the original scoping request.
- Database confirmed clean after verification: 5 questions, 7 lessons, 12
  users, zero leftover scoped rows/fixtures; the two seeded universities
  (Algiers, Oran) are the only intentional additions.

### 4.14 Contextual Hints (PRD FR-29, BR-6 credit governance) — 🟡 code complete, live-model verification deliberately deferred (same reason as 4.12)
First PRD-driven feature tackled after the original backlog closed — chosen
over automating the payment gateway (the other real remaining PRD/MVP gap)
as the better use of solo-dev time toward the portfolio/CV goal: lower
effort, directly reuses the Section 4.12 AI infrastructure, and is a much
stronger interview story than third-party payment-gateway glue. The
automated payment gateway remains a known, deliberately-deferred MVP gap —
see Section 9.

Designed and built on **Opus 5 High** throughout (design *and*
implementation, not just design) — this combines a real credit-governance
architecture decision with a genuine safety-critical design problem
(the hint must never leak the correct MCQ answer), matching two of the
four Opus-trigger criteria at once. Reuses `src/lib/ai/anthropic.ts` and
Haiku 4.5 from Section 4.12.

- **What it does:** during an active QCM/QCS practice-mode session, a
  student can request a hint that nudges toward the right reasoning
  without revealing which option is correct. Personalized using the
  student's recent performance (module accuracy band + whether they've
  missed this exact question before).
- **Endpoint:** `POST /api/sessions/:id/hints`, body `{ questionId }` —
  deliberately placed alongside `POST /api/sessions/:id/answers` (same
  ownership/membership guards) rather than under a not-yet-mounted
  `/api/ai/*` group, since a hint is session-bound, not a standalone AI
  tool. A `GET /api/ai/credits` companion endpoint is designed but not yet
  built — natural next step whenever `/api/ai/*` gets mounted.
- **Credits (BR-6), using the previously-schema-only, previously-unused
  `ai_credit_balances` table for the first time:**
  - Shared pool across *all* future AI features (not hints-specific) —
    `plans.features.aiCredits.dailyAllowance`, admin-editable via the
    existing `PUT /api/admin/plans/:id`. Confirmed values: **5/day free,
    30/day premium.**
  - Lazy balance bootstrap on first-ever AI use (resolves active
    subscription → plan → `features.aiCredits`, falls back to the seeded
    free plan if none).
  - Daily reset logic written from scratch (table existed, logic didn't):
    if `now >= resetAt`, clears `usedToday` and rolls `resetAt` to next
    UTC midnight — same day-granularity pattern as streaks.
    `usedThisMonth`/`monthlyAllowance` are maintained but not yet enforced
    (forward-compat only, semantics deliberately left for later).
  - **Reserve-then-generate-then-refund-on-failure**, not a simple
    write-once check — correctly identified as a different problem from
    the Section 4.8/4.10/4.12 `ON CONFLICT`/`updateMany`-guard idempotency
    pattern, because this involves a real billable external side effect
    (the Anthropic call) that must never be chargeable on failure, and
    must never allow free unlimited retries via a race. The reserve step
    is a single atomic conditional `UPDATE ... WHERE used_today <
    daily_allowance`, so two concurrent requests on a student's last
    credit can only let one through. A failed/rejected generation refunds
    the reservation. **One accepted, documented residual gap:** a process
    crash between a successful AI call and the `ai_interactions` write
    leaves the credit spent with no refund — explicitly called out and
    accepted as an MVP-level cost, not silently glossed over.
- **Safety mechanism — the mirror image of Section 4.12's
  `VERDICT_MISMATCH` check, and genuinely two layers deep, not just one:**
  1. **Structural withholding:** the prompt sent to the model is built
     from a type that cannot carry which option is correct in the first
     place — `isCorrect`, the correct option id, and any existing
     explanation text are never included, so the model literally cannot
     leak what it was never given.
  2. **Post-generation leak detector**, because withholding alone doesn't
     stop a model guessing correctly from med-MCQ training-data
     familiarity or paraphrasing the right option's distinctive wording:
     checks for normalized substring overlap with the correct option's
     text, reveal-phrase patterns (French and English — this platform is
     bilingual), and definitive single-option assertions. On a detected
     leak: reject, retry generation once, then fail closed (no text
     returned to the student, no credit charged) rather than ever risk
     showing a flagged hint.
- **Exam mode is explicitly hint-free**, confirmed as a deliberate product
  decision (not just a default reading of FR-29): a request during an
  exam-mode session is rejected with `409` and a clear message naming
  practice mode, so exam attempts stay a true, uncontaminated measure of
  performance and progress-tracking data derived from them stays accurate.
- **A real ordering bug caught during the harness's own verification
  pass**, not flagged by a human first: the "is AI configured" check ran
  before the question-type guard, so a QROC hint request (an unsupported
  question type for hints) returned a confusing `503` instead of the
  correct `400`. Fixed by moving request-validity guards ahead of the
  AI-availability check.
- **Verified offline, 50/50, against the real Express stack and
  database** (everything provable without a live model call): exam mode
  → `409`; QROC (unsupported type) → `400`; out-of-session question →
  `404`; another student's session → `403`; unauthenticated → `401`; no
  API key configured → `503` at zero credit cost; 6th free-tier request
  in a day → `429` with the cap and reset time in the message; simulated
  provider failure → `502` with `used_today` unchanged (refund worked);
  double-refund guard; a reserve/refund boundary that can't cross
  midnight; a backdated `reset_at` correctly clearing the counter on the
  next request; a concurrency race on the last credit where exactly one
  reserve won; and the personalization band plumbing (weak/strong
  resolves correctly, prior-miss flag held constant so the band is
  provably the only variable).
- **What genuinely can't be verified without a real API key — the same
  situation as Section 4.12, and deliberately paused for the same
  reason:** the actual hint wording, for you to personally judge whether
  it reads well and genuinely avoids leaking beyond what the automated
  detector catches (the same "read it yourself, don't just trust the
  regex" standard we agreed applies to medical content), and whether the
  weak-vs-strong personalization band visibly changes hint content in
  practice, not just in the underlying data plumbing.
- **Next step when picked back up** (can be done in the same session as
  the Section 4.12 backfill, since both need the same key): add a real
  `ANTHROPIC_API_KEY` to `.env`, then run `npm run verify:hints:ai` — prints
  each test question, its options, the correct option marked
  reviewer-only, and the generated hint text, for roughly 8 real Haiku
  calls (well under a cent total). Re-run the free offline suite,
  `npm run verify:hints`, after any future change to the credit or safety
  logic, independent of whether a key is present.

---

## 5. Frontend — role-awareness (Section 14.2 from the original handoff)

**Follow-on fix, same session — faculty-visibility gap in `GET /api/questions`
and the session builder:**
- While verifying flashcards' visibility gate, testing revealed
  `GET /api/questions` and the session builder (`sessions.routes.ts`) did
  **not** filter by faculty `rolloutStatus` at all — only the new flashcard
  gate did. Same bug class, different endpoint. Fixed by making
  `buildQuestionWhere` (the shared filter helper in
  `src/lib/question-filters.ts`) apply the visibility gate
  **unconditionally**, rather than only when a module/year/faculty filter was
  explicitly passed. Live-verified: a fixture question under a temporary
  Dentistry (`planned`-rollout) unit was absent from `GET /api/questions`
  (unscoped, faculty-filtered, and unit-filtered) and correctly 404'd from
  `POST /api/sessions`; normal approved/live-faculty questions were
  unaffected (regression-checked).

**Investigated and ruled out as a non-issue, same session — BR-2 approval
gate:** initial testing appeared to show a `pending_review` question leaking
through `GET /api/questions` to a genuinely no-role test account. Investigated
rather than patched blindly: `buildQuestionWhere` already defaults to
`status: 'approved'` (confirmed in both source and compiled output), and
`GET /api/questions`/the session builder both inherit it with no override.
**Root cause was a data-state artifact from this session's own testing, not a
code bug** — the specific question in question had genuinely been approved via
the real review flow earlier in this same session (confirmed via direct DB
query: `reviewed_by` was set), so it was correctly visible under the existing,
correct filtering logic. Restored to `pending_review` to match the seed
fixture's intended state; independently re-confirmed via direct SQL query
(not just the AI tool's claim) before accepting this as resolved with no code
change. **Worth remembering:** this pattern (a "bug" that's actually leftover
test data) is worth checking for before assuming code is broken, especially
this deep into a long session with lots of live test accounts and role
changes.

**Deferred, not fixed — logged as an open item (Section 9):** a check-then-create
race condition in `enqueueReviewQueueItem` (shared by the question-enqueue,
flashcard-enqueue, and manual enqueue paths) could create duplicate queue items
under concurrent requests. Lower severity than the visibility issues above (a
duplicate review item is an annoyance, not a data leak) — deliberately left for
a future session rather than extending this one further.

---

## 5. Frontend — role-awareness (Section 14.2 from the original handoff)

**This was the single biggest unknown carried over from an early session** — flagged
as built-with-Grok-and-never-tested, with an explicit note to redo it if anything
looked wrong.

**It was tested in a real browser and passed on the first attempt — no rework
needed:**
- Role-elevated account (`hamamebouchareb@gmail.com`, has instructor+admin+academic_reviewer):
  dashboard shows both "Author Content" and "Review Queue" links ✅
- No-role account (`norole@hamame.dz` / `testpass123`): both links correctly hidden ✅
- Direct navigation to `/authoring` while logged in as the no-role account: clean "You
  don't have permission to access this page." message with a working "Back to
  Dashboard" link — not a crash, not blank, not a raw error ✅
- Same clean result for `/review` ✅

Backend enforcement (`requireRole` middleware) was always the real security boundary
regardless of frontend state — this closes the UX/polish gap on top of it.

**Unrelated note, not a bug:** `http://localhost:3001/` (the bare root path) is still
the default, unmodified `create-next-app` scaffold page. This was never customized —
real pages start at `/login`, `/dashboard`, etc. Don't mistake this for something
broken by the folder move.

---

## 6. PRD updated with MBset-inspired additions (see file `hamame_prd_updated.md`)

A competitive feature analysis was run against **MBset** (a medical-exam-prep platform,
analyzed via Manus — official site, app store listings, screenshots, dated Aug 2026).
Full gap analysis is in `MBSET_GAP_ANALYSIS.md`. Bottom line: **Hamame is already ahead
of MBset in role granularity, content authoring/review pipeline, moderation tooling,
friends/social, and badges** (several of these aren't even in MBset's own feature
list). **Hamame is behind in exactly one category: AI** — every meaningful gap
(option-level explanations, tutor chat, PDF extraction, FSRS-quality spaced repetition,
predictive exam mode) traces back to MBset having a real AI integration and Hamame
deliberately not having one yet. That's a single strategic/budget decision (which AI
provider, what cost model), not five separate small engineering gaps.

**PRD edits made** (all marked `[MBset-inspired]` inline in the doc for
traceability — see `hamame_prd_updated.md` in outputs):
1. Header note crediting MBset as a second inspiration source (alongside MedSpark),
   explicit that this is competitive-analysis-driven, not copying
2. Guest role: added frictionless no-signup demo trial concept
3. New FR-21a: live "Challenge" competitive quiz mode (Version 2/3 roadmap)
4. New FR-10a: optional per-university content scoping (forward-looking, not required
   for MVP — flagged so the content model doesn't need a redesign later if this becomes
   competitively necessary)
5. AI-Enhanced Explanations catalog entry tightened to explicitly include **per-option**
   justification, not just overall explanation
6. New AI catalog entry: "PDF-to-Structured-Content Extractor" (instructor-facing) —
   explicitly still enters the mandatory review workflow, does not bypass BR-2
7. FR-26 (spaced repetition) now explicitly names **FSRS** as the target algorithm,
   with SM-2-style as an acceptable interim (matches what was actually built)
8. Version 2 roadmap: added Challenge mode, referenced FSRS goal explicitly
9. Version 3 roadmap: added per-university scoping (demand-gated, not speculative) and
   a possible non-monetary "perks" tier for student contributors alongside the existing
   revenue-share track

Also worth noting per the gap analysis: **all four** of its named "genuinely quick
wins" are now built — promo/referral codes, the Top Contributors leaderboard
variant, daily study goals, and flashcards as a distinct content type (Sections
4.5, 4.6, 4.7, 4.8). The MBset comparison's actionable backlog for a solo MVP is,
as of this session, fully closed except for the AI-provider decision (the one
deliberately-deferred strategic item, Section 5/9) and the explicitly-out-of-scope
items (live real-time competition, teams/groups, native mobile, per-university
scoping).

**⚠️ Status:** `hamame_prd_updated.md` reflects everything listed above and is a
legitimate, usable draft — do a final read-through before treating it as fully final,
since it was not re-reviewed line-by-line after the last edit in the session it was
written in.

---

## 7. Test accounts & credentials

| Account | Password | Roles | Faculty / Year | Notes |
|---|---|---|---|---|
| `hamamebouchareb@gmail.com` | `NewTestPass123!` | student_free, instructor, admin, academic_reviewer | Medicine / Year 1 (set this session, previously null) | **This is the real account — password is still a test value, never reset to something real. Do this first in the next session:** `POST /api/auth/forgot-password` → `POST /api/auth/reset-password` with a real password. |
| `norole@hamame.dz` | `testpass123` | none (deliberately) | none | Used throughout for negative-permission testing |
| `seed-author@hamame.dz` | (seeded, unknown here) | academic_reviewer, admin, instructor | unknown | Used for role-grant/revoke testing |
| Test Student Two (`e6ec77e4-f56d-431d-b9b2-e3ba8f474601`) | n/a | student | Medicine / Year 1 (set this session, previously null) | Used for leaderboard live-verification this session; has 1 completed session (score 50) |

Most test data created during testing (test roles, test subscriptions, test sessions,
test badges, test promo codes, test friendships, test leaderboard entries) was cleaned
up immediately after each test. **Known exceptions, deliberately left in place:**
- `hamamebouchareb@gmail.com` and Test Student Two now have real `facultyId`/`yearId`
  values (Section 4.6) — needed for leaderboard testing, kept as realistic data.
- The `WELCOME30`/`STACK15` promo codes and their redemption rows/test subscription
  (Section 4.5) — codes were expired via PATCH rather than deleted, redemption history
  left intact as harmless.
- **Two seeded universities, Algiers and Oran** (Section 4.13) — the only intentional,
  permanent additions from that session's per-university scoping work, used going
  forward as real `University` rows for any future university-scoped content. All
  test-only scoped content/rows created during that verification were cleaned up;
  only the two university records themselves remain.

---

## 8. Reference: earlier-session context (still accurate, carried from the original
handoff)

- **Soft-delete account policy:** `DELETE /api/users/me` sets `status: 'deleted'`,
  scrubs PII, invalidates password — never a real row delete. 16 `onDelete: Cascade`
  relations exist for personal/non-financial data; `Restrict` kept deliberately on
  authored content, institutional admin, subscriptions/payments, moderation
  reports; `SetNull` on already-optional reviewer fields. Full reasoning in
  `hamame-user-deletion-policy.md`.
- **API contract deviations from the original draft doc** (still true): submit/approve/
  reject endpoints use literal path segments in some places but **actually use the
  generic `:type` param pattern** for `authoring`/`review` routes (confirmed by reading
  the real file — the *original* handoff's claim of literal singular paths was itself
  wrong; always trust the actual route file over any doc, including this one, if they
  ever conflict). Reject endpoint body field is `reviewComment`, not `comment`.
- **Role-based authorization** (`requireRole` middleware) covers authoring/review/
  moderation/admin route groups, tested and solid — this has been true since early on
  and remains the actual security boundary throughout.

---

## 9. What's genuinely left (in priority order)

**Everything from the original backlog is closed.** The `Promise.all` P1001
fix (4.9), automatic badge-award triggers (4.10), the cosmetic cleanup pass
(4.11), the AI-provider decision and its implementation (4.12),
per-university content scoping (4.13), and Contextual Hints (4.14) are all
done. What's left now is genuinely small — two items paused only on adding
a real API key, plus one trivial task, all deliberately deferred by choice:

1. **Judge the AI output for both AI features, once ready** — same key
   unblocks both, worth doing together in one sitting:
   - Section 4.12: run `npm run ai:backfill-explanations -- --dry-run`,
     read the 3 generated MCQ explanations for actual medical accuracy
     before running for real or at the full 2000+-question scale.
   - Section 4.14: run `npm run verify:hints:ai` (~8 Haiku calls, well
     under a cent), read the generated hint text yourself — does it read
     well, does it genuinely avoid leaking beyond what the automated
     detector already catches, does weak-vs-strong personalization
     visibly change the wording.
   - Add `ANTHROPIC_API_KEY` to `.env` (file exists, confirmed gitignored)
     only when actually doing this — don't hold a real billing-enabled key
     in the project while both stay deferred.
2. **Reset the real account's password** (Section 7) — still deferred
   across four sessions now, trivial, keeps nagging as unfinished. Dev-mode
   returns the raw reset token directly in the `forgot-password` response
   body (no email provider exists), so this is genuinely a 2-minute task.

**The one real remaining PRD/MVP compliance gap, deliberately not
prioritized:** automated self-service payment. The PRD's MVP section
requires this by end of MVP hardening; the platform still uses
manual-assisted payment (Section 8/original handoff). Deliberately
deprioritized in favor of Section 4.14 — Algerian payment-gateway
integration (CIB/SATIM-class providers) is a disproportionately painful,
low-documentation integration for a solo dev, and doesn't showcase
engineering skill toward the frontend-role portfolio goal the way a
well-designed AI feature does. Worth revisiting only if this moves toward
a real launch rather than staying a portfolio project.

**Other PRD Version 2 items not yet built, lower priority than the payment
gap:** AI Study Assistant (chat), AI Note Maker, Answer Locator (needs
semantic search, not built), FSRS-class spaced repetition (currently
SM-2-inspired — real, known upgrade path), push notifications + preference
center, offline download for Premium, predictive exam-readiness indicator.

**Cosmetic/low-priority, not urgent, carried forward:**
- `npx prisma migrate status` fails with `P1001` while the Prisma Client
  itself connects fine on the same URL (found in an earlier session) —
  CLI-specific, not blocking (`prisma migrate deploy` has worked fine
  through migration `20260101000013` despite this), but worth checking
  `DIRECT_URL` vs `DATABASE_URL` env var resolution in a future session
  regardless.
- The flashcards infrastructure (Section 4.8) existed before the session it
  was documented in but was completely undocumented anywhere — a real
  history-keeping gap, not a code problem. Worth staying alert to the
  possibility of other undocumented pre-existing work before assuming a
  "clean build" on any future feature; this lesson has now surfaced twice.

**Explicitly out of scope for now** (disproportionate effort for a solo
MVP/portfolio project): live real-time "Challenge" infrastructure
(websockets), teams/groups, native mobile apps, community discussion
threads, institutional pilot, multilingual AI-narrated audio.

---

## 10. Files in this handoff bundle

- `HAMAME_MASTER_HANDOFF.md` — this document
- `hamame_prd_updated.md` — PRD with MBset-inspired additions (Section 6 above)
- `MBSET_GAP_ANALYSIS.md` — full feature-by-feature comparison referenced in Section 6

Older reference docs (`hamame-user-deletion-policy.md`, `hamame_api_contract.md`,
`hamame_database_schema.md`, the original `HAMAME_HANDOFF.md`) remain valid background
but are superseded by this document wherever they conflict.
