"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useApiResource } from "@/lib/useApiResource";
import { useApiList } from "@/lib/useApiList";
import { AppHeader, Breadcrumb, Footer, CourseCard, CurriculumToolbar, EmptyState, LoadingSkeleton, curriculumTrail } from "@/components";
import type { CurriculumContext, LessonSummary, Unit } from "@/lib/types";

interface QuestionListInfo {
  pagination: { total: number };
}

type SortValue = "az" | "za" | "question-desc";

export default function ModuleUnitsPage() {
  const { logout } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { user, isHydrated } = useRequireAuth();
  const { t } = useLanguage();

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortValue>("az");

  const { data, error, isLoading, refetch } = useApiResource<{ units: Unit[]; context?: CurriculumContext }>(
    isHydrated && user ? `/modules/${params.id}/units` : null
  );

  const units = useMemo(() => data?.units ?? [], [data]);
  const lessonPaths = units.map((u) => `/units/${u.id}/lessons`);
  const questionPaths = units.map((u) => `/questions?unitId=${u.id}&limit=1`);
  const { data: lessonBatches, isLoading: lessonsLoading } = useApiList<{ lessons: LessonSummary[] }>(lessonPaths);
  const { data: questionBatches, isLoading: questionsLoading } = useApiList<QuestionListInfo>(questionPaths);

  const lessonCountByUnit = useMemo(() => {
    const map = new Map<string, number>();
    units.forEach((unit, index) => {
      const lessons = lessonBatches[index]?.lessons;
      if (lessons) map.set(unit.id, lessons.length);
    });
    return map;
  }, [units, lessonBatches]);

  const questionCountByUnit = useMemo(() => {
    const map = new Map<string, number>();
    units.forEach((unit, index) => {
      const total = questionBatches[index]?.pagination.total;
      if (total !== undefined) map.set(unit.id, total);
    });
    return map;
  }, [units, questionBatches]);

  const normalizedSearch = search.trim().toLocaleLowerCase("fr");
  const visibleUnits = useMemo(() => {
    const filtered = units.filter((unit) =>
      normalizedSearch === "" ? true : unit.name.toLocaleLowerCase("fr").includes(normalizedSearch)
    );
    return [...filtered].sort((a, b) => {
      if (sort === "question-desc") {
        return (questionCountByUnit.get(b.id) ?? 0) - (questionCountByUnit.get(a.id) ?? 0);
      }
      if (sort === "za") return -1 * a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
      return a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
    });
  }, [units, normalizedSearch, sort, questionCountByUnit]);

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
        <Breadcrumb label={t("common.breadcrumb")} items={curriculumTrail(t("nav.library"), data?.context)} />

        <header className="mt-2">
          <p className="text-meta font-medium uppercase tracking-wide text-accent-soft">{t("units.kicker")}</p>
          <h1 className="mt-1 font-display text-h1 font-bold leading-tight text-text-primary md:text-hero">
            {t("units.title")}
          </h1>
          <p className="mt-2 text-body text-text-secondary">
            {isLoading ? t("units.summaryLoading") : t(units.length === 1 ? "units.summaryOne" : "units.summaryMany", { count: units.length })}
          </p>
        </header>

        <CurriculumToolbar
          className="mt-section-gap"
          resultCount={visibleUnits.length}
          totalCount={units.length}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={t("units.searchPh")}
          sortValue={sort}
          onSortChange={(value) => setSort(value as SortValue)}
          sortOptions={[
            { value: "az", label: t("years.sortAz") },
            { value: "za", label: t("years.sortZa") },
            { value: "question-desc", label: t("units.sortQcm") },
          ]}
        />

        {isLoading ? (
          <div className="mt-4 flex flex-col gap-card-gap">
            {[0, 1, 2].map((i) => (
              <LoadingSkeleton key={i} className="h-24 w-full rounded-card" ariaLabel={i === 0 ? t("units.loading") : undefined} />
            ))}
          </div>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-card border border-danger bg-surface-1 p-card-padding">
            <p role="alert" className="text-body text-danger">
              {error}
            </p>
            <button
              type="button"
              onClick={refetch}
              className="mt-3 inline-flex min-h-touch-target w-full items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2 sm:w-auto"
            >
              {t("common.retry")}
            </button>
          </div>
        ) : null}

        {!isLoading && !error && units.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title={t("units.empty")}
              description={t("units.emptyDesc")}
              action={{ label: t("years.backToLibrary"), href: "/faculties" }}
            />
          </div>
        ) : null}

        {!isLoading && !error && units.length > 0 && visibleUnits.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title={t("units.noMatch")}
              description={t("units.noMatchDesc")}
              action={{
                label: t("years.resetFilters"),
                onClick: () => {
                  setSearch("");
                  setSort("az");
                },
              }}
            />
          </div>
        ) : null}

        <ul className="mt-4 grid gap-card-gap">
          {visibleUnits.map((unit) => {
            const lessonCount = lessonCountByUnit.get(unit.id);
            const questionCount = questionCountByUnit.get(unit.id);
            const loadingMeta = lessonsLoading || questionsLoading || lessonCount === undefined || questionCount === undefined;
            return (
              <li key={unit.id}>
                <CourseCard
                  href={`/units/${unit.id}`}
                  title={unit.name}
                  tone="library"
                  description={
                    loadingMeta
                      ? t("units.cardLoading")
                      : `${t((lessonCount ?? 0) === 1 ? "modules.lessonsOne" : "modules.lessonsMany", { count: lessonCount ?? 0 })} · ${t((questionCount ?? 0) === 1 ? "units.qcmOne" : "units.qcmMany", { count: questionCount ?? 0 })}`
                  }
                  actionLabel={t("library.explore")}
                  meta={
                    <span className="rounded-pill border border-success/40 bg-success/15 px-2 py-0.5 font-medium text-success">
                      {t("library.availableBadge")}
                    </span>
                  }
                />
              </li>
            );
          })}
        </ul>
      </main>

      <Footer />
    </>
  );
}
