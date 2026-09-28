"use client";

import { cx } from "@/lib/cx";
import { useLanguage } from "@/context/LanguageContext";
import type { I18nKey } from "@/lib/i18n";
import type { DueReviewItem } from "@/lib/types";

export interface QualityOption {
  value: number;
  labelKey: I18nKey;
  descriptionKey: I18nKey;
  tone: "danger" | "warning" | "primary" | "success";
}

export const QUALITY_OPTIONS: QualityOption[] = [
  { value: 0, labelKey: "rcard.q0l", descriptionKey: "rcard.q0d", tone: "danger" },
  { value: 1, labelKey: "rcard.q1l", descriptionKey: "rcard.q1d", tone: "danger" },
  { value: 2, labelKey: "rcard.q2l", descriptionKey: "rcard.q2d", tone: "warning" },
  { value: 3, labelKey: "rcard.q3l", descriptionKey: "rcard.q3d", tone: "primary" },
  { value: 4, labelKey: "rcard.q4l", descriptionKey: "rcard.q4d", tone: "success" },
  { value: 5, labelKey: "rcard.q5l", descriptionKey: "rcard.q5d", tone: "success" },
];

const toneBorder: Record<QualityOption["tone"], string> = {
  danger: "border-danger/40 hover:border-danger hover:bg-danger/10",
  warning: "border-warning/40 hover:border-warning hover:bg-warning/10",
  primary: "border-border hover:border-accent-primary hover:bg-accent-primary/10",
  success: "border-success/40 hover:border-success hover:bg-success/10",
};

type TargetT = (key: "rcard.lesson" | "rcard.element" | "rcard.review") => string;

function itemTargetLabel(
  item: DueReviewItem,
  t: TargetT
): { type: string; title: string } {
  if (item.lesson) return { type: t("rcard.lesson"), title: item.lesson.title };
  if (item.flashcard) return { type: "Flashcard", title: item.flashcard.front };
  if (item.question) return { type: `Question ${item.question.type}`, title: item.question.source };
  return { type: t("rcard.element"), title: t("rcard.review") };
}

type DueDateT = (
  key: "rcard.lateOne" | "rcard.lateMany" | "rcard.today" | "rcard.tomorrow" | "rcard.inDays",
  vars?: Record<string, string | number | null | undefined>
) => string;

function formatDueDate(iso: string, t: DueDateT): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) {
    const n = Math.abs(diffDays);
    return t(n === 1 ? "rcard.lateOne" : "rcard.lateMany", { n });
  }
  if (diffDays === 0) return t("rcard.today");
  if (diffDays === 1) return t("rcard.tomorrow");
  return t("rcard.inDays", { n: diffDays });
}

export interface RevisionCardProps {
  item: DueReviewItem;
  isSubmitting?: boolean;
  error?: string | null;
  onRate: (quality: number) => void;
  className?: string;
}

/** Student-facing spaced-repetition review card — displays a due item and asks for a
 *  self-assessment quality rating (SM-2 scale 0–5). This is NOT the content-moderation
 *  ReviewCard — it is specifically for the student revision flow. */
export function RevisionCard({ item, isSubmitting = false, error, onRate, className }: RevisionCardProps) {
  const { t } = useLanguage();
  const { type, title } = itemTargetLabel(item, t);

  return (
    <article
      className={cx(
        "rounded-card border border-border bg-surface-1 px-card-padding py-6 shadow-card",
        className
      )}
    >
      {/* Item type badge */}
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-pill border border-accent-revision/40 bg-accent-revision/15 px-2.5 py-0.5 text-caption font-medium text-accent-soft">
          {type}
        </span>
        <span className="text-caption text-text-tertiary">
          {t("rcard.scheduled", { date: formatDueDate(item.dueAt, t) })}
        </span>
      </div>

      {/* Item content */}
      <div className="mt-4 rounded-panel border border-border bg-surface-2 p-4">
        <p className="text-body font-medium text-text-primary">{title}</p>
      </div>

      {/* Self-assessment prompt */}
      <p className="mt-5 text-body font-medium text-text-secondary">
        {t("rcard.ratePrompt")}
      </p>

      {/* Quality rating buttons */}
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {QUALITY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={isSubmitting}
            onClick={() => onRate(opt.value)}
            className={cx(
              "flex flex-col items-center gap-1 rounded-control border px-2 py-3 text-center transition duration-200 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50 disabled:pointer-events-none",
              toneBorder[opt.tone]
            )}
            title={t(opt.descriptionKey)}
          >
            <span className="font-display text-h3 font-bold tabular-nums text-text-primary">{opt.value}</span>
            <span className="text-caption leading-tight text-text-secondary">{t(opt.labelKey)}</span>
          </button>
        ))}
      </div>

      {/* Quality scale legend */}
      <p className="mt-3 text-caption text-text-tertiary text-center">
        {t("rcard.legend")}
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-control border border-danger bg-surface-2 px-3 py-2 text-meta text-danger"
        >
          {error}
        </p>
      ) : null}
    </article>
  );
}
