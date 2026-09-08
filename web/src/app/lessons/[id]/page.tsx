"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useApiResource } from "@/lib/useApiResource";
import { extractParagraphs } from "@/lib/richtext";
import { AppHeader, EmptyState, Footer, LoadingSkeleton } from "@/components";
import type { LessonDetail } from "@/lib/types";

export default function LessonDetailPage() {
  const { logout } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { user, isHydrated } = useRequireAuth();
  const { data: lesson, error, isLoading, refetch } = useApiResource<LessonDetail>(
    isHydrated && user ? `/lessons/${params.id}` : null
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

      <main className="mx-auto w-full max-w-3xl flex-1 px-card-padding py-section-gap">
        {isLoading ? (
          <div className="flex flex-col gap-4">
            <LoadingSkeleton className="h-8 w-64" ariaLabel="Chargement de la leçon" />
            <LoadingSkeleton className="h-48 w-full rounded-card" />
          </div>
        ) : null}
        {error ? (
          <div className="rounded-card border border-danger bg-surface-1 p-card-padding">
            <p role="alert" className="text-body text-danger">
              {error}
            </p>
            <button
              type="button"
              onClick={refetch}
              className="mt-3 inline-flex min-h-touch-target w-full items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2 sm:w-auto"
            >
              Réessayer
            </button>
          </div>
        ) : null}
        {!isLoading && !error && !lesson ? (
          <EmptyState
            title="Leçon introuvable"
            description="Cette leçon n'est pas disponible. Revenez à la bibliothèque pour en choisir une autre."
            action={{ label: "Retour à la bibliothèque", href: "/faculties" }}
          />
        ) : null}

        {lesson && (
          <>
            <Link
              href={`/units/${lesson.unitId}`}
              className="inline-flex min-h-touch-target items-center gap-1 text-meta font-medium text-text-secondary transition hover:text-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <span aria-hidden>←</span> Retour aux leçons
            </Link>

            <header className="mt-2">
              <p className="text-meta font-medium uppercase tracking-wide text-accent-soft">Leçon</p>
              <h1 className="mt-1 font-display text-h1 font-bold leading-tight text-text-primary">{lesson.title}</h1>
            </header>

            <article className="mt-section-gap rounded-card-lg border border-border bg-surface-1 p-card-padding shadow-card">
              <div className="flex flex-col gap-4 text-body leading-relaxed text-text-primary">
                {extractParagraphs(lesson.currentVersion.bodyRichtext).map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </article>

            <p className="mt-section-gap text-center text-meta text-text-tertiary">
              Cette leçon est marquée comme lue dès son ouverture — votre progression est mise à jour automatiquement.
            </p>
          </>
        )}
      </main>

      <Footer />
    </>
  );
}
