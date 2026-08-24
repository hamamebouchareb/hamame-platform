"use client";

import { cx } from "@/lib/cx";
import type { DueReviewItem } from "@/lib/types";

export interface QualityOption {
  value: number;
  label: string;
  description: string;
  tone: "danger" | "warning" | "primary" | "success";
}

export const QUALITY_OPTIONS: QualityOption[] = [
  { value: 0, label: "Aucun souvenir", description: "Vous n'avez aucune idée.", tone: "danger" },
  { value: 1, label: "Incorrect", description: "Vous ne saviez pas, mais en voyant la réponse ça revient.", tone: "danger" },
  { value: 2, label: "Difficile", description: "Vous avez trouvé, mais avec beaucoup de mal.", tone: "warning" },
  { value: 3, label: "Correct, difficile", description: "Vous avez trouvé, mais c'était hésitant.", tone: "primary" },
  { value: 4, label: "Correct", description: "Vous avez trouvé avec une légère hésitation.", tone: "success" },
  { value: 5, label: "Parfait", description: "Réponse immédiate et assurée.", tone: "success" },
];

const toneBorder: Record<QualityOption["tone"], string> = {
  danger: "border-danger/40 hover:border-danger hover:bg-danger/10",
  warning: "border-warning/40 hover:border-warning hover:bg-warning/10",
  primary: "border-border hover:border-accent-primary hover:bg-accent-primary/10",
  success: "border-success/40 hover:border-success hover:bg-success/10",
};

function itemTargetLabel(item: DueReviewItem): { type: string; title: string } {
  if (item.lesson) return { type: "Leçon", title: item.lesson.title };
  if (item.flashcard) return { type: "Flashcard", title: item.flashcard.front };
  if (item.question) return { type: `Question ${item.question.type}`, title: item.question.source };
  return { type: "Élément", title: "Révision" };
}

function formatDueDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `en retard de ${Math.abs(diffDays)} jour${Math.abs(diffDays) > 1 ? "s" : ""}`;
  if (diffDays === 0) return "aujourd'hui";
  if (diffDays === 1) return "demain";
  return `dans ${diffDays} jours`;
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
  const { type, title } = itemTargetLabel(item);

  return (
    <article
      className={cx(
        "rounded-card border border-border bg-surface-1 px-card-padding py-6 shadow-card",
        className
      )}
    >
      {/* Item type badge */}
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-pill border border-accent-revision/40 bg-accent-revision/15 px-2.5 py-0.5 text-caption font-medium text-accent-revision">
          {type}
        </span>
        <span className="text-caption text-text-tertiary">
          Programmé {formatDueDate(item.dueAt)}
        </span>
      </div>

      {/* Item content */}
      <div className="mt-4 rounded-panel border border-border bg-surface-2 p-4">
        <p className="text-body font-medium text-text-primary">{title}</p>
      </div>

      {/* Self-assessment prompt */}
      <p className="mt-5 text-body font-medium text-text-secondary">
        Évaluez votre rappel :
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
              "flex flex-col items-center gap-1 rounded-control border px-2 py-3 text-center transition active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50 disabled:pointer-events-none",
              toneBorder[opt.tone]
            )}
            title={opt.description}
          >
            <span className="font-display text-h3 font-bold tabular-nums text-text-primary">{opt.value}</span>
            <span className="text-caption leading-tight text-text-secondary">{opt.label}</span>
          </button>
        ))}
      </div>

      {/* Quality scale legend */}
      <p className="mt-3 text-caption text-text-tertiary text-center">
        0–2 = à revoir bientôt · 3–5 = mémorisé, prochaine révision programmée
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
