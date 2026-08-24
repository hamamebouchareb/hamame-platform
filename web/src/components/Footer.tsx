"use client";

import Link from "next/link";
import { cx } from "@/lib/cx";

export interface FooterLink {
  href: string;
  label: string;
}

export interface FooterProps {
  links?: FooterLink[];
  className?: string;
}

export function Footer({ links = [], className }: FooterProps) {
  return (
    <footer className={cx("mt-auto border-t border-border bg-surface-1", className)}>
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-3 px-card-padding py-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-meta text-text-tertiary">
          <span className="font-display font-semibold text-text-secondary">Hamame</span> — plateforme de préparation aux examens médicaux
        </p>
        {links.length > 0 ? (
          <nav aria-label="Pied de page" className="flex flex-wrap gap-4">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex min-h-touch-target items-center text-meta text-text-secondary transition hover:text-accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
    </footer>
  );
}
