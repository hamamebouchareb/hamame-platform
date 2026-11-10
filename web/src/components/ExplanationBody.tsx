"use client";

import { cx } from "@/lib/cx";
import { useLanguage } from "@/context/LanguageContext";

export interface ExplanationBodyProps {
  /** Raw explanation paragraphs (extractParagraphs output; may hold "\n" line breaks). */
  paragraphs: string[];
  /** Paper letter ("A"…) → letter shown on screen (options are shuffled per session). */
  letterMap?: Record<string, string>;
  /** On-screen letters of the correct options. */
  correctLetters?: string[];
  className?: string;
}

const CHOICE_LINE = /^\s*([A-J])\s*[—–-]\s+(.+)$/;
const KEY_ONLY = /^\s*Réponses?\s*:\s*[A-J](\s*,\s*[A-J])*\s*\.?\s*$/i;
const SENTENCE_BREAK = /(?<=[.!?;])\s+(?=[A-ZÀ-ÖØ-Ý«(0-9])/;

/** Long blocks read as walls of text: regroup into ~2-sentence paragraphs. */
function chunkParagraph(text: string): string[] {
  if (text.length <= 320) return [text];
  const sentences = text.split(SENTENCE_BREAK);
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > 300) {
      chunks.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Practice-mode explanation: summary paragraphs, then one row per option. */
export function ExplanationBody({ paragraphs, letterMap, correctLetters = [], className }: ExplanationBodyProps) {
  const { t } = useLanguage();
  const lines = paragraphs.flatMap((p) => p.split(/\r?\n/)).map((l) => l.trim()).filter(Boolean);

  const summary: string[] = [];
  const choices: { letter: string; text: string }[] = [];
  for (const line of lines) {
    const match = CHOICE_LINE.exec(line);
    if (match) {
      const paperLetter = match[1] as string;
      choices.push({ letter: letterMap?.[paperLetter] ?? paperLetter, text: match[2] as string });
    } else if (!KEY_ONLY.test(line)) {
      summary.push(...chunkParagraph(line));
    }
  }
  choices.sort((a, b) => a.letter.localeCompare(b.letter));
  const correct = new Set(correctLetters);

  if (summary.length === 0 && choices.length === 0) return null;

  return (
    <div className={cx("flex flex-col gap-4", className)}>
      {summary.length > 0 ? (
        <div className="flex flex-col gap-2.5 text-[0.9375rem] leading-relaxed text-text-secondary">
          {summary.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      ) : null}
      {choices.length > 0 ? (
        <div>
          <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-text-tertiary">
            {t("qcard.perChoice")}
          </p>
          <ul className="flex flex-col gap-1.5">
            {choices.map((choice) => {
              const isCorrect = correct.has(choice.letter);
              return (
                <li
                  key={choice.letter}
                  className={cx(
                    "flex items-start gap-2.5 rounded-input border px-3 py-2 text-[0.9375rem] leading-relaxed",
                    isCorrect ? "border-success/50 bg-success/5" : "border-border bg-surface-1"
                  )}
                >
                  <span
                    className={cx(
                      "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-caption font-bold",
                      isCorrect ? "bg-success text-on-accent" : "bg-surface-3 text-text-secondary"
                    )}
                    aria-label={isCorrect ? t("qcard.choiceCorrect", { letter: choice.letter }) : choice.letter}
                  >
                    {choice.letter}
                  </span>
                  <span className="min-w-0 flex-1 text-text-primary">{choice.text}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
