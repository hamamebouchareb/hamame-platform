"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { localeFor, readinessLabel, type UiLanguage } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useApiResource } from "@/lib/useApiResource";
import { useApiList } from "@/lib/useApiList";
import { AppHeader, Footer, MetricCard, ProgressBar, WeeklyActivity, EmptyState } from "@/components";
import { accentVar } from "@/components/FeatureCard";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import type { CurriculumModule, ExamReadiness, ModuleProgress, ProgressSummary, Year } from "@/lib/types";

function InfoTooltip({ tooltip, className }: { tooltip: string; className?: string }) {
  return (
    <button
      type="button"
      title={tooltip}
      aria-label={tooltip}
      className={`inline-flex min-h-touch-target min-w-touch-target items-center justify-center rounded-pill border border-border bg-surface-3 text-caption font-bold text-text-tertiary transition hover:bg-surface-2 hover:text-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${className ?? ""}`}
    >
      ?
    </button>
  );
}

function formatDate(iso: string, lang: UiLanguage): string {
  return new Date(iso).toLocaleString(localeFor(lang), { dateStyle: "medium", timeStyle: "short" });
}

interface YearHierarchy {
  year: Year;
  modules: (CurriculumModule & { progress: ModuleProgress | null })[];
  totalLessons: number;
  completedLessons: number;
  percentage: number;
}

export default function SuiviPage() {
  const { logout } = useAuth();
  const router = useRouter();
  const { user, isHydrated } = useRequireAuth();
  const { lang, t } = useLanguage();
  const canFetch = isHydrated && !!user;

  const progress = useApiResource<ProgressSummary>(canFetch ? "/progress/me" : null);
  const readiness = useApiResource<ExamReadiness>(canFetch ? "/progress/readiness" : null);

  interface ModulePerformance {
    moduleId: string;
    moduleName: string;
    yearId: string;
    yearLabel: string;
    totalLessons: number;
    completedLessons: number;
    completionPercentage: number;
    answered: number;
    correct: number;
    incorrect: number;
    accuracy: number | null;
  }

  const performance = useApiResource<{ modules: ModulePerformance[] }>(
    canFetch ? "/progress/by-module" : null
  );
  const perfModules = useMemo(() => performance.data?.modules ?? [], [performance.data]);

  const yearsData = useApiResource<{ years: Year[] }>(
    canFetch && user?.facultyId ? `/faculties/${user.facultyId}/years` : null
  );
  const years = useMemo(() => yearsData.data?.years ?? [], [yearsData]);

  const targetYears = useMemo(
    () => (user?.yearId ? years.filter((y) => y.id === user.yearId) : years),
    [years, user]
  );

  const yearModulePaths = targetYears.map((y) => `/years/${y.id}/modules`);
  const { data: moduleBatches } = useApiList<{ modules: CurriculumModule[] }>(
    canFetch && yearModulePaths.length > 0 ? yearModulePaths : null
  );

  const allModules = useMemo(
    () => moduleBatches.flatMap((b) => b?.modules ?? []),
    [moduleBatches]
  );

  const progressPaths = allModules.map((m) => `/progress/modules/${m.id}`);
  const { data: progressBatches, isLoading: moduleProgressLoading } = useApiList<ModuleProgress>(
    canFetch && progressPaths.length > 0 ? progressPaths : null
  );

  const moduleProgressMap = useMemo(() => {
    const map = new Map<string, ModuleProgress>();
    allModules.forEach((mod, idx) => {
      if (progressBatches[idx]) map.set(mod.id, progressBatches[idx]!);
    });
    return map;
  }, [allModules, progressBatches]);

  const yearHierarchy = useMemo<YearHierarchy[]>(() => {
    return targetYears.map((year, yearIdx) => {
      const batchModules = moduleBatches[yearIdx]?.modules ?? [];
      const modules = batchModules.map((mod) => ({
        ...mod,
        progress: moduleProgressMap.get(mod.id) ?? null,
      }));
      const totalLessons = modules.reduce((s, m) => s + (m.progress?.totalLessons ?? 0), 0);
      const completedLessons = modules.reduce((s, m) => s + (m.progress?.completedLessons ?? 0), 0);
      const percentage = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
      return { year, modules, totalLessons, completedLessons, percentage };
    });
  }, [targetYears, moduleBatches, moduleProgressMap]);

  const rankedModules = useMemo(() => {
    const all = yearHierarchy.flatMap((yh) => yh.modules);
    return [...all].sort((a, b) => (a.progress?.percentage ?? 0) - (b.progress?.percentage ?? 0));
  }, [yearHierarchy]);

  const hasCurriculum = yearHierarchy.some((yh) => yh.modules.length > 0);
  const hasActivity = (progress.data?.totalCompletedSessions ?? 0) > 0;
  const showEmpty = !hasCurriculum && !hasActivity && !progress.isLoading && !moduleProgressLoading;

  const readinessData = readiness.data && !readiness.data.insufficientData ? readiness.data : null;

  function handleLogout() {
    logout();
    router.push("/login");
  }

  if (!isHydrated || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-card-padding">
        <LoadingSkeleton className="h-8 w-48" ariaLabel={t("common.loading")} />
      </main>
    );
  }

  return (
    <>
      <AppHeader user={user} onLogout={handleLogout} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-card-padding py-section-gap">
        {/* Hero */}
        <section aria-label={t("suivi.heroAria")} className="mx-auto max-w-3xl text-center">
          <p className="text-meta font-medium uppercase tracking-wide text-accent-soft">{t("suivi.heroKicker")}</p>
          <h1 className="mt-2 font-display text-hero font-bold leading-tight text-text-primary">
            {t("suivi.heroTitle")}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-body text-text-secondary">
            {t("suivi.heroSubtitle")}
          </p>
        </section>

        {/* 1. Overview metrics */}
        <section aria-label={t("suivi.metricsAria")} className="mx-auto mt-section-gap grid max-w-4xl grid-cols-2 gap-card-gap md:grid-cols-4">
          <MetricCard
            label={t("suivi.streakDays")}
            value={progress.data?.streak.currentStreakDays ?? 0}
            subtitle={t("common.total")}
            loading={progress.isLoading}
            error={progress.error ? t("suivi.streakError") : null}
            onRetry={progress.refetch}
            tone="primary"
          />
          <MetricCard
            label={t("suivi.accuracy")}
            value={progress.data?.accuracy !== null && progress.data?.accuracy !== undefined ? `${progress.data.accuracy}%` : "—"}
            subtitle={t("suivi.accuracySubtitle")}
            loading={progress.isLoading}
            error={progress.error ? t("suivi.accuracyError") : null}
            onRetry={progress.refetch}
            tone="primary"
          />
          <MetricCard
            label={t("suivi.avgScore")}
            value={progress.data?.averageScore !== null && progress.data?.averageScore !== undefined ? `${progress.data.averageScore}%` : "—"}
            subtitle={t("suivi.avgScoreSubtitle")}
            loading={progress.isLoading}
            error={progress.error ? t("suivi.scoreError") : null}
            onRetry={progress.refetch}
            tone="qcm"
          />
          <MetricCard
            label={t("suivi.sessionsDone")}
            value={progress.data?.totalCompletedSessions ?? 0}
            subtitle={t("common.total")}
            loading={progress.isLoading}
            error={progress.error ? t("suivi.sessionsError") : null}
            onRetry={progress.refetch}
            tone="library"
          />
        </section>

        {/* 2. Curriculum progress hierarchy */}
        <section aria-label={t("suivi.curriculumTitle")} className="mx-auto mt-section-gap max-w-4xl">
          <h2 className="font-display text-h2 font-semibold text-text-primary">{t("suivi.curriculumTitle")}</h2>

          {progress.isLoading || moduleProgressLoading || yearsData.isLoading ? (
            <div className="mt-4 flex flex-col gap-4">
              {[0, 1].map((i) => (
                <div key={i} className="rounded-card border border-border bg-surface-1 p-card-padding shadow-card">
                  <LoadingSkeleton className="mb-3 h-5 w-32" ariaLabel={t("suivi.curriculumLoading")} />
                  <LoadingSkeleton className="h-4 w-full" ariaLabel="" />
                </div>
              ))}
            </div>
          ) : yearsData.error ? (
            <div className="mt-4 rounded-card border border-danger bg-surface-1 p-card-padding">
              <p role="alert" className="text-body text-danger">
                {t("suivi.curriculumLoadError", { error: yearsData.error })}
              </p>
              <button
                type="button"
                onClick={yearsData.refetch}
                className="mt-3 inline-flex min-h-touch-target w-full items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2 sm:w-auto"
              >
                {t("common.retry")}
              </button>
            </div>
          ) : showEmpty && !user.yearId ? (
            <div className="mt-4">
              <EmptyState
                title={t("suivi.noTrack")}
                description={t("suivi.noTrackDesc")}
                action={{ label: t("suivi.chooseTrack"), href: "/faculties" }}
              />
            </div>
          ) : !hasCurriculum && user.yearId ? (
            <div className="mt-4">
              <EmptyState
                title={t("suivi.noModules")}
                description={t("suivi.noModulesDesc")}
                action={{ label: t("suivi.viewLibrary"), href: "/faculties" }}
              />
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-4">
              {yearHierarchy.map((yh) => (
                <article
                  key={yh.year.id}
                  className="rounded-card border border-border bg-surface-1 p-card-padding shadow-card"
                  style={{ borderTop: `3px solid ${accentVar("suivi")}` }}
                >
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div>
                      <p className="font-display text-h3 font-semibold text-text-primary">{yh.year.label}</p>
                      <p className="mt-0.5 text-meta text-text-secondary">
                        {yh.totalLessons > 0
                          ? t("suivi.lessonsViewed", { completed: yh.completedLessons, total: yh.totalLessons })
                          : t("suivi.noLessons")}
                      </p>
                    </div>
                    <span className="font-display text-display font-bold tabular-nums text-text-primary">
                      {yh.percentage}%
                    </span>
                  </div>
                  <ProgressBar
                    className="mt-3"
                    value={yh.percentage}
                    label={t("suivi.overallProgress", { label: yh.year.label })}
                    tone="primary"
                  />
                  {yh.modules.length > 0 && (
                    <ul className="mt-4 flex flex-col gap-3 border-t border-border pt-3">
                      {yh.modules.map((mod) => {
                        const pct = mod.progress?.percentage ?? 0;
                        const total = mod.progress?.totalLessons ?? 0;
                        const completed = mod.progress?.completedLessons ?? 0;
                        return (
                          <li key={mod.id} className="flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-body font-medium text-text-primary">{mod.name}</p>
                              <span className="text-meta tabular-nums text-text-secondary">
                                {total > 0 ? t("suivi.moduleLessons", { completed, total }) : "—"}
                              </span>
                            </div>
                            <ProgressBar value={pct} tone={pct === 100 ? "success" : "primary"} />
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        {/* 3. Ranked modules — weakest first */}
        {rankedModules.length > 0 && (
          <section aria-label={t("suivi.weakModules")} className="mx-auto mt-section-gap max-w-4xl">
            <h2 className="font-display text-h2 font-semibold text-text-primary">{t("suivi.weakModules")}</h2>
            <p className="mt-1 text-body text-text-secondary">
              {t("suivi.weakModulesDesc")}
            </p>
            <ol className="mt-4 flex flex-col gap-card-gap">
              {rankedModules.map((mod, index) => {
                const pct = mod.progress?.percentage ?? 0;
                const total = mod.progress?.totalLessons ?? 0;
                const completed = mod.progress?.completedLessons ?? 0;
                return (
                  <li
                    key={mod.id}
                    className="flex items-center gap-4 rounded-card border border-border bg-surface-1 p-card-padding shadow-card transition hover:border-border-strong hover:bg-surface-2"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-surface-3 font-display text-caption font-bold tabular-nums text-text-secondary">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-body font-medium text-text-primary">{mod.name}</p>
                        <span className="shrink-0 text-meta tabular-nums text-text-secondary">
                          {total > 0 ? t("suivi.moduleLessons", { completed, total }) : "—"}
                        </span>
                      </div>
                      <ProgressBar className="mt-2" value={pct} tone={pct === 100 ? "success" : pct > 0 ? "primary" : "warning"} />
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {/* 3b. Per-module performance (accuracy on graded attempts) */}
        <section aria-label={t("suivi.perfTitle")} className="mx-auto mt-section-gap max-w-4xl">
          <h2 className="font-display text-h2 font-semibold text-text-primary">{t("suivi.perfTitle")}</h2>
          {performance.isLoading ? (
            <div className="mt-4 flex flex-col gap-4">
              {[0, 1].map((i) => (
                <div key={i} className="rounded-card border border-border bg-surface-1 p-card-padding shadow-card">
                  <LoadingSkeleton className="h-4 w-40" ariaLabel={t("common.loading")} />
                </div>
              ))}
            </div>
          ) : performance.error ? (
            <p role="alert" className="mt-4 text-body text-danger">
              {performance.error}
            </p>
          ) : (
            <ol className="mt-4 flex flex-col gap-card-gap">
              {perfModules.map((mod) => (
                <li
                  key={mod.moduleId}
                  className="rounded-card border border-border bg-surface-1 p-card-padding shadow-card"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-body font-medium text-text-primary">{mod.moduleName}</p>
                    <span className="shrink-0 text-meta tabular-nums text-text-secondary">
                      {mod.accuracy !== null
                        ? t("suivi.perfDetail", { acc: mod.accuracy, c: mod.correct, a: mod.answered })
                        : t("suivi.perfNone")}
                    </span>
                  </div>
                  <ProgressBar
                    className="mt-2"
                    value={mod.accuracy ?? 0}
                    tone={mod.accuracy !== null && mod.accuracy >= 70 ? "success" : "primary"}
                    label={`${mod.moduleName} — ${t("suivi.perfTitle")}`}
                  />
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* 4. Readiness breakdown */}
        <section aria-label={t("suivi.examPrep")} className="mx-auto mt-section-gap max-w-4xl">
          <h2 className="font-display text-h2 font-semibold text-text-primary">{t("suivi.examPrep")}</h2>
          {readiness.isLoading ? (
            <div className="mt-4 flex flex-col gap-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-card border border-border bg-surface-1 p-card-padding shadow-card">
                  <LoadingSkeleton className="h-4 w-40" ariaLabel={t("common.loading")} />
                </div>
              ))}
            </div>
          ) : readiness.error ? (
            <div className="mt-4 rounded-card border border-danger bg-surface-1 p-card-padding">
              <p role="alert" className="text-body text-danger">
                {readiness.error}
              </p>
              <button
                type="button"
                onClick={readiness.refetch}
                className="mt-3 inline-flex min-h-touch-target w-full items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2 sm:w-auto"
              >
                {t("common.retry")}
              </button>
            </div>
          ) : readinessData ? (
            <div className="mt-4 rounded-card border border-border bg-surface-1 p-card-padding shadow-card">
              <div className="mb-4 flex items-baseline gap-3">
                <span className="font-display text-display font-bold text-text-primary">{readinessData.score}</span>
                <span className="font-display text-h3 font-semibold text-text-secondary">/100</span>
                <span className="ml-auto rounded-pill border border-accent-suivi/40 bg-accent-suivi/15 px-2.5 py-0.5 text-caption font-medium text-accent-soft">
                  {readinessLabel(lang, readinessData.label)}
                </span>
              </div>
              <ul className="flex flex-col gap-4">
                <li className="flex flex-col gap-2">
                  <span className="flex items-center gap-1.5 text-meta text-text-secondary">
                    <InfoTooltip tooltip={t("suivi.accuracyTip")} />
                    {t("suivi.recentAccuracy")}
                    <span className="text-caption text-text-tertiary">{t("suivi.recentAccuracyHint")}</span>
                  </span>
                  <ProgressBar value={readinessData.components.recentAccuracy ?? 0} tone="primary" label={t("suivi.recentAccuracy")} />
                </li>
                <li className="flex flex-col gap-2">
                  <span className="flex items-center gap-1.5 text-meta text-text-secondary">
                    <InfoTooltip tooltip={t("suivi.coverageTip")} />
                    {t("suivi.coverage")}
                    <span className="text-caption text-text-tertiary">{t("suivi.coverageHint")}</span>
                  </span>
                  <ProgressBar value={readinessData.components.curriculumCoverage} tone="secondary" label={t("suivi.coverage")} />
                </li>
                <li className="flex flex-col gap-2">
                  <span className="flex items-center gap-1.5 text-meta text-text-secondary">
                    <InfoTooltip tooltip={t("suivi.consistencyTip")} />
                    {t("suivi.consistency")}
                    <span className="text-caption text-text-tertiary">{t("suivi.consistencyHint")}</span>
                  </span>
                  <ProgressBar value={readinessData.components.consistency} tone="primary" label={t("suivi.consistency")} />
                </li>
              </ul>
              <p className="mt-4 text-caption text-text-tertiary">
                {t("suivi.compositeNote")}
              </p>
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState
                title={t("suivi.insufficientTitle")}
                description={t("suivi.insufficientDesc", { min: readiness.data?.minAttemptsRequired ?? 5 })}
                action={{ label: t("suivi.startSession"), href: "/qcm" }}
              />
            </div>
          )}
        </section>

        {/* 5. Recent activity */}
        <section aria-label={t("suivi.recentActivity")} className="mx-auto mt-section-gap max-w-4xl">
          <h2 className="font-display text-h2 font-semibold text-text-primary">{t("suivi.recentActivity")}</h2>
          <WeeklyActivity
            className="mt-4"
            items={(progress.data?.recentActivity ?? []).map((item, index) => {
              if (item.type === "session") {
                const scoreLabel = item.score === null ? t("suivi.unscored") : `${item.score}%`;
                return {
                  key: `session-${index}`,
                  href: `/sessions/${item.id}/results`,
                  title: item.name,
                  subtitle: `${item.mode === "practice" ? t("suivi.sessionPractice") : t("suivi.sessionExam")} · ${scoreLabel}`,
                  timestamp: formatDate(item.at, lang),
                };
              }
              return {
                key: `lesson-${index}`,
                href: `/lessons/${item.lessonId}`,
                title: item.title,
                subtitle: t("suivi.lessonViewed"),
                timestamp: formatDate(item.at, lang),
              };
            })}
            loading={progress.isLoading}
            error={progress.error ? t("suivi.activityError", { error: progress.error }) : null}
            onRetry={progress.refetch}
            emptyTitle={t("suivi.noActivityTitle")}
            emptyDescription={t("suivi.noActivityDesc")}
            emptyAction={{ label: t("suivi.createQcm"), href: "/qcm" }}
          />
        </section>

        {/* Global empty state — no curriculum, no activity, nothing */}
        {showEmpty && user.yearId && (
          <section aria-label={t("suivi.getStarted")} className="mx-auto mt-section-gap max-w-4xl">
            <EmptyState
              title={t("suivi.getStartedTitle")}
              description={t("suivi.getStartedDescSessions")}
              action={{ label: t("suivi.createQcm"), href: "/qcm" }}
            />
          </section>
        )}
        {showEmpty && !user.yearId && (
          <section aria-label={t("suivi.getStarted")} className="mx-auto mt-section-gap max-w-4xl">
            <EmptyState
              title={t("suivi.getStartedTitle")}
              description={t("suivi.getStartedDescTrack")}
              action={{ label: t("suivi.chooseTrack"), href: "/faculties" }}
            />
          </section>
        )}
      </main>

      <Footer />
    </>
  );
}
