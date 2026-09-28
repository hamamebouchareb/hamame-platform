"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";

/**
 * "Continue with Google" button. Renders nothing unless the backend reports
 * Google as configured (GET /api/auth/providers) — unconfigured servers show
 * no dead button. Clicking fetches a fresh authorization URL (with CSRF
 * state) and hands off to Google with a full redirect.
 */
export function GoogleSignInButton({ className }: { className?: string }) {
  const { t } = useLanguage();
  const [enabled, setEnabled] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ providers: { google: boolean } }>("/auth/providers")
      .then((data) => {
        if (!cancelled) setEnabled(data.providers.google === true);
      })
      .catch(() => {
        // Unreachable API — button stays hidden rather than dead.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!enabled) return null;

  async function start() {
    setStarting(true);
    try {
      const data = await apiFetch<{ url: string }>("/auth/google/url");
      window.location.href = data.url;
    } catch {
      setStarting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void start()}
      disabled={starting}
      className={
        "inline-flex min-h-touch-target w-full items-center justify-center gap-2 rounded-control border border-border bg-surface-1 px-4 py-3 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-60 " +
        (className ?? "")
      }
    >
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
        <path
          fill="#4285F4"
          d="M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.3h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.1.1 3.5 2.7.2.1c2.2-2 3.8-5.1 3.8-8.7z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.8-5l-.1.1-3.6 2.8v.1C3.5 21.4 7.4 24 12 24z"
        />
        <path
          fill="#FBBC05"
          d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-.1-.1-3.6-2.8-.1.1C.5 8.6 0 10.2 0 12s.5 3.4 1.4 4.9l3.8-2.5z"
        />
        <path
          fill="#EA4335"
          d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.4 0 3.5 2.6 1.4 6.7l3.8 2.9c1-2.8 3.6-4.9 6.8-4.9z"
        />
      </svg>
      {starting ? t("settings.pushLoading") : t("auth.googleCta")}
    </button>
  );
}
