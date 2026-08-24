"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useApiResource } from "@/lib/useApiResource";
import { apiFetch, ApiError } from "@/lib/api";
import { extractParagraphs } from "@/lib/richtext";
import { ConfirmDialog, LoadingSkeleton, QuestionCard } from "@/components";
import type { AnswerAttemptResponse, SessionDetail, SessionQuestionEntry } from "@/lib/types";

interface AnswerState {
  selectedOptionIds: string[];
  freeText: string;
  submitted: boolean;
  isCorrect?: boolean | null;
  explanationParagraphs?: string[];
  submitError?: string | null;
}

function emptyAnswerState(): AnswerState {
  return { selectedOptionIds: [], freeText: "", submitted: false };
}

function formatSource(source: string): string {
  switch (source) {
    case "official_exam":
      return "Examen officiel";
    case "hamame_authored":
      return "Hamame";
    case "ai_generated":
      return "IA";
    default:
      return source;
  }
}

function formatRemaining(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

// Interrupted-session marker read by the dashboard resume bar. localStorage is the
// resume source of truth — the backend has no active-session endpoint.
const ACTIVE_SESSION_KEY = "hamame_active_session";

function clearActiveSession() {
  try {
    window.localStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch {
    // localStorage may be unavailable — the stale marker simply never shows a resume.
  }
}

export default function SessionQuestionPage() {
  const { user, isHydrated } = useRequireAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const sessionId = params.id;

  const { data, error, isLoading, refetch } = useApiResource<{ session: SessionDetail }>(
    isHydrated && user ? `/sessions/${sessionId}` : null
  );
  const session = data?.session ?? null;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [markedForReview, setMarkedForReview] = useState<Record<string, boolean>>({});
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // A completed session has nothing left to answer here — drop the resume marker and
  // send the user straight to its results instead of showing (now-frozen) question UI.
  useEffect(() => {
    if (session && session.completedAt) {
      clearActiveSession();
      router.replace(`/sessions/${sessionId}/results`);
    }
  }, [session, sessionId, router]);

  // Persist the interrupted-session marker while the session is live, so the dashboard
  // resume bar can offer "Reprendre l'étude" after an ungraceful leave (browser close,
  // tab switch, crash). Explicit exits below call clearActiveSession().
  useEffect(() => {
    if (session && !session.completedAt && session.questions.length > 0) {
      try {
        window.localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({ id: sessionId, name: session.name }));
      } catch {
        // localStorage may be unavailable — the resume prompt simply won't show.
      }
    }
  }, [session, sessionId]);

  const timed = session?.timeLimitSeconds != null && session.timeLimitSeconds > 0;

  useEffect(() => {
    if (!timed || !session) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [timed, session]);

  const remainingSeconds = useMemo(() => {
    if (!session?.timeLimitSeconds) return null;
    const endsAt = new Date(session.startedAt).getTime() + session.timeLimitSeconds * 1000;
    return Math.max(0, Math.floor((endsAt - nowMs) / 1000));
  }, [session, nowMs]);

  const questions = useMemo(() => session?.questions ?? [], [session]);
  const currentEntry: SessionQuestionEntry | undefined = questions[currentIndex];
  const currentAnswer = currentEntry
    ? (answers[currentEntry.sessionQuestionId] ?? emptyAnswerState())
    : emptyAnswerState();
  const isMarked = currentEntry ? !!markedForReview[currentEntry.sessionQuestionId] : false;

  const answeredCount = useMemo(
    () => questions.filter((q) => answers[q.sessionQuestionId]?.submitted).length,
    [questions, answers]
  );

  const progressPct = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;

  function setCurrentAnswer(updater: (prev: AnswerState) => AnswerState) {
    if (!currentEntry) return;
    setAnswers((prev) => ({
      ...prev,
      [currentEntry.sessionQuestionId]: updater(prev[currentEntry.sessionQuestionId] ?? emptyAnswerState()),
    }));
  }

  function toggleQcmOption(optionId: string) {
    if (currentAnswer.submitted) return;
    setCurrentAnswer((prev) => ({
      ...prev,
      selectedOptionIds: prev.selectedOptionIds.includes(optionId)
        ? prev.selectedOptionIds.filter((id) => id !== optionId)
        : [...prev.selectedOptionIds, optionId],
    }));
  }

  function selectQcsOption(optionId: string) {
    if (currentAnswer.submitted) return;
    setCurrentAnswer((prev) => ({ ...prev, selectedOptionIds: [optionId] }));
  }

  function setFreeText(value: string) {
    if (currentAnswer.submitted) return;
    setCurrentAnswer((prev) => ({ ...prev, freeText: value }));
  }

  function toggleMarkForReview() {
    if (!currentEntry) return;
    setMarkedForReview((prev) => ({
      ...prev,
      [currentEntry.sessionQuestionId]: !prev[currentEntry.sessionQuestionId],
    }));
  }

  async function handleSubmitAnswer() {
    if (!session || !currentEntry) return;
    setIsSubmittingAnswer(true);
    setCurrentAnswer((prev) => ({ ...prev, submitError: null }));
    try {
      const isChoiceType = currentEntry.question.type === "QCM" || currentEntry.question.type === "QCS";
      const { attempt } = await apiFetch<{ attempt: AnswerAttemptResponse }>(
        `/sessions/${sessionId}/answers`,
        {
          method: "POST",
          body: JSON.stringify({
            questionId: currentEntry.question.id,
            ...(isChoiceType
              ? { selectedOptionIds: currentAnswer.selectedOptionIds }
              : { freeTextAnswer: currentAnswer.freeText }),
          }),
        }
      );

      setCurrentAnswer((prev) => ({
        ...prev,
        submitted: true,
        submitError: null,
        // Only present in practice mode (BR-4) — undefined here in exam mode, so no
        // feedback is shown, just the "Answered" marker.
        isCorrect: attempt.isCorrect,
        explanationParagraphs: attempt.explanation ? extractParagraphs(attempt.explanation) : undefined,
      }));
    } catch (err) {
      setCurrentAnswer((prev) => ({
        ...prev,
        submitError: err instanceof ApiError ? err.message : "Une erreur est survenue. Réessayez.",
      }));
    } finally {
      setIsSubmittingAnswer(false);
    }
  }

  async function handleFinishSession() {
    setFinishError(null);
    setIsFinishing(true);
    try {
      // Persist unitIds for wrong/marked questions so results can start a targeted redo
      // without a backend shape change (results payload has no unitId).
      try {
        const unitByQuestionId = Object.fromEntries(
          questions.map((q) => [q.question.id, q.question.unitId])
        );
        sessionStorage.setItem(
          `hamame_session_meta_${sessionId}`,
          JSON.stringify({ unitByQuestionId, markedSessionQuestionIds: Object.keys(markedForReview).filter((id) => markedForReview[id]) })
        );
      } catch {
        // sessionStorage may be unavailable — targeted redo still falls back to faculties.
      }
      await apiFetch(`/sessions/${sessionId}/submit`, { method: "POST" });
      clearActiveSession();
      router.push(`/sessions/${sessionId}/results`);
    } catch (err) {
      setFinishError(err instanceof ApiError ? err.message : "Une erreur est survenue. Réessayez.");
      setIsFinishing(false);
    }
  }

  function confirmExit() {
    setExitOpen(false);
    clearActiveSession();
    router.push("/dashboard");
  }

  if (!isHydrated || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-card-padding">
        <p className="text-meta text-text-secondary">Chargement...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background pb-28 text-text-primary">
      <h1 className="sr-only">Session QCM</h1>
      {/* Sticky header */}
      <header
        className="sticky top-0 z-20 border-b border-border bg-surface-1/95 backdrop-blur"
        style={{ boxShadow: "var(--shadow-glow-qcm)" }}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-card-padding py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-meta font-medium text-text-secondary">
                {questions.length > 0
                  ? `Question ${currentIndex + 1}/${questions.length}`
                  : "Session"}
              </p>
              <p className="text-meta text-text-tertiary">{answeredCount} répondues</p>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-pill bg-surface-3" aria-hidden>
              <div
                className="h-full rounded-pill bg-accent-qcm transition-[width]"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
          {timed && remainingSeconds !== null && (
            <p
              className={[
                "shrink-0 rounded-pill border px-3 py-2 font-display text-h3 font-semibold tabular-nums",
                remainingSeconds <= 60
                  ? "border-danger text-danger"
                  : "border-border text-text-primary",
              ].join(" ")}
              aria-live="polite"
            >
              {formatRemaining(remainingSeconds)}
            </p>
          )}
          <button
            type="button"
            onClick={() => setExitOpen(true)}
            className="inline-flex min-h-touch-target shrink-0 items-center justify-center rounded-control border border-border px-3 text-meta font-medium text-text-secondary transition hover:bg-surface-2 hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2"
          >
            Quitter
          </button>
        </div>
        <div className="h-0.5 w-full bg-accent-qcm" aria-hidden />
      </header>

      <div className="mx-auto max-w-3xl px-card-padding py-section-gap">
        {isLoading && !session && (
          <div className="mx-auto max-w-xl" aria-busy aria-label="Chargement de la session">
            <LoadingSkeleton className="mb-3 h-4 w-32" />
            <div className="rounded-card border border-border bg-surface-1 p-card-padding shadow-card">
              <LoadingSkeleton className="h-4 w-24" />
              <div className="mt-4 flex flex-col gap-2">
                <LoadingSkeleton className="h-6 w-full" />
                <LoadingSkeleton className="h-6 w-4/5" />
              </div>
              <div className="mt-6 flex flex-col gap-2">
                {[0, 1, 2, 3].map((i) => (
                  <LoadingSkeleton key={i} className="h-12 w-full rounded-control" />
                ))}
              </div>
            </div>
          </div>
        )}

        {error && !session && (
          <div className="mx-auto max-w-xl rounded-card border border-danger bg-surface-2 p-card-padding">
            <p className="text-body text-danger">Impossible de charger la session. {error}</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-3 inline-flex min-h-touch-target items-center justify-center rounded-control bg-accent-qcm px-4 text-body font-medium text-background transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              Réessayer
            </button>
          </div>
        )}

        {session && !session.completedAt && questions.length === 0 && (
          <div className="mx-auto max-w-xl rounded-card border border-border bg-surface-1 p-card-padding">
            <p className="text-body text-text-secondary">Cette session ne contient aucune question.</p>
            <button
              type="button"
              onClick={() => {
                clearActiveSession();
                router.push("/dashboard");
              }}
              className="mt-3 inline-flex min-h-touch-target items-center justify-center rounded-control border border-border px-4 text-body text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2"
            >
              Retour au tableau de bord
            </button>
          </div>
        )}

        {session && !session.completedAt && currentEntry && (
          <QuestionCard
            meta={
              <>
                {currentEntry.question.type}
                <span className="mx-1.5 text-border" aria-hidden="true">·</span>
                {formatSource(currentEntry.question.source)}
                {currentEntry.question.difficulty ? (
                  <>
                    <span className="mx-1.5 text-border" aria-hidden="true">·</span>
                    {currentEntry.question.difficulty}
                  </>
                ) : null}
              </>
            }
            questionText={extractParagraphs(currentEntry.question.bodyRichtext)}
            type={currentEntry.question.type}
            options={currentEntry.options}
            answer={currentAnswer}
            mode={session.mode}
            onToggleOption={toggleQcmOption}
            onSelectOption={selectQcsOption}
            onFreeTextChange={setFreeText}
            onSubmit={handleSubmitAnswer}
            onRetrySubmit={handleSubmitAnswer}
            isSubmitting={isSubmittingAnswer}
          />
        )}
      </div>

      {/* Bottom nav — three visually distinct action groups */}
      {session && !session.completedAt && questions.length > 0 && (
        <nav
          className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface-1/95 backdrop-blur"
          aria-label="Navigation de session"
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-3 px-card-padding py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                disabled={currentIndex === 0}
                className="inline-flex min-h-touch-target flex-1 items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-40 sm:flex-none"
              >
                Précédent
              </button>
              <button
                type="button"
                onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
                disabled={currentIndex >= questions.length - 1}
                className="inline-flex min-h-touch-target flex-1 items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-40 sm:flex-none"
              >
                Suivant
              </button>
            </div>

            <button
              type="button"
              onClick={toggleMarkForReview}
              aria-pressed={isMarked}
              className={[
                "inline-flex min-h-touch-target items-center justify-center rounded-control px-4 text-body font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                isMarked
                  ? "border border-accent-qcm bg-accent-qcm/15 text-accent-qcm"
                  : "border border-transparent text-text-secondary underline-offset-2 hover:text-text-primary hover:underline",
              ].join(" ")}
            >
              {isMarked ? "Marqué pour revoir" : "Marquer pour revoir"}
            </button>

            <button
              type="button"
              onClick={handleFinishSession}
              disabled={isFinishing}
              className="inline-flex min-h-touch-target w-full items-center justify-center rounded-control bg-accent-qcm px-5 text-body font-semibold text-background shadow-glow-qcm transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-60 sm:w-auto"
            >
              {isFinishing ? "Finalisation..." : "Terminer la session"}
            </button>
          </div>
          {finishError && (
            <p role="alert" className="mx-auto max-w-3xl px-card-padding pb-3 text-meta text-danger">
              {finishError}
            </p>
          )}
        </nav>
      )}

      <ConfirmDialog
        open={exitOpen}
        title="Quitter la session ?"
        description="Votre progression sur cet appareil est conservée tant que la session n'est pas terminée, mais quitter maintenant interrompt le flux en cours."
        confirmLabel="Quitter"
        cancelLabel="Continuer"
        tone="danger"
        onConfirm={confirmExit}
        onCancel={() => setExitOpen(false)}
      />
    </main>
  );
}
