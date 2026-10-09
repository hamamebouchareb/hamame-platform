// Server-side exam deadline: answers arriving after the clock ran out are
// rejected and stored nowhere (the client timer is untrusted). Only exam
// sessions WITH a time limit are gated — practice sessions and untimed exams
// pass through untouched. A 30 s grace covers network/client-clock skew;
// submit itself is never gated (it scores whatever was stored in time).

export const EXAM_ANSWER_GRACE_MS = 30_000;

export function isExamAnswerExpired(
  mode: string,
  timeLimitSeconds: number | null | undefined,
  startedAt: Date,
  now: Date = new Date()
): boolean {
  if (mode !== "exam") return false;
  if (timeLimitSeconds === null || timeLimitSeconds === undefined) return false;
  return now.getTime() > startedAt.getTime() + timeLimitSeconds * 1000 + EXAM_ANSWER_GRACE_MS;
}
