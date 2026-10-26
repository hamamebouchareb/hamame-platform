"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch, ApiError } from "@/lib/api";
import { cx } from "@/lib/cx";
import { ButtonLink } from "@/components/Button";
import type { Entitlements } from "@/lib/types";

export function isDailyLimitError(err: unknown): boolean {
  return err instanceof ApiError && err.code === "DAILY_QUESTION_LIMIT";
}

export interface DailyQuestionsBannerProps {
  /** Bump to refetch (e.g. after a session start was refused). */
  refreshKey?: number;
  className?: string;
}

// Free-plan daily question budget (GET /api/subscriptions/me/entitlements).
// Premium students see nothing: their year is unlimited, and questions from
// other years still draw on the same budget, which the server enforces anyway.
export function DailyQuestionsBanner({ refreshKey = 0, className }: DailyQuestionsBannerProps) {
  const { t } = useLanguage();
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<Entitlements>("/subscriptions/me/entitlements")
      .then((data) => {
        if (!cancelled) setEntitlements(data);
      })
      .catch(() => {
        if (!cancelled) setEntitlements(null);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (!entitlements || entitlements.premium) return null;
  const { remaining, limit } = entitlements.dailyQuestions;
  const exhausted = remaining === 0;

  return (
    <div
      role={exhausted ? "alert" : "status"}
      data-daily-questions={remaining}
      className={cx(
        "flex flex-wrap items-center justify-between gap-3 rounded-control border px-4 py-3",
        exhausted ? "border-danger" : "border-border",
        className
      )}
    >
      <div className="min-w-0">
        <p className={cx("text-meta font-semibold", exhausted ? "text-danger" : "text-text-primary")}>
          {exhausted ? t("quota.reached", { limit }) : t("quota.left", { remaining, limit })}
        </p>
        {exhausted && <p className="mt-0.5 text-caption text-text-secondary">{t("quota.reachedDesc")}</p>}
      </div>
      <ButtonLink href="/subscription" size="sm" variant={exhausted ? "primary" : "outline"}>
        {t("quota.cta")}
      </ButtonLink>
    </div>
  );
}
