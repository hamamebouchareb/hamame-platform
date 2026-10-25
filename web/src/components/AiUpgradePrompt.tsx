"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { cx } from "@/lib/cx";
import { useLanguage } from "@/context/LanguageContext";
import { ButtonLink } from "@/components/Button";

interface AiCreditUpgrade {
  planName: string;
  dailyAllowance: number;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Upsell shown once the student's daily AI credits are spent. The offer comes
 * from GET /api/ai/credits (`upgrade`), so it follows the admin-edited plans and
 * renders nothing for students already on the top plan — they only see the
 * "resets tomorrow" message their caller already displays.
 */
export function AiUpgradePrompt({ className }: { className?: string }) {
  const { t } = useLanguage();
  const [upgrade, setUpgrade] = useState<AiCreditUpgrade | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ upgrade: AiCreditUpgrade | null }>("/ai/credits")
      .then((data) => {
        if (!cancelled) setUpgrade(data.upgrade ?? null);
      })
      .catch(() => {
        // No offer is better than a broken one; the exhausted message still shows.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!upgrade) return null;
  const plan = capitalize(upgrade.planName);

  return (
    <div className={cx("rounded-card border border-accent-secondary/40 bg-surface-2 p-4 shadow-glow-secondary", className)}>
      <p className="font-display text-body font-semibold text-text-primary">{t("aiUpgrade.title")}</p>
      <p className="mt-1 text-meta text-text-secondary">
        {t("aiUpgrade.desc", { plan, count: upgrade.dailyAllowance })}
      </p>
      <ButtonLink href="/subscription" accent="secondary" width="full" className="mt-3">
        {t("aiUpgrade.cta", { plan })}
      </ButtonLink>
    </div>
  );
}
