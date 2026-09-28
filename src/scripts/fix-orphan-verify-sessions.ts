import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const orphans = await prisma.studySession.findMany({
    where: { name: { startsWith: "VERIFY-" } },
    select: { id: true, name: true },
  });
  console.log("===== orphan VERIFY sessions before delete");
  console.log(JSON.stringify(orphans, null, 2));
  console.log(`count=${orphans.length}`);

  if (orphans.length > 0) {
    const ids = orphans.map((s) => s.id);
    const sq = await prisma.sessionQuestion.findMany({
      where: { sessionId: { in: ids } },
      select: { id: true },
    });
    if (sq.length) {
      await prisma.attempt.deleteMany({ where: { sessionQuestionId: { in: sq.map((r) => r.id) } } });
      await prisma.sessionQuestion.deleteMany({ where: { sessionId: { in: ids } } });
    }
    const deleted = await prisma.studySession.deleteMany({ where: { id: { in: ids } } });
    console.log(`===== deleteMany study_sessions result: ${JSON.stringify(deleted)}`);
  }

  const afterSessions = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS count FROM study_sessions WHERE name ILIKE 'VERIFY-%'`
  );
  const afterYears = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS count FROM years WHERE label ILIKE '%VERIFY%'`
  );
  const afterQuestions = await prisma.$queryRawUnsafe(`
    SELECT count(*)::int AS count FROM questions WHERE unit_id IN (
      SELECT u.id FROM units u
      JOIN modules m ON m.id = u.module_id
      JOIN years y ON y.id = m.year_id
      WHERE y.label ILIKE '%VERIFY%'
    )
  `);
  const afterSq = await prisma.$queryRawUnsafe(`
    SELECT count(*)::int AS count FROM session_questions sq
    WHERE sq.question_id IN (
      'aaaaaaaa-0000-4000-8000-000000000071'::uuid,
      'aaaaaaaa-0000-4000-8000-000000000072'::uuid
    )
  `);
  const afterModules = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS count FROM modules WHERE name ILIKE '%VERIFY%'`
  );
  const afterUnits = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS count FROM units WHERE name ILIKE '%VERIFY%'`
  );

  console.log("===== AFTER FIX — SELECT count(*) FROM years WHERE label ILIKE '%VERIFY%';");
  console.log(JSON.stringify(afterYears, null, 2));
  console.log("===== AFTER FIX — SELECT count(*) FROM questions WHERE unit_id IN (VERIFY year units)");
  console.log(JSON.stringify(afterQuestions, null, 2));
  console.log("===== AFTER FIX — SELECT count(*) FROM study_sessions WHERE name ILIKE 'VERIFY-%'");
  console.log(JSON.stringify(afterSessions, null, 2));
  console.log("===== AFTER FIX — session_questions referencing fixture Y2 ids");
  console.log(JSON.stringify(afterSq, null, 2));
  console.log("===== AFTER FIX — modules/units VERIFY");
  console.log(JSON.stringify({ modules: afterModules, units: afterUnits }, null, 2));
}

main().finally(() => prisma.$disconnect());
