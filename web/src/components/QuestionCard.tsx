"use client";

import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { AnswerOption } from "@/components/AnswerOption";
import type { QuestionOptionRef, QuestionType } from "@/lib/types";

export interface QuestionAnswerState {
  selectedOptionIds: string[];
  freeText: string;
  submitted: boolean;
  isCorrect?: boolean | null;
  explanationParagraphs?: string[];
  submitError?: string | null;
}

export interface QuestionCardProps {
  meta?: ReactNode;
  questionText: string[];
  type: QuestionType;
  options: QuestionOptionRef[];
  answer: QuestionAnswerState;
  mode: "practice" | "exam";
  onToggleOption: (optionId: string) => void;
  onSelectOption: (optionId: string) => void;
  onFreeTextChange: (value: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  onRetrySubmit?: () => void;
  className?: string;
}

const isChoiceType = (type: QuestionType) => type === "QCM" || type === "QCS";

/** Practice/exam question panel: prompt, answer options, feedback, submit CTA. */
export function QuestionCard({
  meta,
  questionText,
  type,
  options,
  answer,
  mode,
  onToggleOption,
  onSelectOption,
  onFreeTextChange,
  onSubmit,
  isSubmitting,
  onRetrySubmit,
  className,
}: QuestionCardProps) {
  const canSubmit =
    !answer.submitted &&
    !isSubmitting &&
    (isChoiceType(type) ? answer.selectedOptionIds.length > 0 : answer.freeText.trim().length > 0);

  return (
    <article className={cx("mx-auto max-w-xl rounded-card border border-border bg-surface-1 p-card-padding shadow-card", className)}>
      {meta ? <p className="text-meta font-medium uppercase tracking-wide text-text-tertiary">{meta}</p> : null}

      <div className="mt-3 flex flex-col gap-2 font-display text-h2 font-semibold leading-snug text-text-primary">
        {questionText.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-2" role="group" aria-label="Options de réponse">
        {type === "QCM" &&
          options.map((option) => (
            <AnswerOption
              key={option.id}
              optionId={option.id}
              label={option.bodyText}
              selected={answer.selectedOptionIds.includes(option.id)}
              submitted={answer.submitted}
              isCorrect={answer.isCorrect}
              variant="multi"
              onSelect={onToggleOption}
            />
          ))}

        {type === "QCS" &&
          options.map((option) => (
            <AnswerOption
              key={option.id}
              optionId={option.id}
              label={option.bodyText}
              selected={answer.selectedOptionIds.includes(option.id)}
              submitted={answer.submitted}
              isCorrect={answer.isCorrect}
              variant="single"
              onSelect={onSelectOption}
            />
          ))}

        {(type === "QROC" || type === "CLINICAL_CASE") && (
          <textarea
            value={answer.freeText}
            disabled={answer.submitted}
            onChange={(event) => onFreeTextChange(event.target.value)}
            rows={4}
            placeholder="Saisissez votre réponse..."
            className="min-h-touch-target w-full rounded-input border border-border bg-surface-2 px-4 py-3 text-body text-text-primary placeholder:text-text-tertiary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-60"
          />
        )}
      </div>

      {answer.submitError ? (
        <div className="mt-3 rounded-control border border-danger bg-surface-2 px-3 py-2" role="alert">
          <p className="text-meta text-danger">{answer.submitError}</p>
          {onRetrySubmit ? (
            <button
              type="button"
              onClick={onRetrySubmit}
              className="mt-2 text-meta font-medium text-accent-qcm underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              Réessayer l&apos;envoi
            </button>
          ) : null}
        </div>
      ) : null}

      {answer.submitted ? (
        mode === "practice" ? (
          <div
            className={cx(
              "mt-4 rounded-control border px-3 py-3 text-meta",
              answer.isCorrect === true
                ? "border-success text-success"
                : answer.isCorrect === false
                  ? "border-danger text-danger"
                  : "border-border text-text-secondary"
            )}
            role={answer.isCorrect === null || answer.isCorrect === undefined ? undefined : "status"}
          >
            <p className="text-body font-medium">
              {answer.isCorrect === null || answer.isCorrect === undefined
                ? "Réponse envoyée — non notée automatiquement."
                : answer.isCorrect
                  ? "Correct"
                  : "Incorrect"}
            </p>
            {answer.explanationParagraphs?.map((paragraph, index) => (
              <p key={index} className="mt-2 text-text-secondary">
                {paragraph}
              </p>
            ))}
          </div>
        ) : (
          <p className="mt-4 inline-flex rounded-pill border border-border px-3 py-1 text-meta text-text-secondary">Répondu</p>
        )
      ) : (
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className="mt-4 inline-flex min-h-touch-target w-full items-center justify-center rounded-control bg-accent-qcm px-4 text-body font-medium text-background shadow-glow-qcm transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50 disabled:pointer-events-none"
        >
          {isSubmitting ? "Envoi..." : "Valider la réponse"}
        </button>
      )}
    </article>
  );
}
