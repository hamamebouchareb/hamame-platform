# 07 — Open items (consolidated 2026-10-02)

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
