"use client";

import Link from "next/link";
import { cx } from "@/lib/cx";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";

export interface ProfileHeroProps {
  greeting: string;
  /** Full-name for the empty/welcome state. */
  name?: string;
  score?: number | null;
  scoreLabel?: string | null;
  insufficientData?: boolean;
  emptyMessage?: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  ctaLabel?: string;
  ctaHref?: string;
  className?: string;
}

export function ProfileHero({
  greeting,
  score,
  scoreLabel,
  insufficientData = false,
  emptyMessage,
  loading,
  error,
  onRetry,
  ctaLabel,
  ctaHref,
  className,
}: ProfileHeroProps) {
  if (loading) {
    return (
      <section aria-busy="true" aria-label="Chargement du profil" className={cx("rounded-card-lg bg-surface-2 p-card-padding shadow-card", className)}>
        {/* Heading must exist in every branch so the page always exposes its h1,
            even transiently while data loads (axe: page-has-heading-one). */}
        <h1 className="sr-only">{greeting}</h1>
        <div className="flex flex-col gap-3" aria-hidden>
          <LoadingSkeleton className="h-4 w-40" />
          <LoadingSkeleton className="h-10 w-56" />
          <LoadingSkeleton className="h-4 w-72" />
          <LoadingSkeleton className="mt-2 h-11 w-full max-w-xs" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className={cx("rounded-card-lg bg-surface-2 p-card-padding shadow-card", className)}>
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-h3 font-semibold text-text-primary">{greeting}</h1>
          <p className="text-body text-danger">Impossible de charger votre score de préparation. {error}</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-touch-target w-full items-center justify-center rounded-control bg-accent-primary px-4 text-body font-medium text-background transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring sm:w-auto sm:px-5"
            >
              Réessayer
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  if (insufficientData || score === null || score === undefined) {
    return (
      <section className={cx("rounded-card-lg bg-surface-2 p-card-padding shadow-card", className)}>
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-h3 font-semibold text-text-primary">{greeting}</h1>
          {emptyMessage ? <p className="text-body text-text-secondary">{emptyMessage}</p> : null}
          {ctaHref ? (
            <Link
              href={ctaHref}
              className="inline-flex min-h-touch-target w-full items-center justify-center rounded-control bg-accent-primary px-4 text-body font-medium text-background shadow-glow-primary transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring sm:w-auto sm:px-5"
            >
              {ctaLabel ?? "Commencez à étudier"}
            </Link>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className={cx("rounded-card-lg bg-surface-2 p-card-padding shadow-card", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-meta font-medium text-text-secondary">{greeting}</h1>
          <p className="mt-1 font-display text-display font-bold leading-tight text-text-primary">
            {score}
            <span className="ml-1 text-h3 font-semibold text-text-secondary">/100</span>
          </p>
          {scoreLabel ? <p className="mt-1 text-body text-text-secondary">Préparation : {scoreLabel}</p> : null}
        </div>
        {ctaHref ? (
          <Link
            href={ctaHref}
            className="inline-flex min-h-touch-target items-center justify-center rounded-control bg-accent-primary px-5 text-body font-medium text-background shadow-glow-primary transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            {ctaLabel ?? "Reprendre l'étude"}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
