"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useApiResource } from "@/lib/useApiResource";
import { apiFetch, ApiError } from "@/lib/api";
import { AppHeader, Breadcrumb, Footer, CourseCard, EmptyState, LoadingSkeleton, curriculumTrail } from "@/components";
import type { CurriculumContext, LessonSummary, SessionDetail } from "@/lib/types";

const SESSION_SIZE = 20;
const EXAM_TIME_LIMIT_SECONDS = 1200; // 20 minutes

type SessionMode = "practice" | "exam";

interface QuestionListInfo {
  pagination: { total: number };
}

export default function UnitDetailPage() {
  const { logout } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { user, isHydrated } = useRequireAuth();
  const { t } = useLanguage();
  const unitId = params.id;

  const [search, setSearch] = useState("");
  const [startingMode, setStartingMode] = useState<SessionMode | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const canFetch = isHydrated && !!user;
  const { data: lessonsData, error: lessonsError, isLoading: lessonsLoading, refetch: refetchLessons } = useApiResource<{
    lessons: LessonSummary[];
    context?: CurriculumContext;
  }>(canFetch ? `/units/${unitId}/lessons` : null);
  const { data: questionsData } = useApiResource<QuestionListInfo>(
    canFetch ? `/questions?unitId=${unitId}&limit=1` : null
  );

  const lessons = useMemo(() => lessonsData?.lessons ?? [], [lessonsData]);
  const questionCount = questionsData?.pagination.total ?? 0;
  const normalizedSearch = search.trim().toLocaleLowerCase("fr");
  const visibleLessons = useMemo(
    () =>
      lessons.filter((lesson) =>
        normalizedSearch === "" ? true : lesson.title.toLocaleLowerCase("fr").includes(normalizedSearch)
      ),
    [lessons, normalizedSearch]
  );

  async function startSession(mode: SessionMode) {
    setStartError(null);
    setStartingMode(mode);
    try {
      const { session } = await apiFetch<{ session: SessionDetail }>("/sessions", {
        method: "POST",
        body: JSON.stringify({
          name: mode === "practice" ? t("unitDetail.practiceName") : t("unitDetail.examName"),
          mode,
          unitIds: [unitId],
          size: SESSION_SIZE,
          ...(mode === "exam" ? { timeLimitSeconds: EXAM_TIME_LIMIT_SECONDS } : {}),
        }),
      });
      router.push(`/sessions/${session.id}`);
    } catch (err) {
      setStartError(err instanceof ApiError ? err.message : t("unitDetail.startError"));
      setStartingMode(null);
    }
  }

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

      <main className="mx-auto w-full max-w-4xl flex-1 px-card-padding py-section-gap">
        <Breadcrumb label={t("common.breadcrumb")} items={curriculumTrail(t("nav.library"), lessonsData?.context)} />

        <header className="mt-2">
          <p className="text-meta font-medium uppercase tracking-wide text-accent-soft">{t("unitDetail.kicker")}</p>
          <h1 className="mt-1 font-display text-h1 font-bold leading-tight text-text-primary md:text-hero">{t("unitDetail.title")}</h1>
          <p className="mt-2 text-body text-text-secondary">
            {lessonsLoading
              ? t("builder.loadingShort")
              : `${t(lessons.length === 1 ? "modules.lessonsOne" : "modules.lessonsMany", { count: lessons.length })}${questionCount > 0 ? ` · ${t(questionCount === 1 ? "units.qcmOne" : "units.qcmMany", { count: questionCount })}` : ""}`}
          </p>
        </header>

        <section aria-label={t("unitDetail.launchTitle")} className="mt-section-gap">
          <h2 className="font-display text-h3 font-semibold text-text-primary">{t("unitDetail.launchTitle")}</h2>
          <div className="mt-3 grid gap-card-gap sm:grid-cols-2">
            <button
              type="button"
              onClick={() => startSession("practice")}
              disabled={startingMode !== null}
              className="inline-flex min-h-touch-target items-center justify-center gap-2 rounded-control bg-accent-library px-5 text-body font-semibold text-on-accent shadow-glow-library transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
            >
              {startingMode === "practice" ? t("unitDetail.starting") : t("unitDetail.practiceBtn")}
            </button>
            <button
              type="button"
              onClick={() => startSession("exam")}
              disabled={startingMode !== null}
              className="inline-flex min-h-touch-target items-center justify-center gap-2 rounded-control border border-accent-secondary/50 bg-accent-secondary/10 px-5 text-body font-semibold text-accent-soft transition hover:bg-accent-secondary/20 active:scale-[0.98] disabled:opacity-60"
            >
              {startingMode === "exam" ? t("unitDetail.starting") : t("unitDetail.examBtn")}
            </button>
          </div>
          {startError && (
            <p role="alert" className="mt-3 rounded-panel border border-danger/30 bg-danger/10 px-3 py-2 text-meta text-danger">
              {startError}
            </p>
          )}
        </section>

        <section aria-label={t("unitDetail.lessonsAria")} className="mt-section-gap">
          <label className="relative block max-w-md">
            <span className="sr-only">{t("unitDetail.searchSr")}</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("unitDetail.searchPh")}
              className="h-11 w-full rounded-input border border-border bg-surface-2 pl-10 pr-3 text-body text-text-primary placeholder:text-text-tertiary transition focus:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            />
            <svg
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.5" y2="16.5" />
            </svg>
          </label>

          {lessonsLoading ? (
            <div className="mt-4 flex flex-col gap-card-gap">
              {[0, 1, 2].map((i) => (
                <LoadingSkeleton key={i} className="h-20 w-full rounded-card" ariaLabel={i === 0 ? t("unitDetail.loading") : undefined} />
              ))}
            </div>
          ) : null}
          {lessonsError ? (
            <div className="mt-4 rounded-card border border-danger bg-surface-1 p-card-padding">
              <p role="alert" className="text-body text-danger">
                {lessonsError}
              </p>
              <button
                type="button"
                onClick={refetchLessons}
                className="mt-3 inline-flex min-h-touch-target w-full items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2 sm:w-auto"
              >
                {t("common.retry")}
              </button>
            </div>
          ) : null}
          {!lessonsLoading && !lessonsError && lessons.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title={t("unitDetail.empty")}
                description={t("unitDetail.emptyDesc")}
                action={{ label: t("dashboard.createQcm"), href: "/qcm" }}
              />
            </div>
          ) : null}
          {!lessonsLoading && !lessonsError && lessons.length > 0 && visibleLessons.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title={t("unitDetail.noMatch")}
                description={t("unitDetail.noMatchDesc")}
                action={{
                  label: t("unitDetail.resetSearch"),
                  onClick: () => setSearch(""),
                }}
              />
            </div>
          ) : null}

          <ul className="mt-4 flex flex-col gap-card-gap">
            {visibleLessons.map((lesson) => (
              <li key={lesson.id}>
                <CourseCard
                  href={`/lessons/${lesson.id}`}
                  title={lesson.title}
                  tone="library"
                  actionLabel={t("modules.start")}
                  meta={
                    <span
                      className={
                        lesson.contentTier === "hamame_plus"
                          ? "rounded-pill border border-accent-secondary/40 bg-accent-secondary/15 px-2 py-0.5 font-medium text-accent-soft"
                          : "rounded-pill border border-success/40 bg-success/15 px-2 py-0.5 font-medium text-success"
                      }
                    >
                      {lesson.contentTier === "hamame_plus" ? "Hamame+" : t("unitDetail.tierOfficial")}
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      </main>

      <Footer />
    </>
  );
}
