-- Creator payout queue (medspark.online SPARK-parity, approved gap list).
-- Manual bridge only: no earnings computation model exists (deliberate
-- product-deferral); the queue stores the author's requested amount and the
-- admin's decision trail. CIB/SATIM automation stays out of scope.
--
-- Hand-picked from the `migrate diff --from-schema-datasource … --to-schema-datamodel`
-- output: the pre-existing `resources` drift statements are deliberately EXCLUDED
-- (same pooler-safe rule as every prior migration — see AGENTS.md).

-- CreateTable
CREATE TABLE "payout_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount_dzd" INTEGER NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ,
    "decision_note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "payout_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payout_requests_status_idx" ON "payout_requests"("status");

-- CreateIndex
CREATE INDEX "payout_requests_user_id_idx" ON "payout_requests"("user_id");

-- AddForeignKey
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
