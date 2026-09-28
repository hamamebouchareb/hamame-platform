"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import { useLanguage } from "@/context/LanguageContext";
import { LanguageToggle } from "@/components";

type Step = "request" | "reset";

export default function ForgotPasswordPage() {
  const { t } = useLanguage();
  const [step, setStep] = useState<Step>("request");

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);

  const inputClass =
    "w-full rounded-input border border-border bg-surface-2 px-4 py-3 text-body text-text-primary placeholder:text-text-tertiary focus:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";

  async function handleRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);
    try {
      const data = await apiFetch<{ message: string; resetToken?: string }>(
        "/auth/forgot-password",
        { method: "POST", body: JSON.stringify({ email }) }
      );
      setSuccessMessage(data.message);
      if (data.resetToken) {
        setToken(data.resetToken);
        setStep("reset");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("auth.genericError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResetError(null);

    if (newPassword.length < 8) {
      setResetError(t("auth.passwordShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError(t("settings.passwordMismatch"));
      return;
    }

    setIsSubmitting(true);
    try {
      await apiFetch("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword }),
      });
      setResetSuccess(true);
    } catch (err) {
      setResetError(err instanceof ApiError ? err.message : t("auth.genericError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (resetSuccess) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center px-4 py-10">
        <div className="absolute right-4 top-4">
          <LanguageToggle />
        </div>
        <div className="w-full max-w-sm text-center">
          <h1 className="mb-4 font-display text-h2 font-bold text-text-primary">
            {t("auth.resetDone")}
          </h1>
          <p className="mb-6 text-body text-text-secondary">
            {t("auth.resetDoneBody")}
          </p>
          <Link
            href="/login"
            className="inline-flex w-full min-h-touch-target items-center justify-center rounded-control bg-accent-primary px-4 py-3 text-body font-medium text-on-accent transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            {t("auth.loginCta")}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <LanguageToggle />
      </div>
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center font-display text-h2 font-bold text-text-primary">
          {t("auth.forgotTitle")}
        </h1>

        {step === "request" ? (
          <>
            {successMessage && (
              <p role="status" className="mb-4 rounded-control border border-success/40 bg-surface-2 px-3 py-2 text-sm text-success">
                {successMessage}
              </p>
            )}

            <form onSubmit={handleRequest} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="email" className="text-sm font-medium text-text-secondary">
                  {t("auth.emailAddress")}
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="vous@exemple.com"
                />
              </div>

              {error && (
                <p role="alert" className="rounded-control border border-danger/40 bg-surface-2 px-3 py-2 text-sm text-danger">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 w-full min-h-touch-target rounded-control bg-accent-primary px-4 py-3 text-body font-medium text-on-accent transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-60"
              >
                {isSubmitting ? t("auth.sending") : t("auth.sendResetLink")}
              </button>
            </form>
          </>
        ) : (
          <form onSubmit={handleReset} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="token" className="text-sm font-medium text-text-secondary">
                {t("auth.resetCode")}
              </label>
              <input
                id="token"
                name="token"
                type="text"
                required
                autoComplete="one-time-code"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className={inputClass}
                placeholder={t("auth.pasteCode")}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="newPassword" className="text-sm font-medium text-text-secondary">
                {t("auth.newPassword")}
              </label>
              <input
                id="newPassword"
                name="newPassword"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirmPassword" className="text-sm font-medium text-text-secondary">
                {t("auth.confirmPassword")}
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputClass}
              />
            </div>

            {resetError && (
              <p role="alert" className="rounded-control border border-danger/40 bg-surface-2 px-3 py-2 text-sm text-danger">
                {resetError}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 w-full min-h-touch-target rounded-control bg-accent-primary px-4 py-3 text-body font-medium text-on-accent transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-60"
            >
              {isSubmitting ? t("auth.resetting") : t("auth.doReset")}
            </button>

            <button
              type="button"
              onClick={() => { setStep("request"); setToken(""); setNewPassword(""); setConfirmPassword(""); setResetError(null); }}
              className="w-full min-h-touch-target rounded-control border border-border px-4 py-3 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2"
            >
              {t("auth.back")}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-text-secondary">
          <Link
            href="/login"
            className="font-medium text-accent-soft underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            {t("auth.backToLogin")}
          </Link>
        </p>
      </div>
    </main>
  );
}
