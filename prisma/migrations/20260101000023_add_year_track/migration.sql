-- Add track to years for onboarding filiere filtering (medecine | dentaire | pharmacie).
-- Extracted verbatim from `prisma migrate diff` (live DB vs schema); the diff's
-- unrelated statements (resources FKs/indexes, lesson_attachments.file_url) are
-- pre-existing drift and deliberately excluded, per the pooler-safe pattern.

-- AlterTable
ALTER TABLE "years" ADD COLUMN     "track" TEXT;
