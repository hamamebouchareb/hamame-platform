"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useApiResource } from "@/lib/useApiResource";
import { apiFetch, ApiError } from "@/lib/api";
import { AppHeader, Footer, CourseCard } from "@/components";
import type { LessonSummary, SessionDetail } from "@/lib/types";

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

const SESSION_SIZE = 20;
const EXAM_TIME_LIMIT_SECONDS = 1200; // 20 minutes

type SessionMode = "practice" | "exam";

interface QuestionListInfo {
  pagination: { total: number };
}

export default function UnitDetailPage() {
  const { logout } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { user, isHydrated } = useRequireAuth();
  const unitId = params.id;

  const [search, setSearch] = useState("");
  const [startingMode, setStartingMode] = useState<SessionMode | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const canFetch = isHydrated && !!user;
  const { data: lessonsData, error: lessonsError, isLoading: lessonsLoading } = useApiResource<{
    lessons: LessonSummary[];
  }>(canFetch ? `/units/${unitId}/lessons` : null);
  const { data: questionsData } = useApiResource<QuestionListInfo>(
    canFetch ? `/questions?unitId=${unitId}&limit=1` : null
  );

  const lessons = useMemo(() => lessonsData?.lessons ?? [], [lessonsData]);
  const questionCount = questionsData?.pagination.total ?? 0;
  const normalizedSearch = search.trim().toLocaleLowerCase("fr");
  const visibleLessons = useMemo(
    () =>
      lessons.filter((lesson) =>
        normalizedSearch === "" ? true : lesson.title.toLocaleLowerCase("fr").includes(normalizedSearch)
      ),
    [lessons, normalizedSearch]
  );

  async function startSession(mode: SessionMode) {
    setStartError(null);
    setStartingMode(mode);
    try {
      const { session } = await apiFetch<{ session: SessionDetail }>("/sessions", {
        method: "POST",
        body: JSON.stringify({
          name: mode === "practice" ? "Séance d'entraînement de l'unité" : "Examen de l'unité",
          mode,
          unitIds: [unitId],
          size: SESSION_SIZE,
          ...(mode === "exam" ? { timeLimitSeconds: EXAM_TIME_LIMIT_SECONDS } : {}),
        }),
      });
      router.push(`/sessions/${session.id}`);
    } catch (err) {
      setStartError(err instanceof ApiError ? err.message : "Une erreur est survenue. Veuillez réessayer.");
      setStartingMode(null);
    }
  }

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

  return (
    <>
      <AppHeader user={user} onLogout={handleLogout} nav={HEADER_NAV} />

      <main className="mx-auto w-full max-w-4xl flex-1 px-card-padding py-section-gap">
        <Link
          href="/faculties"
          className="inline-flex min-h-touch-target items-center gap-1 text-meta font-medium text-text-secondary transition hover:text-accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <span aria-hidden>←</span> Bibliothèque
        </Link>

        <header className="mt-2">
          <p className="text-meta font-medium uppercase tracking-wide text-accent-library">Leçons de l&apos;unité</p>
          <h1 className="mt-1 font-display text-hero font-bold leading-tight text-text-primary">Cours et entraînement</h1>
          <p className="mt-2 text-body text-text-secondary">
            {lessonsLoading
              ? "Chargement…"
              : `${plural(lessons.length, "leçon")}${questionCount > 0 ? ` · ${plural(questionCount, "question QCM")}` : ""}`}
          </p>
        </header>

        <section aria-label="Lancer une session" className="mt-section-gap">
          <h2 className="font-display text-h3 font-semibold text-text-primary">Lancer une session</h2>
          <div className="mt-3 grid gap-card-gap sm:grid-cols-2">
            <button
              type="button"
              onClick={() => startSession("practice")}
              disabled={startingMode !== null}
              className="inline-flex min-h-touch-target items-center justify-center gap-2 rounded-control bg-accent-library px-5 text-body font-semibold text-background shadow-glow-library transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
            >
              {startingMode === "practice" ? "Démarrage…" : "Entraînement — correction immédiate"}
            </button>
            <button
              type="button"
              onClick={() => startSession("exam")}
              disabled={startingMode !== null}
              className="inline-flex min-h-touch-target items-center justify-center gap-2 rounded-control border border-accent-secondary/50 bg-accent-secondary/10 px-5 text-body font-semibold text-accent-secondary transition hover:bg-accent-secondary/20 active:scale-[0.98] disabled:opacity-60"
            >
              {startingMode === "exam" ? "Démarrage…" : "Examen chronométré (20 min)"}
            </button>
          </div>
          {startError && (
            <p role="alert" className="mt-3 rounded-panel border border-danger/30 bg-danger/10 px-3 py-2 text-meta text-danger">
              {startError}
            </p>
          )}
        </section>

        <section aria-label="Leçons" className="mt-section-gap">
          <label className="relative block max-w-md">
            <span className="sr-only">Rechercher une leçon</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher une leçon…"
              className="h-11 w-full rounded-input border border-border bg-surface-2 pl-10 pr-3 text-body text-text-primary placeholder:text-text-tertiary transition focus:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            />
            <svg
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.5" y2="16.5" />
            </svg>
          </label>

          {lessonsLoading && <p className="mt-4 text-meta text-text-secondary">Chargement des leçons...</p>}
          {lessonsError && (
            <p role="alert" className="mt-4 rounded-panel border border-danger/30 bg-danger/10 px-3 py-2 text-meta text-danger">
              {lessonsError}
            </p>
          )}
          {!lessonsLoading && !lessonsError && lessons.length === 0 && (
            <p className="mt-4 text-meta text-text-secondary">Aucune leçon n&apos;est disponible pour le moment.</p>
          )}
          {!lessonsLoading && !lessonsError && lessons.length > 0 && visibleLessons.length === 0 && (
            <p className="mt-4 text-meta text-text-secondary">Aucune leçon ne correspond à ces critères.</p>
          )}

          <ul className="mt-4 flex flex-col gap-card-gap">
            {visibleLessons.map((lesson) => (
              <li key={lesson.id}>
                <CourseCard
                  href={`/lessons/${lesson.id}`}
                  title={lesson.title}
                  tone="library"
                  actionLabel="Commencer"
                  meta={
                    <span
                      className={
                        lesson.contentTier === "hamame_plus"
                          ? "rounded-pill border border-accent-secondary/40 bg-accent-secondary/15 px-2 py-0.5 font-medium text-accent-secondary"
                          : "rounded-pill border border-success/40 bg-success/15 px-2 py-0.5 font-medium text-success"
                      }
                    >
                      {lesson.contentTier === "hamame_plus" ? "Hamame+" : "Contenu officiel"}
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      </main>

      <Footer />
    </>
  );
}
