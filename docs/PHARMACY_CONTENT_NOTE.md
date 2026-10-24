# Pharmacy content note — decision record

**Status:** decision record (no build tasks in this note)
**Date:** 2026-10-23
**Evidence source:** live REA captures of medspark.online stored in
`%TEMP%\opencode\medspark\` (Next.js static chunks, routes dump). The strings
quoted below were extracted verbatim from those chunks on this date.

---

## 1. What MedSparkDZ ships for pharmacy (observed, live)

MedSparkDZ does **not** have a "pharmacy product" separate from its QCM bank.
The track is a **hardcoded frontend curriculum map** with per-year module
lists, observed in the app-layout chunk:

- Track picker row: `{id:"pharmacie", label:"Docteur en Pharmacie (Pharmacie)",
  years:["1","2","3","4","5"]}` — a third track alongside medecine/dentaire.
- A static year → module map with slugs such as:
  - `pharmacie-biomaths-informatique-biostatistiques` (Y1)
  - `pharmacie-biologie-cellulaire`, `pharmacie-physique-pharmaceutique`
  - `pharmacie-anatomie-fonctionnelle-descriptive`, `pharmacie-sciences-humaines-histoire-de-la-pharmacie-et-galenique`
  - `pharmacie-botanique-pharmaceutique`, `pharmacie-culture-generale` (Y2)
  - `pharmacie-chimie-minerale-pharmaceutique`, `pharmacie-genetique`, `pharmacie-physiopathologie` etc.
- Copy strings in the MCQ-bank dictionary: `"pharmacieHint":"Questions et
  examens de pharmacie"` (FR) / `"Pharmacy questions and exams"` (EN).
- Module display cards reference shared science modules (`pharmacologie`,
  `microbiologie`, `semiologie`) with per-module image assets like
  `/pharmacologie.png`.

There was **no observed dedicated pharmacy question volume, mock exam, or
pharmacy-specific tool** behind these UI surfaces in the captures — the
track map selects the same generic QCM/Sessions machinery.

## 2. Hamame's position and decision

1. **Hamame is schema-first, not hardcoded-curriculum-first.** Curriculum
   (faculty → year → module → unit) lives in the database with rollout
   gating (`planned`/`beta`/`live`), university scoping and the authoring →
   review pipeline. We do **not** mirror MedSpark's static JS curriculum map
   into the client; pharmacy slots in as a seeded faculty + years + modules
   whenever the owner decides to launch it — it is content/rollout work, not
   a code shape change.
2. **Pharmacy content volume is a content-production decision, not a code
   gap.** The REA evidence shows the competitor's pharmacy surface is the
   same QCM machinery scoped to a track, with no observed pharmacy-specific
   product behavior to reverse. Nothing in the parity gap list requires a
   new feature: the moment a pharmacy faculty is seeded (a few rows in the
   existing taxonomy), the complete happens-per-surface pipeline (bank at
   `/qcm`, per-module stats, readiness, simulations, groups, hints) already
   covers pharmacie students exactly as it covers medecine/dentaire.
3. **Do not copy the competitor's module slugs or per-year structure.** The
   `pharmacie-*` slug naming above is MedSparkDZ's naming convention. When
   Hamame seeds pharmacy, module names come from the pharmacie programme
   (the well-known Algerian Docteur en Pharmacie track) but through
   Hamame's own naming, seeded by the team — same rule every other surface
   follows (own schema, own palette, own vocabulary).
4. **What stays observable and can be revisited later (gated, not built
   now):** MedSpark shows a per-module track picker pre-filled with
   pharmacy years ["1"–"5"]. If Hamame ever ships a pharmacy faculty the
   rollout flow (`planned → beta → live`) already expresses this; planners
   only need to decide content volume first.

## 3. What NOT to do

- Do not hardcode a pharmacy module list anywhere in `web/src` mirroring the
  captured slug map — that reintroduces exactly the per-route drift we
  eliminated from the bank/nav.
- Do not treat "pharmacy missing" as a product gap in the analysis doc:
  this note is the record that it is a **content + seeding** decision,
  explicitly deferred until the owner chooses to launch pharmacie.

## 4. Trigger to act

When the owner signs off: seed a pharmacy faculty (rollout `planned` first),
its 5 years, its modules via the standard authoring pipeline, and set
`rolloutStatus` by the same FR-10a discipline used for every faculty. No
migration, no new endpoint, no frontend switch is required for that launch.
