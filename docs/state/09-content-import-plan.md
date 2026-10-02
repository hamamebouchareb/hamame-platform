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
"questions": [...] }`. UTF-8, BOM stripped + rejected if re-encoded,
NFC-normalized, `\n` newlines. CSV is questions-only via a fixed column
mapping (below); the script converts CSV→the same JSON model in memory —
no second code path.

Required (R) / optional (O). Rejections in §4.

```json
{
  "curriculum": [
    { "faculty": "fac-alger", "year": "Year 1", "track": "medecine",
      "module": "Cardiology", "moduleOrder": 0,
      "unit": "Cardiac Physiology", "unitOrder": 0 }
  ],
  "lessons": [
    { "unit": "fac-alger/Year 1/Cardiology/Cardiac Physiology",
      "title": "R", "contentTier": "official",
      "body": ["para 1", "para 2"], "university": null }
  ],
  "questions": [
    { "unit": "fac-alger/Year 1/Cardiolog
...[truncated 7373 chars]