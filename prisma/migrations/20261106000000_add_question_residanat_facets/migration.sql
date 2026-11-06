-- AlterTable + CreateIndex
-- Résidanat faceting (hb-db/MBset parity): category = specialty,
-- subcategory = topic, period = épreuve. All nullable; NULL = untagged.
-- Hand-written 2026-11-06: `prisma migrate diff` could not intospect the live
-- DB (EMAXCONNSESSION on :5432 saturation + hang over :6543/pgbouncer), so
-- the statements below are the exact Prisma-equivalent SQL for the 3 adds +
-- 5 indexes and to-schema. Nothing else. Since the raw diff is unavailable,
-- no unrelated drift (resources FKs/indexes, lesson_attachments.file_url —
-- the usual diff noise) exists to exclude here; verified by reading the
-- previous migrations' exclusion notes.

-- AlterTable
-- IF NOT EXISTS: `prisma migrate deploy` could not acquire a session-pool
-- connection (EMAXCONNSESSION), so this was applied manually over the
-- transaction pooler first. Idempotency makes the later `migrate deploy`
-- a no-op. Safe to amend here: the migration has never been deployed, so
-- no checksum exists anywhere yet.
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "category" TEXT,
ADD COLUMN IF NOT EXISTS "subcategory" TEXT,
ADD COLUMN IF NOT EXISTS "period" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "questions_exam_year_idx" ON "questions"("exam_year");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "questions_sitting_label_idx" ON "questions"("sitting_label");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "questions_category_idx" ON "questions"("category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "questions_subcategory_idx" ON "questions"("subcategory");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "questions_period_idx" ON "questions"("period");
