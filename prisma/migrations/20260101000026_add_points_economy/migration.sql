-- Points economy (medspark.online-parity): accounts, append-only ledger,
-- admin-managed shop, redemption audit trail.
--
-- Hand-picked from `prisma migrate diff --from-schema-datasource
-- prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script`:
-- the raw diff also emits unrelated pre-existing drift (resources FKs/indexes,
-- lesson_attachments.file_url) which is deliberately EXCLUDED here, same as in
-- every pooler-safe migration before this one.

CREATE TABLE "points_accounts" (
    "user_id" UUID NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "earned_total" INTEGER NOT NULL DEFAULT 0,
    "spent_total" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "points_accounts_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "points_ledger" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "ref_id" TEXT,
    "balance_after" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "points_ledger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "points_shop_items" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" TEXT NOT NULL,
    "cost_points" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "plan_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "points_shop_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "points_redemptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "cost_points" INTEGER NOT NULL,
    "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "points_redemptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "points_ledger_user_id_created_at_idx" ON "points_ledger"("user_id", "created_at");

CREATE UNIQUE INDEX "points_ledger_user_id_reason_ref_id_key" ON "points_ledger"("user_id", "reason", "ref_id");

ALTER TABLE "points_accounts" ADD CONSTRAINT "points_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "points_shop_items" ADD CONSTRAINT "points_shop_items_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "points_redemptions" ADD CONSTRAINT "points_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "points_redemptions" ADD CONSTRAINT "points_redemptions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "points_shop_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
