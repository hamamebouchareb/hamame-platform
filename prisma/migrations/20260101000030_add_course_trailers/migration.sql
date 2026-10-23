-- Course trailer (medspark.online-parity, approved gap list): an admin-set,
-- https-only MP4 URL on faculties, rendered as a plain <video> on the public
-- faculty landing. Nullable: null = no trailer.
--
-- Hand-picked from the `migrate diff --from-schema-datasource … --to-schema-datamodel`
-- output: the pre-existing `resources` drift statements are deliberately EXCLUDED
-- (same pooler-safe rule as every prior migration — see AGENTS.md).

-- AlterTable
ALTER TABLE "faculties" ADD COLUMN     "trailer_url" TEXT;
