-- AlterTable
ALTER TABLE "users" ADD COLUMN     "verification_token_expires_at" TIMESTAMPTZ,
ADD COLUMN     "verification_token_hash" TEXT;
