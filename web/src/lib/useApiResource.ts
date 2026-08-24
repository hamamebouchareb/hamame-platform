"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";

interface ApiResourceState<T> {
  data: T | null;
  error: string | null;
  errorCode: string | null;
  isLoading: boolean;
  /** Re-runs the GET without changing `path`. Local component state (e.g. in-progress answers) is untouched. */
  refetch: () => void;
}

/**
 * Fetches a GET endpoint and tracks loading/error state, re-fetching whenever `path`
 * changes. Pass `null` to skip fetching (e.g. while waiting for auth to hydrate).
 */
export function useApiResource<T>(path: string | null): ApiResourceState<T> {
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<Omit<ApiResourceState<T>, "refetch">>({
    data: null,
    error: null,
    errorCode: null,
    isLoading: path !== null,
  });

  // Resetting to "loading" as soon as `path` changes (rather than only once the fetch
  // resolves) is a deliberate sync-with-external-system effect, not state that could
  // be computed during render.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (path === null) {
      setState({ data: null, error: null, errorCode: null, isLoading: false });
      return;
    }

    let cancelled = false;
    setState((prev) => ({
      // Keep prior data visible during refetch so answered-question UI is not blanked.
      data: prev.data,
      error: null,
      errorCode: null,
      isLoading: true,
    }));

    apiFetch<T>(path)
      .then((data) => {
        if (!cancelled) setState({ data, error: null, errorCode: null, isLoading: false });
      })
      .catch((err) => {
        if (!cancelled) {
          setState((prev) => ({
            data: prev.data,
            error: err instanceof ApiError ? err.message : "Something went wrong. Please try again.",
            errorCode: err instanceof ApiError ? err.code : null,
            isLoading: false,
          }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [path, nonce]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return {
    ...state,
    refetch: () => setNonce((n) => n + 1),
  };
}
