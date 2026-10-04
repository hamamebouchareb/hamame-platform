# 00 — State of the project (index; rebuilt 2026-10-04 on `9a6c8e3`, HEAD `9a6c8e3`)

- `01-git-history.md` — 79 commits with dates through `9a6c8e3`, branches, Cursor/OpenCode/unknown attribution, plus every commit since `cba9a52`.
- `02-backend-inventory.md` — every mounted route + gate, cron/boot jobs, middleware, scripts, contract mismatches.
- `03-frontend-inventory.md` — 33 routes, 39 components, 11 lib files, 3 contexts, 954+954 i18n keys, theme + onboarding.
- `04-data-model-and-migrations.md` — 24 migrations, status output, schema-vs-doc diff, activation semantics, schema flags.
- `05-env-and-deploy.md` — env var names only, graceful-degradation map, Railway/Vercel as configured, pins and scripts.
- `06-quality-and-verification.md` — real gate outputs (backend tsc/build exit 0, BR-2 harness PASS, importer dry-run), verification-file index, UNVERIFIED-by-log list.
- `07-open-items.md` — consolidated tagged list with next actions (file_url resolved; importer 9/7/26 restored; three import bugs fixed; resources importer missing; no image questions; clinical cases out of v1; review-approve never --apply).
- `10-owner-actions.md` — one line per owner decision with the exact next action.
- `08-evidence-batch-a.md` — raw HEAD/status/diff/file outputs behind the file_url fix + drift answer.

Status in 5 lines: production is live and green on all remotes (Railway +
three Vercel projects) with the full study platform working (bank, sessions,
progress, spaced repetition, simulations, billing, social, notifications).
Code-complete but unproven without keys or live walks: OAuth round-trip, real
SMS, AI output quality, onboarding end-to-end, themes in human eyes.
Not built: feed/groups/messages/Sparx/ECOS/shared-sessions and the parked
backend-gated set in 07. Known data risks: the 15-faculty draft list awaits
an owner ruling (file_url drift is fixed). Docs carry UNVERIFIED marks
wherever the pooler blocked live checks.
