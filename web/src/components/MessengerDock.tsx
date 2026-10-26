"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cx } from "@/lib/cx";
import { useLanguage } from "@/context/LanguageContext";
import { localeFor, type UiLanguage } from "@/lib/i18n";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/Icon";
import { UserAvatar } from "@/components/UserAvatar";

export interface ConversationSummary {
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
  createdAt: string;
}

const POLL_MS = 12000;

function formatWhen(iso: string, lang: UiLanguage): string {
  try {
    return new Date(iso).toLocaleString(localeFor(lang), { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
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
              ? fromMeLabel(conversation.lastMessage.body)
              : conversation.lastMessage.body
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

function MiniChat({
  conversation,
  userId,
  onClose,
}: {
  conversation: ConversationSummary;
  userId: string;
  onClose: () => void;
}) {
  const { lang, t } = useLanguage();
  const [messages, setMessages] = useState<DirectMessageItem[]>([]);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (after?: string) => {
    const query = after ? `?after=${encodeURIComponent(after)}&limit=40` : "?limit=40";
    const data = await apiFetch<{ messages: DirectMessageItem[] }>(
      `/dms/conversations/${conversation.id}/messages${query}`
    );
    setMessages((prev) => {
      if (!after) return data.messages;
      const known = new Set(prev.map((m) => m.id));
      return [...prev, ...data.messages.filter((m) => !known.has(m.id))];
    });
    if (data.messages.some((m) => m.senderId !== userId)) {
      await apiFetch(`/dms/conversations/${conversation.id}/read`, { method: "POST" });
    }
  }, [conversation.id, userId]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- first paint of an open mini-chat loads the thread */
    void load();
    /* eslint-enable react-hooks/set-state-in-effect */
    const tick = setInterval(() => {
      if (document.hidden) return;
      const last = messages[messages.length - 1];
      void load(last?.createdAt).catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(tick);
    // messages length is read inside the interval via closure on each fire of load's after — refresh last via ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function send() {
    const body = draft.trim();
    if (!body) return;
    const data = await apiFetch<{ message: DirectMessageItem }>(
      `/dms/conversations/${conversation.id}/messages`,
      { method: "POST", body: JSON.stringify({ body }) }
    );
    setDraft("");
    setMessages((prev) => [...prev, data.message]);
  }

  return (
    <div className="flex h-96 w-80 flex-col overflow-hidden rounded-card border border-border bg-surface-1 shadow-card">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <UserAvatar name={conversation.otherUser.fullName} seed={conversation.otherUser.id} size={28} />
        <p className="min-w-0 flex-1 truncate text-body font-semibold leading-5 text-text-primary">
          {conversation.otherUser.fullName ?? "—"}
        </p>
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
                  <p className="whitespace-pre-wrap break-words">{message.body}</p>
                  <p className={cx("mt-0.5 text-[10px]", fromMe ? "text-on-accent/70" : "text-text-tertiary")}>
                    {formatWhen(message.createdAt, lang)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        <div ref={bottomRef} />
      </div>
      <form
        className="flex gap-2 border-t border-border p-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("dms.placeholder")}
          maxLength={2000}
          className="min-h-10 min-w-0 flex-1 rounded-pill border border-border bg-surface-2 px-3 text-meta text-text-primary placeholder:text-text-tertiary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label={t("dms.send")}
          className="inline-flex h-10 w-10 items-center justify-center rounded-pill bg-accent-primary text-on-accent transition hover:brightness-110 disabled:opacity-40"
        >
          <Icon name="send" size={16} />
        </button>
      </form>
    </div>
  );
}

export function MessengerDock({ userId }: { userId: string }) {
  const { lang, t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [headerOpen, setHeaderOpen] = useState(false);
  const [openChatId, setOpenChatId] = useState<string | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const onMessagesPage = pathname === "/messages" || pathname.startsWith("/messages/");

  const load = useCallback(async () => {
    const data = await apiFetch<{ conversations: ConversationSummary[] }>("/dms/conversations?page=1&limit=20");
    setConversations(data.conversations);
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- conversation list is polled; first fetch on mount */
    void load().catch(() => undefined);
    /* eslint-enable react-hooks/set-state-in-effect */
    const tick = setInterval(() => {
      if (document.hidden) return;
      void load().catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(tick);
  }, [load]);

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (!headerRef.current?.contains(event.target as Node)) setHeaderOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, []);

  const unread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
  const openConversation = conversations.find((c) => c.id === openChatId) ?? null;

  function openFromList(id: string) {
    if (onMessagesPage) {
      router.push(`/messages?c=${id}`);
      setHeaderOpen(false);
      return;
    }
    setOpenChatId(id);
    setHeaderOpen(false);
  }

  const list = (
    <div className="flex max-h-[28rem] w-[22rem] flex-col overflow-hidden rounded-card border border-border bg-surface-1 shadow-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="text-body font-semibold text-text-primary">{t("dms.dockTitle")}</p>
        <button
          type="button"
          onClick={() => {
            setHeaderOpen(false);
            router.push("/messages");
          }}
          className="text-caption font-medium text-accent-soft hover:text-text-primary"
        >
          {t("dms.viewAll")}
        </button>
      </div>
      <div className="overflow-y-auto p-1">
        {conversations.length === 0 ? (
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
          onClick={() => setHeaderOpen((v) => !v)}
          aria-label={unread > 0 ? t("dms.unreadMany", { count: unread }) : t("dms.openMessenger")}
          aria-expanded={headerOpen}
          className="relative inline-flex min-h-touch-target min-w-touch-target items-center justify-center rounded-pill text-text-secondary transition hover:bg-surface-2 hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <Icon name="messages" size={20} />
          {unread > 0 ? (
            <span className="absolute right-1 top-1 min-w-4 rounded-pill bg-accent-primary px-1 text-center text-[10px] font-bold leading-4 text-on-accent">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
        {headerOpen ? (
          <div className="fixed right-4 top-[4.25rem] z-40">{list}</div>
        ) : null}
      </div>

      {!onMessagesPage && openConversation ? (
        <div className="fixed bottom-4 right-4 z-40 hidden lg:block">
          <MiniChat conversation={openConversation} userId={userId} onClose={() => setOpenChatId(null)} />
        </div>
      ) : null}
    </>
  );
}
