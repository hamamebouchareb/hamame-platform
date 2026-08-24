"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { apiFetch } from "@/lib/api";
import { useApiResource } from "@/lib/useApiResource";
import { AppHeader, EmptyState, Footer, LoadingSkeleton, ProgressBar } from "@/components";
import { RevisionCard } from "@/components/RevisionCard";
import { accentVar } from "@/components/FeatureCard";
import type { DueReviewItem, ReviewCompleteResponse, ReviewSettings } from "@/lib/types";

const HEADER_NAV = [
  { href: "/dashboard", label: "Tableau de bord" },
  { href: "/qcm", label: "QCM" },
  { href: "/faculties", label: "Bibliothèque" },
  { href: "/suivi", label: "Suivi" },
  { href: "/revision", label: "Révision", active: true },
];

const ESTIMATED_SECONDS_PER_ITEM = 20;

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} secondes`;
  const minutes = Math.round(seconds / 60);
  if (minutes === 1) return "1 minute";
  return `${minutes} minutes`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-DZ", { dateStyle: "long" });
}

type View = "landing" | "reviewing" | "summary";

interface ReviewSession {
  queue: DueReviewItem[];
  currentIndex: number;
  completedCount: number;
  passedCount: number;
  nextDueDate: string | null;
}

export default function RevisionPage() {
  const { logout } = useAuth();
  const router = useRouter();
  const { user, isHydrated } = useRequireAuth();
  const canFetch = isHydrated && !!user;

  const dueItems = useApiResource<{ items: DueReviewItem[] }>(canFetch ? "/reviews/due" : null);
  const settings = useApiResource<{ settings: ReviewSettings }>(canFetch ? "/reviews/settings" : null);

  const [view, setView] = useState<View>("landing");
  const [session, setSession] = useState<ReviewSession | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queue = dueItems.data?.items ?? [];
  const hasItems = queue.length > 0;
  const isLoading = dueItems.isLoading || settings.isLoading;

  const estimatedTime = useMemo(() => {
    if (!session) return queue.length * ESTIMATED_SECONDS_PER_ITEM;
    const remaining = session.queue.length - session.currentIndex;
    return remaining * ESTIMATED_SECONDS_PER_ITEM;
  }, [queue.length, session]);

  const currentItem = session && session.currentIndex < session.queue.length
    ? session.queue[session.currentIndex]
    : null;

  function handleLogout() {
    logout();
    router.push("/login");
  }

  function startSession() {
    setSession({
      queue: [...queue],
      currentIndex: 0,
      completedCount: 0,
      passedCount: 0,
      nextDueDate: null,
    });
    setView("reviewing");
    setError(null);
  }

  const completeItem = useCallback(async (quality: number) => {
    if (!currentItem || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await apiFetch<ReviewCompleteResponse>(
        `/reviews/${currentItem.id}/complete`,
        {
          method: "POST",
          body: JSON.stringify({ quality }),
        }
      );

      const passed = quality >= 3;

      setSession((prev) => {
        if (!prev) return prev;
        const nextIndex = prev.currentIndex + 1;
        const isDone = nextIndex >= prev.queue.length;

        if (isDone) {
          // Transition to summary outside the setState to avoid effect-driven cascades.
          // Queue a micro-task so React processes the session state first.
          queueMicrotask(() => setView("summary"));
        }

        return {
          ...prev,
          currentIndex: nextIndex,
          completedCount: prev.completedCount + 1,
          passedCount: prev.passedCount + (passed ? 1 : 0),
          nextDueDate: isDone ? response.item.dueAt : prev.nextDueDate,
        };
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur lors de l'enregistrement.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [currentItem, isSubmitting]);

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
        {/* Hero */}
        <section aria-label="En-tête des révisions" className="text-center">
          <p className="text-meta font-medium uppercase tracking-wide text-accent-revision">Répétition espacée</p>
          <h1 className="mt-2 font-display text-hero font-bold leading-tight text-text-primary">Révision</h1>
          <p className="mx-auto mt-3 max-w-xl text-body text-text-secondary">
            Révisez les éléments que vous avez oubliés ou mal mémorisés. Chaque réponse
            ajuste automatiquement la date de prochaine révision.
          </p>
        </section>

        {/* Landing view */}
        {view === "landing" && (
          <>
            {isLoading ? (
              <div className="mx-auto mt-section-gap max-w-lg flex flex-col gap-4">
                <div className="rounded-card border border-border bg-surface-1 p-card-padding shadow-card">
                  <LoadingSkeleton className="h-5 w-40" ariaLabel="Chargement des révisions" />
                  <LoadingSkeleton className="mt-3 h-8 w-24" ariaLabel="" />
                </div>
                <LoadingSkeleton className="h-12 w-full rounded-card" ariaLabel="" />
              </div>
            ) : !hasItems ? (
              /* Empty state — nothing due */
              <div className="mx-auto mt-section-gap max-w-lg">
                <EmptyState
                  title="Aucune révision pour le moment"
                  description="Vous êtes à jour ! Revenez plus tard ou lancez une session QCM pour accumuler de nouvelles révisions."
                  action={{ label: "Créer une session QCM", href: "/qcm" }}
                />
              </div>
            ) : (
              <div className="mx-auto mt-section-gap max-w-lg">
                {/* Stats card */}
                <article
                  aria-live="polite"
                  className="rounded-card border border-border bg-surface-1 p-card-padding shadow-card"
                  style={{ borderTop: `3px solid ${accentVar("revision")}` }}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div>
                      <p className="font-display text-display font-bold text-text-primary">{queue.length}</p>
                      <p className="text-meta text-text-secondary">
                        élément{queue.length > 1 ? "s" : ""} à réviser
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-h3 font-semibold text-text-primary">
                        ~{formatDuration(estimatedTime)}
                      </p>
                      <p className="text-meta text-text-tertiary">temps estimé</p>
                    </div>
                  </div>

                  <ProgressBar
                    className="mt-4"
                    value={0}
                    label="Progression de la session"
                    valueLabel="0%"
                    tone="primary"
                  />
                </article>

                {/* Action button */}
                <button
                  type="button"
                  onClick={startSession}
                  className="mt-4 inline-flex min-h-touch-target w-full items-center justify-center gap-2 rounded-control bg-accent-primary px-5 text-body font-medium text-background shadow-glow-primary transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  Commencer les révisions
                </button>

                {/* Settings info */}
                {settings.data?.settings && settings.data.settings.isEnabled && (
                  <p className="mt-3 text-caption text-text-tertiary text-center">
                    Révisions activées · Jours : {settings.data.settings.scheduleDays.length > 0
                      ? settings.data.settings.scheduleDays.join(", ")
                      : "non configuré"}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {/* Reviewing view */}
        {view === "reviewing" && session && currentItem && (
          <div className="mx-auto mt-section-gap max-w-lg">
            {/* Progress bar */}
            <div className="mb-4">
              <p className="mb-1 text-meta text-text-secondary">
                {session.currentIndex + 1} / {session.queue.length}
              </p>
              <ProgressBar
                value={session.currentIndex}
                max={session.queue.length}
                label="Progression de la session"
                tone="primary"
              />
            </div>

            {/* Current card */}
            <RevisionCard
              item={currentItem}
              isSubmitting={isSubmitting}
              error={error}
              onRate={completeItem}
            />

            {/* Quick stats */}
            <div className="mt-3 flex items-center justify-between text-caption text-text-tertiary">
              <span>
                {session.completedCount} terminé{session.completedCount > 1 ? "s" : ""}
              </span>
              <span>
                ~{formatDuration(estimatedTime)} restant{estimatedTime > 60 ? "s" : ""}
              </span>
            </div>
          </div>
        )}

        {/* Summary view */}
        {view === "summary" && session && (
          <div className="mx-auto mt-section-gap max-w-lg">
            <article
              aria-live="polite"
              className="rounded-card border border-border bg-surface-1 p-card-padding shadow-card"
              style={{ borderTop: `3px solid ${accentVar("revision")}` }}
            >
              <h2 className="font-display text-h2 font-semibold text-text-primary">Session terminée</h2>

              <div className="mt-4 grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="font-display text-display font-bold text-text-primary">{session.completedCount}</p>
                  <p className="text-meta text-text-secondary">révisés</p>
                </div>
                <div className="text-center">
                  <p className="font-display text-display font-bold text-success">{session.passedCount}</p>
                  <p className="text-meta text-text-secondary">mémorisés</p>
                </div>
                <div className="text-center">
                  <p className="font-display text-display font-bold text-danger">
                    {session.completedCount - session.passedCount}
                  </p>
                  <p className="text-meta text-text-secondary">à revoir</p>
                </div>
              </div>

              <ProgressBar
                className="mt-4"
                value={session.completedCount > 0 ? (session.passedCount / session.completedCount) * 100 : 0}
                label="Taux de réussite"
                tone={session.passedCount === session.completedCount ? "success" : "primary"}
              />

              {session.nextDueDate && (
                <p className="mt-4 text-body text-text-secondary text-center">
                  Prochaine révision : <strong>{formatDate(session.nextDueDate)}</strong>
                </p>
              )}
            </article>

            <div className="mt-4 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => {
                  setView("landing");
                  setSession(null);
                  setError(null);
                  dueItems.refetch();
                }}
                className="inline-flex min-h-touch-target w-full items-center justify-center gap-2 rounded-control border border-border px-5 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2"
              >
                Retour aux révisions
              </button>
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="inline-flex min-h-touch-target w-full items-center justify-center gap-2 rounded-control bg-accent-primary px-5 text-body font-medium text-background shadow-glow-primary transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                Retour au tableau de bord
              </button>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </>
  );
}
