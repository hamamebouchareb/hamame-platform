"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { LoadingSkeleton } from "@/components";

// Email-verification landing for the /verify?token= link sent by
// sendVerificationEmail (src/lib/email.ts). Auto-submits when the token is in
// the URL; manual paste is kept as a fallback (same pattern as /reset-password)
// for tokens obtained from the dev log / non-production register response.
function VerifyForm() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState(searchParams.get("token") ?? "");
  const [status, setStatus] = useState<"idle" | "verifying" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submitToken(rawToken: string) {
    const trimmed = rawToken.trim();
    if (trimmed.length === 0) {
      setStatus("error");
      setError("Le code de vérification est manquant.");
      return;
    }
    setStatus("verifying");
    setError(null);
    try {
      await apiFetch("/auth/verify", {
        method: "POST",
        body: JSON.stringify({ token: trimmed }),
      });
      // Refresh the stored session so the dashboard banner disappears without
      // requiring a full re-login (warn-only: verification never blocks).
      try {
        const profile = await apiFetch<Record<string, unknown>>("/users/me");
        const raw = window.localStorage.getItem("hamame_auth");
        if (raw) {
          const stored = JSON.parse(raw) as { token?: string; user?: Record<string, unknown> };
          if (stored.token && stored.user) {
            window.localStorage.setItem(
              "hamame_auth",
              JSON.stringify({ token: stored.token, user: { ...stored.user, ...profile } })
            );
          }
        }
      } catch {
        // Profile refresh is cosmetic — verification itself already succeeded.
      }
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err instanceof ApiError ? err.message : "Une erreur est survenue. Veuillez réessayer.");
    }
  }

  // Auto-submit once on mount when the email link carried the token.
  useEffect(() => {
    const fromUrl = searchParams.get("token") ?? "";
    if (fromUrl.trim().length > 0) {
      void submitToken(fromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitToken(token);
  }

  if (status === "success") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm text-center">
          <h1 className="mb-4 font-display text-h2 font-bold text-text-primary">
            Adresse email vérifiée
          </h1>
          <p className="mb-6 text-body text-text-secondary">
            Merci ! Votre adresse email est confirmée et votre compte est sécurisé.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex w-full min-h-touch-target items-center justify-center rounded-control bg-accent-primary px-4 py-3 text-body font-medium text-on-accent transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            Aller au tableau de bord
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center font-display text-h2 font-bold text-text-primary">
          Vérifier votre email
        </h1>

        {status === "verifying" ? (
          <div className="flex flex-col items-center gap-4">
            <LoadingSkeleton className="h-8 w-48" ariaLabel="Vérification en cours" />
            <p className="text-sm text-text-secondary">Vérification en cours...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="token" className="text-sm font-medium text-text-secondary">
                Code de vérification
              </label>
              <input
                id="token"
                name="token"
                type="text"
                required
                autoComplete="one-time-code"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="w-full rounded-input border border-border bg-surface-2 px-4 py-3 text-body text-text-primary placeholder:text-text-tertiary focus:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                placeholder="Collez le code reçu par email"
              />
            </div>

            {status === "error" && error && (
              <p role="alert" className="rounded-control border border-danger/40 bg-surface-2 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="mt-2 w-full min-h-touch-target rounded-control bg-accent-primary px-4 py-3 text-body font-medium text-on-accent transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-60"
            >
              Vérifier mon email
            </button>
          </form>
        )}

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

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center px-card-padding">
          <LoadingSkeleton className="h-8 w-48" ariaLabel="Chargement" />
        </main>
      }
    >
      <VerifyForm />
    </Suspense>
  );
}
