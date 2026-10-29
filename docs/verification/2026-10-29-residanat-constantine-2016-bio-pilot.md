# Résidanat ingestion pilot — Constantine 2016 biologie (Q5–Q14 staged)

Date: 2026-10-29 · Mode: standing · Target: production Supabase via sanctioned importer
Author: `seed-author@hamame.dz` (`27f52f12-df6b-43a6-be8a-12c0d4314aec`, instructor+admin)

## Task

First pilot batch of the Résidanat question bank: parse the Constantine 2016
biologie past paper (public official sujet + corrigé from ency-education.net)
and stage 10 questions into the review queue via the existing bulk importer.
All rows land at `pending_review` (BR-2 gate) — nothing student-visible.

## Source chain

1. `residanat-papers/Constantine/2016_biologie.pdf` (235 MB archive, commit `3833c11`)
   — two concatenated documents: copy 1 = clean OCR sujet (pages 1–17) + typed
   official corrigé (page 18, barème 0.2, dated 16/10/2016, Q100=ABDE); copy 2 =
   degraded duplicate (obj 346, holds the only Q1–4 text).
2. Extraction: zero-dep object-table extractor (`tmp-pdf-extract.mjs`, untracked
   scratch) → `residanat-papers/extract-2016-bio.txt`. Byte-verified UTF-8
   (é = e9); console garbling is the known codepage-850 non-bug.
3. Parser `tmp-parse-2016.mjs` (untracked scratch) → 96 questions Q5–100 +
   100/100 corrigé answers. CAS CLINIQUE block (page 16) collected and prepended
   to the stems of Q94–96 (the three questions that reference "ce patient");
   dropped before Q97 with an explicit anomaly note.
4. Emitted: `residanat-papers/import/constantine-2016-biologie.questions.json`
   (96 rows) + `...parse-report.txt` + `...pilot10.json` (Q5–Q14 slice).

Parse validation (from parse-report + `tmp-verify-parse.mjs`):

```
sujet questions parsed: 96 (numbers 5..100)
corrigé answers parsed: 100 (Q1..Q100 expected)
corrigé missing: none
correct-option count distribution: {"1":22,"2":37,"3":33,"4":4}
zeroCorrect=0 allCorrect=0 optCountBad=0 optTooLong(>200)=0 maxOptLen=105
bodyTooLong(>5000)=0 maxBodyLen=459
```

## Scope decision (disclosed to owner for veto)

- Faculty `fac-constantine`, year `Résidanat` (id `6db1ce70-8e4e-44d3-89d9-57863f833339`),
  track `medecine` — resolved, pre-existing.
- NEW module `Anatomie et cytologie pathologiques` (order 20, appended after 20
  existing clinical modules) — id `258d5e84-d50f-4ac8-813a-29af2a6f23a4`.
  (The 2016 "Épreuve de Biologie" content is anapath: tumeurs, inflammation.)
- NEW unit `Annale 2016 — Épreuve de biologie (Résidanat Constantine)` (order 0)
  — id `668a3be4-aa70-42be-9c6f-f02001018ad9`.
- The year had 20 modules / 0 units before this import (shells) — probed.

## Dry-run (reads only)

```
$ npx tsx src/scripts/import-content.ts --file residanat-papers/import/constantine-2016-biologie.pilot10.json --author 27f52f12-df6b-43a6-be8a-12c0d4314aec
db: host=aws-0-eu-west-1.pooler.supabase.com port=5432 database=postgres
rows: lessons=0 questions=10
valid: lessons=0 QCM=10 QCS=0 QROC=0 other=0
resolution plan (20 lines):
  CREATE module "Anatomie et cytologie pathologiques" under year 6db1ce70-8e4e-44d3-89d9-57863f833339
  questions:1..10: needs curriculum creates above — re-run with --apply
skipped-duplicate=0 rejected=0
mode: dry-run (reads: curriculum lookups + unit fingerprint SELECTs; no writes)
```

Importer quirk (documented, not a bug): in dry-run, `resolveScope` returns early
on a missing module, so the plan shows the module create but never the unit
create. The apply creates both. Disclosed so future runs don't misread the plan.

## Apply

```
$ npx tsx src/scripts/import-content.ts --file residanat-papers/import/constantine-2016-biologie.pilot10.json --author 27f52f12-df6b-43a6-be8a-12c0d4314aec --apply --allow-production
db guard: --allow-production acknowledged by owner, --apply permitted
valid: lessons=0 QCM=10 QCS=0 QROC=0 other=0
resolution plan (4 lines):
  CREATE module "Anatomie et cytologie pathologiques" under year 6db1ce70-8e4e-44d3-89d9-57863f833339
    -> created 258d5e84-d50f-4ac8-813a-29af2a6f23a4
  CREATE unit "Annale 2016 — Épreuve de biologie (Résidanat Constantine)" under module 258d5e84-d50f-4ac8-813a-29af2a6f23a4
    -> created 668a3be4-aa70-42be-9c6f-f02001018ad9
skipped-duplicate=0 rejected=0
chunk 1/1: wrote 10 questions
manifest: docs/verification/import-manifest-1793296566937.json
created: lessons=0 questions=10 options=50 years=0 modules=1 units=1
```

Manifest created ids (file gitignored; content preserved here):
modules `258d5e84-d50f-4ac8-813a-29af2a6f23a4`; units
`668a3be4-aa70-42be-9c6f-f02001018ad9`; questions
`1cac81cc-5e3a-46fc-8612-54dbec604db8`, `e11bcf8d-1e8d-45f1-9b25-819a14276d3f`,
`9f0261e2-75bf-448e-a962-ea8876579bca`, `39abfb1b-8df8-4fed-84b8-99f30e01a174`,
`16f89ef4-1f90-46b8-870f-b71cefc6b88a`, `288ecbb5-6f8d-470a-8a46-5f3d75a0e999`,
`e980367f-62a7-4967-b5f0-c910372c9bf7`, `790facc9-f03a-4662-9487-df64069efb54`,
`3f395a81-ba98-4c8a-a6d1-efde5157afef`, `ec580116-48ae-4062-a5e3-f1d42b6b25b2`;
50 options (full list in `docs/verification/import-manifest-1793296566937.json`).

## Post-apply verification (`tmp-verify-pilot.ts`, sequential awaits)

```
COUNTS: pending_review=11 (baseline 1, expect 11) approved=9 (baseline 9) official_exam=10 (baseline 0, expect 10)
rows under pilot unit: 10
  10 rows: status=pending_review type=QCM src=official_exam examYear=2016
  sitting="Résidanat Constantine — Octobre 2016" submittedAt=2026-10-29T17:56:03..06Z opts=5
Q5: corrigé=B marked=[.AXB.C.D.E] body="Quelle est, parmi les pathologies suivantes..."
Q6: corrigé=CE marked=[.A.BXC.DXE] body="Une metastase:..."
Q7: corrigé=BCE marked=[.AXBXC.DXE] body="Le carcinome in situ :..."
Q8: corrigé=A marked=[XA.B.C.D.E] body="Le carcinome squirrheux mammaire..."
Q9: corrigé=BE marked=[.AXB.C.DXE] body="Un adenome est une tumeur :..."
Q10: corrigé=AD marked=[XA.B.CXD.E] body="Les lymphocytes T :..."
Q11: corrigé=ACE marked=[XA.BXC.DXE] body="Parmi les mediateurs plasmatiques..."
Q12: corrigé=BE marked=[.AXB.C.DXE] body="La congestion active :..."
Q13: corrigé=BDE marked=[.AXB.CXDXE] body="L'oedeme I'nflammatoire:..."
Q14: corrigé=BDE marked=[.AXB.CXDXE] body="La tuberculosa:..."
review-queue query returns 11 questions (top of queue): 10 pilot rows by
seed-author@hamame.dz (submittedAt desc) + 1 legacy pending row
BR-2: approved questions under pilot unit = 0 (must be 0)
unit: Annale 2016 — Épreuve de biologie (Résidanat Constantine) (order 0)
module: Anatomie et cytologie pathologiques (order 20)
year: Résidanat track=medecine faculty=fac-constantine
RESULT: ALL CHECKS PASSED
```

Every question's per-option `isCorrect` flags reproduce the official corrigé
letters exactly (page 18 of the PDF: 5B 6CE 7BCE 8A 9BE 10AD 11ACE 12BE 13BDE
14BDE). The review-queue replication mirrors
`src/routes/review.routes.ts` (`status: pending_review`, author include,
submittedAt desc).

## Disclosed limitations

- **Q1–4 missing** (86 of 90): they exist only in the degraded copy-2 page
  (obj 346, OCR artifacts like "IVIedecine"); out of pilot scope. Recovery needs
  a targeted pass on that page.
- **OCR noise staged verbatim**: è→6 ("ulc6ro-h6morragique"), l→I ("I'abondance"),
  missing accents, stray "•"/"~" chars. Deliberate: reviewers fix during review;
  drafts are not student-visible. The `explanation` field carries the official
  corrigé letters + provenance and asks the reviewing author to write the real
  pedagogical explanation.
- **CAS CLINIQUE heuristic**: narrative prepended to Q94–96 stems (all reference
  "ce patient"); a case that no following question references would be dropped
  with an anomaly. One block in this sujet.
- **Scale**: only ~14 of 89 PDFs have typed sujets; the rest are image scans and
  need an OCR strategy before bulk ingestion (no tesseract/python on machine).
- **No cleanup performed**: rows are real review-queue content, not fixture data
  (no VERIFY- tags by design — this is the deliverable). Rollback path if the
  owner rejects: delete by unit `668a3be4-aa70-42be-9c6f-f02001018ad9` (+ the
  module/unit rows), per manifest ids above.

## Artifacts

Tracked: `residanat-papers/import/constantine-2016-biologie.questions.json`,
`...parse-report.txt`, `...pilot10.json`, `residanat-papers/extract-2016-bio.txt`,
`residanat-papers/papers-typed-inventory.csv`, this log.
Untracked scratch (gitignored): `tmp-parse-2016.mjs`, `tmp-verify-parse.mjs`,
`tmp-slice-pilot.mjs`, `tmp-verify-pilot.ts`, `tmp-db-probe*.ts`, extractor scripts.
