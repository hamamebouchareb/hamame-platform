"use client";

import { cx } from "@/lib/cx";

export interface AnswerOptionProps {
  optionId: string;
  label: string;
  selected: boolean;
  /** Whether the question has already been submitted (locks the option). */
  submitted: boolean;
  /** Feedback shown in practice mode once submitted. */
  isCorrect?: boolean | null;
  variant: "multi" | "single";
  onSelect: (optionId: string) => void;
  disabled?: boolean;
}

/**
 * A single answer option. A real <button> with aria-pressed. Covers neutral,
 * hover, focus-visible, pressed, selected, correct, incorrect, and disabled.
 */
export function AnswerOption({
  optionId,
  label,
  selected,
  submitted,
  isCorrect,
  variant,
  onSelect,
  disabled,
}: AnswerOptionProps) {
  const base =
    "flex min-h-touch-target w-full items-start gap-3 rounded-control border px-4 py-3 text-left text-body transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2 disabled:opacity-60 disabled:cursor-not-allowed";

  let stateClass: string;
  if (submitted && selected && isCorrect === true) {
    stateClass = "border-success bg-surface-2 text-success";
  } else if (submitted && selected && isCorrect === false) {
    stateClass = "border-danger bg-surface-2 text-danger";
  } else if (selected) {
    stateClass = "border-accent-qcm bg-accent-qcm/15 text-text-primary shadow-glow-qcm";
  } else {
    stateClass = "border-border bg-surface-1 text-text-primary hover:bg-surface-2";
  }

  return (
    <button
      key={optionId}
      type="button"
      disabled={submitted || disabled}
      onClick={() => onSelect(optionId)}
      aria-pressed={selected}
      className={cx(base, stateClass)}
    >
      <span
        className={cx(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border text-[10px]",
          variant === "multi" ? "rounded-[4px]" : "rounded-full",
          selected ? "border-accent-qcm bg-accent-qcm text-background" : "border-border"
        )}
        aria-hidden
      >
        {variant === "multi" ? (
          selected ? "✓" : ""
        ) : selected ? (
          <span className="h-2 w-2 rounded-full bg-background" />
        ) : null}
      </span>
      <span>{label}</span>
    </button>
  );
}
