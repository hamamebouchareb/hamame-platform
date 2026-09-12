"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { apiFetch, ApiError } from "@/lib/api";
import { AppHeader, EmptyState, Footer, LoadingSkeleton } from "@/components";
import { cx } from "@/lib/cx";
import type { NotificationItem } from "@/components/NotificationsBell";

type NotificationTab = "all" | "social" | "prix" | "systeme";

const TABS: { id: NotificationTab; label: string }[] = [
  { id: "all", label: "Tout" },
  { id: "social", label: "Social" },
  { id: "prix", label: "Prix" },
  { id: "systeme", label: "Système" },
];

const PAGE_LIMIT = 20;

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function NotificationsPage() {
  const { logout } = useAuth();
  const router = useRouter();
  const { user, isHydrated } = useRequireAuth();

  const [tab, setTab] = useState<NotificationTab>("all");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const loadPage = useCallback(
    async (nextPage: number, nextTab: NotificationTab) => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: String(nextPage),
          limit: String(PAGE_LIMIT),
        });
        if (nextTab !== "all") params.set("category", nextTab);
        const data = await apiFetch<{
          notifications: NotificationItem[];
          unreadCount: number;
          pagination: { page: number; limit: number; total: number };
        }>(`/notifications?${params.toString()}`);
        setItems(data.notifications);
        setUnreadCount(data.unreadCount);
        setTotal(data.pagination.total);
        setPage(data.pagination.page);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Notifications indisponibles. Réessayez.");
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (isHydrated && user) void loadPage(1, tab);
  }, [isHydrated, user, tab, loadPage]);

  async function markRead(item: NotificationItem) {
    if (item.isRead) return;
    setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await apiFetch(`/notifications/${item.id}/read`, { method: "PATCH" });
    } catch {
      if (user) void loadPage(page, tab);
    }
  }

  async function markAllRead() {
    try {
      await apiFetch("/notifications/read-all", { method: "POST" });
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      if (user) void loadPage(page, tab);
    }
  }

  if (!isHydrated || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-card-padding">
        <LoadingSkeleton className="h-8 w-48" ariaLabel="Chargement" />
      </main>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  return (
    <>
      <AppHeader user={user} onLogout={handleLogout} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-card-padding py-section-gap">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-h1 font-bold leading-tight text-text-primary">Notifications</h1>
            <p className="mt-1 text-body text-text-secondary">
              {unreadCount > 0 ? `${unreadCount} non lue${unreadCount === 1 ? "" : "s"}` : "Tout est lu"}
            </p>
          </div>
          {unreadCount > 0 && !isLoading ? (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="inline-flex min-h-touch-target shrink-0 items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2"
            >
              Tout marquer comme lu
            </button>
          ) : null}
        </div>

        <div className="mt-4 flex gap-1 overflow-x-auto pb-1" role="group" aria-label="Filtrer par catégorie">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tab === t.id}
              onClick={() => {
                setTab(t.id);
                setPage(1);
              }}
              className={cx(
                "shrink-0 rounded-pill px-4 py-1.5 text-body font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                tab === t.id
                  ? "bg-accent-primary text-on-accent"
                  : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="mt-4 flex flex-col gap-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <LoadingSkeleton key={i} className="h-20 w-full rounded-card" />
            ))}
          </div>
        ) : error ? (
          <div className="mt-4 rounded-card border border-danger bg-surface-1 p-card-padding">
            <p role="alert" className="text-body text-danger">{error}</p>
            <button
              type="button"
              onClick={() => void loadPage(page, tab)}
              className="mt-3 inline-flex min-h-touch-target w-full items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2 sm:w-auto"
            >
              Réessayer
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="Aucune notification"
              description="Vos notifications apparaîtront ici."
              action={{ label: "Retour au tableau de bord", href: "/dashboard" }}
            />
          </div>
        ) : (
          <>
            <ul className="mt-4 flex flex-col gap-card-gap">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-card border border-border bg-surface-1 p-card-padding shadow-card"
                >
                  <button
                    type="button"
                    onClick={() => void markRead(item)}
                    aria-label={item.isRead ? item.title : `${item.title} — marquer comme lue`}
                    className="block w-full rounded-control text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                  >
                    <span className="flex items-center gap-2">
                      {!item.isRead ? (
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent-primary" aria-hidden />
                      ) : null}
                      <span className="min-w-0 flex-1 truncate text-body font-semibold text-text-primary">
                        {item.title}
                      </span>
                      <span className="shrink-0 text-caption text-text-tertiary">{formatWhen(item.createdAt)}</span>
                    </span>
                    <span className="mt-1 block text-body text-text-secondary">{item.body}</span>
                  </button>
                </li>
              ))}
            </ul>
            {totalPages > 1 ? (
              <div className="mt-4 flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => void loadPage(page - 1, tab)}
                  className="inline-flex min-h-touch-target items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-40"
                >
                  Précédent
                </button>
                <p className="text-meta tabular-nums text-text-secondary">
                  Page {page} / {totalPages}
                </p>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => void loadPage(page + 1, tab)}
                  className="inline-flex min-h-touch-target items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-40"
                >
                  Suivant
                </button>
              </div>
            ) : null}
          </>
        )}
      </main>

      <Footer />
    </>
  );
}
