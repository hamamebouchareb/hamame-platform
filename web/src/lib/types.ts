// Shapes mirror the backend response bodies (src/routes/*.ts) closely enough for the
// frontend's needs — not full 1:1 Prisma types, since several fields are intentionally
// omitted server-side (e.g. isCorrect, expectedAnswerText) depending on the endpoint.

export type QuestionType = "QCM" | "QCS" | "QROC" | "CLINICAL_CASE";

export interface Faculty {
  id: string;
  name: string;
  slug: string;
  rolloutStatus: string;
  minCoverageYearsRequired: number;
  createdAt: string;
}

export interface Year {
  id: string;
  facultyId: string;
  label: string;
  orderIndex: number;
  createdAt: string;
}

export interface CurriculumModule {
  id: string;
  yearId: string;
  name: string;
  orderIndex: number;
}

export interface Unit {
  id: string;
  moduleId: string;
  name: string;
  orderIndex: number;
}

/** Raw `source` values stored on questions (see prisma Question.source). */
export type QuestionSource = "official_exam" | "hamame_authored" | "ai_generated";

/** GET /api/questions/counts — live builder counts sharing the list filters. */
export interface QuestionCountsResponse {
  /** Count for the exact requested filter set (the live counter). */
  total: number;
  /** Per-unit counts for the module scope (unit selection excluded). Empty without moduleId. */
  byUnit: Array<{ unitId: string; count: number }>;
  /** Per-module counts for the year scope (module/unit selection excluded). Empty without yearId. */
  byModule: Array<{ moduleId: string; count: number }>;
  /** Distinct sittings actually present in scope (untagged rows excluded). */
  sittings: Array<{ examYear: number | null; sittingLabel: string | null; count: number }>;
}

export interface LessonSummary {
  id: string;
  title: string;
  contentTier: string;
}

export interface LessonDetail {
  id: string;
  unitId: string;
  title: string;
  contentTier: string;
  createdAt: string;
  currentVersion: {
    id: string;
    versionNumber: number;
    status: string;
    bodyRichtext: unknown;
    reviewedAt: string | null;
    createdAt: string;
  };
}

export interface QuestionOptionRef {
  id: string;
  bodyText: string;
}

export interface ClinicalCasePartRef {
  id: string;
  partOrder: number;
  promptText: string;
}

// GET /api/sessions/:id and POST /api/sessions — a single question as it appears
// inside a session (no isCorrect on options; that only ever appears in
// practice-mode answer feedback or the post-submission results endpoint).
export interface SessionQuestionEntry {
  sessionQuestionId: string;
  presentedOrder: number;
  question: {
    id: string;
    unitId: string;
    type: QuestionType;
    source: string;
    difficulty: string | null;
    bodyRichtext: unknown;
    /** P5 player chips (Phase 1 sitting taxonomy; paper-number suffixes fit sittingLabel). */
    examYear: number | null;
    sittingLabel: string | null;
    unitName: string;
    moduleName: string;
  };
  options: QuestionOptionRef[];
  clinicalCaseParts: ClinicalCasePartRef[];
}

export interface SessionDetail {
  id: string;
  name: string;
  mode: "practice" | "exam";
  isOfficialMock: boolean;
  timeLimitSeconds: number | null;
  /** FR-15 result ordering chosen at creation ('random' unless explicitly set). */
  resultSort: "by_year" | "by_course" | "random";
  /** FR-16 toggle — false gates the results screen down to a plain score. */
  showStats: boolean;
  startedAt: string;
  completedAt: string | null;
  score: number | null;
  questions: SessionQuestionEntry[];
}

export interface AnswerAttemptResponse {
  id: string;
  sessionQuestionId: string;
  selectedOptionIds: string[] | null;
  freeTextAnswer: string | null;
  answeredAt: string;
  // Only present in practice mode (BR-4: exam mode gets no feedback until results).
  isCorrect?: boolean | null;
  explanation?: unknown;
  // Correct option ids, practice mode only — revealing these pre-submission in
  // exam mode would leak the answer key.
  correctOptionIds?: string[];
}

/**
 * GET /api/questions/:id/answer-stats — community pick-rates per option. * Aggregate-only: percentages are the share of past attempts selecting each
 * option (NOT correctness). `attempts` is always included so small samples are
 * visibly small; `options` is empty when there are no attempts yet.
 */
export interface AnswerStatsResponse {
  questionId: string;
  attempts: number;
  options: Array<{ optionId: string; percentage: number }>;
}

/** One unit's progress inside a history entry. */
export interface SessionHistoryUnit {
  unitId: string;
  unitName: string;
  moduleName: string;
  yearLabel: string;
  facultyName: string;
  total: number;
  answered: number;
  correct: number;
}

/** GET /api/sessions — own session history entry (totals + per-unit breakdown). */
export interface SessionHistoryEntry {
  id: string;
  name: string;
  mode: string;
  startedAt: string;
  completedAt: string | null;
  score: number | null;
  stats: { total: number; answered: number; correct: number };
  units: SessionHistoryUnit[];
}

/** GET /api/leaderboard — cohort snapshot row (fullName only, no PII). */
export interface LeaderboardEntry {
  rank: number;
  /** Score board: average score %; contributors board: sessions completed. */
  score: number;
  fullName: string;
}

export interface SessionSummary {
  id: string;
  name: string;
  mode: string;
  startedAt: string;
  completedAt: string | null;
  score: number | null;
  /** Present on submit/results responses (FR-16) — false hides detailed stats UI. */
  showStats?: boolean;
}

// GET /api/progress/me
export interface ProgressSummary {
  streak: {
    currentStreakDays: number;
    longestStreakDays: number;
  };
  dailyGoal?: {
    dailyGoalMinutes: number;
    minutesStudiedToday: number;
    goalMet: boolean;
  };
  totalCompletedSessions: number;
  averageScore: number | null;
  accuracy: number | null;
  recentActivity: RecentActivityItem[];
}

export type RecentActivityItem =
  | { type: "session"; id: string; name: string; mode: string; score: number | null; at: string }
  | { type: "lesson"; lessonId: string; title: string; at: string };

// GET /api/progress/qcm-stats — real counts for the profile "Statistiques QCM" grid.
export interface QcmStats {
  sessionsCompleted: number;
  totalQuestionsAnswered: number;
  correctCount: number;
  incorrectCount: number;
  accuracyRecent20: number | null;
  mockExamsCompleted: number;
  longestSessionDurationSeconds: number;
  averageSessionDurationSeconds: number;
  streakRecord: number;
}

// GET /api/progress/readiness — predictive exam-readiness (components are 0–100).
export interface ExamReadiness {
  insufficientData: boolean;
  score: number | null;
  label: "Needs work" | "On track" | "Exam ready" | null;
  components: {
    recentAccuracy: number | null;
    curriculumCoverage: number;
    consistency: number;
  };
  gradableAttemptCount: number;
  minAttemptsRequired: number;
}

// GET /api/ai/credits
export interface AiCredits {
  dailyAllowance: number;
  usedToday: number;
  remainingToday: number;
  resetAt: string;
  /** Server-computed <20% flag (Task 7a) — replaces the former client computation. */
  lowBalance: boolean;
}

// GET /api/progress/modules/:id
export interface ModuleProgress {
  moduleId: string;
  totalLessons: number;
  completedLessons: number;
  percentage: number;
}

// GET /api/notes and POST /api/notes
export interface Note {
  id: string;
  bodyText: string;
  /** Fixed-taxonomy tag slugs (see NOTE_TAG_META on the notes page). */
  tags: string[];
  isFavorite: boolean;
  createdAt: string;
  question: { id: string; label: string } | null;
  lesson: { id: string; title: string } | null;
}

// GET /api/plans, and the `plan` field nested in Subscription responses.
export interface Plan {
  id: string;
  name: string;
  priceDzd: number | null;
  billingPeriod: "monthly" | "yearly" | null;
  features: { description: string };
  isActive: boolean;
}

// GET /api/subscriptions/me and POST /api/subscriptions.
export interface Subscription {
  id: string;
  userId: string;
  planId: string;
  status: string;
  startedAt: string;
  currentPeriodEnd: string;
  cancelledAt: string | null;
  autoRenew: boolean;
  plan: Plan;
}

// GET /api/authoring/me/stats
export interface ContentStatusCounts {
  draft: number;
  pending_review: number;
  approved: number;
  rejected: number;
}

export interface ContributorStats {
  lessons: ContentStatusCounts;
  questions: ContentStatusCounts;
}

// POST /api/authoring/lessons response, and the `version` shape returned by
// POST /api/authoring/lesson/:versionId/submit.
export interface LessonDraft {
  id: string;
  unitId: string;
  title: string;
  contentTier: string;
  currentVersionId: string | null;
  createdAt: string;
}

export interface LessonVersionDraft {
  id: string;
  lessonId: string;
  bodyRichtext: unknown;
  versionNumber: number;
  status: string;
  authoredBy: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
  createdAt: string;
}

// POST /api/authoring/questions response, and the `question` shape returned by
// POST /api/authoring/question/:id/submit.
export interface QuestionOptionDraft {
  id: string;
  questionId: string;
  bodyText: string;
  isCorrect: boolean;
  orderIndex: number;
}

export interface QuestionDraft {
  id: string;
  unitId: string;
  type: QuestionType;
  source: string;
  status: string;
  difficulty: string | null;
  bodyRichtext: unknown;
  explanationRichtext: unknown;
  authoredBy: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
  createdAt: string;
  options: QuestionOptionDraft[];
  clinicalCaseParts: unknown[];
}

// GET /api/review/queue
export type ReviewQueueItem =
  | {
      contentType: "lesson";
      id: string;
      lessonId: string;
      lessonTitle: string;
      snippet: string;
      authorFullName: string;
      createdAt: string;
    }
  | {
      contentType: "question";
      id: string;
      type: QuestionType;
      snippet: string;
      authorFullName: string | null;
      createdAt: string;
    };

export interface ReviewQueueResponse {
  items: ReviewQueueItem[];
  pagination: { page: number; limit: number; total: number };
}

export interface SessionResultItem {
  sessionQuestionId: string;
  presentedOrder: number;
  question: {
    id: string;
    type: QuestionType;
    source: string;
    difficulty: string | null;
    bodyRichtext: unknown;
  };
  studentAnswer: { selectedOptionIds: string[] | null; freeTextAnswer: string | null } | null;
  isCorrect: boolean | null;
  options: { id: string; bodyText: string; isCorrect: boolean }[];
  clinicalCaseParts: {
    id: string;
    partOrder: number;
    promptText: string;
    expectedAnswerText: string | null;
  }[];
  explanation: unknown;
}

// GET /api/reviews/due — spaced-repetition items due now or earlier (reviews.routes.ts).
// `lesson`, `question`, and `flashcard` are mutually exclusive target descriptors.
// The backend returns the full Prisma row plus includes; the frontend mirrors the
// shapes actually consumed by the revision UI.
export interface DueReviewItem {
  id: string;
  userId: string;
  lessonId: string | null;
  questionId: string | null;
  flashcardId: string | null;
  dueAt: string;
  lastReviewedAt: string | null;
  easeFactor: number;
  lesson: { title: string } | null;
  question: { type: QuestionType; source: string } | null;
  flashcard: { id: string; front: string } | null;
}

// POST /api/reviews/:id/complete — response after submitting SM-2 quality rating.
export interface ReviewCompleteResponse {
  item: {
    id: string;
    dueAt: string;
    lastReviewedAt: string | null;
    easeFactor: number;
  };
}

// GET/PUT /api/reviews/settings — review schedule configuration.
export interface ReviewSettings {
  isEnabled: boolean;
  notificationsEnabled: boolean;
  scheduleDays: number[];
}

// GET /api/friends — accepted friendships, one row per friend.
export interface FriendSummary {
  id: string;
  fullName: string;
}

// GET/PUT /api/push/preferences — the 3 V1 push notification types plus the master
// switch (src/routes/push.routes.ts). No row on the backend = every field defaults true.
export interface PushPreferences {
  masterEnabled: boolean;
  dailyGoalReminder: boolean;
  streakAtRisk: boolean;
  badgeEarned: boolean;
}
