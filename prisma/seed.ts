import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Year/Module/Unit/Lesson/LessonVersion have no natural unique field besides `id`, so
// fixed ids are used here to keep upserts stable (idempotent) across re-runs. User and
// Faculty already have natural unique keys (email, slug) and don't need this.
const YEAR_1_ID = "00000000-0000-0000-0000-000000000020";
const CARDIOLOGY_MODULE_ID = "00000000-0000-0000-0000-000000000030";
const CARDIAC_PHYSIOLOGY_UNIT_ID = "00000000-0000-0000-0000-000000000040";
const INTRO_LESSON_ID = "00000000-0000-0000-0000-000000000050";
const INTRO_LESSON_VERSION_ID = "00000000-0000-0000-0000-000000000060";

const QCM_QUESTION_ID = "00000000-0000-0000-0000-000000000070";
const QCM_OPTION_IDS = [
  "00000000-0000-0000-0000-000000000071",
  "00000000-0000-0000-0000-000000000072",
  "00000000-0000-0000-0000-000000000073",
  "00000000-0000-0000-0000-000000000074",
];

const QCS_QUESTION_ID = "00000000-0000-0000-0000-000000000080";
const QCS_OPTION_IDS = [
  "00000000-0000-0000-0000-000000000081",
  "00000000-0000-0000-0000-000000000082",
  "00000000-0000-0000-0000-000000000083",
  "00000000-0000-0000-0000-000000000084",
];

const QROC_QUESTION_ID = "00000000-0000-0000-0000-000000000090";

// Deliberately status: 'pending_review' — a fixture for verifying that
// GET /api/questions (BR-2 gate) excludes non-approved questions from what students see.
const PENDING_QUESTION_ID = "00000000-0000-0000-0000-000000000095";

const FREE_PLAN_ID = "00000000-0000-0000-0000-000000000100";
const PREMIUM_PLAN_ID = "00000000-0000-0000-0000-000000000110";

async function main() {
  // 1. Seed content-author user. Never meant to log in (see src/routes/auth.routes.ts) —
  // exists only to satisfy LessonVersion.authoredBy/reviewedBy.
  const seedAuthor = await prisma.user.upsert({
    where: { email: "seed-author@hamame.dz" },
    update: {},
    create: {
      email: "seed-author@hamame.dz",
      passwordHash: crypto.randomBytes(32).toString("hex"),
      fullName: "Seed Content Author",
      university: "N/A",
      wilaya: "N/A",
    },
  });

  // 1b. Universities (FR-10a per-university content scoping). `name` is unique, so it is a
  // stable upsert key on its own. All seeded content is deliberately left universityId:
  // null (global/shared) — these rows exist so scoped content and university-assigned
  // students can be created and verified, not to scope any existing content.
  const algiers = await prisma.university.upsert({
    where: { name: "Université d'Alger 1 — Faculté de Médecine" },
    update: { wilaya: "Alger" },
    create: { name: "Université d'Alger 1 — Faculté de Médecine", wilaya: "Alger" },
  });

  const oran = await prisma.university.upsert({
    where: { name: "Université Oran 1 Ahmed Ben Bella" },
    update: { wilaya: "Oran" },
    create: { name: "Université Oran 1 Ahmed Ben Bella", wilaya: "Oran" },
  });

  // 2. Faculties.
  const medicine = await prisma.faculty.upsert({
    where: { slug: "medicine" },
    update: { name: "Medicine", rolloutStatus: "live" },
    create: { name: "Medicine", slug: "medicine", rolloutStatus: "live" },
  });

  // Deliberately kept 'planned' (hidden) with no children — a fixture for verifying the
  // visibility-blocking logic in src/routes/curriculum.routes.ts (should 404 as
  // FACULTY_NOT_FOUND when queried).
  const dentistry = await prisma.faculty.upsert({
    where: { slug: "dentistry" },
    update: { name: "Dentistry", rolloutStatus: "planned" },
    create: { name: "Dentistry", slug: "dentistry", rolloutStatus: "planned" },
  });

  // 3. Curriculum tree under Medicine only.
  const year1 = await prisma.year.upsert({
    where: { id: YEAR_1_ID },
    update: { facultyId: medicine.id, label: "Year 1", orderIndex: 0 },
    create: { id: YEAR_1_ID, facultyId: medicine.id, label: "Year 1", orderIndex: 0 },
  });

  const cardiologyModule = await prisma.module.upsert({
    where: { id: CARDIOLOGY_MODULE_ID },
    update: { yearId: year1.id, name: "Cardiology", orderIndex: 0 },
    create: { id: CARDIOLOGY_MODULE_ID, yearId: year1.id, name: "Cardiology", orderIndex: 0 },
  });

  const cardiacPhysiologyUnit = await prisma.unit.upsert({
    where: { id: CARDIAC_PHYSIOLOGY_UNIT_ID },
    update: { moduleId: cardiologyModule.id, name: "Cardiac Physiology", orderIndex: 0 },
    create: {
      id: CARDIAC_PHYSIOLOGY_UNIT_ID,
      moduleId: cardiologyModule.id,
      name: "Cardiac Physiology",
      orderIndex: 0,
    },
  });

  const introLesson = await prisma.lesson.upsert({
    where: { id: INTRO_LESSON_ID },
    update: {
      unitId: cardiacPhysiologyUnit.id,
      title: "Introduction to the Cardiac Cycle",
      contentTier: "official",
    },
    create: {
      id: INTRO_LESSON_ID,
      unitId: cardiacPhysiologyUnit.id,
      title: "Introduction to the Cardiac Cycle",
      contentTier: "official",
    },
  });

  const bodyRichtext = {
    blocks: [{ type: "paragraph", text: "The cardiac cycle consists of systole and diastole..." }],
  };

  const introLessonVersion = await prisma.lessonVersion.upsert({
    where: { id: INTRO_LESSON_VERSION_ID },
    update: {
      lessonId: introLesson.id,
      versionNumber: 1,
      status: "approved",
      authoredBy: seedAuthor.id,
      reviewedBy: seedAuthor.id,
      reviewedAt: new Date(),
      bodyRichtext,
    },
    create: {
      id: INTRO_LESSON_VERSION_ID,
      lessonId: introLesson.id,
      versionNumber: 1,
      status: "approved",
      authoredBy: seedAuthor.id,
      reviewedBy: seedAuthor.id,
      reviewedAt: new Date(),
      bodyRichtext,
    },
  });

  // Lesson <-> LessonVersion reference each other, so this can only be wired up after
  // the LessonVersion row exists.
  await prisma.lesson.update({
    where: { id: introLesson.id },
    data: { currentVersionId: introLessonVersion.id },
  });

  // 4. Questions under Cardiac Physiology — one of each auto-gradable type plus a
  // QROC (to exercise the "not auto-gradable" path), all approved, plus one
  // pending_review question to verify the BR-2 visibility gate.
  const qcmQuestion = await prisma.question.upsert({
    where: { id: QCM_QUESTION_ID },
    update: {
      unitId: cardiacPhysiologyUnit.id,
      type: "QCM",
      source: "hamame_authored",
      status: "approved",
      difficulty: "easy",
      bodyRichtext: {
        text: "Which of the following occur during ventricular systole? (Select all that apply)",
      },
      explanationRichtext: {
        text:
          "During ventricular systole, the ventricles contract and eject blood; the AV valves close and semilunar valves open.",
      },
      authoredBy: seedAuthor.id,
      reviewedBy: seedAuthor.id,
      reviewedAt: new Date(),
    },
    create: {
      id: QCM_QUESTION_ID,
      unitId: cardiacPhysiologyUnit.id,
      type: "QCM",
      source: "hamame_authored",
      status: "approved",
      difficulty: "easy",
      bodyRichtext: {
        text: "Which of the following occur during ventricular systole? (Select all that apply)",
      },
      explanationRichtext: {
        text:
          "During ventricular systole, the ventricles contract and eject blood; the AV valves close and semilunar valves open.",
      },
      authoredBy: seedAuthor.id,
      reviewedBy: seedAuthor.id,
      reviewedAt: new Date(),
    },
  });

  const qcmOptions: { id: string; bodyText: string; isCorrect: boolean }[] = [
    { id: QCM_OPTION_IDS[0], bodyText: "AV valves close", isCorrect: true },
    { id: QCM_OPTION_IDS[1], bodyText: "Semilunar valves open", isCorrect: true },
    { id: QCM_OPTION_IDS[2], bodyText: "Ventricles are relaxed", isCorrect: false },
    { id: QCM_OPTION_IDS[3], bodyText: "Atria contract", isCorrect: false },
  ];
  await Promise.all(
    qcmOptions.map((option, orderIndex) =>
      prisma.questionOption.upsert({
        where: { id: option.id },
        update: {
          questionId: qcmQuestion.id,
          bodyText: option.bodyText,
          isCorrect: option.isCorrect,
          orderIndex,
        },
        create: {
          id: option.id,
          questionId: qcmQuestion.id,
          bodyText: option.bodyText,
          isCorrect: option.isCorrect,
          orderIndex,
        },
      })
    )
  );

  const qcsQuestion = await prisma.question.upsert({
    where: { id: QCS_QUESTION_ID },
    update: {
      unitId: cardiacPhysiologyUnit.id,
      type: "QCS",
      source: "hamame_authored",
      status: "approved",
      difficulty: "easy",
      bodyRichtext: { text: "What triggers the closure of the mitral valve?" },
      explanationRichtext: {
        text:
          "The mitral valve closes when left ventricular pressure exceeds left atrial pressure at the start of systole.",
      },
      authoredBy: seedAuthor.id,
      reviewedBy: seedAuthor.id,
      reviewedAt: new Date(),
    },
    create: {
      id: QCS_QUESTION_ID,
      unitId: cardiacPhysiologyUnit.id,
      type: "QCS",
      source: "hamame_authored",
      status: "approved",
      difficulty: "easy",
      bodyRichtext: { text: "What triggers the closure of the mitral valve?" },
      explanationRichtext: {
        text:
          "The mitral valve closes when left ventricular pressure exceeds left atrial pressure at the start of systole.",
      },
      authoredBy: seedAuthor.id,
      reviewedBy: seedAuthor.id,
      reviewedAt: new Date(),
    },
  });

  const qcsOptions: { id: string; bodyText: string; isCorrect: boolean }[] = [
    { id: QCS_OPTION_IDS[0], bodyText: "Rising ventricular pressure exceeding atrial pressure", isCorrect: true },
    { id: QCS_OPTION_IDS[1], bodyText: "Falling ventricular pressure", isCorrect: false },
    { id: QCS_OPTION_IDS[2], bodyText: "Atrial contraction", isCorrect: false },
    { id: QCS_OPTION_IDS[3], bodyText: "SA node depolarization", isCorrect: false },
  ];
  await Promise.all(
    qcsOptions.map((option, orderIndex) =>
      prisma.questionOption.upsert({
        where: { id: option.id },
        update: {
          questionId: qcsQuestion.id,
          bodyText: option.bodyText,
          isCorrect: option.isCorrect,
          orderIndex,
        },
        create: {
          id: option.id,
          questionId: qcsQuestion.id,
          bodyText: option.bodyText,
          isCorrect: option.isCorrect,
          orderIndex,
        },
      })
    )
  );

  // QROC — no QuestionOption rows; exercises the "not auto-gradable" path in
  // src/routes/sessions.routes.ts (isCorrect stays null for this type).
  const qrocQuestion = await prisma.question.upsert({
    where: { id: QROC_QUESTION_ID },
    update: {
      unitId: cardiacPhysiologyUnit.id,
      type: "QROC",
      source: "hamame_authored",
      status: "approved",
      difficulty: "medium",
      bodyRichtext: { text: "Briefly explain why the QRS complex is typically narrow in a healthy heart." },
      explanationRichtext: {
        text:
          "A narrow QRS reflects rapid, coordinated depolarization of the ventricles via the His-Purkinje conduction system.",
      },
      authoredBy: seedAuthor.id,
      reviewedBy: seedAuthor.id,
      reviewedAt: new Date(),
    },
    create: {
      id: QROC_QUESTION_ID,
      unitId: cardiacPhysiologyUnit.id,
      type: "QROC",
      source: "hamame_authored",
      status: "approved",
      difficulty: "medium",
      bodyRichtext: { text: "Briefly explain why the QRS complex is typically narrow in a healthy heart." },
      explanationRichtext: {
        text:
          "A narrow QRS reflects rapid, coordinated depolarization of the ventricles via the His-Purkinje conduction system.",
      },
      authoredBy: seedAuthor.id,
      reviewedBy: seedAuthor.id,
      reviewedAt: new Date(),
    },
  });

  // pending_review — not yet reviewed, so authoredBy is set but reviewedBy/reviewedAt
  // stay null. Only exists to verify GET /api/questions never returns it.
  const pendingQuestion = await prisma.question.upsert({
    where: { id: PENDING_QUESTION_ID },
    update: {
      unitId: cardiacPhysiologyUnit.id,
      type: "QCM",
      source: "hamame_authored",
      status: "pending_review",
      bodyRichtext: { text: "Placeholder QCM pending review — should never appear in GET /api/questions." },
      explanationRichtext: { text: "N/A — not yet reviewed." },
      authoredBy: seedAuthor.id,
      reviewedBy: null,
      reviewedAt: null,
    },
    create: {
      id: PENDING_QUESTION_ID,
      unitId: cardiacPhysiologyUnit.id,
      type: "QCM",
      source: "hamame_authored",
      status: "pending_review",
      bodyRichtext: { text: "Placeholder QCM pending review — should never appear in GET /api/questions." },
      explanationRichtext: { text: "N/A — not yet reviewed." },
      authoredBy: seedAuthor.id,
    },
  });

  // 5. Roles (Section 1 of prisma/schema.prisma; PRD Section 6). `name` is @unique, so
  // that's a stable upsert key on its own — no fixed ids needed here.
  const ROLE_NAMES = [
    "guest",
    "student_free",
    "student_premium",
    "instructor",
    "academic_reviewer",
    "moderator",
    "support_agent",
    "institution_admin",
    "admin",
    "super_admin",
  ] as const;

  const roles = await Promise.all(
    ROLE_NAMES.map((name) => prisma.role.upsert({ where: { name }, update: {}, create: { name } }))
  );
  const roleByName = new Map(roles.map((role) => [role.name, role]));

  // Grant the seed author 'instructor', 'academic_reviewer' AND 'admin' roles. This is a
  // deliberate testing convenience — one account with broad, overlapping roles so every
  // new role-gated endpoint (authoring/review/admin) can be exercised without juggling
  // multiple logins — NOT a realistic real-world role model (a real instructor would not
  // normally also be an admin).
  const SEED_AUTHOR_ROLE_NAMES = ["instructor", "academic_reviewer", "admin"] as const;
  const seedAuthorRoles = await Promise.all(
    SEED_AUTHOR_ROLE_NAMES.map((name) => {
      const role = roleByName.get(name)!;
      return prisma.userRole.upsert({
        where: { userId_roleId: { userId: seedAuthor.id, roleId: role.id } },
        update: {},
        create: { userId: seedAuthor.id, roleId: role.id },
      });
    })
  );

  // Also grant 'instructor', 'academic_reviewer', 'moderator' AND 'admin' to a real,
  // loggable-in test account (hamamebouchareb@gmail.com) — unlike seedAuthor above,
  // this is an account someone can actually log into, so it's what should be used to
  // exercise requireRole (src/middleware/requireRole.ts) end-to-end via real login. This
  // is the same kind of deliberate testing convenience as seedAuthor's broad roles above
  // — one real account with broad, overlapping roles to exercise every role-gated
  // endpoint without juggling multiple logins — NOT a realistic real-world role model.
  //
  // This user is expected to already exist (registered via POST /api/auth/register) in
  // whichever environment this seed runs against — it is deliberately NOT created here
  // (unlike seedAuthor), since this seed script must stay safely re-runnable in any
  // environment, including ones where this specific test account was never registered.
  // If it's missing, that's logged as a warning and skipped rather than crashing the
  // rest of the seed.
  const TEST_ACCOUNT_EMAIL = "hamamebouchareb@gmail.com";
  const TEST_ACCOUNT_ROLE_NAMES = ["instructor", "academic_reviewer", "moderator", "admin"] as const;
  const testAccount = await prisma.user.findUnique({ where: { email: TEST_ACCOUNT_EMAIL } });
  let testAccountRoles: Awaited<ReturnType<typeof prisma.userRole.upsert>>[] = [];
  if (testAccount) {
    testAccountRoles = await Promise.all(
      TEST_ACCOUNT_ROLE_NAMES.map((name) => {
        const role = roleByName.get(name)!;
        return prisma.userRole.upsert({
          where: { userId_roleId: { userId: testAccount.id, roleId: role.id } },
          update: {},
          create: { userId: testAccount.id, roleId: role.id },
        });
      })
    );
  } else {
    console.warn(
      `  [seed] User '${TEST_ACCOUNT_EMAIL}' not found — skipping test-account role grant. Register this account first if you need it for end-to-end requireRole testing.`
    );
  }

  // 6. Monetization plans (Section 7 of prisma/schema.prisma; BR-1, BR-8).
  //
  // features.aiCredits is the BR-6 allowance config read by src/lib/ai/credits.ts. It is a
  // shared daily pool across ALL AI features (contextual hints today; chat, note-maker,
  // answer-locator later), not a per-feature counter. These are seeded DEFAULTS, not
  // product constants — admins change them live via PUT /api/admin/plans/:id, so nothing
  // in the application hardcodes a tier's limit.
  const freePlanFeatures = {
    description: "Full question bank access, practice/exam modes, basic stats",
    aiCredits: { dailyAllowance: 5, monthlyAllowance: 150 },
  };
  const premiumPlanFeatures = {
    description: "Full official courses, unlimited mock exams, priority support",
    aiCredits: { dailyAllowance: 30, monthlyAllowance: 900 },
  };

  const freePlan = await prisma.plan.upsert({
    where: { id: FREE_PLAN_ID },
    update: {
      name: "free",
      priceDzd: 0,
      billingPeriod: null,
      isActive: true,
      features: freePlanFeatures,
    },
    create: {
      id: FREE_PLAN_ID,
      name: "free",
      priceDzd: 0,
      billingPeriod: null,
      isActive: true,
      features: freePlanFeatures,
    },
  });

  const premiumPlan = await prisma.plan.upsert({
    where: { id: PREMIUM_PLAN_ID },
    update: {
      name: "premium",
      priceDzd: 1500,
      billingPeriod: "monthly",
      isActive: true,
      features: premiumPlanFeatures,
    },
    create: {
      id: PREMIUM_PLAN_ID,
      name: "premium",
      priceDzd: 1500,
      billingPeriod: "monthly",
      isActive: true,
      features: premiumPlanFeatures,
    },
  });

  console.log("Seed complete:");
  console.log(`  User (content author): ${seedAuthor.email} (${seedAuthor.id})`);
  console.log(`  University: ${algiers.name} (${algiers.id})`);
  console.log(`  University: ${oran.name} (${oran.id})`);
  console.log(`  Faculty: ${medicine.name} [${medicine.rolloutStatus}] (${medicine.id})`);
  console.log(`  Faculty: ${dentistry.name} [${dentistry.rolloutStatus}] (${dentistry.id})`);
  console.log(`  Year: ${year1.label} (${year1.id})`);
  console.log(`  Module: ${cardiologyModule.name} (${cardiologyModule.id})`);
  console.log(`  Unit: ${cardiacPhysiologyUnit.name} (${cardiacPhysiologyUnit.id})`);
  console.log(
    `  Lesson: ${introLesson.title} (${introLesson.id}) — currentVersionId -> ${introLessonVersion.id}`
  );
  console.log(
    `  LessonVersion: v${introLessonVersion.versionNumber} status=${introLessonVersion.status} (${introLessonVersion.id})`
  );
  console.log(
    `  Question (QCM): status=${qcmQuestion.status} (${qcmQuestion.id}) — ${qcmOptions.length} options`
  );
  console.log(
    `  Question (QCS): status=${qcsQuestion.status} (${qcsQuestion.id}) — ${qcsOptions.length} options`
  );
  console.log(`  Question (QROC): status=${qrocQuestion.status} (${qrocQuestion.id}) — no options`);
  console.log(
    `  Question (pending): status=${pendingQuestion.status} (${pendingQuestion.id}) — should never appear in GET /api/questions`
  );
  console.log(
    `  Plan: ${freePlan.name} priceDzd=${freePlan.priceDzd} billingPeriod=${freePlan.billingPeriod} (${freePlan.id})`
  );
  console.log(
    `  Plan: ${premiumPlan.name} priceDzd=${premiumPlan.priceDzd} billingPeriod=${premiumPlan.billingPeriod} (${premiumPlan.id})`
  );
  console.log(`  Roles: ${roles.length} role(s) seeded — ${roles.map((role) => role.name).join(", ")}`);
  console.log(
    `  UserRole: ${seedAuthor.email} granted ${seedAuthorRoles.length} role(s) — ${SEED_AUTHOR_ROLE_NAMES.join(
      ", "
    )} (testing convenience only, not a realistic role model)`
  );
  if (testAccount) {
    console.log(
      `  UserRole: ${TEST_ACCOUNT_EMAIL} granted ${testAccountRoles.length} role(s) — ${TEST_ACCOUNT_ROLE_NAMES.join(
        ", "
      )} (testing convenience only, not a realistic role model)`
    );
  } else {
    console.log(`  UserRole: ${TEST_ACCOUNT_EMAIL} not found — role grant skipped.`);
  }

  // 7. Resources — "Hamame Drive" (PRD 10.2)
  // Seed a few cross-faculty and faculty-specific resources. Upsert with fixed
  // IDs for idempotency; this script is meant to be re-runnable.
  const RESOURCE_IDS = {
    res1: "00000000-0000-0000-0000-000000000120",
    res2: "00000000-0000-0000-0000-000000000130",
    res3: "00000000-0000-0000-0000-000000000140",
    res4: "00000000-0000-0000-0000-000000000150",
  } as const;

  const resourceData = [
    {
      id: RESOURCE_IDS.res1,
      title: "Pharmacology Guidelines 2024",
      type: "official_drive" as const,
      facultyId: medicine.id,
      yearId: year1.id,
      fileUrl: "/resources/pharmacology-guidelines-2024.pdf",
      sourceLabel: "Ministry of Higher Education",
    },
    {
      id: RESOURCE_IDS.res2,
      title: "Radiology Image Library",
      type: "reference" as const,
      facultyId: medicine.id,
      yearId: year1.id,
      fileUrl: "/resources/radiology-image-library.pdf",
      sourceLabel: "University Hospital",
    },
    {
      id: RESOURCE_IDS.res3,
      title: "Past Exam Session 2023 — Year 1",
      type: "past_exam" as const,
      yearId: year1.id, // cross-faculty (NULL faculty_id)
      fileUrl: "/resources/past-exam-2023-year1.pdf",
      sourceLabel: "Faculty of Medicine archive",
    },
    {
      id: RESOURCE_IDS.res4,
      title: "Dental Anatomy Reference",
      type: "other" as const,
      facultyId: dentistry.id,
      yearId: year1.id,
      fileUrl: "/resources/dental-anatomy-reference.pdf",
      sourceLabel: "Dentistry Department",
    },
  ];

  for (const { id, title, type, facultyId, yearId, fileUrl, sourceLabel } of resourceData) {
    await prisma.resource.upsert({
      where: { id },
      create: {
        id,
        title,
        type,
        fileUrl,
        sourceLabel,
        facultyId,
        yearId,
        addedBy: seedAuthor.id,
        createdAt: new Date(),
      },
      update: {
        title,
        type,
        fileUrl,
        sourceLabel,
        facultyId,
        yearId,
        addedBy: seedAuthor.id,
        createdAt: new Date(),
      },
    });
  }

  console.log(`  Seeded ${resourceData.length} resources.`);

}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
