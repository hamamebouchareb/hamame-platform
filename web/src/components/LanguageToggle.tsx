"use client";

import { cx } from "@/lib/cx";
import { useLanguage } from "@/context/LanguageContext";
import type { UiLanguage } from "@/lib/i18n";

/**
 * Compact FR/EN segmented control. Language names are endonyms
 * ("Français"/"English") so the buttons themselves need no translation —
 * only the aria-labels come from the dictionary.
 */
export function LanguageToggle({ className }: { className?: string }) {
  const { lang, setLanguage, t } = useLanguage();

  const options: { value: UiLanguage; endonym: string; activeLabel: string }[] = [
    { value: "fr", endonym: "FR", activeLabel: t("language.switchToFrench") },
    { value: "en", endonym: "EN", activeLabel: t("language.switchToEnglish") },
  ];

  return (
    <div
      role="group"
      aria-label={t("language.label")}
      className={cx(
        "inline-flex items-center rounded-pill border border-border bg-surface-2 p-0.5",
        className
      )}
    >
      {options.map((option) => {
        const active = lang === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            aria-label={option.activeLabel}
            onClick={() => setLanguage(option.value)}
            className={cx(
              "min-h-touch-target rounded-pill px-3 text-meta font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
              active ? "bg-surface-3 text-accent-soft" : "text-text-tertiary hover:text-text-primary"
            )}
          >
            {option.endonym}
          </button>
        );
      })}
    </div>
  );
}
