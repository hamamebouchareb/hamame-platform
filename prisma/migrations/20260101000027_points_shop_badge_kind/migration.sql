-- Points shop: badge-kind items (points -> existing badge catalog). Follow-up
-- to 20260101000026_add_points_economy, which pre-deployed before the kind
-- list settled: 'ai_credits' was rejected (allowance re-assertion would
-- overwrite purchased top-ups); 'badge' replaces it.
--
-- From `prisma migrate diff --from-schema-datasource prisma/schema.prisma
-- --to-schema-datamodel prisma/schema.prisma --script` — these two statements
-- are the entire diff output (no drift statements this time).

ALTER TABLE "points_shop_items" ADD COLUMN     "badge_id" UUID;

ALTER TABLE "points_shop_items" ADD CONSTRAINT "points_shop_items_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "badges"("id") ON DELETE SET NULL ON UPDATE CASCADE;
