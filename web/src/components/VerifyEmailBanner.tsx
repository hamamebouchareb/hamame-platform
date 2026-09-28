"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { ApiError, apiFetch } from "@/lib/api";

/**
 * Warn-only email-verification nudge. Renders nothing when there is no user,
 * no email on the account, or the email is already verified — login is never
 * blocked (deliberate policy: verification is encouraged, not enforced).
 */
export function VerifyEmailBanner() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [dismissed, setDismissed] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!user || !user.email || user.emailVerifiedAt || dismissed) {
    return null;
  }

  async function handleResend() {
    setStatus("sending");
    setError(null);
    try {
      await apiFetch("/auth/resend-verification", { method: "POST", body: JSON.stringify({}) });
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof ApiError ? err.message : t("auth.genericError"));
    }
  }

  return (
    <section
      aria-label={t("banner.aria")}
      className="rounded-control border border-accent-primary/40 bg-surface-2 px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-text-secondary">
          <span className="font-medium text-text-primary">{t("banner.lead", { email: user.email })} </span>
          {t("banner.body")}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {status === "sent" ? (
            <span role="status" className="text-sm font-medium text-text-primary">
              {t("banner.sent")}
            </span>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={status === "sending"}
              className="min-h-touch-target rounded-control bg-accent-primary px-4 py-2 text-sm font-medium text-on-accent transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-60"
            >
              {status === "sending" ? t("banner.sending") : t("banner.resend")}
            </button>
          )}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label={t("banner.dismiss")}
            className="min-h-touch-target min-w-touch-target rounded-control px-2 text-sm text-text-tertiary transition hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            ✕
          </button>
        </div>
      </div>
      {status === "error" && error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
