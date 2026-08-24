# Hamame — Agent Guidance

## Structure

Monorepo with two workspaces:
- **Root** — Express.js + TypeScript backend API (CommonJS, ES2022)
- **`web/`** — Next.js 16 frontend (port 3001, React 19, Tailwind CSS v4)

## Commands

| Scope | Command | What |
|---|---|---|
| root | `npm run dev` | Start API via tsx watch on port 3000 |
| root | `npm run build` | `tsc -p tsconfig.json` |
| root | `npm run prisma:migrate:dev` | Run pending migrations |
| root | `npx prisma migrate deploy` | Apply pending migrations (preferred — pooler has no shadow DB; `migrate dev` does not work) |
| root | `npx prisma studio` | DB browser |
| root | `npx tsx prisma/seed.ts` | Seed/upsert test data |
| web | `npm run dev` | Next.js dev server on port 3001 |
| web | `npm run lint` | ESLint (flat config in `eslint.config.mjs`) |

## Architecture

- **Entry:** `src/server.ts` → `src/app.ts` (createApp) → `src/routes/index.ts`
- **Error shape (all endpoints):** `{ error: { code, message } }`
- **Auth:** Bearer JWT via `src/middleware/auth.ts` (requireAuth, optionalAuth). Token TTL = 7d.
- **Role check:** `requireRole(...names)` middleware — must run AFTER requireAuth.
- **Validation:** Zod schemas via `src/middleware/validate.ts` (validateBody, validateQuery, validateParams).
- **Pagination:** `?page=&limit=` (defaults page=1, limit=20, max 100).
- **UUID params:** Use `uuidParam("name")` from `src/lib/common-schemas.ts`.

## Route implementation status

Most route groups have **real handlers**. Notable remaining stubs:
- `PUT /api/users/me/preferences` — still 501 via `stubHandler`

Real (non-exhaustive — see route files for the full surface):
- `/api/auth/*` — register, login, forgot/reset password, verify
- `/api/users/me` — GET (profile with roles), PUT (partial update; nullable fields — wilaya/fullName/facultyId/yearId/university/universityId — accept explicit `null` to clear), DELETE (soft delete), GET export
- `/api/faculties`, `/api/years`, `/api/modules`, `/api/units`, `/api/lessons` — curriculum tree
- `/api/questions` — filtered list
- `/api/sessions/*` — create, detail, answers, submit, results (streak + badge + review auto-hooks)
- `/api/notes`, `/api/flashcards`, `/api/progress`, `/api/streaks` — notes, flashcards, dashboard, daily goals
- `/api/reviews/*` — spaced-repetition settings / enqueue / due / complete
- `/api/plans`, `/api/subscriptions`, `/api/promo-codes` — monetization
- `/api/authoring`, `/api/review`, `/api/moderation`, `/api/admin` — content pipeline + admin
- `/api/instructor-applications` — apply / approve / reject
- `/api/leaderboard`, `/api/badges`, `/api/friends` — gamification / social

## Database

- PostgreSQL via Prisma ORM. Snake_case DB tables mapped via `@@map/@map`.
- **Seed** (`prisma/seed.ts`) uses fixed UUIDs for idempotent upserts. Run it safely multiple times.
- Seed creates `Medicine` (live) and `Dentistry` (planned/hidden) faculties, plus one lesson + 3 approved questions + 1 pending question.
- Seed grants `instructor`, `academic_reviewer`, `admin` roles to: (1) a seed-author account, and (2) `hamamebouchareb@gmail.com` (only if that account already exists — it is NOT created automatically).
- **Migrations:** use `prisma migrate diff` (offline SQL) + `prisma migrate deploy`. Never `prisma migrate dev` on this pooler (no shadow database).

## Key gotchas

- **User deletion is a SOFT delete** — status flips to `'deleted'`, PII is scrubbed, but the row + all FKs stay intact.
- **Lessons with `currentVersionId = null`** return 404 (no published version).
- **BR-2 validation gate:** Only `status='approved'` questions are visible to students — enforced in `buildQuestionWhere` (`src/lib/question-filters.ts`).
- **Only `planned` faculties are hidden** from the curriculum API. Any rolloutStatus other than `planned`/`beta`/`live` will also be hidden — only `beta`/`live` are considered visible.
- **Per-university scoping (FR-10a) is LAYERED, not siloed.** `Lesson.universityId` / `Question.universityId` null = global (visible to all), a value = that university only, ANDed with the faculty gate. Use the shared `universityScopeFilter` / `resolveViewerUniversityId` from `src/lib/university-scope.ts` — never hand-roll it, and never wrap it in `if (universityId)`: it must apply unconditionally, since guests and students with no university must resolve to global-only, not to "no filter". Never express it as `{ in: [null, id] }` (SQL `IN` uses `= NULL` semantics and matches nothing).
- **`aiEnhancedExplanation: null` is a Prisma validation error** on Json fields. Nullable JsonB must be filtered with `{ equals: Prisma.DbNull }`.
- **QROC / clinical case** answers are NOT auto-graded (isCorrect stays null). Automated grading is a V2 AI feature.
- **Practice mode** reveals isCorrect + explanation immediately; exam mode withholds both until session results are requested.
- **Score computation** excludes non-auto-gradable types from both numerator and denominator. Unanswered gradable questions count as wrong.
- **Streak updates** happen inside the session-submit transaction.
- **Supabase session pooler concurrency:** more than ~10 simultaneous Prisma queries can throw intermittent `P1001`. Prefer sequential `await` over large `Promise.all` on multi-query endpoints.
- **Review-queue / flashcard / user-badge awards** use `INSERT ... ON CONFLICT DO NOTHING` (not catch-P2002) so unique conflicts inside a transaction cannot abort session submit.

## Frontend notes

- **Next.js 16 has breaking changes** from standard Next.js — read `node_modules/next/dist/docs/` before writing code.
- Token persisted in **localStorage** under key `hamame_auth` (not httpOnly cookies — MVP pragmatism).
- API client (`src/lib/api.ts`) reads token from localStorage automatically.
- `AuthContext` (`src/context/AuthContext.tsx`) hydrates from localStorage on mount; use `useRequireAuth()` hook for protected pages.
- API base URL from `NEXT_PUBLIC_API_URL` env var (defaults to `http://localhost:3000/api`).
