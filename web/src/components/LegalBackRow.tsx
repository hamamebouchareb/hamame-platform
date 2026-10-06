"use client";

import { useLanguage } from "@/context/LanguageContext";
import { BackLink, LanguageToggle } from "@/components";

/** Home link + language switch row for the public legal pages. */
export function LegalBackRow() {
  const { t } = useLanguage();
  return (
    <div className="flex items-center justify-between gap-3">
      <BackLink href="/">{t("errors.backHome")}</BackLink>
      <LanguageToggle />
    </div>
  );
}
