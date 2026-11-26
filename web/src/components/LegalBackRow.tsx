"use client";

import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { LanguageToggle } from "@/components";

/** Home link + language switch row for the public legal pages. */
export function LegalBackRow() {
  const { t } = useLanguage();
  return (
    <div className="flex items-center justify-between gap-3">
      <Link
        href="/"
        className="inline-flex min-h-touch-target items-center gap-1 text-meta font-medium text-text-secondary transition hover:text-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <span aria-hidden>←</span> {t("errors.backHome")}
      </Link>
      <LanguageToggle />
    </div>
  );
}
