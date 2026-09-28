"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLanguage } from "@/context/LanguageContext";
import { useApiResource } from "@/lib/useApiResource";
import { apiFetch, ApiError } from "@/lib/api";
import { extractParagraphs } from "@/lib/richtext";
import type { SessionDetail, SessionResultItem, SessionSummary } from "@/lib/types";

function isGradable(type: string): boolean {
  return type === "QCM" || type === "QCS";
}

export default function SessionResultsPage() {
  const { user, isHydrated } = useRequireAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const sessionId = params.id;
  const { t } = useLanguage();

  const { data, error, errorCode, isLoading, refetch } = useApiResource<{
    session: SessionSummary;
    results: SessionResultItem[];
  }>(isHydrated && user ? `/sessions/${sessionId}/results` : null);

  const [reviewMode, setReviewMode] = useState(false);
  const [redoError, setRedoError] = useState<string | null>(null);
  const [isRedoing, setIsRedoing] = useState(false);

  const stats = useMemo(() => {
    const results = data?.results ?? [];
    const gradable = results.filter((r) => isGradable(r.question.type));
    const correct = gradable.filter((r) => r.isCorrect === true).length;
    const incorrect = gradable.filter((r) => r.isCorrect === false).length;
    const unanswered = gradable.filter((r) => r.isCorrect === null || r.studentAnswer === null).length;
    const weak = results.filter((r) => r.isCorrect === false || (isGradable(r.question.type) && r.studentAnswer === null));
    return { correct, incorrect, unanswered, weak, gradableCount: gradable.length };
  }, [data]);

  // FR-16 read side — the builder's "Statistiques détaillées" switch gates the results
  // screen's detailed accuracy/breakdown (stat chips + weak-points list). The score card
  // and the per-question review stay visible either way.
  const showDetailedStats = data?.session.showStats !== false;

  const visibleResults = useMemo(() => {
    if (!data) return [];
    if (!reviewMode) return data.results;
    return data.results.filter((r) => r.isCorrect === false || (isGradable(r.question.type) && !r.studentAnswer));
  }, [data, reviewMode]);

  async function startTargetedSession() {
    if (!data) return;
    setRedoError(null);
    setIsRedoing(true);
    try {
      let unitByQuestionId: Record<string, string> = {};
      try {
        const raw = sessionStorage.getItem(`hamame_session_meta_${sessionId}`);
        if (raw) {
          const parsed = JSON.parse(raw) as { unitByQuestionId?: Record<string, string> };
          unitByQuestionId = parsed.unitByQuestionId ?? {};
        }
      } catch {
        // fall through
      }

      // Fallback: completed session detail still includes unitId per question.
      if (Object.keys(unitByQuestionId).length === 0) {
        const detail = await apiFetch<{ session: SessionDetail }>(`/sessions/${sessionId}`);
        unitByQuestionId = Object.fromEntries(
          detail.session.questions.map((q) => [q.question.id, q.question.unitId])
        );
      }

      const weakQuestionIds = stats.weak.map((r) => r.question.id);
      const unitIds = [
        ...new Set(weakQuestionIds.map((id) => unitByQuestionId[id]).filter((id): id is string => !!id)),
      ];

      if (unitIds.length === 0) {
        setRedoError(t("results.redoError"));
        setIsRedoing(false);
        return;
      }

      const { session } = await apiFetch<{ session: SessionDetail }>("/sessions", {
        method: "POST",
        body: JSON.stringify({
          name: t("results.redoName"),
          mode: "practice",
          unitIds,
          size: Math.min(20, Math.max(5, stats.weak.length * 2)),
        }),
      });
      router.push(`/sessions/${session.id}`);
    } catch (err) {
      setRedoError(err instanceof ApiError ? err.message : t("player.submitError"));
      setIsRedoing(false);
    }
  }

  if (!isHydrated || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-card-padding">
        <p className="text-meta text-text-secondary">{t("common.loadingMore")}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background pb-16 text-text-primary">
      <div className="h-0.5 w-full bg-accent-qcm" aria-hidden />

      <div className="mx-auto max-w-3xl px-card-padding py-section-gap">
        {isLoading && !data && (
          <div aria-busy aria-label={t("results.loading")}>
            <div className="hamame-skeleton h-10 w-40" />
            <div className="mt-4 hamame-skeleton h-4 w-56" />
            <div className="mt-8 flex gap-3">
              <div className="hamame-skeleton h-16 flex-1 rounded-card" />
              <div className="hamame-skeleton h-16 flex-1 rounded-card" />
            </div>
            <div className="mt-8 hamame-skeleton h-24 w-full rounded-card" />
          </div>
        )}

        {error && !data && (
          <div className="rounded-card border border-danger bg-surface-2 p-card-padding">
            <p className="text-body text-danger">{error}</p>
            {errorCode === "SESSION_NOT_COMPLETED" ? (
              <Link
                href={`/sessions/${sessionId}`}
                className="mt-3 inline-flex min-h-touch-target items-center text-body font-medium text-accent-soft underline"
              >
                {t("results.backToSession")}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-3 inline-flex min-h-touch-target items-center justify-center rounded-control bg-accent-qcm px-4 text-body font-medium text-on-accent"
              >
                {t("common.retry")}
              </button>
            )}
          </div>
        )}

        {data && (
          <>
            <p className="text-meta font-medium uppercase tracking-wide text-text-tertiary">{data.session.name}</p>
            <h1 className="mt-1 font-display text-h1 font-semibold text-text-primary">{t("results.title")}</h1>

            {/* Score summary */}
            <section aria-live="polite" className="mt-6 rounded-card-lg border border-border bg-surface-2 p-card-padding shadow-card">
              <p className="text-meta text-text-secondary">{t("results.score")}</p>
              <p className="mt-1 font-display text-display font-bold leading-none text-text-primary">
                {data.session.score === null ? "—" : `${Math.round(data.session.score)}%`}
              </p>
              <p className="mt-2 text-body text-text-secondary">
                {data.session.score === null
                  ? t("results.noGraded")
                  : t(stats.gradableCount === 1 ? "results.accuracyOne" : "results.accuracyMany", { count: stats.gradableCount })}
              </p>

              {showDetailedStats && (
                <div className="mt-5 flex flex-wrap gap-4">
                  <p className="flex items-center gap-2 text-meta text-text-secondary">
                    <span className="h-2.5 w-2.5 rounded-full bg-success" aria-hidden />
                    {t("results.correct", { count: stats.correct })}
                  </p>
                  <p className="flex items-center gap-2 text-meta text-text-secondary">
                    <span className="h-2.5 w-2.5 rounded-full bg-danger" aria-hidden />
                    {t("results.incorrect", { count: stats.incorrect })}
                  </p>
                  {stats.unanswered > 0 && (
                    <p className="flex items-center gap-2 text-meta text-text-tertiary">
                      <span className="h-2.5 w-2.5 rounded-full bg-text-tertiary" aria-hidden />
                      {t("results.unanswered", { count: stats.unanswered })}
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* Primary actions — visually distinct */}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setReviewMode(true)}
                disabled={stats.weak.length === 0}
                className="inline-flex min-h-touch-target flex-1 items-center justify-center rounded-control border border-border bg-surface-1 px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 disabled:opacity-40"
              >
                {t("results.reviewErrors")}
              </button>
              <button
                type="button"
                onClick={startTargetedSession}
                disabled={isRedoing || stats.weak.length === 0}
                className="inline-flex min-h-touch-target flex-1 items-center justify-center rounded-control bg-accent-qcm px-4 text-body font-semibold text-on-accent shadow-glow-qcm transition hover:brightness-110 disabled:opacity-50"
              >
                {isRedoing ? t("results.creating") : t("results.redo")}
              </button>
            </div>
            {redoError && (
              <p role="alert" className="mt-2 text-meta text-danger">
                {redoError}
              </p>
            )}
            {reviewMode && (
              <button
                type="button"
                onClick={() => setReviewMode(false)}
                className="mt-2 text-meta text-text-secondary underline"
              >
                {t("results.showAll")}
              </button>
            )}

            {/* Points à revoir — scannable list (hidden by the FR-16 showStats toggle) */}
            {showDetailedStats && (
            <section className="mt-section-gap" aria-label={t("results.weakPoints")}>
              <h2 className="font-display text-h2 font-semibold text-text-primary">{t("results.weakPoints")}</h2>
              {stats.weak.length === 0 ? (
                <p className="mt-2 text-body text-text-secondary">
                  {t("results.noWeak")}
                </p>
              ) : (
                <ol className="mt-3 divide-y divide-border border-y border-border">
                  {stats.weak.map((item, index) => {
                    const snippet = extractParagraphs(item.question.bodyRichtext)[0] ?? t("results.questionFallback");
                    return (
                      <li key={item.sessionQuestionId} className="flex gap-3 py-3">
                        <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-danger" aria-hidden />
                        {/* The snippet truncates on narrow screens; the row links to the
                            question's full detail card below (title covers hover). */}
                        <a
                          href={`#result-${item.sessionQuestionId}`}
                          title={snippet}
                          className="min-w-0 rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                        >
                          <p className="text-meta text-text-tertiary">
                            Q{item.presentedOrder + 1} · {item.question.type}
                            {item.studentAnswer === null ? ` · ${t("results.unansweredShort")}` : ` · ${t("results.incorrectShort")}`}
                          </p>
                          <p className="truncate text-body text-text-primary">{snippet}</p>
                        </a>
                        <span className="sr-only">item {index + 1}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
            )}

            {/* Detailed results */}
            <section className="mt-section-gap" aria-label={t("results.detailTitle")}>
              <h2 className="font-display text-h2 font-semibold text-text-primary">
                {reviewMode ? t("results.reviewTitle") : t("results.allTitle")}
              </h2>
              <ul className="mt-4 flex flex-col gap-card-gap">
                {visibleResults.map((result) => (
                  <li
                    key={result.sessionQuestionId}
                    id={`result-${result.sessionQuestionId}`}
                    className="rounded-card border border-border bg-surface-1 p-card-padding"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-meta font-medium uppercase tracking-wide text-text-tertiary">
                        Question {result.presentedOrder + 1} · {result.question.type}
                      </p>
                      {result.isCorrect === true && (
                        <span className="inline-flex items-center gap-1 text-meta text-success">
                          <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
                          Correct
                        </span>
                      )}
                      {result.isCorrect === false && (
                        <span className="inline-flex items-center gap-1 text-meta text-danger">
                          <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-hidden />
                          Incorrect
                        </span>
                      )}
                      {result.isCorrect === null && (
                        <span className="text-meta text-text-tertiary">{t("results.ungraded")}</span>
                      )}
                    </div>

                    <div className="mt-2 flex flex-col gap-2 text-body text-text-primary">
                      {extractParagraphs(result.question.bodyRichtext).map((paragraph, i) => (
                        <p key={i}>{paragraph}</p>
                      ))}
                    </div>

                    {result.options.length > 0 && (
                      <ul className="mt-3 flex flex-col gap-1.5">
                        {result.options.map((option) => {
                          const wasSelected =
                            result.studentAnswer?.selectedOptionIds?.includes(option.id) ?? false;
                          let classes =
                            "rounded-control border px-3 py-2 text-meta border-border text-text-secondary";
                          // Correct and selected-wrong must be distinguishable at once.
                          if (option.isCorrect && wasSelected) {
                            classes =
                              "rounded-control border px-3 py-2 text-meta border-success bg-surface-2 text-success";
                          } else if (option.isCorrect) {
                            classes =
                              "rounded-control border px-3 py-2 text-meta border-success/60 text-success";
                          } else if (wasSelected) {
                            classes =
                              "rounded-control border px-3 py-2 text-meta border-danger bg-surface-2 text-danger";
                          }
                          return (
                            <li key={option.id} className={classes}>
                              {option.bodyText}
                              {wasSelected ? t("results.yourChoice") : ""}
                              {option.isCorrect ? t("results.rightAnswer") : ""}
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {result.options.length === 0 && (
                      <p className="mt-3 text-meta text-text-secondary">
                        {t("results.yourAnswer", {
                          answer: result.studentAnswer?.freeTextAnswer || t("results.noAnswer"),
                        })}
                      </p>
                    )}

                    {extractParagraphs(result.explanation).length > 0 && (
                      <div className="mt-3 border-t border-border pt-3 text-meta text-text-secondary">
                        {extractParagraphs(result.explanation).map((paragraph, i) => (
                          <p key={i} className={i > 0 ? "mt-2" : undefined}>
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <div className="mt-section-gap">
              <Link
                href="/dashboard"
                className="inline-flex min-h-touch-target items-center text-body font-medium text-accent-soft hover:underline"
              >
                {t("classement.backToDashboard")}
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
