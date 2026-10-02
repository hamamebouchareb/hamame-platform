# 06 — Quality and verification (measured 2026-10-02)

## Gate outputs (real, this session)

- Backend `npx tsc --noEmit -p tsconfig.json` → exit 0.
- Web `npx tsc --noEmit -p web/tsconfig.json` → exit 0.
- Web `npm run lint` → **11 problems (7 errors, 4 warnings)**. NOTE: earlier
  session reports claimed 18–20 errors; the full current measurement is 7+4
  (methodology of the older counts is UNVERIFIED). Errors: all
  `react-hooks/set-state-in-effect` in `classement`, `notifications`,
  `verify` pages, `EnqueueReviewButton`, `NotificationsBell` (×2),
  `LanguageContext` (×2). Warnings: unused imports in `classement` (×2:
  apiFetch, ApiError), `resources` (×2: useEffect, useState). Backend has NO
  lint setup (no root eslint config/script — running eslint at root errors).
- Backend `npm run build` (`prisma generate && tsc`) → exit 0, client v6.19.3.
- Web `next build` → exit 0, 28 routes (27 static + dynamic as marked).
- Playwright smoke (`web/e2e/smoke.spec.ts`, chromium, browsers installed) →
  **2 passed** (login serves over HTTP; renders in chromium). Side notes from
  the run: "Slow filesystem" warning and a dev cross-origin HMR warning for
  127.0.0.1 (allowedDevOrigins) — dev-only, not app code.

## docs/verification/ index (101 files)

Raw logs (each proves the named check; FAILED- files are kept failures):
answer-stats (5 logs: percentages, exam-mode, no-explanation, comment),
auth-fix (jwt recheck + raw + 1 FAILED), builder-depth, design-pass (2),
f1-manual-enqueue (4), final-sweep, notif-hooks, phase3 (board rules),
phase4 (friends/social), phase5 (bank/player), phase6 (builder/timer/rail),
preview-a3 (coverband ×2), prisma-generate-build-before (the bare-tsc
repro, exit 2), resources (11 logs + 7 FAILED), screenshot-gaps,
sitting-depth, sort-by-year (+2 FAILED), year2-cleanup-proof.
Screenshots (~70 .png): per-phase DOM captures named by feature
(answer-stats-*, builder-depth-*, f1-*, phase3/4/5/6-*, sitting-depth-*,
a1-bell-open, preview-a3*, sort-by-year...). Plus README.md.

## Reported DONE but with NO raw verification log (UNVERIFIED by raw log)

- Final Sweep notification center paths beyond notif-hooks log.
- Onboarding wizard (`/bienvenue`, Year.track, seed counts).
- Themes (clair/sombre/systeme) + header theme cycler.
- All UI shell migrations (PageShell/primitives per page, sidebar, tab
  bar, landing, breadcrumbs, QCM recents, curriculum/notes/settings/
  builder/toolbar/cards/timer/suivi/simulations/avatar-nav).
- Heading tiers, token rename (`--text-*`).
- Prisma generate build fix (only the before-log + green CI remain).
- Railway/Vercel API forensics (live API reads, no on-disk log).
- Google OAuth live round-trip, real SMS delivery, AI output quality,
  simulation live-fire, leaderboard snapshot content.
