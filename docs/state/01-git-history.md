# 01 — Git history (verified 2026-10-02, HEAD `1d0ccf1`)

Source: `git log --format='%h %ad %an %s' --date=short` (64 commits, oldest
first at the bottom). Branches: `main` (tracks `origin/main`),
`ui/design-system-primitives` (merged, kept as checkpoint),
`origin/main`, `origin/ui/design-system-primitives`. `git status`: clean
at time of writing.

Attribution: commits carrying a `Co-authored-by: Cursor` trailer are marked
Cursor. Commits from the 2026-09-29..10-02 UI/onboarding/docs pass without a
trailer were produced in OpenCode sessions (per the handoff record). Older
commits with author `Hamame` and no trailer are marked unknown.

```
1d0ccf1 2026-10-02 Hamame Docs: reconcile database schema doc with schema plus migrations [OpenCode]
c7e8d72 2026-10-01 Hamame Docs: fix section ordering 30 before 31 [OpenCode]
6641fcc 2026-10-01 Hamame Web: header theme cycler beside notifications [OpenCode]
927ba7c 2026-10-01 Hamame Themes: clair sombre systeme with light tokens [OpenCode]
d706d9c 2026-10-01 Hamame Onboarding: Year.track plus first-run bienvenue wizard [OpenCode]
3a2da30 2026-10-01 Hamame Web: simulations page onto PageShell plus primitives [OpenCode]
a0f8108 2026-10-01 Hamame Web: avatar menu account-only, secondaries into mobile drawer [OpenCode]
8560b14 2026-10-01 Hamame Web: suivi page onto PageShell plus Card and ErrorState [OpenCode]
7bc5d4f 2026-10-01 Hamame Docs: red board was Vercel express project, fix proven live [OpenCode]
f827859 2026-10-01 Hamame Fix: run prisma generate in build plus postinstall [OpenCode]
0efbb84 2026-10-01 Hamame Docs: Railway failure not found via API, pipeline healthy [OpenCode]
6c4b6f2 2026-10-01 Hamame Docs: Railway diagnosis follow-up, no railpack override [OpenCode]
af8eca5 2026-10-01 Hamame Docs: Railway stale Prisma Client diagnosis [OpenCode]
fea72c7 2026-10-01 Hamame Web: StudyTimer actions onto Button [OpenCode]
ce0b46d 2026-10-01 Hamame Web: review plus revision cards onto primitives [OpenCode]
ab70dc5 2026-10-01 Hamame Web: CurriculumToolbar onto Card plus Field primitives [OpenCode]
f1094e2 2026-10-01 Hamame Web: SessionBuilder onto shared primitives, handoff 21 [OpenCode]
5d0b127 2026-09-30 Hamame Web: migrate settings page to PageShell plus primitives [OpenCode]
1ae2f20 2026-09-30 Hamame Docs: remove raw phone-camera scans from tracking [OpenCode]
07fe9eb 2026-09-30 Hamame Web: migrate notes page to PageShell plus primitives [OpenCode]
b923b8a 2026-09-30 Hamame Web: migrate curriculum pages to PageShell [OpenCode]
aacec9b 2026-09-30 Hamame Web: sidebar init per repo convention (effect plus disable) [OpenCode]
9836a42 2026-09-30 Hamame Web: recent sessions on /qcm from existing history API [OpenCode]
b48ec0a 2026-09-30 Hamame Web: keep the sidebar on every signed-in page, and record the MedSpark re-check [Cursor]
a0d3617 2026-09-30 Hamame Web: show the curriculum path from the library down to the lesson [Cursor]
62b940d 2026-09-30 Hamame Web: replace the root redirect with a public landing page [Cursor]
b763f76 2026-09-30 Hamame Web: add a fixed five-tab bar on phones [Cursor]
dbe2967 2026-09-29 Hamame Web: migrate subscription+authoring to tokens, add dashboard sidebar [Cursor]
3764432 2026-09-29 Hamame Web: normalize page heading sizes into two responsive tiers [Cursor]
b7ef35a 2026-09-29 Hamame Web: fix typography tokens so the type scale actually applies [Cursor]
a0700cd 2026-09-29 Hamame Web: shared page shell + form/card/button primitives, applied to 3 pilot pages [Cursor]
3ed3add 2026-09-29 Hamame docs: remove web/AGENTS.md, folded into the root AGENTS.md [Cursor]
99f4f33 2026-09-29 Hamame docs: rewrite root AGENTS.md as the single agent-onboarding entry point [Cursor]
8c68b35 2026-09-28 Hamame Per-module performance breakdown: GET /api/progress/by-module + suivi section [unknown]
ae4fbde 2026-09-28 Hamame Docs: record first real scheduled simulation (2026-10-24, Medicine-wide) [unknown]
74527a6 2026-09-28 Hamame Docs: record Vercel Node-pin fix (exit-2 build failure, green after pin) [unknown]
5d31b28 2026-09-28 Hamame Web: pin Node >=20.9.0 via engines (Next 16 requirement, guards Vercel runtime) [unknown]
ef7b567 2026-09-28 Hamame Google OAuth: env-gated code flow with sub-stable account linking (M9) [unknown]
2e13775 2026-09-28 Hamame Scheduled simulations: register + official-mock exam sessions (P12 big half) [unknown]
4dce977 2026-09-28 Hamame Docs: mark EN/FR closed everywhere (handoff gates + gap checklist P14) [unknown]
8db1e2d 2026-09-28 Hamame EN/FR toggle: full UI in French + English with persisted preference [unknown]
5be7732 2026-09-28 Hamame Docs: precise EN/FR scope measurement + dedicated-session execution plan [unknown]
bd8576d 2026-09-28 Hamame Auth: SMS verification/reset delivery via Twilio (warn-only) for phone-only accounts [unknown]
d0d40eb 2026-09-28 Hamame Auth: per-IP rate limits on register/login/forgot-password/resend-verification [unknown]
f9db1af 2026-09-28 Hamame Final Sweep closeout: notification center, player/history/profile polish, e2e smoke, export charset [unknown]
dd736ed 2026-09-28 Hamame Docs: record production URLs + Resend email delivery (2026-09-28) [unknown]
376ab78 2026-09-28 Hamame Reset-password: hide token field when ?token= link present [unknown]
8647526 2026-09-28 Hamame Auth: send password-reset emails via Resend (best-effort, generic response kept) [unknown]
07a47f0 2026-09-27 Hamame Add Resend email verification (warn-only) + /verify page + resend endpoint [unknown]
e0005cf 2026-09-12 Hamame Chore: ignore Playwright test-results and playwright-report output [unknown]
5a62013 2026-09-12 Hamame Backend: env-driven CORS via ALLOWED_ORIGINS (CORS_ORIGIN as legacy fallback) [unknown]
2bd44aa 2026-09-12 Hamame Build: exclude src/scripts from tsc so scratch harnesses can't fail Railway builds [unknown]
80c8028 2026-09-12 Hamame Docs: consolidate handoff to canonical HAMAME_MASTER_HANDOFF.md (kept actively-maintained copy incl. rotation notice, removed numbered duplicate) [unknown]
0842315 2026-09-12 Hamame Security: seed-heavy reads heavy account password from SEED_HEAVY_PASSWORD, aborts if unset (no hardcoded testpass123) [unknown]
7403e6e 2026-09-12 Hamame Docs: notification trigger-path verification log (redacted, cited by notification-center commit) [unknown]
7acdc8d 2026-09-12 Hamame Backend+UI: notification center (CRUD + admin create, header bell, /notifications page, friend-accept social + activation-redeem prix best-effort hooks; trigger paths proven in notif-hooks-verify-raw-1789210372301.log) [unknown]
9f9dbe9 2026-09-12 Hamame Chore: gitignore one-off verification harnesses and local debris (verify-*.ts, step0_probe, test_*.ts, pid files, opencode.json) [unknown]
2ebb73e 2026-09-12 Hamame Frontend: F1 manual revision enrollment (Ajouter a mes revisions button reusing POST /reviews/enqueue on lesson detail + session player, TS2312 type fix) [unknown]
c0a7c05 2026-09-12 Hamame Docs: commit redacted verification audit trail (JWTs scrubbed, .gitignore exemption) [unknown]
7e83629 2026-09-08 Hamame Docs: handoff through Phase 8 design pass, gap analysis Phase 7 appendix, API contract/schema/PRD updates, MedSparkDZ cross-reference [unknown]
31c72b6 2026-09-08 Hamame Frontend: Phases 1-6 parity pages/components (builder, player, history, leaderboard, notes, drive, settings, mobile) + Phase 8 Blue-Violet design pass (tokens, motion, contrast, rail) [unknown]
e3a6b10 2026-09-08 Hamame Backend: Phases 1-4 MedSparkDZ parity (sitting taxonomy, answer-stats, history/leaderboard/notes/prefs/friends APIs) + activation codes + resources [unknown]
b78aca7 2026-08-24 Hamame Update HAMAME_MASTER_HANDOFF.md: re-verified ground truth + this session's work [unknown]
7912c78 2026-08-24 Hamame Initial commit: baseline snapshot of Hamame codebase [unknown]
```

## Commit groups (one line each)

- `7912c78` — baseline snapshot of the whole codebase.
- `b78aca7` — handoff ground-truth refresh.
- `e3a6b10` + `31c72b6` + `7e83629` — Phases 1–8 build: backend parity APIs, frontend parity pages, design pass, gap analysis, contract/schema/PRD docs.
- `c0a7c05` + `2ebb73e` + `9f9dbe9` — revision-enqueue feature, verification-log hygiene, gitignore rules.
- `7acdc8d` + `7403e6e` — notification center + trigger-path proof log.
- `0842315` + `80c8028` + `5a62013` + `2bd44aa` + `e0005cf` — security/ops chores (seed-heavy password, handoff dedup, CORS env, tsc script exclusion, Playwright ignores).
- `07a47f0` … `f9db1af` (2026-09-27/28 run) — email verification + Resend, password-reset hardening, production URL records, Final Sweep (notifications/player/history/profile/e2e/export), rate limits, Twilio SMS, EN/FR toggle + scope docs, simulations system, Google OAuth, Node pin, first real simulation record, per-module performance.
- `99f4f33` … `dbe2967` (Cursor, 2026-09-29) — agent onboarding doc, PageShell/primitives + pilots, typography token fix, heading tiers, subscription/authoring migration + first sidebar.
- `b763f76` … `b48ec0a` (Cursor, 2026-09-30) — phone tab bar, landing page, curriculum breadcrumbs (+ additive `context` API field), global sidebar + MedSpark re-check notes.
- `9836a42` … `927ba7c` + `6641fcc` + `c7e8d72` (OpenCode, 2026-09-30/10-01) — QCM recents, sidebar convention fix, curriculum shells, notes shell, settings shell, SessionBuilder/toolbar/cards/timer/suivi/simulations/avatar-nav migrations, themes + header cycler, build-script fix, deploy-pipeline forensics, schema-doc reconciliation.
- `d706d9c` (OpenCode, 2026-10-01) — onboarding: `Year.track` migration + seed + `/bienvenue` wizard.
- `1ae2f20` (OpenCode) — removed tracked phone-camera scans.
- `1d0ccf1` (OpenCode) — schema-doc reconciliation against schema + 24 migrations.
