import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

/**
 * Heavy-content test-account seed (Task 8 follow-up, item 4).
 *
 * Creates/upserts ONE loggable account — heavy@hamame.dz / testpass123 — with enough
 * data volume to stress-test Dashboard / Profil / QCM Results under realistic load:
 *
 *   - 50 completed practice study sessions with varied scores (28–100), spread over
 *     the last ~60 days (one per day for the last 45 days + 5 older stragglers)
 *   - 3 session questions per session (seeded QCM/QCS/QROC fixtures) with attempts,
 *     so results pages have real per-question data
 *   - A 45-day active streak (current 45, longest 61) for streak/badge UI
 *   - 4 badges earned at staggered times (streak/session_count/accuracy criteria shapes
 *     matching src/lib/badge-awards.ts's taxonomy)
 *   - 12 notes including deliberately overlong titles/bodies for truncation testing
 *   - Progress row for the seeded intro lesson
 *
 * Re-runnable: wipes this user's sessions/notes/progress/badges first, then recreates.
 * Run with: npx tsx prisma/seed-heavy.ts
 */

const prisma = new PrismaClient();

const HEAVY_EMAIL = "heavy@hamame.dz";
const HEAVY_PASSWORD = "testpass123";

// Same fixed fixture ids as prisma/seed.ts (must run AFTER `npm run prisma:migrate:deploy`
// + `npx tsx prisma/seed.ts` so these exist).
const YEAR_1_ID = "00000000-0000-0000-0000-000000000020";
const CARDIOLOGY_MODULE_ID = "00000000-0000-0000-0000-000000000030";
const INTRO_LESSON_ID = "00000000-0000-0000-0000-000000000050";
const GRADABLE_QUESTION_IDS = [
  "00000000-0000-0000-0000-000000000070", // QCM
  "00000000-0000-0000-0000-000000000080", // QCS
];
const QROC_QUESTION_ID = "00000000-0000-0000-0000-000000000090"; // not auto-gradable

const BADGE_IDS = {
  streak30: "00000000-0000-0000-0000-000000000201",
  sessions10: "00000000-0000-0000-0000-000000000202",
  accuracy80: "00000000-0000-0000-0000-000000000203",
};

const SESSION_COUNT = 50;
const DAILY_SESSION_COUNT = 45;

function uuid(): string {
  return crypto.randomUUID();
}

function dayStart(daysAgo: number): Date {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d;
}

async function main() {
  // Sequential awaits throughout — Supabase session pooler dislikes large Promise.all.
  const passwordHash = await bcrypt.hash(HEAVY_PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { email: HEAVY_EMAIL },
    update: { passwordHash },
    create: {
      email: HEAVY_EMAIL,
      passwordHash,
      fullName: "Heavy Content QA",
      facultyId: null,
      yearId: null,
      wilaya: "Alger",
    },
  });

  // Attach to Medicine Year 1 (same faculty as the seeded curriculum).
  const year = await prisma.year.findUnique({ where: { id: YEAR_1_ID }, select: { id: true } });
  if (!year) {
    throw new Error("Year 1 fixture missing — run `npx tsx prisma/seed.ts` first.");
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { facultyId: "b37b039e-2208-4837-b5d5-28b1c338a2cf", yearId: YEAR_1_ID },
  });

  // Clean previous heavy data (cascades to SessionQuestion -> Attempt).
  await prisma.studySession.deleteMany({ where: { userId: user.id } });
  await prisma.note.deleteMany({ where: { userId: user.id } });
  await prisma.progress.deleteMany({ where: { userId: user.id } });
  await prisma.userBadge.deleteMany({ where: { userId: user.id } });
  await prisma.streak.deleteMany({ where: { userId: user.id } });

  type SessionSpec = { id: string; daysAgo: number; score: number };
  const sessionSpecs: SessionSpec[] = [];

  for (let i = 0; i < DAILY_SESSION_COUNT; i++) {
    // Deterministic varied scores in [40, 100].
    sessionSpecs.push({
      id: uuid(),
      daysAgo: i,
      score: 40 + ((i * 17) % 61),
    });
  }
  for (let i = 0; i < SESSION_COUNT - DAILY_SESSION_COUNT; i++) {
    sessionSpecs.push({
      id: uuid(),
      daysAgo: DAILY_SESSION_COUNT + 2 + i * 3,
      score: 28 + ((i * 23) % 70),
    });
  }

  await prisma.studySession.createMany({
    data: sessionSpecs.map((spec) => {
      const startedAt = dayStart(spec.daysAgo);
      const completedAt = new Date(startedAt.getTime() + 14 * 60 * 1000);
      return {
        id: spec.id,
        userId: user.id,
        name: `Réseau QCM — série du ${startedAt.toISOString().slice(0, 10)}`,
        mode: "practice",
        startedAt,
        completedAt,
        score: spec.score,
        createdAt: startedAt,
      };
    }),
  });

  // 3 questions per session (QCM, QCS, QROC). QCM/QCS attempts are graded with a
  // correctness pattern derived from the session's score; QROC stays ungraded.
  const sqRows: {
    id: string;
    sessionId: string;
    questionId: string;
    presentedOrder: number;
  }[] = [];
  const attemptRows: {
    id: string;
    sessionQuestionId: string;
    selectedOptionIds: string[];
    isCorrect: boolean | null;
    answeredAt: Date;
  }[] = [];

  for (const spec of sessionSpecs) {
    for (let q = 0; q < 3; q++) {
      const sqId = uuid();
      sqRows.push({
        id: sqId,
        sessionId: spec.id,
        questionId: q === 2 ? QROC_QUESTION_ID : GRADABLE_QUESTION_IDS[q],
        presentedOrder: q,
      });
      const answeredAt = new Date(dayStart(spec.daysAgo).getTime() + (q + 1) * 4 * 60 * 1000);
      if (q === 2) {
        attemptRows.push({
          id: uuid(),
          sessionQuestionId: sqId,
          selectedOptionIds: [],
          isCorrect: null,
          answeredAt,
        });
      } else {
        attemptRows.push({
          id: uuid(),
          sessionQuestionId: sqId,
          selectedOptionIds: [],
          isCorrect: (spec.score + q * 13) % 5 !== 0 ? true : false,
          answeredAt,
        });
      }
    }
  }

  await prisma.sessionQuestion.createMany({ data: sqRows });
  await prisma.attempt.createMany({ data: attemptRows });

  // Streak: active every day for the last 45 days, best run 61 days.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  await prisma.streak.create({
    data: {
      userId: user.id,
      currentStreakDays: DAILY_SESSION_COUNT,
      longestStreakDays: 61,
      lastActiveDate: today,
      dailyGoalMinutes: 20,
    },
  });

  // Badges using the exact criteria shapes src/lib/badge-awards.ts understands.
  const badgeDefs = [
    { id: BADGE_IDS.streak30, name: "Série de 30 jours", criteria: { type: "streak", days: 30 }, daysAgo: 15 },
    { id: BADGE_IDS.sessions10, name: "10 sessions terminées", criteria: { type: "session_count", count: 10 }, daysAgo: 38 },
    { id: BADGE_IDS.accuracy80, name: "Précision 80%", criteria: { type: "accuracy", threshold: 80, minAttempts: 20 }, daysAgo: 7 },
  ];
  for (const def of badgeDefs) {
    await prisma.badge.upsert({
      where: { id: def.id },
      update: { name: def.name, criteria: def.criteria },
      create: { id: def.id, name: def.name, criteria: def.criteria },
    });
    await prisma.userBadge.create({
      data: { userId: user.id, badgeId: def.id, earnedAt: dayStart(def.daysAgo) },
    });
  }

  // Notes — several with deliberately long titles/bodies for truncation checks.
  const noteTitles = [
    "Cycle cardiaque — résumé",
    "Note extrêmement longue pour tester la troncature des titres dans les listes d'activité récente du tableau de bord et de la page profil",
    "Pharmacologie — antiarythmiques classe I à IV",
    "Système conduction : nœud sinusal, AV, His-Purkinje — détails supplémentaires pour dépasser la limite",
    "ECG : intervalles normaux",
  ];
  const noteBodies: { title: string; content: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const t = noteTitles[i % noteTitles.length];
    noteBodies.push({
      title: `${t} (${i + 1})`,
      content:
        i % 3 === 0
          ? "Corps de note volontairement très long. ".repeat(120).trim()
          : "Points clés de la séance de révision.",
    });
  }
  let noteIdx = 0;
  for (const nb of noteBodies) {
    await prisma.note.create({
      data: {
        userId: user.id,
        lessonId: noteIdx % 2 === 0 ? INTRO_LESSON_ID : null,
        bodyText: `${nb.title} — ${nb.content}`,
        createdAt: dayStart(noteIdx),
      },
    });
    noteIdx++;
  }

  await prisma.progress.create({
    data: {
      userId: user.id,
      lessonId: INTRO_LESSON_ID,
      subjectModuleId: CARDIOLOGY_MODULE_ID,
      percentage: 87,
      lastStudiedAt: dayStart(0),
    },
  });

  console.log(`Heavy seed complete for ${HEAVY_EMAIL} (${user.id}):`);
  console.log(`  StudySessions: ${sessionSpecs.length} (scores ${Math.min(...sessionSpecs.map((s) => s.score))}–${Math.max(...sessionSpecs.map((s) => s.score))})`);
  console.log(`  SessionQuestions: ${sqRows.length}, Attempts: ${attemptRows.length}`);
  console.log(`  Streak: current=${DAILY_SESSION_COUNT} longest=61`);
  console.log(`  Badges: ${badgeDefs.length} earned`);
  console.log(`  Notes: ${noteBodies.length}`);
  console.log(`  Login: ${HEAVY_EMAIL} / ${HEAVY_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error("Heavy seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
