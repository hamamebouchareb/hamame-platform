import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Exact queries requested in the closeout prompt:
  const q1 = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS count FROM years WHERE label ILIKE '%VERIFY%'`
  );
  console.log("===== SELECT count(*) FROM years WHERE label ILIKE '%VERIFY%';");
  console.log(JSON.stringify(q1, null, 2));

  const q2 = await prisma.$queryRawUnsafe(`
    SELECT count(*)::int AS count FROM questions WHERE unit_id IN (
      SELECT u.id FROM units u
      JOIN modules m ON m.id = u.module_id
      JOIN years y ON y.id = m.year_id
      WHERE y.label ILIKE '%VERIFY%'
    )
  `);
  console.log("===== SELECT count(*) FROM questions WHERE unit_id IN (");
  console.log("  SELECT u.id FROM units u");
  console.log("  JOIN modules m ON m.id = u.module_id");
  console.log("  JOIN years y ON y.id = m.year_id");
  console.log("  WHERE y.label ILIKE '%VERIFY%'");
  console.log(");");
  console.log(JSON.stringify(q2, null, 2));

  // Precise fixture-ID integrity (today's by_year harness IDs — case-sensitive prefix)
  const fixture = await prisma.$queryRawUnsafe(`
    SELECT
      (SELECT count(*)::int FROM years WHERE id = 'aaaaaaaa-0000-4000-8000-000000000021'::uuid) AS year_fixture_rows,
      (SELECT count(*)::int FROM modules WHERE id = 'aaaaaaaa-0000-4000-8000-000000000031'::uuid) AS module_fixture_rows,
      (SELECT count(*)::int FROM units WHERE id = 'aaaaaaaa-0000-4000-8000-000000000041'::uuid) AS unit_fixture_rows,
      (SELECT count(*)::int FROM questions WHERE id IN (
        'aaaaaaaa-0000-4000-8000-000000000071'::uuid,
        'aaaaaaaa-0000-4000-8000-000000000072'::uuid
      )) AS question_fixture_rows,
      (SELECT count(*)::int FROM session_questions WHERE question_id IN (
        'aaaaaaaa-0000-4000-8000-000000000071'::uuid,
        'aaaaaaaa-0000-4000-8000-000000000072'::uuid
      )) AS session_questions_fixture_refs,
      (SELECT count(*)::int FROM study_sessions WHERE name LIKE 'VERIFY-%') AS study_sessions_VERIFY_prefix_case_sensitive
  `);
  console.log("===== fixture-ID integrity (today's by_year harness)");
  console.log(JSON.stringify(fixture, null, 2));

  // Note: ILIKE 'VERIFY-%' also matches older lowercase verify-hints/push/ready debris —
  // those are unrelated pre-existing harness rows, not today's Year 2 fixture.
  const ilikeFalseFriends = await prisma.$queryRawUnsafe(`
    SELECT count(*)::int AS count FROM study_sessions WHERE name ILIKE 'VERIFY-%'
  `);
  console.log("===== NOTE — study_sessions WHERE name ILIKE 'VERIFY-%' (case-insensitive; includes older verify-* harness debris, NOT today's fixture)");
  console.log(JSON.stringify(ilikeFalseFriends, null, 2));
}

main().finally(() => prisma.$disconnect());
