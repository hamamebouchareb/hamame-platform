"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cx } from "@/lib/cx";
import { useLanguage } from "@/context/LanguageContext";
import { localeFor, type UiLanguage } from "@/lib/i18n";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/Icon";
import { UserAvatar } from "@/components/UserAvatar";
import { PresenceDot } from "@/components/PresenceDot";
import { shareLabel } from "@/lib/share-message";
import { MessageBody } from "@/components/ShareWithFriend";
import { DmComposer } from "@/components/DmComposer";
import type { ConversationSummary, DirectMessageItem } from "@/lib/dm-types";

export type { ConversationSummary } from "@/lib/dm-types";

const POLL_MS = 12000;

function formatWhen(iso: string, lang: UiLanguage): string {
  try {
    return new Date(iso).toLocaleString(localeFor(lang), { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/** Viewport-aware Facebook parity cap: 3 windows on wide screens, 2 below 1280px. */
function computeViewportCap(): number {
  return typeof window !== "undefined" && window.innerWidth >= 1280 ? 3 : 2;
}

interface DockWindow {
  id: string;
  minimized: boolean;
}

function ConversationRow({
  conversation,
  lang,
  fromMeLabel,
  onOpen,
}: {
  conversation: ConversationSummary;
  lang: UiLanguage;
  fromMeLabel: (message: string) => string;
  onOpen: (id: string) => void;
}) {
  const unread = conversation.unreadCount > 0;
  return (
    <button
      type="button"
      onClick={() => onOpen(conversation.id)}
      className="flex w-full items-center gap-3 rounded-control px-2 py-2 text-left transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      <span className="relative shrink-0">
        <UserAvatar name={conversation.otherUser.fullName} seed={conversation.otherUser.id} size={40} />
        <PresenceDot online={conversation.otherUser.online} />
        {unread ? (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-pill bg-accent-primary ring-2 ring-surface-1" />
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2">
          <span className={cx("min-w-0 flex-1 truncate text-body leading-5", unread ? "font-semibold text-text-primary" : "font-medium text-text-primary")}>
            {conversation.otherUser.fullName ?? "—"}
          </span>
          {conversation.lastMessage ? (
            <span className="shrink-0 text-caption text-text-tertiary">
              {formatWhen(conversation.lastMessage.createdAt, lang)}
            </span>
          ) : null}
        </span>
        <span className={cx("mt-0.5 block truncate text-caption leading-4", unread ? "text-text-primary" : "text-text-secondary")}>
          {conversation.lastMessage
            ? conversation.lastMessage.fromMe
              ? fromMeLabel(shareLabel(conversation.lastMessage.body) ?? conversation.lastMessage.body)
              : (shareLabel(conversation.lastMessage.body) ?? conversation.lastMessage.body)
            : ""}
        </span>
      </span>
      {unread ? (
        <span className="shrink-0 rounded-pill bg-accent-primary px-1.5 py-0.5 text-[10px] font-bold text-on-accent tabular-nums">
          {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
        </span>
      ) : null}
    </button>
  );
}

/**
 * One docked conversation window. Facebook behaviour: the whole surface is
 * draggable-free but minimizable — minimize collapses to a compact bottom tab
 * while the component STAYS MOUNTED, preserving drafts and already-loaded
 * messages, and pausing polling / mark-read while hidden.
 */
function MiniChat({
  conversation,
  userId,
  minimized,
  onClose,
  onMinimize,
  onRestore,
}: {
  conversation: ConversationSummary;
  userId: string;
  minimized: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onRestore: () => void;
}) {
  const { lang, t } = useLanguage();
  const [messages, setMessages] = useState<DirectMessageItem[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const windowRef = useRef<HTMLDivElement>(null);
  const minimizedRef = useRef(minimized);
  const onMinimizeRef = useRef(onMinimize);

  useEffect(() => {
    minimizedRef.current = minimized;
  }, [minimized]);

  useEffect(() => {
    onMinimizeRef.current = onMinimize;
  }, [onMinimize]);

  const load = useCallback(async (after?: string) => {
    if (minimizedRef.current) return; // frozen while minimized — no polls, no mark-read
    const query = after ? `?after=${encodeURIComponent(after)}&limit=40` : "?limit=40";
    const data = await apiFetch<{ messages: DirectMessageItem[] }>(
      `/dms/conversations/${conversation.id}/messages${query}`
    );
    setMessages((prev) => {
      if (!after) return data.messages;
      const known = new Set(prev.map((m) => m.id));
      return [...prev, ...data.messages.filter((m) => !known.has(m.id))];
    });
    setLoadState("ready");
    if (data.messages.some((m) => m.senderId !== userId)) {
      await apiFetch(`/dms/conversations/${conversation.id}/read`, { method: "POST" });
    }
  }, [conversation.id, userId]);

  useEffect(() => {
    void load().catch(() => { if (!minimizedRef.current) setLoadState("error"); });
    const tick = setInterval(() => {
      if (document.hidden || minimizedRef.current) return;
      const last = messages[messages.length - 1];
      void load(last?.createdAt).catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(tick);
    // messages length is read inside the interval via closure on each fire of load's after — refresh last via ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  // Escape minimizes the focused window (Facebook parity) — only while open.
  useEffect(() => {
    if (minimized) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const active = document.activeElement;
      if (active && windowRef.current?.contains(active)) onMinimizeRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [minimized]);

  useEffect(() => {
    if (!minimized && loadState !== "loading") {
      windowRef.current?.querySelector<HTMLElement>("[data-chat-scrolled]")?.scrollIntoView({ block: "end" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, minimized]);

  if (minimized) {
    // Compact bottom tab — a div with button semantics so the X can be a real
    // button (no nested interactive elements inside one another).
    const unread = conversation.unreadCount;
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onRestore}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onRestore();
          }
        }}
        aria-label={t("dms.restoreChat", { name: conversation.otherUser.fullName ?? "" })}
        className="flex h-11 cursor-pointer items-center gap-2 rounded-t-card border border-border bg-surface-1 px-2.5 shadow-card transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <span className="relative shrink-0">
          <UserAvatar name={conversation.otherUser.fullName} seed={conversation.otherUser.id} size={26} />
          <PresenceDot online={conversation.otherUser.online} />
        </span>
        <span className="max-w-32 truncate text-caption font-semibold text-text-primary">
          {conversation.otherUser.fullName ?? "—"}
        </span>
        {unread > 0 ? (
          <span className="min-w-4 rounded-pill bg-accent-primary px-1 text-center text-[10px] font-bold leading-4 text-on-accent">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
        <button
          type="button"
          aria-label={t("dms.closeChat")}
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          className="ml-0.5 inline-flex h-5 w-5 items-center justify-center rounded-pill text-text-secondary hover:text-text-primary"
        >
          <Icon name="close" size={12} />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={windowRef}
      className="flex h-96 w-80 flex-col overflow-hidden rounded-card border border-border bg-surface-1 shadow-card"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <span className="relative shrink-0">
          <UserAvatar name={conversation.otherUser.fullName} seed={conversation.otherUser.id} size={28} />
          <PresenceDot online={conversation.otherUser.online} />
        </span>
        <p className="min-w-0 flex-1 truncate text-body font-semibold leading-5 text-text-primary">
          {conversation.otherUser.fullName ?? "—"}
        </p>
        <button
          type="button"
          onClick={onMinimize}
          aria-label={t("dms.minimizeChat")}
          className="inline-flex h-8 w-8 items-center justify-center rounded-pill text-text-secondary hover:bg-surface-2 hover:text-text-primary"
        >
          <Icon name="minus" size={16} />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("dms.closeChat")}
          className="inline-flex h-8 w-8 items-center justify-center rounded-pill text-text-secondary hover:bg-surface-2 hover:text-text-primary"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {loadState === "loading" ? (
          <ul className="flex flex-col gap-1.5" aria-label={t("dms.dockTitle")}>
            {[0, 1, 2].map((row) => (
              <li key={row} className={cx("flex", row % 2 ? "justify-end" : "justify-start")}>
                <span className="inline-block h-8 w-28 animate-pulse rounded-2xl bg-surface-2" />
              </li>
            ))}
          </ul>
        ) : loadState === "error" ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-meta text-text-secondary">{t("dms.loadFailed")}</p>
            <button
              type="button"
              onClick={() => {
                setLoadState("loading");
                void load().catch(() => setLoadState("error"));
              }}
              className="rounded-pill border border-border px-3 py-1 text-caption font-medium text-accent-soft hover:bg-surface-2"
            >
              {t("dms.retry")}
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-meta text-text-secondary">
            {t("dms.emptyThreadHint")}
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {messages.map((message) => {
              const fromMe = message.senderId === userId;
              return (
                <li key={message.id} className={cx("flex", fromMe ? "justify-end" : "justify-start")}>
                  <div
                    className={cx(
                      "max-w-[80%] px-3 py-1.5 text-meta",
                      fromMe
                        ? "rounded-2xl rounded-br-sm bg-accent-primary text-on-accent"
                        : "rounded-2xl rounded-bl-sm bg-surface-2 text-text-primary"
                    )}
                  >
                    <MessageBody body={message.body} />
                    <p className={cx("mt-0.5 text-[10px]", fromMe ? "text-on-accent/70" : "text-text-tertiary")}>
                      {formatWhen(message.createdAt, lang)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div data-chat-scrolled="" />
      </div>
      <div className="shrink-0">
        <DmComposer
          conversationId={conversation.id}
          onSent={(message) => setMessages((prev) => [...prev, message])}
        />
      </div>
    </div>
  );
}

export function MessengerDock({ userId }: { userId: string }) {
  const { lang, t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  /** Field-of-conversations cache so open windows stay fed even when their row
   * scrolls out of the polled top-20 (Facebook keeps chat windows alive too). */
  const [chatCache, setChatCache] = useState<Record<string, ConversationSummary>>({});
  const [listOpen, setListOpen] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(false);
  /** Newest first; rendered right-most via flex-row-reverse (Facebook order). */
  const [windows, setWindows] = useState<DockWindow[]>([]);
  const [viewportCap, setViewportCap] = useState(() => computeViewportCap());
  const headerRef = useRef<HTMLDivElement>(null);
  const onMessagesPage = pathname === "/messages" || pathname.startsWith("/messages/");

  useEffect(() => {
    function onResize() {
      const cap = computeViewportCap();
      setViewportCap(cap);
      setWindows((wins) => (wins.length > cap ? wins.slice(0, cap) : wins));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ conversations: ConversationSummary[] }>("/dms/conversations?page=1&limit=20");
      setConversations(data.conversations);
      setListError(false);
      setChatCache((prev) => {
        const next = { ...prev };
        for (const conversation of data.conversations) next[conversation.id] = conversation;
        return next;
      });
    } catch {
      setListError(true);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- conversation list is polled; first fetch on mount */
    void load();
    /* eslint-enable react-hooks/set-state-in-effect */
    const tick = setInterval(() => {
      if (document.hidden) return;
      void load().catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(tick);
  }, [load]);

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      // Facebook parity: clicking outside dismisses the LIST, never open chat
      // windows — those close only through their own X button.
      if (!headerRef.current?.contains(event.target as Node)) setListOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, []);

  const unread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  function openFromList(id: string) {
    if (onMessagesPage) {
      router.push(`/messages?c=${id}`);
      setListOpen(false);
      return;
    }
    // Reopening an open (or minimized) window re-fronts and restores it instead
    // of duplicating one, matching the click-path rule that a row may never
    // toggle two different states.
    setWindows((wins) => [{ id, minimized: false }, ...wins.filter((win) => win.id !== id)].slice(0, viewportCap));
    setListOpen(false);
  }

  function closeWindow(id: string) {
    setWindows((wins) => wins.filter((win) => win.id !== id));
  }

  function setWindowMinimized(id: string, minimized: boolean) {
    setWindows((wins) => wins.map((win) => (win.id === id ? { ...win, minimized } : win)));
  }

  const minimizedTabs = windows.filter((win) => win.minimized);
  const openWindows = windows.filter((win) => !win.minimized);

  const list = (
    <div className="flex max-h-[28rem] w-[22rem] flex-col overflow-hidden rounded-card border border-border bg-surface-1 shadow-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="text-body font-semibold text-text-primary">{t("dms.dockTitle")}</p>
        <button
          type="button"
          onClick={() => {
            setListOpen(false);
            router.push("/messages");
          }}
          className="text-caption font-medium text-accent-soft hover:text-text-primary"
        >
          {t("dms.viewAll")}
        </button>
      </div>
      <div className="overflow-y-auto p-1">
        {conversations.length === 0 && listLoading ? (
          <ul aria-hidden="true">
            {[0, 1, 2, 3].map((row) => (
              <li key={row} className="flex items-center gap-3 px-2 py-2">
                <span className="h-10 w-10 shrink-0 animate-pulse rounded-pill bg-surface-2" />
                <span className="flex-1 space-y-1.5">
                  <span className="block h-3 w-24 animate-pulse rounded-pill bg-surface-2" />
                  <span className="block h-2.5 w-36 animate-pulse rounded-pill bg-surface-2" />
                </span>
              </li>
            ))}
          </ul>
        ) : listError && conversations.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
            <p className="text-meta text-text-secondary">{t("dms.loadFailed")}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-pill border border-border px-3 py-1 text-caption font-medium text-accent-soft hover:bg-surface-2"
            >
              {t("dms.retry")}
            </button>
          </div>
        ) : conversations.length === 0 ? (
          <p className="px-3 py-6 text-center text-meta text-text-secondary">{t("dms.noConversations")}</p>
        ) : (
          conversations.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              lang={lang}
              fromMeLabel={(message) => t("dms.fromMe", { message })}
              onOpen={openFromList}
            />
          ))
        )}
      </div>
    </div>
  );

  return (
    <>
      <div ref={headerRef} className="relative">
        <button
          type="button"
          onClick={() => setListOpen((v) => !v)}
          aria-label={unread > 0 ? t("dms.unreadMany", { count: unread }) : t("dms.openMessenger")}
          aria-expanded={listOpen}
          className="relative inline-flex min-h-touch-target min-w-touch-target items-center justify-center rounded-pill text-text-secondary transition hover:bg-surface-2 hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <Icon name="messages" size={20} />
          {unread > 0 ? (
            <span className="absolute right-1 top-1 min-w-4 rounded-pill bg-accent-primary px-1 text-center text-[10px] font-bold leading-4 text-on-accent">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
        {listOpen ? (
          // Anchored under the button inside the header stack (same pattern as
          // the bell dropdown) instead of a fixed page-position — no more
          // floating panel that can overlap page content.
          <div className="absolute right-0 top-full z-40 mt-2" role="dialog" aria-label={t("dms.dockTitle")}>
            {list}
          </div>
        ) : null}
      </div>

      {!onMessagesPage && windows.length > 0 ? (
        // flex-col-reverse stacks the FIRST child at the bottom: minimized tabs
        // line the viewport edge, open windows rise above them (messenger.com).
        <div className="fixed bottom-4 right-4 z-40 hidden flex-col-reverse items-end gap-2 lg:flex">
          {minimizedTabs.length > 0 ? (
            <div className="flex items-end gap-1.5">
              {minimizedTabs.map((win) => {
                const conversation = chatCache[win.id];
                if (!conversation) return null;
                return (
                  <MiniChat
                    key={win.id}
                    conversation={conversation}
                    userId={userId}
                    minimized
                    onClose={() => closeWindow(win.id)}
                    onMinimize={() => setWindowMinimized(win.id, true)}
                    onRestore={() => setWindowMinimized(win.id, false)}
                  />
                );
              })}
            </div>
          ) : null}
          {openWindows.length > 0 ? (
            <div className="flex flex-row-reverse items-end gap-2">
              {openWindows.map((win) => {
                const conversation = chatCache[win.id];
                if (!conversation) return null;
                return (
                  <MiniChat
                    key={win.id}
                    conversation={conversation}
                    userId={userId}
                    minimized={false}
                    onClose={() => closeWindow(win.id)}
                    onMinimize={() => setWindowMinimized(win.id, true)}
                    onRestore={() => setWindowMinimized(win.id, false)}
                  />
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
