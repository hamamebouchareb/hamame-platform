# 08 — Evidence batch A (run 2026-10-02, pooler responding)

Purpose: one file holding the raw outputs behind the file_url fix and the
resources-drift question, so the README, the history file, and reality agree.

## HEAD + tree

- `git log -1 --format=%H` → `9eb8361582fe12f6e6863b1ac871b6a33c9b6f51`
- `git status --short` → clean (no output).
- `git show --stat 9eb8361` → `prisma/schema.prisma | 2 +-` (one line:
  `fileUrl String` → `fileUrl String @map("file_url")`).
- Sizes: `docs/hamame_database_schema.md` 20,682 bytes,
  `prisma/schema.prisma` 45,239 bytes (was 45,224: +15 fits the one line).

## Full migrate diff (live DB vs schema, exit 0)

```
-- DropForeignKey
ALTER TABLE "resources" DROP CONSTRAINT "resources_added_by_fkey";
-- DropForeignKey
ALTER TABLE "resources" DROP CONSTRAINT "resources_faculty_id_fkey";
-- DropForeignKey
ALTER TABLE "resources" DROP CONSTRAINT "resources_year_id_fkey";
-- DropIndex
DROP INDEX "resources_faculty_id_index";
-- DropIndex
DROP INDEX "resources_type_index";
-- DropIndex
DROP INDEX "resources_year_id_index";
-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_year_id_fkey" FOREIGN KEY ("year_id") REFERENCES "years"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

No `lesson_attachments` statement (the fix closed it). No column ADD/DROP
anywhere: the drift is constraint/index-level only (FK definitions and
three indexes; note the dropped `added_by` FK is not re-added because the
schema declares `addedBy` as a plain column with no relation). Reads and
writes of resource rows behave identically either way — this cannot fail
the way the missing `fileUrl` column would have. Still excluded from
migrations per the pooler-safe pattern; nothing applied.

## Prior step outputs (from the fix session, same day)

- `npx prisma generate` → client v6.19.3, exit 0.
- `npx tsc --noEmit` → exit 0. `npm run build` → exit 0.
- `prisma.lessonAttachment.findMany({ take: 1 })` → `[]`, exit 0
  (empty table, column resolves; previously would error).
- Before-fix diff contained the extra statement:
  `ALTER TABLE "lesson_attachments" DROP COLUMN "file_url", ADD COLUMN
  "fileUrl" TEXT NOT NULL` — proving live = `file_url`.
