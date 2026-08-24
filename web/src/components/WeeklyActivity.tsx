"use client";

import Link from "next/link";
import { cx } from "@/lib/cx";
import { EmptyState, type EmptyStateAction } from "@/components/EmptyState";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";

export interface ActivityItem {
  key: string;
  href: string;
  title: string;
  subtitle?: string;
  timestamp?: string;
}

export interface WeeklyActivityProps {
  items: ActivityItem[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: EmptyStateAction;
  className?: string;
}

/** Recent-activity list with loading skeletons, an error+retry state, and a CTA empty state. */
export function WeeklyActivity({
  items,
  loading,
  error,
  onRetry,
  emptyTitle = "Aucune activité",
  emptyDescription,
  emptyAction,
  className,
}: WeeklyActivityProps) {
  if (loading) {
    return (
      <ul className={cx("flex flex-col gap-2", className)} aria-busy="true">
        {[0, 1, 2].map((i) => (
          <li key={i}>
            <LoadingSkeleton className="h-16 w-full rounded-card" />
          </li>
        ))}
      </ul>
    );
  }

  if (error) {
    return (
      <div className={cx("rounded-card border border-danger bg-surface-1 p-card-padding", className)}>
        <p className="text-body text-danger">Impossible de charger l&apos;activité. {error}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex min-h-touch-target items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2"
          >
            Réessayer
          </button>
        ) : null}
      </div>
    );
  }

  if (items.length === 0) {
    if (!emptyAction) return null;
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} className={className} />;
  }

  return (
    <ul className={cx("flex flex-col gap-2", className)} aria-label={`${items.length} élément${items.length > 1 ? "s" : ""} d&apos;activité récente`}>
      {items.map((item) => (
        <li key={item.key}>
          <Link
            href={item.href}
            className="block min-h-touch-target rounded-card border border-border bg-surface-1 p-card-padding transition hover:border-border-strong hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2"
          >
            <p className="text-body font-medium text-text-primary">{item.title}</p>
            {item.subtitle ? <p className="mt-0.5 text-meta text-text-secondary">{item.subtitle}</p> : null}
            {item.timestamp ? <p className="mt-0.5 text-meta text-text-tertiary">{item.timestamp}</p> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
