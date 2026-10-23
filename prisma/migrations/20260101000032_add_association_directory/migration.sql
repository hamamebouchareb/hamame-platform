-- Student association directory (medspark.online community parity, approved
-- gap list). Admin-curated public directory; no FKs, plain index + unique name.
--
-- Hand-picked from the `migrate diff --from-schema-datasource … --to-schema-datamodel`
-- output: the pre-existing `resources` drift statements are deliberately EXCLUDED
-- (same pooler-safe rule as every prior migration — see AGENTS.md).

-- CreateTable
CREATE TABLE "student_associations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "wilaya" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "social_url" TEXT,
    "verified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "student_associations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_associations_name_key" ON "student_associations"("name");

-- CreateIndex
CREATE INDEX "student_associations_wilaya_idx" ON "student_associations"("wilaya");

-- CreateIndex
CREATE INDEX "student_associations_type_idx" ON "student_associations"("type");
