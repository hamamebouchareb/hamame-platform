"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { localeFor } from "@/lib/i18n";
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
  const { lang, t } = useLanguage();

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
        <LoadingSkeleton className="h-8 w-48" ariaLabel={t("common.loading")} />
      </main>
    );
  }

  return (
    <>
      <AppHeader user={user} onLogout={handleLogout} />

      <main className="mx-auto w-full max-w-2xl flex-1 px-card-padding py-section-gap">
        <BackLink href="/dashboard">{t("classement.backToDashboard")}</BackLink>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-h1 font-bold text-text-primary">{t("nav.leaderboard")}</h1>
            <p className="mt-2 text-body text-text-secondary">
              {t("classement.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRulesOpen(true)}
            className="inline-flex min-h-touch-target items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            {t("classement.howItWorks")}
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="board-faculty" className="mb-2 block text-meta font-medium text-text-secondary">
              {t("settings.faculty")}
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
              <option value="">{faculties.isLoading ? t("builder.loadingShort") : t("classement.pickFaculty")}</option>
              {facultyList.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="board-year" className="mb-2 block text-meta font-medium text-text-secondary">
              {t("settings.year")}
            </label>
            <select
              id="board-year"
              value={yearId}
              onChange={(event) => setYearId(event.target.value)}
              disabled={!facultyId || years.isLoading}
              className={selectClass}
            >
              <option value="">{years.isLoading ? t("builder.loadingShort") : t("classement.pickYear")}</option>
              {yearList.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex gap-2" role="group" aria-label={t("classement.boardType")}>
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
              {type === "score" ? t("classement.scores") : t("classement.participation")}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {!boardPath ? (
            <p className="rounded-panel border border-border bg-surface-2 px-3 py-2.5 text-meta text-text-tertiary">
              {t("classement.pickCohort")}
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
                {t("common.retry")}
              </button>
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              title={t("classement.emptyTitle")}
              description={t("classement.emptyDesc")}
              action={{ label: t("dashboard.createQcm"), href: "/qcm" }}
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
                      aria-label={t("classement.rank", { rank: row.rank })}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-3 font-display text-h3 font-bold text-text-primary"
                    >
                      {row.rank}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-body font-medium text-text-primary">
                      {row.fullName}
                      {isSelf ? (
                        <span className="ml-2 rounded-pill border border-accent-qcm/50 px-2 py-0.5 text-meta text-accent-soft">
                          {t("classement.you")}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-body font-semibold tabular-nums text-text-primary">
                      {boardType === "score"
                        ? `${row.score.toLocaleString(localeFor(lang), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
                        : t(row.score === 1 ? "classement.sessionsOne" : "classement.sessionsMany", { count: row.score })}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <Modal open={rulesOpen} onClose={() => setRulesOpen(false)} title={t("classement.rulesTitle")}>
          <div className="flex flex-col gap-3 text-body text-text-secondary">
            <p>
              <strong className="text-text-primary">{t("classement.rulesScores")}</strong>{t("classement.rulesScoresBody1")}
              <strong className="text-text-primary">{t("classement.rulesScoresBody2")}</strong>{t("classement.rulesScoresBody3")}
            </p>
            <p>
              <strong className="text-text-primary">{t("classement.rulesCohort")}</strong>{t("classement.rulesCohortBody1")}
              <strong className="text-text-primary">{t("classement.rulesCohortBody2")}</strong>{t("classement.rulesCohortBody3")}
            </p>
            <p>
              <strong className="text-text-primary">{t("classement.rulesParticipation")}</strong>{t("classement.rulesParticipationBody")}
            </p>
            <p>
              <strong className="text-text-primary">{t("classement.rulesRefresh")}</strong>{t("classement.rulesRefreshBody")}
            </p>
            <p>
              <strong className="text-text-primary">{t("classement.rulesPrivacy")}</strong>{t("classement.rulesPrivacyBody")}
            </p>
          </div>
        </Modal>
      </main>

      <Footer />
    </>
  );
}
