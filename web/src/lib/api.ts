const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: { suspendedUntil?: string | null };
  };
}

export class ApiError extends Error {
  code: string;
  status: number;
  details?: { suspendedUntil?: string | null };

  constructor(status: number, code: string, message: string, details?: { suspendedUntil?: string | null }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Reads the current access token from wherever AuthContext persisted it.
 * Kept as a plain function (not a hook) so apiFetch can be called from
 * anywhere, including outside of React components.
 */
function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("hamame_auth");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: string | null };
    return parsed.token ?? null;
  } catch {
    return null;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  // API_BASE_URL already ends in /api — a path starting with /api/ would
  // produce /api/api/... and 404. Fail fast outside production so the bad
  // call site is found at click time, not as a mystery 404 in the logs.
  if (process.env.NODE_ENV !== "production" && path.startsWith("/api/")) {
    throw new Error(
      `apiFetch path must not start with "/api/" (got "${path}"): API_BASE_URL already includes /api.`
    );
  }
  const token = getStoredToken();

  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const body = data as ApiErrorBody | null;
    const code = body?.error?.code ?? "UNKNOWN_ERROR";
    const message = body?.error?.message ?? "Something went wrong. Please try again.";
    const details = body?.error?.details;
    if (response.status === 401 && code === "TOKEN_REVOKED") {
      // Own older token died to a password/reset/link/restrict bump: drop it
      // and bounce to login with an expiry message — but ONLY if storage still
      // holds the token this request sent. A newer token swapped in meanwhile
      // (e.g. a password change completing while an old request was in flight)
      // must survive; clearing blindly would sign out the fresh session.
      // Skipped on /login itself, where the page shows the message inline —
      // same shape as the ACCOUNT_SUSPENDED redirect below.
      try {
        const raw = window.localStorage.getItem("hamame_auth");
        const stored = raw ? ((JSON.parse(raw) as { token?: string | null }).token ?? null) : null;
        if (stored === null || stored === token) {
          window.localStorage.removeItem("hamame_auth");
        }
      } catch {
        // Storage unavailable or unparseable — the redirect below still signs them out.
      }
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.assign("/login?session=expired");
      }
    }
    if (response.status === 403 && code === "ACCOUNT_SUSPENDED") {
      // Suspended mid-session: drop the now-useless token and bounce to
      // login with the message encoded in the query (end date when given).
      // Skipped on /login itself, where the page shows the message inline.
      try {
        window.localStorage.removeItem("hamame_auth");
      } catch {
        // Storage unavailable — the redirect below still signs them out.
      }
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        const until = details?.suspendedUntil ?? null;
        const query = until ? `?suspended=1&until=${encodeURIComponent(until)}` : "?suspended=1";
        window.location.assign(`/login${query}`);
      }
    }
    throw new ApiError(response.status, code, message, details);
  }

  return data as T;
}
