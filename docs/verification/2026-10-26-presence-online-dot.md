# Presence online dot — verification summary (2026-10-26)

Raw log: `2026-10-26-presence-online-dot-raw.log` (harness
`tmp-verify-presence.mjs`, gitignored, run with `node --env-file=.env`).

**18/18 assertions passed.** Throwaway accounts `vf-presence-{a,b,off}-<ts>@verify.hamame.test`
(implausible domain, `VerifyPresenceFlow123` password, prisma-provisioned since
register is rate-limited), all soft-deleted through the real
`DELETE /api/users/me` at the end — re-queried proof `0` active rows, one
post-delete login rejected `401`.

What the pass proved, through the real API on the dev server:

| Claim | Evidence |
|---|---|
| Login does not refresh presence | `last_active_at` SQL value `null` after `POST /auth/login` 200 |
| First authed request refreshes it | after `GET /api/users/me`: `2026-10-26T20:51:06.696Z` (<30s old) |
| 60s server throttle prevents rewrite on rapid calls | two more authed calls → value byte-identical |
| friends list carries the flag | `GET /friends` rows: active friend `online:true`, never-logged-in `online:false` |
| DM conversations carry the flag | `GET /dms/conversations` `otherUser.online` true/false exactly matching |
| Window expiry (2 min) | after 125s silence, `GET /friends` → `online:false` |
| Cleanup proven | 3 × deletion `200`, active pattern-accounts = 0 re-queried |

## Claims NOT covered by this pass (disclosed)

- Frontend rendering of the dot was verified only by `tsc`/`lint`/`next build`
  exit 0 — no browser/DOM run in this harness (consistent with the no-mocked-DOM
  rule; visual check happens in the owner's browser or a future Playwright pass).
- The in-process throttle Map is per-process; multi-instance deployments would
  touch more often (bounded by `connection_limit`, harmless) — same documented
  single-instance assumption as the rate limiter.
- The Railway build for this commit was **unchanged-from-previous-session
  failing (`902dbf99` BuildKit `grpc server closed unexpectedly`)** at the time
  of writing; the backend changes were verified against the local dev server,
  which is the same code as `dist/`.
