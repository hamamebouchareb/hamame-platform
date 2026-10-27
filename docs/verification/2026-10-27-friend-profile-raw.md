# Friend-profile endpoint + search-relationship fix — raw evidence (2026-10-27)

Task: (1) "make can visit the profile of a friend and see its progress"
(2) fix the stale "En attente" search chip that persisted after the other person
accepted.

## What shipped

Backend:
- `GET /api/users/:id/profile` (`src/routes/users.routes.ts`,
  `getFriendProfile`): friend-gated (403 `NOT_FRIENDS` unless an accepted
  friendship row exists either direction; self always 200; unknown or
  soft-deleted → 404 `USER_NOT_FOUND`; malformed UUID → 400 `VALIDATION_ERROR`).
  No email/phone/status in the payload. The `progress` block calls
  `buildProgressSummary(id)` — the extracted body of `getMyProgress`
  (`src/routes/progress.routes.ts`), so a friend page can NEVER disagree with
  the target's own `/api/progress/me` numbers (the one-implementation
  invariant). Order of gates is deliberate: user lookup FIRST, then friendship —
  probe 25 in the first run caught a phantom-id 403 and the reorder fixed it.
- `GET /api/users/search` rows now carry server-derived
  `relationship: none|friend|pending_sent|pending_received` (one extra
  ≤10-row both-directions `friendship.findMany`). This is the root-cause fix
  for the stale chip: chips were client-side snapshots of locally-loaded
  lists and stayed "En attente" forever after the peer accepted.

Frontend:
- `web/src/app/amis/[id]/page.tsx` (NEW): friend profile page — identity card,
  4 bounded metrics (streak / sessions / accuracy / average score via existing
  `suivi.*` keys), top-5 recent activity; `notFriends` / `notFound` /
  network+retry EmptyStates; self badge when viewing your own profile.
- `web/src/components/FriendsPanel.tsx`: chips now read the per-row
  `relationship` from the search response; `pending_received` rows get an
  inline "Accepter" button; accept/add re-run an active search so the chip
  flips to server truth; listeners on window focus + visibilitychange reload
  the lists and re-run an active search (peer-accepts-while-tab-open case);
  friend rows are links to `/amis/{id}` (chat stays a separate button).
- `web/src/app/profile/page.tsx`: find-friends form gets the same
  relationship chips + inline accept + friend rows link to `/amis/{id}`; the
  client-side `sentRequests` map is deleted (that was the stale-state bug on
  this surface).
- i18n: new keys `friends.viewProfile` + `friendPage.*` in BOTH fr/en tables.

## Gates (exact commands, real exits)

| Gate | Command | Result |
|---|---|---|
| Backend types | `npx tsc --noEmit` | exit 0, no output |
| Backend tests | `npm test` | 73 pass / 0 fail (`ntests 73 ... pass 73 fail 0`) |
| Web types | `npx tsc --noEmit -p web/tsconfig.json` | exit 0 |
| Web lint | `npm run lint --prefix web` | 0 errors (3 pre-existing warnings in unrelated files: groups/DmComposer/ShareWithFriend) |
| Web build | `npm run build --prefix web` | success; `/amis/[id]` listed as Dynamic route |
| Web e2e | `npm run test:e2e --prefix web` | run 1: 3 passed + 1 startup-flaky timeout /messages (documented machine behavior); immediate retry: **4 passed** |

Lint round 1 DID catch two real defects in my new code and both were fixed
before shipping:
- `react-hooks/refs` — FriendsPanel wrote `ref.current = ...` during render;
  replaced ref-mirroring with a `useCallback` converge handler.
- `react-hooks/set-state-in-effect` — the invalid-UUID branch called
  setState synchronously in the effect; invalid-param resolution moved to a
  render-time `invalidParam` flag.

## Wet-run harness

`tmp-verify-friend-profile.mjs` (gitignored throwaway, deleted-state below)
against the LOCAL API on :3000 running with the process-local
DATABASE_URL override to the pgbouncer endpoint (`:5432` → `:6543` +
`&pgbouncer=true`) because the session-pooler quota was saturated externally.

Run 1 — 31/32 PASS. FAIL disclosed: for an unknown UUID the endpoint returned
403 NOT_FRIENDS (friendship gate ran before the user lookup). Fixed by
reordering gate lookup/user-existence; disclosed here per the honesty rule.

Run 2 — **32/32 PASS** (`2026-10-27-friend-profile-raw.log`) with raw bodies:

- search relationships transition `none → pending_sent → friend` on the
  sender side and `pending_received → friend` on the receiver side (raw JSON
  rows in log lines 3–6, 11–13);
- profile gates: self 200; BOTH pending directions 403 NOT_FRIENDS (9, 10) —
  a pending request never unlocks a profile; friend 200 (14);
- **builder-reuse invariant byte-checked**: friend profile's `progress` block
  JSON-stringified === the target's own `GET /progress/me` body (19–20), so
  the two surfaces share one implementation by construction, not by claim;
- PII: friend profile has NO `email`/`phone`/`status` keys (17);
- deleted friend: 404 USER_NOT_FOUND even though the friendship row survives
  soft delete (23); deleted user absent from search (24); unknown UUID 404
  (25); malformed UUID 400 `VALIDATION_ERROR` (26); the deleted user's Bearer
  token rejected 401 (27);
- cleanup REAL platform path: 4 throwaway accounts
  (`vf-friend-{alpha,bravo,charlie,delta}@verify.hamame.test`), each deleted
  via `DELETE /api/users/me`, each removal proven by a fresh re-login → 401
  (29–31): 4 registered → 4 removed → **0 remaining** (32).

## Environment incidents encountered (disclosed, per housekeeping)

- Orphaned `node.exe` held port 3000 at session start (PID 8416) — killed
  before starting the dev server, per the known gotcha.
- First tsx-watch restart after my `users.routes.ts` edit hit `EADDRINUSE`
  (Windows socket handoff) and the background dev server crashed; the probe
  before that got one INTERNAL_ERROR (overlap window). Fixed by killing the
  leftover listener and starting a clean server; harness run 2 is from that
  clean server.
- Console output in the harness is deliberately ASCII-only (codepage 850).

## Known UI-behavior notes committed as-is

- The friend page accuracy metric reuses the `/progress/me` surface, which
  (inherited, documented in both route files) counts EVERY attempt row — it
  does NOT apply the "newest attempt per session_question" dedup that
  /qcm-stats and /by-module apply. The metric's subtitle
  ("QCM / QCS, au total") keeps that honest on the page.
- `/users/me/profile` (if anyone were to type it) resolves as
  `/:id/profile` with id="me" → 400 from uuidParam. No real route conflict:
  `GET /me`, `GET /search`, `GET /me/export` are all distinct literal paths.
