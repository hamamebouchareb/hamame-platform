"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useApiResource } from "@/lib/useApiResource";
import {
  AppHeader,
  EmptyState,
  Footer,
  CourseCard,
  LoadingSkeleton,
} from "@/components";

interface ResourceItem {
  id: string;
  title: string;
  type: string;
  fileUrl: string;
  sourceLabel: string | null;
  facultyId: string | null;
  yearId: string | null;
}

interface FacultyOption {
  id: string;
  name: string;
}

const TYPE_OPTIONS = [
  { value: "official_drive", label: "Drive officiel" },
  { value: "reference", label: "Référence" },
  { value: "past_exam", label: "Ancien examen" },
  { value: "other", label: "Autre" },
] as const;

function typeLabel(type: string): string {
  switch (type) {
    case "official_drive":
      return "Drive officiel";
    case "reference":
      return "Référence";
    case "past_exam":
      return "Ancien examen";
    case "other":
      return "Autre";
    default:
      return type;
  }
}

function ResourcesContent() {
  const { logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isHydrated } = useRequireAuth();

  const facultyFilter = searchParams.get("faculty") ?? "";
  const yearFilter = searchParams.get("year") ?? "";
  const typeFilter = searchParams.get("type") ?? "";

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (facultyFilter) p.set("faculty", facultyFilter);
    if (yearFilter) p.set("year", yearFilter);
    if (typeFilter) p.set("type", typeFilter);
    return p.toString();
  }, [facultyFilter, yearFilter, typeFilter]);

  const facultiesRes = useApiResource<{ faculties: FacultyOption[] }>(
    isHydrated && user ? "/faculties" : null
  );
  const resourcesRes = useApiResource<{ resources: ResourceItem[] }>(
    isHydrated && user ? `/resources${query ? `?${query}` : ""}` : null
  );

  const faculties = facultiesRes.data?.faculties ?? [];
  const resources = resourcesRes.data?.resources ?? [];

  const applyFilters = useCallback(
    (next: { faculty?: string; year?: string; type?: string }) => {
      const params = new URLSearchParams();
      if (next.faculty) params.set("faculty", next.faculty);
      if (next.year) params.set("year", next.year);
      if (next.type) params.set("type", next.type);
      router.replace(`/resources${params.toString() ? `?${params.toString()}` : ""}`);
    },
    [router]
  );

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
        <div className="flex flex-col gap-section-gap">
          <div className="rounded-card border border-border bg-surface-1 p-card-padding shadow-card">
            <h1 className="font-display text-h2 font-semibold text-text-primary">Hamame Drive</h1>
            <p className="mt-1 text-body text-text-secondary">
              Ressources officielles et références par faculté et année.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex flex-col gap-1 text-meta font-medium text-text-secondary">
                Faculté
                <select
                  value={facultyFilter}
                  onChange={(e) =>
                    applyFilters({ faculty: e.target.value, year: yearFilter, type: typeFilter })
                  }
                  className="rounded-control border border-border bg-surface-1 px-3 py-2 text-body text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  <option value="">Toutes les facultés</option>
                  {faculties.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-meta font-medium text-text-secondary">
                Année
                <select
                  value={yearFilter}
                  onChange={(e) =>
                    applyFilters({ faculty: facultyFilter, year: e.target.value, type: typeFilter })
                  }
                  className="rounded-control border border-border bg-surface-1 px-3 py-2 text-body text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  <option value="">Toutes les années</option>
                  <option value="00000000-0000-0000-0000-000000000020">Year 1</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 text-meta font-medium text-text-secondary">
                Type
                <select
                  value={typeFilter}
                  onChange={(e) =>
                    applyFilters({ faculty: facultyFilter, year: yearFilter, type: e.target.value })
                  }
                  className="rounded-control border border-border bg-surface-1 px-3 py-2 text-body text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  <option value="">Tous types</option>
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => applyFilters({})}
                className="self-end rounded-control border border-border bg-surface-2 px-3 py-2 text-meta font-medium text-text-primary transition hover:bg-surface-2"
              >
                Réinitialiser les filtres
              </button>
            </div>
          </div>

          {resourcesRes.isLoading ? (
            <LoadingSkeleton className="h-64 w-full rounded-card" ariaLabel="Chargement des ressources" />
          ) : resourcesRes.error ? (
            <div className="rounded-card border border-danger bg-surface-1 p-card-padding">
              <p role="alert" className="text-body text-danger">
                {resourcesRes.error}
              </p>
              <button
                type="button"
                onClick={resourcesRes.refetch}
                className="mt-3 inline-flex min-h-touch-target w-full items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2 sm:w-auto"
              >
                Réessayer
              </button>
            </div>
          ) : resources.length === 0 ? (
            <div data-empty-state>
              <EmptyState
                title="Aucune ressource"
                description="Aucune ressource ne correspond aux filtres sélectionnés, ou le hub de ressources est encore vide."
                action={{ label: "Parcourir le programme", href: "/faculties" }}
              />
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-card-gap sm:grid-cols-2 lg:grid-cols-3">
              {resources.map((resource) => (
                <li key={resource.id}>
                  <CourseCard
                    href={`/resources/${resource.id}`}
                    title={resource.title}
                    description={
                      resource.sourceLabel
                        ? `${resource.sourceLabel} · ${typeLabel(resource.type)}`
                        : typeLabel(resource.type)
                    }
                    tone={resource.type === "official_drive" ? "primary" : "library"}
                    actionLabel={resource.type === "official_drive" ? "Officiel" : undefined}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      <Footer />
    </>
  );
}

export default function ResourcesPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center px-card-padding">
          <LoadingSkeleton className="h-8 w-48" ariaLabel="Chargement" />
        </main>
      }
    >
      <ResourcesContent />
    </Suspense>
  );
}