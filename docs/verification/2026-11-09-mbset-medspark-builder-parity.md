# MBset / MedSpark builder parity — Résidanat QCM rebuild (2026-11-09)

Structure-only recon of how MBset (app.mbset.com) and MedSpark (medspark.online)
build quiz sessions, and how Hamame now maps onto it. Logged in with the owner's
account; no credentials, and no MBset/MedSpark question, answer or explanation
content, are recorded here or anywhere in the repo.

## MBset — observed

- Home: "Build a quiz" + entries Custom / By module / Mock exam. Saved sessions are
  auto-named from the selection, e.g. "Résidanat Blida 2000, 2001, …".
- Builder (`/practice/quizzes?mode=custom`): quiz name, then two tabs.
  - **By lecture**: Modules / Year / AI simulation; module rows show
    "N lectures · count" with Select all.
  - **By exam paper**, numbered steps: 1 Exam (Externat / Résidanat) →
    2 Whose paper (faculty chips, 12) → 3 Years (Last 3, Last 5, Every year,
    pick years) → 4 Section of the paper (All of it / Biologie / Clinique /
    Dossiers cliniques / P3 / P6 / Rattrapage) → optional "Narrow to some
    modules" → "What you get" summary.
- "Customize your quiz" dialog: study mode (Practice, Exam, Revision, Flashcard,
  Lesson, Mastery), question count, source filter, year range with the same
  Last 3 / Last 5 / Every year shortcuts, question status, question type (one
  answer / several / combination / written / clinical case / image occlusion),
  order (shuffle, as listed, high-yield first, newest years first), marking
  (all-or-nothing, partial credit).

## MedSpark — observed

- Résidanat page: "Choisissez une année — le résidanat couvre le programme des
  six années" with 1ère–6ème année tiles.
- Landing page advertises multi-course selection, question-type filter and a
  selectable year range.
- The in-app builder is behind a mandatory Telegram phone verification
  (+213 numbers) after login, so its filter screen was **not** observed.
  Open item: the owner completes the verification, then re-capture.

## Hamame mapping

| MBset / MedSpark step | Hamame |
|---|---|
| Exam = Résidanat | `yearLabel=Résidanat` (one Résidanat/medecine year per faculty) |
| Whose paper | `facultyId` chips from `/questions/counts` `byFaculty` |
| Years (Last 3 / Last 5 / Every / pick) | `examYears[]` chips from `byExamYear` |
| Section of the paper | `periods[]` = épreuve: Sciences fondamentales / Médico-chirurgicale / Dossiers cliniques |
| Narrow to modules / By lecture | `categories[]` (specialty = Module) then `subcategories[]` (topic = Unit) |
| Mode, count, type, order | `mode` practice/exam, `size` ≤ 200, `questionTypes` QCS/QCM/QROC, `sort` random/by_year/by_course |
| Auto name | "Résidanat {faculty} {years}", editable |

Not carried over (no data behind them in hb-db): revision/flashcard/mastery
modes, high-yield ordering, partial-credit marking, image occlusion, AI simulation.

## Data (hb-db only)

- `src/lib/residanat-taxonomy.ts` is the single source of faculty names, the
  épreuve split and specialty canonicalisation (194 raw categories → 60, 0 unmapped).
- `src/scripts/import-hb-db.ts` → `hb-db/hamame-batch.json`: 24,405 valid rows
  (fondamentales 7,067 / médico-chirurgicale 12,833 / dossiers 4,505); rejects are
  rows without an answer key, QCM with no correct option, < 2 options.
- `prisma/cleanup-catalog.ts` (dry-run 2026-11-09): rename 10 real faculties + set
  live; delete 5 faculties with no paper (Béjaïa, Djelfa, Mostaganem, Ouargla,
  Tébessa); remove 319 fake years, 546 modules, 1,144 units; delete 100 unused
  pre-taxonomy pilot rows. One Constantine dentaire year kept (leaderboard
  snapshots reference it). Not applied yet — owner decision.
- `prisma/seed.ts` now seeds only the 10 real faculties + their Résidanat year;
  `prisma/seed-residanat.ts` (fake specialty scaffold) removed.
