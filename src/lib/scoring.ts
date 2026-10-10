// Session scoring rule, moved verbatim from finalizeSession
// (src/routes/sessions.routes.ts) so it is unit-testable without a database.
// Rule: score = % correct among ALL gradable (QCM/QCS) questions — QROC and
// clinical cases are excluded from both numerator and denominator (not
// auto-gradable). The denominator is every gradable question, answered or
// not: an unanswered gradable question counts as incorrect. Null (not 0)
// when nothing is gradable at all.

const AUTO_GRADABLE_TYPES = ["QCM", "QCS"] as const;

export function isAutoGradableType(type: string): boolean {
  return (AUTO_GRADABLE_TYPES as readonly string[]).includes(type);
}

export interface ScorableQuestion {
  question: { id: string; type: string };
  attempts: { isCorrect: boolean | null }[];
}

export function computeSessionScore(questions: ScorableQuestion[]): number | null {
  const gradableQuestions = questions.filter((sq) => isAutoGradableType(sq.question.type));
  const correctCount = gradableQuestions.filter((sq) => sq.attempts[0]?.isCorrect === true).length;
  const score = gradableQuestions.length > 0 ? (correctCount / gradableQuestions.length) * 100 : null;
  return score;
}
