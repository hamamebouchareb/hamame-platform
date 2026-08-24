"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useApiResource } from "@/lib/useApiResource";
import { useApiList } from "@/lib/useApiList";
import { AppHeader, Footer, CourseCard, CurriculumToolbar } from "@/components";
import type { CurriculumModule, Faculty, Year } from "@/lib/types";

const HEADER_NAV = [
  { href: "/dashboard", label: "Tableau de bord" },
  { href: "/faculties", label: "Bibliothèque", active: true },
  { href: "/qcm", label: "QCM" },
  { href: "/notes", label: "Notes" },
  { href: "/subscription", label: "Abonnement" },
];

function plural(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

type SortValue = "az" | "za" | "recent";

export default function FacultyYearsPage() {
  const { logout } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { user, isHydrated } = useRequireAuth();

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortValue>("az");

  const { data, error, isLoading } = useApiResource<{ years: Year[] }>(
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
        <p className="text-meta text-text-secondary">Chargement...</p>
      </main>
    );
  }

  const isMyYear = (year: Year) => year.id === user.yearId;

  return (
    <>
      <AppHeader user={user} onLogout={handleLogout} nav={HEADER_NAV} />

      <main className="mx-auto w-full max-w-4xl flex-1 px-card-padding py-section-gap">
        <Link
          href="/faculties"
          className="inline-flex min-h-touch-target items-center gap-1 text-meta font-medium text-text-secondary transition hover:text-accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <span aria-hidden>←</span> Bibliothèque
        </Link>

        <header className="mt-2">
          <p className="text-meta font-medium uppercase tracking-wide text-accent-library">
            {facultyName ?? "Filière"}
          </p>
          <h1 className="mt-1 font-display text-hero font-bold leading-tight text-text-primary">
            {facultyName ? `${facultyName} — Années` : "Années"}
          </h1>
          <p className="mt-2 text-body text-text-secondary">
            Choisissez votre année pour retrouver les modules du programme.
          </p>
        </header>

        <CurriculumToolbar
          className="mt-section-gap"
          resultCount={visibleYears.length}
          totalCount={years.length}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Rechercher une année…"
          sortValue={sort}
          onSortChange={(value) => setSort(value as SortValue)}
          sortOptions={[
            { value: "az", label: "Tri alphabétique A → Z" },
            { value: "za", label: "Tri alphabétique Z → A" },
            { value: "recent", label: "Plus récentes" },
          ]}
        />

        {isLoading && <p className="mt-4 text-meta text-text-secondary">Chargement des années...</p>}
        {error && (
          <p role="alert" className="mt-4 rounded-panel border border-danger/30 bg-danger/10 px-3 py-2 text-meta text-danger">
            {error}
          </p>
        )}

        {!isLoading && !error && years.length === 0 && (
          <p className="mt-4 text-meta text-text-secondary">
            Aucune année n&apos;est disponible pour cette faculté pour le moment.
          </p>
        )}

        {!isLoading && !error && years.length > 0 && visibleYears.length === 0 && (
          <p className="mt-4 text-meta text-text-secondary">Aucune année ne correspond à ces critères.</p>
        )}

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
                      ? "Chargement des modules…"
                      : plural(moduleCount ?? 0, "module")
                  }
                  actionLabel="Explorer"
                  meta={
                    isMyYear(year) ? (
                      <span className="rounded-pill border border-accent-library/40 bg-accent-library/15 px-2 py-0.5 font-medium text-accent-library">
                        Votre année
                      </span>
                    ) : (
                      <span className="rounded-pill border border-success/40 bg-success/15 px-2 py-0.5 font-medium text-success">
                        Disponible
                      </span>
                    )
                  }
                />
              </li>
            );
          })}
        </ul>

        <p className="mt-6 text-center text-meta text-text-tertiary">
          Sélectionnez votre année pour ne pas la perdre de vue : vos modules suivent votre progression.
        </p>
      </main>

      <Footer />
    </>
  );
}
