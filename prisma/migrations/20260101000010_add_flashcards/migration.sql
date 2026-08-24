-- AlterTable
ALTER TABLE "review_queue_items" ADD COLUMN     "flashcard_id" UUID;

-- CreateTable
CREATE TABLE "flashcards" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "source_question_id" UUID,
    "source_lesson_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flashcards_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_source_question_id_fkey" FOREIGN KEY ("source_question_id") REFERENCES "questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_source_lesson_id_fkey" FOREIGN KEY ("source_lesson_id") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_queue_items" ADD CONSTRAINT "review_queue_items_flashcard_id_fkey" FOREIGN KEY ("flashcard_id") REFERENCES "flashcards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enforce "exactly one of lesson_id/question_id/flashcard_id" at the DB level. Prisma's
-- schema language can't express CHECK constraints, so this is hand-appended to the
-- generated migration (app-level validation lives in enqueueReviewQueueItem, reviews.routes.ts).
ALTER TABLE "review_queue_items" ADD CONSTRAINT "review_queue_items_single_target_check" CHECK (
    ((lesson_id IS NOT NULL)::int + (question_id IS NOT NULL)::int + (flashcard_id IS NOT NULL)::int) = 1
);
