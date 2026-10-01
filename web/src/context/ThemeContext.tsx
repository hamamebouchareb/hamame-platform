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

export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const THEME_STORAGE_KEY = "hamame_theme";
const THEME_SET_KEY = "hamame_theme_set";

export const DEFAULT_THEME: ThemeChoice = "dark";

function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function resolve(choice: ThemeChoice): ResolvedTheme {
  return choice === "system" ? systemTheme() : choice;
}

function readStored(): ThemeChoice | null {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(raw) ? raw : null;
  } catch {
    return null;
  }
}

interface ThemeContextValue {
  /** What the student picked (system = follow the OS). */
  theme: ThemeChoice;
  /** What is actually painted (system resolved via matchMedia). */
  resolved: ResolvedTheme;
  setTheme: (next: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/**
 * UI theme state. The app shipped dark-only while the server column
 * defaulted to 'light', so a stored server 'light' can never mean a
 * deliberate pick — this deliberately deviates from LanguageContext's
 * server-wins rule: an explicit local pick wins; otherwise server
 * dark/system is adopted; otherwise (pristine 'light') we converge on dark
 * locally and write it back best-effort so the row tells the truth.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [theme, setThemeState] = useState<ThemeChoice>(() =>
    typeof window === "undefined" ? DEFAULT_THEME : (readStored() ?? DEFAULT_THEME)
  );

  // First-run convergence + server adoption (localStorage unavailable during SSR).
  // Sync-from-external-system on mount — same documented convention as
  // useApiResource and the dashboard localStorage reads.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      if (window.localStorage.getItem(THEME_SET_KEY) === "1") return;
      const server = user?.theme;
      if (server === "dark" || server === "system") {
        setThemeState(server);
        window.localStorage.setItem(THEME_STORAGE_KEY, server);
      } else {
        window.localStorage.setItem(THEME_STORAGE_KEY, DEFAULT_THEME);
        if (user) {
          void apiFetch("/users/me/preferences", {
            method: "PUT",
            body: JSON.stringify({ theme: DEFAULT_THEME }),
          }).catch(() => undefined);
        }
      }
    } catch {
      // Storage unavailable — session-only theme.
    }
  }, [user]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Paint + follow OS changes while 'system' is picked.
  const resolved = useMemo(() => resolve(theme), [theme]);
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  useEffect(() => {
    if (theme !== "system" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-color-scheme: light)");
    function onChange() {
      document.documentElement.dataset.theme = resolve("system");
    }
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback(
    (next: ThemeChoice) => {
      setThemeState(next);
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
        window.localStorage.setItem(THEME_SET_KEY, "1");
      } catch {
        // Ignore — state is already correct for this session.
      }
      if (user) {
        // Best-effort only: the toggle must work even if the save fails.
        void apiFetch("/users/me/preferences", {
          method: "PUT",
          body: JSON.stringify({ theme: next }),
        }).catch(() => undefined);
      }
    },
    [user]
  );

  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
