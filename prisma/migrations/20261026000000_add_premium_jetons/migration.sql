-- Premium bought with jetons, scoped to one faculty-year; AI credit packs;
-- free-plan daily question limit.
--
-- Generated with `prisma migrate diff --from-schema-datasource --to-schema-datamodel`
-- and hand-trimmed: the diff also emitted the pre-existing `resources` drift
-- (DROP/ADD of resources_*_fkey, DROP INDEX resources_*_index), which is
-- unrelated to this change and deliberately excluded.

-- AlterTable
ALTER TABLE "ai_credit_balances" ADD COLUMN     "purchased_credits" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "faculty_id" UUID,
ADD COLUMN     "year_id" UUID;

-- CreateTable
CREATE TABLE "premium_offers" (
    "id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "price_jetons" INTEGER NOT NULL,
    "badge" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "premium_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_credit_packs" (
    "id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "price_jetons" INTEGER NOT NULL,
    "badge" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_credit_packs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_year_id_fkey" FOREIGN KEY ("year_id") REFERENCES "years"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data: default offers (admin-editable from /admin/wallet). 1 jeton = 10 DA.
INSERT INTO "premium_offers" ("id", "label", "duration_days", "price_jetons", "badge", "sort_order") VALUES
  ('7a1e0000-0000-4000-8000-0000000b0030', 'Mensuel', 30, 150, NULL, 1),
  ('7a1e0000-0000-4000-8000-0000000b0180', 'Semestre', 180, 750, 'recommended', 2),
  ('7a1e0000-0000-4000-8000-0000000b0365', 'Annuel', 365, 1200, 'best_value', 3);

INSERT INTO "ai_credit_packs" ("id", "label", "credits", "price_jetons", "badge", "sort_order") VALUES
  ('7a1e0000-0000-4000-8000-0000000c0020', '20 crédits IA', 20, 10, NULL, 1),
  ('7a1e0000-0000-4000-8000-0000000c0060', '60 crédits IA', 60, 25, 'recommended', 2),
  ('7a1e0000-0000-4000-8000-0000000c0150', '150 crédits IA', 150, 50, 'best_value', 3);

-- Data: subscriptions granted by an activation code take that code's faculty-year.
UPDATE "subscriptions" s
SET "faculty_id" = ac."faculty_id", "year_id" = ac."year_id"
FROM (
  SELECT DISTINCT ON (p."subscription_id") p."subscription_id", c."faculty_id", c."year_id"
  FROM "activation_codes" c
  JOIN "payments" p ON p."id" = c."payment_id"
  ORDER BY p."subscription_id", c."redeemed_at" DESC
) ac
WHERE s."id" = ac."subscription_id";

-- Data: free plan gets the daily question limit; descriptions match what each plan unlocks.
UPDATE "plans"
SET "features" = "features" || '{"dailyQuestionLimit": 20, "description": "20 questions par jour, 5 crédits IA par jour, statistiques de base"}'::jsonb
WHERE "name" = 'free';

UPDATE "plans"
SET "features" = "features" || '{"description": "Toutes les questions et ressources de votre année, 30 crédits IA par jour"}'::jsonb
WHERE "name" = 'premium';
