"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuthedPage } from "@/lib/useAuthedPage";
import { useLanguage } from "@/context/LanguageContext";
import { useApiResource } from "@/lib/useApiResource";
import { AiUpgradePrompt, Button, Card, ErrorState, LoadingSkeleton, PageShell, useAskHamame } from "@/components";
import { Input } from "@/components/Field";
import { SUGGESTION_KEYS } from "@/components/AskHamame";

// AI study chat (V2, same pool as session hints per BR-6, one turn = one
// credit). Full-page view of the same conversation the "Demander à Hamame"
// header panel holds (AskHamameProvider), so switching between them keeps it.

interface CreditsData {
  dailyAllowance: number;
  usedToday: number;
  remainingToday: number;
}

export default function AiChatPage() {
  const { user, isHydrated, handleLogout } = useAuthedPage();
  const { t } = useLanguage();
  const canFetch = isHydrated && !!user;

  const {
    data: credits,
    error: creditsError,
    isLoading: creditsLoading,
  } = useApiResource<CreditsData>(canFetch ? "/ai/credits" : null);

  const { history, sending, sendError, creditsExhausted, send } = useAskHamame();
  const outOfCredits = creditsExhausted || credits?.remainingToday === 0;
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [history.length, sending]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const content = draft;
    setDraft("");
    void send(content);
  }

  return (
    <PageShell
      user={user}
      isHydrated={isHydrated}
      onLogout={handleLogout}
      width="narrow"
      title={t("aiChat.title")}
      loadingLabel={t("common.loading")}
    >
      {creditsError && <ErrorState message={creditsError} className="mt-section-gap" />}
      <p className="mt-1 text-caption text-text-tertiary">{t("aiChat.desc")}</p>
      {creditsLoading && <LoadingSkeleton className="mt-section-gap h-10 w-full" ariaLabel={t("common.loading")} />}
      {credits && (
        <Card className="mt-section-gap">
          <p className="text-meta font-medium text-text-secondary">{t("aiChat.credits")}</p>
          <p className="mt-1 font-display text-h3 font-semibold text-text-primary">
            {credits.remainingToday}
            <span className="ml-2 text-meta text-text-tertiary">
              {t("aiChat.creditsHint", { used: credits.usedToday, allowance: credits.dailyAllowance })}
            </span>
          </p>
        </Card>
      )}

      <Card className="mt-4">
        {history.length === 0 ? (
          <div className="py-4">
            <h3 className="font-display text-h3 font-semibold text-text-primary">{t("aiChat.emptyTitle")}</h3>
            <p className="mt-1 text-meta text-text-secondary">{t("aiChat.emptyDesc")}</p>
            <p className="mt-3 text-caption font-medium uppercase tracking-wide text-text-tertiary">
              {t("aiChat.suggestionsHeading")}
            </p>
            <div className="mt-2 flex flex-col gap-2">
              {SUGGESTION_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  disabled={sending}
                  onClick={() => void send(t(key))}
                  className="rounded-card border border-border bg-surface-2 px-4 py-3 text-left text-body text-text-primary transition-colors hover:bg-surface-3 disabled:opacity-50"
                >
                  {t(key)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 py-2">
            {history.map((message, index) =>
              message.role === "assistant" && message.content === "" ? null : (
                <div
                  key={`${index}-${message.role}`}
                  className={`max-w-[85%] whitespace-pre-wrap rounded-card px-4 py-2 text-body ${
                    message.role === "user"
                      ? "self-end bg-accent-primary text-on-accent"
                      : "self-start bg-surface-2 text-text-primary"
                  }`}
                >
                  {message.content.replace(/\n+$/, "")}
                </div>
              )
            )}
            {sending && <p className="self-start text-caption text-text-tertiary">{t("aiChat.thinking")}</p>}
          </div>
        )}
        <div ref={bottomRef} />
      </Card>

      {sendError && <ErrorState message={sendError} className="mt-2" />}
      {outOfCredits && <AiUpgradePrompt className="mt-3" />}

      <form className="mt-3 flex items-end gap-2" onSubmit={handleSubmit}>
        <div className="flex-1">
          <Input
            id="ai-chat-input"
            label={t("aiChat.inputLabel")}
            type="text"
            value={draft}
            maxLength={2000}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("aiChat.inputPlaceholder")}
          />
        </div>
        <Button type="submit" disabled={sending || draft.trim().length === 0} className="mb-[1.6rem]">
          {sending ? t("aiChat.thinking") : t("aiChat.send")}
        </Button>
      </form>
    </PageShell>
  );
}
