# 14 — Token-invalidation plan (PLAN ONLY — no code, schema, migration, env, or data changed here)

Problem: JWTs live 7 days (`ACCESS_TOKEN_TTL`, `src/lib/jwt.ts`) and nothing
revokes them. After a password change, a password reset, a Google-link
password rotation, or a suspension, previously issued tokens keep working
until they expire (suspension is now enforced per-request, but a password
change leaves old tokens fully valid).

## Option A — `users.password_changed_at`

- Column: `password_changed_at TIMESTAMPTZ NOT NULL DEFAULT now()` (backfill:
  none needed — default covers existing rows as "changed at migration time",
  which conservatively kills pre-migration tokens on next request... see
  impact below; alternatively `DEFAULT '-infinity'`... no, keep `now()`).
- Middleware: compare token `iat` against the column; reject when
  `iat < password_changed_at`.
- Bump sites: change-password, reset-password completion, Google-link
  rotation, restrict (semantically odd — it is not a password event — but the
  suspension gate already covers restrict, so no bump needed there).
- Cons: second-granularity `iat` vs clock skew (a change in the same second
  as issuance is ambiguous); conflates password history with a general
  security epoch; the migration default choice decides whether the deploy
  logs everyone out at once.

## Option B — `users.token_version` (RECOMMENDED)

- Column: `token_version INTEGER NOT NULL DEFAULT 1` (backfill: none needed —
  the default IS the backfill; every existing row reads as version 1).
- JWT carries a `version` claim at sign time (`signAccessToken`); middleware
  rejects when `claim !== row.token_version`.
- Bump sites (`SET token_version = token_version + 1`): change-password,
  reset-password completion, Google-link rotation, restrict (explicit,
  unlike A — a suspension revokes sessions immediately even before the
  suspension gate is consulted... both layers stay, defense in depth).
- Grandfather rule: tokens WITHOUT a version claim (issued before this
  ships) are treated as version 1 — they keep working until a bump or
  natural expiry. No mass logout on deploy.

## Migration SQL (written, NOT applied — kept here, not as a migration dir,
## so `migrate deploy` can never pick it up by accident)

```sql
-- Pooler-safe single statement (ADD COLUMN with a non-volatile DEFAULT takes
-- no table rewrite and no extended lock beyond the catalog update).
ALTER TABLE "users" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 1;
```

When approved, generate it the pooler-safe way (`prisma migrate diff`
live DB vs schema, extract only this statement into a new migration dir),
then `migrate deploy` + `migrate status`.

## Middleware cost and cache interplay

- Cost per request: ~zero marginal. `requireAuth`/`optionalAuth` already do
  one indexed PK lookup selecting `status, suspendedUntil`
  (`src/middleware/auth.ts`); the version column rides the same row.
- Cache interplay: the 30 s per-user cache (`auth.ts`) would delay
  revocation by up to 30 s. The existing `invalidateAccountState(userId)`
  helper MUST be called at every bump site (change-password, reset,
  Google link, restrict — restrict/delete already call it), shrinking the
  window to in-flight requests only. Same single-process-Map limit as the
  rate limiter (documented, accepted).
- Already-issued tokens: survive under both options until a bump (A) or a
  bump (B); B additionally grandfathers claim-less tokens as v1. Neither
  option retroactively kills sessions on deploy day.

## Exact files to change (when approved)

1. `prisma/schema.prisma` — `tokenVersion Int @default(1) @map("token_version")` on User.
2. `src/lib/jwt.ts` — sign `version`, verify/return it.
3. `src/middleware/auth.ts` — compare claim vs row in both middlewares.
4. `src/routes/auth.routes.ts` — login/register embed version; change-password,
   reset-password, Google link/rotate paths bump it.
5. `src/routes/moderation.routes.ts` — restrict bumps it.
6. `docs/hamame_api_contract.md` — one line: 401 code for stale-version tokens.
7. Test: extend `npm test` (pure compare helper) + one harness proof
   (change password → old token 401s on next call).
