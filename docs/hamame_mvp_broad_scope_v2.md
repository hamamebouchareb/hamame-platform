# Hamame — MVP Scope (Broad, MedSpark-Aligned) — Draft v0.2

**This supersedes the "Lean MVP" proposal (v0.1).** Direction: go broad from launch,
matching the scope/feature breadth of the original PRD (Section 14) and the ambition
level of the MedSpark blueprint that inspired it — not the narrowed single-faculty cut
I proposed earlier.

This document keeps my earlier risk flags visible (so nothing is hidden), but no longer
forces scope cuts. The decisions here are yours; my job is to make sure they're informed
ones.

---

## 1. Scope: back to the original PRD's MVP (Section 14)

- **Faculties at launch:** Medicine, Dentistry, Pharmacy — all years, including
  résidanat-prep track, as originally specified.
- **Question types:** QCM, QCS, QROC, and clinical cases — full set.
- **Content:** Full Faculty → Year → Module → Unit → Lesson hierarchy, text-based
  lessons, for all three faculties.
- **Everything else from the original MVP list stays as written:** auth, dashboard,
  session builder, practice/exam modes, mock exams, notes, free/premium plans with
  payment, notifications, bilingual UI (FR/AR + RTL), theming, responsive design,
  content authoring + validation workflow, moderation, search.
- **Still explicitly excluded from V1** (as in the original PRD): AI tools, spaced
  repetition, gamification beyond basic streak tracking, offline downloads, native
  mobile apps, instructor marketplace, institutional accounts.

This is, functionally, a return to the original Section 14 MVP definition.

## 2. What going broad actually costs you (carried forward from the review)

Nothing below is new — it's the same risk analysis from before, kept here so it isn't
lost just because the scope decision changed:

- **Content-validation bottleneck (BR-2):** validated content for the first two years
  across *three* faculties, times four question types, before the MVP success gate is
  met. This is the largest single driver of both timeline and cost. It does not shrink
  by choosing to go broad — if anything, it's the main reason the original 4-month
  timeline (Section 3.1) is optimistic.
- **Premium thinness at launch:** since AI tools, gamification, and offline downloads
  stay excluded from V1, Premium's actual differentiators at launch remain: full
  official course content (vs. preview) and unlimited mock exams. That's real, but
  worth knowing going in rather than discovering post-launch.
- **Reviewer sourcing is now the critical path.** With broad scope, you need enough
  qualified reviewers across three specialties (medicine, dentistry, pharmacy) to
  validate two years of content each — not one. If reviewers aren't lined up yet, this
  single dependency likely determines your real launch date more than engineering does.

## 3. Recommended mitigation if you go broad (optional, not required)

If you want the ambition of MedSpark's full breadth without the timeline risk fully
landing on you unannounced, two things are worth deciding now rather than later:

1. **Stagger the *content* rollout, not the product.** Ship the platform with all three
   faculties live in the codebase/UI from day one (matching the "complete from day one"
   feel you're going for), but let content coverage catch up faculty-by-faculty behind
   the scenes if reviewer capacity turns out to be uneven — e.g., Medicine content ready
   at launch, Dentistry/Pharmacy content following within weeks. This preserves the
   MedSpark-like broad *feel* without silently slipping the whole launch date if one
   specialty's reviewers are slower to onboard.
2. **Set a real reviewer-sourcing plan as a parallel workstream now**, not after
   development starts — since it's the actual bottleneck, treat it with the same
   urgency as hiring developers.

Both are optional — flagging them so the choice to skip them is a choice, not an
oversight.

## 4. Roadmap (updated to match broad scope)

- **V1 (MVP):** All three faculties, all years, all four question types, as in the
  original Section 14 — no AI, no gamification beyond streaks, no offline.
- **V2:** AI Study Assistant, hints, note maker, answer locator, AI-enhanced
  explanations, spaced repetition, full gamification, automated payments, offline
  downloads, referral program, "Hamame Plus" content, multilingual audio, first
  institutional pilot — as originally planned.
- **V3:** Expansion faculties, instructor marketplace, community features, native
  mobile apps if needed — as originally planned.

## 5. Still open, and still worth answering when you're ready

1. Reviewers: any committed yet, across any of the three specialties?
2. Realistic timeline: is 4 months still the target, or is that flexible given the
   content workload above?
3. If reviewer capacity turns out uneven across specialties, are you open to the
   staggered-content approach in Section 3, or is "all three faculties fully ready
   simultaneously" a hard requirement?
