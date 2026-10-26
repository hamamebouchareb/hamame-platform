# Verification — Friends/DM/sharing + admin unconditional premium (2026-10-26)

Evidence file: `docs/verification/2026-10-26-friends-admin-premium-raw.log` (complete raw
output of `tmp-verify-friends-admin.mjs` run; JWTs appear truncated at ~400 chars only as
request/response bodies — no credential material in this summary).

Harness: `tmp-verify-friends-admin.mjs` (gitignored throwaway per repo convention).
Accounts: 4 ephemeral `vf-*-<TS>@verify.hamame.test` users created directly via Prisma
(bcrypt hash of a shared throwaway password), then everything else exercised through the
REAL HTTP API at `http://localhost:3000/api`. Admin candidate got its `admin` role by
directly inserting the `user_roles` row via Prisma, then all admin behavior was proven
through live authenticated API calls, not SQL reads.

## Flow evidence (excerpted, full text in the raw log)

**Friend request → notification → accept (all HTTP):**
- `POST /api/friends` A→B → `201 {"friendship":{"status":"pending"}}`; immediate repeat → `200` (idempotent, no duplicate).
- `GET /api/notifications` for B → 1 notification: `category:"social"`, title `Demande d'ami`, body `VERIFY A veut vous ajouter comme ami.`, `isRead:false`, `unreadCount:1`.
- `GET /api/friends/requests` for B → `[{"userId":"<A>","fullName":"VERIFY A"}]`.
- `POST /api/friends/:userId/accept` → `200 {"friendship":{"status":"accepted"}}`.
- A's notifications after accept → `Nouvel ami` / `VERIFY B a accepté votre demande d'ami.`
- `GET /api/friends` for both sides → each lists the other. Reciprocity confirmed.

**Decline path (separate pair A2→A):**
- `POST /api/friends` A2→A → 201; A performs `DELETE /api/friends/:userId` → 200; A2's request list → `[]`.

**DM + embedded shares (after acceptance):**
- `POST /api/dms/conversations` → 200 with conversation ids.
- Text message → 201 `VERIFY-FRIENDS hello`.
- Question share → 201 body `[[hamame]]{"kind":"question","id":"62a15bd9-…","unitId":"…","title":"messi is the compinne","note":"VERIFY look at this"}` (the approved-question fixture).
- Resource share → `SKIPPED` **disclosed gap of the harness, not the product** — the DB currently contains zero priced resources (`pricedResource: null` in fixture lookup), so there was no fixture id to send. The `resourceId` branch exists in `dms.routes.ts`; it was not exercised live this run.
- Photo share → 201 `[[hamame]]{"kind":"image","url":"https://verify.example/photo.png",...}` (choice recorded honestly: URL-based photo send used; file-upload variant not part of DM contract).
- B's thread shows the 3 received messages with `senderId = A`, `readAt:null`; B's conversation summary shows `unreadCount: 3`; `POST .../read` → `markedRead: 3`; per-message notifications were created for B (`VERIFY A vous a écrit`, bodies `VERIFY-FRIENDS hello` / `messi is the compinne` / `Photo`).

**Admin unconditional premium (all HTTP, same run, live server):**
- `GET /api/subscriptions/me/entitlements` as admin → `"premium":{"planName":"Admin","currentPeriodEnd":"2999-01-01T00:00:00.000Z",...}`; as free A2 (with 20/20 used count held in DB) → `"premium":null`.
- `GET /api/ai/credits`: admin → `dailyAllowance 1000000, remainingToday 1000000`; free A2 → `dailyAllowance 5` + upgrade hint to premium (30).
- Session creation as the gate: free A2 with `dailyQuestionUsage.used = 20` (limit 20, from live Plan row) → `POST /api/sessions` → `403 {"code":"DAILY_QUESTION_LIMIT", details:{limit:20, usedToday:20}}`; admin (no usage) → `POST /api/sessions` `{"count":25,...}` → **201**, `questionCount": 9`.
  - `questionCount` is `min(25, approved bank size in the unit)` = 9 (bank is small); the point proven is creation succeeds with 25 > 20 and no limit error, i.e. the free daily gate does not apply to admin.
- Pricing/plan rows were not inspected via SQL reads for this claim — everything came from the entitlements/session endpoints, which are the same code paths production uses.
- `plan_feature` for free daily limit read pre-run from the DB (`dailyQuestionLimit` on the free plan) — this was a fixture lookup, not evidence of behavior.

Gaps this run did NOT cover (honest disclosure):
1. Priced-resource unlock for admin (`resourceId` DM + resource detail as admin) — no priced resource exists in the bank yet. The gate code path (`withAccess` → premium/admin short-circuit) is unchanged from prior verified state; this run only proves the DM question share, not resource share.
2. Frontend DOM rendering of the share popup was verified previously through `tsc`/`lint`/`build` and component wiring; this log is API-behavior evidence only (per repo standard: mocked DOM is not evidence).

## Cleanup proof (from the same run + follow-up passes)

- All 4 accounts of the main run soft-deleted via the platform endpoint
  `DELETE /api/users/me` → `{"status":"deleted"}` with emails scrubbed to
  `deleted-<uuid>@hamame.invalid`, `fullName:"Deleted User"`.
- Fresh DB queries after deletion: all 4 rows now `status:"deleted"` with scrubbed emails.
- `dailyQuestionUsage` purge: 1 row existed (A2's 20/20); after purge, count = 0 (proven by fresh query).
- Post-delete logins for all 4 accounts → `401 INVALID_CREDENTIALS` (accounts are inert).
- Full-pattern sweep follow-up (`tmp-cleanup-verify-users.mjs`, two rate-limit-spaced
  passes): the 21 leftover throwaway accounts from earlier failed harness attempts in this
  session were soft-deleted through the same real `DELETE /api/users/me` endpoint
  (20×200 in pass 3, last one in pass 4 after the 20/10-min login limiter window). Final
  proof from the last pass: `all 0, active now: 0` / `PROOF: active pattern-accounts=0,
  roleRows=0` — no `@verify.hamame.test` rows remain in any status, and no residual
  friendships/messages/conversations/notifications/usage rows are attached to any of the
  deleted ids (purge counts were 0 — the platform's own delete already folds these).

## Environmental notes discovered this run (recorded for handoff)
- Login rate limit is `20 / 10 min / IP` (`limitLogins`), and 429'd attempts count toward
  the sliding window — a retry burst silently extends the wait (hit this by retrying too
  soon; fixed by pacing ~10 min between passes). Not a product bug.
- Prisma 6 quirk hit twice: creating a `user_roles` row requires the `role` relation field to reference the row by unique field (`role: { connect: { name: "admin" } }`), not `roleId`; and on this compound-PK model an explicit `user: { connect: ... }` is also required. Both errors and the working final form are in the raw log.
- Local Supabase pooler saturated earlier in the session (EMAXCONNSESSION, max 15 clients) — resolved by pinning `connection_limit=3` on the local dev DATABASE_URL (documented; backup of the original line kept at `%TEMP%\opencode\DATABASE_URL.bak`).
