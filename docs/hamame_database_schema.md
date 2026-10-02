# Hamame — Database Schema (ground truth, reconciled 2026-09-30)

**Grounded in:** Hamame PRD v1.0 (Sections 6, 8, 13, 14) — not MedSpark's inferred schema.
**Scope:** Covers the broad V1 (Section 14 as written) plus fields needed for V2 features
(marked `-- V2` / `-- V3`) so the schema doesn't need a redesign later, per FR-60/61.

Notation: PostgreSQL-flavored pseudo-DDL. Reconciled 2026-09-30 against
`prisma/schema.prisma`, all 24 migrations in `prisma/migrations/`, and the
migration SQL contents (live-DB spot checks were blocked that day by pooler
saturation — `EMAXCONNSESSION` on three attempts — so `information_schema`
cells below are marked UNVERIFIED where they rest on schema+migrations
alone; nothing here is guessed, only sourced).

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
  email TEXT UNIQUE NULL,          -- FR-1 phone-only registration: may be absent
  phone TEXT UNIQUE NULL,          -- FR-1 phone-based registration
  password_hash TEXT,
  password_reset_token_hash TEXT NULL,       -- sha256 lookup token, single-use, 1h expiry
  password_reset_token_expires_at TIMESTAMPTZ NULL,
  verification_token_hash TEXT NULL,         -- sha256 lookup token, single-use, 24h expiry (FR-3)
  verification_token_expires_at TIMESTAMPTZ NULL,
  full_name TEXT NULL,             -- explicit null clears the field
  faculty_id UUID FK -> faculties.id NULL,
  year_id UUID FK -> years.id NULL,
  university TEXT NULL,               -- vestigial free text, superseded by university_id; kept for shape stability
  university_id UUID FK -> universities.id NULL,  -- FR-10a layered scoping; null = global-only visibility
  wilaya TEXT NULL,                  -- city/province, per FR-4
  profile_photo_url TEXT NULL,
  ui_language TEXT DEFAULT 'fr',   -- 'fr' | 'en'  -- NFR-6 (was 'fr' | 'ar'; Arabic UI never shipped, EN/FR toggle built 2026-09-28)
  theme TEXT DEFAULT 'light',      -- 'light' | 'dark' | 'system' ('system' added 2026-09-30; stored default still 'light') [UNVERIFIED live]
  email_verified_at TIMESTAMPTZ NULL,
  phone_verified_at TIMESTAMPTZ NULL,
  google_sub TEXT NULL UNIQUE,      -- Google OAuth stable identity (M9); matched before email, never reassigned
  is_minor BOOLEAN DEFAULT FALSE,  -- BR-11 data-handling awareness
  status TEXT DEFAULT 'active',    -- 'active','suspended','deleted'
  suspended_until TIMESTAMPTZ NULL, -- time-based restriction expiry; null = indefinite
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

user_roles (                       -- many-to-many; roles are additive (Section 6)
  user_id UUID FK -> users.id (Cascade),
  role_id UUID FK -> roles.id,
  PRIMARY KEY (user_id, role_id)
)

notification_preferences (        -- composite PK (user_id, category, channel):
  user_id UUID FK -> users.id (Cascade),  -- one row per category/channel combo,
  channel TEXT,                    -- 'in_app','email','push'   -- (NOT one row per user;
  category TEXT,                   -- 'revision','subscription','content_update',  -- the single-column-PK draft
                                     -- 'moderation','social'     -- was corrected before build)
  enabled BOOLEAN DEFAULT TRUE
  PRIMARY KEY (user_id, category, channel)
)

instructor_applications (         -- self-service promote-to-instructor path
  id UUID PK,
  user_id UUID FK -> users.id,
  motivation_text TEXT,
  status TEXT DEFAULT 'pending',   -- 'pending' | 'approved' | 'rejected'
  reviewed_by UUID FK -> users.id NULL,
  reviewed_at TIMESTAMPTZ NULL,
  review_comment TEXT NULL,
  created_at TIMESTAMPTZ
)

push_subscriptions (              -- one row per browser/device, NOT per user
  id UUID PK,
  user_id UUID FK -> users.id (Cascade),
  endpoint TEXT UNIQUE,           -- Push API per-installation URL: natural dedupe key
  p256dh_key TEXT,
  auth_key TEXT,
  user_agent TEXT NULL,
  created_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ
)

push_preferences (                -- one row per user; missing row = all four default true
  user_id UUID FK -> users.id (Cascade) PK,
  master_enabled BOOLEAN DEFAULT TRUE,
  daily_goal_reminder BOOLEAN DEFAULT TRUE,
  streak_at_risk BOOLEAN DEFAULT TRUE,
  badge_earned BOOLEAN DEFAULT TRUE
)
```

## 2. Curriculum Structure (FR-9, FR-10 — must stay faculty-agnostic/configurable)

```sql
universities (                     -- FR-10a layered (not siloed) content scoping
  id UUID PK,                      -- normalized table (not free text): visibility
  name TEXT UNIQUE,                -- decisions must not hinge on typo-prone matching
  wilaya TEXT NULL,
  created_at TIMESTAMPTZ
)

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
  track TEXT NULL,                 -- 'medecine' | 'dentaire' | 'pharmacie' (2026-09-30, onboarding); null on pre-track rows [UNVERIFIED live]
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
  university_id UUID FK -> universities.id NULL (Restrict),  -- FR-10a; null = global
  created_at TIMESTAMPTZ
)

lesson_versions (                   -- FR-12, NFR-11 versioning/rollback
  id UUID PK,
  lesson_id UUID FK -> lessons.id,
  body_richtext JSONB,
  version_number INT,
  status TEXT,                      -- 'draft','pending_review','approved','archived' (+ 'rejected' used by review flows)
  authored_by UUID FK -> users.id,
  reviewed_by UUID FK -> users.id NULL,
  reviewed_at TIMESTAMPTZ NULL,
  review_comment TEXT NULL,         -- mandatory on reject / changes-requested
  created_at TIMESTAMPTZ
)

lesson_attachments (
  id UUID PK,
  lesson_version_id UUID FK -> lesson_versions.id,
  file_url TEXT,                    -- verified live via findMany + before/after migrate diff (2026-10-02); schema.prisma maps it with @map
  type TEXT                          -- 'image','pdf','video' -- video later
)
```

## 3. Question Bank & Assessment (FR-14 to FR-21)

```sql
questions (
  id UUID PK,
  unit_id UUID FK -> units.id,        -- scoping for session builder filters
  type TEXT,                          -- 'QCM','QCS','QROC','CLINICAL_CASE'
  source TEXT,                        -- 'official_exam','hamame_authored','ai_generated' (provenance, NOT sitting)
  exam_year INT NULL,                 -- past-exam picker + period filter; NULL = untagged (default)
  sitting_label TEXT NULL,            -- free text ('EMD','Résidanat','Rattrapage',...) — no enum/table by decision
  status TEXT DEFAULT 'pending_review',  -- BR-2 mandatory validation gate
  difficulty TEXT NULL,
  body_richtext JSONB,
  explanation_richtext JSONB,         -- validated baseline explanation (FR-18)
  ai_enhanced_explanation JSONB NULL, -- V2 -- layered, never replaces baseline
  authored_by UUID FK -> users.id NULL,
  reviewed_by UUID FK -> users.id NULL,
  reviewed_at TIMESTAMPTZ NULL,
  review_comment TEXT NULL,           -- mandatory on reject / changes-requested
  university_id UUID FK -> universities.id NULL (Restrict),  -- FR-10a; null = global
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
  tags TEXT[] DEFAULT '{}',           -- fixed 6-tag taxonomy, validated server-side
  is_favorite BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ
)

flashcards (                          -- user-generated; enqueued into review_queue_items (NOT a second queue)
  id UUID PK,
  user_id UUID FK -> users.id (Cascade),
  front TEXT,
  back TEXT,
  source_question_id UUID FK -> questions.id NULL (SetNull),
  source_lesson_id UUID FK -> lessons.id NULL (SetNull),
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  UNIQUE (user_id, source_question_id)  -- one auto-card per (user, question); NULLs stay distinct
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
  last_studied_at TIMESTAMPTZ,
  UNIQUE (user_id, lesson_id)         -- atomic per-lesson upsert, no find-then-create race
)

streaks (
  user_id UUID FK -> users.id PK,
  current_streak_days INT DEFAULT 0,
  longest_streak_days INT DEFAULT 0,
  last_active_date DATE,
  daily_goal_minutes INT DEFAULT 20
)

review_settings (                     -- spaced repetition, FR-26/27 (LIVE via /reviews/*, not V2-shelved)
  user_id UUID FK -> users.id PK,
  is_enabled BOOLEAN DEFAULT FALSE,
  notifications_enabled BOOLEAN DEFAULT TRUE,
  schedule_days JSONB                  -- e.g. [1,3,7,14,30]
)

review_queue_items (                  -- LIVE engine (lessons, questions, flashcards)
  id UUID PK,
  user_id UUID FK -> users.id,
  lesson_id UUID FK -> lessons.id NULL,
  question_id UUID FK -> questions.id NULL,
  flashcard_id UUID FK -> flashcards.id NULL,
  due_at TIMESTAMPTZ,
  last_reviewed_at TIMESTAMPTZ NULL,
  ease_factor NUMERIC DEFAULT 2.5,     -- forgetting-curve algorithm state
  UNIQUE (user_id, lesson_id),         -- three separate uniques (NULLs stay
  UNIQUE (user_id, question_id),       -- distinct) + single-target CHECK:
  UNIQUE (user_id, flashcard_id)       -- exactly one target non-NULL
)
```

## 5. Gamification & Social (FR-36 to FR-40)

```sql
badges (
  id UUID PK,
  name TEXT,
  criteria JSONB
)

user_badges (
  user_id UUID FK -> users.id,
  badge_id UUID FK -> badges.id,
  earned_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, badge_id)
)

leaderboard_snapshots (               -- BR-12 scoped by faculty+year
  id UUID PK,
  faculty_id UUID FK -> faculties.id,
  year_id UUID FK -> years.id,
  period TEXT,                        -- 'monthly' (scores) | 'monthly_contributors' (participation)
  user_id UUID FK -> users.id,
  rank INT,
  score NUMERIC,
  generated_at TIMESTAMPTZ
)

friendships (
  user_id_a UUID FK -> users.id,
  user_id_b UUID FK -> users.id,
  status TEXT,                        -- 'pending','accepted'
  PRIMARY KEY (user_id_a, user_id_b)
)
```

## 6. AI Tools (FR-29 to FR-35; credit tables + interaction log are live)

```sql
ai_interactions (
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

ai_credit_balances (                  -- BR-6 governance (live: hints + /ai/credits)
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

promo_codes (
  id UUID PK,
  code TEXT UNIQUE,
  type TEXT,                          -- 'referral','discount'
  value JSONB,
  max_uses_per_account INT DEFAULT 1, -- BR-16 abuse cap
  expires_at TIMESTAMPTZ NULL
)

promo_code_redemptions (
  id UUID PK,
  promo_code_id UUID FK -> promo_codes.id,
  user_id UUID FK -> users.id,
  redeemed_at TIMESTAMPTZ
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
  payment_id UUID FK -> payments.id NULL,  -- zero-amount succeeded manual_assisted payment, created AT redemption (money moved off-platform)
  status TEXT DEFAULT 'active',       -- 'active','redeemed','expired','revoked'
  expires_at TIMESTAMPTZ NULL,
  redeemed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ
)
-- NOTE: the grant is blanket premium — subscriptions has no faculty/year
-- columns, so the faculty-year scope lives only on the code + notification,
-- not on the entitlement itself.
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

## 9b. Scheduled simulations (P12 big half — MedSparkDZ-confirmed)

```sql
simulations (
  id UUID PK,
  title TEXT,
  description TEXT NULL,
  faculty_id UUID FK -> faculties.id,  -- Restrict
  year_id UUID FK -> years.id NULL,    -- NULL = all years of the faculty
  scheduled_at TIMESTAMPTZ,
  duration_minutes INT,
  question_count INT,
  cancelled_at TIMESTAMPTZ NULL,
  created_by UUID NULL,                -- plain id, no FK (decoupled from admin accounts)
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

simulation_registrations (
  id UUID PK,
  simulation_id UUID FK -> simulations.id (Cascade),
  user_id UUID FK -> users.id (Cascade),
  created_at TIMESTAMPTZ,
  UNIQUE(simulation_id, user_id)
)
```

Status (`scheduled`/`live`/`completed`/`cancelled`) is derived from
`scheduled_at`/`duration_minutes`/`cancelled_at` at read time — never stored,
so no cron job is needed for transitions.

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
3. **AI tables are included now, even though V2**, so later builds don't have to bolt them
   on awkwardly later — this follows FR-60/61's extensibility requirement literally
   (and the credit + interaction tables are live since the hints build).
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
7. **Draft corrections folded in during the 2026-09-30 reconciliation:** the
   single-column `notification_preferences` PK (would have allowed one row per
   user — corrected to the composite before build, matching the schema header);
   `theme` accepts `'system'` since the 2026-09-30 theme build; `Year.track`
   (`medecine` | `dentaire` | `pharmacie`, nullable) scopes years to onboarding
   tracks. One known drift left, flagged not fixed: the
   `LessonVersion.status` comment lists four values while `'rejected'` is
   used by review flows. (A second drift — `lesson_attachments.file_url`
   vs schema `fileUrl` — was fixed 2026-10-02 with `@map("file_url")`,
   proven by live read + before/after diff; see state file 08.)
8. **Onboarding taxonomy (2026-09-30):** 15 wilaya faculties are DRAFT
   (owner to confirm) and staged `beta`; final year per track is Internat
   (no exams — honest empty bank states), then Résidanat. No `User` change:
   the year row implies the track.

## Open question for you

Answered: the REST API contract now lives in `docs/hamame_api_contract.md`
(mapped per table and FR). The remaining open item is BR-17
institution-level aggregated analytics views — read-only SQL views over
existing tables, not new base tables, once V2/V3 institutional features are
scoped in detail (was decision note 5 above).
