"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

export interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  isLoading?: boolean;
}

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action: EmptyStateAction;
  className?: string;
}

/**
 * Empty-state panel. Always renders a concrete action — either a real <a> (when
 * `action.href` is set) or a real <button> (when `action.onClick` is set) — so it
 * is never purely informational.
 */
export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  const actionClass =
    "inline-flex min-h-touch-target items-center justify-center gap-2 rounded-control bg-accent-primary px-5 text-body font-medium text-background shadow-glow-primary transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50 disabled:pointer-events-none";

  return (
    <div
      className={cx(
        "flex flex-col items-center gap-3 rounded-panel border border-border bg-surface-1 p-card-padding text-center shadow-card",
        className
      )}
    >
      {icon ? <div className="flex h-12 w-12 items-center justify-center rounded-panel bg-surface-2 text-accent-primary">{icon}</div> : null}
      <div>
        <p className="font-display text-h3 font-semibold text-text-primary">{title}</p>
        {description ? <p className="mt-1 text-body text-text-secondary">{description}</p> : null}
      </div>
      {action.href ? (
        <Link href={action.href} className={actionClass} aria-disabled={action.disabled}>
          {action.isLoading ? "Chargement..." : action.label}
        </Link>
      ) : (
        <button
          type="button"
          onClick={action.onClick}
          disabled={action.disabled}
          className={actionClass}
        >
          {action.isLoading ? "Chargement..." : action.label}
        </button>
      )}
    </div>
  );
}
