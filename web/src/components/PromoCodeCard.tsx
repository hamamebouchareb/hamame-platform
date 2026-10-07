"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/components/Toast";
import { cx } from "@/lib/cx";

/**
 * Promo-code redemption (POST /promo-codes/redeem grants Premium days).
 * Mirrors ActivationCodeCard: success message with granted days, API errors
 * surface verbatim. `onRedeemed` lets the parent refresh subscription state.
 */
export function PromoCodeCard({ onRedeemed, className }: { onRedeemed?: () => void; className?: string }) {
  const toast = useToast();
  const { t } = useLanguage();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grantedDays, setGrantedDays] = useState<number | null>(null);

  async function handleSubmit() {
    const normalized = code.trim();
    if (!normalized) return;
    setError(null);
    setSubmitting(true);
    try {
      const data = await apiFetch<{ grantedDays: number }>("/promo-codes/redeem", {
        method: "POST",
        body: JSON.stringify({ code: normalized }),
      });
      setGrantedDays(data.grantedDays);
      setCode("");
      toast.success({ title: t("promo.success") });
      onRedeemed?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("promo.fail"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      aria-label={t("promo.title")}
      className={cx("rounded-card border border-border bg-surface-1 p-card-padding shadow-card", className)}
    >
      <h2 className="font-display text-h3 font-semibold text-text-primary">{t("promo.title")}</h2>
      <p className="mt-1 text-meta text-text-secondary">
        {t("promo.desc")}
      </p>

      {grantedDays !== null ? (
        <p
          role="status"
          className="mt-3 rounded-panel border border-success/30 bg-success/10 px-3 py-2 text-body text-success"
        >
          {t("promo.successDays", { days: String(grantedDays) })}
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="promo-code" className="sr-only">
            {t("promo.codeSr")}
          </label>
          <input
            id="promo-code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && code.trim() && !submitting) void handleSubmit();
            }}
            autoComplete="off"
            className="h-11 w-full rounded-input border border-border bg-surface-2 px-3 text-body text-text-primary placeholder:text-text-tertiary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          />
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || !code.trim()}
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-control bg-accent-primary px-5 text-body font-medium text-on-accent shadow-glow-primary transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50 disabled:pointer-events-none"
          >
            {submitting ? t("promo.submitting") : t("promo.submit")}
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
