-- AlterTable
-- Exam-sitting metadata for the past-exam picker + period filter. Nullable: all
-- pre-existing questions stay untagged (NULL = not attached to any real sitting).
-- Extracted verbatim from `prisma migrate diff` (live DB vs schema); unrelated
-- drift statements the diff also emitted (resources FKs, lesson_attachments
-- file_url) are deliberately NOT included here.
ALTER TABLE "questions" ADD COLUMN     "exam_year" INTEGER,
ADD COLUMN     "sitting_label" TEXT;
