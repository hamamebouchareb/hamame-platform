"use client";

import Link from "next/link";
import { cx } from "@/lib/cx";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";

export interface ResumeBarProps {
  title: string;
  subtitle?: string;
  /** Optional short context pill (e.g. "3 révisions à faire"). */
  meta?: string;
  metaLoading?: boolean;
  /** Primary call-to-action label. Defaults to "Reprendre l'étude". */
  primaryLabel?: string;
  primaryHref: string;
  className?: string;
}

/**
 * Top-of-dashboard resume bar: tells the student what to pick back up and offers a
 * single primary action. Rendered before any other section so the resume action never
 * competes with the KPI row or the secondary column.
 */
export function ResumeBar({
  title,
  subtitle,
  meta,
  metaLoading,
  primaryLabel = "Reprendre l'étude",
  primaryHref,
  className,
}: ResumeBarProps) {
  return (
    <section
      aria-label="Reprendre l'étude"
      className={cx(
        "flex flex-col gap-4 rounded-card-lg border border-border bg-surface-1 p-card-padding shadow-card sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-display text-h3 font-semibold text-text-primary">
          {title}
          {meta ? (
            <span className="rounded-pill border border-border bg-surface-2 px-2.5 py-0.5 text-caption font-medium text-text-secondary">
              {meta}
            </span>
          ) : null}
          {metaLoading ? <LoadingSkeleton className="h-5 w-24 rounded-pill" ariaLabel="Chargement de la prochaine étape" /> : null}
        </p>
        {subtitle ? <p className="mt-1 text-meta text-text-secondary">{subtitle}</p> : null}
      </div>

      <Link
        href={primaryHref}
        className="inline-flex min-h-touch-target shrink-0 items-center justify-center rounded-control bg-accent-primary px-6 text-body font-semibold text-background shadow-glow-primary transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        {primaryLabel}
      </Link>
    </section>
  );
}
