"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { apiFetch, ApiError } from "@/lib/api";
import { useApiResource } from "@/lib/useApiResource";
import { AppHeader, BackLink, EmptyState, Footer, LoadingSkeleton, Modal } from "@/components";
import type { Faculty, LeaderboardEntry, Year } from "@/lib/types";

interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
}

type BoardType = "score" | "contributors";

const selectClass =
  "min-h-touch-target w-full rounded-input border border-border bg-surface-2 px-4 text-body text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50";

export default function LeaderboardPage() {
  const router = useRouter();
  const { logout } = useAuth();
  const { user, isHydrated } = useRequireAuth();

  const [facultyId, setFacultyId] = useState("");
  const [yearId, setYearId] = useState("");
  const [boardType, setBoardType] = useState<BoardType>("score");
  const [rulesOpen, setRulesOpen] = useState(false);

  const faculties = useApiResource<{ faculties: Faculty[] }>("/faculties");
  const years = useApiResource<{ years: Year[] }>(facultyId ? `/faculties/${facultyId}/years` : null);

  const facultyList = useMemo(() => faculties.data?.faculties ?? [], [faculties.data]);
  const yearList = useMemo(() => years.data?.years ?? [], [years.data]);

  // Default to the student's own cohort once the lists resolve.
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

  const boardPath =
    facultyId && yearId ? `/leaderboard?facultyId=${facultyId}&yearId=${yearId}&type=${boardType}` : null;
  const board = useApiResource<LeaderboardResponse>(boardPath);
  const rows = useMemo(() => board.data?.leaderboard ?? [], [board.data]);

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
        <BackLink href="/dashboard">Retour au tableau de bord</BackLink>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-h1 font-bold text-text-primary">Classement</h1>
            <p className="mt-2 text-body text-text-secondary">
              La promotion, classée sur les 30 derniers jours glissants.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRulesOpen(true)}
            className="inline-flex min-h-touch-target items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            Comment ça marche
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="board-faculty" className="mb-2 block text-meta font-medium text-text-secondary">
              Faculté
            </label>
            <select
              id="board-faculty"
              value={facultyId}
              onChange={(event) => {
                setFacultyId(event.target.value);
                setYearId("");
              }}
              disabled={faculties.isLoading}
              className={selectClass}
            >
              <option value="">{faculties.isLoading ? "Chargement…" : "Choisir une faculté"}</option>
              {facultyList.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="board-year" className="mb-2 block text-meta font-medium text-text-secondary">
              Année
            </label>
            <select
              id="board-year"
              value={yearId}
              onChange={(event) => setYearId(event.target.value)}
              disabled={!facultyId || years.isLoading}
              className={selectClass}
            >
              <option value="">{years.isLoading ? "Chargement…" : "Choisir une année"}</option>
              {yearList.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex gap-2" role="group" aria-label="Type de classement">
          {(["score", "contributors"] as BoardType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setBoardType(type)}
              aria-pressed={boardType === type}
              className={`inline-flex min-h-touch-target flex-1 items-center justify-center rounded-control border px-4 text-body font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                boardType === type
                  ? "border-accent-qcm bg-accent-qcm/15 text-text-primary"
                  : "border-border text-text-secondary hover:bg-surface-2"
              }`}
            >
              {type === "score" ? "Scores" : "Participation"}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {!boardPath ? (
            <p className="rounded-panel border border-border bg-surface-2 px-3 py-2.5 text-meta text-text-tertiary">
              Choisissez une faculté et une année pour voir le classement.
            </p>
          ) : board.isLoading && rows.length === 0 ? (
            <div className="flex flex-col gap-3" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <LoadingSkeleton key={i} className="h-16 w-full rounded-card" />
              ))}
            </div>
          ) : board.error ? (
            <div className="rounded-card border border-danger bg-surface-1 p-card-padding">
              <p role="alert" className="text-body text-danger">
                {board.error}
              </p>
              <button
                type="button"
                onClick={board.refetch}
                className="mt-3 inline-flex min-h-touch-target items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring sm:w-auto"
              >
                Réessayer
              </button>
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              title="Pas encore de classement"
              description="Aucune session notée sur les 30 derniers jours pour cette promotion. Terminez une session pour y apparaître."
              action={{ label: "Créer une session QCM", href: "/qcm" }}
            />
          ) : (
            <ol className="flex flex-col gap-2">
              {rows.map((row) => {
                const isSelf = user.fullName !== null && row.fullName === user.fullName;
                return (
                  <li
                    key={`${row.rank}-${row.fullName}`}
                    className={`flex items-center gap-3 rounded-card border bg-surface-1 p-card-padding shadow-card ${
                      isSelf ? "border-accent-qcm" : "border-border"
                    }`}
                  >
                    <span
                      aria-label={`Rang ${row.rank}`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-3 font-display text-h3 font-bold text-text-primary"
                    >
                      {row.rank}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-body font-medium text-text-primary">
                      {row.fullName}
                      {isSelf ? (
                        <span className="ml-2 rounded-pill border border-accent-qcm/50 px-2 py-0.5 text-meta text-accent-soft">
                          vous
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-body font-semibold tabular-nums text-text-primary">
                      {boardType === "score"
                        ? `${row.score.toFixed(1).replace(".", ",")} %`
                        : `${row.score} session${row.score === 1 ? "" : "s"}`}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <Modal open={rulesOpen} onClose={() => setRulesOpen(false)} title="Comment marche le classement ?">
          <div className="flex flex-col gap-3 text-body text-text-secondary">
            <p>
              <strong className="text-text-primary">Scores.</strong> Chaque étudiant est classé sur la
              moyenne de ses sessions terminées et notées des <strong className="text-text-primary">30
              derniers jours glissants</strong> — pas un mois calendaire, pas un cumul à vie.
            </p>
            <p>
              <strong className="text-text-primary">Promotion.</strong> Le classement est calculé par
              faculté et année <strong className="text-text-primary">du profil de chaque
              étudiant</strong> (les sessions elles-mêmes ne portent pas de faculté) : vous êtes
              comparé aux étudiants qui partagent votre faculté et votre année.
            </p>
            <p>
              <strong className="text-text-primary">Participation.</strong> L&apos;autre onglet compte
              simplement les sessions terminées sur 30 jours — la régularité plutôt que la note.
            </p>
            <p>
              <strong className="text-text-primary">Actualisation.</strong> Le classement est
              recalculé périodiquement par le serveur et remplace le précédent : il n&apos;y a pas
              d&apos;historique des anciens classements.
            </p>
            <p>
              <strong className="text-text-primary">Confidentialité.</strong> Seuls le rang, le
              score et le nom affiché sont visibles — jamais d&apos;email ni de détail de sessions.
            </p>
          </div>
        </Modal>
      </main>

      <Footer />
    </>
  );
}
