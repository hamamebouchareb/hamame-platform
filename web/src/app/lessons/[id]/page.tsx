"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useApiResource } from "@/lib/useApiResource";
import { extractParagraphs } from "@/lib/richtext";
import { AppHeader, Footer } from "@/components";
import type { LessonDetail } from "@/lib/types";

const HEADER_NAV = [
  { href: "/dashboard", label: "Tableau de bord" },
  { href: "/faculties", label: "Bibliothèque", active: true },
  { href: "/qcm", label: "QCM" },
  { href: "/notes", label: "Notes" },
  { href: "/subscription", label: "Abonnement" },
];

export default function LessonDetailPage() {
  const { logout } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { user, isHydrated } = useRequireAuth();
  const { data: lesson, error, isLoading } = useApiResource<LessonDetail>(
    isHydrated && user ? `/lessons/${params.id}` : null
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

  return (
    <>
      <AppHeader user={user} onLogout={handleLogout} nav={HEADER_NAV} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-card-padding py-section-gap">
        {isLoading && <p className="text-meta text-text-secondary">Chargement de la leçon...</p>}
        {error && (
          <p role="alert" className="rounded-panel border border-danger/30 bg-danger/10 px-3 py-2 text-meta text-danger">
            {error}
          </p>
        )}

        {lesson && (
          <>
            <Link
              href={`/units/${lesson.unitId}`}
              className="inline-flex min-h-touch-target items-center gap-1 text-meta font-medium text-text-secondary transition hover:text-accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <span aria-hidden>←</span> Retour aux leçons
            </Link>

            <header className="mt-2">
              <p className="text-meta font-medium uppercase tracking-wide text-accent-library">Leçon</p>
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
