# Hamame — REST API Contract (Draft v0.1)

Grounded in the PRD's FRs and the database schema (v0.1). Auth via Bearer JWT unless noted.
`[V2]` = build the endpoint stub now (per FR-60/61 extensibility) but feature is inactive until V2.

## Auth & Account
| Method | Endpoint | Description |
|---|---|---|
| POST | /api/auth/register | Register via email or phone (FR-1) |
| POST | /api/auth/login | Login |
| POST | /api/auth/forgot-password | Request reset |
| POST | /api/auth/reset-password | Reset with token |
| POST | /api/auth/verify | Verify email/phone (FR-3) |
| GET | /api/users/me | Current profile |
| PUT | /api/users/me | Update profile (faculty, year, university, wilaya, photo) |
| PUT | /api/users/me/preferences | Language, theme, notification prefs |
| GET | /api/users/me/export | Data export request (FR-8) |
| DELETE | /api/users/me | Account deletion request (FR-8) |

## Curriculum
| Method | Endpoint | Description |
|---|---|---|
| GET | /api/faculties | List faculties (rollout_status filter) |
| GET | /api/faculties/:id/years | Years for a faculty |
| GET | /api/years/:id/modules | Modules for a year |
| GET | /api/modules/:id/units | Units for a module |
| GET | /api/units/:id/lessons | Lessons for a unit |
| GET | /api/lessons/:id | Lesson detail (current approved version only, for students) |

## Question Bank & Sessions
| Method | Endpoint | Description |
|---|---|---|
| GET | /api/questions | Filtered list (faculty/year/module/unit/type/source/date) — FR-15 |
| POST | /api/sessions | Create session (mode, filters, size) — FR-15/16 |
| GET | /api/sessions/:id | Session detail + questions |
| POST | /api/sessions/:id/answers | Submit answer(s) for a question in-session |
| POST | /api/sessions/:id/submit | Finalize session, compute score |
| GET | /api/sessions/:id/results | Results + explanations |
| POST | /api/questions/:id/report | Report an error (FR-17, feeds `reports`) |
| GET | /api/notes | List user's notes |
| POST | /api/notes | Create note tied to question/lesson (FR-20) |

## Progress & Dashboard
| Method | Endpoint | Description |
|---|---|---|
| GET | /api/progress/me | Streak, score, accuracy, activity history |
| GET | /api/progress/modules/:id | Per-module tracking (FR-23) |
| GET | /api/reviews/settings `[V2]` | Spaced repetition config |
| PUT | /api/reviews/settings `[V2]` | Update config |
| GET | /api/reviews/due `[V2]` | Due queue |

## AI Tools `[V2]`
| Method | Endpoint | Description |
|---|---|---|
| POST | /api/ai/chat | Study assistant |
| POST | /api/ai/hint | Contextual hint |
| POST | /api/ai/note-maker | Generate notes from lesson |
| POST | /api/ai/answer-locator | Locate answer in lesson |
| POST | /api/ai/audio | Generate narrated audio |
| GET | /api/ai/credits | Remaining balance (BR-6) |

## Gamification & Social
| Method | Endpoint | Description |
|---|---|---|
| GET | /api/streaks/me | Current/longest streak (V1) |
| GET | /api/leaderboard `[V2]` | Scoped by faculty+year (BR-12) |
| GET | /api/badges `[V2]` | Badge catalog + earned |
| POST | /api/friends `[V2]` | Add friend |

## Monetization
| Method | Endpoint | Description |
|---|---|---|
| GET | /api/plans | Active plans |
| POST | /api/subscriptions | Create subscription (payment_token) |
| GET | /api/subscriptions/me | Current subscription |
| PUT | /api/subscriptions/me/cancel | Cancel (BR-7: effective end of period) |
| POST | /api/promo-codes/redeem `[V2]` | Redeem referral/discount code |

## Content Authoring & Validation (Instructor/Reviewer)
| Method | Endpoint | Description |
|---|---|---|
| POST | /api/authoring/lessons | Draft a lesson version |
| POST | /api/authoring/questions | Draft a question |
| POST | /api/authoring/:type/:id/submit | Submit for review |
| GET | /api/review/queue | Reviewer's pending queue |
| POST | /api/review/:type/:id/approve | Approve (BR-2) |
| POST | /api/review/:type/:id/reject | Reject with mandatory comment |
| GET | /api/authoring/me/stats | Contributor's aggregate stats (FR-51) |

## Moderation
| Method | Endpoint | Description |
|---|---|---|
| GET | /api/moderation/queue | Reports queue, severity-sorted (BR-5) |
| POST | /api/moderation/reports/:id/resolve | Resolve/dismiss |
| POST | /api/moderation/users/:id/restrict | Restrict abusive account |

## Admin
| Method | Endpoint | Description |
|---|---|---|
| GET | /api/admin/analytics | Usage/financial/content-coverage dashboards |
| PUT | /api/admin/faculties/:id/rollout-status | Set planned/beta/live (BR-15) |
| PUT | /api/admin/plans/:id | Configure plan features/pricing |
| PUT | /api/admin/ai-credits | Configure allowances (BR-6) |

---

All endpoints return standard error shape: `{ error: { code, message } }`.
Pagination via `?page=&limit=` on list endpoints. Role-based access enforced per
Section 6/14 of the PRD — exact middleware rules to be defined by Cursor against the
`roles`/`user_roles` tables, not re-specified here.
