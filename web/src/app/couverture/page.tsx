"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useApiResource } from "@/lib/useApiResource";
import { AppHeader, BackLink, EmptyState, Footer, LoadingSkeleton } from "@/components";
import type { Faculty, Year } from "@/lib/types";

interface CoverageModule {
  moduleId: string;
  moduleName: string;
  yearLabel: string;
  facultyName: string;
  questions: number;
}

interface CoverageResponse {
  total: number;
  modules: CoverageModule[];
}

const selectClass =
  "min-h-touch-target w-full rounded-input border border-border bg-surface-2 px-4 text-body text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50";

export default function CoveragePage() {
  const router = useRouter();
  const { logout } = useAuth();
  const { user, isHydrated } = useRequireAuth();

  const [facultyId, setFacultyId] = useState("");
  const [yearId, setYearId] = useState("");

  const faculties = useApiResource<{ faculties: Faculty[] }>("/faculties");
  const years = useApiResource<{ years: Year[] }>(facultyId ? `/faculties/${facultyId}/years` : null);

  const facultyList = useMemo(() => faculties.data?.faculties ?? [], [faculties.data]);
  const yearList = useMemo(() => years.data?.years ?? [], [years.data]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!facultyId && user?.facultyId && facultyList.some((f) => f.id === user.facultyId)) {
      setFacultyId(user.facultyId);
    }
  }, [facultyId, user, facultyList]);
  useEffect(() => {
    if (facultyId && !yearId && user?.yearId && yearList.some((y) => y.id === user.yearId)) {
      setYearId(user.yearId);
    }
  }, [facultyId, yearId, user, yearList]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const coverageQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (facultyId) params.append("facultyId", facultyId);
    if (yearId) params.append("yearId", yearId);
    const query = params.toString();
    return `/questions/coverage${query ? `?${query}` : ""}`;
  }, [facultyId, yearId]);

  const coverage = useApiResource<CoverageResponse>(coverageQuery);
  const modules = useMemo(() => coverage.data?.modules ?? [], [coverage.data]);
  const maxQuestions = useMemo(
    () => modules.reduce((max, entry) => Math.max(max, entry.questions), 0),
    [modules]
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

      <main className="mx-auto w-full max-w-2xl flex-1 px-card-padding py-section-gap">
        <BackLink href="/faculties">Retour à la bibliothèque</BackLink>
        <h1 className="mt-2 font-display text-h1 font-bold text-text-primary">Couverture par module</h1>
        <p className="mt-2 text-body text-text-secondary">
          Nombre de questions validées par module — la couverture de la banque Hamame, pas la
          fréquence d&apos;apparition aux examens.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="coverage-faculty" className="mb-2 block text-meta font-medium text-text-secondary">
              Faculté
            </label>
            <select
              id="coverage-faculty"
              value={facultyId}
              onChange={(event) => {
                setFacultyId(event.target.value);
                setYearId("");
              }}
              disabled={faculties.isLoading}
              className={selectClass}
            >
              <option value="">{faculties.isLoading ? "Chargement…" : "Toutes les facultés"}</option>
              {facultyList.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="coverage-year" className="mb-2 block text-meta font-medium text-text-secondary">
              Année
            </label>
            <select
              id="coverage-year"
              value={yearId}
              onChange={(event) => setYearId(event.target.value)}
              disabled={!facultyId || years.isLoading}
              className={selectClass}
            >
              <option value="">{years.isLoading ? "Chargement…" : "Toutes les années"}</option>
              {yearList.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4">
          {coverage.isLoading && modules.length === 0 ? (
            <div className="flex flex-col gap-3" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <LoadingSkeleton key={i} className="h-16 w-full rounded-card" />
              ))}
            </div>
          ) : coverage.error ? (
            <div className="rounded-card border border-danger bg-surface-1 p-card-padding">
              <p role="alert" className="text-body text-danger">
                {coverage.error}
              </p>
              <button
                type="button"
                onClick={coverage.refetch}
                className="mt-3 inline-flex min-h-touch-target items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring sm:w-auto"
              >
                Réessayer
              </button>
            </div>
          ) : modules.length === 0 ? (
            <EmptyState
              title="Aucune question validée ici"
              description="Aucune question validée ne correspond à ces filtres pour le moment."
              action={{ label: "Créer une session QCM", href: "/qcm" }}
            />
          ) : (
            <>
              <p className="text-meta text-text-secondary" aria-live="polite">
                {coverage.data?.total ?? 0} questions validées au total
              </p>
              <ol className="mt-3 flex flex-col gap-2">
                {modules.map((entry, index) => (
                  <li
                    key={entry.moduleId}
                    className="rounded-card border border-border bg-surface-1 p-card-padding shadow-card"
                  >
                    <div className="flex items-baseline gap-3">
                      <span
                        aria-label={`Rang ${index + 1}`}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-3 font-display text-h3 font-bold text-text-primary"
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body font-semibold text-text-primary">
                          {entry.moduleName}
                        </p>
                        <p className="text-meta text-text-tertiary">
                          {entry.facultyName} · {entry.yearLabel}
                        </p>
                        <div
                          className="mt-2 h-1.5 overflow-hidden rounded-pill bg-surface-3"
                          role="img"
                          aria-label={`${entry.questions} questions`}
                        >
                          <div
                            className="h-full rounded-pill bg-accent-qcm"
                            style={{
                              width: `${maxQuestions > 0 ? (entry.questions / maxQuestions) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                      <span className="shrink-0 text-body font-semibold tabular-nums text-text-primary">
                        {entry.questions}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </main>

      <Footer />
    </>
  );
}
