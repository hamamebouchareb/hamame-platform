"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useApiResource } from "@/lib/useApiResource";
import { useApiList } from "@/lib/useApiList";
import { AppHeader, Footer, CourseCard } from "@/components";
import { accentText, accentVar } from "@/components/FeatureCard";
import type { Faculty, Year } from "@/lib/types";
import { cx } from "@/lib/cx";

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

export default function FacultiesPage() {
  const { logout } = useAuth();
  const router = useRouter();
  const { user, isHydrated } = useRequireAuth();

  const { data, error, isLoading } = useApiResource<{ faculties: Faculty[] }>(
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
        <p className="text-meta text-text-secondary">Chargement...</p>
      </main>
    );
  }

  const myFacultyIndex = user.facultyId ? faculties.findIndex((f) => f.id === user.facultyId) : -1;
  const myFaculty = myFacultyIndex >= 0 ? faculties[myFacultyIndex] : null;
  const myFacultyYears = myFacultyIndex >= 0 && yearBatches.length > myFacultyIndex ? yearBatches[myFacultyIndex]?.years ?? [] : [];
  const myYear = myFaculty ? myFacultyYears.find((y) => y.id === user.yearId) ?? null : null;

  return (
    <>
      <AppHeader user={user} onLogout={handleLogout} nav={HEADER_NAV} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-card-padding py-section-gap">
        <section aria-label="Présentation de la bibliothèque" className="mx-auto max-w-3xl text-center">
          <p className="text-meta font-medium uppercase tracking-wide text-accent-library">Catalogue des cours</p>
          <h1 className="mt-2 font-display text-hero font-bold leading-tight text-text-primary">
            La bibliothèque de cours
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-body text-text-secondary">
            Les programmes officiels des facultés de médecine et de pharmacie, organisés par année, module et unité.
            Tous les cours sont gratuits pour les membres inscrits.
          </p>
        </section>

        {myFaculty ? (
          <section aria-label="Ma filière" className="mx-auto mt-section-gap max-w-4xl">
            <Link
              href={myYear ? `/years/${myYear.id}/modules` : `/faculties/${myFaculty.id}/years`}
              className="group flex flex-col gap-2 rounded-card-lg border border-border bg-surface-2 p-card-padding shadow-card transition hover:border-border-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2"
              style={{ borderTop: `3px solid ${accentVar("library")}`, boxShadow: "0 0 28px color-mix(in srgb, var(--color-accent-library) 12%, transparent)" }}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-meta font-medium uppercase tracking-wide text-accent-library">Ma filière</p>
                <span className="rounded-pill border border-accent-library/40 bg-accent-library/15 px-2.5 py-0.5 text-caption font-medium text-accent-library">
                  Votre parcours
                </span>
              </div>
              <h2 className={cx("font-display text-h2 font-semibold", accentText("library"))}>
                {myYear ? `${myFaculty.name} · ${myYear.label}` : myFaculty.name}
              </h2>
              <p className="text-body text-text-secondary">
                {myYear
                  ? "Reprenez vos modules et suivez votre progression sur votre année."
                  : "Choisissez votre année pour retrouver vos modules."}
              </p>
              <span className="mt-1 inline-flex min-h-touch-target w-fit items-center justify-center gap-2 rounded-control px-5 text-body font-semibold text-background transition group-hover:brightness-110 active:scale-[0.98]">
                {myYear ? "Reprendre mes cours" : "Choisir mon année"}
                <span aria-hidden className="transition-transform group-hover:translate-x-1">
                  →
                </span>
              </span>
            </Link>
          </section>
        ) : (
          <section
            aria-label="Choix de la filière"
            className="mx-auto mt-section-gap max-w-4xl rounded-panel border border-dashed border-border bg-surface-1 p-card-padding text-center shadow-card"
          >
            <p className="font-display text-h3 font-semibold text-text-primary">Choisissez votre filière</p>
            <p className="mt-1 text-meta text-text-secondary">
              Indiquez votre faculté et votre année dans votre profil pour accéder directement à votre programme.
            </p>
          </section>
        )}

        <section aria-label="Toutes les facultés" className="mx-auto mt-section-gap max-w-4xl">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-h3 font-semibold text-text-primary">Toutes les facultés</h2>
            <p className="text-meta text-text-tertiary">
              {isLoading ? "Chargement..." : plural(faculties.length, "faculté disponible")}
            </p>
          </div>

          {isLoading && <p className="mt-4 text-meta text-text-secondary">Chargement des facultés...</p>}
          {error && (
            <p role="alert" className="mt-4 rounded-panel border border-danger/30 bg-danger/10 px-3 py-2 text-meta text-danger">
              {error}
            </p>
          )}

          {!isLoading && !error && faculties.length === 0 && (
            <p className="mt-4 text-meta text-text-secondary">Aucune faculté n&apos;est disponible pour le moment.</p>
          )}

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
                        ? "Chargement des années…"
                        : plural(yearCount ?? 0, "année")
                    }
                    actionLabel="Explorer"
                    meta={
                      isMine ? (
                        <span className="rounded-pill border border-accent-library/40 bg-accent-library/15 px-2 py-0.5 font-medium text-accent-library">
                          Votre filière
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
        </section>

        <p className="mt-section-gap text-center text-meta text-text-tertiary">
          Le catalogue est entièrement gratuit pour tous les membres — aucun abonnement requis pour accéder aux cours.
        </p>
      </main>

      <Footer />
    </>
  );
}
