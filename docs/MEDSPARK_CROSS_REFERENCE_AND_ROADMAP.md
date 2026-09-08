# MedSpark / MedSparkDZ → Hamame: Cross-Reference & Roadmap

**Date:** 25 August 2026
**Inputs used:** Manus AI MedSpark blueprint (July 2026), MedSpark Frontend/UX/UI Audit (15 Aug 2026), MedSparkDZ Dossier complet frontend/UI-UX (Manus AI), MedSparkDZ Remaining-Route Audit (24 Aug 2026), against Hamame's current `hamame_prd_updated.md`, `hamame_api_contract.md`, `hamame_database_schema.md`, `hamame_mvp_broad_scope_v2.md`.

## 1. Headline finding

Hamame's PRD was already written with MedSpark/MBset as a competitive reference (see the `[MBset-inspired]` tags throughout the existing PRD). Cross-referencing the two live MedSparkDZ audits against it confirms: **almost everything MedSparkDZ actually ships in production, Hamame already has planned** — same five-space navigation shape (QCM/Studio/Modules/Suivi/Révision), same gamification (streaks, leaderboard, badges), same AI catalog (hints, note maker, answer locator, chat, podcasts), same freemium model (free QCM bank, paid official content + AI).

The audits surfaced **3 genuinely new, low-effort items** and **1 useful pricing data point**. Everything else is either already covered or explicitly not worth copying. Docs have been updated accordingly (see Section 4).

## 2. Net-new items added to Hamame's docs

| # | Item | Why it's worth adding | Effort | Where added |
|---|---|---|---|---|
| 1 | **Activation-code redemption** — student enters a single-use code (issued by Support/Admin after manual payment confirmation) to instantly unlock a specific faculty-year | Hamame's PRD already anticipated a "manual/assisted payment flow" for MVP but never defined *how* it works. MedSparkDZ's `/activate` route shows the exact working pattern for this market. Formalizing it removes an open question and gives you an auditable, low-risk MVP payment bridge. | Low (1 table, 1 form, 2-3 endpoints) | PRD FR-65/BR-18, API contract, DB schema |
| 2 | **Focus/study-timer presets** (Pomodoro 25/5, 52/17, 90-min focus, custom) | Purely client-side, zero backend cost, decent perceived-polish differentiator during exam-heavy study sessions. | Very low (frontend only) | PRD FR-66 |
| 3 | **Session-builder refinements**: result ordering (by year / by course / random) + inline exam-mode & "show statistics" toggles inside the builder itself | Confirms exact UX shape for a feature you already have (FR-15/16); just a couple of extra params/toggles, not new scope. | Very low | PRD FR-15/16 detail, API contract session-creation params |
| 4 | **Pricing data point**: MedSpark's paid tier is 500 DA/year, manual-payment-only, for reorganized courses + AI tools + trilingual podcasts | Informational only — confirms manual-payment is an accepted norm in this exact market segment, useful context for your own price-setting later. Not a recommendation to match this price. | N/A | PRD 17.4, noted as market data, not a target |

## 3. Confirmed — already covered, no action needed

These were all explicitly checked against the two MedSparkDZ audits and already exist in Hamame's PRD (mostly as `[MBset-inspired]` items from the earlier competitive pass):

- **Spark Drive** (curated official resources hub) → Hamame's "Hamame Drive" (PRD 10.2). *Data-layer gap found and fixed*: it had no backing table/endpoints yet — added (`resources` table, `/api/resources` endpoints).
- **Sparky AI chat** (Arabic-first conversational assistant) → Hamame's AI Study Assistant (FR-32), already Darja/Arabic-aware by design (NFR-6).
- **Study With Me** (shared timer, live chat, break mini-games) → Hamame's shared/group study sessions (FR-40, V2/V3). Note: "break mini-games" specifically wasn't named before; low priority, safe to fold in at V3 if/when you build this out — not adding a formal FR for it now given it's speculative and MedSparkDZ itself hasn't shipped it either (confirmed still "Bientôt disponible" / 404 on direct route).
- **QCM notes library** (searchable personal notes, PDF export) → FR-20 already covers this.
- **Leaderboard, streaks, badges, friends** → FR-36 to FR-40, all present.
- **AI-enhanced explanations, per-option justification, hints, note maker, answer locator, podcasts, PDF-to-question extraction** → all present in the AI Feature Catalog (Section 13 of the PRD) already, several explicitly `[MBset-inspired]`.
- **Notifications center** → FR-41/43, matches MedSparkDZ's simple retained-history + empty-state pattern.
- **Public landing page stat counters / marketing copy** (1000+ courses, 15000+ QCM, etc.) → marketing-site content, not a product feature; no PRD change needed, just a note for whoever builds the marketing page.
- **Role-gated admin-only areas** (MedSparkDZ's "Communauté"/"Collaborations" locked to admins) → consistent with Hamame's existing role model (Section 6); no change needed.

## 4. Files updated in this pass

- **`hamame_prd_updated.md`** — added FR-65, FR-66, BR-18, refined FR-15/16, updated MVP included-list, feature catalog, and pricing philosophy section. All additions tagged `[MedSparkDZ-confirmed]` so they're traceable.
- **`hamame_api_contract.md`** — added Activation Codes endpoints, Resources ("Hamame Drive") endpoints, and session-creation query params (`sort`, `examMode`, `showStats`).
- **`hamame_database_schema.md`** — added `activation_codes` and `resources` tables, with a dated note explaining why.
- **`hamame_mvp_broad_scope_v2.md`** — added a short addendum (Section 4a) documenting this cross-reference so the reasoning isn't lost.

## 5. Suggested next action

Given your current focus (Task 6b/8 frontend quality pass), none of these three new items are urgent — they're additive, not blocking. Recommended sequencing once 6b/8 are closed:

1. **Activation codes** first — it's the one with real product impact (unblocks a clean monetization path) and is small (~1 table + 2-3 endpoints + 1 simple form).
2. **Session-builder ordering/toggles** — trivial addition next time you're touching the session-builder frontend anyway.
3. **Study timer presets** — whenever you want a quick, low-risk UI win; zero backend coupling means it can slot in anytime without disrupting the current verification discipline.
