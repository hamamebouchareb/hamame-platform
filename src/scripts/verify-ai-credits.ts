import "dotenv/config";
import { AddressInfo } from "node:net";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../app";
import { ensureAiCreditBalance, nextUtcMidnight } from "../lib/ai/credits";

// Light verification for GET /api/ai/credits — lazy bootstrap for a never-used student,
// and accurate remaining for a student with usedToday > 0. Manual-only.

const prisma = new PrismaClient();
const PASSWORD = "VerifyCredits!2026";

let passCount = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    passCount += 1;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function registerOrLogin(baseUrl: string, email: string, fullName: string) {
  const reg = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, fullName }),
  });
  if (reg.status === 201) {
    const body = (await reg.json()) as { accessToken: string; user: { id: string } };
    return { token: body.accessToken, userId: body.user.id };
  }
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = (await login.json()) as { accessToken: string; user: { id: string } };
  return { token: body.accessToken, userId: body.user.id };
}

async function getCredits(baseUrl: string, token: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}/api/ai/credits`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.json() };
}

async function main() {
  const app = createApp();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  console.log(`AI credits verification on ${baseUrl}`);

  try {
    console.log("\n=== Never-used student (lazy bootstrap) ===");
    const fresh = await registerOrLogin(baseUrl, "verify-credits-fresh@verify.hamame.dz", "Credits Fresh");
    await prisma.aiCreditBalance.deleteMany({ where: { userId: fresh.userId } });

    const before = await prisma.aiCreditBalance.findUnique({ where: { userId: fresh.userId } });
    check("no balance row before first GET", before === null);

    const freshResult = await getCredits(baseUrl, fresh.token);
    console.log("  body:", JSON.stringify(freshResult.body));
    check("returns 200", freshResult.status === 200, String(freshResult.status));
    check("dailyAllowance is the free-tier default (5)", freshResult.body.dailyAllowance === 5, String(freshResult.body.dailyAllowance));
    check("usedToday is 0", freshResult.body.usedToday === 0);
    check("remainingToday equals dailyAllowance", freshResult.body.remainingToday === freshResult.body.dailyAllowance);
    check("resetAt is an ISO string", typeof freshResult.body.resetAt === "string" && !Number.isNaN(Date.parse(freshResult.body.resetAt)), freshResult.body.resetAt);

    const after = await prisma.aiCreditBalance.findUnique({ where: { userId: fresh.userId } });
    check("lazy bootstrap created the balance row", after !== null);

    // A second GET must not consume anything (read-only).
    const second = await getCredits(baseUrl, fresh.token);
    check("second GET leaves usedToday at 0", second.body.usedToday === 0 && second.body.remainingToday === 5);

    console.log("\n=== Student with credits already used ===");
    const used = await registerOrLogin(baseUrl, "verify-credits-used@verify.hamame.dz", "Credits Used");
    await ensureAiCreditBalance(prisma, used.userId, { dailyAllowance: 5, monthlyAllowance: 150 });
    await prisma.aiCreditBalance.update({
      where: { userId: used.userId },
      data: { usedToday: 2, dailyAllowance: 5, resetAt: nextUtcMidnight(new Date()) },
    });

    const usedResult = await getCredits(baseUrl, used.token);
    console.log("  body:", JSON.stringify(usedResult.body));
    check("returns 200", usedResult.status === 200, String(usedResult.status));
    check("usedToday is 2", usedResult.body.usedToday === 2);
    check("remainingToday is 3", usedResult.body.remainingToday === 3);
    check("dailyAllowance is 5", usedResult.body.dailyAllowance === 5);

    // Confirm GET did not decrement further.
    const usedAfter = await prisma.aiCreditBalance.findUnique({ where: { userId: used.userId } });
    check("GET did not consume a credit", usedAfter?.usedToday === 2, String(usedAfter?.usedToday));
  } finally {
    server.close();
    await prisma.$disconnect();
  }

  console.log(`\n${passCount} passed, ${failures.length} failed`);
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
