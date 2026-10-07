"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { localeFor, type UiLanguage } from "@/lib/i18n";
import { ApiError } from "@/lib/api";
import { GoogleSignInButton, LanguageToggle } from "@/components";

function suspensionText(
  t: (key: "auth.suspended" | "auth.suspendedUntil", vars?: Record<string, string>) => string,
  lang: UiLanguage,
  until: string | null
): string {
  if (!until) return t("auth.suspended");
  const date = new Date(until).toLocaleDateString(localeFor(lang), { dateStyle: "medium" });
  return `${t("auth.suspended")} ${t("auth.suspendedUntil", { date })}`;
}

export default function LoginPage() {
  const router = useRouter();
  const { login, loginWithToken } = useAuth();
  const { lang, t } = useLanguage();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Google OAuth landing: the backend callback redirects here with
  // ?google_token=<jwt> (success) or ?google_error=<code> (failure).
  // A suspended session lands here with ?suspended=1[&until=<iso>] via the
  // apiFetch redirect. window.location (not useSearchParams) keeps this page
  // Suspense-free.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const suspended = params.get("suspended");
    if (suspended) {
      setError(suspensionText(t, lang, params.get("until")));
      router.replace("/login");
      return;
    }
    const googleToken = params.get("google_token");
    const googleError = params.get("google_error");
    if (!googleToken && !googleError) return;
    router.replace("/login");
    if (googleError) {
      setError(t("auth.googleFailed"));
      return;
    }
    setIsSubmitting(true);
    loginWithToken(googleToken as string)
      .then(() => router.push("/dashboard"))
      .catch(() => {
        setError(t("auth.googleFailed"));
        setIsSubmitting(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login({ email, password });
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.code === "ACCOUNT_SUSPENDED") {
        setError(suspensionText(t, lang, err.details?.suspendedUntil ?? null));
      } else {
        setError(err instanceof ApiError ? err.message : t("auth.genericError"));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <LanguageToggle />
      </div>
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center font-display text-h2 font-bold text-text-primary">
          {t("auth.loginTitle")}
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium text-text-secondary">
              {t("settings.email")}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-input border border-border bg-surface-2 px-4 py-3 text-body text-text-primary placeholder:text-text-tertiary focus:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              placeholder="vous@exemple.com"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium text-text-secondary">
              {t("auth.password")}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-input border border-border bg-surface-2 px-4 py-3 text-body text-text-primary placeholder:text-text-tertiary focus:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            />
          </div>

          <div className="text-right">
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-accent-soft underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              {t("auth.forgotLink")}
            </Link>
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
            {isSubmitting ? t("auth.signingIn") : t("auth.loginCta")}
          </button>
        </form>

        <div className="mt-4">
          <GoogleSignInButton />
        </div>

        <p className="mt-6 text-center text-sm text-text-secondary">
          {t("auth.noAccount")}{" "}
          <Link
            href="/register"
            className="font-medium text-accent-soft underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            {t("auth.signupLink")}
          </Link>
        </p>
      </div>
    </main>
  );
}
