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
 * Shown once the student's AI credits are spent. The plan upgrade comes from
 * GET /api/ai/credits (`upgrade`), so it follows the admin-edited plans and is
 * omitted on the top plan; buying extra credits with jetons is always offered.
 */
export function AiUpgradePrompt({ className }: { className?: string }) {
  const { t } = useLanguage();
  const [loaded, setLoaded] = useState(false);
  const [upgrade, setUpgrade] = useState<AiCreditUpgrade | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ upgrade: AiCreditUpgrade | null }>("/ai/credits")
      .then((data) => {
        if (cancelled) return;
        setUpgrade(data.upgrade ?? null);
        setLoaded(true);
      })
      .catch(() => {
        // No offer is better than a broken one; the exhausted message still shows.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) return null;
  const plan = upgrade ? capitalize(upgrade.planName) : null;

  return (
    <div className={cx("rounded-card border border-accent-secondary/40 bg-surface-2 p-4 shadow-glow-secondary", className)}>
      <p className="font-display text-body font-semibold text-text-primary">{t("aiUpgrade.title")}</p>
      {upgrade && plan && (
        <p className="mt-1 text-meta text-text-secondary">
          {t("aiUpgrade.desc", { plan, count: upgrade.dailyAllowance })}
        </p>
      )}
      <p className="mt-1 text-meta text-text-secondary">{t("wal.aiDesc")}</p>
      <div className="mt-3 flex flex-col gap-2">
        {upgrade && plan && (
          <ButtonLink href="/subscription" accent="secondary" width="full">
            {t("aiUpgrade.cta", { plan })}
          </ButtonLink>
        )}
        <ButtonLink href="/wallet" variant="outline" width="full">
          {t("aiUpgrade.buyCredits")}
        </ButtonLink>
      </div>
    </div>
  );
}
