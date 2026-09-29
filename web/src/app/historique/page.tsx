"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { localeFor, type UiLanguage } from "@/lib/i18n";
import { useAuthedPage } from "@/lib/useAuthedPage";
import { apiFetch, ApiError } from "@/lib/api";
import { cx } from "@/lib/cx";
import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  PageShell,
} from "@/components";
import type { SessionHistoryEntry } from "@/lib/types";

const PAGE_LIMIT = 20;

interface HistoryResponse {
  sessions: SessionHistoryEntry[];
  pagination: { page: number; limit: number; total: number };
}

function formatDate(iso: string, lang: UiLanguage): string {
  return new Date(iso).toLocaleString(localeFor(lang), {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function accuracy(answered: number, correct: number): string {
  if (answered === 0) return "—";
  return `${Math.round((correct / answered) * 100)} %`;
}

export default function HistoryPage() {
  const { user, isHydrated, handleLogout } = useAuthedPage();
  const { lang, t } = useLanguage();

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
      setError(err instanceof ApiError ? err.message : t("history.loadError"));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

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
      const key = first ? `${first.facultyName} · ${first.yearLabel}` : t("history.others");
      const list = map.get(key) ?? [];
      list.push(session);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [sessions, t]);

  const hasMore = page > 0 && sessions.length < total;
  const isEmpty = page > 0 && sessions.length === 0 && !isLoading && !error;

  return (
    <PageShell
      user={user}
      isHydrated={isHydrated}
      onLogout={handleLogout}
      width="narrow"
      back={{ href: "/dashboard", label: t("classement.backToDashboard") }}
      title={t("history.title")}
      description={t("history.subtitle")}
    >
      <>
        {/* P12 cheap simulations history: mode tabs on the same endpoint. */}
        <div className="mt-4 flex gap-2" role="group" aria-label={t("history.filterMode")}>
          {(
            [
              { value: "", labelKey: "history.tabAll" },
              { value: "practice", labelKey: "history.tabPractice" },
              { value: "exam", labelKey: "history.tabExams" },
            ] as const
          ).map((tab) => (
            <Button
              key={tab.labelKey}
              variant="outline"
              onClick={() => handleModeChange(tab.value)}
              aria-pressed={modeFilter === tab.value}
              className={cx(
                "flex-1 sm:flex-none",
                modeFilter === tab.value && "border-accent-qcm bg-accent-qcm/15 text-text-primary"
              )}
            >
              {t(tab.labelKey)}
            </Button>
          ))}
        </div>

        {error ? (
          <ErrorState
            className="mt-4"
            message={error}
            onRetry={() => loadPage(page === 0 ? 1 : page, modeFilter)}
          />
        ) : null}

        {isEmpty ? (
          <div className="mt-section-gap">
            <EmptyState
              title={t(modeFilter === "exam" ? "history.emptyExam" : "history.emptySessions")}
              description={t(modeFilter === "exam" ? "history.emptyExamDesc" : "history.emptySessionsDesc")}
              action={{ label: t("dashboard.createQcm"), href: "/qcm" }}
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

        {groups.map(([groupLabel, groupSessions]) => {
          const groupAnswered = groupSessions.reduce((sum, s) => sum + s.stats.answered, 0);
          const groupCorrect = groupSessions.reduce((sum, s) => sum + s.stats.correct, 0);
          return (
          <section key={groupLabel} aria-label={groupLabel} className="mt-section-gap first:mt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-h3 font-semibold text-text-primary">{groupLabel}</h2>
              <p className="text-meta tabular-nums text-text-tertiary">
                {t(groupSessions.length === 1 ? "history.groupOne" : "history.groupMany", { count: groupSessions.length })} ·{" "}
                {accuracy(groupAnswered, groupCorrect)} {t("history.groupOverall")}
              </p>
            </div>
            <ul className="mt-3 flex flex-col gap-3">
              {groupSessions.map((session) => {
                const completed = session.completedAt !== null;
                return (
                  <Card as="li" key={session.id}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-body font-semibold text-text-primary">{session.name}</p>
                      <p className="text-meta text-text-tertiary">
                        {session.mode === "exam" ? t("builder.nameExam") : t("builder.namePractice")} · {formatDate(session.startedAt, lang)}
                      </p>
                    </div>
                    <p className="mt-1 text-meta text-text-secondary">
                      {t("history.answered", { a: session.stats.answered, t: session.stats.total })}
                      {" · "}
                      {t("history.accuracy", { v: accuracy(session.stats.answered, session.stats.correct) })}
                      {completed && session.score !== null ? ` · ${t("history.score", { v: Math.round(session.score) })}` : null}
                      {completed ? ` · ${t("history.done")}` : ` · ${t("dashboard.inProgress")}`}
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
                    <ButtonLink
                      href={completed ? `/sessions/${session.id}/results` : `/sessions/${session.id}`}
                      variant="outline"
                      className="mt-3"
                    >
                      {completed ? t("history.review") : t("history.continue")}
                    </ButtonLink>
                  </Card>
                  );
                })}
              </ul>
          </section>
          );
        })}

        {hasMore ? (
          <Button
            variant="outline"
            width="full-mobile"
            onClick={() => loadPage(page + 1, modeFilter)}
            disabled={isLoading}
            className="mt-4"
          >
            {isLoading ? t("common.loadingMore") : t("history.loadMore")}
          </Button>
        ) : null}
      </>
    </PageShell>
  );
}
