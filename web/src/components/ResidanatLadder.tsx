"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { useApiResource } from "@/lib/useApiResource";
import type { QuestionCountsResponse } from "@/lib/types";

// The documented Résidanat sitting ladder (docs/residanat-sittings.md, handoff
// §38): exam sittings 2005–2026, newest first. MedSpark-parity surface approved
// by the owner 2026-10-28: the full ladder stays visible even when a sitting
// has no questions — the platform records bank coverage, it does not hide
// empty years. Tiles show the REAL per-sitting count from
// GET /api/questions/counts (same visibility rules as the question list:
// BR-2 approved-only + FR-10a scoping), so an empty bank renders every tile
// at "no questions yet" and tiles become linked as content arrives.
const LADDER_FIRST_YEAR = 2005;
const LADDER_LAST_YEAR = 2026;
const LADDER_YEARS: number[] = Array.from(
  { length: LADDER_LAST_YEAR - LADDER_FIRST_YEAR + 1 },
  (_, index) => LADDER_LAST_YEAR - index
);

export function ResidanatLadder({ yearId, className }: { yearId: string; className?: string }) {
  const { t } = useLanguage();
  const { data, error, isLoading, refetch } = useApiResource<QuestionCountsResponse>(
    `/questions/counts?yearId=${yearId}`
  );

  // One tile per sitting YEAR: sum across that year's sitting labels (a year may
  // hold several labels). Years present only as a label without a year are not
  // part of the canonical 2005–2026 ladder and are ignored here.
  const countByExamYear = useMemo(() => {
    const map = new Map<number, number>();
    for (const sitting of data?.sittings ?? []) {
      if (sitting.examYear === null) continue;
      map.set(sitting.examYear, (map.get(sitting.examYear) ?? 0) + sitting.count);
    }
    return map;
  }, [data]);

  return (
    <section className={className} aria-label={t("residanat.ladderTitle")}>
      <h2 className="text-lg font-bold text-text-primary sm:text-xl">{t("residanat.ladderTitle")}</h2>
      <p className="mt-1 text-caption text-text-tertiary">{t("residanat.ladderDesc")}</p>

      {isLoading ? (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {LADDER_YEARS.slice(0, 12).map((year) => (
            <div key={year} className="h-16 animate-pulse rounded-card bg-surface-2" />
          ))}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-caption text-danger">
          {error}{" "}
          <button
            type="button"
            onClick={refetch}
            className="font-medium underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            {t("common.retry")}
          </button>
        </p>
      ) : null}

      {!isLoading && !error ? (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {LADDER_YEARS.map((year) => {
            const count = countByExamYear.get(year) ?? 0;
            const countLabel = t(count === 1 ? "residanat.countOne" : "residanat.countMany", { count });
            return (
              <li key={year}>
                {count > 0 ? (
                  <Link
                    href="/qcm/builder"
                    aria-label={`${year} — ${countLabel}`}
                    className="flex min-h-touch-target flex-col items-center justify-center gap-1 rounded-card border border-accent-library/40 bg-surface-1 p-2 text-center transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                  >
                    <span className="text-body font-bold text-text-primary">{year}</span>
                    <span className="text-meta font-medium text-accent-soft">{countLabel}</span>
                  </Link>
                ) : (
                  <div className="flex min-h-touch-target flex-col items-center justify-center gap-1 rounded-card border border-border bg-surface-1 p-2 text-center">
                    <span className="text-body font-bold text-text-tertiary">{year}</span>
                    <span className="text-meta font-medium text-text-tertiary">{t("residanat.empty")}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
