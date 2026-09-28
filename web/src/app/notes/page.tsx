"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { localeFor, type I18nKey, type UiLanguage } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { apiFetch, ApiError } from "@/lib/api";
import { cx } from "@/lib/cx";
import { AppHeader, BackLink, EmptyState, Footer, LoadingSkeleton } from "@/components";
import type { Note } from "@/lib/types";

const PAGE_LIMIT = 20;

/** Fixed 6-tag taxonomy (gap analysis §11, MedSparkDZ-confirmed) — slugs match
 * the backend NOTE_TAGS; labels/emoji are display-only. */
const NOTE_TAG_META: Array<{ slug: string; emoji: string; labelKey: I18nKey }> = [
  { slug: "difficile", emoji: "🔴", labelKey: "notes.tagDifficult" },
  { slug: "facile", emoji: "🟢", labelKey: "notes.tagEasy" },
  { slug: "important", emoji: "⚡", labelKey: "notes.tagImportant" },
  { slug: "a_reviser", emoji: "📚", labelKey: "notes.tagToReview" },
  { slug: "compris", emoji: "✅", labelKey: "notes.tagUnderstood" },
  { slug: "piege", emoji: "⚠️", labelKey: "notes.tagTricky" },
];

function tagLabel(slug: string, t: (key: I18nKey) => string): string {
  const meta = NOTE_TAG_META.find((entry) => entry.slug === slug);
  return meta ? `${meta.emoji} ${t(meta.labelKey)}` : slug;
}

interface NotesResponse {
  notes: Note[];
  pagination: { page: number; limit: number; total: number };
}

interface NoteFilters {
  q: string;
  tag: string;
  favoritesOnly: boolean;
}

const EMPTY_FILTERS: NoteFilters = { q: "", tag: "", favoritesOnly: false };

function formatDate(iso: string, lang: UiLanguage): string {
  return new Date(iso).toLocaleString(localeFor(lang), {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function filtersQuery(filters: NoteFilters): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.append("q", filters.q.trim());
  if (filters.tag) params.append("tag", filters.tag);
  if (filters.favoritesOnly) params.append("favoritesOnly", "true");
  const query = params.toString();
  return query ? `&${query}` : "";
}

export default function NotesPage() {
  const router = useRouter();
  const { logout } = useAuth();
  const { user, isHydrated } = useRequireAuth();
  const { lang, t } = useLanguage();

  const [notes, setNotes] = useState<Note[]>([]);
  const [page, setPage] = useState(0); // 0 = nothing loaded yet
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<NoteFilters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [editingTagsId, setEditingTagsId] = useState<string | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPage = useCallback(async (pageToLoad: number, activeFilters: NoteFilters) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiFetch<NotesResponse>(
        `/notes?page=${pageToLoad}&limit=${PAGE_LIMIT}${filtersQuery(activeFilters)}`
      );
      setNotes((prev) => (pageToLoad === 1 ? response.notes : [...prev, ...response.notes]));
      setPage(response.pagination.page);
      setTotal(response.pagination.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("notes.loadError"));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  // Initial fetch once auth hydrates.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isHydrated && user && page === 0) {
      loadPage(1, EMPTY_FILTERS);
    }
  }, [isHydrated, user, page, loadPage]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Debounced live search (500ms); tag/favorite changes apply immediately.
  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    []
  );

  function applyFilters(next: NoteFilters) {
    // NOTE: page is deliberately NOT reset to 0 here — the initial-load effect
    // above fires on page===0, and resetting would refire it with EMPTY_FILTERS,
    // racing this filtered load. loadPage(1, …) replaces the list directly.
    setFilters(next);
    setNotes([]);
    loadPage(1, next);
  }

  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      applyFilters({ ...filtersRef.current, q: value });
    }, 500);
  }

  // Mutable ref so the debounced timer always sees current non-search filters.
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  async function patchNote(id: string, patch: { tags?: string[]; isFavorite?: boolean }) {
    setMutatingId(id);
    try {
      const { note } = await apiFetch<{ note: Note }>(`/notes/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setNotes((prev) => prev.map((entry) => (entry.id === id ? { ...entry, ...note } : entry)));
      if (patch.tags !== undefined) setEditingTagsId(null);
    } catch {
      // Per-note failures stay local: the row simply doesn't change. A global
      // banner would punish the whole list for one row's failed PATCH.
    } finally {
      setMutatingId(null);
    }
  }

  function toggleTagFilter(slug: string) {
    applyFilters({ ...filters, tag: filters.tag === slug ? "" : slug });
  }

  function handleLogout() {
    logout();
    router.push("/login");
  }

  if (!isHydrated || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-card-padding">
        <LoadingSkeleton className="h-8 w-48" ariaLabel={t("common.loading")} />
      </main>
    );
  }

  const hasMore = page > 0 && notes.length < total;
  const isEmpty = page > 0 && notes.length === 0 && !isLoading && !error;
  const hasActiveFilters = filters.q.trim() !== "" || filters.tag !== "" || filters.favoritesOnly;

  return (
    <>
      <AppHeader user={user} onLogout={handleLogout} />

      <main className="mx-auto w-full max-w-2xl flex-1 px-card-padding py-section-gap">
        <BackLink href="/dashboard">{t("classement.backToDashboard")}</BackLink>
        <h1 className="mt-2 font-display text-h1 font-bold text-text-primary">{t("notes.title")}</h1>
        <p className="mt-2 text-body text-text-secondary">
          {t("notes.subtitle")}
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <label className="block">
            <span className="sr-only">{t("notes.searchSr")}</span>
            <input
              type="search"
              value={searchInput}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder={t("notes.searchPh")}
              className="h-11 w-full rounded-input border border-border bg-surface-2 px-4 text-body text-text-primary placeholder:text-text-tertiary transition focus:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            />
          </label>

          <div className="flex flex-wrap gap-2" role="group" aria-label={t("notes.filterTags")}>
            {NOTE_TAG_META.map((meta) => {
              const active = filters.tag === meta.slug;
              return (
                <button
                  key={meta.slug}
                  type="button"
                  onClick={() => toggleTagFilter(meta.slug)}
                  aria-pressed={active}
                  className={cx(
                    "inline-flex min-h-touch-target items-center gap-1 rounded-pill border px-3 text-meta font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                    active
                      ? "border-accent-qcm bg-accent-qcm/15 text-text-primary"
                      : "border-border text-text-secondary hover:bg-surface-2"
                  )}
                >
                  {meta.emoji} {t(meta.labelKey)}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => applyFilters({ ...filters, favoritesOnly: !filters.favoritesOnly })}
              aria-pressed={filters.favoritesOnly}
              className={cx(
                "inline-flex min-h-touch-target items-center gap-1 rounded-pill border px-3 text-meta font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                filters.favoritesOnly
                  ? "border-accent-secondary bg-accent-secondary/15 text-text-primary"
                  : "border-border text-text-secondary hover:bg-surface-2"
              )}
            >
              ★ {t("notes.favorites")}
            </button>
          </div>

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                applyFilters(EMPTY_FILTERS);
              }}
              className="self-start text-meta font-medium text-accent-soft underline underline-offset-2 hover:text-accent-soft/80"
            >
              {t("notes.clearFilters")}
            </button>
          ) : null}
        </div>

        {error ? (
          <div className="mt-4 rounded-card border border-danger bg-surface-1 p-card-padding">
            <p role="alert" className="text-body text-danger">
              {error}
            </p>
            <button
              type="button"
              onClick={() => loadPage(page === 0 ? 1 : page, filters)}
              className="mt-3 inline-flex min-h-touch-target w-full items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2 sm:w-auto"
            >
              {t("common.retry")}
            </button>
          </div>
        ) : null}

        {isEmpty ? (
          <div className="mt-section-gap">
            <EmptyState
              title={t(hasActiveFilters ? "notes.emptyFiltered" : "notes.empty")}
              description={t(hasActiveFilters ? "notes.emptyFilteredDesc" : "notes.emptyDesc")}
              action={
                hasActiveFilters
                  ? {
                      label: t("notes.clearFilters"),
                      onClick: () => {
                        setSearchInput("");
                        applyFilters(EMPTY_FILTERS);
                      },
                    }
                  : { label: t("dashboard.createQcm"), href: "/qcm" }
              }
            />
          </div>
        ) : null}

        {isLoading && notes.length === 0 && !error ? (
          <div className="mt-4 flex flex-col gap-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <LoadingSkeleton key={i} className="h-24 w-full rounded-card" />
            ))}
          </div>
        ) : null}

        {notes.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-3">
            {notes.map((note) => (
              <li key={note.id} className="rounded-card border border-border bg-surface-1 p-card-padding shadow-card">
                {note.question ? (
                  <p className="text-caption font-medium uppercase tracking-wide text-text-tertiary">
                    {t("notes.questionPrefix")} {note.question.label}
                  </p>
                ) : null}
                {note.lesson ? (
                  <p className="text-caption font-medium uppercase tracking-wide text-text-tertiary">
                    {t("notes.lessonPrefix")} {note.lesson.title}
                  </p>
                ) : null}
                <p className="mt-1 text-body text-text-primary">{note.bodyText}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {note.tags.map((slug) => (
                    <span
                      key={slug}
                      className="rounded-pill border border-border bg-surface-2 px-2 py-0.5 text-meta text-text-secondary"
                    >
                      {tagLabel(slug, t)}
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => patchNote(note.id, { isFavorite: !note.isFavorite })}
                    disabled={mutatingId === note.id}
                    aria-pressed={note.isFavorite}
                    aria-label={t(note.isFavorite ? "notes.favRemove" : "notes.favAdd")}
                    className={cx(
                      "inline-flex min-h-touch-target items-center rounded-pill border px-2 py-0.5 text-meta transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50",
                      note.isFavorite
                        ? "border-accent-secondary/60 text-accent-soft"
                        : "border-border text-text-tertiary hover:text-text-primary"
                    )}
                  >
                    ★
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingTagsId(editingTagsId === note.id ? null : note.id)}
                    aria-expanded={editingTagsId === note.id}
                    className="text-meta font-medium text-accent-soft underline underline-offset-2 hover:text-accent-soft/80"
                  >
                    Tags
                  </button>
                </div>
                {editingTagsId === note.id ? (
                  <div className="mt-2 flex flex-wrap gap-2 border-t border-border pt-2" role="group" aria-label={t("notes.editTags")}>
                    {NOTE_TAG_META.map((meta) => {
                      const checked = note.tags.includes(meta.slug);
                      return (
                        <button
                          key={meta.slug}
                          type="button"
                          disabled={mutatingId === note.id}
                          onClick={() => {
                            const next = checked
                              ? note.tags.filter((tag) => tag !== meta.slug)
                              : [...note.tags, meta.slug];
                            patchNote(note.id, { tags: next });
                          }}
                          aria-pressed={checked}
                          className={cx(
                            "inline-flex min-h-touch-target items-center gap-1 rounded-pill border px-3 text-meta font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50",
                            checked
                              ? "border-accent-qcm bg-accent-qcm/15 text-text-primary"
                              : "border-border text-text-secondary hover:bg-surface-2"
                          )}
                        >
                          {meta.emoji} {t(meta.labelKey)}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                <p className="mt-1 text-meta text-text-tertiary">{formatDate(note.createdAt, lang)}</p>
              </li>
            ))}
          </ul>
        ) : null}

        {hasMore ? (
          <button
            type="button"
            onClick={() => loadPage(page + 1, filters)}
            disabled={isLoading}
            className="mt-4 inline-flex min-h-touch-target w-full items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-60 sm:w-auto"
          >
            {isLoading ? t("common.loadingMore") : t("history.loadMore")}
          </button>
        ) : null}
      </main>

      <Footer />
    </>
  );
}
