"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useApiResource } from "@/lib/useApiResource";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { AppHeader, EmptyState, Footer, LoadingSkeleton } from "@/components";

interface ResourceItem {
  id: string;
  title: string;
  type: string;
  fileUrl: string;
  sourceLabel: string | null;
  facultyId: string | null;
  yearId: string | null;
  faculty: { id: string; name: string } | null;
  year: { id: string; label: string } | null;
  createdAt: string;
}

/** Embedded viewer only for PDFs — other file types keep the download link. */
function isPdfUrl(fileUrl: string): boolean {
  return /\.pdf($|\?|#)/i.test(fileUrl.trim());
}

function typeLabel(type: string): string {
  switch (type) {
    case "official_drive":
      return "Drive officiel";
    case "reference":
      return "Référence";
    case "past_exam":
      return "Ancien examen";
    case "other":
      return "Autre";
    default:
      return type;
  }
}

function ResourceDetailContent() {
  const { logout } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { user, isHydrated } = useRequireAuth();
  const { data, error, isLoading, refetch } = useApiResource<{ resource: ResourceItem }>(
    isHydrated && user && params?.id ? `/resources/${params.id}` : null
  );
  const resource = data?.resource ?? null;

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
            <LoadingSkeleton className="h-8 w-64" ariaLabel="Chargement de la ressource" />
            <LoadingSkeleton className="h-48 w-full rounded-card" />
          </div>
        ) : null}

        {error ? (
          <div className="rounded-card border border-danger bg-surface-1 p-card-padding" role="alert">
            <p className="text-body text-danger">{error}</p>
            <button
              type="button"
              onClick={refetch}
              className="mt-3 inline-flex min-h-touch-target w-full items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2 sm:w-auto"
            >
              Réessayer
            </button>
          </div>
        ) : null}

        {!isLoading && !error && !resource ? (
          <EmptyState
            title="Ressource introuvable"
            description="Cette ressource n'existe pas ou n'est pas disponible pour votre compte."
            action={{ label: "Retour aux ressources", href: "/resources" }}
          />
        ) : null}

        {resource ? (
          <>
            <nav aria-label="Fil d'Ariane" className="flex min-h-touch-target flex-wrap items-center gap-1 text-meta">
              <Link
                href="/resources"
                className="font-medium text-text-secondary transition hover:text-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                Ressources
              </Link>
              {resource.faculty ? (
                <>
                  <span aria-hidden className="text-text-tertiary">›</span>
                  <Link
                    href={`/resources?faculty=${resource.faculty.id}`}
                    className="font-medium text-text-secondary transition hover:text-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                  >
                    {resource.faculty.name}
                  </Link>
                </>
              ) : null}
              {resource.year ? (
                <>
                  <span aria-hidden className="text-text-tertiary">›</span>
                  <Link
                    href={`/resources?faculty=${resource.facultyId ?? ""}&year=${resource.year.id}`}
                    className="font-medium text-text-secondary transition hover:text-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                  >
                    {resource.year.label}
                  </Link>
                </>
              ) : null}
              <span aria-hidden className="text-text-tertiary">›</span>
              <span aria-current="page" className="max-w-48 truncate font-medium text-text-primary">
                {resource.title}
              </span>
            </nav>

            <Link
              href="/resources"
              className="mt-2 inline-flex min-h-touch-target items-center gap-1 text-meta font-medium text-text-secondary transition hover:text-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <span aria-hidden>←</span> Retour aux ressources
            </Link>

            <header className="mt-2">
              <p className="text-meta font-medium uppercase tracking-wide text-accent-soft">Ressource · {typeLabel(resource.type)}</p>
              <h1 className="mt-1 font-display text-h1 font-bold leading-tight text-text-primary">{resource.title}</h1>
            </header>

            <article
              className="mt-section-gap rounded-card-lg border border-border bg-surface-1 p-card-padding shadow-card"
              data-resource-detail
              data-file-url={resource.fileUrl}
            >
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-meta font-medium uppercase tracking-wide text-text-secondary">Type</dt>
                  <dd className="mt-1 text-body text-text-primary">{typeLabel(resource.type)}</dd>
                </div>
                {resource.sourceLabel ? (
                  <div>
                    <dt className="text-meta font-medium uppercase tracking-wide text-text-secondary">Source / attribution</dt>
                    <dd className="mt-1 text-body text-text-primary">{resource.sourceLabel}</dd>
                  </div>
                ) : null}
              </dl>

              <div className="mt-section-gap border-t border-border pt-section-gap">
                {isPdfUrl(resource.fileUrl) ? (
                  <div>
                    <p className="mb-2 text-meta font-medium text-text-secondary">
                      Aperçu intégré — le téléchargement reste disponible ci-dessous.
                    </p>
                    <iframe
                      src={resource.fileUrl}
                      title={`Aperçu : ${resource.title}`}
                      className="h-[70vh] w-full rounded-panel border border-border bg-surface-2"
                    />
                  </div>
                ) : null}
                <a
                  href={resource.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex min-h-touch-target items-center justify-center gap-2 rounded-control bg-accent-primary px-5 text-body font-medium text-on-accent shadow-glow-primary transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring first:mt-0"
                >
                  Télécharger la ressource
                </a>
              </div>
            </article>
          </>
        ) : null}
      </main>

      <Footer />
    </>
  );
}

export default function ResourceDetailPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center px-card-padding">
          <LoadingSkeleton className="h-8 w-48" ariaLabel="Chargement" />
        </main>
      }
    >
      <ResourceDetailContent />
    </Suspense>
  );
}