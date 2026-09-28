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
import { apiFetch } from "@/lib/api";

const STORAGE_KEY = "hamame_auth";

export interface AuthUser {
  id: string;
  email: string | null;
  phone: string | null;
  fullName: string;
  facultyId: string | null;
  yearId: string | null;
  university: string | null;
  wilaya: string | null;
  uiLanguage: string;
  theme: string;
  status: string;
  createdAt: string;
  // ISO timestamps from GET /api/users/me (null until verified). Backend added
  // these to the auth/profile payloads with the email-verification build; sessions
  // stored before that have neither key, so every reader must normalize with ?? null.
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  // Role names from GET /api/users/me. Login/register don't return roles, so after
  // auth we always follow up with /users/me to populate this (and on hydrate when
  // a stored session is missing it, e.g. sessions saved before roles existed).
  roles: string[];
}

interface AuthResponse {
  accessToken: string;
  user: Omit<AuthUser, "roles"> & { roles?: string[] };
}

interface StoredAuth {
  token: string;
  user: AuthUser;
}

export interface RegisterInput {
  email?: string;
  phone?: string;
  password: string;
  fullName: string;
}

export interface LoginInput {
  email?: string;
  phone?: string;
  password: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isHydrated: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  /** Adopt an externally-issued access token (Google OAuth callback handoff):
      validates it against GET /users/me before storing anything. */
  loginWithToken: (accessToken: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// NOTE: localStorage is a pragmatic MVP choice for persisting the session across
// page refreshes — it is NOT the most secure long-term option (httpOnly cookies would
// protect the token from XSS-based theft). This can be revisited later purely on the
// frontend, without any backend changes, since the backend only cares about the
// Authorization header.
function readStoredAuth(): StoredAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAuth;
    if (!parsed.token || !parsed.user) return null;
    // Older sessions may lack `roles` or the verification timestamps — normalize
    // so callers can always read an array / null respectively.
    return {
      token: parsed.token,
      user: {
        ...parsed.user,
        roles: Array.isArray(parsed.user.roles) ? parsed.user.roles : [],
        emailVerifiedAt: parsed.user.emailVerifiedAt ?? null,
        phoneVerifiedAt: parsed.user.phoneVerifiedAt ?? null,
      },
    };
  } catch {
    return null;
  }
}

function writeStoredAuth(auth: StoredAuth) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
}

function clearStoredAuth() {
  window.localStorage.removeItem(STORAGE_KEY);
}

/**
 * Login/register responses don't include roles. After we have a token in
 * localStorage (apiFetch reads it from there), fetch GET /users/me for the
 * roles-inclusive profile and merge it onto the auth user.
 */
async function fetchProfileWithRoles(fallbackUser: Omit<AuthUser, "roles"> & { roles?: string[] }): Promise<AuthUser> {
  try {
    const profile = await apiFetch<AuthUser>("/users/me");
    return {
      ...fallbackUser,
      ...profile,
      roles: Array.isArray(profile.roles) ? profile.roles : [],
    };
  } catch {
    // Profile fetch failed (network blip, etc.) — keep the auth session usable
    // without roles rather than failing login entirely. Role-gated UI will simply
    // hide until the next successful hydrate/login.
    return { ...fallbackUser, roles: Array.isArray(fallbackUser.roles) ? fallbackUser.roles : [] };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  // Reading localStorage (an external system unavailable during SSR) and syncing it
  // into React state on mount is exactly what this effect is for, so the direct
  // setState calls below are intentional rather than something to lift into render.
  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const stored = readStoredAuth();
      if (!stored) {
        if (!cancelled) setIsHydrated(true);
        return;
      }

      // Apply stored session immediately so protected pages don't flash a redirect.
      setUser(stored.user);
      setToken(stored.token);

      // If roles are missing (pre-roles localStorage), refresh from /users/me.
      // Token is already in localStorage so apiFetch can attach it.
      if (stored.user.roles.length === 0) {
        const profile = await fetchProfileWithRoles(stored.user);
        if (!cancelled) {
          setUser(profile);
          writeStoredAuth({ token: stored.token, user: profile });
        }
      }

      if (!cancelled) setIsHydrated(true);
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyAuthResponse = useCallback(async (data: AuthResponse) => {
    // Normalize in case the backend predates the verification fields.
    const normalizedUser = {
      ...data.user,
      emailVerifiedAt: data.user.emailVerifiedAt ?? null,
      phoneVerifiedAt: data.user.phoneVerifiedAt ?? null,
    };
    // Persist the token first so the follow-up GET /users/me can authenticate.
    writeStoredAuth({
      token: data.accessToken,
      user: { ...normalizedUser, roles: Array.isArray(normalizedUser.roles) ? normalizedUser.roles : [] },
    });
    setToken(data.accessToken);

    const profile = await fetchProfileWithRoles(normalizedUser);
    setUser(profile);
    writeStoredAuth({ token: data.accessToken, user: profile });
  }, []);

  const login = useCallback(
    async (input: LoginInput) => {
      const data = await apiFetch<AuthResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      });
      await applyAuthResponse(data);
    },
    [applyAuthResponse]
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const data = await apiFetch<AuthResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify(input),
      });
      await applyAuthResponse(data);
    },
    [applyAuthResponse]
  );

  const loginWithToken = useCallback(async (accessToken: string) => {
    // Stage the token first so the profile fetch below authenticates; a stale
    // entry can never linger because readStoredAuth() rejects user-less rows
    // and every path below either writes a complete session or clears.
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: accessToken, user: null }));
    try {
      const profile = await apiFetch<AuthUser>("/users/me");
      setToken(accessToken);
      setUser(profile);
      writeStoredAuth({ token: accessToken, user: profile });
    } catch {
      clearStoredAuth();
      throw new Error("External token rejected by /users/me.");
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    clearStoredAuth();
  }, []);

  const value = useMemo(
    () => ({ user, token, isHydrated, login, register, loginWithToken, logout }),
    [user, token, isHydrated, login, register, loginWithToken, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
