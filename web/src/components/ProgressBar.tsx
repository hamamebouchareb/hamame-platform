"use client";

import { cx } from "@/lib/cx";

export interface ProgressBarProps {
  /** 0–100 (or 0–max). */
  value: number;
  max?: number;
  label?: string;
  valueLabel?: string;
  tone?: "primary" | "secondary" | "success" | "warning" | "danger";
  loading?: boolean;
  className?: string;
}

const toneFill: Record<NonNullable<ProgressBarProps["tone"]>, string> = {
  primary: "bg-accent-primary",
  secondary: "bg-accent-secondary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

export function ProgressBar({ value, max = 100, label, valueLabel, tone = "primary", loading, className }: ProgressBarProps) {
  const clamped = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  const percentLabel = valueLabel ?? `${Math.round(clamped)}%`;

  return (
    <div className={cx("flex flex-col gap-1", className)}>
      {label ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-meta font-medium text-text-secondary">{label}</p>
          <p className="text-caption tabular-nums text-text-tertiary">{loading ? "…" : percentLabel}</p>
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-label={label ?? "Progression"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={loading ? undefined : Math.round(clamped)}
        aria-busy={loading || undefined}
        className="h-2 overflow-hidden rounded-pill bg-surface-3"
      >
        <div
          className={cx("h-full rounded-pill transition-[width] duration-300", toneFill[tone])}
          style={{ width: loading ? "0%" : `${clamped}%` }}
        />
      </div>
    </div>
  );
}
