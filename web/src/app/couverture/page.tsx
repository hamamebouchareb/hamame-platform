"use client";

import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuthedPage } from "@/lib/useAuthedPage";
import { useApiResource } from "@/lib/useApiResource";
import { Card, EmptyState, ErrorState, LoadingSkeleton, PageShell, Select } from "@/components";
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

export default function CoveragePage() {
  const { user, isHydrated, handleLogout } = useAuthedPage();
  const { t } = useLanguage();

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

  return (
    <PageShell
      user={user}
      isHydrated={isHydrated}
      onLogout={handleLogout}
      width="narrow"
      back={{ href: "/faculties", label: t("years.backToLibrary") }}
      title={t("coverage.title")}
      description={t("coverage.subtitle")}
    >
      <>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Select
            id="coverage-faculty"
            label={t("settings.faculty")}
            value={facultyId}
            onChange={(event) => {
              setFacultyId(event.target.value);
              setYearId("");
            }}
            disabled={faculties.isLoading}
          >
            <option value="">{faculties.isLoading ? t("builder.loadingShort") : t("builder.allFaculties")}</option>
            {facultyList.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
          <Select
            id="coverage-year"
            label={t("settings.year")}
            value={yearId}
            onChange={(event) => setYearId(event.target.value)}
            disabled={!facultyId || years.isLoading}
          >
            <option value="">{years.isLoading ? t("builder.loadingShort") : t("builder.allYears")}</option>
            {yearList.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="mt-4">
          {coverage.isLoading && modules.length === 0 ? (
            <div className="flex flex-col gap-3" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <LoadingSkeleton key={i} className="h-16 w-full rounded-card" />
              ))}
            </div>
          ) : coverage.error ? (
            <ErrorState message={coverage.error} onRetry={coverage.refetch} />
          ) : modules.length === 0 ? (
            <EmptyState
              title={t("coverage.empty")}
              description={t("coverage.emptyDesc")}
              action={{ label: t("dashboard.createQcm"), href: "/qcm" }}
            />
          ) : (
            <>
              <p className="text-meta text-text-secondary" aria-live="polite">
                {t("coverage.total", { count: coverage.data?.total ?? 0 })}
              </p>
              <ol className="mt-3 flex flex-col gap-2">
                {modules.map((entry, index) => (
                  <Card as="li" key={entry.moduleId}>
                    <div className="flex items-baseline gap-3">
                      <span
                        aria-label={t("classement.rank", { rank: index + 1 })}
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
                  </Card>
                ))}
              </ol>
            </>
          )}
        </div>
      </>
    </PageShell>
  );
}
