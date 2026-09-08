"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { cx } from "@/lib/cx";

interface UnlockedInfo {
  faculty: string;
  year: string;
}

/**
 * "Activer un code" — single-use activation-code redemption (FR-65/BR-18), shown
 * next to the upgrade prompt. Success shows the unlocked faculty-year; API error
 * messages (unknown code / already redeemed / expired) surface verbatim.
 * `onRedeemed` lets the parent refresh its subscription state.
 */
export function ActivationCodeCard({ onRedeemed, className }: { onRedeemed?: () => void; className?: string }) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState<UnlockedInfo | null>(null);

  async function handleSubmit() {
    const normalized = code.trim();
    if (!normalized) return;
    setError(null);
    setSubmitting(true);
    try {
      const data = await apiFetch<{ unlocked: UnlockedInfo; message: string }>("/activation-codes/redeem", {
        method: "POST",
        body: JSON.stringify({ code: normalized }),
      });
      setUnlocked(data.unlocked);
      setCode("");
      toast.success({ title: "Code activé — accès Premium accordé." });
      onRedeemed?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'activer ce code. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      aria-label="Activer un code"
      className={cx("rounded-card border border-border bg-surface-1 p-card-padding shadow-card", className)}
    >
      <h2 className="font-display text-h3 font-semibold text-text-primary">Activer un code</h2>
      <p className="mt-1 text-meta text-text-secondary">
        Un code d&apos;activation vous a été remis après confirmation de paiement ? Saisissez-le ici pour
        débloquer le contenu Premium de votre filière.
      </p>
      {/* P15 year-context hint: a code always unlocks exactly one faculty-year
          (shown back after redemption below). The backend cannot reveal what an
          unredeemed code unlocks — a pre-entry lookup would be a code-validity
          oracle — so this states the rule up front instead of faking it. */}
      <p className="mt-2 text-meta text-text-tertiary">
        Chaque code débloque une seule filière-année. Après activation, la filière et l&apos;année
        débloquées s&apos;affichent ici même.
      </p>

      {unlocked ? (
        <p
          role="status"
          className="mt-3 rounded-panel border border-success/30 bg-success/10 px-3 py-2 text-body text-success"
        >
          Accès Premium débloqué : {unlocked.faculty} — {unlocked.year}.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="activation-code" className="sr-only">
            Code d&apos;activation
          </label>
          <input
            id="activation-code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && code.trim() && !submitting) void handleSubmit();
            }}
            placeholder="Ex. AC-3F9A2B7C01D4E5F6A7B8"
            autoComplete="off"
            className="h-11 w-full rounded-input border border-border bg-surface-2 px-3 text-body text-text-primary placeholder:text-text-tertiary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          />
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || !code.trim()}
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-control bg-accent-primary px-5 text-body font-medium text-on-accent shadow-glow-primary transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50 disabled:pointer-events-none"
          >
            {submitting ? "Activation..." : "Activer"}
          </button>
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-2 rounded-panel border border-danger/30 bg-danger/10 px-3 py-2 text-meta text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
