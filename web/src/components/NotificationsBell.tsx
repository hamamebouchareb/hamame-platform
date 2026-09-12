"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { cx } from "@/lib/cx";

export type NotificationCategory = "social" | "prix" | "systeme";
type NotificationTab = "all" | NotificationCategory;

export interface NotificationItem {
  id: string;
  category: string;
  title: string;
  body: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

const TABS: { id: NotificationTab; label: string }[] = [
  { id: "all", label: "Tout" },
  { id: "social", label: "Social" },
  { id: "prix", label: "Prix" },
  { id: "systeme", label: "Système" },
];

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

/** Header notification bell with unread badge + categorized dropdown panel. */
export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<NotificationTab>("all");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const refreshUnread = useCallback(async () => {
    try {
      const data = await apiFetch<{ unreadCount: number }>("/notifications/unread-count");
      setUnreadCount(data.unreadCount);
    } catch {
      // Badge stays hidden when unreachable — never blocks the header.
    }
  }, []);

  useEffect(() => {
    void refreshUnread();
  }, [refreshUnread]);

  const loadList = useCallback(
    async (nextTab: NotificationTab) => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: "10" });
        if (nextTab !== "all") params.set("category", nextTab);
        const data = await apiFetch<{ notifications: NotificationItem[]; unreadCount: number }>(
          `/notifications?${params.toString()}`
        );
        setItems(data.notifications);
        setUnreadCount(data.unreadCount);
      } catch {
        setError("Notifications indisponibles. Réessayez.");
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (open) void loadList(tab);
  }, [open, tab, loadList]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open ]);

  async function markRead(item: NotificationItem) {
    if (item.isRead) return;
    setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await apiFetch(`/notifications/${item.id}/read`, { method: "PATCH" });
    } catch {
      void refreshUnread();
    }
  }

  async function markAllRead() {
    try {
      await apiFetch("/notifications/read-all", { method: "POST" });
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // Silent — the page offers the retry path.
    }
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unreadCount > 0 ? `Notifications — ${unreadCount} non lues` : "Notifications"}
        onClick={() => setOpen((prev) => !prev)}
        className="relative inline-flex min-h-touch-target min-w-touch-target items-center justify-center rounded-pill text-text-secondary transition hover:bg-surface-2 hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unreadCount > 0 ? (
          <span
            aria-hidden
            className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-pill bg-accent-primary px-1 text-[10px] font-bold tabular-nums text-on-accent"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Notifications"
          className="hamame-dialog-enter absolute right-0 top-full z-30 mt-2 max-h-[70vh] w-80 overflow-y-auto rounded-card border border-border bg-surface-2 p-2 shadow-card-lg"
        >
          <div className="flex items-center justify-between gap-2 px-2 py-1">
            <p className="text-body font-semibold text-text-primary">Notifications</p>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-meta font-medium text-accent-soft underline underline-offset-2 hover:text-accent-soft/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                Tout marquer comme lu
              </button>
            ) : null}
          </div>
          <div className="flex gap-1 overflow-x-auto px-1 py-1" role="group" aria-label="Filtrer par catégorie">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cx(
                  "shrink-0 rounded-pill px-3 py-1 text-meta font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                  tab === t.id
                    ? "bg-accent-primary text-on-accent"
                    : "text-text-secondary hover:bg-surface-3 hover:text-text-primary"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {isLoading ? (
            <p className="px-3 py-6 text-center text-meta text-text-tertiary">Chargement…</p>
          ) : error ? (
            <p role="alert" className="px-3 py-6 text-center text-meta text-danger">{error}</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-center text-meta text-text-secondary">Aucune notification</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void markRead(item)}
                    className="block w-full rounded-control px-3 py-2 text-left transition hover:bg-surface-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                  >
                    <span className="flex items-center gap-2">
                      {!item.isRead ? (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-accent-primary" aria-hidden />
                      ) : null}
                      <span className="min-w-0 flex-1 truncate text-body font-medium text-text-primary">
                        {item.title}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-meta text-text-secondary">{item.body}</span>
                    <span className="mt-0.5 block text-caption text-text-tertiary">{formatWhen(item.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-1 border-t border-border px-2 pb-1 pt-2">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block rounded-control px-3 py-2 text-center text-body font-medium text-accent-soft transition hover:bg-surface-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              Voir toutes les notifications
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
