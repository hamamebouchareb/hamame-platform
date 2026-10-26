"use client";

import Link from "next/link";
import { cx } from "@/lib/cx";
import { useLanguage } from "@/context/LanguageContext";
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
  /** One line per item, so a dashboard list does not stretch the page. */
  compact?: boolean;
}

/** Recent-activity list with loading skeletons, an error+retry state, and a CTA empty state. */
export function WeeklyActivity({
  items,
  loading,
  error,
  onRetry,
  emptyTitle,
  emptyDescription,
  emptyAction,
  className,
  compact,
}: WeeklyActivityProps) {
  const { t } = useLanguage();
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
        <p className="text-body text-danger">{t("suivi.activityError", { error })}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex min-h-touch-target items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2"
          >
            {t("common.retry")}
          </button>
        ) : null}
      </div>
    );
  }

  if (items.length === 0) {
    if (!emptyAction) return null;
    return <EmptyState title={emptyTitle ?? t("activity.empty")} description={emptyDescription} action={emptyAction} className={className} />;
  }

  return (
    <ul className={cx("flex flex-col gap-2", className)} aria-label={t(items.length === 1 ? "activity.itemsOne" : "activity.itemsMany", { count: items.length })}>
      {items.map((item) => (
        <li key={item.key}>
          <Link
            href={item.href}
            className={cx(
              "block min-h-touch-target rounded-card border border-border bg-surface-1 transition hover:border-border-strong hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2",
              compact ? "px-3 py-2" : "p-card-padding"
            )}
          >
            <p className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-body font-medium text-text-primary">{item.title}</span>
              {item.timestamp ? <span className="shrink-0 text-caption text-text-tertiary">{item.timestamp}</span> : null}
            </p>
            {item.subtitle && !compact ? <p className="mt-0.5 text-meta text-text-secondary">{item.subtitle}</p> : null}
            {item.subtitle && compact ? <p className="truncate text-caption text-text-secondary">{item.subtitle}</p> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
