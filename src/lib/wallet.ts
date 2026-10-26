// Jetons wallet engine (medspark.online Sparx-wallet parity).
//
// Same invariants as src/lib/points.ts, which this deliberately mirrors:
// 1. wallet_ledger is the source of truth; wallet_accounts.balance must equal
//    SUM(delta) and is stored only as a read-path optimization.
// 2. Idempotency lives on the (userId, reason, refId) unique key, claimed with
//    a raw INSERT ... ON CONFLICT DO NOTHING that never raises, so a replayed
//    credit (webhook + confirm poll racing, a double-clicked approve) is a
//    no-op instead of a double credit or an aborted transaction.
// 3. Concurrent movements serialize on the wallet_accounts row (FOR UPDATE).
//
// Every call belongs inside a Prisma transaction.
import { PrismaClient, Prisma } from "@prisma/client";
type TransactionClient = Prisma.TransactionClient | PrismaClient;

// medspark.online prices, observed live 2026-10-25: 1 Sparx = 10 DA, custom
// top-ups between 10 and 2000 units.
export const DZD_PER_JETON = 10;
export const CUSTOM_MIN_JETONS = 10;
export const CUSTOM_MAX_JETONS = 2000;

export const WALLET_REASONS = [
  "topup_online",
  "topup_transfer",
  "topup_code",
  "resource_purchase",
  "admin_adjust",
] as const;
export type WalletReason = (typeof WALLET_REASONS)[number];

export async function lockWalletRow(
  tx: TransactionClient,
  userId: string
): Promise<{ balance: number }> {
  await tx.$executeRaw`INSERT INTO "wallet_accounts" ("user_id", "balance", "purchased_total", "spent_total", "updated_at") VALUES (${userId}::uuid, 0, 0, 0, NOW()) ON CONFLICT ("user_id") DO NOTHING`;
  const rows = await tx.$queryRaw<Array<{ balance: number }>>`SELECT "balance" FROM "wallet_accounts" WHERE "user_id" = ${userId}::uuid FOR UPDATE`;
  const row = rows[0];
  if (!row) throw new Error(`wallet account row vanished for ${userId}`);
  return { balance: row.balance };
}

export type WalletPostResult = { status: "posted" | "skipped"; balance: number };

export async function postWalletEntry(
  tx: TransactionClient,
  args: { userId: string; reason: WalletReason; refId: string; delta: number }
): Promise<WalletPostResult> {
  const { userId, reason, refId, delta } = args;
  if (!Number.isInteger(delta) || delta === 0) throw new Error("postWalletEntry: delta must be a non-zero integer");
  if (!refId) throw new Error("postWalletEntry: refId is mandatory (it keys the unique idempotency index)");
  const account = await lockWalletRow(tx, userId);
  const balanceAfter = account.balance + delta;
  if (balanceAfter < 0) throw new Error("postWalletEntry: balance would go negative");
  const inserted = await tx.$executeRaw`
    INSERT INTO "wallet_ledger" ("id", "user_id", "delta", "reason", "ref_id", "balance_after")
    VALUES (gen_random_uuid(), ${userId}::uuid, ${delta}::int, ${reason}, ${refId}, ${balanceAfter}::int)
    ON CONFLICT ("user_id", "reason", "ref_id") DO NOTHING`;
  if (inserted === 0) {
    return { status: "skipped", balance: account.balance };
  }
  await tx.walletAccount.update({
    where: { userId },
    data: {
      balance: balanceAfter,
      ...(delta > 0 && reason !== "admin_adjust" ? { purchasedTotal: { increment: delta } } : {}),
      ...(delta < 0 ? { spentTotal: { increment: -delta } } : {}),
    },
  });
  return { status: "posted", balance: balanceAfter };
}
