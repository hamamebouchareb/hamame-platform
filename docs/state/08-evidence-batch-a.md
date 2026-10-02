# 08 — Evidence batch A (run 2026-10-02, pooler responding)

Purpose: one file holding the raw outputs behind the file_url fix and the
resources-drift question, so the README, the history file, and reality agree.

## HEAD + tree

- `git log -1 --format=%H` → `9eb8361582fe12f6e6863b1ac871b6a33c9b6f51`
- `git status --short` → clean (no output).
- `git show --stat 9eb8361` → `prisma/schema.prisma | 2 +-` (one line:
  `fileUrl String` → `fileUrl String @map("file_url")`).
- Sizes: `docs/hamame_database_schema.md` 20,682 bytes,
  `prisma/schema.prisma` 45,239 bytes (was 45,224: +15 fits the one line).

## Full migrate diff (live DB vs schema, exit 0)

```
-- DropForeignKey
ALTER TABLE "resources" DROP CONSTRAINT "resources_added_by_fkey";
-- DropForeignKey
ALTER TABLE "resources" DROP CONSTRAINT "resources_faculty_id_fkey";
-- DropForeignKey
ALTER TABLE "resources" DROP CONSTRAINT "resources_year_id_fkey";
-- DropIndex
DROP INDEX "resources_faculty_id_index";
-- DropIndex
DROP INDEX "resources_type_index";
-- DropIndex
DROP INDEX "resources_year_id_index";
-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_year_id_fkey" FOREIGN KEY ("year_id") REFERENCES "years"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

No `lesson_attachments` statement (the fix closed it). No column ADD/DROP
anywhere: the drift is constraint/index-level only (FK definitions and
three indexes; note the dropped `added_by` FK is not re-added because the
schema declares `addedBy` as a plain column with no relation). Reads and
writes of resource rows behave identically either way — this cannot fail
the way the missing `fileUrl` column would have. Still excluded from
migrations per the pooler-safe pattern; nothing applied.

## Prior step outputs (from the fix session, same day)

- `npx prisma generate` → client v6.19.3, exit 0.
- `npx tsc --noEmit` → exit 0. `npm run build` → exit 0.
- `prisma.lessonAttachment.findMany({ take: 1 })` → `[]`, exit 0
  (empty table, column resolves; previously would error).
- Before-fix diff contained the extra statement:
  `ALTER TABLE "lesson_attachments" DROP COLUMN "file_url", ADD COLUMN
  "fileUrl" TEXT NOT NULL` — proving live = `file_url`.

## Steps 4–8 (run 2026-10-02; `git show --stat cba9a52` verified all six
claimed files landed; `docs/state/` holds 00–08 as listed)

### 1. Content volume (read-only GROUP BYs, sequential, connection_limit=1)

- YEARS: 15 beta wilaya faculties × 22 each; Medicine(live) 1; Dentistry(planned) 0.
- MODULES: Medicine 1 (Cardiology); everywhere else 0.
- UNITS: Medicine 1 (Cardiac Physiology); everywhere else 0.
- LESSONS_APPROVED (approved current version): Medicine 3; everywhere else 0.
- QUESTIONS: Medicine only — approved QCM 4, QCS 3, QROC 1; pending_review QCM 1.
- RESOURCES: global 1, Dentistry 1, Medicine 2.
- SIMULATIONS: Medicine 1; everywhere else 0.
- PLANS: free 0/null/active; premium 1500/monthly/active.
- SUBSCRIPTIONS: active 4, expired 4.

### 2. Privileged accounts (ids only, no emails)

- `27f52f12-…-d4314aec` active, created 2026-07-12 (BEFORE 2026-09-12 rotation — FLAGGED): academic_reviewer, admin, instructor.
- `b5119037-…-58475839e59` active, created 2026-07-13 (BEFORE rotation — FLAGGED): academic_reviewer, admin, instructor, moderator.
- Role assignments themselves are current rows; the flag is about password age only.

### 3. Connections

- Backend connects from Railway (production), the Vercel express project
  (serverless, transient), and local dev when running — all via the same
  pooler URL. `DATABASE_URL` carries NO query params (no connection_limit,
  no pgbouncer flags — presence check only, values never printed).
- `pg_stat_activity` grouped (succeeded this run — pool healthy):
  empty-app idle 1 + null-state 6, pg_cron scheduler 1, pg_net 1,
  postgres_exporter 1, PostgREST 1, Supavisor active 1 + idle 4 +
  auth_query idle 1. No Hamame-attributed application_name visible.

### 4. Secrets scan (no gh, no gitleaks installed — git-log fallback)

- Tracked env/keys: NONE (no `.env`, `.pem`, `.key`, secrets files tracked;
  `.env.example` holds names only, by design).
- `BEGIN PRIVATE KEY`: zero commits. `AKIA` (AWS): zero. `re_ab` (Resend):
  zero. Full values never printed (hashes + paths only).
- `testpass123`: appears ONLY as prose about the burned value
  (`prisma/seed-heavy.ts:31` comment, `AGENTS.md:138` rotation notice);
  current code reads `SEED_HEAVY_PASSWORD` and aborts if unset. The
  pre-rotation leak into public history is recorded in the handoff; current
  values live out-of-band.

### 5. Ops matrix (how each is done TODAY)

- Issue activation code: API only (`src/routes/activationCodes.routes.ts:243`,
  SupportAgent|Admin). No UI.
- Create resource: SQL/seed only — no route creates resources.
- Create year/module/unit: SQL/seed only — no API, no UI.
- Create simulation: API only (`src/routes/admin.routes.ts:915`, Admin). No UI.
- Assign/revoke role: API only (`admin.routes.ts:595` grant, `:646` revoke).
- Review instructor application: API only (list `:695`, approve `:736`,
  reject `:778`). No UI.
- Resolve report: API only (`src/routes/moderation.routes.ts:181`). No UI.
- Create promo code: API only (`admin.routes.ts:316`). No UI.
- Change faculty rollout: API only (`admin.routes.ts:194`). No UI.
- UI-assisted exceptions (not in the list above): lesson/question authoring
  (`/authoring`) and the review queue (`/review`) — instructors/reviewers
  work in-app; everything admin-shaped is API-only.
