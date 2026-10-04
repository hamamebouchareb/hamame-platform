const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
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
    throw new ApiError(response.status, code, message);
  }

  return data as T;
}
