"use client";

import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { accentVar, type AccentTone } from "@/components/FeatureCard";

export type CardVariant = "default" | "elevated" | "danger";
export type CardElement = "div" | "article" | "section" | "li";

export interface CardProps {
  children: ReactNode;
  /** Semantic tag. Defaults to `div`; use `article`/`section`/`li` where the content warrants it. */
  as?: CardElement;
  variant?: CardVariant;
  /** `card-lg` (24px) is the hero/featured radius; `card` (16px) is the standard. */
  radius?: "card" | "card-lg";
  /** Draws the 3px study-space identity stripe along the top edge. */
  accentTone?: AccentTone;
  /** Adds the hover affordance used by clickable cards. */
  interactive?: boolean;
  /** Set false when the card supplies its own padding. */
  padded?: boolean;
  className?: string;
  "aria-label"?: string;
}

const variantClasses: Record<CardVariant, string> = {
  default: "border-border bg-surface-1",
  elevated: "border-border bg-surface-2",
  danger: "border-danger bg-surface-1",
};

/**
 * Standard surface container. Replaces the hand-repeated
 * `rounded-card border border-border bg-surface-1 p-card-padding shadow-card`
 * string so elevation, radius, and border tokens stay in one place.
 */
export function Card({
  children,
  as: Tag = "div",
  variant = "default",
  radius = "card",
  accentTone,
  interactive = false,
  padded = true,
  className,
  ...rest
}: CardProps) {
  return (
    <Tag
      className={cx(
        "border shadow-card",
        radius === "card-lg" ? "rounded-card-lg" : "rounded-card",
        variantClasses[variant],
        padded && "p-card-padding",
        interactive && "transition hover:border-border-strong hover:bg-surface-2",
        className
      )}
      style={accentTone ? { borderTop: `3px solid ${accentVar(accentTone)}` } : undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}
