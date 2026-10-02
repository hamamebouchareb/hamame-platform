# 09 — Bulk content import plan (PLAN ONLY, 2026-10-02 — nothing built)

Problem: the bank holds ~1 module / 1 unit / 3 lessons / 9 questions.
One-by-one authoring cannot fill 15 faculties. This plans an owner-run bulk
importer. Plan only — no code, schema, migration, env, or data changed here.

## 0. Ground rules (from code, not wishes)

- Lifecycle (`src/routes/authoring.routes.ts:22-28`): `draft → pending_review
  → approved | rejected`. Approve requires `pending_review` and writes
  `reviewed_by` + `reviewed_at` (NFR-10 audit); lesson approval also sets
  `currentVersionId` (publishes). Importer lands everything as
  `pending_review` with `authored_by` = a given user id. Never auto-approve.
- Draft field contracts (`authoring.routes.ts:36-124`): lessons need
  `unitId, title, contentTier(official|hamame_plus), bodyRichtext,
  universityId?`; questions need `unitId, type, source, difficulty?,
  bodyRichtext, explanationRichtext, options?, clinicalCaseParts?,
  universityId?`. The importer additionally sets `exam_year`,
  `sitting_label`, `review_comment: null` (the API has no such fields —
  direct Prisma, owner-run only).
- Richtext shapes that actually render (`web/src/lib/richtext.ts`):
  lessons `{blocks:[{type?,text}]}`; questions/explanations `{text}`.
  Anything else stores fine (`z.record`, `common-schemas.ts:17`) but
  renders as nothing — the validator must enforce these two shapes.
- Student visibility is `status='approved'` + published version only
  (BR-2); pending rows are invisible by construction, so a bad import
  cannot leak to students.

## 1. Input format

One JSON file per batch: `{ "curriculum": [...], "lessons": [...],
"questions": [...] }`. UTF-8, BOM stripped, NFC-normalized, `\n`
newlines. CSV is questions-only via the fixed column mapping below; the
script converts CSV rows into the same JSON model in memory — no second
code path, no CSV parser dependency (split on tab; `;`-separated only if
the file has no tabs; `"` quoting with `""` escapes; anything fancier is
rejected with the row number).

Example — curriculum row (R = required, O = optional):

```json
{ "faculty": "fac-alger",
  "year": "Year 1", "track": "medecine",
  "module": "Cardiology", "moduleOrder": 0,
  "unit": "Cardiac Physiology", "unitOrder": 0 }
```

All R except orders (default append). Faculty by slug (must exist and be
visible to the owner). Year matched by (faculty, label, track) — created
if missing. Module/unit matched by (parent, name) — created if missing.

Example — lesson (body = paragraphs → blocks):

```json
{ "unit": "fac-alger/Year 1/Cardiology/Cardiac Physiology",
  "title": "La circulation coronaire",
  "contentTier": "official",
  "body": ["Le coeur est vascularisé par…", "Les coronaires naissent…"],
  "university": null }
```

`unit` is the R path string `faculty-slug/year label/module/unit`
(labels must match exactly — validator resolves each level or rejects
with the missing level). `title` R, `contentTier` R, `body` R (≥1
non-empty paragraph), `university` O (name → id, else reject).

Example — QCM question:

```json
{ "unit": "fac-alger/Year 1/Cardiology/Cardiac Physiology",
  "type": "QCM", "source": "official_exam", "difficulty": "moyen",
  "body": "Quelle artère vascularise… ?",
  "options": [
    { "text": "Coronaire gauche", "correct": true },
    { "text": "Coronaire droite", "correct": false },
    { "text": "Tronc coeliaque", "correct": false } ],
  "explanation": "Car…",
  "examYear": 2023, "sittingLabel": "EMD", "university": null }
```

`unit, type, source, body, options, explanation` R. `difficulty` O
(free string or null). `examYear` O (4-digit int). `sittingLabel` O
(free text — no enum by decision). QCS: same with exactly 1 correct.
QROC: no `options`; `answer` R (stored as `freeTextAnswer`-compatible
reference — NOT auto-graded, stays null-graded like all QROC). Clinical
case: `parts: [{ "order": 0, "prompt": "…", "expected": "…" }]` R (≥1),
options optional per part design (open question for the owner, §7).

CSV columns (questions only): unit, type, source, difficulty, body,
option1..option6, correct_idx (1-based, comma list for QCM),
explanation, exam_year, sitting_label, university. Encoding: UTF-8 only —
Excel Arabic exports in cp1256/cp1252 MUST be re-saved as UTF-8 first;
the script sniffs BOM/byte patterns and aborts with the offending row
rather than mojibaking the bank.

## 2. Entry point (CLI, not an admin route)

`src/scripts/import-content.ts` (excluded from the tsc build like every
script — a broken importer can never fail Railway). Run locally:
`npx tsx src/scripts/import-content.ts --file batch.json [--apply]
[--author <user-id>] [--batch 50]`. Default is `--dry-run`; `--apply`
must be explicit; without `--author` the script aborts (every row needs
`authored_by`). Why CLI: (1) reads multi-MB UTF-8/CSV files from disk —
no HTTP payload limits or timeouts; (2) long run with progress + dry-run;
(3) one process = one Prisma connection (pooler-safe), versus per-row
HTTP + auth overhead through the authoring endpoints; (4) one-shot owner
op — no new public surface, no role-gating to maintain, no UI to translate.

## 3. Safety

- Status: questions land `pending_review`; lesson versions land
  `pending_review` (versionNumber 1); `authored_by` = `--author`.
- Idempotency without schema change: canonical sha256 over
  `unitId|type|canonical-body|canonical-options` (canonical = stable
  key-order JSON + NFC + trimmed). Pre-check per row against existing rows
  in the same unit (one SELECT per unit, in-memory compare); duplicates
  reported-skipped, never inserted. Documented limit: body edits after
  import hash differently (by design — edited rows are new content).
  Alternative requiring a migration (open question §7): `import_batches`
  table with stored hashes.
- Transactions: one `$transaction` per chunk of `--batch` rows (default
  50; nested option/parts creates included). Chunk ranges printed, so a
  failed chunk reports its exact row span and prior chunks stay (re-run
  skips them via the hash check — the rollback story is re-run, not
  whole-file abort, because whole-file transactions time out on the pooler).
- Single PrismaClient, sequential awaits (no `Promise.all` fan-out —
  pooler P1001 rule).

## 4. Validation (reject + report file:row:reason, continue on next row)

- Unknown unit path (any level unresolvable) → reject row.
- QCM: zero correct options → reject; QCS: ≠1 correct → reject;
  options < 2 or duplicate option texts (NFC-compared) → reject.
- Empty explanation when present-but-blank → reject (PRD FR-18 requires
  the baseline explanation on every question).
- QROC without `answer` → reject. Clinical case with zero parts, empty
  prompt, or duplicate `order` → reject.
- Body/explanation not matching the §0 render shapes → reject.
- Unknown `source`/`contentTier`/`track`/faculty slug → reject.
- Text over 5,000 chars (body) / 200 chars (option) → reject for review.
- `examYear` not a 4-digit int, or unknown university name → reject.
- Summary table at end: rows read / created (per type) / skipped-duplicate
  / rejected, plus the per-row reason list. Exit non-zero if any rejection
  occurred (even in `--apply` — applied rows stay, reported honestly).

## 5. Review step (bulk approve, audit-safe)

Second script `src/scripts/review-approve.ts`: `--status pending_review
[--track medecine] [--faculty fac-alger] [--limit N] [--reviewer <user-id>]
[--apply]`. Same dry-run-first rule. Approval replicates
`review.routes.ts:157-215` semantics per item over HTTP with the reviewer's
JWT (not direct DB): only `pending_review` rows (409 otherwise), writes
`reviewed_by` + `reviewed_at`, and for lessons sets `currentVersionId`
(publishes). HTTP (not direct writes) so the BR-2 gates, the
post-approval AI hook, and validation run exactly as in the UI. Sequential
requests (pooler rule). The existing `/api/review` queue UI is untouched
and remains the spot-check path: reviewers sample the queue, bulk script
handles the volume.

## 6. Verification (raw logs the implementation must produce)

Per batch, under `docs/verification/` (redacted, per the folder rule):
`import-<name>-dryrun.log` (validation table), `import-<name>-apply.log`
(chunk ranges + ids), DB counts before AND after (faculties/years/modules/
units/lessons/questions-by-status), re-run log proving zero new rows
(idempotency), and one approved question fetched via real
`GET /api/questions` as a student (BR-2 proof) plus its lesson via
`GET /api/lessons/:id` (published-version proof).

## 7. Risks and open questions (decided before implementation)

1. Faculty source of truth: the 15 `fac-*` beta rows (DRAFT list) vs the
   legacy `medicine`/`dentistry` rows — which faculties do batches target?
2. Official exam metadata codebook: allowed `sittingLabel` values and
   `examYear` ranges per track (free text today — constrain or not?).
3. Clinical-case structure: multi-part grading display, option-less parts,
   expected-answer rendering in the player.
4. Attachments: lesson images/PDFs live where? (`lesson_attachments.fileUrl`
   needs hosted URLs — Drive, Supabase Storage, or skip v1?)
5. University scoping per row: which batches are global vs university-tagged?
6. Difficulty vocabulary: free string vs fixed scale (facile/moyen/difficile?).
7. Idempotency key: canonical-hash check (no schema change) vs new
   `import_batches` table (migration)?
8. Batch size/timeout tuning against the session pooler on first large run.

## Implementation checklist (small, separately committable)

1. `import-content.ts` skeleton: argv (`--file/--apply/--author/--batch`),
   UTF-8/BOM/NFC loader + CSV→JSON converter, dry-run reporter. No DB writes.
2. Validator (pure functions + unit-checkable): per-type rules from §4 with
   file:row:reason output. No DB writes.
3. Curriculum resolver (faculty slug/year/track/module/unit lookup-or-create)
   behind `--apply` only; dry-run prints the resolution plan.
4. Question/lesson writers (chunked `$transaction`, hash pre-check, pending
   statuses) + summary table + non-zero exit on rejections.
5. `review-approve.ts` (HTTP loop, dry-run first, sequential).
6. First real batch on 1 faculty + full §6 evidence set before scaling.
