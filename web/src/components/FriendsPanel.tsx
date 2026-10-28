"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cx } from "@/lib/cx";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch, ApiError } from "@/lib/api";
import { EmptyState } from "@/components/EmptyState";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { PresenceDot } from "@/components/PresenceDot";
import type { UserSearchResult } from "@/lib/types";

interface Person {
  id: string;
  fullName: string | null;
  online?: boolean;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Dashboard friends: search, incoming requests, and a chat shortcut. */
export function FriendsPanel({ className }: { className?: string }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [friends, setFriends] = useState<Person[]>([]);
  const [incoming, setIncoming] = useState<Person[]>([]);
  const [outgoing, setOutgoing] = useState<Person[]>([]);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [friendData, requestData, outgoingData] = await Promise.all([
      apiFetch<{ friends: Person[] }>("/friends"),
      apiFetch<{ requests: { userId: string; fullName: string | null }[] }>("/friends/requests"),
      apiFetch<{ requests: { userId: string; fullName: string | null }[] }>("/friends/outgoing"),
    ]);
    setFriends(friendData.friends);
    setIncoming(requestData.requests.map((row) => ({ id: row.userId, fullName: row.fullName })));
    setOutgoing(outgoingData.requests.map((row) => ({ id: row.userId, fullName: row.fullName })));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await reload();
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : t("dashboard.friendsError", { error: "" }));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search hits carry the SERVER-derived relationship (types.ts
  // UserSearchResult): the database's truth at search time, never a
  // mount-time snapshot of local lists (that snapshot was the stale-chip bug).
  const fetchSearch = useCallback(async (q: string) => {
    const data = await apiFetch<{ users: UserSearchResult[] }>(`/users/search?q=${encodeURIComponent(q)}`);
    setFound(data.users);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return;
    const handle = window.setTimeout(() => {
      fetchSearch(q).catch(() => setFound([]));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query, fetchSearch]);

  // The other person acts OUTSIDE this tab: they can accept your request while
  // this panel sits open, and the old client-side chips stayed stale forever
  // (the reported "En attente" bug). On window focus and on the tab becoming
  // visible, reload the lists and re-run an active search so state converges
  // to server truth without the user re-typing anything. Re-subscribing per
  // query change is intentional and trivial (two window listeners).
  const converge = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    // A transient pooler hiccup keeps the current view — never blanks it.
    void reload().catch(() => undefined);
    const q = query.trim();
    if (q.length >= 3) void fetchSearch(q).catch(() => undefined);
  }, [query, reload, fetchSearch]);

  useEffect(() => {
    window.addEventListener("focus", converge);
    document.addEventListener("visibilitychange", converge);
    // Focus/visibility only fire when the tab is LEFT and re-entered. The
    // reported flow never leaves the tab: the sender watches this panel while
    // the friend accepts on their own device, so no event ever fires and the
    // outgoing row stayed "En attente" until a manual reload. A quiet 20s poll
    // (converge already no-ops when hidden) closes that hole — same polling
    // discipline as the bell (45s), the docked chats (12s) and the messages
    // page (5s).
    const interval = window.setInterval(converge, 20_000);
    return () => {
      window.removeEventListener("focus", converge);
      document.removeEventListener("visibilitychange", converge);
      window.clearInterval(interval);
    };
  }, [converge]);

  async function add(userId: string) {
    setNotice(null);
    try {
      await apiFetch("/friends", { method: "POST", body: JSON.stringify({ userId }) });
      setNotice(t("friends.sent"));
      setQuery("");
      setFound([]);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("friends.noResults"));
    }
  }

  async function accept(userId: string) {
    await apiFetch(`/friends/${userId}/accept`, { method: "POST" });
    await reload();
    // Accepting usually comes from a search hit (inline accept) or the
    // incoming list — either way, refresh an active search so the chip flips
    // to server truth immediately instead of waiting for the next search.
    const q = query.trim();
    if (q.length >= 3) await fetchSearch(q).catch(() => undefined);
  }

  async function remove(userId: string) {
    await apiFetch(`/friends/${userId}`, { method: "DELETE" });
    await reload();
  }

  async function message(userId: string) {
    const data = await apiFetch<{ conversation: { id: string } }>("/dms/conversations", {
      method: "POST",
      body: JSON.stringify({ userId }),
    });
    router.push(`/messages?c=${data.conversation.id}`);
  }

  return (
    <section className={cx("rounded-card border border-border bg-surface-1 p-card-padding shadow-card", className)}>
      <p className="text-meta font-medium uppercase tracking-wide text-text-secondary">{t("profile.friends")}</p>
      <label className="sr-only" htmlFor="friend-search">{t("friends.searchPh")}</label>
      <input
        id="friend-search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setFound([]);
        }}
        placeholder={t("friends.searchPh")}
        className="mt-2 h-10 w-full rounded-control border border-border bg-surface-2 px-3 text-meta text-text-primary placeholder:text-text-tertiary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      />
      {notice ? <p className="mt-2 text-caption text-success">{notice}</p> : null}
      {query.trim().length >= 3 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {found.length === 0 ? (
            <li className="text-caption text-text-tertiary">{t("friends.noResults")}</li>
          ) : (
            found.map((person) => {
              // Chips come from the search response itself (server truth);
              // pending_received additionally surfaces the inline accept.
              const chip =
                person.relationship === "friend" ? (
                  <span className="shrink-0 text-caption text-text-tertiary">{t("friends.alreadyFriends")}</span>
                ) : person.relationship === "pending_sent" ? (
                  <span className="shrink-0 text-caption text-text-tertiary">{t("friends.pending")}</span>
                ) : person.relationship === "pending_received" ? (
                  <button type="button" onClick={() => void accept(person.id)} className="shrink-0 text-caption font-semibold text-accent-soft">
                    {t("friends.approve")}
                  </button>
                ) : (
                  <button type="button" onClick={() => void add(person.id)} className="shrink-0 text-caption font-medium text-accent-soft">
                    {t("friends.add")}
                  </button>
                );
              return (
                <li key={person.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-body text-text-primary">{person.fullName ?? "—"}</span>
                  {chip}
                </li>
              );
            })
          )}
        </ul>
      ) : null}

      {loading ? (
        <LoadingSkeleton className="mt-3 h-12 w-full" />
      ) : error ? (
        <p className="mt-2 text-meta text-danger">{error}</p>
      ) : (
        <>
          {incoming.length > 0 ? (
            <div className="mt-3">
              <p className="text-caption font-medium uppercase tracking-wide text-text-tertiary">{t("friends.requests")}</p>
              <ul className="mt-1 flex flex-col gap-2">
                {incoming.map((person) => (
                  <li key={person.id} className="rounded-control border border-border px-2 py-2">
                    <p className="truncate text-body font-medium text-text-primary">{person.fullName ?? "—"}</p>
                    <div className="mt-1 flex gap-2">
                      <button type="button" onClick={() => void accept(person.id)} className="text-caption font-semibold text-accent-soft">
                        {t("friends.approve")}
                      </button>
                      <button type="button" onClick={() => void remove(person.id)} className="text-caption font-medium text-danger">
                        {t("friends.decline")}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {query.trim().length < 3 ? (
            <>
              {outgoing.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1">
                  {outgoing.map((person) => (
                    <li key={person.id} className="flex items-center justify-between gap-2 text-meta text-text-secondary">
                      <span className="min-w-0 truncate">{person.fullName ?? "—"}</span>
                      <span className="shrink-0 text-caption">{t("friends.pending")}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {friends.length === 0 && incoming.length === 0 ? (
                <div className="mt-3">
                  <EmptyState
                    title={t("dashboard.noFriends")}
                    description={t("dashboard.noFriendsDesc")}
                    action={{ label: t("profile.addFriend"), onClick: () => document.getElementById("friend-search")?.focus() }}
                  />
                </div>
              ) : (
                <ul className="mt-2 flex flex-col gap-1">
                  {friends.map((friend) => (
                    <li key={friend.id} className="flex min-h-touch-target items-center gap-2 rounded-card px-1 py-1">
                      {/* Friend rows open the friend profile; chat stays a
                          separate button so the two actions never compete. */}
                      <Link
                        href={`/amis/${friend.id}`}
                        title={t("friends.viewProfile")}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                      >
                        <span className="relative shrink-0">
                          <span
                            className="flex h-8 w-8 items-center justify-center rounded-pill bg-surface-3 font-display text-caption font-bold text-accent-soft"
                            aria-hidden
                          >
                            {initials(friend.fullName ?? "?")}
                          </span>
                          <PresenceDot online={friend.online} />
                        </span>
                        <span className="min-w-0 truncate text-body font-medium text-text-primary">{friend.fullName ?? "—"}</span>
                      </Link>
                      <button type="button" onClick={() => void message(friend.id)} className="shrink-0 text-caption font-medium text-accent-soft">
                        {t("friends.message")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
