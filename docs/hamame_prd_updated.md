# Hamame — Product Requirements Document (PRD)

**Document status:** Definitive v1.0
**Product:** Hamame — Algerian digital learning platform for health-science students (expandable to all faculties)
**Author:** Product Team
**Date:** 11 July 2026
**Inspiration source:** MedSpark blueprint and MBset feature analysis (both used strictly as inspirational references — not copied; Hamame is designed independently for the Algerian market and a multi-faculty future). Items below marked **[MBset-inspired]** were added following a competitive feature review of MBset (August 2026) and represent deliberate roadmap additions, not literal feature parity. Items marked **[MedSparkDZ-confirmed]** were added or refined following a direct, route-by-route frontend/UX audit of the live MedSparkDZ product (August 2026); most of MedSparkDZ's observed feature surface was already covered by this PRD prior to that audit — items so marked are the genuine net-new additions or refinements it surfaced, not a wholesale rewrite.

> Scope note: This document defines **what** Hamame is and **why** it exists — product vision, users, requirements, rules, roadmap and business model. It intentionally does **not** define technical architecture, database schema, API contracts, or code. Those belong to a separate technical design document produced after this PRD is approved.

---

## 1. Vision

Hamame becomes the most trusted digital study companion for Algerian students in health sciences — and eventually every academic discipline — by unifying curriculum-aligned content, an exhaustive practice-question bank, and AI-powered personalized tutoring in the languages Algerian students actually think and speak in (French, Arabic, and Algerian Darja).

Where international platforms are priced for Western markets and generic tutoring apps ignore the Algerian curriculum (LMD system, national résidanat concours, ministry programs), Hamame is built **from Algeria, for Algeria** — affordable, offline-tolerant, mobile-first, and structurally ready to scale from Medicine, Dentistry, and Pharmacy to Engineering, Law, Sciences, Economics, and beyond.

## 2. Mission

To give every Algerian student, regardless of their city, connectivity, or budget, access to:

1. A complete, accurate, and locally-aligned body of courses and practice questions for their exact year and faculty.
2. Adaptive, AI-assisted learning tools that behave like a personal tutor available 24/7 in the student's own language.
3. A structured, motivating revision system (spaced repetition, streaks, analytics) that measurably improves exam and concours outcomes.
4. A platform architecture that can be extended, faculty by faculty, into a nationwide multi-discipline education network — without rebuilding the product each time.

## 3. Goals

### 3.1 Product goals (Year 1)
- Launch a stable, production-grade MVP covering Medicine, Dentistry, and Pharmacy (years 1 through 6/7, plus résidanat preparation) within 4 months of development start.
- Cover at least 80% of the official first three years' curriculum (courses + QCM bank) for the three launch faculties within 6 months of MVP launch.
- Ship AI-assisted study tools (tutor chat, hints, explanations, note generation) within 9 months.
- Reach 99.5% monthly uptime once out of beta.

### 3.2 Business goals (Year 1–2)
- Acquire a critical mass of free users in the three launch faculties to build trust and word-of-mouth before pushing monetization hard.
- Convert a meaningful share of active free users to a paid tier once premium content and AI tools are live (target defined in Success Metrics).
- Validate at least one institutional (B2B) relationship (university department, private prep center, or résidanat coaching group) by end of Year 2.
- Expand to at least two additional faculties by the start of Year 3 without a platform rewrite.

### 3.3 Strategic goals (long-term)
- Become the default "second university" Algerian students open every day, across all faculties.
- Build a proprietary, continuously-validated Algerian academic knowledge base that becomes Hamame's long-term moat (better than any single AI model alone).
- Establish a fair, transparent revenue-sharing model for Algerian instructors/content creators, turning them into partners rather than one-off vendors.

## 4. Target Users

### 4.1 Primary (MVP)
- Undergraduate **Medicine** students (1st–6th/7th year) in Algerian universities.
- Undergraduate **Dentistry** students (1st–5th year).
- Undergraduate **Pharmacy** students (1st–5th year).
- Graduating students preparing for the national **résidanat concours** and other post-graduate entrance exams.

### 4.2 Secondary (post-MVP, later versions)
- Students in other faculties as Hamame expands (Engineering, Law, Economics, Sciences, Psychology, etc.).
- Junior doctors/pharmacists/dentists preparing specialization or licensing exams.
- Private tutoring centers and exam-prep coaching groups (as institutional customers).

### 4.3 Tertiary
- University instructors, teaching assistants, and residents willing to create or validate content (paid or volunteer contributors).
- University administrations interested in providing Hamame as a supplementary resource to their students (institutional licensing).

## 5. User Personas

**Persona 1 — Amine, 20, 2nd-year Medicine student, Algiers**
Lives with parents, tight budget, shares a laptop with siblings, mostly studies on his phone during commute. Needs: a reliable, mostly-free QCM bank organized exactly like his modules, quick answers to "did I get this right and why," low mobile data consumption.

**Persona 2 — Sarah, 24, 6th-year Medicine student preparing for résidanat, Oran**
Extremely time-constrained (hospital rotations + internship), needs realistic timed exam simulations, deep analytics on weak subjects, and an AI explainer that saves her from digging through 40-page course PDFs. Willing to pay for anything that saves time and improves her ranking chances.

**Persona 3 — Yacine, 18, 1st-year Dentistry student, Tizi Ouzou / rural area**
New to university-level study methods, needs foundational structure and guidance, unreliable home internet, prefers Arabic explanations for terminology alongside French course material. Price-sensitive; free tier must feel genuinely useful, not crippled.

**Persona 4 — Meriem, 23, final-year Pharmacy student, Constantine**
Prepares for her state exam and internship placement, mostly studies from her phone, wants offline access to download course packs before traveling to family in a lower-connectivity wilaya.

**Persona 5 — Dr. Belkacem, hospital resident and part-time content creator**
Wants to create and sell/validate QCM sets and structured notes, needs simple authoring tools, visibility into how students use his content, and a fair, transparent payout.

**Persona 6 — Nadia, Platform Operations & Content Quality Lead**
Internal persona: responsible for validating medical accuracy of content before publication, moderating community content, and monitoring platform health metrics and support queues.

## 6. User Roles

| Role | Description |
|---|---|
| **Guest** | Unauthenticated visitor; can see marketing pages, plan pricing, and a limited content/QCM preview to drive sign-up. **[MBset-inspired]** A short, no-signup, no-payment-method-required trial session (e.g., a capped-duration QCM sample) is available to reduce first-touch friction, distinct from the standard limited preview. |
| **Student (Free)** | Registered student with access to the free tier defined in Section 12. |
| **Student (Premium)** | Paying subscriber with access to premium content and AI tools. |
| **Instructor / Content Creator** | Verified contributor who creates courses, QCM, notes; may monetize content (Version 2+). |
| **Academic Reviewer / Validator** | Certified subject-matter expert who reviews and approves content for medical/academic accuracy before it goes live. Mandatory quality gate — see Business Rules. |
| **Community Moderator** | Manages reported content, community interactions (forums, comments, shared sessions), and enforces platform conduct rules. |
| **Support Agent** | Handles support tickets, payment disputes, account issues. |
| **Institution Admin** (Version 2/3) | Represents a partner university or prep center; manages seats/licenses and views aggregate (never individual) student performance for their institution. |
| **Admin** | Manages users, content pipelines, subscriptions, and platform configuration. |
| **Super Admin / Platform Owner** | Full privileges, including financial configuration, role management, and system-wide policy settings. |

Role permissions are additive and hierarchical where applicable (e.g., Admin inherits Support Agent and Moderator capabilities), and are enforced by the business rules in Section 14, not by any technical mechanism specified here.

## 7. User Journeys

### 7.1 Onboarding
1. Visitor lands on the homepage, sees value proposition and pricing.
2. Signs up with email/password (or phone number, given local mobile-first behavior) — see Localization for phone-based auth rationale.
3. Verifies email or phone.
4. Selects **faculty** (Medicine, Dentistry, Pharmacy at launch), **year of study**, and **university**.
5. Sees a short guided tour of the dashboard, QCM bank, and courses relevant to their exact year/faculty.
6. Is prompted to complete a first short "placement" QCM session to calibrate initial analytics and recommendations.

### 7.2 Daily study — QCM practice
1. Student opens dashboard, sees streak, daily goal, and recommended next action.
2. Creates a custom QCM session (subject, module, question type, source, size, practice vs exam mode).
3. Answers questions; strikes out options, checks answers immediately (practice) or at the end (exam mode).
4. Reviews AI-enhanced explanations, requests a hint or asks the AI tutor for clarification (Version 2+).
5. Session results feed progress dashboard, streak counter, and spaced-repetition queue.

### 7.3 Deep study — course + AI tools
1. Student browses faculty → year → module → unit → lesson structure.
2. Reads lesson content (text, images, diagrams; video in later versions).
3. Uses AI tools: generate summary notes, locate the answer to a specific question inside the lesson, listen to an AI-generated audio version, or ask the tutor a follow-up question grounded in that lesson (Version 2+).
4. Progress is marked automatically; lesson is queued into spaced repetition based on the forgetting curve.

### 7.4 Exam simulation (résidanat / end-of-year prep)
1. Student selects an official-format mock exam (subject scope, duration, question count matching real concours structure).
2. Timed exam runs under simulated real conditions (no pausing, shuffled options, no early answer reveal).
3. On submission, student receives score, percentile vs. peers (where available), and a full breakdown with explanations.
4. Weak areas are automatically suggested as the next study focus and added to the revision plan.

### 7.5 Subscription upgrade
1. Free student hits a premium-gated feature (e.g., official reorganized courses, AI tutor beyond daily free credits).
2. Sees a clear comparison of Free vs Premium (Section 12) and local pricing in DZD.
3. Pays via a supported local method (Section 19).
4. Premium unlocks instantly; billing, renewal, and cancellation are self-service.

### 7.6 Revision & retention loop
1. Student enables the spaced-repetition system and sets a personalized schedule.
2. Receives reminders (in-app/push/email) when lessons or question sets are "due."
3. Reviews due items; system reschedules based on recall performance.
4. Dashboard visualizes long-term retention and progress trends.

### 7.7 Content creation & validation (Instructor → Reviewer)
1. Verified instructor drafts a course, lesson, or QCM set in the authoring workspace.
2. Content is submitted for review; cannot be published without sign-off.
3. Academic Reviewer checks accuracy, source citations, and curriculum alignment; approves, requests changes, or rejects.
4. Approved content is published and versioned; instructor is notified and, where applicable, compensated per the revenue-share rules.

### 7.8 Community moderation
1. A student flags a question, explanation, or comment as incorrect, offensive, or spam.
2. Report enters the moderation queue with priority based on severity and volume.
3. Moderator/Reviewer resolves within the SLA defined in Business Rules; reporter is notified of the outcome.

### 7.9 Support & disputes
1. Student opens a support ticket (payment issue, account issue, content error).
2. Support Agent triages, resolves, or escalates (billing disputes escalate to Admin).
3. Resolution and any refund/credit is logged against the account.

## 8. Functional Requirements

Requirements are grouped by module. Each is a product capability the platform must provide; they are intentionally implementation-agnostic.

### 8.1 Authentication & Account Management
- FR-1: Users can register via email/password; phone-number-based registration is supported to reflect local mobile-first habits.
- FR-2: Users can log in, log out, and recover a forgotten password.
- FR-3: Email or phone verification is required before full access is granted.
- FR-4: Users can manage profile details: full name, faculty, year of study, university, city/wilaya, profile photo.
- FR-5: Users can set notification preferences (channel and frequency).
- FR-6: Users can switch UI language and light/dark theme.
- FR-7: Users can view and manage their subscription status and billing history.
- FR-8: Users can delete or request export of their personal data (see Localization/compliance rules).

### 8.2 Faculty, Curriculum & Content Structure
- FR-9: The platform organizes content hierarchically: **Faculty → Year → Module → Unit → Lesson**, with the structure adaptable per faculty (some faculties may need additional levels, e.g., "Stage/Internship").
- FR-10: Each faculty's curriculum structure is configurable independently so that adding a new faculty does not require redesigning the content model.
- FR-10a **[MBset-inspired, forward-looking]:** Where meaningful curriculum or annales differences exist between universities within the same faculty/year, content can optionally be scoped to a specific university in addition to faculty/year — without requiring a full content model redesign. Not required for MVP; noted here so the content model doesn't have to be redesigned later if inter-university specificity becomes a competitive necessity (see NFR-2).
- FR-11: Lessons support rich content: formatted text, images, diagrams, embedded video (later), and downloadable attachments.
- FR-12: Content is versioned; students always see the latest approved version, but prior versions are retained for audit.
- FR-13: Content can be tagged as "Official" (aligned to ministry/university syllabus) or "Hamame Plus" (enriched/reorganized supplementary content).

### 8.3 Question Bank & Assessment Engine
- FR-14: The platform supports multiple question types: single-choice (QCS), multiple-choice (QCM), short open-answer (QROC), and clinical case vignettes with multi-part questions.
- FR-15: Students can build a custom practice session by filtering on faculty, year, module/unit, question type, source (e.g., past official exams vs. Hamame-authored), and date range. **[MedSparkDZ-confirmed]** The builder also lets students choose a result **ordering** (by year, by course, or randomized) and search/filter the course list by name while multi-selecting units/modules with visible per-course question counts, rather than requiring one unit at a time.
- FR-16: Students can choose between **Practice Mode** (immediate feedback) and **Exam Mode** (timed, no feedback until submission, real-exam conditions). **[MedSparkDZ-confirmed]** Exam Mode and a "show statistics" toggle are exposed as inline switches inside the same session-builder flow (not a separate screen), so switching modes doesn't interrupt setup.
- FR-17: The session interface supports navigating between questions, striking out answer options, flagging a question for later review, and reporting an error.
- FR-18: Every question has a stored correct answer and an explanation; explanations can be enhanced by AI (Version 2+) without replacing the validated baseline explanation.
- FR-19: Students can run official-format mock/simulation exams that mirror real national exam or résidanat concours structure (duration, question count, scoring weights).
- FR-20: Students can save notes tied to any question or lesson and export their personal notes.
- FR-21: Question and session data (order, option order) is randomized per attempt to reduce rote memorization and support anti-cheating goals.
- FR-21a **[MBset-inspired]:** Students can initiate a live, timed "Challenge" session against one or more peers (same module/unit scope, synchronized start, head-to-head or small-group scoring) as a distinct mode from solo Practice/Exam sessions — framed as a motivational/social variant, not a replacement for the individual exam-integrity rules in BR-4.

### 8.4 Progress Tracking & Analytics
- FR-22: The platform tracks per-student metrics: streak, total score, accuracy, session history, time spent, and per-subject strength/weakness breakdown.
- FR-23: Students can create a dedicated "tracking" view per subject to monitor progress over time.
- FR-24: The dashboard visualizes weekly/monthly activity, completed lessons, and overall progress against the selected curriculum.
- FR-25: The platform surfaces a "recent activity" feed and suggested next actions.

### 8.5 Spaced Repetition & Revision
- FR-26: The platform runs a spaced-repetition scheduling system (forgetting-curve based) across lessons and/or question sets. **[MBset-inspired]** The target algorithm is **FSRS (Free Spaced Repetition Scheduler)** or an equivalent modern, retention-modeled scheduler — a simpler fixed-formula approximation (e.g., SM-2-style) is an acceptable interim implementation, but FSRS-class scheduling is the product goal, not just "any spaced repetition."
- FR-27: Students can enable/disable the system, configure notification preferences, and customize the review interval schedule.
- FR-28: The platform surfaces a "due for review" queue and reminds students via their chosen notification channel.

### 8.6 AI-Assisted Learning Tools
(Full catalog in Section 13; functional requirements here define platform-level behavior.)
- FR-29: Students can request a contextual hint during a QCM session without the system revealing the answer outright.
- FR-30: Students can request an AI-generated summary/notes from any lesson.
- FR-31: Students can ask the AI where in a given lesson the answer to a specific question can be found.
- FR-32: Students can converse with an AI study assistant that answers academic questions grounded in Hamame's validated curriculum content, and clearly indicates when it is answering outside that grounded content.
- FR-33: Students can generate or listen to an AI-narrated audio version of a lesson in their preferred supported language.
- FR-34: The platform tracks and enforces AI usage credits per plan tier (see Business Rules) and clearly displays remaining balance.
- FR-35: All AI-generated academic content is labeled as AI-assisted and is subject to the same reporting/error-flagging mechanism as human-authored content.

### 8.7 Gamification & Social
- FR-36: The platform tracks daily study streaks and displays streak status prominently.
- FR-37: A monthly leaderboard ranks students (scoped by faculty/year to keep comparisons meaningful) with recognition for top performers.
- FR-38: Students earn progression badges tied to concrete milestones (e.g., modules completed, streak length, mock exam count).
- FR-39: Students can add friends/classmates and see comparative (opt-in) progress.
- FR-40: Students can join or create shared study sessions (group timer, shared session review) — targeted for Version 2/3.

### 8.8 Notifications
- FR-41: The platform supports in-app, email, and push notifications for: revision reminders, subscription events, content updates, moderation outcomes, and social activity.
- FR-42: Students control notification granularity per category.
- FR-43: A notification center retains historical notifications.

### 8.9 Monetization & Subscription Management
- FR-44: The platform supports a free tier and at least one paid tier, with clear in-product upgrade prompts at gating points.
- FR-45: Students can view, upgrade, downgrade, or cancel their subscription; cancellation takes effect at the end of the paid period unless a refund rule applies.
- FR-46: Payments are processed through locally relevant methods (Section 19); the platform issues confirmation and invoices.
- FR-47: The platform supports promotional codes, referral credits, and institutional bulk licensing (Version 2/3).

### 8.10 Content Authoring & Validation (Instructor/Reviewer workflow)
- FR-48: Verified instructors can draft courses, lessons, and question sets in a dedicated authoring workspace.
- FR-49: Draft content must pass an academic validation step by a qualified Reviewer before publication.
- FR-50: Reviewers can approve, request changes, or reject content, with mandatory comments on rejection/change requests.
- FR-51: Instructors can see aggregate (anonymized) performance statistics for the content they authored.
- FR-52: The platform tracks contributor attribution and, where applicable, revenue share for monetized content (Version 2/3).

### 8.11 Moderation & Trust
- FR-53: Any student can report a question, explanation, lesson, or social content item as inaccurate, inappropriate, or spam.
- FR-54: Reports enter a moderation queue with severity-based prioritization and a resolution SLA (Section 14).
- FR-55: Moderators/Reviewers can hide, correct, or remove content, and can restrict abusive accounts.

### 8.12 Search & Discovery
- FR-56: Students can search across lessons, questions, and notes within their faculty/year scope (and beyond, if explicitly browsing other years/faculties).
- FR-57: Search supports both keyword and, from Version 2 onward, semantic (meaning-based) queries to support the AI answer-locator use case.

### 8.13 Offline & Low-Connectivity Support
- FR-58: Premium students can download lessons and question sets for offline study (Version 2+).
- FR-59: The platform degrades gracefully on slow connections (e.g., text-first loading, deferred media).

### 8.14 Multi-Faculty Extensibility
- FR-60: Adding a new faculty must be achievable as a content/configuration exercise (new curriculum tree, new question sources) without requiring new product features to be designed from scratch.
- FR-61: Cross-faculty platform features (auth, gamification, AI tools, subscriptions, notifications) must remain faculty-agnostic so they apply uniformly as new faculties launch.

### 8.15 Administration
- FR-62: Admins can manage users, roles, content pipelines, subscription plans, and pricing.
- FR-63: Admins can view platform-wide usage, financial, and content-coverage analytics.
- FR-64: Admins can configure AI credit allowances, feature flags per plan tier, and faculty rollout status (e.g., "beta," "live").

### 8.16 Access Activation & Study Utilities **[MedSparkDZ-confirmed, new]**
- FR-65: Students can redeem an **activation code** to unlock premium/official content for a specific faculty-year, as a lightweight alternative front-end to the manual/assisted payment path already anticipated in Section 18.3 — a human confirms payment off-platform (per BR-7/Localization 18.3) and issues a single-use code the student enters in-app to unlock access immediately, without waiting for manual account activation by an Admin. This does not replace the goal of automated self-service payment (Version 2, Section 15); it is the MVP-stage bridge.
- FR-66: The platform offers optional, non-gated **focus/study-timer presets** (e.g., Pomodoro 25/5, 52/17, 90-minute deep-focus, and a fully custom interval) that a student can run during any study or QCM session, purely as a client-side productivity aid — no account state, credits, or backend session data required.

## 9. Non-Functional Requirements

- NFR-1 **Performance:** Core interactions (opening a lesson, starting a QCM session, submitting an answer) must feel instant on mid-range Android devices and 3G/4G connections typical in Algeria.
- NFR-2 **Scalability:** The product must support growth from three launch faculties to a nationwide, multi-faculty user base without requiring a redesign of core product concepts (only content and configuration growth).
- NFR-3 **Availability:** Target 99.5%+ monthly uptime post-beta, with graceful degradation (read-only/cached content) during partial outages rather than full failure.
- NFR-4 **Security & Privacy:** Personal data handling must comply with Algerian Law 18-07 on personal data protection; sensitive data (passwords, payment details) must never be exposed in plaintext to any role; access to student data is limited by role-based rules (Section 14).
- NFR-5 **Data Residency & Compliance:** The platform must be able to demonstrate where student data is stored and processed, and support data export/deletion requests within a defined timeframe.
- NFR-6 **Localization:** Full French and Arabic UI support including proper right-to-left (RTL) layout for Arabic; content and AI interactions must support Algerian Darja conversationally where relevant (Section 19).
- NFR-7 **Accessibility:** UI must meet baseline accessibility standards (readable contrast, scalable text, screen-reader-friendly structure) so the platform is usable by students with visual or motor impairments.
- NFR-8 **Device & Bandwidth Tolerance:** The experience must remain usable on low-end smartphones and limited data plans; heavy media (video, audio) must be optional/deferred, not blocking.
- NFR-9 **Reliability of AI Features:** AI-generated academic content must be clearly distinguished from validated human-authored content, must minimize factual error ("hallucination") risk through grounding in the platform's own validated content, and must offer an easy reporting path for inaccuracies.
- NFR-10 **Auditability:** All content changes, moderation actions, and subscription/payment events must be traceable for dispute resolution and quality control.
- NFR-11 **Content Versioning & Rollback:** It must be possible to identify what changed in any piece of academic content and revert if an error is discovered post-publication.
- NFR-12 **Business Continuity:** Payment processing and account access must not be single-points-of-failure tied to one payment provider or one hosting region, given known regional infrastructure variability.
- NFR-13 **Cost Sustainability:** AI feature usage must be governed by configurable limits so that operating cost per user remains predictable and sustainable at Algerian price points.

## 10. Complete Feature Catalog

### 10.1 Authentication & Account
- Email/phone registration and login
- Password recovery
- Email/phone verification
- Profile management (name, faculty, year, university, city, photo)
- Notification preferences
- Light/dark theme
- Language selection (FR/AR, with Darja tone in AI chat)
- Subscription & billing management
- Data export / account deletion request
- **[MedSparkDZ-confirmed]** Activation-code redemption for manually-confirmed payments (per faculty-year)

### 10.2 Dashboard
- Streak, total score, accuracy at a glance
- AI credit balance and top-up option
- Weekly/monthly activity visualization
- Recently studied content
- Quick access to QCM bank, Studio, Modules, Suivi, Révision
- Friends/social widget
- Faculty-specific resource hub ("Hamame Drive" — curated official references, past exams, key sources)
- Recommended next action (AI-informed, Version 2+)

### 10.3 Courses & Content
- Faculty → Year → Module → Unit → Lesson navigation
- Official curriculum-aligned courses
- "Hamame Plus" enriched/reorganized supplementary content
- Text, image, diagram content; embedded video (later)
- Downloadable lesson attachments
- AI-narrated audio lessons (multilingual)
- Content versioning and change history

### 10.4 Question Bank & Exams
- QCM, QCS, QROC, and clinical case question types
- Custom session builder (module/unit/type/source/date filters)
- Practice mode and Exam mode
- Official-format mock exams / résidanat simulations
- Strike-out, flag-for-review, and error-reporting tools within sessions
- Detailed explanations (validated + AI-enhanced)
- Personal notes library tied to questions/lessons, exportable
- Shared/group sessions (Version 2/3)
- Question/answer randomization per attempt
- **[MBset-inspired]** Live "Challenge" mode — timed, head-to-head or small-group competitive session against peers
- **[MedSparkDZ-confirmed]** Optional focus/study-timer presets (Pomodoro-style and custom) usable during any session

### 10.5 AI Tools
(See full catalog in Section 13.)

### 10.6 Progress, Tracking & Revision
- Per-subject tracking dashboards
- Global and per-lesson progress percentage
- Spaced-repetition engine with configurable schedule
- Review reminders
- Predictive exam-readiness indicator (Version 2/3)

### 10.7 Gamification & Social
- Daily streaks
- Monthly leaderboard (scoped by faculty/year)
- Progression badges
- Friends and comparative progress
- Shared study sessions/group timer (Version 2/3)
- Community Q&A / forum (Version 3)

### 10.8 Monetization
- Free and Premium plans
- Local payment integration
- Promotional/referral codes
- Institutional licensing (Version 2/3)
- Content marketplace for instructors (Version 3)

### 10.9 Notifications
- In-app, email, and push notifications
- Category-level notification controls
- Notification history center

### 10.10 Content Authoring (Instructor)
- Course/lesson/QCM authoring workspace
- Submission-for-review workflow
- Contributor performance analytics
- Revenue share tracking (Version 2/3)
- **[MBset-inspired]** AI-assisted PDF-to-structured-draft extraction (feeds into the same mandatory review workflow, does not bypass it)

### 10.11 Moderation & Trust
- Content and comment reporting
- Moderation queue with SLA-based prioritization
- Account restriction tools for abuse

### 10.12 Search
- Keyword search across courses/questions/notes
- Semantic search (Version 2+)

### 10.13 Offline & Accessibility
- Offline download of lessons/question sets (Premium, Version 2+)
- Low-bandwidth graceful degradation
- Accessibility-friendly UI (contrast, scalable text, screen-reader support)

### 10.14 Administration
- User, role, and content management
- Plan/pricing configuration
- AI credit and feature-flag configuration per plan
- Platform-wide analytics (usage, financial, content coverage)
- Faculty rollout status management

## 11. Free vs Premium Features

| Feature Area | Free | Premium |
|---|---|---|
| Question bank access (all years/faculty content) | Full access | Full access |
| Practice mode with immediate corrections | Yes | Yes |
| Exam mode / timed sessions | Yes | Yes |
| Basic performance statistics | Yes | Yes |
| Official reorganized courses ("full curriculum") | Limited preview only | Full access |
| "Hamame Plus" enriched content | No | Yes |
| AI tutor chat | Limited daily credits | Expanded/priority credits |
| AI hints, note generator, answer locator | Limited daily credits | Expanded/priority credits |
| AI-narrated audio lessons | No | Yes, multilingual |
| Spaced-repetition system | Basic (fixed schedule) | Full customization |
| Offline downloads | No | Yes |
| Ad-free / distraction-free experience | Yes (no ads planned at launch) | Yes |
| Detailed analytics & predictive exam-readiness | Basic | Advanced |
| Leaderboard & badges | Yes | Yes |
| Priority support | No | Yes |
| Official-format mock exam simulations | Limited number per month | Unlimited |

Design principle carried from the market but made explicit as policy: **the question bank itself stays broadly free** to drive adoption and trust; **premium monetizes time-saving and AI-personalization**, not access to core practice content. Exact numeric limits (credit counts, monthly mock-exam caps) are configuration values owned by Admins, not fixed product constants — see Business Rules BR-6.

## 12. AI Feature Catalog

| AI Feature | What it does | Notes |
|---|---|---|
| **AI Study Assistant (chat)** | Conversational assistant that answers academic questions, explains concepts "like explaining to a first-year student," and simulates clinical reasoning dialogues, grounded primarily in Hamame's own validated content. | Must disclose when answering beyond grounded content; subject to error-reporting. |
| **Contextual Hints** | During a QCM session, provides a hint that nudges toward the right reasoning without revealing the answer. | Personalized using the student's past performance where possible. |
| **AI Note Maker** | Generates concise structured notes/key points from a lesson's content. | Student-triggered, exportable. |
| **Answer Locator** | Given a question, finds and highlights the exact section of a lesson that contains the relevant answer. | Core "retrieval" use case grounded in Hamame's content, not general web knowledge. |
| **AI-Enhanced Explanations** | Expands validated question explanations with deeper reasoning, differential considerations, and common-mistake analysis, **[MBset-inspired] including a per-option justification (why each individual answer choice — not just the correct one — is right or wrong)**, not just an overall explanation. | Always layered on top of a human-validated baseline explanation, never replacing it. |
| **Multilingual Narration (AI Podcasts/Audio)** | Converts lesson text into narrated audio in French, Arabic, and (as feasible) Darja-toned delivery, with playback speed control. | Useful for auditory learners and commute-time studying. |
| **Adaptive QCM Generation** | Generates new practice questions from validated course content, calibrated to a student's demonstrated level. | Generated items are flagged distinctly from human-authored/validated bank questions until reviewed. |
| **Predictive Exam-Readiness Score** | Estimates likely exam/résidanat performance based on progress, accuracy trends, and mock-exam results, with a personalized improvement plan. | Framed as guidance, not a guarantee — see disclaimers in Business Rules. |
| **Automated Feedback for Open-Ended Answers (QROC / Clinical Cases)** | Evaluates free-text or multi-part clinical-case answers and gives instant structured feedback. | High-value, high-scrutiny feature; requires strong grounding and human spot-review. |
| **Smart Summarization & Flashcard Generation** | Condenses long lessons/chapters into key-point summaries or auto-generated flashcards. | Feeds directly into the spaced-repetition system. |
| **Personalized Study Planner** | Builds a day-by-day revision plan based on exam date, current progress, and weak areas. | Integrates streak/gamification nudges. |
| **Translation Assistant** | Translates course content and explanations between French, Arabic, and (longer-term) other languages, with attention to correct medical/technical terminology. | Not a generic translator — tuned for domain vocabulary. |
| **At-Risk Engagement Detection** (internal/admin-facing) | Flags students whose engagement or performance is dropping so the platform (or partner institution) can nudge them. | Privacy-sensitive; governed by data rules in Section 14 and NFR-4. |
| **Content Quality Assistant** (instructor/reviewer-facing) | Helps reviewers spot inconsistencies, outdated references, or unclear phrasing in submitted content before publication. | Speeds up the mandatory validation workflow, does not replace it. |
| **[MBset-inspired] PDF-to-Structured-Content Extractor** (instructor-facing) | Converts a raw exam/course PDF upload into a structured, tagged draft (questions with options, or lesson sections), pre-populated for instructor review rather than built from scratch. | Output always enters as **'draft'** status under the existing mandatory validation workflow (BR-2) — this accelerates authoring, it does not bypass review. |

All AI features share three non-negotiable behaviors, enforced as policy regardless of implementation:
1. AI output is visually distinguished from human-validated content.
2. AI output can always be flagged/reported by the student with one action.
3. AI usage is metered against the plan-based credit system (Section 14).

## 13. Business Rules

**BR-1 — Freemium baseline.** The question bank (all faculties/years within the student's granted scope) remains accessible on the Free plan. Premium is not a paywall on core practice; it monetizes AI depth, official structured courses, and time-saving tools.

**BR-2 — Mandatory academic validation.** No lesson, question, or explanation is visible to students until it has been approved by at least one qualified Academic Reviewer. AI-generated content follows the same rule before it can be promoted from "AI draft" to "validated" status.

**BR-3 — Faculty & year scoping.** By default, a student sees content scoped to their declared faculty and year, but may explicitly browse other years/faculties (e.g., to review prior-year fundamentals or preview upcoming material).

**BR-4 — Exam integrity.** Exam-mode and official mock-exam sessions must: randomize question and option order per attempt; enforce the configured time limit strictly; disallow answer changes after time expiry; and exclude flagged/cheating-suspected accounts from leaderboard rankings.

**BR-5 — Content reporting SLA.** Reports on factual errors are triaged within 48 hours; confirmed errors on live content are corrected or hidden within 5 business days. Reports on abusive/inappropriate community content are triaged within 24 hours.

**BR-6 — AI credit governance.** Every plan tier has a configurable daily/monthly AI usage allowance (chat messages, note generations, hint requests, audio generations). Limits are set and adjustable by Admins to keep AI operating cost sustainable; students always see their remaining balance before it is exhausted.

**BR-7 — Subscription billing.** Subscriptions renew automatically unless cancelled before the renewal date; cancellation takes effect at the end of the current paid period (no mid-cycle service cutoff). Refunds are granted per the published refund policy (e.g., technical failure preventing access) and logged for audit.

**BR-8 — Pricing currency & locality.** All consumer pricing is set and displayed in Algerian Dinar (DZD) and calibrated to local purchasing power; institutional pricing may be negotiated separately.

**BR-9 — Instructor content rights & revenue share.** Instructors retain attribution for their authored content. Where content is monetized (Version 2/3 marketplace), a transparent, pre-agreed revenue share applies, and Hamame does not alter authored academic content substantively without instructor consultation (minor edits for accuracy/clarity by Reviewers are exempted and logged).

**BR-10 — No medical-advice liability.** Hamame is an educational exam-preparation and study platform, not a clinical decision-support or patient-care tool. All clinical-case content and AI outputs are for academic training purposes only, and this is disclosed to users.

**BR-11 — Minors & data protection.** Some first-year students may be minors (under 18 in some entry pathways); the platform applies the same strict personal-data protections to all users regardless of age, in line with Algerian Law 18-07, and avoids collecting data beyond what is functionally necessary.

**BR-12 — Leaderboard fairness scoping.** Leaderboards are scoped by faculty and year (not platform-wide) so rankings remain meaningful and motivating rather than discouraging for students comparing across very different curricula.

**BR-13 — Account & device rules.** One paid subscription is intended for one individual student account; sharing credentials to bypass payment is against terms of service and may result in account suspension after warning.

**BR-14 — Academic year rollover.** At the start of each academic year, active students are prompted to confirm/update their year of study; content scoping and spaced-repetition schedules adjust accordingly rather than resetting progress history.

**BR-15 — New faculty rollout gating.** A new faculty is only opened to general students once it has reached a defined minimum content-coverage threshold (set by Admins) for at least the first two years of that faculty's curriculum, to avoid a poor first impression with an empty catalog.

**BR-16 — Referral & promotional integrity.** Referral rewards (credits, discounts) are capped per account per period to prevent abuse, and are void if the referring or referred account is found fraudulent.

**BR-17 — Institutional data boundaries.** Institutional partners (Version 2/3) may only access aggregated, anonymized performance data about their affiliated students, never individual-level academic records, without explicit student consent.

**BR-18 — Activation code integrity. [MedSparkDZ-confirmed, new]** Activation codes (FR-65) are single-use, scoped to exactly one faculty-year per code, expire if unused after a configurable window, and are only ever issued by a Support Agent or Admin after payment confirmation — students cannot self-generate or transfer codes. Redemption is logged for audit (NFR-10) alongside the payment record it corresponds to.

## 14. MVP (Version 1)

**Scope:** Medicine, Dentistry, and Pharmacy — all years including résidanat-prep track — launched together so the platform feels complete within its chosen niche from day one, rather than partially covering one faculty.

**Included:**
- Account creation, login, password recovery, profile setup (faculty/year/university).
- Full content hierarchy (Faculty → Year → Module → Unit → Lesson) with text-based lesson content for the official curriculum.
- Question bank covering QCM, QCS, QROC, and clinical cases, with custom session builder (module/unit/type/source/date filters).
- Practice mode and Exam mode, including official-format mock exam simulations.
- Personal notes tied to questions/lessons.
- Core progress dashboard: streak, score, accuracy, activity history, per-subject basic tracking.
- Free and Premium plan structure with a locally viable initial payment flow (may start semi-manual/assisted if needed, per Localization section, but must be self-service by end of MVP hardening). **[MedSparkDZ-confirmed]** The MVP's manual/assisted path is implemented concretely as activation-code redemption (FR-65/BR-18) rather than left undefined.
- **[MedSparkDZ-confirmed]** Optional focus/study-timer presets (FR-66) — cheap, client-side, no backend dependency, worth including at MVP for perceived polish.
- Basic notification set (in-app + email) for account and subscription events.
- French primary UI with Arabic secondary UI (RTL supported).
- Light/dark theme, responsive design (mobile-first, works well on low/mid-end Android).
- Content authoring and mandatory academic validation workflow (internal, not yet a public marketplace).
- Basic moderation/error-reporting on questions and lessons.
- Basic keyword search across courses and questions.

**Explicitly excluded from MVP** (deferred to later versions): AI tools of any kind, spaced repetition engine, gamification (streaks may exist as basic tracking but leaderboard/badges are deferred), social features, offline downloads, native mobile apps, instructor monetization/marketplace, institutional accounts.

**MVP success gate:** the three launch faculties must each have validated content covering at least the first two years of their curriculum, and the exam/QCM engine must be stable under real concurrent exam-mode usage (peak exam-season load), before Version 2 work begins.

## 15. Version 2

**Theme: AI, Retention, and Automated Monetization**

- AI Study Assistant (chat), Contextual Hints, AI Note Maker, Answer Locator, AI-Enhanced Explanations (including **[MBset-inspired]** per-option justification) — with credit governance (BR-6).
- Spaced-repetition engine with configurable schedules and reminder notifications, targeting **[MBset-inspired] FSRS-class scheduling** (see FR-26).
- Gamification: streaks (full), monthly leaderboard (scoped), progression badges, friends/comparative progress.
- **[MBset-inspired]** Live "Challenge" competitive quiz mode (see FR-21a).
- Automated, self-service local payment integration (replacing any manual/assisted flow from MVP).
- Push notifications and a full notification preferences center.
- Offline download of lessons/question sets for Premium users.
- Flashcards and AI-assisted flashcard generation.
- Referral program.
- "Hamame Plus" enriched/reorganized premium course content for launch faculties.
- Multilingual AI-narrated audio lessons.
- Semantic search (complementing keyword search) to support the Answer Locator use case.
- First institutional pilot (one university department or prep center) to validate B2B viability.
- Predictive exam-readiness indicator (first version, transparently framed as guidance).

## 16. Version 3

**Theme: Scale, Community, and Multi-Faculty Expansion**

- Expansion to at least two additional faculties (e.g., a large-enrollment faculty such as a Sciences/Economics track, chosen based on Version 1/2 demand signals), validating the multi-faculty extensibility goal (FR-60/FR-61).
- **[MBset-inspired]** Per-university content scoping (FR-10a) where inter-university curriculum/annales differences justify it, evaluated against real demand rather than built speculatively.
- Instructor content marketplace with transparent revenue share (BR-9) and contributor analytics. **[MBset-inspired]** Consider a formalized non-monetary "perks" tier (e.g., early feature access, recognition status) for active student contributors/moderators, alongside the revenue-share track, as a lighter-weight partnership on-ramp.
- Community forums / structured Q&A between students (and optionally verified instructors).
- Shared/group study sessions (shared timer, live chat, collaborative review).
- Automated feedback for open-ended answers (QROC/clinical cases) at production quality.
- Adaptive AI-generated QCM at scale, feeding a continuously growing (and continuously validated) question bank.
- Full institutional B2B offering: bulk licensing, institution-admin dashboards with aggregated analytics, negotiated pricing.
- Native mobile apps (if PWA/offline behavior from Version 2 proves insufficient for target devices/markets).
- Expanded accessibility features (screen-reader optimization, dyslexia-friendly reading mode).
- Deeper localization exploration (e.g., broader Darja support in AI tone, potential Tamazight consideration) based on user demand.
- Alumni/certification-style recognitions for top long-term performers (non-accredited, motivational only — avoiding any implication of official credentialing).

## 17. Monetization

### 17.1 Core model
Freemium subscription, consumer-first, with institutional licensing layered on top from Version 2 onward.

### 17.2 Plans
- **Free:** Full question bank access, practice/exam modes, basic stats, limited AI credits (from Version 2), limited monthly mock exams.
- **Premium (Student):** Adds official reorganized/"Plus" courses, expanded AI credits, offline downloads, advanced analytics, unlimited mock exams, priority support.
- **Institutional (Version 2/3):** Bulk seats or flat-fee licensing for universities/prep centers, with aggregated (never individual) analytics for the institution admin.

### 17.3 Additional revenue levers
- **Referral program:** credits or discounted periods for successful referrals, capped per BR-16.
- **Content marketplace (Version 3):** revenue share with instructors for premium authored content/question packs.
- **Exam-period bundles:** time-boxed offers around concours/exam seasons (e.g., a "résidanat sprint" bundle) — a merchandising tactic, not a separate product tier.
- **Gift subscriptions:** allow a student (or parent) to gift Premium access to another student.

### 17.4 Pricing philosophy
Pricing is set in DZD at a level calibrated to Algerian student purchasing power — deliberately positioned as an easy, low-friction impulse purchase rather than a major financial decision, while institutional pricing is negotiated to reflect bulk value. Exact price points are a commercial decision outside this PRD's scope, but must respect BR-8.

**[MedSparkDZ-confirmed, market data point]** MedSpark's observed premium tier ("Contenus Cours": reorganized courses + Spark Choice + AI tools + trilingual podcasts) is priced at 500 DA/year with a fully manual, contact-the-team payment flow — no online payment gateway was found live in the audited account. This is informational market context only, not a target price for Hamame; it confirms that a manual/activation-code payment bridge (FR-65) is a viable, currently-used pattern in this exact market segment, not a stopgap unique to Hamame.

## 18. Localization

### 18.1 Language
- **French:** primary UI and primary content language at launch, reflecting current Algerian higher-education instructional language for health sciences.
- **Arabic:** secondary UI language with full right-to-left layout support; used for terminology support and accessibility for students more comfortable in Arabic.
- **Algerian Darja:** not a formal UI language, but the conversational tone/register the AI Study Assistant can adopt on request, since this is how students actually talk about their studies informally.
- **Tamazight:** noted as a long-term, low-priority consideration for national inclusivity; not committed for MVP–Version 3.

### 18.2 Curriculum alignment
- Content structure and coverage must map to the Algerian Ministry of Higher Education and Scientific Research (MESRS) program for each faculty, and to the national résidanat concours format, rather than to a generic or foreign curriculum.
- The platform must tolerate known inter-university variation (some universities sequence modules differently) by keeping the content model flexible per BR-15/FR-10.

### 18.3 Payments
- Support for locally relevant payment rails: national card network (CIB/Edahabia via Algérie Poste), mobile-money style options (e.g., BaridiMob), and locally-integrated payment aggregators.
- A fallback assisted/manual payment path may exist at MVP stage if automated local payment integration is not yet mature, but must be treated as temporary per Section 14.

### 18.4 Connectivity & devices
- Design must assume variable connectivity quality across wilayas and a majority of usage on mid/low-end Android devices, informing the offline and low-bandwidth requirements (NFR-8, FR-58/59).

### 18.5 Compliance
- Personal data handling aligned with Algerian Law 18-07 on the protection of individuals in the processing of personal data.
- Clear, locally-understandable terms of service and privacy policy in French and Arabic.

## 19. Risks

| Risk | Description | Mitigation direction |
|---|---|---|
| **Content accuracy & liability** | Incorrect medical/academic content could harm student trust or, in the worst case, contribute to a clinical misunderstanding. | Mandatory academic validation (BR-2), fast error-reporting SLA (BR-5), clear educational-use disclaimer (BR-10). |
| **AI hallucination risk** | AI tools could generate plausible-sounding but incorrect medical explanations. | Ground AI in validated content, visually distinguish AI output, enable one-click reporting, human spot-review of AI-generated bank additions. |
| **Regulatory/data protection risk** | Mishandling personal data under Law 18-07 could create legal exposure. | Data-minimization by design, clear consent flows, defined data export/deletion process (NFR-4/5). |
| **Monetization risk** | Algerian students' willingness/ability to pay may be lower than assumed; free alternatives (Telegram/Facebook groups sharing leaked content) compete directly. | Keep core question bank free to build trust and volume; monetize AI/time-saving/official content rather than gatekeeping practice; keep price points low and locally calibrated. |
| **Content leakage/piracy** | Premium content (course PDFs, question sets) could be screenshotted/redistributed informally, undermining premium's value. | Emphasize AI/interactive value (which is harder to "screenshot away") over static content as the core premium driver; monitor for large-scale leaks. |
| **Competitive risk** | Established platforms (including MedSpark) and informal free communities already serve this audience. | Differentiate on true Algerian curriculum alignment, language flexibility (Darja-aware AI), and fair local pricing rather than competing on feature-parity alone. |
| **Execution/talent risk** | Sourcing enough qualified medical/dental/pharmacy reviewers to keep pace with content demand is hard. | Build a reviewer network incrementally tied to content-coverage gating (BR-15) rather than promising full coverage on day one. |
| **Seasonality risk** | Usage will spike heavily around exam periods and drop off-season, straining infrastructure and cash flow predictability. | Plan capacity and marketing calendar around known academic/exam calendars; use exam-period bundles (Section 17.3) to smooth revenue. |
| **Multi-faculty dilution risk** | Expanding too early to other faculties could dilute focus and content quality in the founding faculties. | Gate expansion behind explicit content-coverage and stability thresholds (BR-15) rather than a fixed calendar date. |
| **Payment infrastructure risk** | Local payment gateway integrations can be immature, restrictive, or subject to change. | Avoid single-provider dependency; keep an assisted fallback path available (Localization 18.3) during transition periods. |
| **Instructor dependency risk** | Early content quality/velocity may depend heavily on a small number of contributors. | Formalize contributor onboarding and fair compensation early (BR-9) to build a sustainable, growing contributor base. |

## 20. Success Metrics

### 20.1 Activation & Engagement
- Sign-up → first completed QCM session conversion rate.
- Daily Active Users / Monthly Active Users (DAU/MAU) ratio.
- Average study sessions per active user per week.
- Average weekly time-on-platform per active user.
- Streak retention rate (share of users maintaining a streak beyond 7/30 days).

### 20.2 Retention
- D1 / D7 / D30 / D90 retention cohorts.
- Monthly churn rate (Premium subscribers).
- Reactivation rate around exam-season spikes.

### 20.3 Monetization
- Free-to-Premium conversion rate.
- Average Revenue Per User / Per Paying User (ARPU/ARPPU).
- Monthly Recurring Revenue (MRR) growth rate.
- Customer Lifetime Value to Customer Acquisition Cost ratio (LTV:CAC).
- Referral-driven signup share.

### 20.4 Academic Impact
- Curriculum content-coverage percentage per faculty/year (progress toward BR-15 gating thresholds).
- Self-reported exam/résidanat performance improvement (periodic survey).
- Mock-exam score improvement trend per student over a study period.
- Question-bank usage depth (average unique questions attempted per active month).

### 20.5 AI Adoption & Quality
- Share of Premium users engaging AI tools at least weekly.
- AI response satisfaction rating (in-product feedback).
- AI error/hallucination report rate, tracked against a defined acceptable threshold.
- AI credit utilization rate vs. allotted limits (signal for pricing/limit tuning).

### 20.6 Content Quality & Trust
- Percentage of live content that is fully validated vs. pending review.
- Average time-to-resolution for reported content errors (against BR-5 SLA).
- Repeat-error rate on previously corrected content (should trend toward zero).

### 20.7 Growth & Expansion
- Net Promoter Score (NPS) among active students.
- Time-to-launch for each newly added faculty (Version 3+) vs. plan.
- Number and value of institutional partnerships signed.

### 20.8 Operational Health
- Platform uptime against the 99.5% target.
- Support ticket first-response and resolution time.
- Peak-load stability during known exam-season windows.

---

*End of Hamame PRD v1.0. This document defines product scope and rules only; technical architecture, data models, and API design are deliberately out of scope and will be addressed in a subsequent technical design document.*
