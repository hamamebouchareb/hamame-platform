# 11 — Admin UI plan (PLAN ONLY, 2026-10-04 — no code, schema, migration, env, or data changed here)

Goal: a minimal admin area in the web app so the owner stops needing curl or
SQL for the routine tasks that today are API-only. Every endpoint below
already exists and stays the source of truth; the UI is a thin, role-gated
caller built only from existing primitives.

## 0. Ground rules (from code, not wishes)

- Server role checks stay the source of truth. `admin.routes.ts:37`
  (`requireRole("admin", "super_admin")` after `requireAuth`), the activation-code
  router's `requireRole("support_agent", "admin")`
  (`activationCodes.routes.ts:190`), and the notifications admin router's
  `requireRole("admin", "super_admin")` (`notifications.routes.ts:160`) reject
  forbidden callers with 403 regardless of what the UI shows. Client gating is
  UX only — the review page already sets the pattern: check
  `user.roles` from `AuthContext` (populated via `GET /api/users/me`) and render
  an `EmptyState` denial, while the 403 path covers API rejection anyway
  (`web/src/app/review/page.tsx:119-140`).
- No secrets in the client. The web app only ever sends the Bearer token from
  `hamame_auth` localStorage via `apiFetch` (`web/src/lib/api.ts`); reviewer/admin
  credentials, JWTs, and env values are never printed, stored, or committed.
- Navigation is `web/src/lib/nav.ts` only — `PRIMARY_NAV` (5 tabs) and
  `SECONDARY_NAV` (avatar menu). No per-route nav arrays (that drift was already
  fixed once). Admin entries go in one new exported array (e.g. `ADMIN_NAV`),
  rendered only when `user.roles` includes an admin-family role, resolved through
  `AppHeader` exactly like the existing arrays.
- Pages use `PageShell` + existing primitives only (`Card`, `Button`, `Field`,
  `Modal`/`ConfirmDialog`, `EmptyState`, `LoadingSkeleton`, `ErrorState`,
  `MetricCard`, `BackLink`). No new design tokens (tokens live in
  `web/src/styles/tokens.css`), no new nav system.
- Auth pattern per page: `useRequireAuth()` for identity/hydration
  (`web/src/lib/useRequireAuth.ts:28-47`), then a role check on
  `user.roles` with the review-page denial shape for non-holders.
- i18n: every user-facing string gets an `fr` + `en` key in `web/src/lib/i18n.ts`;
  `en` is typed `Record<I18nKey, string>` (`i18n.ts:1078`), so a missing key
  fails `tsc`. French and English are hand-maintained; `{var}` interpolation
  only. Never hard-code user-facing copy in a component.
- Safety: destructive actions (role revoke, promo expiry change, simulation
  delete/cancel, application reject) go through `ConfirmDialog` with the exact
  consequence stated. Nothing in v1 approves content in bulk from the browser —
  the review queue UI stays the spot-check path and `review-approve.ts` stays
  CLI-only (it has never run with `--apply`).

## 1. Needs already covered by existing endpoints (file:line)

- Issue and list activation codes — `POST /api/admin/activation-codes` (issue
  after manual payment, `activationCodes.routes.ts:243`) and
  `GET /api/admin/activation-codes?status=&facultyId=&page=&limit=` (list,
  `activationCodes.routes.ts:304`). Gated `support_agent` OR `admin`
  (`activationCodes.routes.ts:190`), mounted before the admin-only router
  (`src/routes/index.ts:58`). No revoke/delete endpoint exists — redeemed codes
  flip status at redeem time; typos today have no UI or API remedy (see §2).
- Change faculty rollout status — `PUT /api/admin/faculties/:id/rollout-status`
  with `{rolloutStatus: planned|beta|live}` (`admin.routes.ts:194-200`).
  Admin-only.
- Assign or remove a role — `POST /api/admin/users/:id/roles {roleName}`
  (`admin.routes.ts:595`, idempotent, 201 new / 200 already-held) and
  `DELETE /api/admin/users/:id/roles/:roleName` (`admin.routes.ts:646`,
  idempotent, with self-lockout guard `CANNOT_SELF_REVOKE_ADMIN` for own
  admin/super_admin). Role names are the seed `ROLE_NAMES` enum
  (`admin.routes.ts:514-525`). Admin-only. Note: lookup is by user id (UUID) —
  there is no admin user-search endpoint, so the UI needs a paste-id field in
  v1 (see open questions).
- Review instructor applications — `GET /api/admin/instructor-applications?status=`
  (`admin.routes.ts:695`), `POST .../:id/approve` (grants `instructor` in the
  same transaction, `admin.routes.ts:736`) and `POST .../:id/reject`
  `{reviewComment}` required (`admin.routes.ts:778`). Admin-only.
- Create and edit promo codes — `POST /api/admin/promo-codes`
  (`{code, type: referral|discount, value: {grantsDays>=1,…}, maxUsesPerAccount=1, expiresAt?}`,
  code normalized to UPPERCASE, `admin.routes.ts:316`), `GET /api/admin/promo-codes`
  with redemption counts (`admin.routes.ts:343`), `PATCH /api/admin/promo-codes/:id`
  `{expiresAt}` only — code immutable, no `isActive` column, no delete
  (`admin.routes.ts:376`). Admin-only.
- Create a notification — `POST /api/admin/notifications`
  (`notifications.routes.ts:196`, mounted at `/api/admin/notifications`,
  `src/routes/index.ts:66`). Admin-only.
- Run the admin jobs — five manual triggers, each the same function the
  node-cron schedule runs: `POST /api/admin/jobs/expire-subscriptions`
  (`admin.routes.ts:427`), `/unsuspend-users` (`:445`),
  `/generate-leaderboard` (`:463`), `/generate-contributors-leaderboard`
  (`:481`), `/send-daily-push-reminders` (`:499`). Admin-only. Each returns
  `{message: "Job executed", …counts}` — the UI shows the returned counts.
- Also available for an overview page (no extra work): `GET /api/admin/analytics`
  (`admin.routes.ts:165`, users/subs/sessions/approved content/open reports/per-faculty
  coverage), `PUT /api/admin/plans/:id` (pricing config, `admin.routes.ts:245`),
  simulation CRUD (`POST/PATCH/DELETE /api/admin/simulations`,
  `admin.routes.ts:915,959,983`), badge award (`POST /api/admin/users/:id/badges`,
  `admin.routes.ts:831`). These are v2 candidates, not v1 (see §3).

## 2. Needs with NO endpoint today (what each would require)

- Create a resource — `resources.routes.ts` exposes only `GET /` (list,
  `:58`) and `GET /:id` (detail, `:96`). No POST/PUT/DELETE exists. Would
  require: a new admin-gated POST (title/type/fileUrl/sourceLabel/faculty/year
  scope, mirroring the list filters), plus edit/delete if the owner wants
  lifecycle management — backend decision + migration-free route work, then UI.
  Out of v1.
- Create a year, module, or unit — `curriculum.routes.ts` is GET-only
  (`:53,:84,:123,:169,:234,:342` — faculties/years/modules/units/lessons/lesson
  detail). Curriculum creation today happens only inside the bulk importer
  (`resolveScope` lookup-or-create behind `--apply`). Would require: new
  admin-gated POST endpoints per level (parent-scoped, orderIndex handling) —
  new API surface with validation, then UI. Out of v1; the importer remains the
  curriculum path.
- Look up a user by email/name (for role assignment) — `GET /api/users/search`
  (`users.routes.ts:103`, impl `:80-101`) returns ids, but matching is EXACT
  email or fullName PREFIX (startsWith, case-insensitive, min 3 chars, cap 10 —
  `users.routes.ts:89-92`); it does NOT do email-prefix or substring search
  (deliberate enumeration resistance). Ruling: v1 reuses it with that limitation
  stated in helper text, and keeps a paste-UUID fallback field for exact-id
  cases. No new endpoint.
- Revoke an activation code — no endpoint existed (issue + list only); step 2b
  below specs the minimal one (active → revoked, never delete). Promo-code
  delete stays out (expiry-nulling covers deactivation).
- Per-code redemption detail beyond counts — list returns `redemptionCount`
  per code only. Fine for v1.

## 3. Proposed pages and routes (v1 smallest useful set, priority order)

All under `/admin/*`, all using `useRequireAuth()` + role check + `EmptyState`
denial (review-page shape), all `PageShell` + primitives, all hidden from nav
for non-holders (new `ADMIN_NAV` array in `nav.ts`, rendered by `AppHeader`
only when `user.roles` includes `admin`, `super_admin`, or — for the codes page
only — `support_agent`).

1. `/admin/codes` (FIRST — the manual payment path): list issued codes
   (status/faculty filter, `GET /api/admin/activation-codes`) + issue form
   (faculty, year, expiresAt → `POST`) carrying the scope helper text
   (`admin.codesScopeNote`, §5) + Revoke action per active row (§2b).
   Accessible to `support_agent` and `admin`/`super_admin`, matching the
   endpoint gate. Shows the returned code once for copy-paste; no code value
   ever persists client-side beyond display.
2. `/admin/faculties`: faculty list with rollout badge + status changer
   (`PUT .../rollout-status`, confirm dialog stating the visibility effect:
   `planned` hides everywhere, `beta`/`live` visible). Admin-only.
3. `/admin/roles`: paste-UUID lookup showing current roles (`POST` then read
   back authoritative `{id, roles}`), grant select + revoke buttons (revoke
   behind `ConfirmDialog`; self-revoke of own admin is API-rejected and the UI
   disables it pre-emptively). Admin-only.
4. `/admin/instructor-applications`: pending list (`?status=pending`) with
   approve (confirm: grants `instructor`) / reject (comment required, `Field`).
   Admin-only.
5. `/admin/promos`: code list with redemption counts + create form
   (code/type/grantsDays/maxUses/expiresAt) + expiry editor (null clears).
   States the immutability rule in helper text (code cannot change after
   creation; no delete in v1). Admin-only.
6. `/admin/notifications`: compose + send (`POST /api/admin/notifications`)
   with a confirm stating the broadcast scope. Admin-only.
7. `/admin/jobs`: five buttons (one per job endpoint) each showing the returned
   counts after run, behind a confirm (jobs are safe/re-runnable but the owner
   should mean it). Admin-only. Deferred to last because cron already covers
   the schedule; this is the on-demand repair path.

Explicitly NOT in v1: analytics dashboard (read `GET /api/admin/analytics`
exists; a `MetricCard` overview can follow the seven above), plan editing,
simulation management, badge awarding, resource/curriculum creation (§2),
anything bulk-approving content.

## 4. Safety (binding)

- Server role checks stay the source of truth (§0); every page handles 403
  with the denial shape, never by hiding errors.
- No secrets in the client: `apiFetch` + Bearer token only; no new env vars;
  issued promo/activation code strings are shown once for operational copy and
  never logged, cached, or committed.
- `ConfirmDialog` for: role grant/revoke, rollout-status flips, application
  approve/reject, promo create/expiry change, notification send, job runs,
  simulation actions (v2). Each dialog names the exact consequence
  (e.g. "Removing instructor from this user revokes authoring access immediately").
- No bulk content approval from the browser. The review queue (`/review`,
  per-item approve with `reviewComment` on reject) stays the content path;
  `review-approve.ts` stays CLI-only and has never run with `--apply`.
- Money-adjacent writes (codes, promos, plans) show the server-returned row
  after mutation so the owner always sees authoritative state, matching the
  endpoints' response shapes (`{user:{id,roles}}`, `{promoCode}`,
  `{activationCodes}`, `{application}`).

## 5. i18n and nav change

- New keys under an `admin.*` namespace, e.g. `admin.title`, `admin.codes`,
  `admin.codesIssue`, `admin.faculties`,
  `admin.rolloutNote`, `admin.roles`, `admin.rolesLookupHint`,
  `admin.selfRevokeBlocked`, `admin.applications`, `admin.rejectComment`,
  `admin.promos`, `admin.promoImmutableNote`, `admin.notifications`,
  `admin.broadcastConfirm`, `admin.jobs`, `admin.denied`, `admin.deniedDesc`,
  plus per-action confirm/result strings. Both `fr` and `en` tables, every key
  in both — `tsc` fails the build on any gap
  (`web/src/lib/i18n.ts:8,1076-1078`). `{var}` interpolation only; plurals via
  caller-selected key pairs.
- `admin.codesScopeNote` (helper text on the issue form, exact copy): FR —
  « Ce code débloque le Premium pour TOUS les contenus, quelle que soit la
  faculté/l'année affichée (l'abonnement ne porte aucune restriction de
  périmètre). » EN — "This code unlocks Premium for ALL content regardless of
  the faculty/year shown (the subscription carries no scope restriction)."
  Rationale: `subscriptions` has no faculty/year columns (blanket premium by
  design) — the faculty/year on the code row is the audit record only.
- `nav.ts`: add `ADMIN_NAV: NavKeyEntry[]` (hrefs `/admin/codes`,
  `/admin/faculties`, `/admin/roles`, `/admin/instructor-applications`,
  `/admin/promos`, `/admin/notifications`, `/admin/jobs`) with `labelKey`s
  from the new `admin.*` keys; `AppHeader` renders it only for role holders
  (admin-family always; `support_agent` sees `/admin/codes` only). `PRIMARY_NAV`
  and `SECONDARY_NAV` untouched. Deliberately no per-route nav arrays.

## 6. Numbered checklist (small, separately committable; real output only)

1. `ADMIN_NAV` + `AppHeader` conditional render + `admin.title/denied/deniedDesc`
   keys (FR+EN). Verify: `npx tsc --noEmit -p web/tsconfig.json` exit 0 and
   `npm run lint --prefix web` 0 problems; non-holder sees no admin entries
   (DOM assertion in a throwaway check, then delete it).
2. `/admin/codes` list + issue + revoke against the real endpoints via
   throwaway harness (never `server.ts`): `GET /api/admin/activation-codes`
   200 with a support-agent JWT minted locally; issue ONE code with the
   shortest allowed future expiry (a near-future `expiresAt` datetime — the
   schema takes any future ISO datetime, so hours-out is valid); NEVER print
   or log the full code (last 4 characters only in every output and log);
   verify the list shows it `active`; revoke it (`POST .../:id/revoke` 200,
   list shows `revoked`); redeem it → 409 rejected; revoke again → 409.
   Paste statuses only, never the full code. Leave no live code behind.
   Expiry guarantee (read, not trialled — no code is left to expire on
   production): `redeemActivationCode` rejects past-`expiresAt` codes with
   409 `ACTIVATION_CODE_EXPIRED` (`activationCodes.routes.ts:85-88`) before
   any grant write, checked live against the row's own date — no cron sets or
   clears activation-code status (the five cron jobs cover subscriptions,
   unsuspension, leaderboards, and push only). An expired code is therefore
   rejected by its date even if its status still reads `active`.
3. `/admin/faculties` flip on a throwaway faculty row (never a real one):
   snapshot row, `PUT` to `beta` and back, byte-identical restore diff,
   `GET /api/faculties` visibility before/after pasted.
4. `/admin/roles` grant+revoke on a disposable test account: `POST` 201 then
   `DELETE` 200, final roles equal to snapshot; self-revoke attempt 400
   `CANNOT_SELF_REVOKE_ADMIN` pasted. Delete the account after via
   `DELETE /api/users/me`.
5. `/admin/instructor-applications` approve+reject on fixture applications:
   `POST .../approve` 200 (role present after), `POST .../reject` 200 with
   comment on a second fixture; 409 on re-approve pasted.
6. `/admin/promos` create (`POST` 201, code uppercased) + expiry patch
   (`PATCH` 200, null clears) on `VERIFY-` prefixed codes; duplicate create
   409 pasted. Leave no live test codes (expire them in the same run).
7. `/admin/notifications` send to the owner test account only; paste the 201
   and the account's `GET /api/notifications` containing it. Never broadcast
   to all users from a test.
8. `/admin/jobs` run each trigger once from the UI; paste returned counts.
   Confirm idempotence by re-running expire (second run returns 0 new).
9. Full gates: backend `npx tsc --noEmit -p tsconfig.json` exit 0, web `tsc`
   exit 0, `npm run lint --prefix web` 0 problems, `next build` exit 0,
   Playwright smoke against `next start` 2 passed. Push, report hashes.

## Owner rulings (decided 2026-10-04 — implementation unlocked)

1. `support_agent` sees ONLY `/admin/codes`. All other admin pages are
   admin-family (`admin`, `super_admin`).
2. Role lookup reuses `GET /api/users/search` with its documented limitation
   (exact email, name-prefix only — `users.routes.ts:89-92`) plus a paste-UUID
   fallback field. No new search endpoint.
3. The rollout-flip test uses one of the 15 draft `beta` `fac-*` faculties
   (live-verified 2026-10-04: 15 beta rows, plus `dentistry` planned and
   `medicine` live) — never Medicine — and restores the original value
   byte-identical in the same run.
4. Promo creation stays admin-family (`admin`, `super_admin`); no further
   restriction.
5. Notifications use a confirm dialog naming the audience (scope warning in
   the dialog, no maker-checker).
6. Analytics overview AFTER the seven v1 pages prove themselves.
7. Revoke is specced as step 2b below (active → revoked, never delete).

## 2b. Revoke endpoint (minimal)

`POST /api/admin/activation-codes/:id/revoke` — same gate as issue
(`requireSupportAgentOrAdmin`, `activationCodes.routes.ts:190`). Transition
`active` → `revoked` ONLY, via conditional `updateMany`
(`WHERE id AND status='active'`, count check — same atomic discipline as the
redeem claim at `activationCodes.routes.ts:100-103`); never a delete, so the
audit row survives. No migration needed: `ActivationCode.status` is a plain
`String` column (`prisma/schema.prisma`, `// 'active' | 'redeemed' |
'expired' | 'revoked'`), and both the list filter and the redeem path already
anticipate the `'revoked'` value. Response: `200 {activationCode: {id,
status: "revoked"}}` (no code value echoed — the list already shows it).
409 cases: already `redeemed` (`ACTIVATION_CODE_ALREADY_REDEEMED`), already
`revoked` (`ACTIVATION_CODE_ALREADY_REVOKED`), past `expiresAt`
(`ACTIVATION_CODE_EXPIRED` — revoking an expired code is meaningless); 404
when the id is missing. UI: a Revoke action per active row with `ConfirmDialog`
stating the code dies immediately even if unredeemed.

## Open questions for the owner

(none open — all seven answered above as rulings.)
