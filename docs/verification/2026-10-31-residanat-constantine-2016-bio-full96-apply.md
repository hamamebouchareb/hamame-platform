# Résidanat ingestion — Constantine 2016 biologie, FULL 96-row apply (Q5–Q100 live)

Date: 2026-10-31 · Mode: standing · Target: production Supabase via sanctioned importer
Author: `seed-author@hamame.dz` (`27f52f12-df6b-43a6-be8a-12c0d4314aec`, instructor+admin)
Companion: pilot evidence `2026-10-29-residanat-constantine-2016-bio-pilot.md`
(Q5–Q14 already staged; this file completes the remaining Q15–Q100 through the
same 96-row batch file so the importer's dedup reconciles the overlap.)

## Block and the standing-documented unblock (6543 transform)

First task of the day was a 5432 probe — the session pooler was still saturated
by the live Railway backend's Prisma pool (10th+ occurrence across Oct 29–31):

```
$ npx tsx src/scripts/import-content.ts --file ... --author 27f52f12-...
db: host=aws-0-eu-west-1.pooler.supabase.com port=5432 database=postgres
import failed:
Invalid `db.faculty.findUnique()` invocation in
C:\dev\hamame1\src\scripts\import-content.ts:267:36
Error querying the database: FATAL: (EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15
Exited with code 1
```

The canonical fix (Railway `DATABASE_URL` → append `?connection_limit=8` +
redeploy) remains owner-side. Instead of waiting, this run used the STANDING
harness workaround already recorded in the handoff (§34 convention; §31/§32/§33
precedents incl. the Oct 25 deploy batch and the Oct 28 catalog seed): a
process-local DATABASE_URL transform `':5432' -> ':6543'` then append
`'&pgbouncer=true'` — copied verbatim from the tracked implementation
`prisma/seed-residanat.ts:138-152`. `.env` untouched; the transform lives for
the process only. Driver: `tmp-6543-driver.ts` (untracked scratch; `TMP6543`
env selects probe / dryrun / import / verify).

## Probe through 6543 (baseline, reads only)

```
$ TMP6543=probe npx tsx tmp-6543-driver.ts
# conn: 5432->6543 transform applied (pgbouncer=true), process-local only — .env untouched
probe SELECT 1: [{"ok":1}]
baseline via 6543: pending_review=11 approved=9 official_exam=10 unit-rows=10
PROBE OK
```

(post-failed-apply probe later re-proves the same baseline — see below.)

## Validation harness fixes (disclosed)

1. `tmp-6543-driver.ts` initially used top-level `await import(...)` — tsx/CJS
   rejects top-level await (`ERROR: Top-level await is currently not supported
   with the "cjs" output format`); wrapped dispatch in `async main()` (known
   repo quirk).
2. **Tracked-file change, one line, `src/scripts/import-content.ts`:** the
   chunk writer's `prisma.$transaction(...)` (line 531) used the Prisma default
   5 s interactive-transaction timeout. Measurement through 6543
   (`tmp-tx-latency.ts`, raw below) shows ~145–200 ms per statement inside a
   transaction ("plain" no-tx statements are ~1 s each), so a default
   --batch 25 chunk (~50 nested statements ≈ 9–10 s) ALWAYS exceeds 5 s over
   the transaction pooler — and the free-tier pooler also throws sporadic
   multi-second stalls (plain#1 = 9.2 s). Fix = raise the ceiling for this
   chunk transaction only: `{ maxWait: 10_000, timeout: 45_000 }`. Chunk
   semantics unchanged (all-or-nothing per chunk); batch stays at the
   documented default.

Latency measurement raw output (`$ npx tsx tmp-tx-latency.ts`):

```
plain (no tx) sequential counts:
  plain#1: 9229ms
  plain#2: 1155ms
  plain#3: 1045ms
inside interactive tx (default 5s timeout):
  tx#1: 181ms
  tx#2: 160ms
  tx#3: 145ms
  tx#4: 136ms
MEASURE OK
```

## Dry-run (reads only) — exactly the predicted shape

```
$ TMP6543=dryrun npx tsx tmp-6543-driver.ts --file residanat-papers/import/constantine-2016-biologie.questions.json --author 27f52f12-df6b-43a6-be8a-12c0d4314aec
db: host=aws-0-eu-west-1.pooler.supabase.com port=6543 database=postgres
rows: lessons=0 questions=96
valid: lessons=0 QCM=96 QCS=0 QROC=0 other=0
resolution plan (0 lines):
skipped-duplicate=10 rejected=0
  - questions:1..10: skipped-duplicate (canonical hash already in unit)
mode: dry-run (reads: curriculum lookups + unit fingerprint SELECTs; no writes)
```

96 valid QCM; 0 curriculum CREATE lines (module/unit already exist from the
pilot); the 10 pilot rows reconcile by canonical hash.

## Failed applies (both before the timeout fix; both clean)

Apply attempt 1 (default batch 25) died inside chunk 1 at 5148 ms; attempt 2
(batch 5) at 5088 ms — same `Transaction API error: Transaction already closed
... The timeout for this transaction was 5000 ms`. No earlier chunk existed in
either run, so nothing could have committed; fresh probe after attempt 2:

```
$ TMP6543=probe npx tsx tmp-6543-driver.ts
baseline via 6543: pending_review=11 approved=9 official_exam=10 unit-rows=10
PROBE OK
```

Identical to the pre-apply baseline ⇒ zero rows written by either failed
apply (transactions are atomic; single-chunk failure = full rollback).

## Successful apply (--apply --allow-production, batch default 25, post-fix)

```
chunk 1/4: wrote 25 questions
chunk 2/4: wrote 25 questions
chunk 3/4: wrote 25 questions
chunk 4/4: wrote 11 questions
manifest: docs/verification/import-manifest-1793453525798.json
created: lessons=0 questions=86 options=430 years=0 modules=0 units=0
```

Full sequence echoed skipped-duplicate=10 rejected=0 (10 pilot rows deduped,
86 written, 0 rejected). Curriculum: 0 creates — additive-only on questions
as agreed. Manifest `appliedAt=2026-10-31T13:31:18.862Z`
(manifest JSON is gitignored; ids preserved here).

86 created question ids (order = Q15..Q100):

```
 1 b4ade057-85d0-435c-a184-6b3a3047272f   44 59ad0098-6c16-478d-a993-ac0f393618fa
 2 2aada5f6-cb91-42c9-94fb-f112a5c0fccf   45 e71af621-e7e4-46ae-9d96-fa53d0c0ead7
 3 37182577-91be-4aae-9eb4-3fef37e2a657   46 8277d7dc-3a5a-4ee2-8741-fcdbc2d7040d
 4 4c78ebad-5ebe-4922-a804-ad36f2bd6f65   47 02486166-31f3-411e-9c55-52f38681b92d
 5 e0643765-687f-44f7-ad21-e0f44bb3afa5   48 27665f48-cd73-4fdf-b38d-82748f833382
 6 fbb7ecc3-763f-4218-a3d5-f1f984d2d631   49 6bb64bc4-b2f9-4b38-9b11-4a2636706ec6
 7 310d3696-581b-49c3-adc7-a5e80517ab1d   50 26d2ccd3-c32a-4aa6-85d4-5e256103c233
 8 30bc9f96-ce65-4ee5-821c-0970ddb4caf2   51 29a39a89-ab95-40e3-8763-81a57e5ddb78
 9 f1a585f4-5330-4e44-94e3-817f110e2e4b   52 668b2ca3-0750-4ae5-ba67-89de5048b28a
10 c3a1e714-ff66-4fa9-b4d2-e8008e7e46f2   53 8bbe693c-4db1-42c1-b46e-40fdab901a42
11 dc2fda19-a446-4610-918f-dee827e30234   54 83010f0f-d959-4d52-98f3-3d3a1425812c
12 eccb852d-debb-4400-8618-32345eca66b8   55 00c4fac2-c0da-4ddf-9a31-4fb268846ab1
13 43443242-81e1-43b1-9e67-5e775555a258   56 afecc601-1913-42d7-9cc0-5aad90cb0d2d
14 eae01b7d-63fd-448f-88dc-0854fecf4958   57 497b023c-144a-4be0-ab07-279d94e55c12
15 4683b2f1-7574-48e4-aee8-d856f3064ebd   58 1b15fc0b-fd41-4905-8add-830bf250c6e2
16 b2da789b-b231-42b6-b3ce-163f093400b5   59 549f4e12-d72c-4fcb-851d-56361dd28f66
17 9252db3f-78a1-47af-9602-20b0a0c1e30a   60 852215e4-5d75-46d9-b782-66f3d4db1144
18 35015269-d50c-4d6e-914b-e211cfb7c923   61 e1a0189f-6bfd-4513-ba41-2cf848c4030a
19 5f825817-7c49-4ece-9abb-28c0145a665b   62 75c7947a-a5d6-4f8f-b4c1-eaf2f6a3d192
20 6038bbbd-63b8-4985-aeb1-e11decaf6532   63 3181c112-a3c1-4ce9-9043-c116c93ccb98
21 77a677d9-2168-4b79-b0e4-686916666606   64 a2b40fd4-485b-41d0-8feb-6b995154d70d
22 1f0d7f41-063e-4c68-a23c-396fb35bddc5   65 8bf1c0cb-a0e4-408e-a628-5f0689c491d0
23 4c41473f-83de-4f46-8c44-34c9a8dcf0d0   66 4cc926b1-cf54-427c-bc8e-e27e32fa863b
24 ae92d561-09f4-4c27-b2e7-5a4ada778b49   67 2bf58d55-79ff-4fe9-81be-88e5864b6bb3
25 4de2f313-f956-42e8-a6f2-9075eb71c3fa   68 215654e6-6d9b-4632-b759-41779395d8bf
26 1ea416ba-5bcc-416a-9dd7-201b95950bd1   69 12c71235-8ddc-4c66-abd3-dd69ae5f159d
27 93632e1e-ed4f-4968-b028-42d24ed2cce3   70 2e8e557e-e7ef-4813-80a1-3d281db7ff26
28 a5bd3cb4-d306-49c0-9739-2a2407897a61   71 7d0d28b9-c479-4c5f-a4fb-730c1e79842f
29 3c6b5b0f-8d06-4972-a784-638566c95f9b   72 92fa7095-9082-4ecc-8e14-094a53eb352a
30 bda742b3-58fe-481b-b144-a04d2ef746ac   73 66569bd7-6ff2-493d-abb2-e66efaed0110
31 9c0fad8c-9738-4e79-8d3b-af193ac341aa   74 afb45286-cd08-4bca-97d7-705eced7eefe
32 a6b7b36d-55bf-4d80-8672-8810b5e22c25   75 2e4ed9d5-c8f2-4e1a-9035-c925896cd921
33 9e15651c-502e-4a1b-8cfa-3a480f8361fb   76 18b5f48f-4760-4e61-a9a1-af571d06e422
34 d347c66f-2ede-4e47-855f-765589740bbd   77 1dbb7978-8fc9-4678-8e5c-5d590d2dde5d
35 ea4fa2cd-802f-4352-8cdb-0c7c887ecf7b   78 7ea9c6da-0169-4cd5-8ed2-01f791366a8e
36 dd14ab4b-e972-4df5-8765-e1ee4b2b40dd   79 228600f3-1322-424f-a4ef-8620e4792934
37 ee6de3a0-0561-4028-a056-15dd3b545fd7   80 9af99db7-4bc0-492d-a526-552584d1ed9d
38 167a3e88-ec4d-48d6-a545-baac96942f35   81 2f22a0f3-23f1-4f13-b31c-dae1b0308e87
39 435213fa-8b94-48b3-9254-84cce38ba5b1   82 5e0fcdd0-9309-42da-8007-2d879fd3702b
40 2714c070-3ed0-4560-920a-e88e5aa554ac   83 4d5d7ec5-cd01-47ab-a9e4-7cfa024fa8a1
41 dffe7c53-3ac8-4079-ab02-e823e8653466   84 5c25f4a9-07a2-4b42-9527-81a5645eff1c
42 ae0e5172-8046-4bc1-8e6b-464a05e7b8fa   85 eb5d70c7-8a75-408d-9f83-5a0a81ea0022
43 f3a6a16f-af20-4bfa-8c5b-4b01887debed   86 e3e170cb-5a46-4206-b8b4-04751eb12db6
options created: 430
```

## Full-96 verification (tmp-verify-full96.ts, ALL PASSED)

Identity mapping is double-locked: DB rows ordered `createdAt asc` (creation
order == JSON order), and ALL 96 stored option bodies + stem bodies must equal
the JSON row at the same index; only then is `isCorrect` compared against that
row's own `_officialAnswers` letters. Every check passed with 0 mismatches:

```
$ TMP6543=verify npx tsx tmp-6543-driver.ts
json rows: 96 (q5..q100)
COUNTS: pending_review=97 (expect 97=1+86+10) approved=9 (expect 9, unchanged) official_exam=96 (expect 96=10+86)
rows under pilot unit: 96 (expect 96)
identity+letters mismatches (non-fatal until threshold): 0
correct-count distribution (db) = {"1":22,"2":37,"3":33,"4":4} ; expected {1:22,2:37,3:33,4:4}
sample ids: first=1cac81cc-5e3a-46fc-8612-54dbec604db8 last=e3e170cb-5a46-4206-b8b4-04751eb12db6
  Q5 first-body: Quelle est, parmi les pathologies suivantes celle qui correspond a un
  Q100 last-body: L'organisme est soumis h une agression acide journaliere expliquee par
review-queue query shape (unit-scoped): 96/96 rows visible
authors in queue rows: seed-author@hamame.dz
BR-2: approved under pilot unit = 0 (must be 0)
unit: Annale 2016 — Épreuve de biologie (Résidanat Constantine) (order 0)
module: Anatomie et cytologie pathologiques (order 20)
year: Résidanat track=medecine faculty=fac-constantine
RESULT: ALL CHECKS PASSED
```

Checks covered, per the pilot's methodology: global counts, all-row meta
(type/source/status/examYear/author/submittedAt/difficulty), 5 options each,
official-corrigé reproduction for ALL 96 rows (Q5..Q100), correct-count
distribution, review-queue query shape incl. author, BR-2 negative
(0 approved under the unit), curriculum chain echo. OCR noise is staged
verbatim (known, disclosed in pilot doc) for reviewer editing.

## Cleanly-built content vs cleanup

No disposable/fixture data was created — every written row is the
owner-directed bank content visibly sitting in the review queue pending human
review; "cleanup" therefore = dedup reconciliation (10 pilot dupes skipped)
+ BR-2 negative above. `approved` count unchanged (9) — upstream rows touched
by nobody.

## Tree disclosure

Untracked in `residanat-papers/`: 11 `extract-*.txt` byproducts of the Oct 29
classification session (mtimes 18:18–18:38 that evening; 2016-med / 2019 bio+med
carry real extracted text, 2019-chir / 2025 / 2026 are 0 bytes = failed
extractions of scan-type PDFs, 2021/2022 ×2/2023/2024 are ~1 KB stubs). Left
untracked untouched. Tracked changes this session: this file + the
`import-content.ts` timeout bump. Scratch (`tmp-6543-driver.ts`,
`tmp-verify-full96.ts`, `tmp-tx-latency.ts`) is gitignored per `tmp-*` rule.

## Residual gates (unchanged)

- Q1–4 of the 2016 sujet exist only in the degraded copy 2 (obj 346) — out of
  scope, unchanged.
- Alger 2026 médecine intake awaits the owner's hand-transcription paste
  (sujet + answer letters; no MBset commentary) — parse → importer JSON →
  stage under `fac-alger` with provisional-labeled keys when it arrives.
- Railway `DATABASE_URL` connection_limit redeploy still recommended for the
  session pooler (5432) — this run did not depend on it (6543 transform).
