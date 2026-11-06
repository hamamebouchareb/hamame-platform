# Résidanat (hb-db) MBset-parity filtering — build + verification note (2026-11-06)

## What was built

- `prisma/schema.prisma` + migration `20261106000000_add_question_residanat_facets`: `Question.category/subcategory/period` (nullable) + indexes on `exam_year/sitting_label/category/subcategory/period`.
- `src/lib/question-filters.ts`: `category/categories`, `subcategory/subcategories`, `period/periods` (singular wins, NULL never matched by explicit facet — same rule as `examYear`).
- `src/routes/questions.routes.ts`: list accepts singular facets; counts accepts singular+plural and returns `byPeriod/byCategory/bySubcategory` (each grouped with its own selection excluded, other two kept — same "chips stay visible" rule as `sittings`).
- `src/routes/sessions.routes.ts`: create-session accepts facets, passes into shared `buildQuestionWhere`, echoes facets in player payload.
- `src/scripts/import-validate.ts`: `Combinaison` accepted (QCM semantics), `MAX_OPTION` 200→1000 (50 real French options >200), facet string/null checks.
- `src/scripts/import-content.ts`: `questionHash` includes facets + `Combinaison→QCM` normalization; unit fingerprint SELECT carries facets; writer persists facets and maps `Combinaison→QCM`; CSV columns extended.
- `src/scripts/import-hb-db.ts`: pure converter `hb-db/out-years/<code>-<year>/quiz.json + expl/` → Hamame batch JSON. Faculty map `alg→fac-alger, set→fac-setif, ora→fac-oran, bat→fac-batna, con→fac-constantine, ann→fac-annaba, tiz→fac-tizi-ouzou, tle→fac-tlemcen, sba→fac-sidi-bel-abbes, bli→fac-blida`; `year='Résidanat', track='medecine', module=category, unit=subcategory|'Général'`, `examYear=<year>`, `sittingLabel='Résidanat <year>'`, `source='official_exam'`, grouped `casStory` prepended, `Combinaison` key expanded from combined strings (`"ABCDE"`→letters), explanation = `expl/main` + per-letter justifications. No DB writes; batch lands `pending_review` via `import-content --apply`.
- `.gitignore`: `hb-db/hamame-batch*.json` (62 MB generated batch never committed).

## Evidence (raw logs on disk)

- `docs/verification/hb-db-convert.log` — 175 sections, 24,429 converted, 19,779 valid, 4,650 rejected (4,511 missing explanation in source `expl/main=null`, 516 QCM + 86 QCS-variant missing/multi-correct keys, 18 fewer-than-2-options, plus ~13 duplicate-option rows — all genuine source gaps, correctly rejected by the validator).
- `docs/verification/import-content-dryrun-tiny.log` — 20-row pilot over `:6543` (dry-run): 20 QCS valid, curriculum plan `CREATE module Parasitologie/ORL/UMC…` + units under `fac-alger` `Résidanat/medecine`, 0 rejected, 0 skipped-duplicate.
- Backend `npx tsc --noEmit` exit 0; `src/lib/question-filters.test.ts` + `src/scripts/import-validate.test.ts` 18/18 pass (New facet tests included).
- Live probe `tmp-probe-category.mjs` (gitignored scratch): `Invalid prisma.question.count() invocation: The column questions.category does not exist` — proves the migration is **not yet applied**.

## Pending (requires pool access)

`npx prisma migrate deploy` currently fails `EMAXCONNSESSION` on `:5432` (pool_size 15 saturated by live backend) and hangs over `:6543` (schema engine needs session mode). The migration SQL is hand-written in `prisma/migrations/20261106000000_add_question_residanat_facets/migration.sql`; apply it when the pool frees, then verify with the probe above (expect a count, not an error), then run a 20-row `--apply` pilot and re-prove BM-2 hiding of `pending_review` before any full 19.8k import. Do **not** bulk-approve — keys remain provisional until confirmed against official corrigés via review queue.
