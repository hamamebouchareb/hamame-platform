"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

export interface ApiListState<T> {
  /** One entry per requested path, aligned by index. Failed/skipped entries are null. */
  data: (T | null)[];
  isLoading: boolean;
}

/**
 * Parallel-fetches a batch of GET paths, returning results aligned by index.
 *
 * Re-runs whenever the batch changes — e.g. when a parent resource loads and the
 * per-child ids become known (the curriculum pages' N+1 count/progress pattern). Pass
 * `null` (or an empty array) to skip the whole batch.
 *
 * Unlike the backend pooler guidance (which is about concurrent Prisma queries inside
 * one HTTP request), these are separate browser requests, so they are safe to fan out.
 */
export function useApiList<T>(paths: string[] | null): ApiListState<T> {
  // `pathsKey` is the stable serialized identity of the batch, so the fetch effect only
  // re-runs when the batch contents actually change (URLs never contain "|").
  const pathsKey = paths ? paths.join("|") : "";
  // Latest batch for the effect to read without a render-phase ref access
  // (react-hooks/refs forbids reading/writing .current during render).
  const pathsRef = useRef(paths);

  const [state, setState] = useState<ApiListState<T>>({
    data: [],
    isLoading: paths !== null && paths.length > 0,
  });

  useEffect(() => {
    pathsRef.current = paths;
  });

  useEffect(() => {
    const batch = pathsRef.current;
    if (!batch || batch.length === 0) {
      setState({ data: [], isLoading: false });
      return;
    }

    let cancelled = false;
    setState((prev) => ({ data: prev.data, isLoading: true }));

    Promise.allSettled(batch.map((path) => apiFetch<T>(path)))
      .then((results) => {
        if (cancelled) return;
        setState({ data: results.map((result) => (result.status === "fulfilled" ? result.value : null)), isLoading: false });
      })
      .catch(() => {
        if (!cancelled) setState({ data: batch.map(() => null), isLoading: false });
      });

    return () => {
      cancelled = true;
    };
  }, [pathsKey]);

  return state;
}
