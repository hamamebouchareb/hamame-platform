# 17 — Test plan (PLAN ONLY — no code, schema, migration, env, or data changed here)

Baseline: `npm test` runs colocated `src/lib/*.test.ts` via
`node --import tsx --test` (suspension, google-link, normalize-email,
exam-deadline — 14 tests, all pure, no database). Everything else is proven
by throwaway harnesses, not committed tests.

## What BR-2 is

The mandatory validation gate: only `status='approved'` questions (and
lessons with a published `currentVersionId`) are visible to students,
enforced in `buildQuestionWhere` (`src/lib/question-filters.ts:43-44`,
default `approved`) plus the lesson-list gate. It is the reason pending
imports can never leak.

## Which tests to add

1. BR-2: `buildQuestionWhere` already pure — assert the default `approved`
   status, university scoping, and that no input combination drops the gate.
2. Redemption: the promo/activation grant math (stacking rule
   `max(currentPeriodEnd, now)`, plan-switch condition, grantsDays) — pure
   today only as inline route code; needs extraction (below).
3. Scoring: the finalize rule — gradable = QCM/QCS only, unanswered counts
   as wrong, empty-gradable yields null not 0
   (`sessions.routes.ts:858-870`) — inline today, needs extraction.
4. Keep: validator tests for `import-validate.ts` (pure already, untested).

## Pure helpers to extract (files + order of work)

1. `src/lib/question-filters.ts` — no extraction needed; write
   `question-filters.test.ts` first (smallest, highest value: BR-2).
2. `src/lib/scoring.ts` (new) — move the finalize computation verbatim
   (`sessions.routes.ts:858-870`); then `scoring.test.ts` (all-correct,
   all-wrong, unanswered-as-wrong, QROC-excluded, empty-is-null).
3. `src/lib/redemption-grant.ts` (new) — move the extend-vs-create +
   plan-switch decision (`promoCodes.routes.ts` + `activationCodes.routes.ts`
   shared shape); then `redemption-grant.test.ts` (healthy extend, stale
   extend-from-now, off-plan switch, no-subscription create).
4. `src/scripts/import-validate.ts` — already pure; add
   `import-validate.test.ts` beside the scripts (excluded from build like
   the rest of `src/scripts`, still runnable under `npm test` by path).
5. Wire every new file into the `npm test` script line (same one-line
   pattern as the existing four) and keep the backend CI `npm test` step —
   no new tooling, no database in unit tests, ever.
