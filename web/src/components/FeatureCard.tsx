"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { ProgressBar } from "@/components/ProgressBar";

export type AccentTone = "neutral" | "primary" | "secondary" | "qcm" | "library" | "suivi" | "revision";

/** Resolves an accent tone to its Tailwind color utility. */
export function accentText(tone: AccentTone): string {
  switch (tone) {
    case "primary":
      return "text-accent-primary";
    case "secondary":
      return "text-accent-secondary";
    case "library":
      return "text-accent-library";
    case "suivi":
      return "text-accent-suivi";
    case "revision":
      return "text-accent-revision";
    case "qcm":
      return "text-accent-qcm";
    default:
      return "text-text-secondary";
  }
}

/** Resolves an accent tone to a CSS variable reference (usable in `style`). */
export function accentVar(tone: AccentTone): string {
  switch (tone) {
    case "primary":
      return "var(--color-accent-primary)";
    case "secondary":
      return "var(--color-accent-secondary)";
    case "library":
      return "var(--color-accent-library)";
    case "suivi":
      return "var(--color-accent-suivi)";
    case "revision":
      return "var(--color-accent-revision)";
    default:
      return "var(--color-accent-qcm)";
  }
}

export interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  tone?: AccentTone;
  badge?: string;
  className?: string;
}

/** Static feature / pitch card with an accent identity per study space. */
export function FeatureCard({ icon, title, description, tone = "primary", badge, className }: FeatureCardProps) {
  return (
    <article
      className={cx(
        "flex flex-col gap-2 rounded-card border border-border bg-surface-1 p-card-padding shadow-card transition hover:border-border-strong hover:bg-surface-2",
        className
      )}
      style={{ borderTop: `3px solid ${accentVar(tone)}` }}
    >
      <div className="flex items-center justify-between">
        <div className={cx("flex h-10 w-10 items-center justify-center rounded-panel bg-surface-2", accentText(tone))}>
          {icon}
        </div>
        {badge ? (
          <span className="rounded-pill border border-accent-secondary/40 bg-accent-secondary/15 px-2 py-0.5 text-caption font-medium text-accent-secondary">
            {badge}
          </span>
        ) : null}
      </div>
      <h3 className="font-display text-h3 font-semibold text-text-primary">{title}</h3>
      <p className="text-meta text-text-secondary">{description}</p>
    </article>
  );
}

export interface CourseCardProps {
  href: string;
  title: string;
  description?: ReactNode;
  meta?: ReactNode;
  tone?: AccentTone;
  /** 0–100. Renders a progress bar inside the card when set. */
  progressPct?: number;
  /** Shows the progress bar in its loading (indeterminate) state. */
  progressLoading?: boolean;
  /** Primary call-to-action shown as a pill on the title row (e.g. "Commencer"). */
  actionLabel?: string;
  className?: string;
}

/** List-style curriculum link card (faculties / years / modules / units / lessons). */
export function CourseCard({
  href,
  title,
  description,
  meta,
  tone = "qcm",
  progressPct,
  progressLoading,
  actionLabel,
  className,
}: CourseCardProps) {
  const showProgress = progressLoading || progressPct !== undefined;
  return (
    <Link
      href={href}
      className={cx(
        "block min-h-touch-target rounded-card border border-border bg-surface-1 p-card-padding shadow-card transition hover:border-border-strong hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2",
        className
      )}
      style={{ borderTop: `3px solid ${accentVar(tone)}` }}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="text-body font-medium text-text-primary">{title}</span>
        {actionLabel ? (
          <span
            className={cx(
              "inline-flex shrink-0 items-center gap-1 rounded-control border px-3 py-1.5 text-caption font-semibold",
              accentText(tone)
            )}
            style={{ borderColor: `${accentVar(tone)}40`, backgroundColor: `${accentVar(tone)}22` }}
          >
            {actionLabel}
            <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </span>
        ) : null}
      </span>
      {description ? <span className="mt-1 block text-meta text-text-secondary">{description}</span> : null}
      {showProgress ? (
        <ProgressBar
          className="mt-3"
          value={progressPct ?? 0}
          loading={progressLoading}
          tone={progressPct === 100 ? "success" : "primary"}
        />
      ) : null}
      {meta ? <span className="mt-1 block text-caption text-text-tertiary">{meta}</span> : null}
    </Link>
  );
}
