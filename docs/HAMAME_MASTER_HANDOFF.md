# Hamame — Master Handoff (Full History → End of This Session)

**Read this entire document before doing anything else in a new chat.** This
consolidates: the original project handoff, the API contract, database schema notes,
deletion policy doc, and everything built, tested, and fixed across sessions —
including full V1 backlog closure, the V2 features (Sections 4.1–4.14), and the
most recent session's work: **git initialization (first version control this
project has ever had), the Task 6b profile-editing pass, the full Task 8
responsive/accessibility pass with tool-verified contrast ratios, the
`GET /api/progress/qcm-stats` endpoint, the profile badge shelf,
`POST /api/auth/change-password`, the heavy-content test account, and a
re-verification of the authoring/review workflow.** Where this document conflicts
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

---

## 2. Full migration history (16 total — ⚠️ old doc said "14" and its table
listed only 12, skipping `add_flashcards` entirely; all 16 verified on disk and
confirmed applied via `prisma migrate status` this session)

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
| `hamamebouchareb@gmail.com` | ⚠️ **`NewTestPass123!` NO LONGER WORKS** (live-verified: `401 INVALID_CREDENTIALS` this session — password has drifted from the old doc's claim) | student_free, **moderator**, instructor, admin, academic_reviewer (⚠️ old doc listed 3 roles; `moderator` has since been added) | Medicine / Year 1 | This is the real account. **Resetting its password is now more than hygiene — the documented password is wrong.** Dev-mode `forgot-password` returns the raw token in the response body, so it's a 2-minute fix. |
| `heavy@hamame.dz` | `testpass123` | **none** (not even `student_free` — created directly by `seed-heavy.ts`) | Medicine / Year 1 | **NEW.** Heavy-content QA account: 50 completed sessions, 150 attempts, streak 45/61, 3 badges, 12 notes. Recreate anytime with `npx tsx prisma/seed-heavy.ts` (wipes + recreates only its own rows). Used for volume/performance testing. |
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

1. **Reset the real account's password — now urgent, not just hygiene.**
   `NewTestPass123!` no longer works on `hamamebouchareb@gmail.com` (verified
   this session), and the real password is unknown to the project. Dev-mode
   `POST /api/auth/forgot-password` returns the raw token in the response body;
   `POST /api/auth/reset-password` completes it. Two minutes, do it first.
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
- `docs/hamame_prd_updated.md` — PRD with `[MBset-inspired]` additions (present in repo)
- `MBSET_GAP_ANALYSIS.md` — ⚠️ **referenced by the old doc but NOT present in the
  repository** (see Section 6) — recover or declare lost
- Older reference docs in `docs/` (`hamame_api_contract.md`,
  `hamame_database_schema.md`, `hamame-user-deletion-policy.md`,
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
