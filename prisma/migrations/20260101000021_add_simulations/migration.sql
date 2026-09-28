-- CreateTable
CREATE TABLE "simulations" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "faculty_id" UUID NOT NULL,
    "year_id" UUID,
    "scheduled_at" TIMESTAMPTZ NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "question_count" INTEGER NOT NULL,
    "cancelled_at" TIMESTAMPTZ,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "simulations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulation_registrations" (
    "id" UUID NOT NULL,
    "simulation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "simulation_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "simulations_faculty_id_idx" ON "simulations"("faculty_id");

-- CreateIndex
CREATE INDEX "simulations_scheduled_at_idx" ON "simulations"("scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "simulation_registrations_simulation_id_user_id_key" ON "simulation_registrations"("simulation_id", "user_id");

-- AddForeignKey
ALTER TABLE "simulations" ADD CONSTRAINT "simulations_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulations" ADD CONSTRAINT "simulations_year_id_fkey" FOREIGN KEY ("year_id") REFERENCES "years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_registrations" ADD CONSTRAINT "simulation_registrations_simulation_id_fkey" FOREIGN KEY ("simulation_id") REFERENCES "simulations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_registrations" ADD CONSTRAINT "simulation_registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

