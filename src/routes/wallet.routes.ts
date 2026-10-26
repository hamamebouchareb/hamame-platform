import { randomBytes, randomUUID } from "crypto";
import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { paginationQuery, uuidParam } from "../lib/common-schemas";
import { validateBody, validateParams, validateQuery } from "../middleware/validate";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { limitWalletActions } from "../middleware/rateLimit";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { createNotificationBestEffort } from "./notifications.routes";
import {
  CUSTOM_MAX_JETONS,
  CUSTOM_MIN_JETONS,
  DZD_PER_JETON,
  postWalletEntry,
} from "../lib/wallet";
import {
  createChargilyCheckout,
  getChargilyCheckout,
  isChargilyConfigured,
  verifyChargilySignature,
  warnIfChargilyMissing,
  type ChargilyCheckoutStatus,
} from "../lib/chargily";
import {
  isReceiptStorageConfigured,
  RECEIPT_MAX_BYTES,
  signedReceiptUrl,
  sniffReceiptMime,
  uploadReceipt,
} from "../lib/receipt-storage";

// ---------------------------------------------------------------------------
// /api/wallet — Jetons wallet (medspark.online Sparx-wallet parity).
//
// Three ways in, all crediting through postWalletEntry's idempotent ledger:
//   - online (Chargily): order → hosted checkout → signed webhook OR the
//     owner's confirm poll, whichever lands first, credits exactly once;
//   - CCP / BaridiMob: receipt photo → admin/support-agent decision;
//   - recharge code: single-use code sold off-platform.
// Spending lives on the resource purchase endpoint (resources.routes.ts).
//
// Bank details come from env (WALLET_CCP_*), never from source.
// Sequential awaits throughout — Supabase session pooler concurrency limit.
// ---------------------------------------------------------------------------

const router = Router();
const requireStaff = requireRole("support_agent", "admin", "super_admin");
const requireAdmin = requireRole("admin", "super_admin");

const MAX_PENDING_DEPOSITS = 3;

function envValue(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function transferDetails() {
  const ccpAccount = envValue("WALLET_CCP_ACCOUNT");
  const ccpKey = envValue("WALLET_CCP_KEY");
  const rip = envValue("WALLET_RIP");
  const beneficiary = envValue("WALLET_BENEFICIARY_NAME");
  if (!beneficiary || (!rip && !ccpAccount)) return null;
  return { ccpAccount, ccpKey, rip, beneficiary };
}

function frontendUrl(): string {
  return (process.env.FRONTEND_URL?.trim() || "http://localhost:3001").replace(/\/+$/, "");
}

function serializePack(pack: {
  id: string;
  label: string;
  jetons: number;
  bonusJetons: number;
  priceDzd: number;
  badge: string | null;
  sortOrder: number;
  isActive: boolean;
}) {
  return {
    id: pack.id,
    label: pack.label,
    jetons: pack.jetons,
    bonusJetons: pack.bonusJetons,
    priceDzd: pack.priceDzd,
    badge: pack.badge,
    sortOrder: pack.sortOrder,
    isActive: pack.isActive,
  };
}

// Marks an online order paid and credits it. Safe to call any number of
// times from the webhook and the confirm poll: the conditional status flip
// and the ledger unique key both make every replay a no-op.
async function settleOnlineOrder(orderId: string, providerStatus: ChargilyCheckoutStatus) {
  const order = await prisma.walletTopupOrder.findUnique({ where: { id: orderId } });
  if (!order) return null;
  if (providerStatus === "paid") {
    const credited = await prisma.$transaction(
      async (tx) => {
        const flipped = await tx.walletTopupOrder.updateMany({
          where: { id: orderId, status: { in: ["pending", "failed", "canceled", "expired"] } },
          data: { status: "paid", paidAt: new Date() },
        });
        const posted = await postWalletEntry(tx, {
          userId: order.userId,
          reason: "topup_online",
          refId: order.id,
          delta: order.jetons,
        });
        return flipped.count === 1 && posted.status === "posted";
      },
      { maxWait: 10000, timeout: 20000 }
    );
    if (credited) {
      await createNotificationBestEffort({
        userId: order.userId,
        category: "prix",
        title: "Recharge réussie",
        body: `${order.jetons} jetons ont été ajoutés à votre portefeuille.`,
      });
    }
  } else if (providerStatus === "failed" || providerStatus === "canceled" || providerStatus === "expired") {
    await prisma.walletTopupOrder.updateMany({
      where: { id: orderId, status: "pending" },
      data: { status: providerStatus },
    });
  }
  return prisma.walletTopupOrder.findUnique({ where: { id: orderId } });
}

// ---------------------------------------------------------------------------
// Chargily webhook — public, authenticated by the HMAC signature alone.
// Mounted before requireAuth. req.rawBody is captured by app.ts's JSON parser.
// ---------------------------------------------------------------------------

async function chargilyWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isChargilyConfigured()) {
      throw new ApiError(503, "ONLINE_PAYMENT_NOT_CONFIGURED", "Online payment is not configured.");
    }
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody || !verifyChargilySignature(rawBody, req.get("signature"))) {
      throw new ApiError(403, "INVALID_SIGNATURE", "Webhook signature is invalid.");
    }
    const event = req.body as { type?: string; data?: { id?: string; status?: ChargilyCheckoutStatus } };
    const checkoutId = event.data?.id;
    if (checkoutId && typeof event.type === "string" && event.type.startsWith("checkout.")) {
      const order = await prisma.walletTopupOrder.findUnique({
        where: { providerCheckoutId: checkoutId },
        select: { id: true },
      });
      // Never trust the payload's status on its own word beyond the signature:
      // re-read it from Chargily so a replayed old event can't regress state.
      if (order) {
        const checkout = await getChargilyCheckout(checkoutId);
        await settleOnlineOrder(order.id, checkout.status);
      }
    }
    res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
}

router.post("/chargily/webhook", chargilyWebhook);

router.use(requireAuth);

// ---------------------------------------------------------------------------
// Student surface
// ---------------------------------------------------------------------------

// GET /api/wallet — balance, prices and which payment methods are live.
async function getWallet(req: Request, res: Response, next: NextFunction) {
  try {
    warnIfChargilyMissing();
    const userId = req.auth!.userId;
    const account = await prisma.walletAccount.findUnique({ where: { userId } });
    const packs = await prisma.jetonPack.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
    res.json({
      balance: account?.balance ?? 0,
      purchasedTotal: account?.purchasedTotal ?? 0,
      spentTotal: account?.spentTotal ?? 0,
      pricing: { dzdPerJeton: DZD_PER_JETON, customMin: CUSTOM_MIN_JETONS, customMax: CUSTOM_MAX_JETONS },
      packs: packs.map(serializePack),
      methods: {
        online: isChargilyConfigured(),
        transfer: transferDetails(),
        receiptUpload: isReceiptStorageConfigured(),
      },
      contacts: {
        telegram: envValue("WALLET_CONTACT_TELEGRAM"),
        instagram: envValue("WALLET_CONTACT_INSTAGRAM"),
        facebook: envValue("WALLET_CONTACT_FACEBOOK"),
      },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/wallet/ledger — the caller's movements, newest first.
async function listLedger(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { page, limit } = req.query as unknown as { page: number; limit: number };
    const total = await prisma.walletLedger.count({ where: { userId } });
    const rows = await prisma.walletLedger.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });
    res.json({
      ledger: rows.map((row) => ({
        id: row.id,
        delta: row.delta,
        reason: row.reason,
        balanceAfter: row.balanceAfter,
        createdAt: row.createdAt,
      })),
      pagination: { page, limit, total },
    });
  } catch (err) {
    next(err);
  }
}

const checkoutSchema = z.union([
  z.object({ packId: z.string().uuid() }).strict(),
  z.object({ jetons: z.number().int().min(CUSTOM_MIN_JETONS).max(CUSTOM_MAX_JETONS) }).strict(),
]);

// POST /api/wallet/checkout — open a Chargily checkout for a pack or a custom
// amount. The price is always computed server-side from the pack row / rate.
async function createCheckout(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isChargilyConfigured()) {
      throw new ApiError(503, "ONLINE_PAYMENT_NOT_CONFIGURED", "Online payment is not available yet.");
    }
    const userId = req.auth!.userId;
    const body = req.body as { packId: string } | { jetons: number };

    let packId: string | null = null;
    let jetons: number;
    let amountDzd: number;
    if ("packId" in body) {
      const pack = await prisma.jetonPack.findFirst({ where: { id: body.packId, isActive: true } });
      if (!pack) throw new ApiError(404, "PACK_NOT_FOUND", "This pack does not exist.");
      packId = pack.id;
      jetons = pack.jetons + pack.bonusJetons;
      amountDzd = pack.priceDzd;
    } else {
      jetons = body.jetons;
      amountDzd = body.jetons * DZD_PER_JETON;
    }

    const order = await prisma.walletTopupOrder.create({
      data: { userId, packId, jetons, amountDzd, provider: "chargily" },
    });

    const lang = await prisma.user.findUnique({ where: { id: userId }, select: { uiLanguage: true } });
    const returnUrl = `${frontendUrl()}/wallet?order=${order.id}`;
    let checkout;
    try {
      checkout = await createChargilyCheckout({
        amountDzd,
        successUrl: returnUrl,
        failureUrl: returnUrl,
        webhookUrl: envValue("CHARGILY_WEBHOOK_URL"),
        locale: lang?.uiLanguage === "en" ? "en" : "fr",
        description: `Hamame — ${jetons} jetons`,
        orderId: order.id,
      });
    } catch (err) {
      await prisma.walletTopupOrder.update({ where: { id: order.id }, data: { status: "failed" } });
      console.error("[wallet] Chargily checkout creation failed:", err instanceof Error ? err.message : err);
      throw new ApiError(502, "PAYMENT_PROVIDER_ERROR", "The payment provider is unavailable. Please try again later.");
    }
    if (!checkout.checkout_url) {
      await prisma.walletTopupOrder.update({ where: { id: order.id }, data: { status: "failed" } });
      throw new ApiError(502, "PAYMENT_PROVIDER_ERROR", "The payment provider returned no checkout link.");
    }

    await prisma.walletTopupOrder.update({
      where: { id: order.id },
      data: { providerCheckoutId: checkout.id, checkoutUrl: checkout.checkout_url },
    });
    res.status(201).json({ orderId: order.id, checkoutUrl: checkout.checkout_url });
  } catch (err) {
    next(err);
  }
}

// POST /api/wallet/checkout/:orderId/confirm — called by /wallet on return
// from the hosted page; asks Chargily for the truth (works without webhooks,
// e.g. locally) and settles idempotently.
async function confirmCheckout(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { orderId } = req.params as { orderId: string };
    const order = await prisma.walletTopupOrder.findUnique({ where: { id: orderId } });
    if (!order || order.userId !== userId) {
      throw new ApiError(404, "ORDER_NOT_FOUND", "This order does not exist.");
    }
    let current = order;
    if (order.status === "pending" && order.providerCheckoutId && isChargilyConfigured()) {
      const checkout = await getChargilyCheckout(order.providerCheckoutId);
      current = (await settleOnlineOrder(order.id, checkout.status)) ?? order;
    }
    const account = await prisma.walletAccount.findUnique({ where: { userId } });
    res.json({
      order: { id: current.id, status: current.status, jetons: current.jetons, amountDzd: current.amountDzd },
      balance: account?.balance ?? 0,
    });
  } catch (err) {
    next(err);
  }
}

const depositSchema = z.object({
  amountDzd: z.number().int().min(DZD_PER_JETON).max(1_000_000).nullable().optional(),
  receiptBase64: z.string().min(16).max(Math.ceil((RECEIPT_MAX_BYTES * 4) / 3) + 16),
});

// POST /api/wallet/transfer-deposits — submit a CCP/BaridiMob receipt.
async function createDeposit(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isReceiptStorageConfigured()) {
      throw new ApiError(503, "RECEIPT_STORAGE_NOT_CONFIGURED", "Receipt upload is not available yet.");
    }
    if (!transferDetails()) {
      throw new ApiError(503, "TRANSFER_NOT_CONFIGURED", "Bank transfer is not available yet.");
    }
    const userId = req.auth!.userId;
    const body = req.body as z.infer<typeof depositSchema>;

    const pending = await prisma.walletTransferDeposit.count({ where: { userId, status: "pending" } });
    if (pending >= MAX_PENDING_DEPOSITS) {
      throw new ApiError(409, "TOO_MANY_PENDING", "You already have receipts awaiting review.");
    }

    const base64 = body.receiptBase64.replace(/^data:[^;]+;base64,/, "");
    const bytes = Buffer.from(base64, "base64");
    if (bytes.length === 0 || bytes.length > RECEIPT_MAX_BYTES) {
      throw new ApiError(400, "RECEIPT_INVALID", "The receipt must be an image of at most 10 MB.");
    }
    const mime = sniffReceiptMime(bytes);
    if (!mime) {
      throw new ApiError(400, "RECEIPT_INVALID", "Accepted formats: JPG, PNG, WebP.");
    }

    const extension = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    const path = `${userId}/${randomUUID()}.${extension}`;
    try {
      await uploadReceipt(path, bytes, mime);
    } catch (err) {
      console.error("[wallet] receipt upload failed:", err instanceof Error ? err.message : err);
      throw new ApiError(502, "RECEIPT_UPLOAD_FAILED", "The receipt could not be stored. Please try again.");
    }

    const deposit = await prisma.walletTransferDeposit.create({
      data: { userId, amountDzd: body.amountDzd ?? null, receiptPath: path, receiptMime: mime },
    });
    res.status(201).json({
      deposit: { id: deposit.id, status: deposit.status, amountDzd: deposit.amountDzd, createdAt: deposit.createdAt },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/wallet/transfer-deposits — the caller's receipts.
async function listMyDeposits(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const rows = await prisma.walletTransferDeposit.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    res.json({
      deposits: rows.map((row) => ({
        id: row.id,
        amountDzd: row.amountDzd,
        status: row.status,
        jetonsGranted: row.jetonsGranted,
        decisionNote: row.decisionNote,
        createdAt: row.createdAt,
        decidedAt: row.decidedAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

const redeemSchema = z.object({ code: z.string().min(4).max(64) });

// POST /api/wallet/recharge-codes/redeem — conditional claim inside the credit
// transaction (same atomic discipline as activation-code redemption).
async function redeemRechargeCode(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { code } = req.body as z.infer<typeof redeemSchema>;
    const row = await prisma.rechargeCode.findUnique({ where: { code: normalizeCode(code) } });
    if (!row) throw new ApiError(404, "RECHARGE_CODE_NOT_FOUND", "This code is invalid.");
    if (row.status === "redeemed") throw new ApiError(409, "RECHARGE_CODE_ALREADY_REDEEMED", "This code has already been used.");
    if (row.status === "revoked") throw new ApiError(409, "RECHARGE_CODE_REVOKED", "This code has been revoked.");
    const now = new Date();
    if (row.expiresAt && row.expiresAt < now) throw new ApiError(409, "RECHARGE_CODE_EXPIRED", "This code has expired.");

    const balance = await prisma.$transaction(
      async (tx) => {
        const claimed = await tx.rechargeCode.updateMany({
          where: { id: row.id, status: "active" },
          data: { status: "redeemed", redeemedBy: userId, redeemedAt: now },
        });
        if (claimed.count !== 1) {
          throw new ApiError(409, "RECHARGE_CODE_ALREADY_REDEEMED", "This code has already been used.");
        }
        const posted = await postWalletEntry(tx, { userId, reason: "topup_code", refId: row.id, delta: row.jetons });
        return posted.balance;
      },
      { maxWait: 10000, timeout: 20000 }
    );

    await createNotificationBestEffort({
      userId,
      category: "prix",
      title: "Code de recharge activé",
      body: `${row.jetons} jetons ont été ajoutés à votre portefeuille.`,
    });
    res.json({ jetons: row.jetons, balance });
  } catch (err) {
    next(err);
  }
}

router.get("/", getWallet);
router.get("/ledger", validateQuery(paginationQuery), listLedger);
router.post("/checkout", validateBody(checkoutSchema), createCheckout);
router.post("/checkout/:orderId/confirm", validateParams(uuidParam("orderId")), confirmCheckout);
router.get("/transfer-deposits", listMyDeposits);
router.post("/transfer-deposits", limitWalletActions, validateBody(depositSchema), createDeposit);
router.post("/recharge-codes/redeem", limitWalletActions, validateBody(redeemSchema), redeemRechargeCode);

// ---------------------------------------------------------------------------
// Staff surface (support agents + admins, like activation codes)
// ---------------------------------------------------------------------------

const adminDepositsQuery = paginationQuery.extend({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
});

async function listAdminDeposits(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, status } = req.query as unknown as z.infer<typeof adminDepositsQuery>;
    const where = status ? { status } : {};
    const total = await prisma.walletTransferDeposit.count({ where });
    const rows = await prisma.walletTransferDeposit.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: { select: { id: true, email: true, fullName: true } },
        decider: { select: { fullName: true } },
      },
    });
    res.json({
      deposits: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        userName: row.user.fullName,
        userEmail: row.user.email,
        amountDzd: row.amountDzd,
        status: row.status,
        jetonsGranted: row.jetonsGranted,
        decidedBy: row.decider?.fullName ?? null,
        decidedAt: row.decidedAt,
        decisionNote: row.decisionNote,
        createdAt: row.createdAt,
      })),
      pagination: { page, limit, total },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/wallet/admin/transfer-deposits/:id/receipt — short-lived signed URL.
async function getDepositReceipt(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as { id: string };
    const row = await prisma.walletTransferDeposit.findUnique({ where: { id }, select: { receiptPath: true } });
    if (!row) throw new ApiError(404, "DEPOSIT_NOT_FOUND", "This deposit does not exist.");
    const url = await signedReceiptUrl(row.receiptPath);
    if (!url) throw new ApiError(503, "RECEIPT_STORAGE_NOT_CONFIGURED", "Receipt storage is unavailable.");
    res.json({ url });
  } catch (err) {
    next(err);
  }
}

const decideSchema = z
  .object({
    action: z.enum(["approve", "reject"]),
    jetons: z.number().int().min(1).max(100_000).optional(),
    decisionNote: z.string().max(500).nullable().optional(),
  })
  .refine((body) => body.action === "reject" || body.jetons !== undefined, {
    message: "jetons is required to approve",
    path: ["jetons"],
  });

// POST /api/wallet/admin/transfer-deposits/:id/decide — pending → approved
// (credits `jetons`) | rejected. Conditional flip, so two staff members
// deciding at once can't double-credit.
async function decideDeposit(req: Request, res: Response, next: NextFunction) {
  try {
    const deciderId = req.auth!.userId;
    const { id } = req.params as { id: string };
    const body = req.body as z.infer<typeof decideSchema>;
    const deposit = await prisma.walletTransferDeposit.findUnique({ where: { id } });
    if (!deposit) throw new ApiError(404, "DEPOSIT_NOT_FOUND", "This deposit does not exist.");
    if (deposit.status !== "pending") {
      throw new ApiError(409, "DEPOSIT_ALREADY_DECIDED", "This deposit has already been decided.");
    }

    const now = new Date();
    const approved = body.action === "approve";
    await prisma.$transaction(
      async (tx) => {
        const flipped = await tx.walletTransferDeposit.updateMany({
          where: { id, status: "pending" },
          data: {
            status: approved ? "approved" : "rejected",
            jetonsGranted: approved ? body.jetons : null,
            decidedBy: deciderId,
            decidedAt: now,
            decisionNote: body.decisionNote ?? null,
          },
        });
        if (flipped.count !== 1) {
          throw new ApiError(409, "DEPOSIT_ALREADY_DECIDED", "This deposit has already been decided.");
        }
        if (approved && body.jetons) {
          await postWalletEntry(tx, { userId: deposit.userId, reason: "topup_transfer", refId: id, delta: body.jetons });
        }
      },
      { maxWait: 10000, timeout: 20000 }
    );

    await createNotificationBestEffort({
      userId: deposit.userId,
      category: "prix",
      title: approved ? "Versement validé" : "Versement refusé",
      body: approved
        ? `Votre reçu a été validé : ${body.jetons} jetons ont été ajoutés à votre portefeuille.`
        : `Votre reçu de versement a été refusé.${body.decisionNote ? ` Motif : ${body.decisionNote}` : ""}`,
    });
    const updated = await prisma.walletTransferDeposit.findUnique({ where: { id } });
    res.json({ deposit: updated && { id: updated.id, status: updated.status, jetonsGranted: updated.jetonsGranted } });
  } catch (err) {
    next(err);
  }
}

const issueCodesSchema = z.object({
  jetons: z.number().int().min(1).max(100_000),
  count: z.number().int().min(1).max(50).default(1),
  expiresAt: z.string().datetime().optional(),
});

// POST /api/wallet/admin/recharge-codes — issue 1..50 opaque single-use codes.
async function issueRechargeCodes(req: Request, res: Response, next: NextFunction) {
  try {
    const issuerId = req.auth!.userId;
    const body = req.body as z.infer<typeof issueCodesSchema>;
    const data = Array.from({ length: body.count }, () => ({
      code: `HJ-${randomBytes(8).toString("hex").toUpperCase()}`,
      jetons: body.jetons,
      issuedBy: issuerId,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    }));
    await prisma.rechargeCode.createMany({ data });
    const created = await prisma.rechargeCode.findMany({
      where: { code: { in: data.map((d) => d.code) } },
      orderBy: { createdAt: "asc" },
    });
    res.status(201).json({
      codes: created.map((row) => ({ id: row.id, code: row.code, jetons: row.jetons, status: row.status, expiresAt: row.expiresAt })),
    });
  } catch (err) {
    next(err);
  }
}

const listCodesQuery = paginationQuery.extend({
  status: z.enum(["active", "redeemed", "revoked"]).optional(),
});

async function listRechargeCodes(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, status } = req.query as unknown as z.infer<typeof listCodesQuery>;
    const where = status ? { status } : {};
    const total = await prisma.rechargeCode.count({ where });
    const rows = await prisma.rechargeCode.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        issuer: { select: { fullName: true } },
        redeemer: { select: { fullName: true, email: true } },
      },
    });
    res.json({
      codes: rows.map((row) => ({
        id: row.id,
        code: row.code,
        jetons: row.jetons,
        status: row.status,
        issuedBy: row.issuer.fullName,
        issuedAt: row.createdAt,
        expiresAt: row.expiresAt,
        redeemedBy: row.redeemer?.fullName ?? null,
        redeemedByEmail: row.redeemer?.email ?? null,
        redeemedAt: row.redeemedAt,
      })),
      pagination: { page, limit, total },
    });
  } catch (err) {
    next(err);
  }
}

async function revokeRechargeCode(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as { id: string };
    const revoked = await prisma.rechargeCode.updateMany({ where: { id, status: "active" }, data: { status: "revoked" } });
    if (revoked.count !== 1) {
      const current = await prisma.rechargeCode.findUnique({ where: { id }, select: { status: true } });
      if (!current) throw new ApiError(404, "RECHARGE_CODE_NOT_FOUND", "This code does not exist.");
      throw new ApiError(409, "RECHARGE_CODE_NOT_ACTIVE", `This code is already ${current.status}.`);
    }
    res.json({ code: { id, status: "revoked" } });
  } catch (err) {
    next(err);
  }
}

const packUpdateSchema = z
  .object({
    label: z.string().min(1).max(60),
    jetons: z.number().int().min(1).max(100_000),
    bonusJetons: z.number().int().min(0).max(100_000),
    priceDzd: z.number().int().min(50).max(10_000_000),
    badge: z.enum(["recommended", "best_value"]).nullable(),
    sortOrder: z.number().int().min(0).max(1000),
    isActive: z.boolean(),
  })
  .partial();

async function listAdminPacks(_req: Request, res: Response, next: NextFunction) {
  try {
    const packs = await prisma.jetonPack.findMany({ orderBy: { sortOrder: "asc" } });
    res.json({ packs: packs.map(serializePack) });
  } catch (err) {
    next(err);
  }
}

async function updatePack(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as { id: string };
    const existing = await prisma.jetonPack.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "PACK_NOT_FOUND", "This pack does not exist.");
    const pack = await prisma.jetonPack.update({ where: { id }, data: req.body as z.infer<typeof packUpdateSchema> });
    res.json({ pack: serializePack(pack) });
  } catch (err) {
    next(err);
  }
}

router.use("/admin", requireStaff);
router.get("/admin/transfer-deposits", validateQuery(adminDepositsQuery), listAdminDeposits);
router.get("/admin/transfer-deposits/:id/receipt", validateParams(uuidParam("id")), getDepositReceipt);
router.post("/admin/transfer-deposits/:id/decide", validateParams(uuidParam("id")), validateBody(decideSchema), decideDeposit);
router.post("/admin/recharge-codes", validateBody(issueCodesSchema), issueRechargeCodes);
router.get("/admin/recharge-codes", validateQuery(listCodesQuery), listRechargeCodes);
router.post("/admin/recharge-codes/:id/revoke", validateParams(uuidParam("id")), revokeRechargeCode);
router.get("/admin/packs", listAdminPacks);
router.patch("/admin/packs/:id", requireAdmin, validateParams(uuidParam("id")), validateBody(packUpdateSchema), updatePack);

export default router;
