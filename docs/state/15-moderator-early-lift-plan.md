# 15 — Moderator early-lift plan (PLAN ONLY — no code, schema, migration, env, or data changed here)

Problem: a restriction (`status=suspended` + `suspendedUntil`, written by
`POST /api/moderation/users/:id/restrict`, `src/routes/moderation.routes.ts:198-247`)
can only end by waiting for `suspendedUntil` (cron `unsuspendUsers.ts:17-20`
flips to `active`) or never (null = indefinite). No one can lift early, not
even the moderator who imposed it.

## Current flow (from code)

- Impose: moderator/admin/super_admin only; self-restrict rejected 400;
  already-suspended/deleted rejected 409; writes `status + suspendedUntil`
  and invalidates the auth cache (`moderation.routes.ts:198-247`).
- Expire: daily job flips rows whose `suspendedUntil` passed back to `active`
  (`unsuspendUsers.ts:17-20`); null stays suspended forever.
- Audit trail today: the status flip itself (no who/when columns beyond
  `suspendedUntil`; reports table is separate). Enforcement reads the row
  per-request with a 30 s cache (`src/middleware/auth.ts`).

## Proposed API

- `POST /api/moderation/users/:id/lift` — same gate as restrict
  (`requireRole("moderator", "admin", "super_admin")`); 404 missing user;
  409 unless `status === "suspended"`; sets `status: "active"` +
  `suspendedUntil: null`; calls `invalidateAccountState(id)` so the next
  request passes; returns `200 { user: { id, status } }` (safe-user shape,
  same as restrict's response).
- Who may lift: the same three roles (simplest, matches impose gate). Tighter
  variant (same moderator or admin-only) is a product call — default to the
  same gate.
- Notification: `createNotificationBestEffort` (`notifications.routes.ts:26`,
  categories `social|prix|systeme` — new category or reuse `systeme`; recommend
  `systeme`, no enum change) title/body in the student's language is
  server-unaware — store FR copy, same as existing moderator notifications.
- Tests: harness proof — restrict disposable 1 day, lift, relogin 200
  immediately (no 30 s wait, proving invalidation), `suspendedUntil` null;
  lift on active user → 409; lift as student → 403; unit-test nothing new
  (no pure helper; the endpoint is integration-tested like restrict).
