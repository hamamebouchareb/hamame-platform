# 07 — Open items (consolidated 2026-10-02; importer + review status updated 2026-10-04)

Tags: BLOCKED-ON-OWNER (needs credentials/money/account), DECISION-GATED
(needs a product call), KNOWN-BUG, TECH-DEBT, PARKED (deliberately deferred).

- Google OAuth live round-trip — BLOCKED-ON-OWNER. Code complete, fail-closed
  501s verified; needs console client ID/secret + Railway env + one real
  login. Next: owner creates credentials (handoff §16 checklist).
- Real SMS delivery — BLOCKED-ON-OWNER. Twilio code warn-only complete;
  needs account + sender number + env + one real Algerian SMS. Next: owner.
- Automated payment (CIB/SATIM self-service) — DECISION-GATED/deferred.
  Manual path (activation codes) is the live mechanism. Next: product call.
- ANTHROPIC_API_KEY AI review — BLOCKED-ON-OWNER. Key intentionally absent;
  both AI features degrade cleanly. Next: add key only to judge output quality.
- `submittedAt` column — TECH-DEBT. Review queue sorts by `createdAt`;
  no submitted timestamp exists. Next: migration + backfill decision.
- Author drafts list — TECH-DEBT. Only aggregate `/authoring/me/stats`
  exists; no GET of own drafts. Next: endpoint + UI decision.
- Activation-code scoping — KNOWN-BUG (by design, documented): grant is
  blanket premium (subscriptions has no faculty/year columns); zero-amount
  `manual_assisted` payment created at redemption. Next: accept or scope
  subscriptions (migration + gating rewrite).
- Lint errors — TECH-DEBT. Current full measure: 7 errors (all
  set-state-in-effect) + 4 warnings (unused imports), files listed in 06.
  Backend has no lint setup at all. Next: per-file convention fixes.
- Parked features (need backend + product decision each): social feed,
  groups, messages, Sparx balance, bookstore, "Créer une page", ECOS
  session types, shared sessions, per-mode scoring, real scheduled-sim
  product expansion, self-service payment. Next: product calls, one at a time.
- Redundant Vercel express project — DECISION-GATED. Deploys backend next
  to Railway; green now, but pointless duplication. Next: keep as staging
  or delete.
- 15-faculty draft list — DECISION-GATED. Seeded `beta`; owner must confirm
  or correct. Next: owner ruling.
- Draft faculty `beta` vs `live` — DECISION-GATED. Visible either way;
  `live` is the graduation call. Next: owner.
- `LessonAttachment.fileUrl` vs live `file_url` — RESOLVED 2026-10-02 by
  one-line `@map("file_url")` (commit `9eb8361`; evidence batch 08).
  Removed from the open list.
- Bulk importer — LIVE, production-verified 2026-10-04. Dry-run + chunked `--apply` + manifest + rollback scripts work; production verification passed with the bank restored to `questions=9 lessons=7 options=26 modules=1 units=1` and zero `[TEST-IMPORT]` rows (see `docs/verification/packagea-resume-20261004.log`). Next: real content batches, one faculty/year at a time.
- Import bugs found and fixed (2026-10-03/04): (1) fingerprint omitted `isCorrect` so QCM/QCS re-imports duplicated — fixed, re-import now skips; (2) QROC `answer` has no column — hashing an unstored answer can never match, so the hash covers `explanation` and the validator now rejects any `answer` field (reference answer lives in `explanation`); (3) student unit lesson list leaked pending lessons as phantom rows (detail 404s) — fixed with a `currentVersionId not null` gate (commit `7c9f265`, harness `BR2: PASS`).
- Resources importer — MISSING. No bulk path for `resources`; only manual authoring/UI exists. Next: product call whether a resources importer is needed.
- Image questions — UNSUPPORTED. `questions` has no attachment table, so image-based questions cannot be imported or stored; not just deferred. Next: product call + schema decision if ever needed.
- Clinical cases — OUT of v1. Validator rejects `type: CLINICAL_CASE` with `clinical-out-of-v1`. Next: product call to scope v2.
- Bulk review-approve — CODE-COMPLETE, never run with `--apply`. Needs a `REVIEWER_JWT` or `REVIEWER_EMAIL` + `REVIEWER_PASSWORD` env (never logged, never committed); dry-run lists the pending queue over HTTP so BR-2 gates and   hooks run as in the UI. Next: owner provides reviewer env and runs dry-run first on real batches.
- Unenforced suspensions — RESOLVED 2026-10-06. Restriction wrote
  `status=suspended` but nothing read it (login 200, all endpoints open).
  Now: `isEffectivelySuspended` (`src/lib/suspension.ts`, unit-tested, `npm
  test`) gates login (403 `ACCOUNT_SUSPENDED` + end date) and every
  `requireAuth` route (30s per-user cache, invalidated on restrict/delete;
  optionals demote to anonymous); web signs out to `/login` with an FR/EN
  message. Moderation gate now includes `super_admin`. Other
  admin-without-super_admin gates left as-is: review
  (`academic_reviewer,admin`), activation codes (`support_agent,admin`).
  Proven in a real browser (screenshots + net log
  `docs/verification/susp-walk*`). Removed from the open list.
- Unused `notImplemented`/stub helper (`src/lib/stub.ts`, `src/lib/errors.ts:14`)
  — TECH-DEBT. Zero live 501 stubs (verified: no route imports it). Next:
  delete the helper or leave it.
- Test accounts with rotated passwords — BLOCKED-ON-OWNER. Passwords live
  out-of-band; heavy/seed-heavy still stamps a burned value on recreate.
  Next: owner-managed rotation; no test-password commits ever.
- Code grep 2026-10-02: zero TODO/FIXME hits in src/ and web/src; the only
  501s are the env-gated OAuth paths (by design) plus the unused stub above.

UNVERIFIED by raw log (carried from 06): onboarding wizard end-to-end,
themes + header cycler, all UI shell migrations, heading tiers, token
rename, generate fix beyond CI green, API forensics, OAuth/SMS/AI live
quality, simulation live-fire, leaderboard content.
