"use client";

import Link from "next/link";
import { cx } from "@/lib/cx";
import { useLanguage } from "@/context/LanguageContext";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";

export interface PremiumCardProps {
  status: "loading" | "free" | "active" | "cancelled" | "error";
  planName?: string;
  priceLabel?: string;
  renewsAt?: string;
  /** Visible until `renewsAt`. */
  cancelsAt?: string;
  error?: string | null;
  onRetry?: () => void;
  upgradeHref?: string;
  onUpgrade?: () => void;
  onCancel?: () => void;
  isCancelling?: boolean;
  cancelError?: string | null;
  successMessage?: string | null;
  className?: string;
}

const titleBase = "font-display text-h3 font-semibold";

/**
 * Premium / subscription status card. Active plans get the brand glow; all actions
 * are real buttons or links. Covers loading, free, active, cancelled, and error.
 */
export function PremiumCard({
  status,
  planName,
  priceLabel,
  renewsAt,
  cancelsAt,
  error,
  onRetry,
  upgradeHref,
  onUpgrade,
  onCancel,
  isCancelling,
  cancelError,
  successMessage,
  className,
}: PremiumCardProps) {
  const { t } = useLanguage();
  if (status === "loading") {
    return (
      <article className={cx("rounded-card border border-border bg-surface-1 p-card-padding shadow-card", className)}>
        <LoadingSkeleton className="h-4 w-28" ariaLabel={t("premium.loading")} />
        <LoadingSkeleton className="mt-3 h-8 w-40" />
        <LoadingSkeleton className="mt-2 h-11 w-full" />
      </article>
    );
  }

  if (status === "error") {
    return (
      <article className={cx("rounded-card border border-danger bg-surface-1 p-card-padding shadow-card", className)}>
        <p className={cx(titleBase, "text-danger")}>{t("nav.subscription")}</p>
        <p className="mt-1 text-body text-danger">{t("dashboard.balanceError", { error: error ?? "" })}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 inline-flex min-h-touch-target items-center justify-center rounded-control border border-border px-3 text-meta font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            {t("common.retry")}
          </button>
        ) : null}
      </article>
    );
  }

  const isPremium = status === "active" || status === "cancelled";

  return (
    <article
      className={cx(
        "rounded-card border bg-surface-1 p-card-padding shadow-card",
        isPremium ? "border-accent-secondary/40 shadow-glow-secondary" : "border-border",
        className
      )}
    >
      <p className="text-meta font-medium uppercase tracking-wide text-text-secondary">{t("nav.subscription")}</p>

      {status === "free" ? (
        <>
          <p className={cx(titleBase, "mt-2 text-text-primary")}>{t("premium.freeTitle")}</p>
          <p className="mt-1 text-meta text-text-secondary">
            {t("premium.freeDesc")}
          </p>
          {upgradeHref ? (
            <Link
              href={upgradeHref}
              className="mt-3 inline-flex min-h-touch-target w-full items-center justify-center rounded-control bg-accent-secondary px-4 text-body font-medium text-on-accent transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              {t("premium.upgrade")}
            </Link>
          ) : onUpgrade ? (
            <button
              type="button"
              onClick={onUpgrade}
              className="mt-3 inline-flex min-h-touch-target w-full items-center justify-center rounded-control bg-accent-secondary px-4 text-body font-medium text-on-accent transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              {t("premium.upgrade")}
            </button>
          ) : null}
        </>
      ) : null}

      {status === "active" ? (
        <>
          <p className={cx(titleBase, "mt-2 text-accent-soft")}>{planName ?? t("premium.defaultName")}</p>
          {priceLabel ? <p className="mt-1 text-meta text-text-secondary">{priceLabel}</p> : null}
          {renewsAt ? <p className="mt-1 text-meta text-text-tertiary">{t("premium.renews", { date: renewsAt })}</p> : null}
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={isCancelling}
              className="mt-3 inline-flex min-h-touch-target w-full items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2 disabled:opacity-50 disabled:pointer-events-none"
            >
              {isCancelling ? t("billing.cancelling") : t("billing.cancel")}
            </button>
          ) : null}
        </>
      ) : null}

      {status === "cancelled" ? (
        <>
          <p className={cx(titleBase, "mt-2 text-text-primary")}>{planName ?? t("premium.defaultName")} {t("premium.cancelledSuffix")}</p>
          <p className="mt-1 text-meta text-text-secondary">
            {t("premium.cancelledDesc", { date: cancelsAt ?? renewsAt ?? t("premium.noDate") })}
          </p>
          {upgradeHref ? (
            <Link
              href={upgradeHref}
              className="mt-3 inline-flex min-h-touch-target w-full items-center justify-center rounded-control bg-accent-secondary px-4 text-body font-medium text-on-accent transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              {t("premium.choosePlan")}
            </Link>
          ) : null}
        </>
      ) : null}

      {cancelError ? (
        <p role="alert" className="mt-2 rounded-control border border-danger bg-surface-1 px-3 py-2 text-meta text-danger">
          {cancelError}
        </p>
      ) : null}
      {successMessage ? (
        <p role="status" className="mt-2 rounded-control border border-success/40 bg-surface-1 px-3 py-2 text-meta text-success">
          {successMessage}
        </p>
      ) : null}
    </article>
  );
}
