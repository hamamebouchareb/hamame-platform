# Residanat past papers (sujets) — source material

Downloaded 2026-10-29 from the public listing at
`https://www.ency-education.net/medecine-residanat/1` (no authentication; papers
hosted on ency-education.net's own file host or via web.archive.org snapshots of
univ.ency-education.com). Named by faculty + year + épreuve.

Purpose: source material for Hamame's Résidanat question bank ingestion
(question + options + official correct answer, tagged `examYear`/`sittingLabel`,
`source: official_exam`). The PDFs themselves are **not committed** (see
`.gitignore` — ~236 MB binaries); only the manifest, inventory, and tooling are
tracked.

## Files in this folder

- `papers-url-manifest.csv` — the 89 source URLs, verbatim from the listing page
- `papers-inventory.csv` — per-file state: bytes, text-layer vs scan, source host
- `download-papers.ps1` — idempotent downloader (skips already-verified PDFs)
- `download-results.csv` — last run log (pre-retry; 3 transient 0-byte failures
  were re-downloaded and verified afterwards — all 89 now valid)

## Inventory

| Faculty | Files | MB | Years |
|---|---|---|---|
| Constantine | 37 | 121.4 | 2010–2026 (2019–2026 + 2022 ×2: février/décembre; épreuves: biologie, chirurgie, médecine) |
| Alger | 29 | 68.9 | 2011–2022 (dossiers cliniques, pathologie médico-chirurgicale, sciences fondamentales) |
| Oran | 8 | 13.9 | 2014–2022 |
| Annaba | 10 | 27.9 | 2010–2015 |
| Sétif | 3 | 2.0 | 2012 |
| Sidi Bel Abbès | 1 | 1.6 | 2011 |
| Tlemcen | 1 | 0.1 | 2009 |

Total: 89 PDFs, 235.7 MB. 33 have an extractable text layer; 56 are page scans
(need OCR). GB gaps (e.g. Alger 2020, Oran 2015 chirurgie/médecine, Annaba 2011/2013)
reflect what the public listing offers, not download failures.

## Note on corrigés

The listing hosts **sujets only** — no official answer keys. Before any question
enters Hamame's bank, keys must come from official corrigés (ministry/faculty
releases) and pass the review queue; MBset's keys are deliberately not a source.
