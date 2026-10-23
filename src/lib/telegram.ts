// Outbound Telegram via the Bot API HTTP endpoint (no SDK dependency — plain fetch).
//
// Env:
//   TELEGRAM_BOT_TOKEN      — required to actually send. When unset, sending is
//     skipped and returns delivered=false exactly like email.ts: callers keep
//     working and every UI surface degrades gracefully.
//   TELEGRAM_WEBHOOK_SECRET — validates the bot webhook's
//     x-telegram-bot-api-secret-token header (set as the webhook's
//     secret_token when the owner registers the webhook with Telegram).
//     When unset, the webhook rejects everything (fail closed) — the
//     endpoint is inert without it, which is the deployed state today.
//
// Warn-only policy: sending is best-effort. This module never throws on the
// outbound path — failures return delivered=false and log a warning, so admin
// broadcasts and (future) notification relays can never hard-fail on Telegram.

const TELEGRAM_API_BASE = "https://api.telegram.org";

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

export function isWebhookSecretSet(): boolean {
  return Boolean(process.env.TELEGRAM_WEBHOOK_SECRET);
}

export interface TelegramSendResult {
  delivered: boolean;
  error: string | null;
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<TelegramSendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    // No key: warn-only skip, identical to the email.ts contract.
    console.log(`[telegram] TELEGRAM_BOT_TOKEN not set — skipping message to chat ${chatId}`);
    return { delivered: false, error: "not_configured" };
  }
  try {
    const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(`[telegram] Bot API rejected sendMessage to chat ${chatId}: ${response.status} ${detail}`);
      return { delivered: false, error: `http_${response.status}` };
    }
    const body = (await response.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
    if (!body?.ok) {
      console.warn(`[telegram] Bot API returned not-ok for chat ${chatId}: ${body?.description ?? body}`);
      return { delivered: false, error: body?.description ?? "not_ok" };
    }
    return { delivered: true, error: null };
  } catch (err) {
    console.warn(`[telegram] Failed to send to chat ${chatId}: ${err instanceof Error ? err.message : err}`);
    return { delivered: false, error: err instanceof Error ? err.message : "network_error" };
  }
}
