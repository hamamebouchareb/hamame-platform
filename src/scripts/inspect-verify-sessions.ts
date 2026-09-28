import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT id::text, name, left(name, 20) AS name_prefix, length(name) AS name_len
    FROM study_sessions
    WHERE name ILIKE 'VERIFY-%'
    ORDER BY name
  `);
  console.log("===== raw SQL: study_sessions WHERE name ILIKE 'VERIFY-%'");
  console.log(JSON.stringify(rows, null, 2));

  const allVerifyish = await prisma.$queryRawUnsafe(`
    SELECT id::text, name
    FROM study_sessions
    WHERE name ILIKE '%VERIFY%'
    ORDER BY name
  `);
  console.log("===== raw SQL: study_sessions WHERE name ILIKE '%VERIFY%'");
  console.log(JSON.stringify(allVerifyish, null, 2));
}

main().finally(() => prisma.$disconnect());
