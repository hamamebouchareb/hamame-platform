"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { useAuthedPage } from "@/lib/useAuthedPage";
import { useApiResource } from "@/lib/useApiResource";
import { useApiList } from "@/lib/useApiList";
import {
  Breadcrumb,
  CourseCard,
  CurriculumToolbar,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  PageShell,
  curriculumTrail,
} from "@/components";
import type { CurriculumContext, CurriculumModule, Faculty, Year } from "@/lib/types";

type SortValue = "az" | "za" | "recent" | "curriculum";
type TrackFilter = "medecine" | "dentaire" | "pharmacie" | "all";
const TRACK_ORDER: Array<Exclude<TrackFilter, "all">> = ["medecine", "dentaire", "pharmacie"];

export default function FacultyYearsPage() {
  const params = useParams<{ id: string }>();
  const { user, isHydrated, handleLogout } = useAuthedPage();
  const { t } = useLanguage();

  const [search, setSearch] = useState("");
  // Curriculum order is the natural ladder (Year 1 → … → Internat → Résidanat) and
  // is what the API already returns (orderBy orderIndex) — the old alphabetical
  // default scrambled it and stacked the three tracks' identical labels together.
  const [sort, setSort] = useState<SortValue>("curriculum");
  // null = auto: follow the viewer's own track (from the year chosen in onboarding),
  // or all tracks for viewers without one. A pill click overrides it.
  const [trackOverride, setTrackOverride] = useState<TrackFilter | null>(null);

  const { data, error, isLoading, refetch } = useApiResource<{ years: Year[]; context?: CurriculumContext }>(
    isHydrated && user ? `/faculties/${params.id}/years` : null
  );
  const { data: facultiesData } = useApiResource<{ faculties: Faculty[] }>(
    isHydrated && user ? "/faculties" : null
  );

  const years = useMemo(() => data?.years ?? [], [data]);

  // moduleCount arrives grouped from GET /faculties/:id/years (one backend query).
  // Older backends (pre-deploy window) omit it — fall back to per-year fetches for
  // just those rows, never the whole list (22 parallel requests 500 on the pooler).
  const fallbackPaths = useMemo(
    () => years.filter((year) => year.moduleCount === undefined).map((year) => `/years/${year.id}/modules`),
    [years]
  );
  const { data: moduleBatches, isLoading: modulesLoading } = useApiList<{ modules: CurriculumModule[] }>(
    isHydrated && user && fallbackPaths.length > 0 ? fallbackPaths : null
  );

  const moduleCountByYear = useMemo(() => {
    const map = new Map<string, number>();
    years.forEach((year) => {
      if (year.moduleCount !== undefined) map.set(year.id, year.moduleCount);
    });
    const fallbackRows = years.filter((year) => year.moduleCount === undefined);
    fallbackRows.forEach((year, index) => {
      const modules = moduleBatches?.[index]?.modules;
      if (modules) map.set(year.id, modules.length);
    });
    return map;
  }, [years, moduleBatches]);

  const facultyName = facultiesData?.faculties.find((f) => f.id === params.id)?.name;

  // The viewer's own track rides on the year row they picked during onboarding
  // (the profile stores facultyId + yearId, not the track itself).
  const myTrack = useMemo(() => {
    const own = years.find((year) => year.id === user?.yearId);
    return own?.track ?? null;
  }, [years, user?.yearId]);

  const activeTrack: TrackFilter = trackOverride ?? (myTrack && TRACK_ORDER.includes(myTrack as Exclude<TrackFilter, "all">) ? (myTrack as Exclude<TrackFilter, "all">) : "all");

  // Only offer pills for tracks this faculty actually has years for.
  const presentTracks = useMemo(() => TRACK_ORDER.filter((track) => years.some((year) => year.track === track)), [years]);

  const normalizedSearch = search.trim().toLocaleLowerCase("fr");
  const visibleYears = useMemo(() => {
    const filtered = years.filter((year) => {
      if (activeTrack !== "all" && year.track !== activeTrack) return false;
      if (normalizedSearch !== "" && !year.label.toLocaleLowerCase("fr").includes(normalizedSearch)) return false;
      return true;
    });
    const sorted = [...filtered].sort((a, b) => {
      if (sort === "curriculum") {
        if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
        return a.label.localeCompare(b.label, "fr", { sensitivity: "base" });
      }
      if (sort === "recent") return b.createdAt.localeCompare(a.createdAt);
      const direction = sort === "za" ? -1 : 1;
      return direction * a.label.localeCompare(b.label, "fr", { sensitivity: "base" });
    });
    return sorted;
  }, [years, activeTrack, normalizedSearch, sort]);

  return (
    <PageShell
      user={user}
      isHydrated={isHydrated}
      onLogout={handleLogout}
      width="content"
      leading={
        <Breadcrumb
          label={t("common.breadcrumb")}
          items={curriculumTrail(
            t("nav.library"),
            data?.context ?? (facultyName ? { faculty: { id: params.id, name: facultyName } } : null)
          )}
        />
      }
      kicker={facultyName ?? t("years.trackFallback")}
      title={facultyName ? t("years.titleWith", { name: facultyName }) : t("years.title")}
      titleSize="hero"
      description={t("years.subtitle")}
    >
      {(authedUser) => {
        const isMyYear = (year: Year) => year.id === authedUser.yearId;
        return (
          <>
            <div
              className="mt-section-gap flex flex-wrap items-center gap-2"
              role="group"
              aria-label={t("years.trackFilter")}
            >
              {presentTracks.map((track) => {
                const active = activeTrack === track;
                const label =
                  track === "medecine"
                    ? t("onboard.trackMed")
                    : track === "dentaire"
                      ? t("onboard.trackDent")
                      : t("onboard.trackPharma");
                return (
                  <button
                    key={track}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setTrackOverride(track)}
                    className={
                      active
                        ? "min-h-touch-target rounded-pill border border-accent-library/40 bg-accent-library/15 px-4 text-body font-medium text-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                        : "min-h-touch-target rounded-pill border border-border bg-surface-1 px-4 text-body font-medium text-text-secondary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    }
                  >
                    {label}
                  </button>
                );
              })}
              <button
                type="button"
                aria-pressed={activeTrack === "all"}
                onClick={() => setTrackOverride("all")}
                className={
                  activeTrack === "all"
                    ? "min-h-touch-target rounded-pill border border-accent-library/40 bg-accent-library/15 px-4 text-body font-medium text-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    : "min-h-touch-target rounded-pill border border-border bg-surface-1 px-4 text-body font-medium text-text-secondary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                }
              >
                {t("years.allTracks")}
              </button>
            </div>

            <CurriculumToolbar
              className="mt-4"
              resultCount={visibleYears.length}
              totalCount={years.length}
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder={t("years.searchPh")}
              sortValue={sort}
              onSortChange={(value) => setSort(value as SortValue)}
              sortOptions={[
                { value: "curriculum", label: t("years.sortCurriculum") },
                { value: "az", label: t("years.sortAz") },
                { value: "za", label: t("years.sortZa") },
                { value: "recent", label: t("years.sortRecent") },
              ]}
            />

            {isLoading ? (
              <div className="mt-4 grid gap-card-gap sm:grid-cols-2">
                {[0, 1].map((i) => (
                  <LoadingSkeleton key={i} className="h-28 w-full rounded-card" ariaLabel={i === 0 ? t("years.loading") : undefined} />
                ))}
              </div>
            ) : null}

            {error ? <ErrorState className="mt-4" message={error} onRetry={refetch} /> : null}

            {!isLoading && !error && years.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  title={t("years.empty")}
                  description={t("years.emptyDesc")}
                  action={{ label: t("years.backToLibrary"), href: "/faculties" }}
                />
              </div>
            ) : null}

            {!isLoading && !error && years.length > 0 && visibleYears.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  title={t("years.noMatch")}
                  description={t("years.noMatchDesc")}
                  action={{
                    label: t("years.resetFilters"),
                    onClick: () => {
                      setSearch("");
                      setTrackOverride(null);
                      setSort("curriculum");
                    },
                  }}
                />
              </div>
            ) : null}

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
                          ? t("years.loadingModules")
                          : [
                              // Track label kills the "three identical Résidanat/Year 1
                              // cards" confusion — the API rows carry track but the card
                              // never showed it (observed live 2026-10-28).
                              year.track === "medecine"
                                ? t("onboard.trackMed")
                                : year.track === "dentaire"
                                  ? t("onboard.trackDent")
                                  : year.track === "pharmacie"
                                    ? t("onboard.trackPharma")
                                    : null,
                              t((moduleCount ?? 0) === 1 ? "years.modulesOne" : "years.modulesMany", { count: moduleCount ?? 0 }),
                            ]
                              .filter(Boolean)
                              .join(" · ")
                      }
                      actionLabel={t("library.explore")}
                      meta={
                        isMyYear(year) ? (
                          <span className="rounded-pill border border-accent-library/40 bg-accent-library/15 px-2 py-0.5 font-medium text-accent-soft">
                            {t("years.myYear")}
                          </span>
                        ) : (
                          <span className="rounded-pill border border-success/40 bg-success/15 px-2 py-0.5 font-medium text-success">
                            {t("library.availableBadge")}
                          </span>
                        )
                      }
                    />
                  </li>
                );
              })}
            </ul>

            <p className="mt-6 text-center text-meta text-text-tertiary">
              {t("years.footnote")}
            </p>
          </>
        );
      }}
    </PageShell>
  );
}
