# Hamame — Database Schema (Draft v0.1)

**Grounded in:** Hamame PRD v1.0 (Sections 6, 8, 13, 14) — not MedSpark's inferred schema.
**Scope:** Covers the broad V1 (Section 14 as written) plus fields needed for V2 features
(marked `-- V2` / `-- V3`) so the schema doesn't need a redesign later, per FR-60/61.

Notation: PostgreSQL-flavored pseudo-DDL. Not final DDL — meant for review/discussion
before Cursor turns it into real migrations.

---

## 1. Identity & Access

```sql
roles (
  id UUID PK,
  name TEXT UNIQUE,        -- 'guest','student_free','student_premium','instructor',
                            -- 'academic_reviewer','moderator','support_agent',
                            -- 'institution_admin','admin','super_admin'
  created_at TIMESTAMPTZ
)

users (
  id UUID PK,
  email TEXT UNIQUE,
  phone TEXT UNIQUE NULL,          -- FR-1 phone-based registration
  password_hash TEXT,
  full_name TEXT,
  faculty_id UUID FK -> faculties.id NULL,
  year_id UUID FK -> years.id NULL,
  university TEXT,
  wilaya TEXT,                     -- city/province, per FR-4
  profile_photo_url TEXT NULL,
  ui_language TEXT DEFAULT 'fr',   -- 'fr' | 'ar'  -- NFR-6
  theme TEXT DEFAULT 'light',      -- 'light' | 'dark'
  email_verified_at TIMESTAMPTZ NULL,
  phone_verified_at TIMESTAMPTZ NULL,
  is_minor BOOLEAN DEFAULT FALSE,  -- BR-11 data-handling awareness
  status TEXT DEFAULT 'active',    -- 'active','suspended','deleted'
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

user_roles (                       -- many-to-many; roles are additive (Section 6)
  user_id UUID FK -> users.id,
  role_id UUID FK -> roles.id,
  PRIMARY KEY (user_id, role_id)
)

notification_preferences (
  user_id UUID FK -> users.id PK,
  channel TEXT,                    -- 'in_app','email','push'
  category TEXT,                   -- 'revision','subscription','content_update',
                                    -- 'moderation','social'
  enabled BOOLEAN DEFAULT TRUE
)
```

## 2. Curriculum Structure (FR-9, FR-10 — must stay faculty-agnostic/configurable)

```sql
faculties (
  id UUID PK,
  name TEXT,                       -- 'Medicine','Dentistry','Pharmacy', ...
  slug TEXT UNIQUE,
  rollout_status TEXT DEFAULT 'planned',  -- 'planned','beta','live'  -- FR-64, BR-15
  min_coverage_years_required INT DEFAULT 2,  -- BR-15 gating threshold
  created_at TIMESTAMPTZ
)

years (
  id UUID PK,
  faculty_id UUID FK -> faculties.id,
  label TEXT,                      -- 'Year 1', ..., 'Résidanat Prep'
  order_index INT,
  created_at TIMESTAMPTZ
)

modules (
  id UUID PK,
  year_id UUID FK -> years.id,
  name TEXT,
  order_index INT
)

units (
  id UUID PK,
  module_id UUID FK -> modules.id,
  name TEXT,
  order_index INT
)

lessons (
  id UUID PK,
  unit_id UUID FK -> units.id,
  title TEXT,
  content_tier TEXT,                -- 'official' | 'hamame_plus'  -- FR-13
  current_version_id UUID FK -> lesson_versions.id NULL,
  created_at TIMESTAMPTZ
)

lesson_versions (                   -- FR-12, NFR-11 versioning/rollback
  id UUID PK,
  lesson_id UUID FK -> lessons.id,
  body_richtext JSONB,
  version_number INT,
  status TEXT,                      -- 'draft','pending_review','approved','archived'
  authored_by UUID FK -> users.id,
  reviewed_by UUID FK -> users.id NULL,
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ
)

lesson_attachments (
  id UUID PK,
  lesson_version_id UUID FK -> lesson_versions.id,
  file_url TEXT,
  type TEXT                          -- 'image','pdf','video' -- video later
)
```

## 3. Question Bank & Assessment (FR-14 to FR-21)

```sql
questions (
  id UUID PK,
  unit_id UUID FK -> units.id,        -- scoping for session builder filters
  type TEXT,                          -- 'QCM','QCS','QROC','CLINICAL_CASE'
  source TEXT,                        -- 'official_exam','hamame_authored','ai_generated'
  status TEXT DEFAULT 'pending_review',  -- BR-2 mandatory validation gate
  difficulty TEXT NULL,
  body_richtext JSONB,
  explanation_richtext JSONB,         -- validated baseline explanation (FR-18)
  ai_enhanced_explanation JSONB NULL, -- V2 -- layered, never replaces baseline
  authored_by UUID FK -> users.id NULL,
  reviewed_by UUID FK -> users.id NULL,
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ
)

question_options (                    -- for QCM/QCS
  id UUID PK,
  question_id UUID FK -> questions.id,
  body_text TEXT,
  is_correct BOOLEAN,
  order_index INT
)

clinical_case_parts (                 -- multi-part clinical case questions
  id UUID PK,
  question_id UUID FK -> questions.id,
  part_order INT,
  prompt_text TEXT,
  expected_answer_text TEXT NULL      -- for QROC-style grading reference
)

study_sessions (
  id UUID PK,
  user_id UUID FK -> users.id,
  name TEXT,
  mode TEXT,                          -- 'practice' | 'exam'
  is_official_mock BOOLEAN DEFAULT FALSE,  -- FR-19
  time_limit_seconds INT NULL,
  result_sort TEXT DEFAULT 'random',  -- FR-15 (Aug 2026): 'by_year' | 'by_course' | 'random'
  show_stats BOOLEAN DEFAULT TRUE,    -- FR-16 (Aug 2026): false gates results-screen detail stats
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ NULL,
  score NUMERIC NULL,
  created_at TIMESTAMPTZ
)

session_questions (                   -- randomized order per attempt, BR-4
  id UUID PK,
  session_id UUID FK -> study_sessions.id,
  question_id UUID FK -> questions.id,
  presented_order INT,
  option_order JSONB NULL             -- shuffled option order snapshot
)

attempts (
  id UUID PK,
  session_question_id UUID FK -> session_questions.id,
  selected_option_ids JSONB NULL,     -- QCM/QCS
  free_text_answer TEXT NULL,         -- QROC/clinical case
  is_correct BOOLEAN NULL,
  flagged_for_review BOOLEAN DEFAULT FALSE,
  answered_at TIMESTAMPTZ
)

notes (                               -- FR-20
  id UUID PK,
  user_id UUID FK -> users.id,
  question_id UUID FK -> questions.id NULL,
  lesson_id UUID FK -> lessons.id NULL,
  body_text TEXT,
  created_at TIMESTAMPTZ
)
```

## 4. Progress, Streaks & Revision (FR-22 to FR-28)

```sql
progress (
  id UUID PK,
  user_id UUID FK -> users.id,
  lesson_id UUID FK -> lessons.id NULL,
  subject_module_id UUID FK -> modules.id NULL,
  percentage NUMERIC DEFAULT 0,
  last_studied_at TIMESTAMPTZ
)

streaks (
  user_id UUID FK -> users.id PK,
  current_streak_days INT DEFAULT 0,
  longest_streak_days INT DEFAULT 0,
  last_active_date DATE
)

review_settings (                     -- V2 -- spaced repetition, FR-26/27
  user_id UUID FK -> users.id PK,
  is_enabled BOOLEAN DEFAULT FALSE,
  notifications_enabled BOOLEAN DEFAULT TRUE,
  schedule_days JSONB                  -- e.g. [1,3,7,14,30]
)

review_queue_items (                  -- V2
  id UUID PK,
  user_id UUID FK -> users.id,
  lesson_id UUID FK -> lessons.id NULL,
  question_id UUID FK -> questions.id NULL,
  due_at TIMESTAMPTZ,
  last_reviewed_at TIMESTAMPTZ NULL,
  ease_factor NUMERIC DEFAULT 2.5      -- forgetting-curve algorithm state
)
```

## 5. Gamification & Social (FR-36 to FR-40 — V1 streaks only, rest V2/V3)

```sql
badges (                              -- V2
  id UUID PK,
  name TEXT,
  criteria JSONB
)

user_badges (                         -- V2
  user_id UUID FK -> users.id,
  badge_id UUID FK -> badges.id,
  earned_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, badge_id)
)

leaderboard_snapshots (               -- V2 -- BR-12 scoped by faculty+year
  id UUID PK,
  faculty_id UUID FK -> faculties.id,
  year_id UUID FK -> years.id,
  period TEXT,                        -- 'monthly'
  user_id UUID FK -> users.id,
  rank INT,
  score NUMERIC,
  generated_at TIMESTAMPTZ
)

friendships (                         -- V2/V3
  user_id_a UUID FK -> users.id,
  user_id_b UUID FK -> users.id,
  status TEXT,                        -- 'pending','accepted'
  PRIMARY KEY (user_id_a, user_id_b)
)
```

## 6. AI Tools (V2 — FR-29 to FR-35; schema included now per FR-60/61 extensibility)

```sql
ai_interactions (                     -- V2
  id UUID PK,
  user_id UUID FK -> users.id,
  feature TEXT,                       -- 'chat','hint','note_maker','answer_locator',
                                       -- 'audio_narration','qcm_generation', ...
  context_ref_type TEXT NULL,         -- 'lesson','question'
  context_ref_id UUID NULL,
  input_summary TEXT NULL,
  output_summary TEXT NULL,
  flagged BOOLEAN DEFAULT FALSE,      -- NFR-9 error reporting
  created_at TIMESTAMPTZ
)

ai_credit_balances (                  -- V2 -- BR-6 governance
  user_id UUID FK -> users.id PK,
  daily_allowance INT,
  monthly_allowance INT,
  used_today INT DEFAULT 0,
  used_this_month INT DEFAULT 0,
  reset_at TIMESTAMPTZ
)
```

## 7. Monetization (FR-44 to FR-47, BR-1, BR-6 to BR-9, BR-16)

```sql
plans (
  id UUID PK,
  name TEXT,                          -- 'free','premium','institutional'
  price_dzd NUMERIC NULL,             -- BR-8 currency
  billing_period TEXT NULL,           -- 'monthly','yearly'
  features JSONB,
  is_active BOOLEAN DEFAULT TRUE
)

subscriptions (
  id UUID PK,
  user_id UUID FK -> users.id,
  plan_id UUID FK -> plans.id,
  status TEXT,                        -- 'active','cancelled','expired'
  started_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ NULL,
  auto_renew BOOLEAN DEFAULT TRUE     -- BR-7
)

payments (
  id UUID PK,
  subscription_id UUID FK -> subscriptions.id,
  amount_dzd NUMERIC,
  method TEXT,                        -- 'cib_edahabia','baridimob','manual_assisted', ...
  status TEXT,                        -- 'succeeded','failed','refunded'
  external_ref TEXT NULL,
  created_at TIMESTAMPTZ
)

promo_codes (                         -- V2
  id UUID PK,
  code TEXT UNIQUE,
  type TEXT,                          -- 'referral','discount'
  value JSONB,
  max_uses_per_account INT DEFAULT 1, -- BR-16 abuse cap
  expires_at TIMESTAMPTZ NULL
)

institutions (                        -- V2/V3
  id UUID PK,
  name TEXT,
  seats_licensed INT,
  admin_user_id UUID FK -> users.id
)

activation_codes (                    -- FR-65/BR-18 -- MedSparkDZ-confirmed
  id UUID PK,
  code TEXT UNIQUE,                   -- single-use, opaque token shown to student
  faculty_id UUID FK -> faculties.id,
  year_id UUID FK -> years.id,
  issued_by UUID FK -> users.id,      -- Support Agent/Admin who issued it (BR-18)
  redeemed_by UUID FK -> users.id NULL,
  payment_id UUID FK -> payments.id NULL,  -- links back to the manually-confirmed payment
  status TEXT DEFAULT 'active',       -- 'active','redeemed','expired','revoked'
  expires_at TIMESTAMPTZ NULL,
  redeemed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ
)
```

## 8. Moderation, Reporting & Trust (FR-53 to FR-55, BR-5)

```sql
reports (
  id UUID PK,
  reporter_user_id UUID FK -> users.id,
  target_type TEXT,                   -- 'question','lesson','comment','user'
  target_id UUID,
  reason TEXT,
  severity TEXT DEFAULT 'normal',     -- drives SLA priority (BR-5)
  status TEXT DEFAULT 'open',         -- 'open','in_review','resolved','dismissed'
  resolved_by UUID FK -> users.id NULL,
  resolved_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ
)
```

## 9. Resources — "Hamame Drive" (PRD 10.2 -- MedSparkDZ-confirmed)

```sql
resources (
  id UUID PK,
  faculty_id UUID FK -> faculties.id NULL,   -- NULL = cross-faculty resource
  year_id UUID FK -> years.id NULL,
  title TEXT,
  type TEXT,                          -- 'official_drive','reference','past_exam','other'
  file_url TEXT,
  source_label TEXT NULL,             -- e.g. attribution/source name shown to students
  added_by UUID FK -> users.id NULL,
  created_at TIMESTAMPTZ
)
```

## 10. Notifications (FR-41 to FR-43)

```sql
notifications (
  id UUID PK,
  user_id UUID FK -> users.id,
  category TEXT,
  title TEXT,
  body TEXT,
  read_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ
)
```

---

## Notes on design decisions worth flagging

1. **Content status lives on `lesson_versions` and `questions`, not a separate global
   table.** This directly encodes BR-2 (nothing visible until approved) as a status
   field with an audit trail (`authored_by`, `reviewed_by`, `reviewed_at`), satisfying
   NFR-10 (auditability) and NFR-11 (versioning/rollback) without extra tables.
2. **`session_questions.option_order` stores a snapshot**, not a live shuffle, so a
   student's exam-mode session is reproducible for dispute resolution (NFR-10) even
   though answers are randomized per attempt (BR-4).
3. **AI tables are included now, even though V2**, so Cursor doesn't have to bolt them
   on awkwardly later — this follows FR-60/61's extensibility requirement literally.
4. **`is_minor` on `users`** exists to make BR-11 enforceable in code (e.g., stricter
   data-retention defaults), not just a policy statement.
5. Not yet modeled: **institution-level aggregated analytics views** (BR-17) — these
   should be read-only SQL views over existing tables, not new base tables, once V2/V3
   institutional features are scoped in detail.
6. **`activation_codes` and `resources` were added following the MedSparkDZ audit**
   (August 2026). `activation_codes` formalizes the MVP's manual-payment bridge (FR-65/
   BR-18) as a real, auditable table rather than an ad-hoc Admin action; `resources`
   backs the dashboard resource hub already named in the PRD (10.2) but previously
   undefined at the data layer.

## Open question for you

Do you want me to follow this with the **REST API contract** next (endpoints mapped to
these tables and to your FRs), or would it be more useful right now to **pressure-test
this schema against a couple of real user flows** (e.g., walk through "Sarah runs a
timed résidanat mock exam" end-to-end against these tables) to catch gaps before Cursor
builds on top of it?
