"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cx } from "@/lib/cx";
import { useLanguage } from "@/context/LanguageContext";
import type { I18nKey } from "@/lib/i18n";
import { searchableNav } from "@/lib/nav";
import { apiFetch } from "@/lib/api";
import { Icon, type IconName } from "@/components/Icon";

interface SearchResponse {
  lessons: { id: string; title: string }[];
  modules: { id: string; title: string }[];
  resources: { id: string; title: string }[];
  questions: { id: string; unitId: string; title: string; hint: string }[];
  people: { id: string; title: string }[];
}

interface Hit {
  key: string;
  title: string;
  hint?: string;
  icon: IconName;
  group: I18nKey;
  href?: string;
  personId?: string;
}

export function AppSearch({ roles, className }: { roles: string[] | undefined; className?: string }) {
  const { t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);

  const [remote, setRemote] = useState<SearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const items = useMemo(() => searchableNav(roles), [roles]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const requestId = ++requestRef.current;
    const handle = window.setTimeout(() => {
      setSearching(true);
      apiFetch<SearchResponse>(`/search?q=${encodeURIComponent(q)}`)
        .then((data) => {
          if (requestRef.current === requestId) setRemote(data);
        })
        .catch(() => {
          if (requestRef.current === requestId) setRemote(null);
        })
        .finally(() => {
          if (requestRef.current === requestId) setSearching(false);
        });
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase();
    const pages = (q ? items.filter((item) => t(item.labelKey).toLowerCase().includes(q)) : items.slice(0, 6)).map(
      (item) => ({
        key: `page:${item.href}`,
        title: t(item.labelKey),
        icon: item.icon ?? "search",
        group: "nav.searchPages" as const,
        href: item.href,
      })
    );
    if (!remote || q.length < 2) return pages;
    return [
      ...pages,
      ...remote.lessons.map((row) => ({
        key: `lesson:${row.id}`,
        title: row.title,
        icon: "library" as const,
        group: "nav.searchLessons" as const,
        href: `/lessons/${row.id}`,
      })),
      ...remote.modules.map((row) => ({
        key: `module:${row.id}`,
        title: row.title,
        icon: "library" as const,
        group: "nav.searchModules" as const,
        href: `/modules/${row.id}/units`,
      })),
      ...remote.questions.map((row) => ({
        key: `question:${row.id}`,
        title: row.title,
        hint: row.hint,
        icon: "qcm" as const,
        group: "nav.searchQuestions" as const,
        href: `/units/${row.unitId}`,
      })),
      ...remote.resources.map((row) => ({
        key: `resource:${row.id}`,
        title: row.title,
        icon: "resources" as const,
        group: "nav.searchResources" as const,
        href: `/resources/${row.id}`,
      })),
      ...remote.people.map((row) => ({
        key: `person:${row.id}`,
        title: row.title,
        icon: "messages" as const,
        group: "nav.searchPeople" as const,
        personId: row.id,
      })),
    ];
  }, [items, query, remote, t]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const inField =
        event.target instanceof HTMLElement &&
        (event.target.tagName === "INPUT" ||
          event.target.tagName === "TEXTAREA" ||
          event.target.isContentEditable);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
        return;
      }
      if (event.key === "/" && !inField) {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, []);

  async function go(hit: Hit) {
    setOpen(false);
    setQuery("");
    if (hit.personId) {
      try {
        const data = await apiFetch<{ conversation: { id: string } }>("/dms/conversations", {
          method: "POST",
          body: JSON.stringify({ userId: hit.personId }),
        });
        router.push(`/messages?c=${data.conversation.id}`);
      } catch {
        router.push("/messages");
      }
      return;
    }
    if (hit.href && hit.href !== pathname) router.push(hit.href);
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(hits.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter" && hits[active]) {
      event.preventDefault();
      void go(hits[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  return (
    <div ref={rootRef} className={cx("relative min-w-0", className)}>
      <label className="sr-only" htmlFor="app-search">
        {t("nav.searchAria")}
      </label>
      <div className="relative">
        <Icon
          name="search"
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
        />
        <input
          ref={inputRef}
          id="app-search"
          type="search"
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => {
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder={t("nav.searchPlaceholder")}
          className="h-10 w-full rounded-pill border border-border bg-surface-2 pl-9 pr-16 text-meta text-text-primary placeholder:text-text-tertiary transition focus:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-control border border-border bg-surface-1 px-1.5 py-0.5 text-caption text-text-tertiary sm:inline">
          {t("nav.searchHint")}
        </kbd>
      </div>
      {open ? (
        <ul
          role="listbox"
          className="absolute z-40 mt-2 max-h-[28rem] w-full overflow-y-auto rounded-card border border-border bg-surface-1 p-1 shadow-card"
        >
          {searching && hits.length === 0 ? (
            <li className="px-3 py-3 text-meta text-text-secondary">{t("nav.searching")}</li>
          ) : hits.length === 0 ? (
            <li className="px-3 py-3 text-meta text-text-secondary">{t("nav.searchEmpty")}</li>
          ) : (
            hits.map((hit, index) => {
              const showGroup = index === 0 || hits[index - 1].group !== hit.group;
              return (
                <li key={hit.key} role="option" aria-selected={index === active}>
                  {showGroup ? (
                    <p className="px-3 pb-1 pt-2 text-caption font-medium uppercase tracking-wide text-text-tertiary">
                      {t(hit.group)}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onMouseEnter={() => setActive(index)}
                    onClick={() => void go(hit)}
                    className={cx(
                      "flex w-full items-center gap-3 rounded-control px-3 py-2 text-left transition",
                      index === active ? "bg-surface-3 text-text-primary" : "text-text-secondary hover:bg-surface-2"
                    )}
                  >
                    <Icon name={hit.icon} size={16} className="shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body">{hit.title}</span>
                      {hit.hint ? <span className="block truncate text-caption text-text-tertiary">{hit.hint}</span> : null}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
