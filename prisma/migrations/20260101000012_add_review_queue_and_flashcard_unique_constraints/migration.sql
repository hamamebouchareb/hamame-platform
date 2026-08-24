-- CreateIndex
CREATE UNIQUE INDEX "flashcards_user_id_source_question_id_key" ON "flashcards"("user_id", "source_question_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_queue_items_user_id_lesson_id_key" ON "review_queue_items"("user_id", "lesson_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_queue_items_user_id_question_id_key" ON "review_queue_items"("user_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_queue_items_user_id_flashcard_id_key" ON "review_queue_items"("user_id", "flashcard_id");
