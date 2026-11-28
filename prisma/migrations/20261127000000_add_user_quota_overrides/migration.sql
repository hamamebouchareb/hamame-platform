-- Per-student admin quota overrides (daily QCM cap, unlimited QCM toggle, daily AI credits).
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "daily_question_limit_override" INTEGER,
  ADD COLUMN IF NOT EXISTS "unlimited_questions_override" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ai_daily_allowance_override" INTEGER;
