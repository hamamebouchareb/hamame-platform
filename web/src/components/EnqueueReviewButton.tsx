"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
import type { DueReviewItem } from "@/lib/types";

type EnqueueTarget =
  | { lessonId: string; questionId?: never }
  | { questionId: string; lessonId?: never };

type EnqueueReviewButtonProps = EnqueueTarget & {
  /**
   * "full" renders a text CTA (lesson detail page); "icon" renders an
   * icon-only header button matching the player header controls.
   */
  variant?: "full" | "icon";
};

/**
 * F1 compromise — optional manual revision enrollment.
 *
 * MedSparkDZ lets students manually enroll course topics into revision
 * ("Activer révision"); Hamame only auto-enqueues on session submit.
 * Decision: keep auto-enqueue as the default and ADD this opt-in button
 * wherever a lesson or question is browsable.
 *
 * Reuses the existing POST /reviews/enqueue endpoint with zero backend
 * changes: the endpoint is already idempotent (201 newly queued, 200
 * already queued — enforced database-side by ON CONFLICT DO NOTHING on
 * the unique (user_id, lesson_id)/(user_id, question_id) indexes, so a
 * double-click can never duplicate a row). The initial queued state is
 * read from the existing GET /reviews/due because apiFetch does not
 * surface the 200-vs-201 distinction and the shared helper is
 * deliberately left untouched.
 *
 * Resources are intentionally NOT supported: a Resource row carries no
 * lessonId/questionId, so the enqueue schema (exactly one of
 * lessonId/questionId, FK-guarded) cannot accept one. Queuing a resource
 * would need a new endpoint or schema column — out of scope by decision.
 */
export function EnqueueReviewButton({ variant = "full", ...target }: EnqueueReviewButtonProps) {
  const toast = useToast();
  const lessonId = target.lessonId;
  const questionId = target.questionId;
  const [queued, setQueued] = useState(false);
  const [checking, setChecking] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setChecking(true);
    setError(null);
    apiFetch<{ items: DueReviewItem[] }>("/reviews/due")
      .then((data) => {
        if (cancelled) return;
        const found = data.items.some((item) =>
          lessonId !== undefined ? item.lessonId === lessonId : item.questionId === questionId
        );
        setQueued(found);
      })
      .catch(() => {
        // Fail open: the POST below is idempotent, so a failed membership
        // check can never corrupt state — worst case the button offers an
        // add that resolves to "already queued".
        if (!cancelled) setQueued(false);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lessonId, questionId]);

  const handleAdd = useCallback(async () => {
    if (queued || adding || checking) return;
    setAdding(true);
    setError(null);
    try {
      await apiFetch("/reviews/enqueue", {
        method: "POST",
        body: JSON.stringify(lessonId !== undefined ? { lessonId } : { questionId }),
      });
      setQueued(true);
      toast.success({ title: "Ajouté à mes révisions." });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Échec de l'ajout. Réessayez.";
      setError(message);
      toast.error({ title: message });
    } finally {
      setAdding(false);
    }
  }, [queued, adding, checking, lessonId, questionId, toast]);

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleAdd}
        disabled={queued || checking || adding}
        title={
          queued
            ? "Déjà dans vos révisions"
            : checking
              ? "Vérification de vos révisions…"
              : "Ajouter à mes révisions"
        }
        aria-label={
          queued ? "Déjà dans vos révisions" : "Ajouter cette question à mes révisions"
        }
        aria-pressed={queued}
        className={[
          "inline-flex min-h-touch-target w-11 shrink-0 items-center justify-center rounded-control border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2",
          queued
            ? "border-accent-qcm bg-accent-qcm/15 text-accent-soft"
            : "border-border text-text-secondary hover:bg-surface-2 hover:text-text-primary",
        ].join(" ")}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill={queued ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleAdd}
        disabled={queued || checking || adding}
        title={
          queued
            ? "Cette leçon est déjà dans votre file de révision"
            : "Ajouter cette leçon à votre file de révision"
        }
        aria-pressed={queued}
        className={[
          "inline-flex min-h-touch-target w-full items-center justify-center gap-2 rounded-control border px-5 text-body font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring sm:w-auto",
          queued
            ? "border-accent-qcm bg-accent-qcm/15 text-accent-soft"
            : "border-border text-text-primary hover:bg-surface-2 active:bg-surface-2",
        ].join(" ")}
      >
        {checking ? "Vérification…" : adding ? "Ajout…" : queued ? "Dans mes révisions" : "Ajouter à mes révisions"}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-meta text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
