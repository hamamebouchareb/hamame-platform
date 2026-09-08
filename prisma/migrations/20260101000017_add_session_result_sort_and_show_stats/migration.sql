-- AlterTable
ALTER TABLE "study_sessions" ADD COLUMN "result_sort" TEXT NOT NULL DEFAULT 'random',
ADD COLUMN "show_stats" BOOLEAN NOT NULL DEFAULT true;
