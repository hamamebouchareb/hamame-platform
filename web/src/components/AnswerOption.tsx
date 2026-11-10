"use client";

import { cx } from "@/lib/cx";
import { useLanguage } from "@/context/LanguageContext";

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
  /** On-screen letter (A, B, …) shown in the selector badge. */
  letter?: string;
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
  letter,
}: AnswerOptionProps) {
  const { t } = useLanguage();
  const base =
    "flex min-h-touch-target w-full items-start gap-3 rounded-input border px-3 py-2.5 text-left text-[0.9375rem] leading-snug transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2 disabled:cursor-default sm:px-4 sm:text-body";

  // Post-submit precedence (practice only — exam mode stays neutral by design):
  // a correct option is green even when the student's own answer was wrong (it
  // marks the key, not the attempt). All other submitted options carry a red
  // tint, strongest on the wrongly-selected one.
  const revealed = submitted && revealCorrectness;
  let stateClass: string;
  if (revealed && isCorrectOption) {
    stateClass = "border-success bg-success/10 text-success";
  } else if (revealed && selected && isCorrect === false) {
    stateClass = "border-2 border-danger bg-danger/10 text-danger shadow-glow-danger";
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
          "flex h-6 w-6 shrink-0 items-center justify-center border text-caption font-bold",
          variant === "multi" ? "rounded-[6px]" : "rounded-full",
          revealed && isCorrectOption
            ? "border-success bg-success text-on-accent"
            : revealed && selected && isCorrect === false
              ? "border-danger bg-danger text-on-accent"
              : selected
                ? "border-accent-qcm bg-accent-qcm text-on-accent"
                : "border-border text-text-secondary"
        )}
        aria-hidden
      >
        {letter ?? (selected ? "✓" : "")}
      </span>
      <span className="min-w-0 flex-1 pt-0.5">
        <span className={struck ? "line-through opacity-60" : undefined}>{label}</span>
      </span>
      {onToggleStrike && !submitted ? (
        <span
          role="button"
          tabIndex={strikeDisabled ? -1 : 0}
          aria-pressed={!!struck}
          aria-disabled={strikeDisabled}
          title={t("answer.strike")}
          aria-label={struck ? t("answer.unstrike") : t("answer.strike")}
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
