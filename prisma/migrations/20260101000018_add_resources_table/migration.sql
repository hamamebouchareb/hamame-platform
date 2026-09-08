-- CreateTable
CREATE TABLE "resources" (
    "id" UUID NOT NULL,
    "faculty_id" UUID,
    "year_id" UUID,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "source_label" TEXT,
    "added_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "resources_faculty_id_index" ON "resources"("faculty_id");

-- CreateIndex
CREATE INDEX "resources_year_id_index" ON "resources"("year_id");

-- CreateIndex
CREATE INDEX "resources_type_index" ON "resources"("type");

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_year_id_fkey" FOREIGN KEY ("year_id") REFERENCES "years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;