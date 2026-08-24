"use client";

import { cx } from "@/lib/cx";
import { EmptyState, type EmptyStateAction } from "@/components/EmptyState";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";

export interface FriendEntry {
  id: string;
  name: string;
  subtitle?: string;
}

export interface FriendsPanelProps {
  friends: FriendEntry[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyAction?: EmptyStateAction;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Social sidebar panel — friend list with loading / error / empty states. */
export function FriendsPanel({
  friends,
  loading,
  error,
  onRetry,
  emptyAction,
  emptyTitle = "Pas encore d'amis",
  emptyDescription,
  className,
}: FriendsPanelProps) {
  return (
    <section className={cx("rounded-card border border-border bg-surface-1 p-card-padding shadow-card", className)}>
      <p className="text-meta font-medium uppercase tracking-wide text-text-secondary">Amis</p>

      {loading ? (
        <div className="mt-2 flex flex-col gap-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <LoadingSkeleton key={i} className="h-12 w-full rounded-card" />
          ))}
        </div>
      ) : error ? (
        <div className="mt-2">
          <p className="text-meta text-danger">{error}</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 inline-flex min-h-touch-target items-center justify-center rounded-control border border-border px-3 text-meta font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2"
            >
              Réessayer
            </button>
          ) : null}
        </div>
      ) : friends.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            title={emptyTitle}
            description={emptyDescription}
            action={emptyAction ?? { label: "Bientôt disponible", disabled: true }}
          />
        </div>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {friends.map((friend) => (
            <li key={friend.id} className="flex min-h-touch-target items-center gap-2 rounded-card px-2 py-1 transition hover:bg-surface-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-surface-3 font-display text-caption font-bold text-accent-primary" aria-hidden>
                {initials(friend.name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-body font-medium text-text-primary">{friend.name}</p>
                {friend.subtitle ? <p className="truncate text-meta text-text-tertiary">{friend.subtitle}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
