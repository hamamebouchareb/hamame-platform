"use client";

import { cx } from "@/lib/cx";

export interface LoadingSkeletonProps {
  className?: string;
  ariaLabel?: string;
}

/** Blocky loading placeholder. Pulse animation + fill come from the .hamame-skeleton class in globals.css. */
export function LoadingSkeleton({ className, ariaLabel }: LoadingSkeletonProps) {
  // With a label it announces as a live status region — aria-label alone is invalid
  // on an element with no role (axe: aria-prohibited-attr).
  if (ariaLabel) {
    return <div role="status" aria-label={ariaLabel} aria-busy="true" className={cx("hamame-skeleton", className)} />;
  }
  return <div aria-hidden="true" className={cx("hamame-skeleton", className)} />;
}
