"use client";

import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";
import type { AccentTone } from "@/components/FeatureCard";

export type ButtonVariant = "primary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";
/** `full-mobile` is the app's dominant CTA shape: full-width on phones, intrinsic from `sm` up. */
export type ButtonWidth = "auto" | "full" | "full-mobile";

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  width?: ButtonWidth;
  /** Recolors the `primary` variant to a study-space hue (QCM blue, révision violet, …). */
  accent?: AccentTone;
  className?: string;
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 text-meta",
  md: "px-4 text-body",
  lg: "px-5 text-body",
};

const widthClasses: Record<ButtonWidth, string> = {
  auto: "",
  full: "w-full",
  "full-mobile": "w-full sm:w-auto",
};

/** Accent fills for the `primary` variant, paired with their matching glow. */
const accentClasses: Record<AccentTone, string> = {
  neutral: "bg-accent-primary shadow-glow-primary",
  primary: "bg-accent-primary shadow-glow-primary",
  secondary: "bg-accent-secondary shadow-glow-secondary",
  qcm: "bg-accent-qcm shadow-glow-qcm",
  library: "bg-accent-library shadow-glow-library",
  suivi: "bg-accent-suivi shadow-glow-suivi",
  revision: "bg-accent-revision shadow-glow-revision",
};

/**
 * Shared button class string, exported so non-button elements that must look like
 * buttons (EmptyState's dual anchor/button action) stay visually identical.
 */
export function buttonClasses({
  variant = "primary",
  size = "md",
  width = "auto",
  accent = "primary",
  className,
}: ButtonStyleOptions = {}): string {
  return cx(
    "inline-flex min-h-touch-target items-center justify-center gap-2 rounded-control font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:pointer-events-none disabled:opacity-50",
    sizeClasses[size],
    widthClasses[width],
    variant === "primary" &&
      cx(accentClasses[accent], "text-on-accent hover:brightness-110 active:scale-[0.98]"),
    // `--color-danger` is a light salmon (#f87171): white text on it measures
    // 2.77:1 (fail) while the near-black background token measures 6.96:1.
    variant === "danger" && "bg-danger text-background hover:brightness-110 active:scale-[0.98]",
    variant === "outline" &&
      "border border-border text-text-primary hover:bg-surface-2 active:bg-surface-2",
    variant === "ghost" && "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
    className
  );
}

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className">,
    ButtonStyleOptions {
  children: ReactNode;
}

export function Button({
  variant,
  size,
  width,
  accent,
  className,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={buttonClasses({ variant, size, width, accent, className })} {...rest}>
      {children}
    </button>
  );
}

export interface ButtonLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "href">,
    ButtonStyleOptions {
  href: string;
  children: ReactNode;
}

/** Same visual treatment as `Button`, rendered as a real navigation link. */
export function ButtonLink({
  variant,
  size,
  width,
  accent,
  className,
  href,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link href={href} className={buttonClasses({ variant, size, width, accent, className })} {...rest}>
      {children}
    </Link>
  );
}
