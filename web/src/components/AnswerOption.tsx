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
  /**
   * Whether THIS option is a correct answer. Practice mode, post-submit only —
   * drives the green correct-option highlight (never set pre-submit or in exam
   * mode, where it would leak the key).
   */
  isCorrectOption?: boolean;
  /**
   * Community pick-rate for THIS option (0-100). Rendered post-submit only;
   * null/undefined renders nothing (e.g. no attempts yet).
   */
  pickPercentage?: number | null;
  /**
   * Whether correctness may be shown (practice mode, post-submit). False in
   * exam mode, where every option must stay neutral until results.
   */
  revealCorrectness?: boolean;
  /**
   * M8 elimination ("Rayer cette réponse"): visually crossed out, pre-submit
   * only. Pure local state owned by the parent — cleared on submit and on
   * question change, never sent to the backend.
   */
  struck?: boolean;
  /** Strike toggle availability (false post-submit). */
  strikeDisabled?: boolean;
  /** Called when the strike control is activated (click or Enter/Space). */
  onToggleStrike?: (optionId: string) => void;
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
  isCorrectOption,
  pickPercentage,
  revealCorrectness,
  struck,
  strikeDisabled,
  onToggleStrike,
  variant,
  onSelect,
  disabled,
}: AnswerOptionProps) {
  const base =
    "flex min-h-touch-target w-full items-start gap-3 rounded-control border px-4 py-3 text-left text-body transition duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2 disabled:opacity-60 disabled:cursor-not-allowed";

  // Post-submit precedence (practice only — exam mode stays neutral by design):
  // a correct option is green even when the student's own answer was wrong (it
  // marks the key, not the attempt). All other submitted options carry a red
  // tint, strongest on the wrongly-selected one.
  const revealed = submitted && revealCorrectness;
  let stateClass: string;
  if (revealed && isCorrectOption) {
    stateClass = "border-success bg-success/10 text-success";
  } else if (revealed && selected && isCorrect === false) {
    stateClass = "border-danger bg-surface-2 text-danger";
  } else if (selected) {
    stateClass = "border-accent-qcm bg-accent-qcm/15 text-text-primary shadow-glow-qcm";
  } else if (revealed) {
    stateClass = "border-danger/40 bg-surface-1 text-text-primary";
  } else {
    stateClass = "border-border bg-surface-1 text-text-primary hover:bg-surface-2";
  }

  const showPercentage = revealed && pickPercentage !== undefined && pickPercentage !== null;

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
          selected ? "border-accent-qcm bg-accent-qcm text-on-accent" : "border-border"
        )}
        aria-hidden
      >
        {variant === "multi" ? (
          selected ? "✓" : ""
        ) : selected ? (
            <span className="h-2 w-2 rounded-full bg-on-accent" />
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className={struck ? "line-through opacity-70" : undefined}>{label}</span>
      </span>
      {onToggleStrike && !submitted ? (
        <span
          role="button"
          tabIndex={strikeDisabled ? -1 : 0}
          aria-pressed={!!struck}
          aria-disabled={strikeDisabled}
          title="Rayer cette réponse"
          aria-label={struck ? "Annuler le barrage de cette réponse" : "Rayer cette réponse"}
          onClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
            if (!strikeDisabled) onToggleStrike(optionId);
          }}
          onKeyDown={(event) => {
            if ((event.key === "Enter" || event.key === " ") && !strikeDisabled) {
              event.stopPropagation();
              event.preventDefault();
              onToggleStrike(optionId);
            }
          }}
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition hover:bg-surface-3 hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            {struck ? (
              <path d="M2 12s3.5-7 10-7c2 0 3.6.7 5 1.7M22 12s-3.5 7-10 7c-2 0-3.6-.7-5-1.7" />
            ) : (
              <>
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="2" y1="2" x2="22" y2="22" />
              </>
            )}
          </svg>
        </span>
      ) : null}
      {showPercentage ? (
        <span className="ml-auto flex shrink-0 items-center gap-2" aria-hidden={false}>
          <span className="h-1.5 w-10 overflow-hidden rounded-pill bg-surface-3" aria-hidden>
            <span
              className="block h-full rounded-pill bg-current opacity-70"
              style={{ width: `${Math.max(0, Math.min(100, pickPercentage))}%` }}
            />
          </span>
          <span className="min-w-8 text-right text-meta font-semibold tabular-nums">
            {pickPercentage}%
          </span>
        </span>
      ) : null}
    </button>
  );
}
