"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import type { I18nKey } from "@/lib/i18n";
import { AiUpgradePrompt } from "@/components/AiUpgradePrompt";

/**
 * "Demander à Hamame" — the study assistant reachable from every signed-in
 * page (header pill → right-docked panel), in the spirit of Chrome's
 * "Ask Gemini". The provider lives in the root layout so the conversation
 * survives client navigation; /ai-chat reads the same state.
 *
 * Same contract as before: the server is stateless per turn (one turn = one
 * credit, BR-6 pool); each send replays a bounded window of the history.
 */

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const MAX_HISTORY = 10;

export const SUGGESTION_KEYS = ["aiChat.suggestion1", "aiChat.suggestion2", "aiChat.suggestion3", "aiChat.suggestion4"] as const;

/** Routes where the assistant must never appear: the session player hosts
 *  exam mode and simulations, whose answers the server withholds (BR-4). */
function isAssistantBlocked(pathname: string): boolean {
  return /^\/sessions\/[^/]+\/?$/.test(pathname);
}

function isCreditsExhausted(err: unknown): boolean {
  return err instanceof ApiError && err.code === "AI_CREDITS_EXHAUSTED";
}

function sendFailKey(err: unknown): I18nKey {
  const code = err instanceof ApiError ? err.code : null;
  if (code === "AI_NOT_CONFIGURED") return "aiChat.unavailable";
  if (code === "AI_CREDITS_EXHAUSTED") return "aiChat.exhausted";
  if (code === "AI_GENERATION_FAILED") return "aiChat.failed";
  return "aiChat.generic";
}

interface AskHamameContextValue {
  history: ChatMessage[];
  sending: boolean;
  sendError: string | null;
  /** True when the last send was refused because today's AI credits are spent. */
  creditsExhausted: boolean;
  send: (text: string) => Promise<void>;
  reset: () => void;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  /** False on routes where the launcher must not render (see isAssistantBlocked). */
  available: boolean;
}

const AskHamameContext = createContext<AskHamameContextValue | undefined>(undefined);

interface Conversation {
  ownerId: string | null;
  messages: ChatMessage[];
}

export function AskHamameProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const pathname = usePathname();
  const userId = user?.id ?? null;

  // Tagged with its owner so a logout/login swap never shows the previous
  // account's conversation.
  const [conversation, setConversation] = useState<Conversation>({ ownerId: null, messages: [] });
  const history = useMemo(
    () => (conversation.ownerId === userId ? conversation.messages : []),
    [conversation, userId]
  );
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [creditsExhausted, setCreditsExhausted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const available = !!user && !isAssistantBlocked(pathname) && pathname !== "/ai-chat";

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || sending || !userId) return;
      setSending(true);
      setSendError(null);
      setCreditsExhausted(false);
      const nextHistory = [...history, { role: "user" as const, content }];
      setConversation({ ownerId: userId, messages: [...nextHistory, { role: "assistant", content: "" }] });
      try {
        // Whole-pair window: a plain slice(-N) can cut mid-pair and open on an
        // assistant turn, which the API rejects (must start with a user turn).
        const rawStart = nextHistory.length - MAX_HISTORY;
        const windowStart =
          rawStart > 0 && nextHistory[rawStart]?.role === "assistant" ? rawStart + 1 : Math.max(0, rawStart);
        const data = await apiFetch<{ reply: string; creditsRemainingToday: number; dailyAllowance: number }>(
          "/ai/study-chat",
          { method: "POST", body: JSON.stringify({ messages: nextHistory.slice(windowStart) }) }
        );
        setConversation({ ownerId: userId, messages: [...nextHistory, { role: "assistant", content: data.reply }] });
      } catch (err) {
        setSendError(t(sendFailKey(err)));
        setCreditsExhausted(isCreditsExhausted(err));
        setConversation({ ownerId: userId, messages: nextHistory });
      } finally {
        setSending(false);
      }
    },
    [history, sending, t, userId]
  );

  const reset = useCallback(() => {
    if (sending) return;
    setConversation({ ownerId: userId, messages: [] });
    setSendError(null);
    setCreditsExhausted(false);
  }, [sending, userId]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo(
    () => ({ history, sending, sendError, creditsExhausted, send, reset, isOpen, open, close, available }),
    [history, sending, sendError, creditsExhausted, send, reset, isOpen, open, close, available]
  );

  return (
    <AskHamameContext.Provider value={value}>
      {children}
      {available && isOpen ? <AskHamamePanel /> : null}
    </AskHamameContext.Provider>
  );
}

export function useAskHamame(): AskHamameContextValue {
  const ctx = useContext(AskHamameContext);
  if (!ctx) throw new Error("useAskHamame must be used within an AskHamameProvider");
  return ctx;
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" />
    </svg>
  );
}

/** Header pill. Icon-only on phones, labelled from `sm` up. */
export function AskHamameButton() {
  const { t } = useLanguage();
  const { available, isOpen, open, close } = useAskHamame();
  if (!available) return null;
  return (
    <button
      type="button"
      onClick={isOpen ? close : open}
      aria-expanded={isOpen}
      aria-controls="ask-hamame-panel"
      aria-label={t("askHamame.cta")}
      title={t("askHamame.cta")}
      className="inline-flex min-h-touch-target min-w-touch-target items-center justify-center gap-2 rounded-pill border border-accent-primary/40 bg-accent-primary/10 px-3 text-meta font-semibold text-accent-soft transition hover:bg-accent-primary/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring sm:px-4"
    >
      <SparkleIcon className="h-4 w-4" />
      <span className="hidden sm:inline">{t("askHamame.cta")}</span>
    </button>
  );
}

const iconButtonClasses =
  "inline-flex min-h-touch-target min-w-touch-target items-center justify-center rounded-pill text-text-secondary transition hover:bg-surface-2 hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50";

/** Non-modal right-docked panel: no backdrop, so the page (e.g. a lesson)
 *  stays readable and scrollable beside the conversation on desktop. */
function AskHamamePanel() {
  const { t } = useLanguage();
  const { history, sending, sendError, creditsExhausted, send, reset, close } = useAskHamame();
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [history.length, sending]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const content = draft;
    if (!content.trim() || sending) return;
    setDraft("");
    void send(content);
  }

  return (
    <aside
      id="ask-hamame-panel"
      aria-label={t("askHamame.cta")}
      className="hamame-dialog-enter fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-border bg-surface-1 shadow-card-lg sm:w-[26rem]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-accent-primary text-on-accent" aria-hidden>
          <SparkleIcon className="h-4 w-4" />
        </span>
        <h2 className="min-w-0 flex-1 truncate font-display text-body font-semibold text-text-primary">{t("askHamame.cta")}</h2>
        <button type="button" onClick={reset} disabled={sending || history.length === 0} aria-label={t("askHamame.newChat")} title={t("askHamame.newChat")} className={iconButtonClasses}>
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M10 4v12M4 10h12" strokeLinecap="round" />
          </svg>
        </button>
        <Link href="/ai-chat" onClick={close} aria-label={t("askHamame.openFull")} title={t("askHamame.openFull")} className={iconButtonClasses}>
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M11 4h5v5M16 4l-6 6M9 5H5v10h10v-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <button type="button" onClick={close} aria-label={t("askHamame.close")} title={t("askHamame.close")} className={iconButtonClasses}>
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        {history.length === 0 ? (
          <div>
            <p className="font-display text-h3 font-semibold text-text-primary">{t("aiChat.emptyTitle")}</p>
            <p className="mt-1 text-meta text-text-secondary">{t("aiChat.emptyDesc")}</p>
            <p className="mt-4 text-caption font-medium uppercase tracking-wide text-text-tertiary">{t("aiChat.suggestionsHeading")}</p>
            <div className="mt-2 flex flex-col gap-2">
              {SUGGESTION_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  disabled={sending}
                  onClick={() => void send(t(key))}
                  className="rounded-card border border-border bg-surface-2 px-3 py-2 text-left text-meta text-text-primary transition-colors hover:bg-surface-3 disabled:opacity-50"
                >
                  {t(key)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {history.map((message, index) =>
              message.role === "assistant" && message.content === "" ? null : (
                <div
                  key={`${index}-${message.role}`}
                  className={`max-w-[90%] whitespace-pre-wrap rounded-card px-3 py-2 text-meta ${
                    message.role === "user" ? "self-end bg-accent-primary text-on-accent" : "self-start bg-surface-2 text-text-primary"
                  }`}
                >
                  {message.content.replace(/\n+$/, "")}
                </div>
              )
            )}
            {sending ? <p className="self-start text-caption text-text-tertiary">{t("aiChat.thinking")}</p> : null}
          </div>
        )}
        {sendError ? (
          <p role="alert" className="mt-3 text-meta text-danger">
            {sendError}
          </p>
        ) : null}
        {creditsExhausted ? <AiUpgradePrompt className="mt-3" /> : null}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={submit} className="border-t border-border px-4 py-3">
        <label htmlFor="ask-hamame-input" className="sr-only">
          {t("aiChat.inputLabel")}
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id="ask-hamame-input"
            ref={inputRef}
            rows={2}
            maxLength={2000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) submit(e);
            }}
            placeholder={t("aiChat.inputPlaceholder")}
            className="min-h-touch-target flex-1 resize-none rounded-input border border-border bg-surface-2 px-3 py-2 text-meta text-text-primary placeholder:text-text-tertiary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          />
          <button
            type="submit"
            disabled={sending || draft.trim().length === 0}
            aria-label={t("aiChat.send")}
            title={t("aiChat.send")}
            className="inline-flex min-h-touch-target min-w-touch-target items-center justify-center rounded-pill bg-accent-primary text-on-accent transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M4 10h11M11 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <p className="mt-2 text-caption text-text-tertiary">{t("askHamame.creditNote")}</p>
      </form>
    </aside>
  );
}
