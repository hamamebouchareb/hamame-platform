-- Hand-extracted from `prisma migrate diff --from-url … --to-schema-datamodel .`
-- (2026-10-26, session: presence/online dot). The raw diff also emitted
-- unrelated pre-existing drift on the `resources` table (drop/re-add FKs and
-- indexes + file_url), deliberately excluded — same pattern as every prior
-- pooler-safe migration in this repo.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "last_active_at" TIMESTAMPTZ;
