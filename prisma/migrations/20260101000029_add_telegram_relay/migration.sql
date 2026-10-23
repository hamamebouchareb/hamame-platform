-- Telegram relay (medspark.online GroupSpace parity, approved gap list): bot
-- webhook chat-linking (chat id + single-use link code on users) and an audit
-- table for admin broadcasts.
--
-- Hand-picked from the `migrate diff --from-schema-datasource … --to-schema-datamodel`
-- output: the pre-existing `resources` foreign-key/index drift statements emitted by
-- the raw diff are deliberately EXCLUDED (same pooler-safe rule as every prior
-- migration — see AGENTS.md, migrations section).

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "telegram_chat_id" TEXT,
ADD COLUMN     "telegram_link_code" TEXT,
ADD COLUMN     "telegram_link_expires_at" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "telegram_broadcasts" (
    "id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "recipient_count" INTEGER NOT NULL,
    "delivered_count" INTEGER NOT NULL DEFAULT 0,
    "telegram_error" TEXT,
    "sent_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_chat_id_key" ON "users"("telegram_chat_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_link_code_key" ON "users"("telegram_link_code");

-- AddForeignKey
ALTER TABLE "telegram_broadcasts" ADD CONSTRAINT "telegram_broadcasts_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
