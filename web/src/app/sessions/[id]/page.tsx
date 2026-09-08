"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useApiResource } from "@/lib/useApiResource";
import { apiFetch, ApiError } from "@/lib/api";
import { extractParagraphs } from "@/lib/richtext";
import { ConfirmDialog, LoadingSkeleton, Modal, QuestionCard, StudyTimer } from "@/components";
import { useToast } from "@/components/Toast";
import type { AnswerAttemptResponse, AnswerStatsResponse, SessionDetail, SessionQuestionEntry } from "@/lib/types";

// P7 report categories (MedSparkDZ-confirmed shape) mapped onto the existing
// POST /api/questions/:id/report contract ({reason, severity?}) — the mapping
// below IS the work, not a pass-through: their three UI kinds become our
// reason text + severity tier.
const REPORT_TYPES = [
  { id: "incorrect", label: "Réponse incorrecte", severity: "high" },
  { id: "typo", label: "Faute de frappe", severity: "normal" },
  { id: "other", label: "Autre", severity: "normal" },
] as const;

type ReportTypeId = (typeof REPORT_TYPES)[number]["id"];

interface AnswerState {
  selectedOptionIds: string[];
  freeText: string;
  submitted: boolean;
  isCorrect?: boolean | null;
  explanationParagraphs?: string[];
  submitError?: string | null;
  /** Correct option ids (practice mode, post-submit only — never in exam mode). */
  correctOptionIds?: string[];
  /** Community pick-rates (practice mode, post-submit only; null = no data). */
  answerStats?: { attempts: number; byOption: Record<string, number> } | null;
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
  const toast = useToast();

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
    if (!session) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [session]);

  const remainingSeconds = useMemo(() => {
    if (!session?.timeLimitSeconds) return null;
    const endsAt = new Date(session.startedAt).getTime() + session.timeLimitSeconds * 1000;
    return Math.max(0, Math.floor((endsAt - nowMs) / 1000));
  }, [session, nowMs]);

  // Task 3a — practice elapsed timer (count-up): same 1s tick, derived from the
  // existing startedAt field. Exam mode keeps its countdown above, unchanged.
  const elapsedSeconds = useMemo(() => {
    if (!session || timed) return null;
    return Math.max(0, Math.floor((nowMs - new Date(session.startedAt).getTime()) / 1000));
  }, [session, timed, nowMs]);

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
        // Practice-only (see AnswerAttemptResponse): never set in exam mode, where
        // revealing the key pre-submission would leak answers.
        correctOptionIds: attempt.correctOptionIds,
      }));

      // Community pick-rates: enrichment only, practice + choice types. Best-effort —
      // a stats failure must never break or delay the correctness feedback above.
      // Keyed by sessionQuestionId (captured now) in case the student navigates away
      // while the fetch is in flight.
      if (session.mode === "practice" && isChoiceType) {
        const statsQuestionId = currentEntry.question.id;
        const statsSessionQuestionId = currentEntry.sessionQuestionId;
        try {
          const stats = await apiFetch<AnswerStatsResponse>(
            `/questions/${statsQuestionId}/answer-stats`
          );
          if (stats.options.length > 0) {
            const byOption: Record<string, number> = {};
            for (const option of stats.options) byOption[option.optionId] = option.percentage;
            setAnswers((prev) => ({
              ...prev,
              [statsSessionQuestionId]: {
                ...(prev[statsSessionQuestionId] ?? emptyAnswerState()),
                answerStats: { attempts: stats.attempts, byOption },
              },
            }));
          }
        } catch {
          // No stats (no attempts yet, offline, …) — feedback already stands alone.
        }
      }
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

  // P7 report flow: icon button in the header opens a small modal (type +
  // optional description) that POSTs to the existing FR-17 report endpoint.
  const [reportOpen, setReportOpen] = useState(false);
  const [reportType, setReportType] = useState<ReportTypeId>("incorrect");
  const [reportDescription, setReportDescription] = useState("");
  const [reportSending, setReportSending] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSent, setReportSent] = useState(false);

  function openReport() {
    setReportType("incorrect");
    setReportDescription("");
    setReportError(null);
    setReportSent(false);
    setReportOpen(true);
  }

  async function handleSendReport() {
    if (!currentEntry || reportSending) return;
    setReportSending(true);
    setReportError(null);
    try {
      const kind = REPORT_TYPES.find((entry) => entry.id === reportType)!;
      const reason =
        reportDescription.trim().length > 0
          ? `${kind.label} — ${reportDescription.trim()}`
          : kind.label;
      await apiFetch(`/questions/${currentEntry.question.id}/report`, {
        method: "POST",
        body: JSON.stringify({ reason, severity: kind.severity }),
      });
      setReportSent(true);
      toast.success({ title: "Signalement envoyé — merci." });
    } catch (err) {
      setReportError(err instanceof ApiError ? err.message : "Envoi impossible. Réessayez.");
    } finally {
      setReportSending(false);
    }
  }

  if (!isHydrated || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-card-padding">
        <p className="text-meta text-text-secondary">Chargement...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background pb-60 text-text-primary sm:pb-28">
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
          {/* Practice elapsed time (count-up). aria-live off: announcing every
              second would spam screen readers, unlike the exam countdown. */}
          {!timed && elapsedSeconds !== null && (
            <p
              aria-live="off"
              className="shrink-0 rounded-pill border border-border px-3 py-2 font-display text-h3 font-semibold tabular-nums text-text-secondary"
            >
              {formatRemaining(elapsedSeconds)}
            </p>
          )}
          <button
            type="button"
            onClick={() => setExitOpen(true)}
            className="inline-flex min-h-touch-target shrink-0 items-center justify-center rounded-control border border-border px-3 text-meta font-medium text-text-secondary transition hover:bg-surface-2 hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2"
          >
            Quitter
          </button>
          {/* P7 report/flag: icon-only like the reference (title mirrors it). */}
          <button
            type="button"
            onClick={openReport}
            title="Signaler une erreur"
            aria-label="Signaler une erreur sur cette question"
            className="inline-flex min-h-touch-target w-11 shrink-0 items-center justify-center rounded-control border border-border text-text-secondary transition hover:bg-surface-2 hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              <line x1="4" y1="22" x2="4" y2="15" />
            </svg>
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
              className="mt-3 inline-flex min-h-touch-target items-center justify-center rounded-control bg-accent-qcm px-4 text-body font-medium text-on-accent transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
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
          <>
            {/* P4 numbered rail: jump between questions with answered/current
                states. Horizontal strip (not a sidebar) for the single-column
                layout — same states and behavior as the reference rail. */}
            {questions.length > 1 ? (
              <nav aria-label="Aller à la question" className="mx-auto mb-4 flex max-w-xl gap-1.5 overflow-x-auto pb-1">
                {questions.map((entry, index) => {
                  const isCurrent = index === currentIndex;
                  const isAnswered = !!answers[entry.sessionQuestionId]?.submitted;
                  return (
                    <button
                      key={entry.sessionQuestionId}
                      type="button"
                      onClick={() => setCurrentIndex(index)}
                      aria-label={`Aller à la question ${index + 1}${isCurrent ? " (actuelle)" : ""}${isAnswered ? " (répondue)" : ""}`}
                      aria-current={isCurrent ? "true" : undefined}
                      className={[
                        "flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] border text-meta font-semibold tabular-nums transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                        isCurrent
                          ? "border-accent-qcm bg-accent-qcm text-on-accent ring-2 ring-accent-soft"
                          : isAnswered
                            ? "border-success/60 bg-success/10 text-success"
                            : "border-border bg-surface-1 text-text-secondary hover:bg-surface-2",
                      ].join(" ")}
                    >
                      {index + 1}
                    </button>
                  );
                })}
              </nav>
            ) : null}
            <QuestionCard
              key={currentEntry.sessionQuestionId}
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
            unitName={currentEntry.question.unitName}
            moduleName={currentEntry.question.moduleName}
            examYear={currentEntry.question.examYear}
            sittingLabel={currentEntry.question.sittingLabel}
            onToggleOption={toggleQcmOption}
            onSelectOption={selectQcsOption}
            onFreeTextChange={setFreeText}
            onSubmit={handleSubmitAnswer}
            onRetrySubmit={handleSubmitAnswer}
            isSubmitting={isSubmittingAnswer}
          />
          </>
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
                title={currentIndex === 0 ? "Première question" : undefined}
                className="inline-flex min-h-touch-target flex-1 items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-40 sm:flex-none"
              >
                Précédent
              </button>
              <button
                type="button"
                onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
                disabled={currentIndex >= questions.length - 1}
                title={currentIndex >= questions.length - 1 ? "Dernière question" : undefined}
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
                  ? "border border-accent-qcm bg-accent-qcm/15 text-accent-soft"
                  : "border border-transparent text-text-secondary underline-offset-2 hover:text-text-primary hover:underline",
              ].join(" ")}
            >
              {isMarked ? "Marqué pour revoir" : "Marquer pour revoir"}
            </button>

            <button
              type="button"
              onClick={handleFinishSession}
              disabled={isFinishing}
              className="inline-flex min-h-touch-target w-full items-center justify-center rounded-control bg-accent-qcm px-5 text-body font-semibold text-on-accent shadow-glow-qcm transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-60 sm:w-auto"
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

      <Modal
        open={reportOpen}
        onClose={() => {
          if (!reportSending) setReportOpen(false);
        }}
        title="Signaler une erreur"
      >
        {reportSent ? (
          <p role="status" className="text-body text-text-primary">
            Signalement envoyé — merci pour votre aide.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {currentEntry ? (
              <p className="text-meta text-text-tertiary">
                Question : {extractParagraphs(currentEntry.question.bodyRichtext)[0]?.slice(0, 80) ?? "—"}
                {(extractParagraphs(currentEntry.question.bodyRichtext)[0]?.length ?? 0) > 80 ? "…" : ""}
              </p>
            ) : null}
            <fieldset>
              <legend className="mb-2 text-meta font-medium text-text-secondary">Type d&apos;erreur *</legend>
              <div className="flex flex-col gap-2">
                {REPORT_TYPES.map((kind) => (
                  <label
                    key={kind.id}
                    className="flex min-h-touch-target cursor-pointer items-center gap-2 rounded-panel border border-border bg-surface-2 px-3 text-body text-text-primary transition hover:bg-surface-3 has-[:checked]:border-accent-qcm"
                  >
                    <input
                      type="radio"
                      name="report-type"
                      checked={reportType === kind.id}
                      onChange={() => setReportType(kind.id)}
                      disabled={reportSending}
                      className="h-4 w-4 shrink-0 accent-[var(--color-accent-qcm)]"
                    />
                    {kind.id === "incorrect" ? "❌ " : kind.id === "typo" ? "✏️ " : "💬 "}
                    {kind.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor="report-description" className="mb-2 block text-meta font-medium text-text-secondary">
                Description (optionnel)
              </label>
              <textarea
                id="report-description"
                value={reportDescription}
                onChange={(event) => setReportDescription(event.target.value)}
                disabled={reportSending}
                rows={3}
                className="min-h-touch-target w-full rounded-input border border-border bg-surface-2 px-4 py-3 text-body text-text-primary placeholder:text-text-tertiary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-60"
              />
            </div>
            {reportError ? (
              <p role="alert" className="text-meta text-danger">
                {reportError}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void handleSendReport()}
              disabled={reportSending}
              className="inline-flex min-h-touch-target w-full items-center justify-center rounded-control bg-accent-qcm px-5 text-body font-semibold text-on-accent shadow-glow-qcm transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50 disabled:pointer-events-none"
            >
              {reportSending ? "Envoi..." : "Envoyer le signalement"}
            </button>
          </div>
        )}
      </Modal>

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

      {/* FR-66 — optional study-timer presets. Practice sessions only: exam mode already
          has its own FR-19 chronometer in the header above. Purely client-side. */}
      {session && !session.completedAt && session.mode === "practice" && questions.length > 0 && (
        <StudyTimer />
      )}
    </main>
  );
}
