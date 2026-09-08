"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useApiResource } from "@/lib/useApiResource";
import { useApiList } from "@/lib/useApiList";
import { AppHeader, Footer, CourseCard, CurriculumToolbar, EmptyState, LoadingSkeleton } from "@/components";
import type { LessonSummary, Unit } from "@/lib/types";

function plural(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

interface QuestionListInfo {
  pagination: { total: number };
}

type SortValue = "az" | "za" | "question-desc";

export default function ModuleUnitsPage() {
  const { logout } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { user, isHydrated } = useRequireAuth();

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortValue>("az");

  const { data, error, isLoading, refetch } = useApiResource<{ units: Unit[] }>(
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
          <p className="text-meta font-medium uppercase tracking-wide text-accent-soft">Unités</p>
          <h1 className="mt-1 font-display text-hero font-bold leading-tight text-text-primary">
            Unités du module
          </h1>
          <p className="mt-2 text-body text-text-secondary">
            {isLoading ? "Chargement des unités…" : `${plural(units.length, "unité")} de cours, avec les QCM associés à chacune.`}
          </p>
        </header>

        <CurriculumToolbar
          className="mt-section-gap"
          resultCount={visibleUnits.length}
          totalCount={units.length}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Rechercher une unité…"
          sortValue={sort}
          onSortChange={(value) => setSort(value as SortValue)}
          sortOptions={[
            { value: "az", label: "Tri alphabétique A → Z" },
            { value: "za", label: "Tri alphabétique Z → A" },
            { value: "question-desc", label: "Plus de QCM d'abord" },
          ]}
        />

        {isLoading ? (
          <div className="mt-4 flex flex-col gap-card-gap">
            {[0, 1, 2].map((i) => (
              <LoadingSkeleton key={i} className="h-24 w-full rounded-card" ariaLabel={i === 0 ? "Chargement des unités" : undefined} />
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

        {!isLoading && !error && units.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="Aucune unité pour ce module"
              description="Ce module n'a pas encore d'unités publiées."
              action={{ label: "Retour à la bibliothèque", href: "/faculties" }}
            />
          </div>
        ) : null}

        {!isLoading && !error && units.length > 0 && visibleUnits.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="Aucune unité ne correspond"
              description="Modifiez la recherche ou réinitialisez les filtres pour revoir toutes les unités."
              action={{
                label: "Réinitialiser les filtres",
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
                      ? "Chargement des leçons et QCM…"
                      : `${plural(lessonCount ?? 0, "leçon")} · ${plural(questionCount ?? 0, "question QCM")}`
                  }
                  actionLabel="Explorer"
                  meta={
                    <span className="rounded-pill border border-success/40 bg-success/15 px-2 py-0.5 font-medium text-success">
                      Disponible
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
