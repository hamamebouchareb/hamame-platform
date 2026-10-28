# Résidanat sitting-year ladder (canonical reference)

Status: reference doc for importers (prisma/seed-residanat.ts consumers and
`src/scripts/import-content.ts` batches). Established 2026-10-28 (handoff §38).

## The ladder

The Résidanat exam sittings cover **22 years, 2005–2026 inclusive**:

```
examYear: 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015,
2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026
```

## Conventions

- `Question.examYear` — 4-digit integer year (`1000..9999` validation in
  `src/scripts/import-validate.ts` and zod route schemas).
- `Question.sittingLabel` — free text; canonical form for this content:
  `Résidanat <year>` (e.g. `Résidanat 2019`). Free text is by design;
  other sitting labels (e.g. `EMD`) remain valid for other content.
- Filtering: `examYear` exact; `examYearFrom`/`examYearTo` inclusive range;
  `sittingLabel` exact — all enforced server-side in
  `src/lib/question-filters.ts` (`buildQuestionWhere`) and exposed through
  `GET /api/questions` + the by-sitting picker in
  `src/routes/questions.routes.ts` (distinct `(examYear, sittingLabel)`
  pairs actually present in the bank).
- **No Year rows are created per sitting year.** Hamame records bank
  coverage; the picker only lists years that have content (this is the
  recorded design decision — handoff §37/§38; MedSpark's full visual
  ladder is their exam-appearance metric, deliberately not imported).
  MedSpark parity read: their `/year/residanat` route is a dynamic
  `[yearId]` page whose UI carries a `residanatHintFiveYears` hint
  (name-level structural observation only).

## Where Résidanat questions root in the catalog

`Faculty (per-wilaya) → Year label="Résidanat" (track medecine|dentaire|
pharmacie) → Module (specialty taxonomy, seeded by prisma/seed-residanat.ts)
→ Unit (to be authored per content) `. 465 starter modules exist
(`docs/verification/2026-10-28-residanat-catalog-raw.log`). The taxonomy is
a starter list from standard residency nomenclature — extend by editing
`prisma/seed-residanat.ts` consistency with the rest of the catalog.
