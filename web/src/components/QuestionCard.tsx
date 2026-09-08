"use client";

import { useEffect, useState, type ReactNode } from "react";
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
  /** Correct option ids (practice mode, post-submit only — never in exam mode). */
  correctOptionIds?: string[];
  /**
   * Community pick-rates (practice mode, post-submit only). Null when there are
   * no past attempts yet — the stats block (and its caption) hides entirely.
   */
  answerStats?: { attempts: number; byOption: Record<string, number> } | null;
}

export interface QuestionCardProps {
  meta?: ReactNode;
  questionText: string[];
  type: QuestionType;
  options: QuestionOptionRef[];
  answer: QuestionAnswerState;
  mode: "practice" | "exam";
  /** P5 player chips: course + sitting labels. Omitted chips simply don't render. */
  unitName?: string;
  moduleName?: string;
  examYear?: number | null;
  sittingLabel?: string | null;
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
  unitName,
  moduleName,
  examYear,
  sittingLabel,
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

  // Correctness may only be revealed in practice mode post-submit — exam mode
  // withholds everything until results (BR-4).
  const revealCorrectness = mode === "practice" && answer.submitted;
  const [commentOpen, setCommentOpen] = useState(false);
  const hasExplanation = (answer.explanationParagraphs?.length ?? 0) > 0;

  // M8 elimination state: per-option, pre-submit only. The parent remounts this
  // card per question (key), and submit clears the set — struck never survives
  // navigation or grading, and never reaches the backend.
  const [struckIds, setStruckIds] = useState<ReadonlySet<string>>(new Set());
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (answer.submitted) setStruckIds(new Set());
  }, [answer.submitted]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function toggleStrike(optionId: string) {
    if (answer.submitted || isSubmitting) return;
    setStruckIds((prev) => {
      const next = new Set(prev);
      if (next.has(optionId)) next.delete(optionId);
      else next.add(optionId);
      return next;
    });
  }

  // Selecting a struck option forgives it (clears the strike) rather than
  // blocking — a student must always be able to change their mind.
  function selectAndForgive(select: (optionId: string) => void, optionId: string) {
    if (struckIds.has(optionId)) {
      setStruckIds((prev) => {
        const next = new Set(prev);
        next.delete(optionId);
        return next;
      });
    }
    select(optionId);
  }

  const sittingChips = [
    ...(examYear !== undefined && examYear !== null ? [String(examYear)] : []),
    ...(sittingLabel ? [sittingLabel] : []),
  ];

  return (
    <article className={cx("mx-auto max-w-xl rounded-card border border-border bg-surface-1 p-card-padding shadow-card", className)}>
      {meta ? <p className="text-meta font-medium uppercase tracking-wide text-text-tertiary">{meta}</p> : null}

      {/* P5 course + sitting chips */}
      {unitName || moduleName || sittingChips.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Contexte de la question">
          {unitName ? (
            <span className="rounded-pill border border-border bg-surface-2 px-2.5 py-1 text-meta font-medium text-text-secondary">
              {unitName}
            </span>
          ) : null}
          {moduleName ? (
            <span className="rounded-pill border border-border bg-surface-2 px-2.5 py-1 text-meta font-medium text-text-secondary">
              {moduleName}
            </span>
          ) : null}
          {sittingChips.map((chip) => (
            <span
              key={chip}
              className="rounded-pill border border-accent-secondary/50 bg-accent-secondary/10 px-2.5 py-1 text-meta font-medium text-accent-soft"
            >
              {chip}
            </span>
          ))}
        </div>
      ) : null}

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
              isCorrectOption={revealCorrectness ? answer.correctOptionIds?.includes(option.id) : undefined}
              pickPercentage={
                revealCorrectness && answer.answerStats
                  ? (answer.answerStats.byOption[option.id] ?? null)
                  : null
              }
              revealCorrectness={revealCorrectness}
              struck={struckIds.has(option.id)}
              strikeDisabled={answer.submitted || isSubmitting}
              onToggleStrike={toggleStrike}
              variant="multi"
              onSelect={(id) => selectAndForgive(onToggleOption, id)}
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
              isCorrectOption={revealCorrectness ? answer.correctOptionIds?.includes(option.id) : undefined}
              pickPercentage={
                revealCorrectness && answer.answerStats
                  ? (answer.answerStats.byOption[option.id] ?? null)
                  : null
              }
              revealCorrectness={revealCorrectness}
              struck={struckIds.has(option.id)}
              strikeDisabled={answer.submitted || isSubmitting}
              onToggleStrike={toggleStrike}
              variant="single"
              onSelect={(id) => selectAndForgive(onSelectOption, id)}
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
              className="mt-2 text-meta font-medium text-accent-soft underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
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
            {answer.answerStats ? (
              <p className="mt-1 text-text-tertiary">
                Basé sur {answer.answerStats.attempts} réponse{answer.answerStats.attempts === 1 ? "" : "s"}{" "}
                d&apos;apprenants.
              </p>
            ) : null}
            {/* Comment toggle uses the EXISTING validated explanation content only.
                No explanation yet → no toggle at all (honest empty state). */}
            {hasExplanation ? (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setCommentOpen((open) => !open)}
                  aria-expanded={commentOpen}
                  className="inline-flex min-h-touch-target items-center justify-center rounded-pill border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  {commentOpen ? "Masquer le commentaire" : "Voir le commentaire"}
                </button>
                {commentOpen ? (
                  <div className="mt-3 rounded-control border border-border bg-surface-2 px-3 py-3">
                    {answer.explanationParagraphs?.map((paragraph, index) => (
                      <p key={index} className="mt-2 text-text-secondary first:mt-0">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 inline-flex rounded-pill border border-border px-3 py-1 text-meta text-text-secondary">Répondu</p>
        )
      ) : (
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          title={!canSubmit && !isSubmitting ? "Sélectionnez une réponse pour valider" : undefined}
          className="mt-4 inline-flex min-h-touch-target w-full items-center justify-center rounded-control bg-accent-qcm px-4 text-body font-medium text-on-accent shadow-glow-qcm transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50 disabled:pointer-events-none"
        >
          {isSubmitting ? "Envoi..." : "Valider la réponse"}
        </button>
      )}
    </article>
  );
}
