-- Internship reviews (medspark.online stage/ECOS parity, approved gap list).
-- Moderated like lessons/questions: rows start 'pending_review'; only approved
-- rows are publicly listed. FK cascade on user delete.
--
-- Hand-picked from the `migrate diff --from-schema-datasource … --to-schema-datamodel`
-- output: the pre-existing `resources` drift statements are deliberately EXCLUDED
-- (same pooler-safe rule as every prior migration — see AGENTS.md).

-- CreateTable
CREATE TABLE "internship_reviews" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "wilaya" TEXT NOT NULL,
    "hospital_name" TEXT NOT NULL,
    "service_name" TEXT,
    "rating" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "review_comment" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "internship_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "internship_reviews_status_idx" ON "internship_reviews"("status");

-- CreateIndex
CREATE INDEX "internship_reviews_wilaya_idx" ON "internship_reviews"("wilaya");

-- CreateIndex
CREATE INDEX "internship_reviews_user_id_idx" ON "internship_reviews"("user_id");

-- AddForeignKey
ALTER TABLE "internship_reviews" ADD CONSTRAINT "internship_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
