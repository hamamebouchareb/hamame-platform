"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useApiResource } from "@/lib/useApiResource";
import { useApiList } from "@/lib/useApiList";
import { AppHeader, Footer, CourseCard, CurriculumToolbar, EmptyState, LoadingSkeleton } from "@/components";
import type { CurriculumModule, ModuleProgress, Unit } from "@/lib/types";

function plural(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

type SortValue = "az" | "za" | "progress-desc" | "progress-asc";
type FilterValue = "all" | "not_started" | "in_progress" | "completed";

export default function YearModulesPage() {
  const { logout } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { user, isHydrated } = useRequireAuth();

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortValue>("progress-desc");
  const [filter, setFilter] = useState<FilterValue>("all");

  const { data, error, isLoading, refetch } = useApiResource<{ modules: CurriculumModule[] }>(
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
        <LoadingSkeleton className="h-8 w-48" ariaLabel="Chargement" />
      </main>
    );
  }

  return (
    <>
      <AppHeader user={user} onLogout={handleLogout} />

      <main className="mx-auto w-full max-w-4xl flex-1 px-card-padding py-section-gap">
        <Link
          href="/faculties"
          className="inline-flex min-h-touch-target items-center gap-1 text-meta font-medium text-text-secondary transition hover:text-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <span aria-hidden>←</span> Bibliothèque
        </Link>

        <header className="mt-2">
          <p className="text-meta font-medium uppercase tracking-wide text-accent-soft">Modules</p>
          <h1 className="mt-1 font-display text-hero font-bold leading-tight text-text-primary">
            Modules de votre année
          </h1>
          <p className="mt-2 text-body text-text-secondary">
            {isLoading
              ? "Chargement des modules…"
              : `${plural(modules.length, "module")}${!progressLoading && totalLessons > 0 ? ` · ${plural(totalLessons, "leçon")}` : ""} — trié par progression.`}
          </p>
        </header>

        <CurriculumToolbar
          className="mt-section-gap"
          resultCount={visibleModules.length}
          totalCount={modules.length}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Rechercher un module…"
          sortValue={sort}
          onSortChange={(value) => setSort(value as SortValue)}
          sortOptions={[
            { value: "progress-desc", label: "Progression (décroissante)" },
            { value: "progress-asc", label: "Progression (croissante)" },
            { value: "az", label: "Tri alphabétique A → Z" },
            { value: "za", label: "Tri alphabétique Z → A" },
          ]}
          filterValue={filter}
          onFilterChange={(value) => setFilter(value as FilterValue)}
          filterOptions={[
            { value: "all", label: "Tous les modules" },
            { value: "not_started", label: "Non commencés" },
            { value: "in_progress", label: "En cours" },
            { value: "completed", label: "Terminés" },
          ]}
        />

        {isLoading ? (
          <div className="mt-4 flex flex-col gap-card-gap">
            {[0, 1, 2].map((i) => (
              <LoadingSkeleton key={i} className="h-24 w-full rounded-card" ariaLabel={i === 0 ? "Chargement des modules" : undefined} />
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
              Réessayer
            </button>
          </div>
        ) : null}

        {!isLoading && !error && modules.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="Aucun module pour cette année"
              description="Cette année ne contient pas encore de modules publiés."
              action={{ label: "Retour à la bibliothèque", href: "/faculties" }}
            />
          </div>
        ) : null}

        {!isLoading && !error && modules.length > 0 && visibleModules.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="Aucun module ne correspond"
              description="Modifiez la recherche ou réinitialisez les filtres pour revoir tous les modules."
              action={{
                label: "Réinitialiser les filtres",
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
            const statusLabel = percentage === 100 ? "Terminé" : percentage > 0 ? "En cours" : "Non commencé";
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
                      ? "Chargement…"
                      : `${plural(progress?.totalLessons ?? 0, "leçon")} · ${plural(unitCount ?? 0, "unité")}`
                  }
                  actionLabel={percentage === 100 ? "Revoir" : percentage > 0 ? "Reprendre" : "Commencer"}
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
