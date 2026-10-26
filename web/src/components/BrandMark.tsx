"use client";

import { useId } from "react";
import Link from "next/link";
import { cx } from "@/lib/cx";

/**
 * Hamame mark: rounded tile, blue → violet, geometric H whose bar is an ECG
 * pulse. SVG so it stays sharp at 16–64px and never depends on a raster file.
 */
export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  const rawId = useId();
  const gid = `hm-grad-${rawId.replace(/:/g, "")}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={gid} x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2563EB" />
          <stop offset="0.55" stopColor="#5B54E8" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gid})`} />
      <path
        d="M10 8.5v15M22 8.5v15"
        fill="none"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M10 16h3.2l1.5-3.4 2.4 7 1.7-3.6H22"
        fill="none"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BrandLockup({
  href = "/dashboard",
  size = 32,
  wordmark = true,
  className,
}: {
  href?: string;
  size?: number;
  wordmark?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex min-h-touch-target shrink-0 items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
        className
      )}
    >
      <BrandMark size={size} />
      {wordmark ? (
        <span className="font-display text-h3 font-bold tracking-tight text-text-primary">Hamame</span>
      ) : (
        <span className="sr-only">Hamame</span>
      )}
    </Link>
  );
}
