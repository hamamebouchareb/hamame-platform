"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { localeFor, type UiLanguage } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { apiFetch, ApiError } from "@/lib/api";
import { AppHeader, EmptyState, Footer, LoadingSkeleton, UserAvatar } from "@/components";
import { cx } from "@/lib/cx";
import { shareLabel } from "@/lib/share-message";
import { MessageBody } from "@/components/ShareWithFriend";

interface ConversationSummary {
  id: string;
  otherUser: { id: string; fullName: string | null };
  lastMessage: { body: string; fromMe: boolean; createdAt: string } | null;
  unreadCount: number;
  lastMessageAt: string;
}

interface DirectMessageItem {
  id: string;
  senderId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

interface FriendItem {
  id: string;
  fullName: string | null;
}

interface StudyInviteIncoming {
  id: string;
  sender: { id: string; fullName: string | null };
  module: { id: string; name: string } | null;
  createdAt: string;
}

interface StudyInviteOutgoing {
  id: string;
  recipient: { id: string; fullName: string | null };
  module: { id: string; name: string } | null;
  status: string;
  createdAt: string;
}

const POLL_INTERVAL_MS = 5000;
const MESSAGE_LIMIT = 50;

function formatWhen(iso: string, lang: UiLanguage): string {
  try {
    return new Date(iso).toLocaleString(localeFor(lang), {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function MessagesPage() {
  const { logout } = useAuth();
  const router = useRouter();
  const { user, isHydrated } = useRequireAuth();
  const { lang, t } = useLanguage();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [incomingInvites, setIncomingInvites] = useState<StudyInviteIncoming[]>([]);
  const [outgoingInvites, setOutgoingInvites] = useState<StudyInviteOutgoing[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessageItem[]>([]);
  const [draft, setDraft] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [resourceQuery, setResourceQuery] = useState("");
  const [resourceHits, setResourceHits] = useState<{ id: string; title: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const selectedIdRef = useRef<string | null>(null);
  const queryOpened = useRef(false);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const messagesRef = useRef<DirectMessageItem[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const loadConversations = useCallback(async () => {
    const data = await apiFetch<{ conversations: ConversationSummary[] }>(
      "/dms/conversations?page=1&limit=50"
    );
    setConversations(data.conversations);
  }, []);

  const loadFriends = useCallback(async () => {
    const data = await apiFetch<{ friends: FriendItem[] }>("/friends");
    setFriends(data.friends);
  }, []);

  const loadInvites = useCallback(async () => {
    const data = await apiFetch<{ incoming: StudyInviteIncoming[]; outgoing: StudyInviteOutgoing[] }>(
      "/study-invites"
    );
    setIncomingInvites(data.incoming);
    setOutgoingInvites(data.outgoing);
  }, []);

  const loadMessages = useCallback(async (conversationId: string, after?: string) => {
    const query = after ? `?after=${encodeURIComponent(after)}&limit=${MESSAGE_LIMIT}` : `?limit=${MESSAGE_LIMIT}`;
    const data = await apiFetch<{ messages: DirectMessageItem[] }>(
      `/dms/conversations/${conversationId}/messages${query}`
    );
    if (data.messages.length > 0) {
      setMessages((prev) => {
        if (!after) return data.messages;
        const known = new Set(prev.map((m) => m.id));
        return [...prev, ...data.messages.filter((m) => !known.has(m.id))];
      });
      const hasUnreadIncoming = data.messages.some((m) => m.senderId !== user?.id && !m.readAt);
      if (hasUnreadIncoming) {
        await apiFetch(`/dms/conversations/${conversationId}/read`, { method: "POST" });
        setConversations((prev) =>
          prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c))
        );
      }
    }
  }, [user?.id]);

  useEffect(() => {
    if (!isHydrated || !user) return;
    let cancelled = false;
    (async () => {
      try {
        await loadConversations();
        if (cancelled) return;
        await loadFriends();
        if (cancelled) return;
        await loadInvites();
        if (cancelled) return;
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : t("dms.loadFailed"));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isHydrated, user, loadConversations, loadFriends, loadInvites, t]);

  useEffect(() => {
    if (queryOpened.current || conversations.length === 0) return;
    const id = new URLSearchParams(window.location.search).get("c");
    if (!id || !conversations.some((c) => c.id === id)) return;
    queryOpened.current = true;
    selectConversation(id);
    // selectConversation is stable enough for this one-shot open from ?c=
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations]);

  // Polling loop (no realtime transport in this stack — zero-new-dependency
  // precedent). Refreshes the conversation list, the open thread (cursor-based)
  // and pending invites every POLL_INTERVAL_MS while the page is open.
  useEffect(() => {
    if (!isHydrated || !user) return;
    const interval = setInterval(() => {
      void (async () => {
        try {
          await loadConversations();
          const current = selectedIdRef.current;
          if (current) {
            const last = messagesRef.current[messagesRef.current.length - 1];
            await loadMessages(current, last?.createdAt);
          }
          await loadInvites();
        } catch {
          // transient poll failure — the next tick retries silently
        }
      })();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isHydrated, user, loadConversations, loadMessages, loadInvites]);

  async function openWithFriend(friendId: string) {
    setPickerOpen(false);
    setActionNotice(null);
    try {
      const data = await apiFetch<{ conversation: { id: string } }>("/dms/conversations", {
        method: "POST",
        body: JSON.stringify({ userId: friendId }),
      });
      await loadConversations();
      selectConversation(data.conversation.id);
    } catch (err) {
      setActionNotice(err instanceof ApiError ? err.message : t("dms.loadFailed"));
    }
  }

  function selectConversation(conversationId: string) {
    setSelectedId(conversationId);
    setMessages([]);
    setSendError(null);
    void (async () => {
      try {
        await loadMessages(conversationId);
      } catch {
        setSendError(t("dms.loadFailed"));
      }
    })();
  }

  useEffect(() => {
    const q = resourceQuery.trim();
    if (q.length < 2) return;
    const handle = window.setTimeout(() => {
      apiFetch<{ resources: { id: string; title: string }[] }>(`/search?q=${encodeURIComponent(q)}`)
        .then((data) => setResourceHits(data.resources))
        .catch(() => setResourceHits([]));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [resourceQuery]);

  async function sendShare(payload: { imageUrl?: string; resourceId?: string }) {
    const conversationId = selectedId;
    if (!conversationId) return;
    setSendError(null);
    try {
      const data = await apiFetch<{ message: DirectMessageItem }>(
        `/dms/conversations/${conversationId}/messages`,
        { method: "POST", body: JSON.stringify(payload) }
      );
      setImageUrl("");
      setResourceQuery("");
      setResourceHits([]);
      setMessages((prev) => [...prev, data.message]);
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : t("dms.sendFailed"));
    }
  }

  async function sendDraft() {
    const conversationId = selectedId;
    const body = draft.trim();
    if (!conversationId || !body) return;
    setSendError(null);
    try {
      const data = await apiFetch<{ message: DirectMessageItem }>(
        `/dms/conversations/${conversationId}/messages`,
        { method: "POST", body: JSON.stringify({ body }) }
      );
      setDraft("");
      setMessages((prev) => [...prev, data.message]);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                lastMessage: { body: data.message.body, fromMe: true, createdAt: data.message.createdAt },
                lastMessageAt: data.message.createdAt,
              }
            : c
        )
      );
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : t("dms.sendFailed"));
    }
  }

  async function inviteToStudy(conversationId: string) {
    const conversation = conversations.find((c) => c.id === conversationId);
    if (!conversation) return;
    setActionNotice(null);
    try {
      await apiFetch("/study-invites", {
        method: "POST",
        body: JSON.stringify({ recipientId: conversation.otherUser.id }),
      });
      await loadInvites();
      setActionNotice(t("dms.inviteSent"));
    } catch (err) {
      setActionNotice(err instanceof ApiError ? err.message : t("dms.loadFailed"));
    }
  }

  async function decideInvite(inviteId: string, decision: "accept" | "decline") {
    setActionNotice(null);
    try {
      await apiFetch(`/study-invites/${inviteId}/${decision}`, { method: "POST" });
      await loadInvites();
      setActionNotice(decision === "accept" ? t("dms.inviteAccepted") : t("dms.inviteDeclined"));
    } catch (err) {
      setActionNotice(err instanceof ApiError ? err.message : t("dms.loadFailed"));
    }
  }

  async function cancelInvite(inviteId: string) {
    setActionNotice(null);
    try {
      await apiFetch(`/study-invites/${inviteId}`, { method: "DELETE" });
      await loadInvites();
      setActionNotice(t("dms.inviteCancelled"));
    } catch (err) {
      setActionNotice(err instanceof ApiError ? err.message : t("dms.loadFailed"));
    }
  }

  if (!isHydrated || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-card-padding">
        <LoadingSkeleton className="h-8 w-48" ariaLabel={t("common.loading")} />
      </main>
    );
  }

  const selectedConversation = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <>
      <AppHeader user={user} onLogout={handleLogout} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-card-padding py-section-gap">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-h2 font-bold leading-tight text-text-primary sm:text-h1">{t("dms.title")}</h1>
            <p className="mt-1 text-body text-text-secondary">{t("dms.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={() => setPickerOpen((open) => !open)}
            className="inline-flex min-h-touch-target shrink-0 items-center justify-center rounded-pill bg-accent-primary px-4 text-body font-medium text-on-accent transition hover:bg-accent-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            {t("dms.newConversation")}
          </button>
        </div>

        {pickerOpen ? (
          <div className="mt-4 rounded-card border border-border bg-surface-1 p-card-padding">
            <p className="text-body font-medium text-text-primary">{t("dms.chooseFriend")}</p>
            {friends.length === 0 ? (
              <p className="mt-2 text-body text-text-secondary">{t("dms.noFriends")}</p>
            ) : (
              <ul className="mt-3 flex flex-wrap gap-2">
                {friends.map((friend) => (
                  <li key={friend.id}>
                    <button
                      type="button"
                      onClick={() => void openWithFriend(friend.id)}
                      className="inline-flex min-h-touch-target items-center rounded-pill border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                      {friend.fullName ?? "—"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {actionNotice ? (
          <p role="status" className="mt-4 rounded-card border border-border bg-surface-1 p-card-padding text-body text-text-secondary">
            {actionNotice}
          </p>
        ) : null}

        {incomingInvites.length > 0 || outgoingInvites.length > 0 ? (
          <section className="mt-4 rounded-card border border-border bg-surface-1 p-card-padding" aria-label={t("dms.invitesTitle")}>
            <h2 className="text-body font-semibold text-text-primary">{t("dms.invitesTitle")}</h2>
            {incomingInvites.length === 0 && outgoingInvites.length === 0 ? (
              <p className="mt-2 text-body text-text-secondary">{t("dms.invitesEmpty")}</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {incomingInvites.map((invite) => (
                  <li key={invite.id} className="flex flex-wrap items-center gap-2 rounded-control border border-border p-3">
                    <span className="min-w-0 flex-1 text-body text-text-primary">
                      {t("dms.inviteFrom", { name: invite.sender.fullName ?? "—" })}
                      {invite.module ? <span className="text-text-secondary"> {t("dms.inviteFromModule", { module: invite.module.name })}</span> : null}
                    </span>
                    <button
                      type="button"
                      onClick={() => void decideInvite(invite.id, "accept")}
                      className="inline-flex min-h-touch-target items-center justify-center rounded-pill bg-accent-primary px-4 text-body font-medium text-on-accent transition hover:bg-accent-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                      {t("dms.accept")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void decideInvite(invite.id, "decline")}
                      className="inline-flex min-h-touch-target items-center justify-center rounded-pill border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                      {t("dms.decline")}
                    </button>
                  </li>
                ))}
                {outgoingInvites.map((invite) => (
                  <li key={invite.id} className="flex flex-wrap items-center gap-2 rounded-control border border-border p-3">
                    <span className="min-w-0 flex-1 text-body text-text-secondary">
                      {invite.recipient.fullName ?? "—"} · {invite.status}
                    </span>
                    {invite.status === "pending" ? (
                      <button
                        type="button"
                        onClick={() => void cancelInvite(invite.id)}
                        className="inline-flex min-h-touch-target items-center justify-center rounded-pill border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                      >
                        {t("dms.cancel")}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {isLoading ? (
          <div className="mt-4 flex flex-col gap-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <LoadingSkeleton key={i} className="h-16 w-full rounded-card" />
            ))}
          </div>
        ) : error ? (
          <div className="mt-4 rounded-card border border-danger bg-surface-1 p-card-padding">
            <p role="alert" className="text-body text-danger">{error}</p>
          </div>
        ) : conversations.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title={t("dms.noConversations")}
              description={t("dms.noConversationsDesc")}
              action={{ label: t("dms.newConversation"), onClick: () => setPickerOpen(true) }}
            />
          </div>
        ) : (
          <div className="mt-4 grid overflow-hidden rounded-card-lg border border-border bg-surface-1 shadow-card md:grid-cols-[minmax(16rem,20rem)_1fr]">
            <ul className="flex max-h-[70vh] flex-col overflow-y-auto border-b border-border md:border-b-0 md:border-r" aria-label={t("dms.title")}>
              {conversations.map((conversation) => {
                const unread = conversation.unreadCount > 0;
                return (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => selectConversation(conversation.id)}
                    aria-current={selectedId === conversation.id ? "true" : undefined}
                    className={cx(
                      "flex w-full items-center gap-3 px-3 py-2.5 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                      selectedId === conversation.id
                        ? "bg-surface-3"
                        : "hover:bg-surface-2"
                    )}
                  >
                    <span className="relative shrink-0">
                      <UserAvatar name={conversation.otherUser.fullName} seed={conversation.otherUser.id} size={44} />
                      {unread ? (
                        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-pill bg-accent-primary ring-2 ring-surface-1" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={cx("min-w-0 flex-1 truncate text-body", unread ? "font-bold text-text-primary" : "font-semibold text-text-primary")}>
                          {conversation.otherUser.fullName ?? "—"}
                        </span>
                        {conversation.lastMessage ? (
                          <span className="shrink-0 text-caption text-text-tertiary">
                            {formatWhen(conversation.lastMessage.createdAt, lang)}
                          </span>
                        ) : null}
                      </span>
                      <span className={cx("mt-0.5 block truncate text-[12px]", unread ? "text-text-primary" : "text-text-secondary")}>
                        {conversation.lastMessage
                          ? conversation.lastMessage.fromMe
                            ? t("dms.fromMe", { message: shareLabel(conversation.lastMessage.body) ?? conversation.lastMessage.body })
                            : (shareLabel(conversation.lastMessage.body) ?? conversation.lastMessage.body)
                          : ""}
                      </span>
                    </span>
                    {unread ? (
                      <span className="shrink-0 rounded-pill bg-accent-primary px-2 py-0.5 text-[10px] font-bold text-on-accent tabular-nums">
                        {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                      </span>
                    ) : null}
                  </button>
                </li>
                );
              })}
            </ul>

            <div className="min-h-[28rem] bg-surface-1">
              {selectedConversation ? (
                <div className="flex h-full flex-col">
                  <div className="flex items-center justify-between gap-2 border-b border-border p-card-padding">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <UserAvatar
                        name={selectedConversation.otherUser.fullName}
                        seed={selectedConversation.otherUser.id}
                        size={40}
                      />
                      <p className="min-w-0 truncate text-body font-semibold text-text-primary">
                        {selectedConversation.otherUser.fullName ?? "—"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void inviteToStudy(selectedConversation.id)}
                      className="inline-flex min-h-touch-target shrink-0 items-center justify-center rounded-pill border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                      {t("dms.inviteToStudy")}
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-card-padding" style={{ minHeight: "320px" }}>
                    {messages.length === 0 ? (
                      <p className="text-body text-text-secondary">{t("dms.emptyThreadHint")}</p>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {messages.map((message) => {
                          const fromMe = message.senderId === user.id;
                          return (
                            <li key={message.id} className={cx("flex", fromMe ? "justify-end" : "justify-start")}>
                              <div
                                className={cx(
                                  "max-w-[75%] px-3 py-2 text-body",
                                  fromMe
                                    ? "rounded-2xl rounded-br-sm bg-accent-primary text-on-accent"
                                    : "rounded-2xl rounded-bl-sm bg-surface-2 text-text-primary"
                                )}
                              >
                                <MessageBody body={message.body} />
                                <p className={cx("mt-1 text-caption", fromMe ? "text-on-accent/70" : "text-text-tertiary")}>
                                  {formatWhen(message.createdAt, lang)}
                                </p>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  {sendError ? (
                    <p role="alert" className="px-card-padding pb-2 text-caption text-danger">{sendError}</p>
                  ) : null}

                  <form
                    className="flex gap-2 border-t border-border p-card-padding"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void sendDraft();
                    }}
                  >
                    <input
                      type="text"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder={t("dms.placeholder")}
                      maxLength={2000}
                      className="min-h-touch-target w-full rounded-pill border border-border bg-surface-2 px-4 text-body text-text-primary placeholder:text-text-tertiary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    />
                    <button
                      type="submit"
                      disabled={!draft.trim()}
                      className="inline-flex min-h-touch-target shrink-0 items-center justify-center rounded-pill bg-accent-primary px-4 text-body font-medium text-on-accent transition hover:bg-accent-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-40"
                    >
                      {t("dms.send")}
                    </button>
                  </form>
                  <div className="flex flex-col gap-2 border-t border-border px-card-padding py-2">
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={imageUrl}
                        onChange={(event) => setImageUrl(event.target.value)}
                        placeholder={t("friends.photoPh")}
                        className="min-h-10 min-w-0 flex-1 rounded-pill border border-border bg-surface-2 px-3 text-meta text-text-primary placeholder:text-text-tertiary"
                      />
                      <button
                        type="button"
                        disabled={!imageUrl.trim().startsWith("https://")}
                        onClick={() => void sendShare({ imageUrl: imageUrl.trim() })}
                        className="shrink-0 text-caption font-medium text-accent-soft disabled:opacity-40"
                      >
                        {t("friends.share")}
                      </button>
                    </div>
                    <input
                      type="search"
                      value={resourceQuery}
                      onChange={(event) => setResourceQuery(event.target.value)}
                      placeholder={t("friends.resourcePh")}
                      className="min-h-10 w-full rounded-pill border border-border bg-surface-2 px-3 text-meta text-text-primary placeholder:text-text-tertiary"
                    />
                    {resourceHits.length > 0 ? (
                      <ul className="max-h-32 overflow-y-auto">
                        {resourceHits.map((resource) => (
                          <li key={resource.id}>
                            <button
                              type="button"
                              onClick={() => void sendShare({ resourceId: resource.id })}
                              className="block w-full truncate rounded-control px-2 py-1 text-left text-meta text-text-primary hover:bg-surface-2"
                            >
                              {resource.title}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-1 p-section-gap text-center">
                  <p className="text-body font-semibold text-text-primary">{t("dms.emptyThread")}</p>
                  <p className="max-w-xs text-body text-text-secondary">{t("dms.emptyThreadHint")}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <Footer />
    </>
  );
}
