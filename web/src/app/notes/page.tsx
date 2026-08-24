"use client";

import { useCallback, useEffect, useState } from "react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { apiFetch, ApiError } from "@/lib/api";
import type { Note } from "@/lib/types";

const PAGE_LIMIT = 20;

interface NotesResponse {
  notes: Note[];
  pagination: { page: number; limit: number; total: number };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function NotesPage() {
  const { user, isHydrated } = useRequireAuth();

  const [notes, setNotes] = useState<Note[]>([]);
  const [page, setPage] = useState(0); // 0 = nothing loaded yet
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (pageToLoad: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiFetch<NotesResponse>(`/notes?page=${pageToLoad}&limit=${PAGE_LIMIT}`);
      setNotes((prev) => (pageToLoad === 1 ? response.notes : [...prev, ...response.notes]));
      setPage(response.pagination.page);
      setTotal(response.pagination.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fires the initial fetch once auth hydrates — same intentional
  // sync-with-external-system pattern as useApiResource (see notes on that file).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isHydrated && user && page === 0) {
      loadPage(1);
    }
  }, [isHydrated, user, page, loadPage]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!isHydrated || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-gray-500">Loading...</p>
      </main>
    );
  }

  const hasMore = page > 0 && notes.length < total;

  return (
    <main className="mx-auto min-h-screen w-full max-w-md px-4 py-8">
      <h1 className="text-2xl font-semibold text-gray-900">My Notes</h1>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {page > 0 && notes.length === 0 && !isLoading && (
        <p className="mt-4 text-sm text-gray-500">You haven&apos;t written any notes yet.</p>
      )}

      <ul className="mt-4 flex flex-col gap-3">
        {notes.map((note) => (
          <li key={note.id} className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
            {note.question && (
              <p className="text-xs font-medium uppercase text-gray-500">On question: {note.question.label}</p>
            )}
            {note.lesson && (
              <p className="text-xs font-medium uppercase text-gray-500">On lesson: {note.lesson.title}</p>
            )}
            <p className="mt-1 text-base text-gray-900">{note.bodyText}</p>
            <p className="mt-1 text-xs text-gray-400">{formatDate(note.createdAt)}</p>
          </li>
        ))}
      </ul>

      {isLoading && <p className="mt-4 text-sm text-gray-500">Loading notes...</p>}

      {hasMore && (
        <button
          type="button"
          onClick={() => loadPage(page + 1)}
          disabled={isLoading}
          className="mt-4 w-full rounded-lg border border-gray-300 px-4 py-3 text-base font-medium text-gray-900 transition hover:bg-gray-50 disabled:opacity-60"
        >
          {isLoading ? "Loading..." : "Load more"}
        </button>
      )}
    </main>
  );
}
