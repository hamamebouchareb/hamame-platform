"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { useLanguage } from "@/context/LanguageContext";
import { AnswerOption } from "@/components/AnswerOption";
import { AiExplainPanel } from "@/components/AiExplainPanel";
import { ExplanationBody } from "@/components/ExplanationBody";
import { ShareWithFriend } from "@/components/ShareWithFriend";
import type { QuestionOptionRef, QuestionType } from "@/lib/types";

const LETTERS = "ABCDEFGHIJ".split("");

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
  /**
   * Question + session ids enable the practice-mode post-submit AI explanation
   * panel; omitted (or exam mode) → the panel never renders.
   */
  questionId?: string;
  sessionId?: string;
  onToggleOption: (optionId: string) => void;
  onSelectOption: (optionId: string) => void;
  onFreeTextChange: (value: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  onRetrySubmit?: () => void;
  /** The player renders its own sticky validate bar; the card then skips its CTA. */
  hideSubmit?: boolean;
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
  questionId,
  sessionId,
  onToggleOption,
  onSelectOption,
  onFreeTextChange,
  onSubmit,
  isSubmitting,
  onRetrySubmit,
  hideSubmit,
  className,
}: QuestionCardProps) {
  const { t } = useLanguage();
  const canSubmit =
    !answer.submitted &&
    !isSubmitting &&
    (isChoiceType(type) ? answer.selectedOptionIds.length > 0 : answer.freeText.trim().length > 0);

  // Correctness may only be revealed in practice mode post-submit — exam mode
  // withholds everything until results (BR-4).
  const revealCorrectness = mode === "practice" && answer.submitted;

  // Options are shuffled per session; explanations cite the paper's letters.
  const letterMap = useMemo(() => {
    const map: Record<string, string> = {};
    options.forEach((option, index) => {
      if (option.orderIndex !== undefined) map[LETTERS[option.orderIndex] ?? ""] = LETTERS[index] ?? "";
    });
    return map;
  }, [options]);
  const correctLetters = options
    .map((option, index) => (answer.correctOptionIds?.includes(option.id) ? LETTERS[index] : null))
    .filter((letter): letter is string => letter !== null);

  // A clinical case is stored as "story\n\nquestion": show the story as context.
  const blocks = questionText.flatMap((p) => p.split(/\n\s*\n/)).map((b) => b.trim()).filter(Boolean);
  const caseBlocks = blocks.length > 1 ? blocks.slice(0, -1) : [];
  const stem = blocks.length > 0 ? blocks[blocks.length - 1] : "";

  // Bring the feedback into view right after validating (not when revisiting).
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  const wasSubmitted = useRef(answer.submitted);
  useEffect(() => {
    if (answer.submitted && !wasSubmitted.current && mode === "practice") {
      feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    wasSubmitted.current = answer.submitted;
  }, [answer.submitted, mode]);

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
    ...(examYear !== undefined && examYear !== null && !sittingLabel?.includes(String(examYear))
      ? [String(examYear)]
      : []),
    ...(sittingLabel ? [sittingLabel] : []),
  ];

  const choiceVariant = type === "QCM" ? "multi" : "single";
  const graded = answer.isCorrect === true || answer.isCorrect === false;

  return (
    <article className={cx("w-full rounded-card border border-border bg-surface-1 p-4 shadow-card sm:p-card-padding", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5" aria-label={t("qcard.chipsAria")}>
          {meta ? (
            <span className="mr-1 text-caption font-semibold uppercase tracking-wide text-text-tertiary">{meta}</span>
          ) : null}
          {moduleName ? (
            <span className="rounded-pill border border-border bg-surface-2 px-2 py-0.5 text-caption font-medium text-text-secondary">
              {moduleName}
            </span>
          ) : null}
          {unitName ? (
            <span className="max-w-[16rem] truncate rounded-pill border border-border bg-surface-2 px-2 py-0.5 text-caption font-medium text-text-secondary">
              {unitName}
            </span>
          ) : null}
          {sittingChips.map((chip) => (
            <span
              key={chip}
              className="rounded-pill border border-accent-secondary/50 bg-accent-secondary/10 px-2 py-0.5 text-caption font-medium text-accent-soft"
            >
              {chip}
            </span>
          ))}
        </div>
        {questionId ? <ShareWithFriend questionId={questionId} /> : null}
      </div>

      {caseBlocks.length > 0 ? (
        <div className="mt-3 rounded-input border-l-4 border-accent-qcm/60 bg-surface-2 px-3 py-2.5">
          <p className="mb-1 text-caption font-semibold uppercase tracking-wide text-accent-soft">{t("qcard.caseLabel")}</p>
          {caseBlocks.map((block, index) => (
            <p key={index} className="mt-1.5 whitespace-pre-line text-[0.9375rem] leading-relaxed text-text-secondary first:mt-0">
              {block}
            </p>
          ))}
        </div>
      ) : null}

      <p className="mt-3 whitespace-pre-line text-body font-semibold leading-relaxed text-text-primary sm:text-[1.0625rem]">
        {stem}
      </p>

      <div className="mt-3 flex flex-col gap-1.5" role="group" aria-label={t("qcard.optionsAria")} data-answer-options>
        {isChoiceType(type) &&
          options.map((option, index) => (
            <AnswerOption
              key={option.id}
              optionId={option.id}
              letter={LETTERS[index]}
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
              variant={choiceVariant}
              onSelect={(id) => selectAndForgive(type === "QCM" ? onToggleOption : onSelectOption, id)}
            />
          ))}

        {(type === "QROC" || type === "CLINICAL_CASE") && (
          <textarea
            value={answer.freeText}
            disabled={answer.submitted}
            onChange={(event) => onFreeTextChange(event.target.value)}
            rows={4}
            placeholder={t("qcard.freePh")}
            className="min-h-touch-target w-full rounded-input border border-border bg-surface-2 px-4 py-3 text-body text-text-primary placeholder:text-text-tertiary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-60"
          />
        )}
      </div>

      {answer.submitError ? (
        <div className="mt-3 rounded-input border border-danger bg-surface-2 px-3 py-2" role="alert">
          <p className="text-meta text-danger">{answer.submitError}</p>
          {onRetrySubmit ? (
            <button
              type="button"
              onClick={onRetrySubmit}
              className="mt-2 text-meta font-medium text-accent-soft underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              {t("qcard.retrySend")}
            </button>
          ) : null}
        </div>
      ) : null}

      {answer.submitted ? (
        mode === "practice" ? (
          <div ref={feedbackRef} className="mt-4 scroll-mt-20 flex flex-col gap-3">
            <div
              className={cx(
                "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-input border px-3 py-2.5",
                answer.isCorrect === true
                  ? "border-success/60 bg-success/10"
                  : answer.isCorrect === false
                    ? "border-danger/60 bg-danger/10"
                    : "border-border bg-surface-2"
              )}
              role={graded ? "status" : undefined}
            >
              <span
                className={cx(
                  "text-body font-semibold",
                  answer.isCorrect === true ? "text-success" : answer.isCorrect === false ? "text-danger" : "text-text-secondary"
                )}
              >
                {!graded ? t("qcard.sentUngraded") : answer.isCorrect ? t("qcard.correct") : t("qcard.incorrect")}
              </span>
              {correctLetters.length > 0 ? (
                <span className="text-meta font-medium text-text-primary">
                  {t(correctLetters.length === 1 ? "qcard.correctAnswerOne" : "qcard.correctAnswerMany", {
                    letters: correctLetters.join(", "),
                  })}
                </span>
              ) : null}
              {answer.answerStats ? (
                <span className="text-meta text-text-tertiary sm:ml-auto">
                  {t(answer.answerStats.attempts === 1 ? "qcard.statsOne" : "qcard.statsMany", {
                    n: answer.answerStats.attempts,
                  })}
                </span>
              ) : null}
            </div>

            {(answer.explanationParagraphs?.length ?? 0) > 0 ? (
              <section className="rounded-input border border-border bg-surface-2/60 px-3 py-3 sm:px-4">
                <h3 className="mb-2 text-meta font-semibold uppercase tracking-wide text-accent-soft">
                  {t("qcard.explanation")}
                </h3>
                <ExplanationBody
                  paragraphs={answer.explanationParagraphs ?? []}
                  letterMap={letterMap}
                  correctLetters={correctLetters}
                />
              </section>
            ) : null}

            {/* AI explanation (opt-in, one credit, retry-free): only with both ids
                supplied; the player passes them. */}
            {questionId && sessionId ? <AiExplainPanel questionId={questionId} sessionId={sessionId} /> : null}
          </div>
        ) : (
          <p className="mt-4 inline-flex rounded-pill border border-border px-3 py-1 text-meta text-text-secondary">{t("qcard.answeredBadge")}</p>
        )
      ) : hideSubmit ? null : (
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          title={!canSubmit && !isSubmitting ? t("qcard.needAnswer") : undefined}
          className="mt-4 inline-flex min-h-touch-target w-full items-center justify-center rounded-control bg-accent-qcm px-4 text-body font-medium text-on-accent shadow-glow-qcm transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50 disabled:pointer-events-none"
        >
          {isSubmitting ? t("qcard.sending") : t("qcard.submit")}
        </button>
      )}
    </article>
  );
}
