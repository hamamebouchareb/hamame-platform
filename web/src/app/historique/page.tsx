"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { apiFetch, ApiError } from "@/lib/api";
import { AppHeader, BackLink, EmptyState, Footer, LoadingSkeleton } from "@/components";
import type { SessionHistoryEntry } from "@/lib/types";

const PAGE_LIMIT = 20;

interface HistoryResponse {
  sessions: SessionHistoryEntry[];
  pagination: { page: number; limit: number; total: number };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-DZ", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function accuracy(answered: number, correct: number): string {
  if (answered === 0) return "—";
  return `${Math.round((correct / answered) * 100)} %`;
}

export default function HistoryPage() {
  const router = useRouter();
  const { logout } = useAuth();
  const { user, isHydrated } = useRequireAuth();

  const [sessions, setSessions] = useState<SessionHistoryEntry[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // P12 cheap simulations history: mode filter on the same endpoint (no new
  // infrastructure — a scheduled-simulations system is explicitly out of scope).
  const [modeFilter, setModeFilter] = useState<"" | "practice" | "exam">("");

  const loadPage = useCallback(async (pageToLoad: number, mode: "" | "practice" | "exam") => {
    setIsLoading(true);
    setError(null);
    try {
      const modeQuery = mode ? `&mode=${mode}` : "";
      const response = await apiFetch<HistoryResponse>(
        `/sessions?page=${pageToLoad}&limit=${PAGE_LIMIT}${modeQuery}`
      );
      setSessions((prev) => (pageToLoad === 1 ? response.sessions : [...prev, ...response.sessions]));
      setPage(response.pagination.page);
      setTotal(response.pagination.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible de charger l'historique. Réessayez.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isHydrated && user && page === 0) {
      loadPage(1, modeFilter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, user, page, modeFilter]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleModeChange(mode: "" | "practice" | "exam") {
    if (mode === modeFilter) return;
    // Setting page to 0 retriggers the initial-load effect above, which
    // fetches page 1 with the new filter (modeFilter is a dep, so the effect
    // closure is fresh). Calling loadPage here too would double-fetch.
    setModeFilter(mode);
    setSessions([]);
    setTotal(0);
    setPage(0);
  }

  // Group sessions by their dominant curriculum scope (faculty · year of the
  // first unit — sessions are normally single-scope). Ungroupable sessions
  // fall under a plain heading rather than being hidden.
  const groups = useMemo(() => {
    const map = new Map<string, SessionHistoryEntry[]>();
    for (const session of sessions) {
      const first = session.units[0];
      const key = first ? `${first.facultyName} · ${first.yearLabel}` : "Autres sessions";
      const list = map.get(key) ?? [];
      list.push(session);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [sessions]);

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

  const hasMore = page > 0 && sessions.length < total;
  const isEmpty = page > 0 && sessions.length === 0 && !isLoading && !error;

  return (
    <>
      <AppHeader user={user} onLogout={handleLogout} />

      <main className="mx-auto w-full max-w-2xl flex-1 px-card-padding py-section-gap">
        <BackLink href="/dashboard">Retour au tableau de bord</BackLink>
        <h1 className="mt-2 font-display text-h1 font-bold text-text-primary">Historique des sessions</h1>
        <p className="mt-2 text-body text-text-secondary">
          Toutes vos sessions, groupées par faculté et année, avec la progression par unité.
          Reprenez une session en cours ou revoyez une session terminée.
        </p>

        {/* P12 cheap simulations history: mode tabs on the same endpoint. */}
        <div className="mt-4 flex gap-2" role="group" aria-label="Filtrer par mode">
          {(
            [
              { value: "", label: "Toutes" },
              { value: "practice", label: "Entraînements" },
              { value: "exam", label: "Examens" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.label}
              type="button"
              onClick={() => handleModeChange(tab.value)}
              aria-pressed={modeFilter === tab.value}
              className={[
                "inline-flex min-h-touch-target flex-1 items-center justify-center rounded-control border px-4 text-body font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring sm:flex-none",
                modeFilter === tab.value
                  ? "border-accent-qcm bg-accent-qcm/15 text-text-primary"
                  : "border-border text-text-secondary hover:bg-surface-2",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error ? (
          <div className="mt-4 rounded-card border border-danger bg-surface-1 p-card-padding">
            <p role="alert" className="text-body text-danger">
              {error}
            </p>
            <button
              type="button"
              onClick={() => loadPage(page === 0 ? 1 : page, modeFilter)}
              className="mt-3 inline-flex min-h-touch-target w-full items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2 sm:w-auto"
            >
              Réessayer
            </button>
          </div>
        ) : null}

        {isEmpty ? (
          <div className="mt-section-gap">
            <EmptyState
              title={modeFilter === "exam" ? "Aucun examen pour l'instant" : "Aucune session pour l'instant"}
              description={
                modeFilter === "exam"
                  ? "Lancez un examen chronométré depuis la banque QCM pour le retrouver ici."
                  : "Lancez votre première session QCM pour la retrouver ici avec votre progression."
              }
              action={{ label: "Créer une session QCM", href: "/qcm" }}
            />
          </div>
        ) : null}

        {isLoading && sessions.length === 0 && !error ? (
          <div className="mt-4 flex flex-col gap-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <LoadingSkeleton key={i} className="h-24 w-full rounded-card" />
            ))}
          </div>
        ) : null}

        {groups.map(([groupLabel, groupSessions]) => (
          <section key={groupLabel} aria-label={groupLabel} className="mt-section-gap first:mt-4">
            <h2 className="font-display text-h3 font-semibold text-text-primary">{groupLabel}</h2>
            <ul className="mt-3 flex flex-col gap-3">
              {groupSessions.map((session) => {
                const completed = session.completedAt !== null;
                return (
                  <li
                    key={session.id}
                    className="rounded-card border border-border bg-surface-1 p-card-padding shadow-card"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-body font-semibold text-text-primary">{session.name}</p>
                      <p className="text-meta text-text-tertiary">
                        {session.mode === "exam" ? "Examen" : "Entraînement"} · {formatDate(session.startedAt)}
                      </p>
                    </div>
                    <p className="mt-1 text-meta text-text-secondary">
                      {session.stats.answered}/{session.stats.total} répondues
                      {" · "}
                      Précision {accuracy(session.stats.answered, session.stats.correct)}
                      {completed && session.score !== null ? ` · Score ${Math.round(session.score)} %` : null}
                      {completed ? " · Terminée" : " · En cours"}
                    </p>
                    {session.units.length > 0 ? (
                      <ul className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
                        {session.units.map((unit) => (
                          <li
                            key={unit.unitId}
                            className="flex flex-wrap items-baseline justify-between gap-2 text-meta"
                          >
                            <span className="text-text-secondary">
                              {unit.unitName} <span className="text-text-tertiary">— {unit.moduleName}</span>
                            </span>
                            <span className="text-text-tertiary">
                              {unit.answered}/{unit.total} · {accuracy(unit.answered, unit.correct)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <Link
                      href={completed ? `/sessions/${session.id}/results` : `/sessions/${session.id}`}
                      className="mt-3 inline-flex min-h-touch-target items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2"
                    >
                      {completed ? "Revoir" : "Continuer"}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {hasMore ? (
          <button
            type="button"
            onClick={() => loadPage(page + 1, modeFilter)}
            disabled={isLoading}
            className="mt-4 inline-flex min-h-touch-target w-full items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-60 sm:w-auto"
          >
            {isLoading ? "Chargement..." : "Charger plus"}
          </button>
        ) : null}
      </main>

      <Footer />
    </>
  );
}
