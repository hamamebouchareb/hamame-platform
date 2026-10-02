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

Scope decision (owner-ruled): v1 targets the live `medicine` faculty only,
one year first — not the 15 beta rows.

Example — lesson (body = paragraphs → blocks):

```json
{ "faculty": "medicine", "year": "Year 1", "track": "medecine",
  "module": "Cardiology", "unit": "Cardiac Physiology",
  "title": "La circulation coronaire",
  "contentTier": "official",
  "body": ["Le coeur est vascularisé par…", "Les coronaires naissent…"],
  "university": null }
```

Scope fields are separate (faculty slug, year label, track, module name,
unit name — never a slash-delimited path, so labels containing `/` cannot
break resolution). Each level resolves or the row rejects with the missing
level. `title` R, `contentTier` R, `body` R (≥1 non-empty paragraph),
`university` O (name → id, else reject).

Example — QCM question:

```json
{ "faculty": "medicine", "year": "Year 1", "track": "medecine",
  "module": "Cardiology", "unit": "Cardiac Physiology",
  "type": "QCM", "source": "official_exam", "difficulty": "moyen",
  "body": "Quelle artère vascularise… ?",
  "options": [
    { "text": "Coronaire gauche", "correct": true },
    { "text": "Coronaire droite", "correct": false },
    { "text": "Tronc coeliaque", "correct": false } ],
  "explanation": "Car…",
  "examYear": 2023, "sittingLabel": "EMD", "university": null }
```

`faculty/year/track/module/unit` R (separate fields, §1 decision).
`type, source, body, options, explanation` R. `difficulty` O but fixed
vocabulary when present: `facile|moyen|difficile` or null (owner-ruled).
`examYear` O (4-digit int). `sittingLabel` O free text, with a warning
when outside the configurable list file (`sitting-labels.json`,
owner-maintained — warn, not reject). QCS: same with exactly 1 correct.
QROC: no `options`; `answer` R (NOT auto-graded, stays null-graded).
Clinical cases: OUT of v1 (owner-ruled) — validator rejects
`type: CLINICAL_CASE` with a dedicated reason. Attachments: OUT of v1 —
and `questions` has NO attachment table, so image-based questions are
unsupported by the schema, not just deferred.

CSV columns (questions only): faculty, year, track, module, unit, type,
source, difficulty, body, option1..option6, correct_idx (1-based, comma
list for QCM), explanation, exam_year, sitting_label, university.
Encoding: UTF-8 only —
Excel Arabic exports in cp1256/cp1252 MUST be re-saved as UTF-8 first;
the script sniffs BOM/byte patterns and aborts with the offending row
rather than mojibaking the bank.

## 2. Entry point (CLI, not an admin route)

`src/scripts/import-content.ts` (excluded from the tsc build like every
script — a broken importer can never fail Railway). Run locally:
`npx tsx src/scripts/import-content.ts --file batch.json [--apply]
[--author <user-id>] [--batch 25]`. Default is `--dry-run`; `--apply`
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
  `unitId|type|canonical-body|canonical-options|examYear|sittingLabel`
  (canonical = stable key-order JSON + NFC + trimmed). Sitting metadata is
  IN the hash by decision: the same stem appearing in two sittings is two
  distinct bank rows (re-asking across years is normal); re-importing the
  same file hashes identically and skips. Pre-check per row against existing
  rows in the same unit (one SELECT per unit, in-memory compare); duplicates
  reported-skipped, never inserted. Documented limit: body edits after
  import hash differently (by design — edited rows are new content).
- Transactions: one `$transaction` per chunk of `--batch` rows (default
  25; nested option creates included). Chunk ranges printed, so a
  failed chunk reports its exact row span and prior chunks stay (re-run
  skips them via the hash check — the rollback story is re-run, not
  whole-file abort, because whole-file transactions time out on the pooler).
- Single PrismaClient, sequential awaits (no `Promise.all` fan-out —
  pooler P1001 rule).

## 4. Validation (reject + report file:row:reason, continue on next row)

- Unknown scope (any of faculty/year/track/module/unit unresolvable) → reject row.
- QCM: zero correct options → reject; QCS: ≠1 correct → reject;
  options < 2 or duplicate option texts (NFC-compared) → reject.
- Missing or blank explanation → reject. Checked: the player and results
  tolerate absent explanations (hidden toggles), but `explanation_richtext`
  is non-null in the schema and required by the draft contract — so the
  column, not the UI, decides. `explanation` stays REQUIRED.
- QROC without `answer` → reject. `type: CLINICAL_CASE` → reject with
  `clinical-out-of-v1` (owner-ruled, not a validation failure of the row).
- `difficulty` present but not `facile|moyen|difficile` → reject.
- Body/explanation not matching the §0 render shapes → reject.
- Unknown `source`/`contentTier`/faculty slug → reject. `sittingLabel`
  outside `sitting-labels.json` → warn only (row still imports).
- Unknown `track` → reject.
- Text over 5,000 chars (body) / 200 chars (option) → reject for review.
- `examYear` not a 4-digit int, or unknown university name → reject.
- Summary table at end: rows read / created (per type) / skipped-duplicate
  / rejected, plus the per-row reason list. Exit non-zero if any rejection
  occurred (even in `--apply` — applied rows stay, reported honestly).

## 5. Review step (bulk approve, audit-safe)

Second script `src/scripts/review-approve.ts`: `--status pending_review
[--track medecine] [--faculty medicine] [--limit N] [--reviewer-email E]
[--apply]`. Same dry-run-first rule. It logs in via `POST /api/auth/login`
with `REVIEWER_EMAIL` + `REVIEWER_PASSWORD` from the environment (never
logged, never committed, never in the file) and reuses the JWT for the
loop. Approval replicates `review.routes.ts:157-215` semantics per item
over HTTP with that JWT (not direct DB): only `pending_review` rows (409
otherwise), writes `reviewed_by` + `reviewed_at`, and for lessons sets
`currentVersionId` (publishes). HTTP (not direct writes) so the BR-2 gates,
the post-approval AI hook, and validation run exactly as in the UI.
Sequential requests (pooler rule). AI-hook truth, stated plainly: approve
fires the server-side explanation hook per question — no CLI flag can skip
server code. Bulk approval must run with `ANTHROPIC_API_KEY` unset (hook
warns + skips, zero cost); a future `--no-ai`-equivalent needs a server
flag first (proposed: `REVIEW_APPROVE_SKIP_AI` env read in the approve
handler — implementation step, not this plan). The existing `/api/review`
queue UI is untouched and remains the spot-check path: reviewers sample the
queue, bulk script handles the volume.

## 6. Verification (raw logs the implementation must produce)

Per batch, under `docs/verification/` (redacted, per the folder rule):
`import-<name>-dryrun.log` (validation table), `import-<name>-apply.log`
(chunk ranges + ids), DB counts before AND after (faculties/years/modules/
units/lessons/questions-by-status), re-run log proving zero new rows
(idempotency), and one approved question fetched via real
`GET /api/questions` as a student (BR-2 proof) plus its lesson via
`GET /api/lessons/:id` (published-version proof).

## 7. Owner rulings (decided — implementation unlocked)

1. Faculty scope: the live `medicine` faculty only, one year first — not
   the 15 beta rows.
2. `sittingLabel` stays free text; the importer warns (not rejects) on
   values outside the configurable `sitting-labels.json` list file.
3. Clinical cases: OUT of v1 (`CLINICAL_CASE` rows reject).
4. Attachments: OUT of v1 — and `questions` has NO attachment table, so
   image-based questions are unsupported by the schema, not just deferred.
5. University: null by default (global content); named universities resolve
   or reject.
6. Difficulty: fixed `facile|moyen|difficile` or null.
7. Idempotency: canonical hash INCLUDING examYear/sittingLabel, no
   migration, no `import_batches` table. Same stem in two sittings = two
   rows; same file re-imported = zero new rows.
8. Default batch size 25.
9. Source rights: only content the owner wrote or is licensed to use may
   be imported — the scripts perform no rights check and must not be
   mistaken for one.

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
