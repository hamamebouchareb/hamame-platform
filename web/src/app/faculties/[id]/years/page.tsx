"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { useAuthedPage } from "@/lib/useAuthedPage";
import { useApiResource } from "@/lib/useApiResource";
import { useApiList } from "@/lib/useApiList";
import {
  CourseCard,
  CurriculumToolbar,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  PageShell,
} from "@/components";
import type { CurriculumModule, Faculty, Year } from "@/lib/types";

type SortValue = "az" | "za" | "recent";

export default function FacultyYearsPage() {
  const params = useParams<{ id: string }>();
  const { user, isHydrated, handleLogout } = useAuthedPage();
  const { t } = useLanguage();

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortValue>("az");

  const { data, error, isLoading, refetch } = useApiResource<{ years: Year[] }>(
    isHydrated && user ? `/faculties/${params.id}/years` : null
  );
  const { data: facultiesData } = useApiResource<{ faculties: Faculty[] }>(
    isHydrated && user ? "/faculties" : null
  );

  const years = useMemo(() => data?.years ?? [], [data]);
  const modulePaths = years.map((year) => `/years/${year.id}/modules`);
  const { data: moduleBatches, isLoading: modulesLoading } = useApiList<{ modules: CurriculumModule[] }>(
    isHydrated && user && years.length > 0 ? modulePaths : null
  );

  const moduleCountByYear = useMemo(() => {
    const map = new Map<string, number>();
    years.forEach((year, index) => {
      const modules = moduleBatches[index]?.modules;
      if (modules) map.set(year.id, modules.length);
    });
    return map;
  }, [years, moduleBatches]);

  const facultyName = facultiesData?.faculties.find((f) => f.id === params.id)?.name;

  const normalizedSearch = search.trim().toLocaleLowerCase("fr");
  const visibleYears = useMemo(() => {
    const filtered = years.filter((year) =>
      normalizedSearch === "" ? true : year.label.toLocaleLowerCase("fr").includes(normalizedSearch)
    );
    const sorted = [...filtered].sort((a, b) => {
      if (sort === "recent") return b.createdAt.localeCompare(a.createdAt);
      const direction = sort === "za" ? -1 : 1;
      return direction * a.label.localeCompare(b.label, "fr", { sensitivity: "base" });
    });
    return sorted;
  }, [years, normalizedSearch, sort]);

  return (
    <PageShell
      user={user}
      isHydrated={isHydrated}
      onLogout={handleLogout}
      width="content"
      back={{ href: "/faculties", label: t("nav.library") }}
      kicker={facultyName ?? t("years.trackFallback")}
      title={facultyName ? t("years.titleWith", { name: facultyName }) : t("years.title")}
      titleSize="hero"
      description={t("years.subtitle")}
    >
      {(authedUser) => {
        const isMyYear = (year: Year) => year.id === authedUser.yearId;
        return (
          <>
            <CurriculumToolbar
              className="mt-section-gap"
              resultCount={visibleYears.length}
              totalCount={years.length}
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder={t("years.searchPh")}
              sortValue={sort}
              onSortChange={(value) => setSort(value as SortValue)}
              sortOptions={[
                { value: "az", label: t("years.sortAz") },
                { value: "za", label: t("years.sortZa") },
                { value: "recent", label: t("years.sortRecent") },
              ]}
            />

            {isLoading ? (
              <div className="mt-4 grid gap-card-gap sm:grid-cols-2">
                {[0, 1].map((i) => (
                  <LoadingSkeleton key={i} className="h-28 w-full rounded-card" ariaLabel={i === 0 ? t("years.loading") : undefined} />
                ))}
              </div>
            ) : null}

            {error ? <ErrorState className="mt-4" message={error} onRetry={refetch} /> : null}

            {!isLoading && !error && years.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  title={t("years.empty")}
                  description={t("years.emptyDesc")}
                  action={{ label: t("years.backToLibrary"), href: "/faculties" }}
                />
              </div>
            ) : null}

            {!isLoading && !error && years.length > 0 && visibleYears.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  title={t("years.noMatch")}
                  description={t("years.noMatchDesc")}
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

            <ul className="mt-4 grid gap-card-gap sm:grid-cols-2">
              {visibleYears.map((year) => {
                const moduleCount = moduleCountByYear.get(year.id);
                return (
                  <li key={year.id}>
                    <CourseCard
                      href={`/years/${year.id}/modules`}
                      title={year.label}
                      tone="library"
                      description={
                        modulesLoading && moduleCount === undefined
                          ? t("years.loadingModules")
                          : t((moduleCount ?? 0) === 1 ? "years.modulesOne" : "years.modulesMany", { count: moduleCount ?? 0 })
                      }
                      actionLabel={t("library.explore")}
                      meta={
                        isMyYear(year) ? (
                          <span className="rounded-pill border border-accent-library/40 bg-accent-library/15 px-2 py-0.5 font-medium text-accent-soft">
                            {t("years.myYear")}
                          </span>
                        ) : (
                          <span className="rounded-pill border border-success/40 bg-success/15 px-2 py-0.5 font-medium text-success">
                            {t("library.availableBadge")}
                          </span>
                        )
                      }
                    />
                  </li>
                );
              })}
            </ul>

            <p className="mt-6 text-center text-meta text-text-tertiary">
              {t("years.footnote")}
            </p>
          </>
        );
      }}
    </PageShell>
  );
}
