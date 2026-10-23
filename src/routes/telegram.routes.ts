import { Router } from "express";
import { z } from "zod";
import { randomBytes } from "crypto";
import { NextFunction, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { validateBody } from "../middleware/validate";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/errors";
import { isTelegramConfigured, isWebhookSecretSet, sendTelegramMessage } from "../lib/telegram";
import { createNotificationBestEffort } from "./notifications.routes";

// ---------------------------------------------------------------------------
// /api/telegram — relay between the Telegram bot (medspark.online sends NEW-
// QUESTION/digest pushes through a Sendpulse bot; Hamame is from-scratch with
// the official Bot HTTP API, zero dependencies) and the platform. Warn-only:
// without TELEGRAM_BOT_TOKEN nothing sends; without TELEGRAM_WEBHOOK_SECRET
// the webhook is inert (fail closed).
//
// Link flow: the user requests a one-time code (below), types `/start hmg-<code>`
// to the bot, Telegram POSTs the update here, we stamp User.telegramChatId.
// ---------------------------------------------------------------------------
const router = Router();

const LINK_PREFIX = "hmg-";
const LINK_TTL_MS = 15 * 60 * 1000;

function issueLinkCode(): { code: string; expiresAt: Date } {
  return {
    code: randomBytes(24).toString("hex"),
    expiresAt: new Date(Date.now() + LINK_TTL_MS),
  };
}

// POST /api/users/me/telegram/link — issue (or rotate) the bot link code.
async function createLink(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { telegramChatId: true },
    });
    if (!user) throw new ApiError(404, "USER_NOT_FOUND", "Your account no longer exists.");
    if (user.telegramChatId) {
      throw new ApiError(409, "ALREADY_LINKED", "Your account is already linked to a Telegram chat.");
    }
    if (!isWebhookSecretSet()) {
      throw new ApiError(
        503,
        "TELEGRAM_NOT_DEPLOYED",
        "The Telegram relay is not configured for this deployment."
      );
    }
    const { code, expiresAt } = issueLinkCode();
    await prisma.user.update({
      where: { id: userId },
      data: { telegramLinkCode: code, telegramLinkExpiresAt: expiresAt },
    });
    res.status(201).json({ code: `${LINK_PREFIX}${code}`, expiresAt, botCommand: `/start ${LINK_PREFIX}${code}` });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/users/me/telegram/link — unlink the chat.
async function removeLink(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.user.update({
      where: { id: req.auth!.userId },
      data: { telegramChatId: null, telegramLinkCode: null, telegramLinkExpiresAt: null },
      select: { id: true },
    });
    res.json({ unlinked: true });
  } catch (err) {
    next(err);
  }
}

// GET /api/users/me/telegram — link state for the settings UI (never exposes the raw chat id).
async function getLink(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.userId },
      select: { telegramChatId: true, telegramLinkExpiresAt: true, telegramLinkCode: true },
    });
    if (!user) throw new ApiError(404, "USER_NOT_FOUND", "Your account no longer exists.");
    res.json({
      linked: Boolean(user.telegramChatId),
      pendingCode: Boolean(user.telegramLinkCode && user.telegramLinkExpiresAt && user.telegramLinkExpiresAt > new Date()),
      deployed: isTelegramConfigured() && isWebhookSecretSet(),
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/telegram/webhook — Telegram posts bot updates here. Auth is the
// x-telegram-bot-api-secret-token header, never a JWT. 200 {"ok":true} is
// always the happy response (Telegram retries non-200s otherwise).
const webhookBody = z.object({
  message: z
    .object({
      chat: z.object({ id: z.number(), type: z.string().optional() }),
      text: z.string().max(256).optional(),
    })
    .optional(),
});

async function webhook(req: Request, res: Response, next: NextFunction) {
  try {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!secret) return res.json({ ok: true });
    const provided = req.headers["x-telegram-bot-api-secret-token"];
    if (provided !== secret) {
      return res.status(401).json({ ok: false, error: "bad_secret" });
    }
    const body = req.body as z.infer<typeof webhookBody>;
    const text = body.message?.text ?? "";
    const chatId = body.message?.chat.id;
    if (!text.startsWith("/start ") || !text.startsWith(LINK_PREFIX, "/start ".length) || chatId === undefined) {
      return res.json({ ok: true });
    }
    const rawCode = text.slice("/start ".length + LINK_PREFIX.length).trim();
    const user = await prisma.user.findFirst({
      where: { telegramLinkCode: rawCode },
      select: { id: true, telegramLinkExpiresAt: true },
    });
    if (!user || !user.telegramLinkExpiresAt || user.telegramLinkExpiresAt.getTime() < Date.now()) {
      // Unknown/expired code: still 200 (Telegram contract) — nothing else to say.
      await sendTelegramMessage(String(chatId), "Ce code de liaison est inconnu ou expiré.");
      return res.json({ ok: true });
    }
    const chatOwner = await prisma.user.findUnique({
      where: { telegramChatId: String(chatId) },
      select: { id: true },
    });
    if (chatOwner && chatOwner.id !== user.id) {
      // A chat already bound to a different account is rejected — relinking a
      // chat to someone else would be an account-takeover surface.
      await sendTelegramMessage(String(chatId), "Ce chat Telegram est déjà lié à un autre compte.");
      return res.json({ ok: true });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { telegramChatId: String(chatId), telegramLinkCode: null, telegramLinkExpiresAt: null },
    });
    void createNotificationBestEffort({
      userId: user.id,
      category: "systeme",
      title: "Telegram lié",
      body: "Votre compte est maintenant lié au bot Telegram de Hamame.",
    });
    await sendTelegramMessage(String(chatId), "Compte lié ! Vous recevrez ici les annonces de Hamame.");
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// Admin broadcast surface (audit row TelegramBroadcast + Bearer+admin gate).
const broadcastBody = z.object({
  text: z.string().min(1).max(1500),
});

async function createBroadcast(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.auth!.userId;
    const { text } = req.body as { text: string };
    if (!isTelegramConfigured()) {
      throw new ApiError(400, "TELEGRAM_NOT_CONFIGURED", "TELEGRAM_BOT_TOKEN is not set on this deployment.");
    }
    const recipients = await prisma.user.findMany({
      where: { telegramChatId: { not: null }, status: "active" },
      select: { telegramChatId: true },
    });
    let delivered = 0;
    let topError: string | null = null;
    // Sequential awaiting: the Supabase pooler rule (no Promise.all blowups)
    // applies to the DB reads; the Bot API itself also rate-limits (~30 msg/s).
    for (const r of recipients) {
      if (!r.telegramChatId) continue;
      const result = await sendTelegramMessage(r.telegramChatId, text);
      if (result.delivered) delivered += 1;
      else if (!topError) topError = result.error;
    }
    const row = await prisma.telegramBroadcast.create({
      data: { adminId, text, recipientCount: recipients.length, deliveredCount: delivered, telegramError: topError },
    });
    res.status(201).json({
      broadcast: {
        id: row.id,
        recipientCount: row.recipientCount,
        deliveredCount: row.deliveredCount,
        telegramError: row.telegramError,
        sentAt: row.sentAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function listBroadcasts(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const rows = await prisma.telegramBroadcast.findMany({
      orderBy: { sentAt: "desc" },
      take: limit,
      include: { admin: { select: { fullName: true } } },
    });
    res.json({
      broadcasts: rows.map((b) => ({
        id: b.id,
        text: b.text,
        recipientCount: b.recipientCount,
        deliveredCount: b.deliveredCount,
        telegramError: b.telegramError,
        sentAt: b.sentAt,
        adminName: b.admin.fullName ?? null,
      })),
    });
  } catch (err) {
    next(err);
  }
}

router.post("/users/me/telegram/link", requireAuth, createLink);
router.delete("/users/me/telegram/link", requireAuth, removeLink);
router.get("/users/me/telegram", requireAuth, getLink);
router.post("/telegram/webhook", webhook);
router.post("/telegram/admin/broadcast", requireAuth, requireRole("admin"), validateBody(broadcastBody), createBroadcast);
router.get("/telegram/admin/broadcasts", requireAuth, requireRole("admin"), listBroadcasts);

export default router;
