"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useApiResource } from "@/lib/useApiResource";
import { useApiList } from "@/lib/useApiList";
import { AppHeader, Footer, CourseCard, CurriculumToolbar, EmptyState, LoadingSkeleton } from "@/components";
import type { CurriculumModule, Faculty, Year } from "@/lib/types";

type SortValue = "az" | "za" | "recent";

export default function FacultyYearsPage() {
  const { logout } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { user, isHydrated } = useRequireAuth();
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

  const isMyYear = (year: Year) => year.id === user.yearId;

  return (
    <>
      <AppHeader user={user} onLogout={handleLogout} />

      <main className="mx-auto w-full max-w-4xl flex-1 px-card-padding py-section-gap">
        <Link
          href="/faculties"
          className="inline-flex min-h-touch-target items-center gap-1 text-meta font-medium text-text-secondary transition hover:text-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <span aria-hidden>←</span> {t("nav.library")}
        </Link>

        <header className="mt-2">
          <p className="text-meta font-medium uppercase tracking-wide text-accent-soft">
            {facultyName ?? t("years.trackFallback")}
          </p>
          <h1 className="mt-1 font-display text-hero font-bold leading-tight text-text-primary">
            {facultyName ? t("years.titleWith", { name: facultyName }) : t("years.title")}
          </h1>
          <p className="mt-2 text-body text-text-secondary">
            {t("years.subtitle")}
          </p>
        </header>

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
      </main>

      <Footer />
    </>
  );
}
