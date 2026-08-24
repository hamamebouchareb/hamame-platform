"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { apiFetch, ApiError } from "@/lib/api";
import { AppHeader, EmptyState, Footer, ReviewCard, useToast } from "@/components";
import type { ReviewQueueItem, ReviewQueueResponse } from "@/lib/types";

const PAGE_LIMIT = 20;

const HEADER_NAV = [
  { href: "/dashboard", label: "Tableau de bord" },
  { href: "/faculties", label: "QCM" },
  { href: "/notes", label: "Studio" },
  { href: "/subscription", label: "Abonnement" },
];

interface ItemActionState {
  isSubmitting: boolean;
  error: string | null;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "Une erreur est survenue. Réessayez.";
}

export default function ReviewPage() {
  const router = useRouter();
  const { logout } = useAuth();
  const { user, isHydrated } = useRequireAuth();
  const { success } = useToast();
  const canFetch = isHydrated && !!user;

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const [actionState, setActionState] = useState<Record<string, ItemActionState>>({});
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState("");

  const loadQueue = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setErrorCode(null);
    try {
      const data = await apiFetch<ReviewQueueResponse>(`/review/queue?page=1&limit=${PAGE_LIMIT}`);
      setItems(data.items);
    } catch (err) {
      setError(errorMessage(err));
      setErrorCode(err instanceof ApiError ? err.code : null);
    } finally {
      setIsLoading(false);
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (canFetch && !isLoaded) {
      loadQueue();
    }
  }, [canFetch, isLoaded, loadQueue]);

  function removeItem(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
    setActionState((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function handleApprove(item: ReviewQueueItem) {
    setActionState((prev) => ({ ...prev, [item.id]: { isSubmitting: true, error: null } }));
    try {
      await apiFetch(`/review/${item.contentType}/${item.id}/approve`, { method: "POST" });
      removeItem(item.id);
      success({ title: "Élément approuvé" });
    } catch (err) {
      setActionState((prev) => ({ ...prev, [item.id]: { isSubmitting: false, error: errorMessage(err) } }));
    }
  }

  function startReject(id: string) {
    setRejectingId(id);
    setRejectComment("");
  }

  function cancelReject() {
    setRejectingId(null);
    setRejectComment("");
  }

  async function handleConfirmReject(item: ReviewQueueItem) {
    if (rejectComment.trim().length === 0) return;
    setActionState((prev) => ({ ...prev, [item.id]: { isSubmitting: true, error: null } }));
    try {
      await apiFetch(`/review/${item.contentType}/${item.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reviewComment: rejectComment.trim() }),
      });
      setRejectingId(null);
      setRejectComment("");
      removeItem(item.id);
      success({ title: "Élément rejeté" });
    } catch (err) {
      setActionState((prev) => ({ ...prev, [item.id]: { isSubmitting: false, error: errorMessage(err) } }));
    }
  }

  if (!isHydrated || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-card-padding">
        <p className="text-meta text-text-secondary">Chargement...</p>
      </main>
    );
  }

  // AuthContext roles (from GET /users/me) — same gate as the dashboard link.
  // The 403 FORBIDDEN path covers the API rejecting the call regardless.
  const canReview = user.roles.includes("academic_reviewer") || user.roles.includes("admin");

  if (!canReview || errorCode === "FORBIDDEN") {
    return (
      <>
        <AppHeader user={user} onLogout={handleLogout} nav={HEADER_NAV} />
        <main className="mx-auto w-full max-w-md flex-1 px-card-padding py-section-gap">
          <h1 className="font-display text-h2 font-semibold text-text-primary">File de revue</h1>
          <div className="mt-4">
            <EmptyState
              title="Accès refusé"
              description="Vous n'avez pas la permission d'accéder à cette page."
              action={{ label: "Retour au tableau de bord", href: "/dashboard" }}
            />
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <AppHeader user={user} onLogout={handleLogout} nav={HEADER_NAV} />
      <main className="mx-auto w-full max-w-md flex-1 px-card-padding py-section-gap">
        <h1 className="font-display text-h2 font-semibold text-text-primary">File de revue</h1>

        {isLoading && !isLoaded && <p className="mt-4 text-meta text-text-secondary">Chargement de la file...</p>}
        {error && !isLoaded && (
          <div className="mt-4 rounded-card border border-danger bg-surface-1 p-card-padding">
            <p className="text-body text-danger">{error}</p>
            <button
              type="button"
              onClick={loadQueue}
              className="mt-3 inline-flex min-h-touch-target items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2"
            >
              Réessayer
            </button>
          </div>
        )}

        {isLoaded && !error && items.length === 0 && (
          <div className="mt-4">
            <EmptyState
              title="Rien en attente"
              description="Aucun contenu n'attend une revue pour le moment."
              action={{ label: "Retour au tableau de bord", href: "/dashboard" }}
            />
          </div>
        )}

        <ul className="mt-4 flex flex-col gap-3">
          {items.map((item) => {
            const state = actionState[item.id];
            const isSubmitting = state?.isSubmitting ?? false;
            const isRejecting = rejectingId === item.id;

            return (
              <ReviewCard
                key={item.id}
                item={item}
                isSubmitting={isSubmitting}
                error={state?.error}
                onApprove={() => handleApprove(item)}
                onRejectStart={() => startReject(item.id)}
                onRejectCancel={cancelReject}
                onRejectConfirm={() => handleConfirmReject(item)}
                rejecting={isRejecting}
                rejectComment={rejectComment}
                onRejectCommentChange={setRejectComment}
              />
            );
          })}
        </ul>
      </main>
      <Footer />
    </>
  );
}
