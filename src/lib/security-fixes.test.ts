import test from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { resolveAiCreditAllowances } from "./ai/credits";

test("resolveAiCreditAllowances filters active non-expired subscriptions ordered by currentPeriodEnd desc", async () => {
  let capturedArgs: Record<string, unknown> | null = null;
  const fakePrisma = {
    subscription: {
      findFirst: async (args: Record<string, unknown>) => {
        capturedArgs = args;
        return null;
      },
    },
    plan: {
      findFirst: async () => ({ features: { aiCredits: { dailyAllowance: 5, monthlyAllowance: 150 } } }),
    },
    user: {
      findUnique: async () => ({ aiDailyAllowanceOverride: null }),
    },
  } as unknown as PrismaClient;

  const allowances = await resolveAiCreditAllowances(fakePrisma, "user-123");
  assert.deepEqual(allowances, { dailyAllowance: 5, monthlyAllowance: 150 });
  assert.ok(capturedArgs);
  const where = (capturedArgs as { where: Record<string, unknown> }).where;
  assert.equal(where.userId, "user-123");
  assert.equal(where.status, "active");
  assert.ok(where.currentPeriodEnd && typeof (where.currentPeriodEnd as { gt?: unknown }).gt === "object");
  assert.deepEqual((capturedArgs as { orderBy: unknown }).orderBy, { currentPeriodEnd: "desc" });
});

test("resolveAiCreditAllowances applies aiDailyAllowanceOverride and scales monthly allowance", async () => {
  const fakePrisma = {
    subscription: { findFirst: async () => null },
    plan: {
      findFirst: async () => ({ features: { aiCredits: { dailyAllowance: 5, monthlyAllowance: 150 } } }),
    },
    user: {
      findUnique: async () => ({ aiDailyAllowanceOverride: 50 }),
    },
  } as unknown as PrismaClient;

  const allowances = await resolveAiCreditAllowances(fakePrisma, "user-override");
  assert.deepEqual(allowances, { dailyAllowance: 50, monthlyAllowance: 1500 });
});
