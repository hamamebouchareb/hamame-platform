// Rollback for bulk imports — deletes ONLY ids listed in a manifest file
// produced by import-content.ts --apply (docs/verification/import-manifest-*).
// Default is dry-run (reads only). --apply deletes children before parents
// and REFUSES: any question with attempts (via session_questions), any
// question not in pending_review, any lesson version not in pending_review,
// and any lesson whose currentVersionId is set (published). Refusals print
// as skipped with the reason. Attempts themselves are NEVER deleted.

import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

function parseArgs(argv: string[]): { manifest: string; apply: boolean; allowRemote: boolean } {
  const args = { manifest: "", apply: false, allowRemote: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--manifest") args.manifest = argv[++i] ?? "";
    else if (flag === "--apply") args.apply = true;
    else if (flag === "--allow-remote") args.allowRemote = true;
    else {
      console.error(`unknown flag: ${flag}`);
      process.exit(2);
    }
  }
  if (!args.manifest) {
    console.error("usage: rollback-import.ts --manifest <docs/verification/import-manifest-*.json> [--apply] [--allow-remote]");
    process.exit(2);
  }
  return args;
}

/**
 * Host guard: prints host/port/database (NEVER credentials) on every run and
 * aborts --apply against anything but localhost, unless --allow-remote is
 * passed explicitly by the owner. Runs before any PrismaClient is created.
 */
function dbGuard(apply: boolean, allowRemote: boolean): void {
  const raw = process.env.DATABASE_URL ?? "";
  let host = "";
  let port = "";
  let database = "";
  try {
    const url = new URL(raw);
    host = url.hostname;
    port = url.port || "(default)";
    database = url.pathname.replace(/^\//, "") || "(none)";
  } catch {
    host = "(unparseable)";
  }
  console.log(`db: host=${host} port=${port} database=${database}`);
  if (apply && !(host === "localhost" || host === "127.0.0.1") && !allowRemote) {
    console.error(`refusing --apply on non-local host ${host} without --allow-remote (no writes performed)`);
    process.exit(2);
  }
  if (apply && (host === "localhost" || host === "127.0.0.1")) {
    console.log("db guard: local host confirmed, --apply permitted");
  }
}

interface Manifest {
  batch?: string;
  author?: string;
  appliedAt?: string;
  created?: Record<string, string[]>;
}

function ids(manifest: Manifest, table: string): string[] {
  const list = manifest.created?.[table];
  return Array.isArray(list) ? list.filter((id): id is string => typeof id === "string") : [];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  dbGuard(args.apply, args.allowRemote);
  const manifest = JSON.parse(readFileSync(args.manifest, "utf8")) as Manifest;
  if (!manifest.created || typeof manifest.created !== "object") {
    console.error("refusing: manifest has no created-id map");
    process.exit(2);
  }

  const prisma = new PrismaClient();
  const deleted: Record<string, number> = {};
  const skipped: string[] = [];
  const del = async (table: string, count: number) => {
    deleted[table] = (deleted[table] ?? 0) + count;
  };

  // 1. Questions first (guards before any write): refuse answered or
  // non-pending rows. Options die with their question only when the
  // question itself is approved for deletion below.
  const doomedQuestions: string[] = [];
  for (const id of ids(manifest, "questions")) {
    const question = await prisma.question.findUnique({
      where: { id },
      select: { id: true, status: true, sessionQuestions: { select: { id: true, attempts: { select: { id: true } } } } },
    });
    if (!question) {
      skipped.push(`questions:${id}: already gone`);
      continue;
    }
    const answered = question.sessionQuestions.some((sq) => sq.attempts.length > 0);
    if (answered) {
      skipped.push(`questions:${id}: has attempts — never deleted`);
      continue;
    }
    if (question.status !== "pending_review") {
      skipped.push(`questions:${id}: status=${question.status} (only pending_review rolls back)`);
      continue;
    }
    doomedQuestions.push(id);
    if (!args.apply) console.log(`would delete questions:${id}`);
  }

  // 2. Options belonging to doomed questions only.
  const doomedOptions = ids(manifest, "options");
  if (doomedOptions.length > 0 && doomedQuestions.length > 0) {
    if (args.apply) {
      const res = await prisma.questionOption.deleteMany({
        where: { id: { in: doomedOptions }, questionId: { in: doomedQuestions } },
      });
      await del("options", res.count);
    } else {
      console.log(`would delete options=${doomedOptions.length} (scoped to doomed questions)`);
    }
  }

  // 3. The doomed questions themselves.
  for (const id of doomedQuestions) {
    if (args.apply) {
      await prisma.sessionQuestion.deleteMany({ where: { questionId: id } });
      await prisma.question.delete({ where: { id } });
      await del("questions", 1);
    }
  }

  // 3. Lesson versions: refuse non-pending rows.
  for (const id of ids(manifest, "lessonVersions")) {
    const version = await prisma.lessonVersion.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!version) {
      skipped.push(`lessonVersions:${id}: already gone`);
      continue;
    }
    if (version.status !== "pending_review") {
      skipped.push(`lessonVersions:${id}: status=${version.status} (only pending_review rolls back)`);
      continue;
    }
    if (args.apply) {
      await prisma.lessonVersion.delete({ where: { id } });
      await del("lessonVersions", 1);
    } else {
      console.log(`would delete lessonVersions:${id}`);
    }
  }

  // 4. Lessons: refuse published rows (currentVersionId set).
  for (const id of ids(manifest, "lessons")) {
    const lesson = await prisma.lesson.findUnique({ where: { id }, select: { id: true, currentVersionId: true } });
    if (!lesson) {
      skipped.push(`lessons:${id}: already gone`);
      continue;
    }
    if (lesson.currentVersionId !== null) {
      skipped.push(`lessons:${id}: published (currentVersionId set) — never deleted`);
      continue;
    }
    if (args.apply) {
      await prisma.lesson.delete({ where: { id } });
      await del("lessons", 1);
    } else {
      console.log(`would delete lessons:${id}`);
    }
  }

  // 5. Curriculum (units → modules → years): only when now empty; anything
  //    accumulated since import (real content, student progress) blocks the
  //    delete via Restrict or is reported as skipped.
  for (const id of ids(manifest, "units")) {
    const lessons = await prisma.lesson.count({ where: { unitId: id } });
    const questions = await prisma.question.count({ where: { unitId: id } });
    if (lessons > 0 || questions > 0) {
      skipped.push(`units:${id}: not empty (lessons=${lessons} questions=${questions})`);
      continue;
    }
    if (args.apply) {
      await prisma.unit.delete({ where: { id } });
      await del("units", 1);
    } else {
      console.log(`would delete units:${id}`);
    }
  }
  for (const id of ids(manifest, "modules")) {
    const units = await prisma.unit.count({ where: { moduleId: id } });
    if (units > 0) {
      skipped.push(`modules:${id}: not empty (units=${units})`);
      continue;
    }
    if (args.apply) {
      await prisma.module.delete({ where: { id } });
      await del("modules", 1);
    } else {
      console.log(`would delete modules:${id}`);
    }
  }
  for (const id of ids(manifest, "years")) {
    const modules = await prisma.module.count({ where: { yearId: id } });
    const users = await prisma.user.count({ where: { yearId: id } });
    if (modules > 0 || users > 0) {
      skipped.push(`years:${id}: not empty (modules=${modules} users=${users})`);
      continue;
    }
    if (args.apply) {
      await prisma.year.delete({ where: { id } });
      await del("years", 1);
    } else {
      console.log(`would delete years:${id}`);
    }
  }

  console.log(args.apply ? "applied:" : "dry-run (no deletes):");
  for (const [table, count] of Object.entries(deleted)) console.log(`  deleted ${table}=${count}`);
  console.log(`skipped=${skipped.length}`);
  for (const reason of skipped) console.log(`  - ${reason}`);
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("rollback failed: " + (err as Error).message);
  process.exit(2);
});
