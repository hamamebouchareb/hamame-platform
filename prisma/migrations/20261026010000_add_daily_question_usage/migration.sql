-- Free-plan daily question counter.
--
-- Generated with `prisma migrate diff --from-schema-datasource --to-schema-datamodel`
-- and hand-trimmed: the pre-existing `resources` drift (DROP/ADD of
-- resources_*_fkey, DROP INDEX resources_*_index) is unrelated and excluded.

-- CreateTable
CREATE TABLE "daily_question_usage" (
    "user_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_question_usage_pkey" PRIMARY KEY ("user_id","day")
);

-- AddForeignKey
ALTER TABLE "daily_question_usage" ADD CONSTRAINT "daily_question_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
