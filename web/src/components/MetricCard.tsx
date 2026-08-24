"use client";

import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";

export type MetricTone =
  | "neutral"
  | "primary"
  | "secondary"
  | "qcm"
  | "library"
  | "suivi"
  | "revision"
  | "success"
  | "warning"
  | "danger";

export interface MetricCardProps {
  label: string;
  value?: ReactNode;
  /** Small text below the label (e.g. time period). */
  subtitle?: ReactNode;
  /** Show a skeleton block instead of the value while data loads. */
  loading?: boolean;
  /** When set, renders an inline error with a retry button. */
  error?: string | null;
  onRetry?: () => void;
  tone?: MetricTone;
  className?: string;
}

const toneText: Record<MetricTone, string> = {
  neutral: "text-text-primary",
  primary: "text-accent-primary",
  secondary: "text-accent-secondary",
  qcm: "text-accent-qcm",
  library: "text-accent-library",
  suivi: "text-accent-suivi",
  revision: "text-accent-revision",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

export function MetricCard({ label, value, subtitle, loading, error, onRetry, tone = "neutral", className }: MetricCardProps) {
  return (
    <article className={cx("rounded-card border border-border bg-surface-1 p-card-padding shadow-card", className)}>
      {loading ? (
        <LoadingSkeleton className="h-12 w-16" ariaLabel={`Chargement de ${label}`} />
      ) : error ? (
        <div>
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
      ) : (
        <>
          <p className={cx("font-display text-display font-bold leading-tight", toneText[tone])}>{value}</p>
          <p className="mt-1 text-meta font-medium text-text-secondary">{label}</p>
          {subtitle ? <p className="mt-0.5 text-caption text-text-tertiary">{subtitle}</p> : null}
        </>
      )}
    </article>
  );
}
