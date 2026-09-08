-- AlterTable
-- Phase 3 notes library: fixed-taxonomy tags + favorites. Both defaulted so
-- pre-existing rows stay valid. Extracted verbatim from `prisma migrate diff`
-- (live DB vs schema); unrelated pre-existing drift the diff also emitted
-- (resources FKs/indexes, lesson_attachments file_url) is deliberately NOT
-- included here.
ALTER TABLE "notes" ADD COLUMN     "is_favorite" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
