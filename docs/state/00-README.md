# 00 — State of the project (index; built 2026-10-02 on `0a0a200`)

- `01-git-history.md` — 64 commits with dates, branches, Cursor/OpenCode/unknown attribution.
- `02-backend-inventory.md` — every mounted route + gate, cron/boot jobs, middleware, scripts, contract mismatches.
- `03-frontend-inventory.md` — 33 routes, 39 components, 11 lib files, 3 contexts, 954+954 i18n keys, theme + onboarding.
- `04-data-model-and-migrations.md` — 24 migrations, status output, schema-vs-doc diff, activation semantics, schema flags.
- `05-env-and-deploy.md` — env var names only, graceful-degradation map, Railway/Vercel as configured, pins and scripts.
- `06-quality-and-verification.md` — real gate outputs, verification-file index, UNVERIFIED-by-log list.
- `07-open-items.md` — consolidated tagged list with next actions.

Status in 5 lines: production is live and green on all remotes (Railway +
three Vercel projects) with the full study platform working (bank, sessions,
progress, spaced repetition, simulations, billing, social, notifications).
Code-complete but unproven without keys or live walks: OAuth round-trip, real
SMS, AI output quality, onboarding end-to-end, themes in human eyes.
Not built: feed/groups/messages/Sparx/ECOS/shared-sessions and the parked
backend-gated set in 07. Known data risks: the 15-faculty draft list and the
fileUrl/file_url drift both await owner rulings. Docs carry UNVERIFIED marks
wherever the pooler blocked live checks.
