# 04 — Data model and migrations (verified 2026-10-02)

`npx prisma migrate status` (real output): 24 migrations found,
"Database schema is up to date!" (pooler cooperated this time).
Live-DB `information_schema` spot checks: UNVERIFIED (pooler
`EMAXCONNSESSION` on three attempts ~1h apart); everything below rests on
`prisma/schema.prisma` (967 lines, read in full) + all 24 migration SQLs
plus targeted greps. Nothing guessed.

## Ordered migrations (one line each)

1. `...00_init` — base tables (users email/full_name NOT NULL then;
   `lesson_attachments.file_url`; notification PK composite already).
2. `...01_add_cascade_deletes` — Cascade rules.
3. `...02_make_email_university_wilaya_nullable` — email/university/wilaya nullable.
4. `...03_add_review_comment` — review comments.
5. `...04_add_progress_unique_constraint` — UNIQUE(progress.user_id, lesson_id).
6. `...05_add_password_reset_fields` — reset token hash + expiry.
7. `...06_add_verification_fields` — verification token hash + expiry.
8. `...07_add_suspended_until` — timed restrictions.
9. `...08_add_instructor_applications`.
10. `...09_add_promo_code_redemptions`.
11. `...10_add_flashcards` (+ UNIQUE(user, sourceQuestion)).
12. `...11_add_daily_goal_minutes` — streaks.daily_goal_minutes DEFAULT 20.
13. `...12_add_review_queue_and_flashcard_unique_constraints` — 3 queue
    uniques + single-target CHECK (hand-appended; Prisma can't express CHECK).
14. `...13_add_university_scoping` — universities table + university_id on
    lessons/questions (Restrict) + index.
15. `...14_add_push_notifications` — push_subscriptions + push_preferences.
16. `...15_make_full_name_nullable` — explicit-null-clear semantics.
17. `...16_add_activation_codes`.
18. `...17_add_session_result_sort_and_show_stats` — result_sort/show_stats.
19. `...18_add_resources_table`.
20. `...19_add_question_sitting_columns` — exam_year/sitting_label (pooler-safe extract).
21. `...20_add_note_tags_favorite` — tags TEXT[] + is_favorite.
22. `...21_add_simulations` — simulations + registrations.
23. `...22_add_google_sub` — users.google_sub UNIQUE.
24. `...23_add_year_track` — years.track nullable (pooler-safe extract).

## schema.prisma vs docs/hamame_database_schema.md (every difference found)

Fixed in this pass (see commit): users email/full_name NULL; reset +
verification token cols; university_id; suspended_until; updated_at (was
already right); theme +`system`; notification_preferences composite PK;
new tables universities, instructor_applications, push_subscriptions,
push_preferences, flashcards, promo_code_redemptions; years.track;
lessons.university_id; lesson_versions `rejected` + review_comment;
questions exam_year/sitting_label/university_id/review_comment;
study_sessions.created_at; notes tags/is_favorite; progress unique;
streaks.daily_goal_minutes; review engine marked LIVE (was "V2-shelved");
review_queue flashcard_id + 3 uniques + CHECK; leaderboard
period `monthly` + `monthly_contributors` (jobs + route comments confirm).

Deliberately kept as live-column: `lesson_attachments.file_url`
(snake_case). Evidence: init migration creates `"file_url" TEXT NOT NULL`;
schema.prisma line 332 declares `fileUrl String` with NO `@map` (drift —
runtime reads column `fileUrl`, which does not exist live). FLAGGED, not
fixed (docs task is read-only on schema).

`cancelledAt` typo: the schema-doc simulations note said `cancelledAt`
camelCase; live column is `cancelled_at` (fixed in doc).

`Cursor` wording in decision note 3 replaced with neutral wording.

## Activation-code semantics (verified in src/routes/activationCodes.routes.ts)

Redemption (single transaction): claim code (409 if raced) → extend or
create premium subscription (stacking from max(periodEnd, now)) → create
zero-amount `succeeded` `manual_assisted` payment on that subscription →
link paymentId back. The grant is blanket premium: `subscriptions` has NO
faculty/year columns (verified in schema lines 703-718). Documented in the
schema doc.

## Remaining schema flags (do NOT fix per task rules)

1. `LessonAttachment.fileUrl` vs live `file_url` — RESOLVED 2026-10-02 by
   one-line `@map("file_url")` (commit `9eb8361`; evidence batch 08).
2. `LessonVersion.status` comment lists 4 values; `'rejected'` is used by
   review flows (comment stale, harmless).
3. `notifications`/`reports`/`auth` payloads omit `profilePhotoUrl`-style
   fields inconsistently — checked: users/me + auth payloads include it;
   friends/leaderboard intentionally fullName-only (PII discipline, by design).
