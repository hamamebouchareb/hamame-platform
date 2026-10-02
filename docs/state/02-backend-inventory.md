# 02 — Backend inventory (read from code 2026-10-02, HEAD `1d0ccf1`)

Mount root: `src/routes/index.ts` under `/api` (see `src/app.ts` ->
`createApp`). Error shape everywhere: `{ error: { code, message } }`.
Auth: Bearer JWT (`requireAuth`, `optionalAuth` in
`src/middleware/auth.ts`, TTL 7d). Roles: `requireRole(...names)` AFTER
`requireAuth` (`src/middleware/requireRole.ts`; named gates:
`requireAdmin`, `requireSupportAgentOrAdmin`, `requireModeratorOrAdmin`,
`requireInstructorOrReviewer`, `requireReviewerOrAdmin` in the route
files). Validation: Zod (`validateBody/Query/Params`); UUID params via
`uuidParam()`. Pagination `?page=&limit=` (1/20, max 100). Rate limit:
in-memory sliding window (`src/middleware/rateLimit.ts`), last
X-Forwarded-For entry; auth endpoints 5/10min email-sends, 20/10min login.

## Mounted routes (method, full path, gate, file)

- POST /api/auth/register (public + rate-limit + Zod)
- POST /api/auth/login (public + rate-limit + Zod)
- POST /api/auth/forgot-password (public + rate-limit)
- POST /api/auth/reset-password (public + Zod)
- POST /api/auth/verify (public + Zod)
- POST /api/auth/resend-verification (auth + rate-limit)
- POST /api/auth/change-password (auth + Zod)
- GET /api/auth/providers (public)
- GET /api/auth/google/url (public, env-gated 501)
- GET /api/auth/google/callback (public, env-gated 501)
- GET /api/users/me (auth)
- PUT /api/users/me (auth + Zod: fullName/facultyId/yearId/wilaya/profilePhotoUrl, null clears)
- PUT /api/users/me/preferences (auth + Zod: uiLanguage fr|en, theme light|dark|system, notificationPreferences)
- GET /api/users/me/export (auth)
- DELETE /api/users/me (auth, SOFT delete -> status 'deleted', PII scrubbed)
- GET /api/users/search (auth)
- GET /api/faculties (public + query Zod; only beta/live visible)
- GET /api/faculties/:id/years (public)
- GET /api/years/:id/modules (public)
- GET /api/modules/:id/units (public)
- GET /api/units/:id/lessons (optionalAuth)
- GET /api/lessons/:id (optionalAuth; 404 when currentVersionId null)
- GET /api/questions (optionalAuth; only status='approved' for students)
- GET /api/questions/counts (optionalAuth)
- POST /api/questions/:id/report (auth)
- GET /api/questions/:id/answer-stats (auth)
- GET /api/questions/coverage (optionalAuth)
- POST /api/sessions (auth; practice/exam enforced server-side)
- GET /api/sessions (auth, own history + per-unit breakdown)
- GET /api/sessions/:id (auth)
- POST /api/sessions/:id/answers (auth; practice reveals, exam withholds)
- POST /api/sessions/:id/hints (auth; AI credits gated)
- POST /api/sessions/:id/submit (auth; streak inside transaction)
- GET /api/sessions/:id/results (auth)
- GET /api/notes (auth)
- POST /api/notes (auth)
- PATCH /api/notes/:id (auth; tags/favorite)
- GET /api/flashcards, POST /api/flashcards, POST /api/flashcards/from-question/:questionId, GET /api/flashcards/:id, PUT /api/flashcards/:id, DELETE /api/flashcards/:id, POST /api/flashcards/:id/enqueue (all auth)
- GET /api/progress/me, /readiness, /qcm-stats, /modules/:id, /by-module (all auth)
- GET /api/streaks/me, /today, /goal; PUT /api/streaks/goal (all auth)
- GET /api/plans (public)
- POST /api/subscriptions, GET /api/subscriptions/me, PUT /api/subscriptions/me/cancel (all auth)
- POST /api/promo-codes/redeem (auth)
- POST /api/activation-codes/redeem (auth)
- POST /api/admin/activation-codes (SupportAgent|Admin)
- GET /api/admin/activation-codes (SupportAgent|Admin)
- POST /api/authoring/lessons, POST /api/authoring/questions, POST /api/authoring/:type/:id/submit, PUT /api/authoring/:type/:id, GET /api/authoring/me/stats (auth + Instructor|Reviewer)
- GET /api/resources, GET /api/resources/:id (optionalAuth)
- GET /api/review/queue (Reviewer|Admin)
- POST /api/review/:type/:id/approve, POST /api/review/:type/:id/reject (Reviewer|Admin)
- GET /api/reviews/due, POST /api/reviews/enqueue, POST /api/reviews/:id/complete, GET /api/reviews/settings, PUT /api/reviews/settings (all auth)
- GET /api/moderation/queue, POST /api/moderation/reports/:id/resolve, POST /api/moderation/users/:id/restrict (Moderator|Admin)
- POST /api/instructor-applications, GET /api/instructor-applications/me (auth)
- GET /api/admin/analytics, PUT /api/admin/faculties/:id/rollout-status, PUT /api/admin/plans/:id, POST /api/admin/promo-codes, GET /api/admin/promo-codes, PATCH /api/admin/promo-codes/:id, POST /api/admin/users/:id/roles, DELETE /api/admin/users/:id/roles/:roleName, GET /api/admin/instructor-applications, POST /api/admin/instructor-applications/:id/approve, POST /api/admin/instructor-applications/:id/reject, POST /api/admin/users/:id/badges, POST /api/admin/simulations, PATCH /api/admin/simulations/:id, DELETE /api/admin/simulations/:id, POST /api/admin/jobs/{expire-subscriptions,unsuspend-users,generate-leaderboard,generate-contributors-leaderboard,send-daily-push-reminders}, POST /api/admin/badges (all Admin)
- GET /api/leaderboard (auth; faculty+year cohort, 30-day window)
- GET /api/badges, GET /api/badges/me (auth)
- POST /api/friends, POST /api/friends/:userId/accept, DELETE /api/friends/:userId, GET /api/friends, GET /api/friends/requests (auth; email-or-name-prefix search, no username column)
- GET /api/simulations (optionalAuth), POST /api/simulations/:id/register, DELETE /api/simulations/:id/register, POST /api/simulations/:id/start (auth; status derived, never stored)
- GET /api/notifications, GET /api/notifications/unread-count, PATCH /api/notifications/:id/read, POST /api/notifications/read-all (auth); POST /api/admin/notifications (Admin)
- GET /api/push/preferences, PUT /api/push/preferences, POST /api/push/subscribe, POST /api/push/unsubscribe (auth; VAPID, warn-only without keys)
- GET /api/ai/credits (auth; daily allowance, server-computed lowBalance; AI features degrade without ANTHROPIC_API_KEY)

Deliberately NOT mounted (`src/routes/index.ts` comment): `/api/admin/ai-credits`.

## Cron + boot jobs (`src/server.ts`, node-cron, no external scheduler)

- `expireSubscriptions` — daily 03:00 + at boot (BR-7).
- `unsuspendUsers` — daily 03:00 + at boot.
- `generateLeaderboardSnapshots` — daily 03:00 + at boot (period `monthly`).
- `generateContributorsLeaderboardSnapshots` — daily 03:00 + at boot (period `monthly_contributors`).
- `sendDailyPushReminders` — daily 19:00 UTC only, NO boot run (would spam pushes on hot-reload).

## Middleware (`src/middleware/`)

`auth.ts` (requireAuth/optionalAuth), `requireRole.ts`, `validate.ts`
(validateBody/Query/Params), `rateLimit.ts`, `errorHandler.ts`.

## package.json scripts (root; what each does)

- `dev` — tsx watch API :3000. `build` — `prisma generate && tsc` (dist/). `start` — node dist/server.js.
- `prisma:generate/validate/format/studio/migrate:deploy` — client/DB ops (deploy = sanctioned; `migrate:dev` script exists but must NEVER run on the pooler — no shadow DB).
- `ai:backfill-explanations` — backfill script. `verify:*` — hints(+ai, spends credits)/push/readiness/credits harnesses in `src/scripts/` (excluded from tsc build).

## Contract cross-check (code vs docs/hamame_api_contract.md)

- In contract, NOT in code: POST /api/ai/chat|hint|note-maker|answer-locator|audio (only GET /ai/credits exists); PUT /api/admin/ai-credits (deliberately unmounted, see above).
- Stale `[V2]` tags in contract (all live): reviews settings/due, leaderboard, badges, friends.
- In code, missing from contract: resend-verification, change-password, questions/counts|answer-stats|coverage, notes PATCH, all flashcards endpoints, progress/readiness|qcm-stats|by-module, streaks/today|goal(+PUT), users/search, instructor-applications, authoring PUT :type/:id, all admin/* except analytics/rollout/plans/simulations, all jobs/*, all push/*, notifications unread/read-all + admin create, badges award + /badges/me, friends accept/remove/requests.
- Contract imprecision: POST /api/friends (real shape: POST / + POST /:userId/accept + DELETE /:userId + GET / + GET /requests); streaks (only /me listed); questions (report listed, counts/stats/coverage not).
