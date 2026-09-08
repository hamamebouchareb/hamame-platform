"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { LoadingSkeleton } from "@/components";

const inputClass =
  "w-full rounded-input border border-border bg-surface-2 px-4 py-3 text-body text-text-primary placeholder:text-text-tertiary focus:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";

// Dedicated reset-confirm page: unlike /forgot-password (manual code paste),
// this route accepts the token from ?token= (e.g. from a reset link) and
// pre-fills it. Same backend, same validation rules, no new API.
function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState(searchParams.get("token") ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (token.trim().length === 0) {
      setError("Le code de réinitialisation est manquant.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setIsSubmitting(true);
    try {
      await apiFetch("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token: token.trim(), newPassword }),
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (success) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm text-center">
          <h1 className="mb-4 font-display text-h2 font-bold text-text-primary">
            Mot de passe réinitialisé
          </h1>
          <p className="mb-6 text-body text-text-secondary">
            Votre mot de passe a été modifié avec succès.
          </p>
          <Link
            href="/login"
            className="inline-flex w-full min-h-touch-target items-center justify-center rounded-control bg-accent-primary px-4 py-3 text-body font-medium text-on-accent transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            Se connecter
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center font-display text-h2 font-bold text-text-primary">
          Réinitialiser le mot de passe
        </h1>

        <form onSubmit={handleReset} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="token" className="text-sm font-medium text-text-secondary">
              Code de réinitialisation
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
              placeholder="Collez le code reçu"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="newPassword" className="text-sm font-medium text-text-secondary">
              Nouveau mot de passe
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
              Confirmer le mot de passe
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
            {isSubmitting ? "Réinitialisation..." : "Réinitialiser le mot de passe"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-text-secondary">
          <Link
            href="/login"
            className="font-medium text-accent-soft underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            Retour à la connexion
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center px-card-padding">
          <LoadingSkeleton className="h-8 w-48" ariaLabel="Chargement" />
        </main>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
