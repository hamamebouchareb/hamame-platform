import QuizClient from "./QuizClient";

export default async function QcmQuizPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  return <QuizClient initialMode={mode === "exam" ? "exam" : "practice"} />;
}
