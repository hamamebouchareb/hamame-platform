"use client";

import Link from "next/link";
import { cx } from "@/lib/cx";
import { useLanguage } from "@/context/LanguageContext";
import { LanguageToggle } from "@/components/LanguageToggle";

export interface FooterLink {
  href: string;
  label: string;
}

export interface FooterProps {
  links?: FooterLink[];
  className?: string;
}

export function Footer({ links, className }: FooterProps) {
  const { t } = useLanguage();
  // Legal links on every footer by default (Terms + Privacy); callers may
  // still pass an explicit list (including []) to override.
  const legalLinks: FooterLink[] =
    links ?? [
      { href: "/terms", label: t("nav.terms") },
      { href: "/privacy", label: t("nav.privacy") },
    ];
  return (
    <footer className={cx("mt-auto border-t border-border bg-surface-1", className)}>
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-3 px-card-padding py-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-meta text-text-tertiary">
          <span className="font-display font-semibold text-text-secondary">Hamame</span> — {t("footer.tagline")}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {legalLinks.length > 0 ? (
            <nav aria-label={t("footer.navAria")} className="flex flex-wrap gap-4">
              {legalLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="inline-flex min-h-touch-target items-center text-meta text-text-secondary transition hover:text-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          ) : null}
          <LanguageToggle />
        </div>
      </div>
    </footer>
  );
}
