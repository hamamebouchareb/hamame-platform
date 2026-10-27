# Profile editing fix — raw evidence summary (2026-10-27)

Owner-reported bug: "when I change the name of user it is not changed and also
I can't add or modify the phone number, also the faculty and the wilaya and
the year."

## Root causes (each verified against source before fixing)

1. **Name "not changed"** — `/settings`' personal-info card PUTs to
   `PUT /api/users/me` and the row IS updated server-side, but the page never
   called `AuthContext.refreshProfile()` afterwards. Every identity surface
   (AppHeader avatar, `/profile` chips, a hard-reloaded page) reads the cached
   session user in localStorage (`hamame_auth`), so the old name stayed visible
   until logout+login. `refreshProfile` existed precisely for post-save syncing
   (per its own doc comment: "e.g. after onboarding or settings saves") and was
   never wired to this form.
   Secondary: form state initialized once with `useState(user?.fullName ?? "")`
   at mount, and `user` is null on a hard reload until the localStorage
   hydration effect lands — fields initialized EMPTY and never resynced.
2. **Faculty/year/wilaya** — same staleness as (1), plus a data-destroying trap:
   after a hard reload the empty form state (`"" !== user?.facultyId`) made a
   save send `"facultyId": null` / `"yearId": null` / `"wilaya": null`, which
   the server accepts as "explicit clear" — i.e. saving the reloaded form could
   WIPE the real faculty/year/wilaya, and the UI showed old values anyway.
3. **Phone** — two independent locks: (a) the `/settings` phone input was
   deliberately rendered `readOnly`; (b) more fundamentally the server-side
   schema `updateProfileSchema` in `src/routes/users.routes.ts` had no `phone`
   key, so `validateBody` (Zod strips unknown keys) silently discarded any
   phone the client sent — the value could never persist even via direct API.

## Fixes

### Backend (`src/routes/users.routes.ts`)
- `updateProfileSchema` gained `phone: z.string().trim().min(6).nullable()
  .optional()` (register's `phone` uses min(6) without trim; PUT trims first).
- Handler: explicit-null clears phone; changed phone must not collide with a
  live account's number → `409 PHONE_IN_USE` (pre-check with
  `findFirst({ phone, id: {not}, status: {not: "deleted"} })` + a P2002 race
  backstop after the update, since the global error mapper would otherwise
  surface the unique violation as a raw 500).
- Verification honesty: `phoneVerifiedAt` binds to the NUMBER, not the account
  — changing or clearing the phone resets it to null; re-sending the identical
  value leaves it untouched.

### Frontend
- `web/src/app/settings/page.tsx`: phone input editable (min-6 client check →
  `settings.phoneTooShort`); form fields re-sync when the session identity
  changes (React's render-time adjust pattern — the setState-in-effect
  alternative fails the react-hooks ESLint rule); `PHONE_IN_USE` and
  `YEAR_FACULTY_MISMATCH` mapped to FR/EN toasts (unknown errors keep the raw
  message); `refreshProfile()` called after every successful save so the
  header/profile/cached session show the new values immediately.
- `web/src/app/profile/page.tsx`: hero card gained an outline `ButtonLink`
  "Modifier le profil" → `/settings` (the card previously had no edit
  affordance at all; editing stays in one place instead of duplicating the
  form on two pages).
- `web/src/lib/i18n.ts`: added BOTH sides `settings.phoneHint`,
  `settings.phoneTooShort`, `settings.errPhoneInUse`, `settings.errYearMismatch`,
  `profile.editProfile`; removed the now-dead `settings.phoneReadonly`.

## Raw evidence
`2026-10-27-profile-edit-raw.log` in this folder — 37/37 assertions through the
REAL API on :3000 (`tmp-verify-profile-edit.mjs`, gitignored):

- register/login of two throwaway accounts; baseline `GET /users/me`
  (phone=null on a fresh email account).
- fullName PUT → 200 and persisted on a fresh GET ("name not changed" fixed at
  the API level; the UI-level stale-session cause is fixed by refreshProfile).
- phone lifecycle: add (200, persisted, phoneVerifiedAt null) → DB poke marks
  it verified → SAME value (200, verification UNtouched) → CHANGED value (200,
  verification reset to null) → other account tries the same number (409
  PHONE_IN_USE, exact code) → explicit null (200, phone cleared, verification
  reset). 5-char phone rejected 400 VALIDATION_ERROR.
- curriculum: real faculty+year pair PUT → 200, both persisted on fresh GET;
  a year belonging to ANOTHER faculty → 400 YEAR_FACULTY_MISMATCH. Wilaya PUT
  → 200, persisted.
- Cleanup: both `vf-profile-*@verify.hamame.test` accounts soft-deleted through
  the real `DELETE /api/users/me`; pattern count 2 → 0 re-queried; deleted
  account's login rejected 401. Phones are loudly fake
  (`+2130000000xx`); the only real rows touched are read-only prisma reads of
  a faculty/year fixture.

## Disclosed environment/harness quirks hit during this run
1. First `npm run dev` crashed `EADDRINUSE` (orphan from the previous agent
   session held :3000; cleared moments later).
2. Session pooler saturated (`EMAXCONNSESSION`, pool_size 15) — every API
   query 500'd; dev server restarted with `DATABASE_URL` env-override to the
   transaction pooler 6543+`pgbouncer=true` (process-local only). First
   transform appended `?pgbouncer=true` although the env URL already carried a
   query string → invalid connection string; corrected to `&`.
3. The stdout capture went through PowerShell `tee` (UTF-16) and the cp850
   console, mangling em-dashes into three codepoints (U+00D4 U+00C7 U+00F6);
   the committed log restores them via an exact codepoint replacement.
4. Harness cosmetic bug: `assertEq` prints its label twice on each line.
5. `phoneVerifiedAt` fixture steps poke the column via prisma on the
   disposable rows only (snapshot discipline documented above; whole accounts
   are throwaway).
6. Browser Playwright is unauthenticated-only (no test credentials in the
   repo; register is rate-limited). The form fixes are therefore verified by
   wet-run API + code review + the green gates; no authenticated click-through
   screenshot exists — same disclosed limitation as §33/§34.

## Gates (this round)
- Backend `npx tsc --noEmit` 0; `npm test` 73/73.
- Web `tsc --noEmit` 0; `eslint` 0 errors (3 pre-existing `<img>` warnings);
  `next build` 0; Playwright e2e 4/4 after one flaky-startup retry (2 failed /
  2 passed on first attempt — the documented dev-server startup flakiness of
  this machine; second run 17s all green, hydration-mismatch warnings are the
  pre-existing theme ones).
