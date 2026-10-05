# 13 — Test-data purge plan (PLAN ONLY — do not run; no code, schema, migration, env, or data changed here)

Live baseline this plan was written against (read-only, 2026-10-04):
`users-total=46 users-active=31 users-suspended=0 users-deleted=15
sessions=91 attempts=201 notes=13 user-badges=14 subscriptions=8 payments=5`.
Bank: `questions=9 lessons=7 options=26` (must not move).

## 0. Do deleted users pollute shared statistics today?

- Answer-stats: NO exclusion. `GET /api/questions/:id/answer-stats`
  aggregates attempts via `sessionQuestion → attempt` with no user/status join
  (`src/routes/questions.routes.ts:373-383`) — a deleted account's picks keep
  counting in percentages. Small bank + 201 attempts: purging test accounts
  without touching attempts leaves ghost picks behind.
- Leaderboards: generation excludes deleted users
  (`generateLeaderboardSnapshots.ts:29,50`: `status: { not: "deleted" }`),
  but served rows are precomputed snapshots — rows minted for accounts deleted
  afterwards stay visible until the next daily regen (delete+replace by
  period). Stale, not permanent.
- Progress/readiness/qcm-stats/by-module: per-user endpoints scoped to
  `req.auth.userId` (`progress.routes.ts:39,146,162,180,191`) — no cross-user
  pollution by construction. A deleted account simply stops calling.
- Consequence for the purge: deleting accounts is not enough on its own —
  their sessions/attempts must go too (or answer-stats keeps their picks).

## 1. Safest purge (soft-delete via the platform, never raw SQL)

1. Owner writes the keep-list file (one user id per line,
   `docs/verification/purge-keep-<date>.txt`, committed): owner account(s)
   plus the role-matrix and heavy-QA accounts named in handoff §7. Everything
   else is purgeable — real students do not exist yet.
2. Dry-run first: a script that resolves every non-keep active account, prints
   `id + role names + counts(sessions, attempts, notes, badges)` per account
   and totals, and writes NOTHING. Owner reviews the manifest.
3. Apply per account through the platform's own `DELETE /api/users/me`
   (authenticated as that account — test passwords are owner-held): status
   flips to `deleted`, PII scrubbed to `deleted-<uuid>@hamame.invalid`,
   FK rows stay valid (policy `docs/hamame-user-deletion-policy.md`). No FK
   order to get wrong, no migration, no schema touch.
4. Then remove the orphaned attempts/sessions: the soft-delete keeps
   sessions+attempts rows, and §0 shows answer-stats still counts them. For
   each purged account, delete its `attempt → sessionQuestion → studySession`
   chains plus `note / flashcard / progress / streak / reviewQueueItem /
   subscription / payment / userBadge / friendship / report / notification /
   pushSubscription` rows (children before parents; `User` row itself stays as
   the scrubbed `deleted` marker). This is the only raw-SQL step — one
   `WHERE userId = <purged-id>` per table, sequential, inside one transaction
   per account, each preceded by its SELECT count.
5. Manifest: append `docs/verification/purge-manifest-<date>.json` listing
   every deleted id per table (ids only, same redaction rule as import
   manifests) so the purge is auditable and re-runnable (re-run finds
   nothing — same idempotency discipline as the import rollback).
6. Recount that MUST hold before sign-off: `users-active` equals the keep-list
   size; sessions and attempts attributable to purged ids are 0;
   `questions=9 lessons=7 options=26` byte-identical;
   `GET /api/questions` as a student and the leaderboard still serve
   (re-run the smoke). Any mismatch → STOP, do not continue to the next
   account batch.

## 2. What is explicitly NOT purged

Schema, migrations, curriculum/content (approved bank), plans, roles,
faculties/years/modules/units, badge catalog, cron jobs, env. The 15
already-`deleted` rows stay as scrubbed markers (proof the mechanism works).
Never purge the owner keep-list, never touch `medicine` content, never invent
new status values (the `status` column stays within its existing vocabulary).

## 3. Open items before anyone runs this

- Owner keep-list (1 line: which accounts survive).
- Confirm the heavy-QA account lives or dies (it holds the volume fixtures).
- Decide whether purged accounts' display names may linger in leaderboard
  snapshots between regens (harmless, self-heals daily) or the regen job is
  run manually right after (recommended: `POST /api/admin/jobs/generate-leaderboard`).
