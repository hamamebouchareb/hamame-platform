"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-DZ", { dateStyle: "medium", timeStyle: "short" });
}

function readinessLabelFr(label: ExamReadiness["label"]): string {
  switch (label) {
    case "Exam ready":
      return "Prêt pour l'examen";
    case "On track":
      return "Sur la bonne voie";
    case "Needs work":
      return "À travailler";
    default:
      return "Indisponible";
  }
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
  const canFetch = isHydrated && !!user;

  const progress = useApiResource<ProgressSummary>(canFetch ? "/progress/me" : null);
  const readiness = useApiResource<ExamReadiness>(canFetch ? "/progress/readiness" : null);

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
        <LoadingSkeleton className="h-8 w-48" ariaLabel="Chargement" />
      </main>
    );
  }

  return (
    <>
      <AppHeader user={user} onLogout={handleLogout} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-card-padding py-section-gap">
        {/* Hero */}
        <section aria-label="En-tête du suivi" className="mx-auto max-w-3xl text-center">
          <p className="text-meta font-medium uppercase tracking-wide text-accent-soft">Progression</p>
          <h1 className="mt-2 font-display text-hero font-bold leading-tight text-text-primary">
            Suivi de progression
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-body text-text-secondary">
            Vue d&apos;ensemble de votre avancement dans le programme, votre régularité et votre préparation à
            l&apos;examen.
          </p>
        </section>

        {/* 1. Overview metrics */}
        <section aria-label="Indicateurs clés" className="mx-auto mt-section-gap grid max-w-4xl grid-cols-2 gap-card-gap md:grid-cols-4">
          <MetricCard
            label="Jours de série"
            value={progress.data?.streak.currentStreakDays ?? 0}
            subtitle="au total"
            loading={progress.isLoading}
            error={progress.error ? "Série indisponible" : null}
            onRetry={progress.refetch}
            tone="primary"
          />
          <MetricCard
            label="Précision"
            value={progress.data?.accuracy !== null && progress.data?.accuracy !== undefined ? `${progress.data.accuracy}%` : "—"}
            subtitle="QCM / QCS, au total"
            loading={progress.isLoading}
            error={progress.error ? "Précision indisponible" : null}
            onRetry={progress.refetch}
            tone="primary"
          />
          <MetricCard
            label="Score moyen"
            value={progress.data?.averageScore !== null && progress.data?.averageScore !== undefined ? `${progress.data.averageScore}%` : "—"}
            subtitle="sessions terminées"
            loading={progress.isLoading}
            error={progress.error ? "Score indisponible" : null}
            onRetry={progress.refetch}
            tone="qcm"
          />
          <MetricCard
            label="Sessions terminées"
            value={progress.data?.totalCompletedSessions ?? 0}
            subtitle="au total"
            loading={progress.isLoading}
            error={progress.error ? "Sessions indisponibles" : null}
            onRetry={progress.refetch}
            tone="library"
          />
        </section>

        {/* 2. Curriculum progress hierarchy */}
        <section aria-label="Progression dans le programme" className="mx-auto mt-section-gap max-w-4xl">
          <h2 className="font-display text-h2 font-semibold text-text-primary">Progression dans le programme</h2>

          {progress.isLoading || moduleProgressLoading || yearsData.isLoading ? (
            <div className="mt-4 flex flex-col gap-4">
              {[0, 1].map((i) => (
                <div key={i} className="rounded-card border border-border bg-surface-1 p-card-padding shadow-card">
                  <LoadingSkeleton className="mb-3 h-5 w-32" ariaLabel="Chargement de la progression" />
                  <LoadingSkeleton className="h-4 w-full" ariaLabel="" />
                </div>
              ))}
            </div>
          ) : yearsData.error ? (
            <div className="mt-4 rounded-card border border-danger bg-surface-1 p-card-padding">
              <p role="alert" className="text-body text-danger">
                Impossible de charger le programme. {yearsData.error}
              </p>
              <button
                type="button"
                onClick={yearsData.refetch}
                className="mt-3 inline-flex min-h-touch-target w-full items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2 sm:w-auto"
              >
                Réessayer
              </button>
            </div>
          ) : showEmpty && !user.yearId ? (
            <div className="mt-4">
              <EmptyState
                title="Aucune filière définie"
                description="Indiquez votre faculté et votre année dans votre profil pour suivre votre progression dans le programme."
                action={{ label: "Choisir ma filière", href: "/faculties" }}
              />
            </div>
          ) : !hasCurriculum && user.yearId ? (
            <div className="mt-4">
              <EmptyState
                title="Aucun module dans votre année"
                description="Votre année ne contient pas encore de modules. Revenez bientôt ou explorez le catalogue."
                action={{ label: "Voir la bibliothèque", href: "/faculties" }}
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
                          ? `${yh.completedLessons} / ${yh.totalLessons} leçons consultées`
                          : "Aucune leçon publiée"}
                      </p>
                    </div>
                    <span className="font-display text-display font-bold tabular-nums text-text-primary">
                      {yh.percentage}%
                    </span>
                  </div>
                  <ProgressBar
                    className="mt-3"
                    value={yh.percentage}
                    label={`${yh.year.label} — progression globale`}
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
                                {total > 0 ? `${completed}/${total} leçons` : "—"}
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
          <section aria-label="Modules à consolider" className="mx-auto mt-section-gap max-w-4xl">
            <h2 className="font-display text-h2 font-semibold text-text-primary">Modules à consolider</h2>
            <p className="mt-1 text-body text-text-secondary">
              Classés par progression croissante — les modules où vous avez le plus de travail en premier.
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
                          {total > 0 ? `${completed}/${total} leçons` : "—"}
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

        {/* 4. Readiness breakdown */}
        <section aria-label="Préparation à l'examen" className="mx-auto mt-section-gap max-w-4xl">
          <h2 className="font-display text-h2 font-semibold text-text-primary">Préparation à l&apos;examen</h2>
          {readiness.isLoading ? (
            <div className="mt-4 flex flex-col gap-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-card border border-border bg-surface-1 p-card-padding shadow-card">
                  <LoadingSkeleton className="h-4 w-40" ariaLabel="Chargement" />
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
                Réessayer
              </button>
            </div>
          ) : readinessData ? (
            <div className="mt-4 rounded-card border border-border bg-surface-1 p-card-padding shadow-card">
              <div className="mb-4 flex items-baseline gap-3">
                <span className="font-display text-display font-bold text-text-primary">{readinessData.score}</span>
                <span className="font-display text-h3 font-semibold text-text-secondary">/100</span>
                <span className="ml-auto rounded-pill border border-accent-suivi/40 bg-accent-suivi/15 px-2.5 py-0.5 text-caption font-medium text-accent-soft">
                  {readinessLabelFr(readinessData.label)}
                </span>
              </div>
              <ul className="flex flex-col gap-4">
                <li className="flex flex-col gap-2">
                  <span className="flex items-center gap-1.5 text-meta text-text-secondary">
                    <InfoTooltip tooltip="Pourcentage de bonnes réponses sur les 20 dernières questions QCM/QCS. Pondération : 50% du score." />
                    Précision récente
                    <span className="text-caption text-text-tertiary">(20 dernières réponses — 50%)</span>
                  </span>
                  <ProgressBar value={readinessData.components.recentAccuracy ?? 0} tone="primary" label="Précision récente" />
                </li>
                <li className="flex flex-col gap-2">
                  <span className="flex items-center gap-1.5 text-meta text-text-secondary">
                    <InfoTooltip tooltip="Pourcentage des leçons publiées de votre année que vous avez consultées au moins une fois. Pondération : 30% du score." />
                    Couverture du programme
                    <span className="text-caption text-text-tertiary">(votre année — 30%)</span>
                  </span>
                  <ProgressBar value={readinessData.components.curriculumCoverage} tone="secondary" label="Couverture du programme" />
                </li>
                <li className="flex flex-col gap-2">
                  <span className="flex items-center gap-1.5 text-meta text-text-secondary">
                    <InfoTooltip tooltip="Nombre de jours consécutifs d'étude, plafonné à 30 jours puis mis à l'échelle 0–100. Pondération : 20% du score." />
                    Régularité
                    <span className="text-caption text-text-tertiary">(30 derniers jours — 20%)</span>
                  </span>
                  <ProgressBar value={readinessData.components.consistency} tone="primary" label="Régularité" />
                </li>
              </ul>
              <p className="mt-4 text-caption text-text-tertiary">
                Score composite basé sur les 3 composantes ci-dessus.
              </p>
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState
                title="Pas encore de données suffisantes"
                description={`Complétez au moins ${readiness.data?.minAttemptsRequired ?? 5} sessions QCM/QCS pour obtenir un score de préparation.`}
                action={{ label: "Lancer une session", href: "/qcm" }}
              />
            </div>
          )}
        </section>

        {/* 5. Recent activity */}
        <section aria-label="Activité récente" className="mx-auto mt-section-gap max-w-4xl">
          <h2 className="font-display text-h2 font-semibold text-text-primary">Activité récente</h2>
          <WeeklyActivity
            className="mt-4"
            items={(progress.data?.recentActivity ?? []).map((item, index) => {
              if (item.type === "session") {
                const scoreLabel = item.score === null ? "non noté" : `${item.score}%`;
                return {
                  key: `session-${index}`,
                  href: `/sessions/${item.id}/results`,
                  title: item.name,
                  subtitle: `Session ${item.mode === "practice" ? "d'entraînement" : "d'examen"} · ${scoreLabel}`,
                  timestamp: formatDate(item.at),
                };
              }
              return {
                key: `lesson-${index}`,
                href: `/lessons/${item.lessonId}`,
                title: item.title,
                subtitle: "Leçon consultée",
                timestamp: formatDate(item.at),
              };
            })}
            loading={progress.isLoading}
            error={progress.error ? `Impossible de charger l'activité. ${progress.error}` : null}
            onRetry={progress.refetch}
            emptyTitle="Aucune activité pour l'instant"
            emptyDescription="Commencez par créer une session QCM pour suivre votre progression ici."
            emptyAction={{ label: "Créer une session QCM", href: "/qcm" }}
          />
        </section>

        {/* Global empty state — no curriculum, no activity, nothing */}
        {showEmpty && user.yearId && (
          <section aria-label="Commencer à étudier" className="mx-auto mt-section-gap max-w-4xl">
            <EmptyState
              title="Commencez votre préparation"
              description="Vous n'avez pas encore de progression. Lancez votre première session QCM ou explorez les cours disponibles."
              action={{ label: "Créer une session QCM", href: "/qcm" }}
            />
          </section>
        )}
        {showEmpty && !user.yearId && (
          <section aria-label="Commencer à étudier" className="mx-auto mt-section-gap max-w-4xl">
            <EmptyState
              title="Commencez votre préparation"
              description="Choisissez votre filière et votre année pour accéder au programme, puis lancez votre première session QCM."
              action={{ label: "Choisir ma filière", href: "/faculties" }}
            />
          </section>
        )}
      </main>

      <Footer />
    </>
  );
}
