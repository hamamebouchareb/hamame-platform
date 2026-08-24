import "dotenv/config";
import { AddressInfo } from "node:net";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../app";

// Light verification for GET /api/progress/readiness — insufficient-data path + a
// real score for an account with enough attempt history. Manual-only.

const prisma = new PrismaClient();
const YEAR_1_ID = "00000000-0000-0000-0000-000000000020";
const UNIT_ID = "00000000-0000-0000-0000-000000000040";
const PASSWORD = "VerifyReady!2026";

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

async function getReadiness(baseUrl: string, token: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}/api/progress/readiness`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.json() };
}

async function main() {
  const app = createApp();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  console.log(`Readiness verification on ${baseUrl}`);

  try {
    // --- insufficient-data student (fresh account, zero attempts) ---
    console.log("\n=== Insufficient data (< 5 gradable attempts) ===");
    const empty = await registerOrLogin(baseUrl, "verify-ready-empty@verify.hamame.dz", "Ready Empty");
    await prisma.user.update({ where: { id: empty.userId }, data: { yearId: YEAR_1_ID } });

    const emptyResult = await getReadiness(baseUrl, empty.token);
    check("returns 200", emptyResult.status === 200, String(emptyResult.status));
    check("insufficientData is true", emptyResult.body.insufficientData === true, JSON.stringify(emptyResult.body));
    check("score is null", emptyResult.body.score === null);
    check("label is null", emptyResult.body.label === null);
    check("recentAccuracy is null", emptyResult.body.components?.recentAccuracy === null);
    check("gradableAttemptCount < 5", emptyResult.body.gradableAttemptCount < 5, String(emptyResult.body.gradableAttemptCount));

    // --- student with enough history ---
    console.log("\n=== Sensible score with attempt history ===");
    const ready = await registerOrLogin(baseUrl, "verify-ready-full@verify.hamame.dz", "Ready Full");
    await prisma.user.update({ where: { id: ready.userId }, data: { yearId: YEAR_1_ID } });

    // Wipe prior harness sessions so this run is deterministic, then create 5 completed
    // practice sessions (seed bank has approved QCM/QCS questions in the cardiac unit).
    await prisma.attempt.deleteMany({ where: { sessionQuestion: { session: { userId: ready.userId } } } });
    await prisma.sessionQuestion.deleteMany({ where: { session: { userId: ready.userId } } });
    await prisma.studySession.deleteMany({ where: { userId: ready.userId } });
    await prisma.progress.deleteMany({ where: { userId: ready.userId } });
    await prisma.streak.deleteMany({ where: { userId: ready.userId } });

    for (let i = 0; i < 5; i += 1) {
      const create = await fetch(`${baseUrl}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${ready.token}` },
        body: JSON.stringify({
          name: `verify-ready ${i}`,
          mode: "practice",
          unitIds: [UNIT_ID],
          questionTypes: ["QCM", "QCS"],
          size: 2,
        }),
      });
      if (!create.ok) {
        throw new Error(`session create failed: ${create.status} ${await create.text()}`);
      }
      const created = (await create.json()) as {
        session: { id: string; questions: { question: { id: string }; options: { id: string }[] }[] };
      };

      for (const sq of created.session.questions) {
        const optionId = sq.options[0]?.id;
        if (!optionId) continue;
        await fetch(`${baseUrl}/api/sessions/${created.session.id}/answers`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${ready.token}` },
          body: JSON.stringify({ questionId: sq.question.id, selectedOptionIds: [optionId] }),
        });
      }

      const submit = await fetch(`${baseUrl}/api/sessions/${created.session.id}/submit`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ready.token}` },
      });
      if (!submit.ok) {
        throw new Error(`session submit failed: ${submit.status} ${await submit.text()}`);
      }
    }

    // Mark the seeded intro lesson as viewed so coverage is > 0.
    await prisma.progress.upsert({
      where: {
        userId_lessonId: { userId: ready.userId, lessonId: "00000000-0000-0000-0000-000000000050" },
      },
      create: {
        userId: ready.userId,
        lessonId: "00000000-0000-0000-0000-000000000050",
        percentage: 100,
        lastStudiedAt: new Date(),
      },
      update: { percentage: 100, lastStudiedAt: new Date() },
    });

    const fullResult = await getReadiness(baseUrl, ready.token);
    console.log("  body:", JSON.stringify(fullResult.body));
    check("returns 200", fullResult.status === 200, String(fullResult.status));
    check("insufficientData is false", fullResult.body.insufficientData === false);
    check("score is a number 0–100", typeof fullResult.body.score === "number" && fullResult.body.score >= 0 && fullResult.body.score <= 100, String(fullResult.body.score));
    check(
      "label is one of the three bands",
      ["Needs work", "On track", "Exam ready"].includes(fullResult.body.label),
      String(fullResult.body.label)
    );
    check("recentAccuracy is a number", typeof fullResult.body.components?.recentAccuracy === "number", String(fullResult.body.components?.recentAccuracy));
    check("curriculumCoverage is a number", typeof fullResult.body.components?.curriculumCoverage === "number", String(fullResult.body.components?.curriculumCoverage));
    check("consistency is a number", typeof fullResult.body.components?.consistency === "number", String(fullResult.body.components?.consistency));
    check("gradableAttemptCount >= 5", fullResult.body.gradableAttemptCount >= 5, String(fullResult.body.gradableAttemptCount));

    const { recentAccuracy, curriculumCoverage, consistency } = fullResult.body.components;
    const expected = Math.round(0.5 * recentAccuracy + 0.3 * curriculumCoverage + 0.2 * consistency);
    check("score matches confirmed formula", fullResult.body.score === expected, `got ${fullResult.body.score}, expected ${expected}`);
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
