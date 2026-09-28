"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  isUiLanguage,
  translate,
  type I18nKey,
  type UiLanguage,
} from "@/lib/i18n";

interface LanguageContextValue {
  lang: UiLanguage;
  setLanguage: (next: UiLanguage) => void;
  t: (key: I18nKey, vars?: Record<string, string | number | null | undefined>) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

/**
 * UI language state. Resolution order: server `uiLanguage` (adopted on
 * login/hydrate — the server wins disagreements) → localStorage
 * (`hamame_lang`, covers logged-out guests) → French default.
 *
 * Toggling applies instantly (state + localStorage + <html lang>) and
 * persists best-effort via PUT /users/me/preferences when authenticated —
 * a failed save never blocks the switch.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [lang, setLang] = useState<UiLanguage>(DEFAULT_LANGUAGE);

  // Guest preference, read once on mount (localStorage is unavailable during SSR).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (isUiLanguage(stored)) setLang(stored);
    } catch {
      // Storage unavailable (private mode) — stay on the default.
    }
  }, []);

  // Adopt the server value whenever the authenticated profile (re)loads —
  // this covers login, registration, and cross-device consistency.
  const serverLang = user?.uiLanguage;
  useEffect(() => {
    if (isUiLanguage(serverLang)) {
      setLang(serverLang);
      try {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, serverLang);
      } catch {
        // Ignore — state is already correct for this session.
      }
    }
  }, [serverLang]);

  // Keep the document language in sync for screen readers and SEO.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLanguage = useCallback(
    (next: UiLanguage) => {
      setLang(next);
      try {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
      } catch {
        // Ignore — state is already correct for this session.
      }
      if (user) {
        // Best-effort only: the toggle must work even if the save fails.
        void apiFetch("/users/me/preferences", {
          method: "PUT",
          body: JSON.stringify({ uiLanguage: next }),
        }).catch(() => undefined);
      }
    },
    [user]
  );

  const t = useCallback(
    (key: I18nKey, vars?: Record<string, string | number | null | undefined>) =>
      translate(lang, key, vars),
    [lang]
  );

  const value = useMemo(() => ({ lang, setLanguage, t }), [lang, setLanguage, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return ctx;
}
