# Hamame — Master Handoff (Full History → End of This Session)

**Read this entire document before doing anything else in a new chat.** This
consolidates: the original project handoff, the API contract, database schema notes,
deletion policy doc, and everything built, tested, and fixed across sessions —
including full V1 backlog closure, the V2 features (Sections 4.1–4.14), and the
most recent session's work: **git initialization (first version control this
project has ever had), the Task 6b profile-editing pass, the full Task 8
responsive/accessibility pass with tool-verified contrast ratios, the
`GET /api/progress/qcm-stats` endpoint, the profile badge shelf,
`POST /api/auth/change-password`, the heavy-content test account, a
re-verification of the authoring/review workflow, and — most recently —
the **activation-code redemption feature** (`activation_codes` table,
`POST /api/admin/activation-codes`, `POST /api/activation-codes/redeem`),
fully built and independently verified via curl + direct Supabase SQL,
with two accepted spec deviations documented in Section 2A below, the
**session-builder refinements + study-timer presets** (Section 2B), the
**frontend design-system P0 pass** which also caught and fixed a real
navigation-consistency bug via `web/src/lib/nav.ts` (Section 2C), and —
most recently — **Hamame Drive / Resources built from scratch and
independently verified** (Section 2D; an earlier claim that its backend
already existed was found to be false during verify-first). A final
re-verification pass on Resources (also Section 2D) additionally surfaced a
**new, unresolved, app-wide encoding bug** (accented French characters
corrupted across seed output, API responses, and live rendered DOM) that is
not specific to Resources and needs its own investigation.** Where this document conflicts
with an older doc, **trust this one** — every claim below was re-checked against
the live codebase, database, or a real API call during the update pass unless
explicitly marked "carried forward unverified."

---

## 0. Critical environment facts — read this first

- **Working directory is `C:\dev\hamame1`** (backend) and `C:\dev\hamame1\web`
  (frontend). The Desktop copy is stale and abandoned — never use it.
- **Git is now installed and initialized (NEW — this session).** Baseline commit
  `7912c78` ("Initial commit: baseline snapshot of Hamame codebase"), **175
  tracked files**, clean tree at creation. Git for Windows 2.55.0.3, installed
  via winget; identity `Hamame <hamame@dev.local>`; `core.autocrlf false`
  (deliberate — byte-faithful diffs). `.gitignore` covers `.env`, `.env.local`,
  `.env.*.local`, `node_modules/`, `dist/`, `.next/`, `*.log`, `tmp-*` scripts,
  session debris, and `docs/Hermes-Setup.exe` (7.9 MB binary, on disk, untracked).
  **Workflow from now on: commit before starting a session, commit after each
  completed task.** The baseline already saved the project once — see the file
  loss incident below.
- **The filesystem has recurring slow/corruption episodes (NEW — observed this
  session).** Next.js itself prints "Slow filesystem detected." Twice this
  session, shell commands silently hung; once, `web/src/app/profile/page.tsx`
  was found **zero-filled (14 KB of NULs)** and had to be reconstructed from
  earlier reads. Five committed docs files also vanished from disk and were
  restored with `git checkout -- docs/`. **Lesson: when commands hang with no
  output, retry before debugging; when a file reads as binary/garbage, check
  `git status` before assuming code is broken.**
- **Tooling: OpenCode** (this and prior sessions). Whether the Cursor Pro
  subscription has returned could **not** be verified from this machine — the old
  doc's "expected back within about a week" is **carried forward unverified**.
  The old doc's warnings about OpenCode's model picker silently reverting, and
  about independently re-verifying every "done/verified" claim, were **re-confirmed
  as valid this session** (the old handoff doc itself turned out to be stale in
  six places — see the ⚠️ flags throughout Section 2, 7, and 9).
- **Recurring problem: orphaned `node.exe` processes holding port 3000** →
  `EADDRINUSE` or unexplained `INTERNAL_ERROR` on every request. Check
  `netstat -ano | findstr :3000` before debugging anything else. (Did not recur
  this session, but the pattern stands.) Note the inverse also happens: a dev
  server started as a hidden background process **can die silently between
  sessions** — this session the API was found down (`ECONNREFUSED`) and needed a
  restart. Always check both servers are actually up before debugging endpoints.
- **Transient Supabase pooler errors: P1001 *and* P1017 (UPDATED).** Beyond the
  known P1001 concurrency ceiling (~10 simultaneous Prisma queries → switch
  `Promise.all` to sequential `await`), this session caught a **P1017 "Server has
  closed the connection"** mid-session on a plain two-query endpoint that had
  worked minutes earlier — free-tier pooler dropping an idle connection. It
  presented as a 500 `INTERNAL_ERROR` on `GET /api/progress/qcm-stats` for one
  account while another account's call succeeded seconds later. **A single
  P1017/P1001 with a clean code path is noise: retry before investigating.**
- **Shell confusion is a recurring failure mode** (PowerShell vs cmd.exe; `$VAR`
  syntax only works in PowerShell). Re-confirmed this session. Variables do not
  carry across terminals.
- **PowerShell + curl `-d` gotcha, re-confirmed twice this session:** inline JSON
  gets mangled (a body containing a space gets split mid-JSON — the server logged
  `body: '{"fullName":"Ahmed'`). Always write JSON to a file and send with
  `curl.exe --data-binary "@file.json"`.
- **`tsx watch` auto-reloads on save** — re-confirmed. Manual restart still
  required only after `prisma generate`/`migrate deploy`.
- **Two servers, three terminals:** backend (`:3000`), frontend (`:3001`), plus
  one for commands. There is **no `/api/health` route** — probe e.g.
  `GET /api/plans` (public) to check the API is up.

---

## 1. Tech stack & infrastructure

- **Backend:** Node/Express + TypeScript, Prisma ORM (client 6.19.3), zod 3.24
- **Frontend:** Next.js **16.2.10** (Turbopack) + React 19.2.4, Tailwind v4 —
  note `web/AGENTS.md`: this Next.js version has breaking changes; read
  `web/node_modules/next/dist/docs/` before writing frontend code
- **Database:** Supabase PostgreSQL, project `drjlelyuxgqdzsgwqtgv` (`eu-west-1`)
  - **Only the Session pooler works for Prisma:**
    `aws-0-eu-west-1.pooler.supabase.com`, port **5432** (not 6543)
  - Free tier can auto-pause / drop idle connections (see P1001/P1017 above)
- **Migrations:** `prisma migrate diff` (offline SQL) + `prisma migrate deploy`.
  **`prisma migrate dev` does NOT work here** — no shadow database on this
  pooler. Never use it.
  - **⚠️ Old-doc claim corrected:** `npx prisma migrate status` **works now** —
    re-run this session, output: "16 migrations found… Database schema is up to
    date!" The old "fails with P1001, CLI-specific" note is stale and removed.

## 2. Full migration history (18 total — ⚠️ older doc said "16"; rows 17–18
added with activation codes + session result_sort/show_stats. Confirm applied
via `prisma migrate status` when touching migrations.)

| # | Migration | What it did |
|---|---|---|
| 1 | `20260101000000_init` | Initial schema |
| 2 | `20260101000001_add_cascade_deletes` | 16 `onDelete: Cascade` relations |
| 3 | `20260101000002_make_email_university_wilaya_nullable` | Nullability fix |
| 4 | `20260101000003_add_review_comment` | `reviewComment` on Question/LessonVersion |
| 5 | `20260101000004_add_progress_unique_constraint` | `@@unique([userId, lessonId])` on Progress |
| 6 | `20260101000005_add_password_reset_fields` | Reset token hash + expiry on User |
| 7 | `20260101000006_add_verification_fields` | Verification token hash + expiry on User |
| 8 | `20260101000007_add_suspended_until` | `suspendedUntil` on User |
| 9 | `20260101000008_add_instructor_applications` | `instructor_applications` table |
| 10 | `20260101000009_add_promo_code_redemptions` | `promo_code_redemptions` table |
| 11 | `20260101000010_add_flashcards` | Flashcards infrastructure (⚠️ **missing from the old doc's table entirely** — the same "undocumented flashcards work" gap called out in old Section 9) |
| 12 | `20260101000011_add_daily_goal_minutes` | `Streak.dailyGoalMinutes` (default 20) |
| 13 | `20260101000012_add_review_queue_and_flashcard_unique_constraints` | Four unique indexes closing the enqueue race |
| 14 | `20260101000013_add_university_scoping` | University table + nullable `university_id` columns (`Restrict` on content FKs) |
| 15 | `20260101000014_add_push_notifications` | Push subscription tables/columns |
| 16 | `20260101000015_make_full_name_nullable` | `fullName` nullable (supports null-clearing on PUT /users/me) |
| 17 | `20260101000016_add_activation_codes` | Activation codes table (FR-65) — see Section 2A |
| 18 | `20260101000017_add_session_result_sort_and_show_stats` | `study_sessions.result_sort` + `show_stats` (FR-15/16 session-builder) — see Section 2B |

---

## 2B. Session-builder refinements (sort / examMode / showStats) + study-timer — DONE

**Status: done** (Part 1 closeable). Verified 2026-08-27 with raw HTTP + SQL evidence,
not paraphrases.

| Piece | Where | Evidence |
|---|---|---|
| `sort`: `by_year` / `by_course` / `random` | `POST /api/sessions` (`src/routes/sessions.routes.ts`); persisted as `resultSort` | `docs/verification/sort-by-year-raw-1787854047420.log` — 3 ephemeral accounts × 3 sorts, all 201; SQL `presented_order` proves multi-year `by_year` (temporary Year 2 fixture seeded then cleaned — post-cleanup counts in that session’s closeout) |
| `examMode` boolean | same; **explicit `examMode` overrides `mode`** (`mode:"practice"+examMode:true` → `exam`; `mode:"exam"+examMode:false` → `practice`) | same log, examMode override section |
| `showStats` | persisted + echoed on session/results payloads | same log (`showStats:true` echoes) |
| Study-timer presets / pause behavior | frontend session timer | `docs/verification/opencode-shots/timer-pause-*.png` (copied from `%TEMP%\opencode\shots`) |
| UI builder options | `web/src/components/SessionBuilder.tsx` | `docs/verification/opencode-shots/builder-*.png` |

Re-run harness: `npx tsx src/scripts/verify-sort-by-year-raw.ts` (requires API on `:3000`).

**Not fixed by this work (but since resolved separately):** `hamamebouchareb@gmail.com` login 401 was still open as of this session's `by_year` matrix, which used ephemeral `register`+`login` accounts as a **test workaround only**. It has since been fixed and verified — see Section 7 and Section 9 for the current (closed) status.

---

## 2A. Activation codes — built and verified (NEW — this session)

Implements FR-65/BR-18 (`docs/hamame_prd_updated.md`), added after cross-referencing
a MedSparkDZ competitor audit. New `activation_codes` table (see
`docs/hamame_database_schema.md` for the exact columns; confirm the migration
filename in `prisma/migrations/` — not re-checked by name here). Endpoints:
`POST /api/admin/activation-codes` (issue, `support_agent`/`admin`-gated),
`GET /api/admin/activation-codes` (list), `POST /api/activation-codes/redeem`
(student-facing).

**Verified via curl + direct Supabase SQL this session:** issuance (201, opaque
code), role gate (403 for non-admin), year/faculty mismatch (400
`YEAR_FACULTY_MISMATCH`), successful redemption grants premium, re-redemption
of the same code is blocked (409 `ACTIVATION_CODE_ALREADY_REDEEMED`), expired
codes are rejected before any write (409 `ACTIVATION_CODE_EXPIRED`).

**⚠️ Two accepted spec deviations (documented, not bugs to fix — see the
`docs/hamame_prd_updated.md` FR-65/BR-18 ⚠️ notes for full reasoning):**
1. Redemption grants the *same blanket platform-wide premium* every other
   `Subscription` grants — it does **not** scope access to just the purchased
   faculty-year. `Subscription` has no faculty/year column anywhere in the
   schema; the chosen faculty-year is preserved only as audit/display metadata
   on the `activation_codes` row. Fixing this properly means adding scoping to
   `Subscription` and every gating check that reads it (`src/lib/ai/credits.ts`,
   `/api/subscriptions/me`, content gates) — out of scope unless per-faculty
   pricing becomes a real business requirement.
2. A new zero-amount `payment` row (`method: 'manual_assisted'`) is
   auto-created **at redemption time**, not linked from a payment that already
   existed at issuance — because no endpoint exists yet for an admin to record
   a manual payment before issuing a code. Still produces a complete audit
   trail, just a different sequencing than the original wording implied.

**Test-account side effect:** `heavy@hamame.dz` now holds a live `active`
premium `Subscription` (Medicine/Year 1 metadata, `currentPeriodEnd`
2026‑09‑24) as a direct result of this session's redemption test. If a future
session finds `heavy@hamame.dz` unexpectedly premium and doesn't know why,
this is why — not a leak or a seeding bug.

---

## 2C. Frontend design-system P0 pass + nav-consolidation bug fix — DONE

**Status: done.** This targeted the P0 ("expérience de base") priorities from the
MedSparkDZ Frontend/UX/UI audit — dashboard primary-action clarity, actionable
empty states, accessible icon labels, responsive breakpoints, stabilized
QCM/Bibliothèque/Suivi/Révision routes, and reliable Profile/Settings form
success/error states.

**Audit-first, build-second discipline was followed deliberately** because most
of this ground had already been covered by the Task 8 pass (Section 4.16) and
the earlier tokens.css/dashboard-restructure work — the goal was to find real
gaps, not re-implement what already existed.

**Audit findings (already done, confirmed not re-touched):**
- `tokens.css` — single token source, Hamame's own volt-lime/navy palette
  (deliberately not a MedSpark-orange clone), no competing token system found.
- Dashboard primary action — `ResumeBar` already first-child with a clear
  "Reprendre l'étude" CTA; KPI row already capped at 3 metrics.
- Accessible icon labels — every icon-only/stateful control already carries an
  `aria-label` (hamburger, avatar menu, modal/toast close, study-timer FAB,
  notification switches, session-builder inline switches); nothing found
  missing.
- Responsive breakpoints — dashboard 2-col→1-col collapse, QCM tiles 4→2→1,
  Settings 2-card stack — all confirmed working at 1440×900/1024×768/390×844.
- Profile/Settings forms — field-level errors, preserved valid data, and real
  success toasts already present on Settings (Profile itself is read-only, no
  form there).

**Gaps found and fixed (only these were touched):**
- Empty states made actionable (previously passive/missing CTA) on: Notes
  library, Bibliothèque (`/faculties` + full curriculum drill-down:
  years/modules/units/lessons), and the profile `BadgeShelf`.
- Suivi/Révision — error + retry states added where missing.
- Settings — password-change field-level errors added; generic
  anti-enumeration error kept on the API side.
- Switch/toggle state labels (`{label} — activé / désactivé`) added on Settings
  notification switches and `SessionBuilder` inline switches.
- Mobile full-width CTAs on empty states, `ResumeBar`, and the Settings save
  button.
- QCM builder question-type tiles now grid `1→2→4` cols
  (`grid-cols-1 md:grid-cols-2 xl:grid-cols-4`) instead of a fixed 4-col grid.

**Hamame Drive / `/resources` — explicitly flagged, not fixed (at time of this
pass):** no `/resources` route exists anywhere in `web/src/app/`; the
dashboard's Spark-Drive-equivalent sidebar entry is a static link list, not a
data-driven empty state. **⚠️ Correction to an earlier claim in this same
document:** the note below (and in Section 9) that the backend "has existed
since the MedSparkDZ cross-reference work" was **wrong** — it described intent
from the docs, not actual code. A later verify-first check (Step 0 of the
Hamame Drive build) found **no route, no Prisma model, no migration, no git
history** for `resources` at all. See Section 2D — this has since been built
and independently verified end-to-end.

**Real bug found only because live-API re-verification was insisted on (not
accepted on mocked evidence):** the first verification pass captured
empty/error-state DOM against `fetch` mocks because the API wasn't reachable
from that session's shell. On redo against a live API + `norole@hamame.dz`,
the re-captured DOM did **not** match the mocked version structurally (mocked:
bare `<div>` wrapper, no icon; live: `<section>` wrapper with an icon circle
and `<h2>`) — proving the mock-based "evidence" from the first pass would have
been false confidence if accepted as-is. **Lesson reinforced: for this
project, mocked DOM is not evidence; only live-API captures count.**

**Second bug found the same way, this one real and previously invisible:**
comparing live DOM across `/notes`, `/revision`, and `/settings` showed the
primary header nav (`<nav aria-label="Navigation principale">`) rendering a
**different subset of links depending on the route** — not a shared,
consistent nav. Root cause: `AppHeader`'s `nav` prop defaulted to `[]` and
~15 individual page files each hand-rolled their own `HEADER_NAV` array,
so the link set silently drifted per route with no single source of truth.

**Fix:** new `web/src/lib/nav.ts` — `PRIMARY_NAV` (the audit's five tabs:
Tableau de bord, QCM, Bibliothèque, Suivi, Révision) and `SECONDARY_NAV`
(Notes, Abonnement, Mon profil, Paramètres — demoted to the avatar/secondary
menu, per the audit's IA, rather than hand-rolled into the primary nav on only
some routes). `AppHeader` now imports both, defaults to them, and computes
`aria-current` itself via `usePathname()` (fixing nested-route highlighting
for `/qcm/builder`, `/faculties/:id`, etc. as a side effect). All ~15 per-route
`HEADER_NAV`/`menuLinks` arrays removed — the nav list can no longer drift.

**Live-verified:** raw DOM captured across `/dashboard`, `/qcm`, `/suivi`,
`/revision`, `/notes`, `/settings` — the five primary-nav links are now
byte-identical on every route (only `aria-current` differs), and the avatar
menu (Notes/Abonnement/Mon profil/Paramètres/Déconnexion) is identical
everywhere.

---

## 2D. Hamame Drive / Resources — built and independently verified (NEW — this session)

**Status: DONE.** This closes the gap flagged in Section 2C. Verified via
`docs/verification/resources-verify-raw-1788203041714.log` — real terminal
output, full HTTP request/response bodies, live DOM captures. Meets the
project's standing verification bar (raw evidence only, no self-graded
"PASS" claims accepted at face value).

**Verify-first finding that corrected the record:** Step 0 of this build found
**no `resources` route, no Prisma model, no migration, and no git history** —
the earlier claim (Sections 2C/9) that this backend "existed since the
MedSparkDZ cross-reference work" was false; it was the docs' intent, not real
code. Full feature (backend + frontend) had to be built from scratch.

**Backend built:**
- `Resource` Prisma model (`prisma/schema.prisma`), migration
  `20260101000018_add_resources_table`, deployed.
- `GET /api/resources` — filters `faculty` / `year` / `type`. Confirmed live:
  faculty filter on seeded data returns 2/4 rows correctly; `type=official_drive`
  returns 1/4 correctly.
- `GET /api/resources/:id` — confirmed 200 with full shape; confirmed 404 shape
  `{"error":{"code":"RESOURCE_NOT_FOUND","message":"No resource exists with this id."}}`.
- Seed script confirmed **idempotent** via fixed-UUID upsert — reseeding twice
  produces identical 4 rows (`00000000-0000-0000-0000-000000000120/130/140/150`),
  no duplicates, verified by raw SQL row comparison before/after.

**Frontend built:**
- `/resources` — list page. Empty-state DOM confirmed (`Aucune ressource` +
  "Parcourir le programme" CTA → `/faculties`). Populated-state DOM confirmed:
  `CourseCard` grid, official resources visually distinguished (accent-primary
  border + "Officiel" badge) vs. reference/past_exam/other (accent-library border).
- `/resources/[id]` — detail page. Confirmed rendering type, source/attribution,
  and a working download link (`target="_blank" rel="noopener noreferrer"`,
  `href` = the real seeded `file_url`, not a placeholder).
- Dashboard "Ressources" card confirmed updated: "Voir toutes les ressources"
  CTA → `/resources`.
- Nav: confirmed via live DOM capture, not by reading `nav.ts` — `PRIMARY_NAV`
  still exactly 5 tabs (Tableau de bord, QCM, Bibliothèque, Suivi, Révision);
  `/resources` lives in `SECONDARY_NAV` (avatar menu). No drift introduced;
  `web/src/lib/nav.ts` remains the single source of truth per the Section 2C fix.

**Bugs hit and fixed during this build (disclosed, not hidden):** a UUID typo
in the verify script, an auth response shape mismatch (`token` →
`{token,user}`), a CORS origin config issue, and a Suspense/detail-hook issue
on the frontend.

**Cleanup confirmed:** all 4 seeded resources deleted by ID (raw `DELETE`
statements, 1 row affected each), final `SELECT count(*) FROM resources`
returns `0`.

**Final confirmatory re-verification (2026-09-02):** a follow-up pass was run
after the above to re-confirm end-to-end, this time reaching live rendered DOM
on the first fully-successful attempt only after working through infra
flakiness (Puppeteer nav timeout, then API server ECONNREFUSED, then frontend
ECONNREFUSED — each diagnosed and the relevant server restarted before
retrying; the silent-death pattern already noted elsewhere in this doc struck
twice in one session). Accepted log:
`docs/verification/resources-verify-raw-1788295689511.log`. This pass
additionally confirmed, via raw SQL + curl, the full reset→reseed cycle
(existing 4 rows → deleted to 0 → reseeded to 4, same fixed UUIDs, new
`created_at` values) and reconfirmed the faculty+year filter narrows 4→2 rows
correctly.

**⚠️ New bug found during this pass, not yet fixed — app-wide, not limited to
Resources:** accented French characters are corrupted (mojibake — e.g.
"RǸfǸrence" instead of "Référence", "Bibliothque" instead of "Bibliothèque",
missing apostrophes) across **three independent layers**: the seed script's
own console output, raw API JSON response bodies, and — critically — the
**live browser-rendered DOM** captured via Puppeteer on `/resources`,
`/resources/[id]`, and the dashboard nav. Because it appears in actual
rendered DOM (not just a terminal display artifact), this points to a real
encoding issue somewhere in the pipeline — likely DB column collation, a
missing/incorrect `charset=utf-8` on API responses, or corrupted source data —
not merely a Windows console codepage quirk. This affects every
French-language string app-wide and needs its own investigation; it is not
specific to the Resources feature and should not block Resources' own
closure, but should be tracked as a new, real, open bug.

**Standing note on verification quality:** two earlier acceptance reports for
this same feature were rejected before this one — both described component
source code and used conditional-tense claims ("would return 0", "renders as
X") instead of producing real terminal/HTTP/DOM output. This log is the
reference example of the bar going forward: raw SQL rows, real JSON bodies,
real DOM strings with matching hrefs/classes, explicit before/after counts.
Treat any future "complete" claim without an equivalent raw log as unverified.

---

## 3. V1 backend — status: 100% complete (re-verified where touched this session)

### Auth
- `POST /api/auth/register` / `login` / `forgot-password` / `reset-password` /
  `verify` — all real, all previously live-verified. Reset/verify tokens are
  sha256-hashed, single-use; raw tokens returned in responses **only when
  `NODE_ENV !== 'production'`** (no email/SMS provider — deliberate MVP workaround).
- **`POST /api/auth/change-password` — NEW this session** (Section 4.19).
- **`PUT /api/users/me/preferences` is still a 501 stub** — re-confirmed live this
  session (`{"error":{"code":"NOT_IMPLEMENTED",…}}`). The working notification
  preference center is `GET/PUT /api/push/preferences` (push channels), not this.

### Jobs / cron (`src/jobs/`, node-cron in `src/server.ts`, daily + boot run)
- `expireSubscriptions.ts`, `unsuspendUsers.ts`,
  `generateLeaderboardSnapshots.ts`, `generateContributorsLeaderboardSnapshots.ts`,
  `sendDailyPushReminders.ts`. Admin triggers:
  `POST /api/admin/jobs/expire-subscriptions | /unsuspend-users |
  /generate-leaderboard | /generate-contributors-leaderboard`.
- Boot cron runs confirmed live this session (server log: "Expired 0 /
  Unsuspended 0 / Generated 2 + 2 snapshot rows").

### Content authoring & review — **re-verified end-to-end functional this session**
(Section 4.20 — do not rebuild; full route/field inventory there.)

### Admin — role management
- `POST /api/admin/users/:id/roles` (idempotent), `DELETE …/roles/:roleName`
  (idempotent, self-lockout-guarded `400 CANNOT_SELF_REVOKE_ADMIN`). Carried
  forward; not re-tested this session.

### Instructor applications — carried forward (not re-tested)
- Apply / me / admin queue / approve (transactional role grant) / reject
  (mandatory `reviewComment`). Source confirmed present in `admin.routes.ts` this
  session.

### Data export
- `GET /api/users/me/export` — sequential awaits (P1001 fix), no
  passwordHash/token hashes. Carried forward; file re-read this session.

### CORS
- `CORS_ORIGIN` env var, comma-separated, defaults to `http://localhost:3001` —
  re-confirmed in `src/app.ts` this session.

---

## 4. V2 features — 4.1–4.14 as previously built; 4.15–4.21 new this session

### 4.1 Spaced repetition (`/api/reviews`) — carried forward, spot-verified
Settings upsert, manual idempotent enqueue, due list, SM-2-inspired complete
(quality <3 → +1 day, no ease change; ≥3 → verbatim ease formula, 180-day cap).
Honest limitation stands: no repetition-count field, so SM-2-*inspired*, not
byte-exact; **FSRS remains the PRD's target algorithm.** Auto-enqueue hook in
`finalizeSession` gated on `ReviewSettings.isEnabled`, using the shared
`enqueueReviewQueueItem` (`ON CONFLICT DO NOTHING` primitive). File re-read this
session; logic untouched.

### 4.2 Score leaderboard — carried forward
Monthly snapshots per (facultyId, yearId), delete+replace by `period:
'monthly'`; `GET /api/leaderboard?facultyId=&yearId=`. Boot job ran clean this
session. Ranking math not re-tested this session.

### 4.3 Badges — ⚠️ old doc's note here was stale even internally
The old Section 4.3 said "no automatic award-on-achievement trigger built yet"
while its own Section 4.10 documented building exactly that. **Current truth:
automatic triggers exist** (4.10), the catalog/`me`/admin endpoints exist, **and
a badge display UI now exists on the profile page** (Section 4.18 — the old doc
predates any badge UI). 5 badge rows in the catalog (3 from `seed-heavy.ts`, 2
`verify-push` test badges).

### 4.4 Friends/social — carried forward (not re-tested)
Directional sender/recipient convention; idempotent request/accept/delete; no
existence leak. Frontend `FriendsPanel` renders on the profile page.

### 4.5 Promo codes — carried forward; DB artifacts re-confirmed live
`WELCOME30` and `STACK15` both present, both expired (`expiresAt
2020-01-01`), one redemption each — exactly the deliberate artifacts the old doc
described. Grant/extend-from-`currentPeriodEnd` logic not re-tested this session.

### 4.6 Top Contributors leaderboard — carried forward
`period: 'monthly_contributors'`, ranks by completed-session count (not
score-gated). Boot job ran clean this session.

### 4.7 Daily study goals — carried forward; endpoint shape re-confirmed
`GET/PUT /api/streaks/goal` (5–300 min), `GET /api/streaks/today`,
`dailyGoal` block in `/api/progress/me` (confirmed in file this session). UTC
day-boundary limitation (Algeria UTC+1) and the untimed-session inflation gap
stand as documented.

### 4.8 Flashcards — carried forward
Distinct model (not a Question variant), auto-generation from wrong answers
(deduped per user+question, `ReviewSettings`-gated), idempotent
`from-question`, `409 FLASHCARD_ALREADY_EXISTS` on duplicate `sourceQuestionId`
via generic POST. Not re-tested this session.

### 4.9 `GET /api/progress/me` sequential-await fix — confirmed still in place
File re-read this session: sequential awaits with the pooler comment intact.

### 4.10 Automatic badge-award triggers — confirmed still in place
`awardBadgeIdempotent` (`INSERT … ON CONFLICT DO NOTHING`), zod-validated
criteria taxonomy (`streak`/`session_count`/`accuracy`), triggered from
`finalizeSession`. `seed-heavy.ts` writes badges using these exact criteria
shapes, and the heavy account holds 3 earned badges — the taxonomy is live.

### 4.11 Cosmetic cleanup pass — carried forward (comment-only; not re-verifiable)

### 4.12 AI-enhanced MCQ explanations — 🟡 still code-complete, execution still deferred
**Still blocked on a real `ANTHROPIC_API_KEY`:** the server log this session
printed `[review:approve] ANTHROPIC_API_KEY not set — skipped explanation
generation` — so the approval hook fires and degrades correctly with no key.
Everything else from the old doc (VERDICT_MISMATCH safety property, conditional
`DbNull` write, resumable backfill script) carried forward; the backfill script
was not re-run.

### 4.13 Per-university scoping — carried forward; artifacts confirmed live
Layered model (null = global), `Restrict` on content FKs, `optionalAuth` on the
public list routes. Both seeded universities confirmed in DB this session
(Université d'Alger 1 — Faculté de Médecine; Université Oran 1 Ahmed Ben Bella).
`PUT /api/users/me` validation (year-faculty consistency, university existence)
re-confirmed from file; the null-clearing extension is Section 4.15.

### 4.14 Contextual Hints — 🟡 still code-complete, live-model verification still deferred
Same blocker as 4.12 (no API key). `npm run verify:hints` (offline suite) and
`verify:hints:ai` scripts confirmed present in `package.json` this session.

### 4.15 `PUT /api/users/me` nullable field clearing (Task 6b fix) — ✅ this session
- **Problem:** `wilaya`/`fullName` (and the nullable FKs) used
  `z.string().min(1).optional()` — fields could be omitted but never explicitly
  cleared once set.
- **Fix (verified directly in `src/routes/users.routes.ts:69-77`):** all profile
  fields are now `.nullable().optional()`, and the Prisma update maps only keys
  present in the body (`!== undefined` spreads), so explicit `null` reaches the
  database as `NULL` and omission leaves the field untouched:
  `fullName, facultyId, yearId, university, universityId, wilaya,
  profilePhotoUrl`.
- **Live-verified end-to-end:** PUT real values → 200 persisted; PUT
  `{"wilaya":null,"fullName":null}` → 200, fields null in the response **and**
  in raw SQL (`SELECT full_name, wilaya FROM users` → both `null`); PUT
  `{"facultyId":null}` → FK cleared; omitted fields untouched throughout.
  `yearId` shares the identical code path.
- **Adjacent fix found while testing:** malformed JSON hit the 500 branch of
  `errorHandler.ts` even though body-parser classified it 400 — now mapped to
  `400 VALIDATION_ERROR "Request body is not valid JSON."` (live-verified).
- AGENTS.md's route table (which still claimed this endpoint was a 501 stub) was
  corrected as part of this fix.

### 4.16 Task 8 — responsive + accessibility pass — ✅ this session, tool-verified
Scope: Dashboard, QCM (list/builder/player), Bibliothèque, Suivi, Révision,
Profil, Paramètres, at 1280×800 and 375×812.

- **axe-core 4.10.2 (real runs, not estimates)** via puppeteer-core + system
  Chrome against Dashboard/Settings/QCM Player at both viewports: **final state
  0 violations across all six runs.** Violations found and fixed along the way:
  - `LoadingSkeleton` emitted `aria-label` on a roleless div → now `role="status"`
    when labeled, `aria-hidden` otherwise
  - `PrimaryTabs` emitted dangling `aria-controls="panel-*"` (no tabpanels exist
    anywhere) → attribute removed
  - `UserMenu` trigger had no accessible name on mobile (name hidden below `sm`)
    → `aria-label="Menu du compte — {fullName}"`
  - Dashboard/QCM Player had no `<h1>` → `ProfileHero` greeting promoted to h1 in
    every branch (including loading, sr-only); player got an sr-only h1
  - Toast wrapper's invalid `aria-label` removed; decorative `·` separators in
    the player made `aria-hidden`
- **Contrast, computed not estimated** (WCAG formula, `tmp-ratio.mjs`):
  old `#64709a` = **3.98:1** on background (the previously reported "~4.1:1" was
  wrong and optimistic); the interim proposal `#7280a6` = 4.92/4.42/4.46 on
  background/surface-1/player-header (still failing two surfaces); the shipped
  token **`#7a88b0` = 5.49 / 4.94 / 4.98** — passes everywhere the token is used
  on non-exempt text (confirmed in `tokens.css` this session). Residual axe
  "incomplete" contrast nodes were traced to the decorative `body` radial
  gradients; worst-case math at the glow center: text-secondary 5.41:1,
  text-primary 12.26:1 — safe.
- **Mobile drawer (AppHeader), driven by real key/mouse events in Chrome
  375×812:** Escape closes and returns focus to the trigger
  (`focusReturnedToTrigger: true`); 8 Tabs cycled only the 6 drawer links (no
  leak); backdrop click closes; `aria-expanded` toggles `false→true→false` read
  from the live DOM. **Nothing needed fixing.**
- **One real data-volume bug found and fixed:** on mobile QCM Results, the
  "Points à revoir" snippet was ellipsis-clipped with no access mechanism → the
  row is now a jump-anchor to the question's full detail card (`#result-{id}`)
  plus `title` tooltip. Re-tested: `[HAS-ACCESS]`.
- Full-page screenshots at both viewports across the audited pages showed no
  horizontal overflow (0px everywhere) and no clipped text without access.

### 4.17 `GET /api/progress/qcm-stats` — ✅ new this session
Runs on every profile-page load, so everything is a DB aggregation (counts via
Prisma, durations via one raw `SELECT MAX/AVG(EXTRACT(EPOCH FROM
completed_at - started_at))`), sequential awaits, no application-layer loops.

Returns: `sessionsCompleted, totalQuestionsAnswered, correctCount,
incorrectCount, accuracyRecent20, mockExamsCompleted,
longestSessionDurationSeconds, averageSessionDurationSeconds, streakRecord`.
`accuracyRecent20` uses the same auto-gradable gate as `/readiness` (QCM/QCS in
completed sessions only) so the surfaces can't disagree.

Current live values — `heavy@hamame.dz`:
```json
{"sessionsCompleted":50,"totalQuestionsAnswered":150,"correctCount":82,
 "incorrectCount":18,"accuracyRecent20":85,"mockExamsCompleted":0,
 "longestSessionDurationSeconds":840,"averageSessionDurationSeconds":840,
 "streakRecord":61}
```
(Math cross-checked: 82+18=100 graded = 2×50 sessions; 50 QROC correctly
excluded; 840s = seeded 14-min durations; recent-20 = 17/20 = 85%.) `norole@
hamame.dz` returns all zeros / `null` accuracy. Frontend: the profile page's
"Statistiques QCM" grid and the hero Précision card now consume this endpoint
instead of approximating from `/api/progress/me`; two new cards (Examens blancs,
Durée moyenne) surfaced.

### 4.18 Badge shelf on `/profile` — ✅ new this session
`web/src/components/BadgeShelf.tsx` — horizontal-scroll shelf (cannot reflow the
page at any collection size), per-criteria-type SVG icon, name, "Obtenu le …"
date, loading skeletons, empty state **"Aucun badge pour l'instant."** Wired to
`GET /api/badges/me` (earned only — the catalog endpoint also returns two
`verify-push` test badges that must not render on a profile). Browser-verified:
heavy account shows its 3 badges; `norole@hamame.dz` shows the empty state.
This closes the "badges exist but nothing displays them" gap.

### 4.19 `POST /api/auth/change-password` — ✅ new this session
In `auth.routes.ts` (per-route `requireAuth` — that router is otherwise
pre-auth). Body: `currentPassword` (min 1), `newPassword` (min 8 — same rule as
register/reset). bcrypt-verifies the current password; **every failure mode
returns the same generic `400 PASSWORD_CHANGE_FAILED`** (anti-enumeration,
mirroring login); malformed hash treated as mismatch, not a 500. Does **not**
invalidate existing tokens (unlike reset-password) — no forced re-login, verified
live: a pre-change token still authenticated `/api/users/me` after the change.
Settings page card re-enabled (was `opacity-60` "Bientôt disponible"): three
fields, client-side match/length checks, `role="alert"` error line, success
toast. **Full cycle re-verified live this session:** wrong current → generic
400; correct → 200; login with the new password → 200; original password
restored afterward → login 200. (A first browser test caught the form posting
`body` as an object through `apiFetch` — which takes a raw `RequestInit` —
sending `[object Object]`; fixed to `JSON.stringify`.)

### 4.20 Authoring/review workflow — re-verified complete and functional (this session)
No changes were needed; this was a from-source re-confirmation (the previous
session had already verified it). Route inventory, exactly as in the files:

- `POST /api/authoring/lessons` and `POST /api/authoring/questions` — drafts
  (`requireRole("instructor","academic_reviewer")`); question body: `unitId,
  type(QCM|QCS|QROC|CLINICAL_CASE), source(official_exam|hamame_authored|
  ai_generated), difficulty?, bodyRichtext, explanationRichtext,
  options[{bodyText,isCorrect,orderIndex}], clinicalCaseParts[…],
  universityId?`
- `POST /api/authoring/:type/:id/submit` — `draft|rejected → pending_review`,
  ownership-checked
- `PUT /api/authoring/:type/:id` — edit own `draft|rejected` → back to `draft`,
  clears `reviewComment`, options/parts replaced wholesale
- `GET /api/authoring/me/stats` — per-status counts (any authenticated user)
- `GET /api/review/queue?page=&limit=` — pending lessons+questions merged,
  `createdAt`-sorted, paginated, `requireRole("academic_reviewer","admin")`
- `POST /api/review/:type/:id/approve` — sets `reviewedBy/reviewedAt`, clears
  `reviewComment`; lessons also flip `currentVersionId` (go live); fires
  best-effort AI explanation generation
- `POST /api/review/:type/:id/reject` — requires `reviewComment: min(1)`
- Lifecycle: `draft → pending_review → approved | rejected`, rejected → edit →
  resubmit. BR-2 downstream enforcement unchanged (`question-filters.ts`).
- **Full lifecycle smoke-tested live this session** (create 201 → submit 200
  `pending_review` → queue contains it → reject 200 + comment → edit 200 back to
  `draft` + comment cleared → resubmit → approve 200 + `reviewedBy` set; test
  question deleted, DB restored).
- **Two minor gaps, re-confirmed still accurate this session (not since fixed):**
  1. No `GET` list of an author's own drafts — `router.get` in
     `authoring.routes.ts` matches only `/me/stats`; everything else is
     aggregate counts.
  2. No `submittedAt` column on `lesson_version`/`question` (0 grep matches in
     `prisma/schema.prisma`) — the queue sorts by `createdAt`, so a long-lived
     draft resubmitted long after creation sorts old.

### 4.21 Git initialized — ✅ new this session (first VCS this project has had)
See Section 0 for the full setup. Baseline: commit `7912c78`, 175 files,
`.gitignore` audited so no `.env`/credentials/node_modules/logs/tmp scripts are
tracked (`docs/Hermes-Setup.exe` deliberately excluded as a 7.9 MB binary; it
remains on disk untracked). Going forward: commit at session start, commit after
each completed task — future sessions can be diffed and reverted instead of
reconstructed from memory. The baseline has already paid for itself once (restored
five docs files that vanished from disk mid-session).

### 4.22 Heavy-content test account — ✅ new this session
`prisma/seed-heavy.ts` (run: `npx tsx prisma/seed-heavy.ts`; idempotent — wipes
and recreates only its own data). Creates `heavy@hamame.dz` / `testpass123`:
50 completed sessions (scores 28–100 over ~60 days), 150 session-questions with
150 attempts (2 gradable + 1 QROC per session), 45-day current / 61-day longest
streak, 3 earned badges (criteria shapes matching `badge-awards.ts`), 12 notes
including deliberately overlong titles, 1 progress row. Purpose: stress-testing
Dashboard/Profil/Results at realistic volume. Verified under load: no horizontal
overflow, no inaccessible truncation (after the Section 4.16 results-page fix),
activity feed capped at 5 items, all stat cards render correctly. Current DB
state re-confirmed this session (50/150/3/12/45/61 — see Section 7 table).

---

## 5. Frontend — role-awareness + current state

- Role-gated links ("Author Content", "Review Queue") tested in a real browser in
  an earlier session: elevated account sees both, no-role account sees neither,
  direct navigation to `/authoring` or `/review` as no-role renders a clean
  permission message. Backend `requireRole` remains the real boundary. Carried
  forward (not re-tested this session; nothing in the role middleware changed).
- **`http://localhost:3001/` is still the unmodified create-next-app scaffold
  page** — re-confirmed this session (Next.js logo/template markup in
  `web/src/app/page.tsx`). Real pages start at `/login`, `/dashboard`, etc.
- The old doc had a duplicated "Section 5" header (two consecutive
  `## 5. Frontend` sections — an editing artifact). Fixed here; content of both
  is preserved above and below.
- Post-Task-8 state: all primary pages pass axe with 0 violations at desktop and
  mobile widths; the design tokens live in `web/src/styles/tokens.css`
  (`--color-text-tertiary: #7a88b0`, axe-verified ≥4.5:1 on its surfaces).

---

## 6. PRD / MBset competitive analysis — carried forward

The MBset gap analysis (Section 6 of the old doc) and the `[MBset-inspired]` PRD
edits are unchanged. **Hamame was behind MBset in exactly one category — AI** —
and the AI infrastructure (4.12/4.14) is built but still paused on the API-key
decision. Spot-check this session: `docs/hamame_prd_updated.md` exists in the
repo; **`MBSET_GAP_ANALYSIS.md` does not** — the old doc references it (its
Section 10 lists it as part of the handoff bundle) but it is **not in the
repository** (probably lived only in the abandoned Desktop copy or an outputs
folder). If the analysis matters going forward, it needs to be recovered or
declared lost.

---

## 7. Test accounts & credentials (⚠️ several stale claims corrected)

| Account | Password | Roles (verified via DB this session) | Faculty / Year | Notes |
|---|---|---|---|---|
| `hamamebouchareb@gmail.com` | ✅ **`NewTestPass123!` — FIXED and verified 2026-09-01.** Root cause was the dev-mode `forgot-password`→`reset-password` token-leak path; no source code changes were required. Verified via two independent raw logs: `docs/verification/auth-fix-verify-raw-1788269804195.log` (DB password-hash change confirmed, reset token cleared, session/stats invariants preserved — 9 sessions, 8 completed, avg 22.32, identical before/after) and `docs/verification/auth-fix-verify-jwt-recheck-1788291898672.log` (two independent login calls returning distinct `iat` values — 1788291925 vs 1788291929 — ruling out a cached/replayed response). No longer broken; no workaround needed going forward. | student_free, **moderator**, instructor, admin, academic_reviewer (⚠️ old doc listed 3 roles; `moderator` has since been added) | Medicine / Year 1 | This is the real account. Login now works normally — no workaround needed. |
| `heavy@hamame.dz` | `testpass123` | **none** (not even `student_free` — created directly by `seed-heavy.ts`) | Medicine / Year 1 | **NEW.** Heavy-content QA account: 50 completed sessions, 150 attempts, streak 45/61, 3 badges, 12 notes. Recreate anytime with `npx tsx prisma/seed-heavy.ts` (wipes + recreates only its own rows). Used for volume/performance testing. ⚠️ **Also now holds an active premium `Subscription`** (granted by this session's activation-code redemption test — see Section 2A). Re-running `seed-heavy.ts` may or may not clear this; not verified. |
| `norole@hamame.dz` | `testpass123` | ⚠️ **`student_free` — no longer role-less** (old doc said "none (deliberately)"; drift predates this session) | Medicine (year null) | Still the negative-permission workhorse for role-gated endpoints, but it is no longer literally role-less — keep that in mind when testing "no role" paths. |
| `seed-author@hamame.dz` | (random — not loggable) | academic_reviewer, admin, instructor | none | Seed fixture; password is `crypto.randomBytes`, unknowable by design. |
| Test Student Two — `student2@hamame.dz` (`e6ec77e4-f56d-431d-b9b2-e3ba8f474601`) | n/a | student | Medicine / Year 1 | Leaderboard fixture; 1 completed session. Re-confirmed in DB this session. |

DB snapshot this session: 24 users; 9 questions (**8 approved + 1 pending** — the
old doc-era "5 questions" has grown from later testing); 7 lessons; 5 badge
catalog rows; both promo codes expired with 1 redemption each; exactly 2
universities. Known deliberate artifacts carried forward: heavy seed data, expired
promo codes + redemption rows, the two universities, faculty/year assignments on
test accounts.

---

## 8. Reference: earlier-session context (still accurate)

- **Soft-delete account policy:** `DELETE /api/users/me` → `status: 'deleted'`,
  PII scrubbed, password invalidated, row + FKs intact. Full reasoning in
  `docs/hamame-user-deletion-policy.md`.
- **API contract deviations:** authoring/review routes use the generic
  `:type` param pattern (`lesson | question`), not literal paths; reject body
  field is `reviewComment`, not `comment`. Re-confirmed from source this session.
- **`requireRole` is the security boundary** for authoring/review/moderation/
  admin groups — unchanged.
- **Only `planned` faculties are hidden;** university scoping is layered (null =
  global), never `{ in: [null, id] }` (NULL semantics match nothing) — see
  `src/lib/university-scope.ts`.

---

## 9. What's genuinely left (in priority order)

### 9.0 New tracked initiative (2026-09-02): MedSparkDZ live gap analysis

A fresh, Playwright-based authenticated crawl of the live MedSparkDZ product
(not the older static/webfetch-only audits) produced
`docs/MEDSPARKDZ_COMPLETE_GAP_ANALYSIS.md` — 37 meaningful gaps (9 MISSING,
19 PARTIAL, 5 DIFFERENT, 4 UNCLEAR), with 3 CRITICAL + 8 HIGH items, a full
route inventory (42 probed, 16 live), and a 4-phase build roadmap. This
supersedes the August audit PDFs where they conflict (e.g. `/revision`,
`/pricing`, `/resources`, `/lessons` are confirmed 404 live on MedSparkDZ,
contradicting earlier assumptions). This is now the active backlog for
Hamame/MedSparkDZ parity work, tracked phase-by-phase below.

**Phase 1 (CRITICAL) — QCM session-builder depth — ✅ DONE, verified in two
rounds (2026-09-03/04).**

*Round 1 — multi-select + live counts + source filter:*
`GET /api/questions/counts` built (reuses `buildQuestionWhere`; returns
`total`/`byUnit`/`byModule`). `SessionBuilder.tsx` unit `<select>` replaced
with a checkbox list (count badges, Toutes/Aucune, "N sélectionnée(s)"), a
live "N questions disponibles" counter that disables Start at 0, and the
existing `source` enum wired to real (not invented) labels — MedSparkDZ's
"Externat/Résidanat" terms were deliberately NOT used since they don't exist
in Hamame's schema; only `hamame_authored` currently has data, so most source
buckets correctly show 0 until official-exam-sourced content exists.
Backend `POST /api/sessions` needed no change — `moduleIds[]`/`unitIds[]`
array support already existed, confirmed by code read rather than assumed.
Verified via `docs/verification/builder-depth-verify-raw-1788559141.log`: a
real 2-unit session created through the UI (`distinct_units: 2` in the DB),
a real 0-result/disabled-start state under `source=Examen officiel`, and a
clean fixture-then-cleanup cycle back to the 8-approved baseline.
**Known, documented limitation (not a bug):** unit multi-select is scoped to
units within ONE already-selected module — a student cannot currently
multi-select units spanning two different modules in one session. This
matches MedSparkDZ's own wizard flow as observed in the original Playwright
spot-check (year → one module → multi-select within it). If MedSparkDZ is
later found to also support cross-module selection somewhere, closing that
gap would need `moduleIds[]` (plural) state in the builder — the backend
already accepts arrays, so this would be a frontend-only change if ever
needed.

*Round 2 — exam-sitting taxonomy + past-exam picker + period filter:*
Taxonomy decision made deliberately light-weight: two new nullable columns
directly on `questions` (`examYear INT NULL`, `sittingLabel TEXT NULL`) —
NOT a separate `exam_papers` entity, and NOT folded into the `source` enum
(sitting metadata and authorship provenance are different concerns). Chosen
because the past-exam picker's actual downstream behavior was never fully
confirmed live on MedSparkDZ (only the wizard's early steps were verified in
the original audit); a heavier schema investment wasn't justified. Migration
`20260101000019_add_question_sitting_columns` applied via the pooler-safe
`migrate diff` + `migrate deploy` pattern (not `migrate dev`), confirmed via
raw `information_schema` output. `buildQuestionWhere` extended once with
`examYear`/`examYearFrom`/`examYearTo`/`sittingLabel`, which automatically
propagated to counts, session creation, and the question-list endpoint — no
separate selection-query change needed, same pattern as Round 1's array
support. The `sittings` breakdown in the counts response was verified to
respect faculty/university scoping via a real raw-SQL probe (hidden
Dentistry faculty → `sittings: []`; Medicine → the tagged pair), not just
assumed. Builder UI got an "Examen passé" section (year + sitting dropdowns,
DB-driven options only, never hardcoded) and a period `De`/`À` range filter.
Verified via `docs/verification/sitting-depth-verify-raw-1788606856.log`:
real zero-state on live untagged data (7/0 questions, disabled start), real
nonzero state and a real UI-submitted session against temporarily-tagged
fixtures (`examYear: 1900, sittingLabel: 'VERIFY-SITTING'` — deliberately an
implausible year so any cleanup failure would be immediately obvious rather
than silently corrupting a plausible-looking real sitting), and full cleanup
back to baseline (8 approved, 0 tagged, `sittings: []`).
**Process note for future rounds:** this task's fixtures were real approved
question rows (tagged then reverted), not dedicated throwaway rows like
Round 1's. Revert was confirmed sound via a supplementary post-hoc audit
(child `question_options` rows intact 4/4 and 4/1, unrelated columns and
`created_at` unchanged, table-wide status/type aggregates identical to
pre-task baseline) — accepted, but future tasks that temporarily mutate real
rows should snapshot the full row *before* mutating, not reconstruct
soundness after the fact.
**Explicitly deferred, not part of Phase 1:** a genuine papers-as-first-class-
entity model (browsable list of past papers, mock-exam-from-a-real-paper
mode) — only revisit if that becomes an actual desired feature, not just a
filter.

**Phase 2 (CRITICAL) — Answer feedback: community percentages + comment
toggle — ✅ DONE, verified 2026-09-04.**

*Spec confirmation:* independently confirmed live TWICE — the original
Playwright spot-check (2026-09-02, session `151569d9-c76f-4b6e-bdae-
14cb1a9c68dc`, question 2/5), then re-confirmed fresh (2026-09-04, a
different question, "Q3") immediately before building, per the standing
"always navigate live before building" rule. Mechanics held exactly across
both checks: inline right-aligned mini-bar + percentage per option
(percentage = community pick-rate, NOT correctness — a correct option can
show 0% on a small sample, and this is expected, faithfully replicated
behavior, not a bug); green border/badge/tint for correct; red/pink border +
grey badge for incorrect; a "voir le commentaire" pill (replaces Vérifier
post-answer) expanding a panel with per-option verdict pills + explanation
text, plus a general explanation. Two minor differences noted on the fresh
check, correctly NOT copied: (a) MedSparkDZ's Vérifier is clickable with
nothing selected and still reveals stats — Hamame deliberately keeps its
existing disabled-until-selected behavior instead, since it's better UX, not
a gap to close; (b) sitting chips render as two chips on some questions
(content-driven, not a mechanics difference).

*Built:* `GET /api/questions/:id/answer-stats` (auth required) returns
strictly `{questionId, attempts, options:[{optionId, percentage}]}` — no
user/session/timestamp data, gated to approved + faculty-visible +
university-scoped questions (indistinguishable 404 otherwise), 400 for
QROC/clinical-case types (percentages only make sense for QCM/QCS). Dedup
rule: newest attempt per `session_question`, matching how scoring itself
works. Small-sample handling: 0 attempts → empty `options: []` (UI hides the
whole block); ≥1 attempt → whole-number percentages plus an always-visible
"Basé sur N réponses d'apprenants" caption, so small samples are labeled,
never silently misleading. Both practice and exam attempts count toward the
denominator (stated explicitly in code). `correctOptionIds` added to the
submit response, **practice mode only** — exam mode deliberately gets
neither percentages nor the comment toggle, since showing correctness before
an exam is graded would leak the answer key.
Frontend: percentage display + "Basé sur N réponses" caption + collapsible
comment toggle wired to the *existing* `explanation_richtext` field (no
fabricated explanation text); toggle correctly absent when a question has no
explanation, confirmed live against a real question with its explanation
temporarily nulled (snapshot-before-mutate, then restored verbatim — see
process note below).
Verified via `docs/verification/answer-stats-verify-raw-1788609899.log`:
real endpoint output against a pre-existing 60-attempt question (percentages
traced back to raw pick-counts on request — 3+5+4+2=14 real picks across 10
non-empty attempts + 50 empty-selection attempts = 60 denominator,
reproducing 5/8/7/3% exactly — the low shares are genuine seeded history,
not a computation error); a dedicated fixture question proving deterministic
50/50/0/0 math; live DOM proof of exam-mode neutrality (correctly
distinguishing a false-negative capture taken mid-request from the correct
re-capture after the response settled); live DOM proof of the no-explanation
state; and full cleanup (fixture rows, sessions, and the temporarily-nulled
explanation all confirmed restored, baseline 8-approved unchanged).
**Process note honored:** this task correctly snapshotted the real
question's explanation text *before* nulling it (per the process note added
after Phase 1 round 2), and confirmed the restore was byte-identical to the
snapshot — this is the pattern to keep using for any future task that
temporarily mutates real rows.
**Bug caught and fixed mid-task, worth knowing about:** the attempt-count
caption initially rendered a missing-space concatenation
("1 réponsed'apprenants"); caught from its own screenshot, fixed, and
re-proven correct in a later capture ("3 réponses d'apprenants") rather than
just asserted fixed.



**Phase 3 (HIGH) — history, ranking, library — ✅ DONE, all four items
verified 2026-09-05.** Live re-check before building (per the standing rule)
found MedSparkDZ's state had drifted since the original crawl: a real
scheduled `Simulation Résidanat` now exists where the gap analysis recorded
none (informational only, doesn't affect this phase), and
`/qcm/hypertombables` rendered its header/filters but no ranked rows this
pass — its subtitle ("les cours et dossiers les plus fréquemment tombés au
résidanat") was the key evidence used below.

1. **Session history** (`/historique`): new **read-only** `GET /api/sessions`
   (paginated, newest-first, per-session + per-unit answered/total/correct
   with unit/module/year/faculty labels; correctness = latest attempt, same
   rule as scoring). No schema change — confirmed no list route existed
   before (only create/detail/answers/hints/submit/results). Verified with
   real fixture sessions (one completed 2/2, one left open 1/2), both
   showing correctly in the DOM with working Continuer/Revoir actions and
   internally-consistent stats (correct ≤ answered ≤ total, checked
   explicitly).

2. **Leaderboard** (`/classement`): engine proven live BEFORE any UI was
   built (real curl output first, not assumed from docs). Cohort scoping
   resolved a real open question: pairs derive from `User.groupBy(faculty,
   year)` at snapshot-generation time (sessions themselves carry no
   faculty/year) — independently confirmed via a raw query finding 2
   qualifying users in Medicine/Year 1, matching 2 snapshot rows and 2
   leaderboard entries exactly. Rules modal describes Hamame's *actual*
   mechanics (rolling 30-day average of completed+scored sessions, replace-
   not-append snapshots, privacy note that only rank/score/name are ever
   shown) — explicitly NOT MedSparkDZ's point-increment model, since that's
   not how Hamame's engine works.

3. **Notes tags/favorites/search** (`/notes`): migration
   `20260101000020_add_note_tags_favorite` (`tags TEXT[] DEFAULT
   ARRAY[]::TEXT[]`, `is_favorite BOOLEAN NOT NULL DEFAULT false`), using
   the exact 6-tag taxonomy from the gap analysis (difficile/facile/
   important/a_reviser/compris/piege) — enforced server-side, proven via a
   real 400 rejection on an invalid tag value, not just client-side
   validation. Search, per-tag filter, and favorites-only filter all
   verified against real fixture notes.

4. **"Couverture par module"** (`/couverture`) — deliberately NOT named or
   framed as MedSparkDZ's "Hypertombables," because the two measure
   different things: MedSparkDZ's live subtitle confirms it ranks
   **exam-appearance frequency** (which Hamame has no exam-paper corpus to
   replicate yet — the sitting-taxonomy columns added in Phase 1 are the
   future bridge for this), while this feature counts **approved questions
   per module** (bank coverage). The UI's live-rendered subtitle states this
   distinction explicitly in French rather than implying parity with a
   metric Hamame doesn't actually compute — verified this disclaimer
   renders verbatim in the DOM, not just exists in source.

Verified via `docs/verification/phase3-verify-raw-1788616572.log`. One noted
gap in the log, disclosed rather than hidden: the fixture "open" session's
raw UUID was lost to console truncation before it could be captured (the row
itself, its stats, and its confirmed deletion are all still proven via other
means in the log — only the bare id string is unrecoverable). No real
question/unit rows were mutated this round (only sessions/attempts/notes,
all fixtures, all deleted); cleanup confirmed via explicit before/after
counts (2 sessions + 2 notes pre-cleanup → 0/0/0/0 post-cleanup, re-confirmed
by a fresh post-cleanup API call from the test account itself, not just a DB
query).

**Phase 4 (MEDIUM/LOW) — account/access polish — ✅ DONE, all six items
verified 2026-09-05.** OAuth and EN/FR remain deliberately untouched
(making the pre-existing `uiLanguage` field settable via preferences is not
toggle UI — no sign-off needed for that, but no toggle UI was built either).

1. **Reset-password confirm page** (`/reset-password?token=`): new frontend
   page, backend already existed. Verified with a real single-use 64-char
   token (traced by first/last 8 chars, not the full value) through a
   complete cycle: invalid-token error state → real reset → login with new
   password (real JWT returned) → restored via the settings UI → login with
   the original password confirmed successful. Not asserted — proven at
   every step.

2. **Change-password — verify-only, correctly NOT rebuilt.** Discovered
   during this task's own findings-report that this was already fully built
   and verified in an earlier session (backend + settings card). Confirmed
   generic-400-with-no-mutation on wrong current password, then confirmed
   the existing UI genuinely works via a full change→restore→login cycle.

3. **`PUT /users/me/preferences` 501 stub → real persistence.** Zero
   migration needed — `User.uiLanguage/theme` and a `NotificationPreference`
   table already existed. Collision-checked against the separate
   `push_preferences` table (different table, different columns, confirmed
   via `information_schema`, not assumed) — no conflict. One real subtlety
   caught: a mirror-restore left a functionally-equivalent-but-not-
   byte-identical row behind (`enabled: true` vs. the true pre-state of zero
   rows) — caught and explicitly deleted for an exact restore, not just a
   "close enough" one.

4. **Friends search** (`GET /users/search`, new): confirmed via schema read
   that Hamame has no `username`/`handle` column (unlike MedSparkDZ's
   `@username` search) — exact-email-or-name-prefix (≥3 chars, cap 10,
   `id`+`fullName` only, self and soft-deleted excluded) is the stated,
   honest substitute, not a silently narrower feature. UI verified with a
   real search → send → "Demande envoyée" → confirmed real `pending`
   friendship row created → deleted.

5. **Révision-due dashboard widget**: surfaces `GET /reviews/due` count
   only. Explicitly checked — grepped both the backend route file and all
   of `web/src` for "efficacy" and found zero hits anywhere in the
   codebase, so the widget does not invent a stat that doesn't exist.
   Verified nonzero (1 due) and zero ("À jour") states live.

6. **Drive breadcrumbs + PDF viewer**: resource detail endpoint extended to
   carry faculty/year *names* (not just IDs) so breadcrumbs need no extra
   round-trip; embed gated to actual PDF file extensions only (regex-tested,
   non-PDF types keep download-only). Verified live with real breadcrumb
   navigation and a rendering iframe.

Full evidence in `docs/verification/phase4-verify-raw-1788630772.log`.
**Known outstanding item, not part of this phase, flagged twice now:** the
`docs/HAMAME_MASTER_HANDOFF.md` vs `HAMAME_MASTER_HANDOFF (1).md` duplicate
from an earlier browser-download mix-up is still unresolved — see the fix
command noted after Phase 2's close-out. Worth doing before it causes a
future session to read the wrong file.

**Phase 5 (MEDIUM/LOW) — player polish + history mode — ✅ DONE, all seven
items plus two diagnostics verified 2026-09-05.**

1. **P4 QST rail + progress %**: horizontal numbered-button strip (adapted
   from MedSparkDZ's sidebar layout to fit Hamame's single-column design,
   not a blind copy), wired to real current/answered session-question
   state, with a live percentage.
2. **P5 course + sitting chips**: chips render from real `unitName`/
   `moduleName`/`examYear`/`sittingLabel` fields already added in Phase 1 —
   no schema change. Untagged questions correctly render no chip at all
   (verified live: nulls → absent, not a placeholder).
3. **P7 report/flag wiring**: backend endpoint confirmed pre-existing via
   both a code read and a real live `201` (not assumed), UI maps
   MedSparkDZ's 3 error-type categories to Hamame's existing
   `reason`/`severity` shape.
4. **P12 simulations history (cheap half only)**: added `?mode=` to the
   Phase 3 history endpoint (`practice`/`exam`, 400 on anything else) plus
   an "Examens" tab on `/historique`. The "big half" (a real scheduled-
   simulations system) was explicitly NOT built — MedSparkDZ now has a live
   scheduled `Simulation Résidanat`, which is new information worth a
   product decision, not a default build (see below).
5. **M8 strike-through toggle**: pure local UI state, clears on selecting
   the struck option (forgiving), disabled after submit.
6. **P15 activation hint**: correctly re-scoped after discovering
   MedSparkDZ's live hint is generic entry-point guidance, not a real
   pre-redemption lookup — building an endpoint that reveals what a code
   unlocks before it's consumed would create a code-validity oracle
   (security downside for a cosmetic parity win). Shipped: static guidance
   copy only, no new backend.
7. **P16 rank/stats colocation**: added a rank chip to the profile page
   sourced from the existing Phase 3 leaderboard, gracefully omitted when a
   profile has no faculty/year (matches `norole`'s existing behavior
   elsewhere).

**Diagnostics only, nothing built from either:** MedSparkDZ's mobile view no
longer has a fixed bottom tab bar (confirmed live — closes the old P19
question as **N/A due to live drift**, not a Hamame gap). The MedSparkDZ
theme toggle was re-tested **headed** (not headless) and is confirmed
genuinely broken on their live site (identical background/class
before/after click) — informational only, not a Hamame item.

**Two things disclosed rather than smoothed over:** (1) the first M8 test
harness used a `button[aria-pressed]` selector that also matched the
unrelated "Marquer pour revoir" toggle, producing a false negative on a QROC
question — root-caused, the harness (not the app) was wrong, fixed and
re-proven; (2) a full-project backend `tsc --noEmit` timed out twice with no
output before a captured run confirmed `exit 2` with errors **only** in the
pre-existing, already-known `verify-resources-raw.ts` script — all five
files touched this phase are type-clean. This confirms the **backend**
only; frontend (`web/`) type-safety still rests on zero-page-error browser
runs, not an independent `tsc` pass — worth tightening in a future pass.

One test artifact this round was a full disposable **account**, not just
fixture rows — created via real browser signup (never a SQL insert) and
removed via the platform's own `DELETE /users/me`, confirmed to follow the
documented soft-delete policy exactly (status → `deleted`, email scrubbed to
`deleted-<uuid>@hamame.invalid`, row persists). Side-effect audit confirmed
zero subscriptions/payments/activation-code redemptions from this account,
and the one `redeemed` code in inventory predates this task by 12 days,
untouched.

Full evidence in `docs/verification/phase5-verify-raw-1788701549.log`.
**All CRITICAL, HIGH, MEDIUM, and LOW items from the original gap analysis
are now closed.** What remains is explicitly gated on product decisions, not
default build work: Google OAuth (M9), an EN/FR UI toggle (P14), a real
scheduled-simulations system (P12, upgraded from "deferred" to "worth
deciding" now that MedSparkDZ has a live example), and whether Hamame's
session builder should support cross-module unit selection (only if a fresh
live check finds MedSparkDZ actually does this somewhere the original
spot-check didn't cover).


   Root cause was the dev-mode `forgot-password`→`reset-password` token-leak
   path; no source changes needed. See Section 7 for the two verification
   logs. Login now works normally with `NewTestPass123!` — no workaround
   required for future QA against this account.
2. **Judge the AI output for both AI features, once the key exists** (unchanged):
   `npm run ai:backfill-explanations -- --dry-run` (read the 3 explanations for
   medical accuracy) and `npm run verify:hints:ai` (~8 Haiku calls). Add
   `ANTHROPIC_API_KEY` to `.env` only when doing this — still absent, confirmed
   via server log this session.
3. **The one real remaining PRD/MVP compliance gap, deliberately deferred by
   choice:** automated self-service payment (CIB/SATIM-class Algerian gateway).
   Manual-assisted flow remains. This is a recorded product decision, not an
   oversight — disproportionately painful integration for a solo portfolio
   project; revisit only if moving toward a real launch.
4. **Small, real, newly-tracked gaps (not urgent):**
   - `GET` list of an author's own drafts (only aggregate stats exist today —
     re-confirmed this session)
   - `submittedAt` column for the review queue (currently `createdAt`-sorted —
     re-confirmed this session)
   - `PUT /api/users/me/preferences` still 501 (the working preference center is
     push-only, `/api/push/preferences`)
   - `GET /api/progress/readiness` has no recommended-next-session field
   - `GET /api/ai/credits` has no low-balance flag (client currently computes
     the <20%-of-allowance threshold itself)
   - ~~Hamame Drive / "Spark Drive" has no frontend~~ — **DONE, see Section
     2D.** Backend + frontend built from scratch (no backend actually existed
     before this) and independently verified via raw SQL, HTTP, and DOM
     evidence.
5. **Other PRD Version 2 items not yet built:** AI Study Assistant (chat), AI
   Note Maker, Answer Locator (needs semantic search), FSRS-class spaced
   repetition (SM-2-inspired interim stands), offline download for Premium.
   **⚠️ Old-doc list corrected:** "push notifications + preference center" and
   "predictive exam-readiness indicator" were listed as unbuilt but **are built**
   — push subscriptions + preference center + daily reminder job ship today
   (migration 15, `/api/push/*`, settings toggles), and
   `GET /api/progress/readiness` powers the dashboard/profile readiness cards.
6. **Cosmetic, carried forward:** `@types/node-cron` redundancy was fixed in the
   cosmetic pass; the "undocumented pre-existing flashcards work" lesson has now
   surfaced a third time (migration #10 missing from the old doc's table) —
   keep assuming nothing about "clean builds."

**Explicitly out of scope by decision (not oversights):** live real-time
"Challenge" infrastructure (websockets), teams/groups, native mobile apps,
community discussion threads, institutional pilot, multilingual AI-narrated
audio — and the payment gateway above until launch becomes real.

---

## 10. Files in this handoff bundle

- `docs/HAMAME_MASTER_HANDOFF.md` — this document (supersedes all earlier versions)
- `docs/hamame_prd_updated.md` — PRD with `[MBset-inspired]` and
  `[MedSparkDZ-confirmed]` additions (present in repo; FR-65/BR-18 added this
  session, see Section 2A)
- `docs/hamame_api_contract.md` — updated this session: Activation Codes
  endpoints, Resources ("Hamame Drive") endpoints, session-creation `sort`/
  `examMode`/`showStats` params
- `docs/verification/` — raw closeout evidence for Part 1 session-builder
  (sort/examMode/showStats) + study-timer screenshots: see
  `docs/verification/README.md`, `sort-by-year-raw-*.log`,
  `opencode-shots/`. Section 2C's live-DOM captures (empty states, form
  errors/success, nav-consistency proof across 6 routes) were produced the
  same way but **not yet confirmed saved to this folder** — save them here
  before the next session if they aren't already, per this project's own
  "raw evidence must persist on disk, not just in chat" standard.
- `web/src/lib/nav.ts` — **NEW this pass.** Single source of truth for
  `PRIMARY_NAV`/`SECONDARY_NAV`, consumed by `web/src/components/AppHeader.tsx`.
  Do not reintroduce per-route `HEADER_NAV` arrays — that was the exact bug
  fixed in Section 2C.
- `docs/hamame_database_schema.md` — updated this session: `activation_codes`
  and `resources` tables added
- `MEDSPARK_CROSS_REFERENCE_AND_ROADMAP.md` — NEW this session; not yet
  confirmed committed to the repo — verify `git log --follow -- <path>` before
  assuming it's tracked
- `MBSET_GAP_ANALYSIS.md` — ⚠️ **referenced by the old doc but NOT present in the
  repository** (see Section 6) — recover or declare lost
- Older reference docs in `docs/` (`hamame-user-deletion-policy.md`,
  `hamame_mvp_broad_scope_v2.md`) remain valid background, superseded by this
  document wherever they conflict. The original `HAMAME_HANDOFF.md` is not in the
  repo either — its content is fully absorbed here.

**Carried-forward-unverified register** (honest accounting, per the
re-verification discipline): Defender exclusion status; AgentRouter wallet
state; Cursor Pro subscription status; leaderboard ranking math and friends flow
(not re-tested; code present); promo grant/extend math (artifacts confirmed, math
not re-run); flashcard dedup specifics; SM-2 formula internals (file unchanged);
4.11 cosmetic pass contents. Everything else in this document was checked against
the live codebase, database, or API during this update.
