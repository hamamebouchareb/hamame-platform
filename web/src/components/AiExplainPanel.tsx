"use client";

import { useCallback, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useLanguage } from "@/context/LanguageContext";
import type { ExplainAnswerResponse } from "@/lib/types";
import { AiUpgradePrompt } from "@/components/AiUpgradePrompt";

/**
 * "Explain this answer" — student-facing AI explanation (MedSparkDZ gap).
 *
 * Self-contained on purpose (same pattern as EnqueueReviewButton): it talks to
 * POST /api/ai/explain-answer with its own single-flight fetch, so preview
 * surfaces and the player can mount it without threading callbacks. The
 * player remounts it per question via the card's key, so local state resets
 * naturally when navigating.
 *
 * Mounted only inside a practice-mode post-submit feedback block by design:
 * the endpoint gates on the student's own attempt evidence server-side
 * (QUESTION_NOT_ANSWERED 403, EXAM_RESULTS_WITHHELD 403 — BR-4) and those
 * states are still mapped below in case the UI ever mounts it wider.
 *
 * Every failure path mirrors the backend's credit guarantee: the panels'
 * error copy states that no credit was used, which the backend enforces by
 * refunding on any generation failure.
 */
export function AiExplainPanel({ questionId, sessionId }: { questionId: string; sessionId: string }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [explanation, setExplanation] = useState<ExplainAnswerResponse["explanation"] | null>(null);
  const [creditsRemainingToday, setCreditsRemainingToday] = useState<number | null>(null);
  const [dailyAllowance, setDailyAllowance] = useState<number | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (loading || loaded) return;
    setLoading(true);
    setErrorCode(null);
    try {
      const data = await apiFetch<ExplainAnswerResponse>("/ai/explain-answer", {
        method: "POST",
        body: JSON.stringify({ questionId, sessionId }),
      });
      setExplanation(data.explanation);
      setCreditsRemainingToday(data.creditsRemainingToday);
      setDailyAllowance(data.dailyAllowance);
      setLoaded(true);
      setOpen(true);
    } catch (err) {
      setErrorCode(err instanceof ApiError ? err.code : "UNKNOWN_ERROR");
    } finally {
      setLoading(false);
    }
  }, [loading, loaded, questionId, sessionId]);

  function toggleOpen() {
    if (!loaded) {
      void load();
      return;
    }
    setOpen((value) => !value);
  }

  function errorText(code: string | null): string {
    switch (code) {
      case "AI_NOT_CONFIGURED":
        return t("aiExplain.unavailable");
      case "AI_CREDITS_EXHAUSTED":
        return t("aiExplain.exhausted");
      case "AI_QUOTA_EXHAUSTED":
      case "RATE_LIMITED":
        return t("aiExplain.busy");
      case "AI_GENERATION_FAILED":
        return t("aiExplain.failed");
      case "QUESTION_NOT_ANSWERED":
      case "EXAM_RESULTS_WITHHELD":
        return t("aiExplain.locked");
      case "QUESTION_NOT_FOUND":
        return t("aiExplain.questionUnavailable");
      default:
        return t("aiExplain.generic");
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={toggleOpen}
        disabled={loading}
        aria-expanded={open}
        title={t("aiExplain.buttonTitle")}
        className={[
          "inline-flex min-h-touch-target items-center justify-center gap-2 rounded-pill border px-4 text-body font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
          open && loaded
            ? "border-accent-qcm bg-accent-qcm/15 text-accent-soft"
            : "border-border text-text-primary hover:bg-surface-2 focus-visible:bg-surface-2",
        ].join(" ")}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
          <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" />
        </svg>
        {loading ? t("aiExplain.thinking") : loaded ? (open ? t("aiExplain.hide") : t("aiExplain.show")) : t("aiExplain.cta")}
      </button>

      {errorCode ? (
        <p role="alert" className="mt-2 text-meta text-danger">
          {errorText(errorCode)}
        </p>
      ) : null}
      {errorCode === "AI_CREDITS_EXHAUSTED" ? <AiUpgradePrompt className="mt-3" /> : null}

      {open && loaded && explanation ? (
        <div className="mt-3 rounded-control border border-border bg-surface-2 px-3 py-3">
          <p className="text-body font-medium text-text-primary">{explanation.directExplanation}</p>

          {explanation.incorrectOptions.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2" aria-label={t("aiExplain.incorrectHeading")}>
              {explanation.incorrectOptions.map((entry) => (
                <li key={`${entry.optionLabel}-${entry.optionText}`} className="rounded-control border border-border bg-surface-1 px-3 py-2">
                  <p className="text-body font-medium text-text-secondary">
                    {entry.optionLabel} — {entry.optionText}
                  </p>
                  <p className="mt-1 text-meta text-text-secondary">{entry.whyIncorrect}</p>
                </li>
              ))}
            </ul>
          ) : null}

          <p className="mt-3 text-body text-text-secondary">{explanation.keyReasoning}</p>

          {explanation.learningPoints.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-1" aria-label={t("aiExplain.pointsHeading")}>
              {explanation.learningPoints.map((point, index) => (
                <li key={`${index}-${point}`} className="flex items-start gap-2 text-body text-text-secondary">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent-secondary" aria-hidden />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {explanation.limitations ? (
            <p className="mt-3 text-meta text-text-tertiary">{explanation.limitations}</p>
          ) : null}

          {creditsRemainingToday !== null && dailyAllowance !== null ? (
            <p className="mt-3 text-meta text-text-tertiary">{t("aiExplain.creditNote", { remaining: creditsRemainingToday, allowance: dailyAllowance })}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
