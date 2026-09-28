"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useApiResource } from "@/lib/useApiResource";
import { useApiList } from "@/lib/useApiList";
import { AppHeader, EmptyState, Footer, CourseCard, LoadingSkeleton } from "@/components";
import { accentText, accentVar } from "@/components/FeatureCard";
import type { Faculty, Year } from "@/lib/types";
import { cx } from "@/lib/cx";

export default function FacultiesPage() {
  const { logout } = useAuth();
  const router = useRouter();
  const { user, isHydrated } = useRequireAuth();
  const { t } = useLanguage();

  const { data, error, isLoading, refetch } = useApiResource<{ faculties: Faculty[] }>(
    isHydrated && user ? "/faculties" : null
  );

  const faculties = data?.faculties ?? [];
  const yearsPaths = faculties.map((faculty) => `/faculties/${faculty.id}/years`);
  const { data: yearBatches, isLoading: yearsLoading } = useApiList<{ years: Year[] }>(
    isHydrated && user && faculties.length > 0 ? yearsPaths : null
  );

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

  const myFacultyIndex = user.facultyId ? faculties.findIndex((f) => f.id === user.facultyId) : -1;
  const myFaculty = myFacultyIndex >= 0 ? faculties[myFacultyIndex] : null;
  const myFacultyYears = myFacultyIndex >= 0 && yearBatches.length > myFacultyIndex ? yearBatches[myFacultyIndex]?.years ?? [] : [];
  const myYear = myFaculty ? myFacultyYears.find((y) => y.id === user.yearId) ?? null : null;

  return (
    <>
      <AppHeader user={user} onLogout={handleLogout} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-card-padding py-section-gap">
        <section aria-label={t("library.heroAria")} className="mx-auto max-w-3xl text-center">
          <p className="text-meta font-medium uppercase tracking-wide text-accent-soft">{t("library.kicker")}</p>
          <h1 className="mt-2 font-display text-hero font-bold leading-tight text-text-primary">
            {t("library.title")}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-body text-text-secondary">
            {t("library.subtitle")}
          </p>
        </section>

        {myFaculty ? (
          <section aria-label={t("library.myTrack")} className="mx-auto mt-section-gap max-w-4xl">
            <Link
              href={myYear ? `/years/${myYear.id}/modules` : `/faculties/${myFaculty.id}/years`}
              className="group flex flex-col gap-2 rounded-card-lg border border-border bg-surface-2 p-card-padding shadow-card transition hover:border-border-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2"
              style={{ borderTop: `3px solid ${accentVar("library")}`, boxShadow: "0 0 28px color-mix(in srgb, var(--color-accent-library) 12%, transparent)" }}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-meta font-medium uppercase tracking-wide text-accent-soft">{t("library.myTrack")}</p>
                <span className="rounded-pill border border-accent-library/40 bg-accent-library/15 px-2.5 py-0.5 text-caption font-medium text-accent-soft">
                  {t("library.yourPath")}
                </span>
              </div>
              <h2 className={cx("font-display text-h2 font-semibold", accentText("library"))}>
                {myYear ? `${myFaculty.name} · ${myYear.label}` : myFaculty.name}
              </h2>
              <p className="text-body text-text-secondary">
                {myYear
                  ? t("library.resumeDesc")
                  : t("library.needYearDesc")}
              </p>
              <span className="mt-1 inline-flex min-h-touch-target w-fit items-center justify-center gap-2 rounded-control px-5 text-body font-semibold text-background transition group-hover:brightness-110 active:scale-[0.98]">
                {myYear ? t("library.resumeCourses") : t("library.chooseYear")}
                <span aria-hidden className="transition-transform group-hover:translate-x-1">
                  →
                </span>
              </span>
            </Link>
          </section>
        ) : (
          <section aria-label={t("library.pickTrack")} className="mx-auto mt-section-gap max-w-4xl">
            <EmptyState
              title={t("library.pickTitle")}
              description={t("library.pickDesc")}
              action={{ label: t("library.completeProfile"), href: "/settings" }}
            />
          </section>
        )}

        <section aria-label={t("library.allFaculties")} className="mx-auto mt-section-gap max-w-4xl">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-h3 font-semibold text-text-primary">{t("library.allFaculties")}</h2>
            <p className="text-meta text-text-tertiary">
              {isLoading ? t("common.loadingMore") : t(faculties.length === 1 ? "library.facultiesOne" : "library.facultiesMany", { count: faculties.length })}
            </p>
          </div>

          {isLoading ? (
            <div className="mt-4 grid gap-card-gap sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <LoadingSkeleton key={i} className="h-28 w-full rounded-card" ariaLabel={i === 0 ? t("library.loadingFaculties") : undefined} />
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
                {t("common.retry")}
              </button>
            </div>
          ) : null}

          {!isLoading && !error && faculties.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title={t("library.noFaculty")}
                description={t("library.noFacultyDesc")}
                action={{ label: t("dashboard.createQcm"), href: "/qcm" }}
              />
            </div>
          ) : null}

          <ul className="mt-4 grid gap-card-gap sm:grid-cols-2 lg:grid-cols-3">
            {faculties.map((faculty, index) => {
              const yearCount = yearBatches[index]?.years.length;
              const isMine = myFacultyIndex === index;
              return (
                <li key={faculty.id}>
                  <CourseCard
                    href={`/faculties/${faculty.id}/years`}
                    title={faculty.name}
                    tone="library"
                    description={
                      yearsLoading && yearCount === undefined
                        ? t("library.loadingYears")
                        : t((yearCount ?? 0) === 1 ? "library.yearsOne" : "library.yearsMany", { count: yearCount ?? 0 })
                    }
                    actionLabel={t("library.explore")}
                    meta={
                      isMine ? (
                          <span className="rounded-pill border border-accent-library/40 bg-accent-library/15 px-2 py-0.5 font-medium text-accent-soft">
                          {t("library.mineBadge")}
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
        </section>

        <p className="mt-section-gap text-center text-meta text-text-tertiary">
          {t("library.footnote")}
        </p>
      </main>

      <Footer />
    </>
  );
}
