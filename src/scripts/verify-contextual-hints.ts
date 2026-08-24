import "dotenv/config";
import { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../app";
import {
  HintPromptView,
  buildHintPrompt,
  detectHintLeaks,
  loadHintPersonalization,
  loadHintQuestion,
  toHintPromptView,
} from "../lib/ai/contextual-hint";
import {
  FALLBACK_AI_CREDITS,
  ensureAiCreditBalance,
  nextUtcMidnight,
  parseAiCreditAllowances,
  refundAiCredit,
  reserveAiCredit,
  resolveAiCreditAllowances,
} from "../lib/ai/credits";

// Verification harness for contextual hints (FR-29 / BR-6). Manual-only, imported by
// nothing, same placement rationale as backfill-mcq-explanations.ts (under src/ so
// `npm run build` typechecks it).
//
// Two phases, deliberately run as SEPARATE PROCESSES:
//   offline — every check that needs no model call. Ends by pointing the SDK at an
//             invalid key to prove a failed generation refunds the credit. That poisons
//             the module-level cached Anthropic client, which is exactly why the real-AI
//             checks cannot share this process.
//   ai      — real Haiku 4.5 generations: hint text for several real questions, the leak
//             screen against actual output, and the weak-vs-strong personalization
//             contrast. Requires ANTHROPIC_API_KEY and spends a few tenths of a cent.
//
// Usage: npm run verify:hints        (offline)
//        npm run verify:hints:ai     (real generations)

const prisma = new PrismaClient();

const PHASE = process.argv.includes("--ai") ? "ai" : "offline";

// Seeded curriculum (prisma/seed.ts).
const CARDIAC_PHYSIOLOGY_UNIT_ID = "00000000-0000-0000-0000-000000000040";
const SEED_QCM_QUESTION_ID = "00000000-0000-0000-0000-000000000070";
const SEED_QCS_QUESTION_ID = "00000000-0000-0000-0000-000000000080";
const SEED_QROC_QUESTION_ID = "00000000-0000-0000-0000-000000000090";
const PREMIUM_PLAN_ID = "00000000-0000-0000-0000-000000000110";

// Harness-owned question fixtures, in their own id namespace so they can never be
// confused with seeded content. Upserted idempotently; realistic French wording because
// the point of the AI phase is to judge hint quality on content like the real bank's.
const FIXTURES = [
  {
    id: "ffffffff-0000-0000-0000-0000000000a1",
    type: "QCS",
    difficulty: "medium",
    body: "Chez un sujet sain au repos, quelle est la principale déterminante de la précharge ventriculaire gauche ?",
    explanation: "La précharge dépend du volume télédiastolique, lui-même déterminé par le retour veineux.",
    options: [
      { text: "Le retour veineux systémique", isCorrect: true },
      { text: "La pression artérielle diastolique", isCorrect: false },
      { text: "La fréquence cardiaque maximale théorique", isCorrect: false },
      { text: "L'épaisseur pariétale du ventricule droit", isCorrect: false },
    ],
  },
  {
    id: "ffffffff-0000-0000-0000-0000000000a2",
    type: "QCM",
    difficulty: "hard",
    body: "Concernant le potentiel d'action des cellules du nœud sinusal, quelles propositions sont exactes ?",
    explanation:
      "Les cellules nodales ont une dépolarisation diastolique lente liée au courant If et un potentiel de repos instable.",
    options: [
      { text: "Il existe une dépolarisation diastolique lente spontanée", isCorrect: true },
      { text: "Le courant entrant If participe à l'automatisme", isCorrect: true },
      { text: "La phase de plateau dépend surtout des canaux sodiques rapides", isCorrect: false },
      { text: "Le potentiel de membrane de repos est stable à -90 mV", isCorrect: false },
    ],
  },
  {
    id: "ffffffff-0000-0000-0000-0000000000a3",
    type: "QCS",
    difficulty: "easy",
    body: "Un patient présente un souffle systolique maximal au foyer mitral, irradiant vers l'aisselle. Quel diagnostic évoquez-vous en premier ?",
    explanation: "Un souffle systolique irradiant vers l'aisselle au foyer mitral évoque une insuffisance mitrale.",
    options: [
      { text: "Insuffisance mitrale", isCorrect: true },
      { text: "Rétrécissement aortique", isCorrect: false },
      { text: "Insuffisance aortique", isCorrect: false },
      { text: "Rétrécissement mitral", isCorrect: false },
    ],
  },
  {
    id: "ffffffff-0000-0000-0000-0000000000a4",
    type: "QCM",
    difficulty: "medium",
    body: "Quelles anomalies électrocardiographiques évoquent une hyperkaliémie sévère ?",
    explanation: "L'hyperkaliémie donne des ondes T amples et pointues, puis un élargissement du QRS.",
    options: [
      { text: "Ondes T amples et pointues", isCorrect: true },
      { text: "Élargissement progressif du QRS", isCorrect: true },
      { text: "Allongement isolé de l'intervalle QT", isCorrect: false },
      { text: "Apparition d'ondes U proéminentes", isCorrect: false },
    ],
  },
] as const;

const STUDENTS = {
  free: { email: "hint-free@verify.hamame.dz", fullName: "Hint Free Tier" },
  weak: { email: "hint-weak@verify.hamame.dz", fullName: "Hint Weak History" },
  strong: { email: "hint-strong@verify.hamame.dz", fullName: "Hint Strong History" },
} as const;

const PASSWORD = "VerifyHints!2026";

let passCount = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = ""): boolean {
  if (ok) {
    passCount += 1;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
  return ok;
}

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let baseUrl = "";

interface Student {
  userId: string;
  token: string;
}

async function registerOrLogin(email: string, fullName: string): Promise<Student> {
  const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, fullName }),
  });

  if (registerResponse.status === 201) {
    const body = (await registerResponse.json()) as { accessToken: string; user: { id: string } };
    return { userId: body.user.id, token: body.accessToken };
  }

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!loginResponse.ok) {
    throw new Error(`Could not register or log in ${email}: ${loginResponse.status} ${await loginResponse.text()}`);
  }
  const body = (await loginResponse.json()) as { accessToken: string; user: { id: string } };
  return { userId: body.user.id, token: body.accessToken };
}

async function upsertFixtureQuestions(authorId: string): Promise<void> {
  for (const fixture of FIXTURES) {
    await prisma.question.upsert({
      where: { id: fixture.id },
      update: { status: "approved" },
      create: {
        id: fixture.id,
        unitId: CARDIAC_PHYSIOLOGY_UNIT_ID,
        type: fixture.type,
        source: "hamame_authored",
        status: "approved",
        difficulty: fixture.difficulty,
        bodyRichtext: { text: fixture.body },
        explanationRichtext: { text: fixture.explanation },
        authoredBy: authorId,
      },
    });

    const existingOptions = await prisma.questionOption.count({ where: { questionId: fixture.id } });
    if (existingOptions === 0) {
      await prisma.questionOption.createMany({
        data: fixture.options.map((option, index) => ({
          questionId: fixture.id,
          bodyText: option.text,
          isCorrect: option.isCorrect,
          orderIndex: index,
        })),
      });
    }
  }
}

// Gives a student a graded history on the cardiology module so the personalization band is
// deterministic. Deliberately avoids the target question so missedThisQuestionBefore stays
// false for both students — that isolates the accuracy band as the only difference.
async function seedModuleHistory(userId: string, correctRatio: number, excludeQuestionId: string): Promise<void> {
  const questionIds = [SEED_QCM_QUESTION_ID, SEED_QCS_QUESTION_ID, ...FIXTURES.map((fixture) => fixture.id)].filter(
    (id) => id !== excludeQuestionId
  );

  await prisma.attempt.deleteMany({ where: { sessionQuestion: { session: { userId } } } });
  await prisma.studySession.deleteMany({ where: { userId, name: "verify-hints history" } });

  const session = await prisma.studySession.create({
    data: {
      userId,
      name: "verify-hints history",
      mode: "practice",
      startedAt: new Date(Date.now() - 86_400_000),
      completedAt: new Date(Date.now() - 86_000_000),
    },
  });

  for (const [index, questionId] of questionIds.entries()) {
    const sessionQuestion = await prisma.sessionQuestion.create({
      data: { sessionId: session.id, questionId, presentedOrder: index },
    });
    await prisma.attempt.create({
      data: {
        sessionQuestionId: sessionQuestion.id,
        isCorrect: index / questionIds.length < correctRatio,
        answeredAt: new Date(Date.now() - 86_100_000 + index * 1000),
      },
    });
  }
}

async function grantPremiumSubscription(userId: string): Promise<void> {
  const existing = await prisma.subscription.findFirst({ where: { userId, status: "active" } });
  if (existing) {
    return;
  }
  const periodEnd = new Date();
  periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  await prisma.subscription.create({
    data: { userId, planId: PREMIUM_PLAN_ID, status: "active", startedAt: new Date(), currentPeriodEnd: periodEnd },
  });
}

async function createSession(token: string, mode: "practice" | "exam"): Promise<string> {
  const response = await fetch(`${baseUrl}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: `verify-hints ${mode} ${randomUUID().slice(0, 8)}`,
      mode,
      unitIds: [CARDIAC_PHYSIOLOGY_UNIT_ID],
      size: 50,
    }),
  });
  if (!response.ok) {
    throw new Error(`Session creation failed: ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { session: { id: string } };
  return body.session.id;
}

interface HintResponse {
  status: number;
  body: {
    hint?: { text: string; personalized: boolean; creditsRemainingToday: number; dailyAllowance: number };
    error?: { code: string; message: string };
  };
}

async function requestHint(token: string, sessionId: string, questionId: string): Promise<HintResponse> {
  const response = await fetch(`${baseUrl}/api/sessions/${sessionId}/hints`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ questionId }),
  });
  return { status: response.status, body: (await response.json()) as HintResponse["body"] };
}

async function usedToday(userId: string): Promise<number> {
  const balance = await prisma.aiCreditBalance.findUnique({ where: { userId } });
  return balance?.usedToday ?? -1;
}

// ---------------------------------------------------------------------------
// Offline phase
// ---------------------------------------------------------------------------

function optionsOf(question: { options: { bodyText: string; isCorrect: boolean }[] }) {
  return question.options.map((option) => ({ bodyText: option.bodyText, isCorrect: option.isCorrect }));
}

async function runLeakDetectorChecks(): Promise<void> {
  section("Leak detector (synthetic text, no API calls)");

  const question = await loadHintQuestion(prisma, FIXTURES[2].id);
  if (!question) {
    check("fixture question loads", false, FIXTURES[2].id);
    return;
  }
  const options = optionsOf(question);

  const cases: { name: string; hint: string; expectLeak: boolean }[] = [
    {
      name: "safe conceptual hint passes",
      hint: "Repensez au moment du cycle cardiaque où le souffle survient, puis demandez-vous quelle valve est sollicitée à ce moment précis et dans quelle direction le sang peut fuir.",
      expectLeak: false,
    },
    {
      name: "verbatim correct-option wording is caught",
      hint: "Pensez à une insuffisance mitrale devant ce type de souffle.",
      expectLeak: true,
    },
    { name: "French reveal phrase is caught", hint: "La bonne réponse concerne la valve mitrale.", expectLeak: true },
    { name: "English reveal phrase is caught", hint: "The correct answer here is the mitral valve.", expectLeak: true },
    { name: "option letter assertion is caught", hint: "Option B is the one you want here.", expectLeak: true },
    { name: "imperative pick is caught", hint: "Choose A and move on to the next question.", expectLeak: true },
    { name: "elimination instruction is caught", hint: "Éliminez les propositions portant sur l'aorte.", expectLeak: true },
    {
      name: "answer-is phrasing is caught",
      hint: "Think about systole; the answer is the valve that leaks backwards.",
      expectLeak: true,
    },
  ];

  for (const testCase of cases) {
    const findings = detectHintLeaks({ hintText: testCase.hint, options });
    check(
      testCase.name,
      testCase.expectLeak ? findings.length > 0 : findings.length === 0,
      findings.map((finding) => `${finding.kind}: ${finding.detail}`).join(" | ") || "no findings"
    );
  }

  // Asymmetry: wording shared by a correct AND an incorrect option is shared vocabulary,
  // not a disclosure. "rétrécissement mitral" (incorrect) vs "insuffisance mitrale"
  // (correct) both contain "mitral", but a long phrase present in both must not trip.
  const sharedVocabQuestion = {
    options: [
      { bodyText: "Bloc auriculo-ventriculaire de haut degré", isCorrect: true },
      { bodyText: "Bloc auriculo-ventriculaire de premier degré", isCorrect: false },
    ],
  };
  check(
    "phrase shared by correct AND incorrect option does not trip",
    detectHintLeaks({
      hintText: "Concentrez-vous sur le bloc auriculo-ventriculaire et sur le degré de conduction restant.",
      options: sharedVocabQuestion.options,
    }).length === 0
  );
}

async function runPromptWithholdingChecks(): Promise<void> {
  section("Prompt withholding (the answer never enters the prompt)");

  for (const fixture of FIXTURES) {
    const question = await loadHintQuestion(prisma, fixture.id);
    if (!question) {
      check(`fixture ${fixture.id} loads`, false);
      continue;
    }

    const view: HintPromptView = toHintPromptView(question, {
      band: "weak",
      moduleAttemptCount: 10,
      moduleAccuracyPercent: 30,
      missedThisQuestionBefore: true,
    });
    const prompt = buildHintPrompt(view);
    const lowered = prompt.toLowerCase();

    const optionKeys = new Set(view.options.flatMap((option) => Object.keys(option)));
    check(
      `prompt for ${fixture.type} ${fixture.id.slice(-4)} carries only label+text per option`,
      [...optionKeys].sort().join(",") === "label,text",
      [...optionKeys].join(",")
    );
    check(
      `prompt for ${fixture.id.slice(-4)} contains no correctness field`,
      !lowered.includes("iscorrect") && !lowered.includes("correct_option") && !lowered.includes("answerkey"),
      "no isCorrect / answer-key keys"
    );
    check(
      `prompt for ${fixture.id.slice(-4)} omits the human explanation (it names the answer)`,
      !prompt.includes(fixture.explanation)
    );
  }
}

async function runAllowanceChecks(freeUserId: string, premiumUserId: string): Promise<void> {
  section("Allowance resolution from plans.features (BR-6, admin-configurable)");

  const freePlan = await prisma.plan.findFirst({ where: { name: "free", isActive: true } });
  const premiumPlan = await prisma.plan.findFirst({ where: { name: "premium", isActive: true } });
  const freeConfigured = parseAiCreditAllowances(freePlan?.features);
  const premiumConfigured = parseAiCreditAllowances(premiumPlan?.features);

  check("free plan features carry aiCredits.dailyAllowance = 5", freeConfigured?.dailyAllowance === 5, String(freeConfigured?.dailyAllowance));
  check("premium plan features carry aiCredits.dailyAllowance = 30", premiumConfigured?.dailyAllowance === 30, String(premiumConfigured?.dailyAllowance));

  const freeResolved = await resolveAiCreditAllowances(prisma, freeUserId);
  const premiumResolved = await resolveAiCreditAllowances(prisma, premiumUserId);
  check("no-subscription student resolves to the free plan allowance", freeResolved.dailyAllowance === 5, String(freeResolved.dailyAllowance));
  check("active premium subscriber resolves to the premium allowance", premiumResolved.dailyAllowance === 30, String(premiumResolved.dailyAllowance));

  check(
    "malformed features fall back to the conservative default, never unlimited",
    parseAiCreditAllowances({ description: "no ai config here" }) === null &&
      FALLBACK_AI_CREDITS.dailyAllowance === 5
  );
}

async function runCreditMechanicsChecks(userId: string): Promise<void> {
  section("Credit mechanics (reserve / refund / reset / concurrency)");

  await ensureAiCreditBalance(prisma, userId, { dailyAllowance: 5, monthlyAllowance: 150 });
  await prisma.aiCreditBalance.update({
    where: { userId },
    data: { usedToday: 0, usedThisMonth: 0, resetAt: nextUtcMidnight(new Date()) },
  });

  const first = await reserveAiCredit(prisma, userId);
  check("reserve succeeds and reports remaining", first.reserved && first.remainingToday === 4, `remaining=${first.remainingToday}`);
  check("reserve incremented used_today to 1", (await usedToday(userId)) === 1);

  await refundAiCredit(prisma, userId, first);
  check("refund returns the credit", (await usedToday(userId)) === 0);

  await refundAiCredit(prisma, userId, first);
  check("second refund cannot manufacture credits (floored at 0)", (await usedToday(userId)) === 0);

  const staleReservation = { ...first, resetAt: new Date(first.resetAt.getTime() - 86_400_000) };
  await reserveAiCredit(prisma, userId);
  await refundAiCredit(prisma, userId, staleReservation);
  check("refund with a stale reset boundary is dropped (cannot cross a day)", (await usedToday(userId)) === 1);

  // Drain to the cap.
  for (let i = 0; i < 4; i += 1) {
    await reserveAiCredit(prisma, userId);
  }
  check("used_today reached the free-tier cap of 5", (await usedToday(userId)) === 5);
  const overLimit = await reserveAiCredit(prisma, userId);
  check("reserve past the cap is refused without incrementing", !overLimit.reserved && (await usedToday(userId)) === 5);

  // Daily reset: backdate the boundary and confirm the next reserve starts a fresh day.
  await prisma.aiCreditBalance.update({
    where: { userId },
    data: { resetAt: new Date(Date.now() - 3_600_000) },
  });
  const afterReset = await reserveAiCredit(prisma, userId);
  const balanceAfterReset = await prisma.aiCreditBalance.findUnique({ where: { userId } });
  check("backdated reset_at clears used_today on the next reserve", afterReset.reserved && balanceAfterReset?.usedToday === 1, `usedToday=${balanceAfterReset?.usedToday}`);
  check(
    "reset advances reset_at to the next UTC midnight",
    !!balanceAfterReset && balanceAfterReset.resetAt.getTime() > Date.now(),
    balanceAfterReset?.resetAt.toISOString()
  );

  // Concurrency: two simultaneous requests on the LAST credit must not both win.
  await prisma.aiCreditBalance.update({ where: { userId }, data: { usedToday: 4, resetAt: nextUtcMidnight(new Date()) } });
  const [a, b] = await Promise.all([reserveAiCredit(prisma, userId), reserveAiCredit(prisma, userId)]);
  check(
    "two concurrent reserves on the last credit: exactly one wins",
    [a.reserved, b.reserved].filter(Boolean).length === 1 && (await usedToday(userId)) === 5,
    `a=${a.reserved} b=${b.reserved} usedToday=${await usedToday(userId)}`
  );
}

async function runRouteGuardChecks(students: Record<"free" | "weak" | "strong", Student>): Promise<void> {
  section("Route guards");

  const practiceSessionId = await createSession(students.free.token, "practice");
  const examSessionId = await createSession(students.free.token, "exam");

  const examResult = await requestHint(students.free.token, examSessionId, FIXTURES[0].id);
  check(
    "exam-mode session is rejected explicitly (409 HINT_NOT_ALLOWED_IN_EXAM_MODE)",
    examResult.status === 409 && examResult.body.error?.code === "HINT_NOT_ALLOWED_IN_EXAM_MODE",
    `${examResult.status} ${examResult.body.error?.code}`
  );
  check("exam-mode rejection carries a clear message", (examResult.body.error?.message ?? "").toLowerCase().includes("practice mode"), examResult.body.error?.message);

  const qrocResult = await requestHint(students.free.token, practiceSessionId, SEED_QROC_QUESTION_ID);
  check(
    "QROC question is rejected (400 HINT_UNSUPPORTED_QUESTION_TYPE)",
    qrocResult.status === 400 && qrocResult.body.error?.code === "HINT_UNSUPPORTED_QUESTION_TYPE",
    `${qrocResult.status} ${qrocResult.body.error?.code}`
  );

  const foreignQuestionId = randomUUID();
  const notInSession = await requestHint(students.free.token, practiceSessionId, foreignQuestionId);
  check(
    "question outside the session is rejected (404)",
    notInSession.status === 404 && notInSession.body.error?.code === "SESSION_QUESTION_NOT_FOUND",
    `${notInSession.status} ${notInSession.body.error?.code}`
  );

  const otherUsersSession = await requestHint(students.weak.token, practiceSessionId, FIXTURES[0].id);
  check(
    "another student's session is rejected (403)",
    otherUsersSession.status === 403 && otherUsersSession.body.error?.code === "FORBIDDEN",
    `${otherUsersSession.status} ${otherUsersSession.body.error?.code}`
  );

  const unauthenticated = await fetch(`${baseUrl}/api/sessions/${practiceSessionId}/hints`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questionId: FIXTURES[0].id }),
  });
  check("unauthenticated request is rejected (401)", unauthenticated.status === 401, String(unauthenticated.status));

  // AI_NOT_CONFIGURED must cost nothing. Env var is read per request by isAiConfigured().
  const savedKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  await prisma.aiCreditBalance.upsert({
    where: { userId: students.free.userId },
    update: { usedToday: 0, dailyAllowance: 5, resetAt: nextUtcMidnight(new Date()) },
    create: { userId: students.free.userId, dailyAllowance: 5, monthlyAllowance: 150, resetAt: nextUtcMidnight(new Date()) },
  });
  const unconfigured = await requestHint(students.free.token, practiceSessionId, FIXTURES[0].id);
  check(
    "missing API key returns 503 AI_NOT_CONFIGURED, not 500",
    unconfigured.status === 503 && unconfigured.body.error?.code === "AI_NOT_CONFIGURED",
    `${unconfigured.status} ${unconfigured.body.error?.code}`
  );
  check("no credit spent when AI is unconfigured", (await usedToday(students.free.userId)) === 0);
  if (savedKey) {
    process.env.ANTHROPIC_API_KEY = savedKey;
  }

  section("Daily limit enforcement through the route (429, not 500)");

  // Drain the free tier's 5 credits through the same atomic reserve the route uses, then
  // confirm the 6th REQUEST is refused cleanly. Draining this way rather than by making 5
  // real generations keeps the check free and independent of the model.
  await prisma.aiCreditBalance.update({
    where: { userId: students.free.userId },
    data: { usedToday: 0, dailyAllowance: 5, resetAt: nextUtcMidnight(new Date()) },
  });
  for (let i = 0; i < 5; i += 1) {
    const reservation = await reserveAiCredit(prisma, students.free.userId);
    if (!reservation.reserved) {
      check(`drain reserve ${i + 1}/5 succeeded`, false);
    }
  }
  process.env.ANTHROPIC_API_KEY = "sk-ant-invalid-for-verification";
  const sixth = await requestHint(students.free.token, practiceSessionId, FIXTURES[0].id);
  check(
    "6th free-tier request today returns 429 AI_CREDITS_EXHAUSTED",
    sixth.status === 429 && sixth.body.error?.code === "AI_CREDITS_EXHAUSTED",
    `${sixth.status} ${sixth.body.error?.code}`
  );
  check(
    "429 message states the limit and when it resets",
    /remaining today/i.test(sixth.body.error?.message ?? "") && /resets at/i.test(sixth.body.error?.message ?? ""),
    sixth.body.error?.message
  );
  check("exhausted request did not go over the cap", (await usedToday(students.free.userId)) === 5);

  section("Simulated API failure refunds the credit");

  // The invalid key set above makes the SDK 401 (401s are not billed). This is the last
  // route check in the offline phase on purpose: the module-level Anthropic client caches
  // this bad key for the rest of the process.
  await prisma.aiCreditBalance.update({
    where: { userId: students.free.userId },
    data: { usedToday: 2, dailyAllowance: 5, resetAt: nextUtcMidnight(new Date()) },
  });
  const before = await usedToday(students.free.userId);
  const failed = await requestHint(students.free.token, practiceSessionId, FIXTURES[0].id);
  const after = await usedToday(students.free.userId);
  check(
    "provider failure returns 502 AI_GENERATION_FAILED, not 500",
    failed.status === 502 && failed.body.error?.code === "AI_GENERATION_FAILED",
    `${failed.status} ${failed.body.error?.code}`
  );
  check("failed generation costs no credit (reserve was refunded)", before === after, `before=${before} after=${after}`);
  check(
    "failure message tells the student no credit was used",
    (failed.body.error?.message ?? "").toLowerCase().includes("no credit"),
    failed.body.error?.message
  );

  // The safety-check rejection path shares this same refund call; it is exercised
  // end-to-end in the AI phase and at the unit level by the leak-detector checks above.
}

// ---------------------------------------------------------------------------
// AI phase (real generations)
// ---------------------------------------------------------------------------

async function runRealHintChecks(students: Record<"free" | "weak" | "strong", Student>): Promise<void> {
  section("Real hint generation (Haiku 4.5) — text printed for human review");

  const sessionId = await createSession(students.strong.token, "practice");
  const questionIds = [SEED_QCM_QUESTION_ID, SEED_QCS_QUESTION_ID, ...FIXTURES.map((fixture) => fixture.id)];

  for (const questionId of questionIds) {
    const question = await loadHintQuestion(prisma, questionId);
    if (!question) {
      check(`question ${questionId} loads`, false);
      continue;
    }

    const beforeUsed = await usedToday(students.strong.userId);
    const result = await requestHint(students.strong.token, sessionId, questionId);
    const afterUsed = await usedToday(students.strong.userId);

    const body = extractRichtextForLog(question.bodyRichtext);
    const correctOptions = question.options.filter((option) => option.isCorrect).map((option) => option.bodyText);

    console.log(`\n  --- ${question.type} ${questionId}`);
    console.log(`  Q: ${body}`);
    console.log(`  Options: ${question.options.map((option, index) => `${"ABCDEFGH"[index]}) ${option.bodyText}`).join(" | ")}`);
    console.log(`  Correct (never sent to the model): ${correctOptions.join(" + ")}`);
    console.log(`  HINT: ${result.body.hint?.text ?? `<no hint — ${result.status} ${result.body.error?.code}>`}`);

    if (!check(`hint generated for ${question.type} ${questionId.slice(-4)}`, result.status === 200 && !!result.body.hint?.text, `${result.status} ${result.body.error?.code ?? ""}`)) {
      continue;
    }

    const findings = detectHintLeaks({ hintText: result.body.hint!.text, options: optionsOf(question) });
    check(`hint for ${questionId.slice(-4)} passes the leak screen`, findings.length === 0, findings.map((f) => f.detail).join("; "));
    check(
      `hint for ${questionId.slice(-4)} contains no correct option verbatim`,
      correctOptions.every((text) => !result.body.hint!.text.toLowerCase().includes(text.toLowerCase()))
    );
    check(`successful hint spent exactly 1 credit`, afterUsed === beforeUsed + 1, `before=${beforeUsed} after=${afterUsed}`);
  }
}

function extractRichtextForLog(value: unknown): string {
  if (value && typeof value === "object" && typeof (value as { text?: unknown }).text === "string") {
    return (value as { text: string }).text;
  }
  return JSON.stringify(value);
}

async function runPersonalizationContrastChecks(students: Record<"free" | "weak" | "strong", Student>): Promise<void> {
  section("Personalization contrast — same question, weak vs strong history");

  const targetQuestionId = FIXTURES[1].id;
  const question = await loadHintQuestion(prisma, targetQuestionId);
  if (!question) {
    check("contrast target question loads", false);
    return;
  }

  await seedModuleHistory(students.weak.userId, 0.2, targetQuestionId);
  await seedModuleHistory(students.strong.userId, 1, targetQuestionId);

  const weakStats = await loadHintPersonalization(prisma, students.weak.userId, question);
  const strongStats = await loadHintPersonalization(prisma, students.strong.userId, question);
  check(
    "weak student's recent module performance resolves to band 'weak'",
    weakStats.band === "weak",
    `${weakStats.moduleAccuracyPercent}% over ${weakStats.moduleAttemptCount} attempts`
  );
  check(
    "strong student's recent module performance resolves to band 'strong'",
    strongStats.band === "strong",
    `${strongStats.moduleAccuracyPercent}% over ${strongStats.moduleAttemptCount} attempts`
  );
  check(
    "prior-miss flag is equal for both, isolating the accuracy band",
    weakStats.missedThisQuestionBefore === strongStats.missedThisQuestionBefore,
    `weak=${weakStats.missedThisQuestionBefore} strong=${strongStats.missedThisQuestionBefore}`
  );

  const weakSessionId = await createSession(students.weak.token, "practice");
  const strongSessionId = await createSession(students.strong.token, "practice");
  const weakHint = await requestHint(students.weak.token, weakSessionId, targetQuestionId);
  const strongHint = await requestHint(students.strong.token, strongSessionId, targetQuestionId);

  console.log(`\n  Q: ${extractRichtextForLog(question.bodyRichtext)}`);
  console.log(`  WEAK-history student   (${weakStats.moduleAccuracyPercent}% recent): ${weakHint.body.hint?.text}`);
  console.log(`  STRONG-history student (${strongStats.moduleAccuracyPercent}% recent): ${strongHint.body.hint?.text}`);

  const weakText = weakHint.body.hint?.text ?? "";
  const strongText = strongHint.body.hint?.text ?? "";
  check("both students received a hint", weakText.length > 0 && strongText.length > 0);
  check("hint content differs between the two students", weakText !== strongText);
  check(
    "weak-history hint is not shorter than the strong-history hint (more scaffolding)",
    weakText.length >= strongText.length,
    `weak=${weakText.length} chars, strong=${strongText.length} chars`
  );
  check("both hints pass the leak screen", detectHintLeaks({ hintText: weakText, options: optionsOf(question) }).length === 0 && detectHintLeaks({ hintText: strongText, options: optionsOf(question) }).length === 0);
  check(
    "hints are flagged as personalized in the response",
    weakHint.body.hint?.personalized === true && strongHint.body.hint?.personalized === true
  );
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const app = createApp();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  console.log(`Verification phase: ${PHASE.toUpperCase()} (server on ${baseUrl})`);

  try {
    const seedAuthor = await prisma.user.findUnique({ where: { email: "seed-author@hamame.dz" } });
    if (!seedAuthor) {
      throw new Error("Seed data missing — run `npx tsx prisma/seed.ts` first.");
    }
    await upsertFixtureQuestions(seedAuthor.id);

    const students = {
      free: await registerOrLogin(STUDENTS.free.email, STUDENTS.free.fullName),
      weak: await registerOrLogin(STUDENTS.weak.email, STUDENTS.weak.fullName),
      strong: await registerOrLogin(STUDENTS.strong.email, STUDENTS.strong.fullName),
    };

    // The two AI-phase students are premium so a multi-question sweep isn't capped at 5;
    // the free-tier student stays subscription-less for the 5/day limit checks.
    await grantPremiumSubscription(students.weak.userId);
    await grantPremiumSubscription(students.strong.userId);

    if (PHASE === "offline") {
      await runLeakDetectorChecks();
      await runPromptWithholdingChecks();
      await runAllowanceChecks(students.free.userId, students.strong.userId);
      await runCreditMechanicsChecks(students.free.userId);
      await runRouteGuardChecks(students);
    } else {
      if (!process.env.ANTHROPIC_API_KEY?.trim()) {
        throw new Error("ANTHROPIC_API_KEY is not set — the --ai phase needs a real key.");
      }
      await seedModuleHistory(students.strong.userId, 1, "");
      await runRealHintChecks(students);
      await runPersonalizationContrastChecks(students);
    }
  } finally {
    server.close();
    await prisma.$disconnect();
  }

  console.log(`\n${passCount} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.log("Failed checks:");
    for (const failure of failures) {
      console.log(`  - ${failure}`);
    }
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
