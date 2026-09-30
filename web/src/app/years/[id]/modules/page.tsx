"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useApiResource } from "@/lib/useApiResource";
import { useApiList } from "@/lib/useApiList";
import { AppHeader, Breadcrumb, Footer, CourseCard, CurriculumToolbar, EmptyState, LoadingSkeleton, curriculumTrail } from "@/components";
import type { CurriculumContext, CurriculumModule, ModuleProgress, Unit } from "@/lib/types";

type SortValue = "az" | "za" | "progress-desc" | "progress-asc";
type FilterValue = "all" | "not_started" | "in_progress" | "completed";

export default function YearModulesPage() {
  const { logout } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { user, isHydrated } = useRequireAuth();
  const { t } = useLanguage();

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortValue>("progress-desc");
  const [filter, setFilter] = useState<FilterValue>("all");

  const { data, error, isLoading, refetch } = useApiResource<{ modules: CurriculumModule[]; context?: CurriculumContext }>(
    isHydrated && user ? `/years/${params.id}/modules` : null
  );

  const modules = useMemo(() => data?.modules ?? [], [data]);
  const progressPaths = modules.map((m) => `/progress/modules/${m.id}`);
  const unitPaths = modules.map((m) => `/modules/${m.id}/units`);
  const { data: progressBatches, isLoading: progressLoading } = useApiList<ModuleProgress>(progressPaths);
  const { data: unitBatches, isLoading: unitsLoading } = useApiList<{ units: Unit[] }>(unitPaths);

  const progressByModule = useMemo(() => {
    const map = new Map<string, ModuleProgress>();
    modules.forEach((module, index) => {
      const progress = progressBatches[index];
      if (progress) map.set(module.id, progress);
    });
    return map;
  }, [modules, progressBatches]);

  const unitCountByModule = useMemo(() => {
    const map = new Map<string, number>();
    modules.forEach((module, index) => {
      const units = unitBatches[index]?.units;
      if (units) map.set(module.id, units.length);
    });
    return map;
  }, [modules, unitBatches]);

  const normalizedSearch = search.trim().toLocaleLowerCase("fr");
  const visibleModules = useMemo(() => {
    const filtered = modules.filter((module) => {
      if (normalizedSearch !== "" && !module.name.toLocaleLowerCase("fr").includes(normalizedSearch)) return false;
      const percentage = progressByModule.get(module.id)?.percentage ?? 0;
      if (filter === "not_started" && percentage !== 0) return false;
      if (filter === "in_progress" && !(percentage > 0 && percentage < 100)) return false;
      if (filter === "completed" && percentage !== 100) return false;
      return true;
    });
    return [...filtered].sort((a, b) => {
      const pa = progressByModule.get(a.id)?.percentage ?? 0;
      const pb = progressByModule.get(b.id)?.percentage ?? 0;
      if (sort === "progress-desc") return pb - pa;
      if (sort === "progress-asc") return pa - pb;
      if (sort === "za") return -1 * a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
      return a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
    });
  }, [modules, normalizedSearch, sort, filter, progressByModule]);

  const totalLessons = modules.reduce((sum, module) => sum + (progressByModule.get(module.id)?.totalLessons ?? 0), 0);

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
          <p className="text-meta font-medium uppercase tracking-wide text-accent-soft">{t("modules.kicker")}</p>
          <h1 className="mt-1 font-display text-h1 font-bold leading-tight text-text-primary md:text-hero">
            {t("modules.title")}
          </h1>
          <p className="mt-2 text-body text-text-secondary">
            {isLoading
              ? t("modules.loadingEllipsis")
              : `${t(modules.length === 1 ? "modules.countOne" : "modules.countMany", { count: modules.length })}${!progressLoading && totalLessons > 0 ? ` · ${t(totalLessons === 1 ? "modules.lessonsOne" : "modules.lessonsMany", { count: totalLessons })}` : ""}${t("modules.sortedSuffix")}`}
          </p>
        </header>

        <CurriculumToolbar
          className="mt-section-gap"
          resultCount={visibleModules.length}
          totalCount={modules.length}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={t("modules.searchPh")}
          sortValue={sort}
          onSortChange={(value) => setSort(value as SortValue)}
          sortOptions={[
            { value: "progress-desc", label: t("modules.sortProgressDesc") },
            { value: "progress-asc", label: t("modules.sortProgressAsc") },
            { value: "az", label: t("years.sortAz") },
            { value: "za", label: t("years.sortZa") },
          ]}
          filterValue={filter}
          onFilterChange={(value) => setFilter(value as FilterValue)}
          filterOptions={[
            { value: "all", label: t("modules.filterAll") },
            { value: "not_started", label: t("modules.filterNotStarted") },
            { value: "in_progress", label: t("dashboard.inProgress") },
            { value: "completed", label: t("modules.filterCompleted") },
          ]}
        />

        {isLoading ? (
          <div className="mt-4 flex flex-col gap-card-gap">
            {[0, 1, 2].map((i) => (
              <LoadingSkeleton key={i} className="h-24 w-full rounded-card" ariaLabel={i === 0 ? t("modules.loading") : undefined} />
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

        {!isLoading && !error && modules.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title={t("modules.empty")}
              description={t("modules.emptyDesc")}
              action={{ label: t("years.backToLibrary"), href: "/faculties" }}
            />
          </div>
        ) : null}

        {!isLoading && !error && modules.length > 0 && visibleModules.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title={t("modules.noMatch")}
              description={t("modules.noMatchDesc")}
              action={{
                label: t("years.resetFilters"),
                onClick: () => {
                  setSearch("");
                  setFilter("all");
                  setSort("progress-desc");
                },
              }}
            />
          </div>
        ) : null}

        <ul className="mt-4 grid gap-card-gap">
          {visibleModules.map((module) => {
            const progress = progressByModule.get(module.id);
            const unitCount = unitCountByModule.get(module.id);
            const percentage = progress?.percentage ?? 0;
            const statusLabel = percentage === 100 ? t("modules.done") : percentage > 0 ? t("dashboard.inProgress") : t("modules.notStarted");
            return (
              <li key={module.id}>
                <CourseCard
                  href={`/modules/${module.id}/units`}
                  title={module.name}
                  tone="library"
                  progressPct={percentage}
                  progressLoading={progressLoading}
                  description={
                    progressLoading || unitsLoading
                      ? t("builder.loadingShort")
                      : `${t((progress?.totalLessons ?? 0) === 1 ? "modules.lessonsOne" : "modules.lessonsMany", { count: progress?.totalLessons ?? 0 })} · ${t((unitCount ?? 0) === 1 ? "modules.unitsOne" : "modules.unitsMany", { count: unitCount ?? 0 })}`
                  }
                  actionLabel={percentage === 100 ? t("modules.review") : percentage > 0 ? t("modules.resume") : t("modules.start")}
                  meta={
                    <span
                      className={
                        percentage === 100
                          ? "rounded-pill border border-success/40 bg-success/15 px-2 py-0.5 font-medium text-success"
                          : percentage > 0
                            ? "rounded-pill border border-accent-library/40 bg-accent-library/15 px-2 py-0.5 font-medium text-accent-soft"
                            : "rounded-pill border border-text-tertiary/40 bg-surface-3 px-2 py-0.5 font-medium text-text-tertiary"
                      }
                    >
                      {statusLabel}
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
