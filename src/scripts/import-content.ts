// Bulk content importer — CHECKLIST STEPS 1-4 (skeleton, validator wiring,
// curriculum resolver, chunked writers + manifest).
// Default is --dry-run (reads only: prints validation + resolution plan).
// --apply WRITES to DATABASE_URL: chunked transactions, manifest under
// docs/verification/. One PrismaClient, sequential awaits (pooler rule).

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import {
  validateLesson,
  validateQuestion,
  type RawLesson,
  type RawQuestion,
} from "./import-validate";

interface Args {
  file: string;
  apply: boolean;
  author: string | null;
  batch: number;
  allowRemote: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { file: "", apply: false, author: null, batch: 25, allowRemote: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--file") args.file = argv[++i] ?? "";
    else if (flag === "--apply") args.apply = true;
    else if (flag === "--author") args.author = argv[++i] ?? null;
    else if (flag === "--batch") args.batch = Math.max(1, Number(argv[++i] ?? 25));
    else if (flag === "--allow-remote") args.allowRemote = true;
    else {
      console.error(`unknown flag: ${flag}`);
      process.exit(2);
    }
  }
  if (!args.file) {
    console.error("usage: import-content.ts --file <batch.json|batch.csv|batch.tsv> [--apply] [--author <user-id>] [--batch N] [--allow-remote]");
    process.exit(2);
  }
  if (args.apply && !args.author) {
    console.error("refusing --apply without --author (every row needs authored_by)");
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

/** UTF-8 loader: strips BOM, rejects null bytes, NFC-normalizes. */
function loadText(path: string): string {
  const raw = readFileSync(path);
  if (raw.includes(0)) {
    console.error(`encoding error: null bytes in ${path} (not UTF-8 text?)`);
    process.exit(2);
  }
  let text = raw.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text.normalize("NFC").replace(/\r\n?/g, "\n");
}

const CSV_COLUMNS = [
  "faculty", "year", "track", "module", "unit", "type", "source", "difficulty",
  "body", "option1", "option2", "option3", "option4", "option5", "option6",
  "correct_idx", "explanation", "exam_year", "sitting_label", "university",
] as const;

function splitRow(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

/** CSV/TSV → question rows. Tab wins when present, else `;`. */
function csvToQuestions(text: string): RawQuestion[] {
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const delimiter = lines[0].includes("\t") ? "\t" : ";";
  return lines.map((line) => {
    const cells = splitRow(line, delimiter);
    const row: Record<string, string> = {};
    for (let i = 0; i < CSV_COLUMNS.length && i < cells.length; i++) {
      const value = cells[i].trim();
      if (value.length > 0) row[CSV_COLUMNS[i]] = value;
    }
    const options: { text: string; correct: boolean }[] = [];
    const correctIdx = new Set(
      (row.correct_idx ?? "")
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 6)
    );
    for (let n = 1; n <= 6; n++) {
      const text = row[`option${n}`];
      if (text !== undefined) options.push({ text, correct: correctIdx.has(n) });
    }
    const question: RawQuestion = {
      faculty: row.faculty,
      year: row.year,
      track: row.track,
      module: row.module,
      unit: row.unit,
      type: row.type,
      source: row.source,
      difficulty: row.difficulty || null,
      body: row.body,
      options,
      explanation: row.explanation,
      university: row.university || null,
    };
    if (row.exam_year !== undefined) {
      const parsed = Number(row.exam_year);
      question.examYear = Number.isNaN(parsed) ? row.exam_year : parsed;
    }
    if (row.sitting_label !== undefined) question.sittingLabel = row.sitting_label;
    return question;
  });
}

interface Scope {
  faculty: string;
  year: string;
  track: string;
  module: string;
  unit: string;
}

function scopeOf(row: RawQuestion | RawLesson): Scope | null {
  const { faculty, year, track, module, unit } = row as Record<string, unknown>;
  if (
    typeof faculty !== "string" || typeof year !== "string" || typeof track !== "string" ||
    typeof module !== "string" || typeof unit !== "string"
  ) {
    return null;
  }
  return { faculty, year, track, module, unit };
}

/** Stable stringify: sorted keys, NFC, trimmed strings. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => JSON.stringify(key) + ":" + canonical(entry));
    return "{" + entries.join(",") + "}";
  }
  if (typeof value === "string") return JSON.stringify(value.trim().normalize("NFC"));
  return JSON.stringify(value) ?? "null";
}

/** Canonical dedup hash (INCLUDES sitting metadata — same stem in two
 *  sittings is two distinct bank rows). */
export function questionHash(
  unitId: string,
  type: string,
  body: string,
  options: { text: string; correct: boolean }[],
  examYear: number | null,
  sittingLabel: string | null
): string {
  const normalizedOptions = [...options]
    .map((o) => ({ text: o.text.trim().normalize("NFC"), correct: o.correct }))
    .sort((a, b) => (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
  return createHash("sha256")
    .update(
      canonical({ unitId, type, body: body.trim().normalize("NFC"), options: normalizedOptions, examYear, sittingLabel })
    )
    .digest("hex");
}

interface Resolved {
  facultyId: string;
  yearId: string;
  moduleId: string;
  unitId: string;
}

interface CreatedIds {
  years: string[];
  modules: string[];
  units: string[];
}

type Prisma = PrismaClient;

/** Lookup-or-create for year/module/unit. Behind --apply only when
 *  `write` is true; with write=false it only reports what WOULD be created
 *  (rows the dry-run flags, since BR-2 never covers curriculum). */
async function resolveScope(
  db: Prisma,
  scope: Scope,
  moduleOrder: number | null,
  unitOrder: number | null,
  write: boolean,
  plan: string[],
  created: CreatedIds
): Promise<Resolved | null> {
  const faculty = await db.faculty.findUnique({ where: { slug: scope.faculty }, select: { id: true } });
  if (!faculty) return null;
  const year = await db.year.findFirst({
    where: { facultyId: faculty.id, label: scope.year, track: scope.track },
    select: { id: true },
  });
  let yearId = year?.id ?? null;
  if (!yearId) {
    plan.push(`CREATE year "${scope.year}" [${scope.track}] under ${scope.faculty}`);
    if (!write) return null;
    const maxYear = await db.year.findFirst({
      where: { facultyId: faculty.id },
      orderBy: { orderIndex: "desc" },
      select: { orderIndex: true },
    });
    const createdYear = await db.year.create({
      data: { facultyId: faculty.id, label: scope.year, track: scope.track, orderIndex: (maxYear?.orderIndex ?? -1) + 1 },
      select: { id: true },
    });
    yearId = createdYear.id;
    created.years.push(yearId);
    plan.push(`  -> created ${yearId}`);
  }
  const mod = await db.module.findFirst({ where: { yearId, name: scope.module }, select: { id: true } });
  let moduleId = mod?.id ?? null;
  if (!moduleId) {
    plan.push(`CREATE module "${scope.module}" under year ${yearId}`);
    if (!write) return null;
    const maxMod = await db.module.findFirst({
      where: { yearId },
      orderBy: { orderIndex: "desc" },
      select: { orderIndex: true },
    });
    const createdModule = await db.module.create({
      data: { yearId, name: scope.module, orderIndex: moduleOrder ?? (maxMod?.orderIndex ?? -1) + 1 },
      select: { id: true },
    });
    moduleId = createdModule.id;
    created.modules.push(moduleId);
    plan.push(`  -> created ${moduleId}`);
  }
  const existingUnit = await db.unit.findFirst({ where: { moduleId, name: scope.unit }, select: { id: true } });
  let unitId = existingUnit?.id ?? null;
  if (!unitId) {
    plan.push(`CREATE unit "${scope.unit}" under module ${moduleId}`);
    if (!write) return null;
    const maxUnit = await db.unit.findFirst({
      where: { moduleId },
      orderBy: { orderIndex: "desc" },
      select: { orderIndex: true },
    });
    const createdUnit = await db.unit.create({
      data: { moduleId, name: scope.unit, orderIndex: unitOrder ?? (maxUnit?.orderIndex ?? -1) + 1 },
      select: { id: true },
    });
    unitId = createdUnit.id;
    created.units.push(unitId);
    plan.push(`  -> created ${unitId}`);
  }
  return { facultyId: faculty.id, yearId, moduleId, unitId };
}

interface Manifest {
  batch: string;
  author: string;
  appliedAt: string;
  created: Record<string, string[]>;
}

function newManifest(batch: string, author: string): Manifest {
  return {
    batch,
    author,
    appliedAt: new Date().toISOString(),
    created: { years: [], modules: [], units: [], lessons: [], lessonVersions: [], questions: [], options: [] },
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  dbGuard(args.apply, args.allowRemote);

  const text = loadText(args.file);
  let questions: RawQuestion[] = [];
  let lessons: RawLesson[] = [];
  if (args.file.endsWith(".json")) {
    const parsed: unknown = JSON.parse(text);
    const doc = (parsed ?? {}) as { questions?: RawQuestion[]; lessons?: RawLesson[] };
    questions = Array.isArray(doc.questions) ? doc.questions : [];
    lessons = Array.isArray(doc.lessons) ? doc.lessons : [];
  } else {
    questions = csvToQuestions(text);
  }

  // Pure validation first (no DB): every row gets file:row:reason findings.
  const validLessons: { row: number; lesson: RawLesson }[] = [];
  const validQuestions: { row: number; question: RawQuestion }[] = [];
  let rejected = 0;
  const reasons: string[] = [];

  lessons.forEach((lesson, index) => {
    const row = index + 1;
    const { errors } = validateLesson(lesson, row);
    if (errors.length === 0) {
      validLessons.push({ row, lesson });
    } else {
      rejected++;
      for (const finding of errors) reasons.push(`lessons:${finding.row}: ${finding.reason}`);
    }
  });

  let validQcm = 0;
  let validQcs = 0;
  let validQroc = 0;
  let other = 0;
  questions.forEach((question, index) => {
    const row = index + 1;
    const { errors, warnings } = validateQuestion(question, row, null);
    if (errors.length > 0) {
      rejected++;
      for (const finding of errors) reasons.push(`questions:${finding.row}: ${finding.reason}`);
      return;
    }
    validQuestions.push({ row, question });
    if (question.type === "QCM") validQcm++;
    else if (question.type === "QCS") validQcs++;
    else if (question.type === "QROC") validQroc++;
    else other++;
    for (const finding of warnings) reasons.push(`questions:${finding.row}: WARN ${finding.reason}`);
  });

  const prisma = new PrismaClient();

  // Resolution plan (reads only in dry-run; lookup-or-create under --apply).
  // Curriculum rows are PUBLIC immediately (no BR-2 gate), so creates print
  // explicitly — the owner sees them before applying.
  const plan: string[] = [];
  const created: CreatedIds = { years: [], modules: [], units: [] };
  const resolvedQuestions: { row: number; question: RawQuestion; resolved: Resolved }[] = [];
  const resolvedLessons: { row: number; lesson: RawLesson; resolved: Resolved }[] = [];
  let skipped = 0;

  for (const { row, lesson } of validLessons) {
    const scope = scopeOf(lesson);
    if (!scope) {
      rejected++;
      reasons.push(`lessons:${row}: scope fields malformed`);
      continue;
    }
    const resolved = await resolveScope(prisma, scope, null, null, args.apply, plan, created);
    if (!resolved) {
      if (!args.apply) {
        plan.push(`lessons:${row}: needs curriculum creates above — re-run with --apply`);
      } else {
        rejected++;
        reasons.push(`lessons:${row}: scope unresolvable`);
      }
      continue;
    }
    resolvedLessons.push({ row, lesson, resolved });
  }

  // Lesson dedup: same title already in the unit → skip (re-run safe).
  const lessonTitles = new Map<string, Set<string>>();
  async function unitTitles(unitId: string): Promise<Set<string>> {
    const cached = lessonTitles.get(unitId);
    if (cached) return cached;
    const existing = await prisma.lesson.findMany({ where: { unitId }, select: { title: true } });
    const set = new Set(existing.map((l) => l.title.trim().normalize("NFC").toLowerCase()));
    lessonTitles.set(unitId, set);
    return set;
  }

  // Hash pre-check: one SELECT per unit, in-memory compare (pooler-safe).
  const fingerprints = new Map<string, Set<string>>();
  async function unitHashes(unitId: string): Promise<Set<string>> {
    const cached = fingerprints.get(unitId);
    if (cached) return cached;
    const existing = await prisma.question.findMany({
      where: { unitId },
      select: { type: true, bodyRichtext: true, examYear: true, sittingLabel: true, options: { select: { bodyText: true } } },
    });
    const set = new Set<string>();
    for (const q of existing) {
      const body = typeof (q.bodyRichtext as { text?: unknown })?.text === "string"
        ? ((q.bodyRichtext as { text: string }).text)
        : JSON.stringify(q.bodyRichtext);
      const opts = q.options.map((o) => ({ text: o.bodyText, correct: false }));
      set.add(questionHash(unitId, q.type, body, opts, q.examYear, q.sittingLabel));
    }
    fingerprints.set(unitId, set);
    return set;
  }

  for (const { row, question } of validQuestions) {
    const scope = scopeOf(question);
    if (!scope) {
      rejected++;
      reasons.push(`questions:${row}: scope fields malformed`);
      continue;
    }
    const resolved = await resolveScope(prisma, scope, null, null, args.apply, plan, created);
    if (!resolved) {
      if (!args.apply) {
        plan.push(`questions:${row}: needs curriculum creates above — re-run with --apply`);
      } else {
        rejected++;
        reasons.push(`questions:${row}: scope unresolvable`);
      }
      continue;
    }
    const q = question;
    const opts = ((q.options ?? []) as { text?: unknown; correct?: unknown }[]).map((o) => ({
      text: typeof o.text === "string" ? o.text : "",
      correct: o.correct === true,
    }));
    const body = typeof q.body === "string" ? q.body : "";
    const examYear = typeof q.examYear === "number" ? q.examYear : null;
    const sittingLabel = typeof q.sittingLabel === "string" && q.sittingLabel.trim() ? q.sittingLabel.trim() : null;
    const hash = questionHash(resolved.unitId, String(q.type), body, opts, examYear, sittingLabel);
    const known = await unitHashes(resolved.unitId);
    if (known.has(hash)) {
      skipped++;
      reasons.push(`questions:${row}: skipped-duplicate (canonical hash already in unit)`);
      continue;
    }
    known.add(hash);
    resolvedQuestions.push({ row, question, resolved });
  }

  console.log(`file: ${args.file}`);
  console.log(`rows: lessons=${lessons.length} questions=${questions.length}`);
  console.log(`valid: lessons=${validLessons.length} QCM=${validQcm} QCS=${validQcs} QROC=${validQroc} other=${other}`);
  console.log(`resolution plan (${plan.length} lines):`);
  for (const line of plan) console.log(`  ${line}`);
  console.log(`skipped-duplicate=${skipped} rejected=${rejected}`);
  for (const reason of reasons) console.log(`  - ${reason}`);

  if (!args.apply) {
    console.log("mode: dry-run (reads: curriculum lookups + unit fingerprint SELECTs; no writes)");
    await prisma.$disconnect();
    process.exit(rejected > 0 ? 1 : 0);
  }

  // --apply writers: chunked transactions, sequential chunks.
  const manifest = newManifest(args.file, args.author as string);
  const chunks: { row: number; question: RawQuestion; resolved: Resolved }[][] = [];
  for (let i = 0; i < resolvedQuestions.length; i += args.batch) {
    chunks.push(resolvedQuestions.slice(i, i + args.batch));
  }
  let chunkIndex = 0;
  for (const chunk of chunks) {
    chunkIndex++;
    await prisma.$transaction(async (tx) => {
      for (const { question, resolved } of chunk) {
        const q = question;
        const opts = ((q.options ?? []) as { text?: unknown; correct?: unknown }[]).map((o, orderIndex) => ({
          bodyText: typeof o.text === "string" ? o.text : "",
          isCorrect: o.correct === true,
          orderIndex,
        }));
        const created = await tx.question.create({
          data: {
            unitId: resolved.unitId,
            type: String(q.type),
            source: String(q.source),
            status: "pending_review",
            difficulty: typeof q.difficulty === "string" ? q.difficulty : null,
            universityId: null,
            bodyRichtext: { text: typeof q.body === "string" ? q.body : "" },
            explanationRichtext: { text: typeof q.explanation === "string" ? q.explanation : "" },
            authoredBy: args.author as string,
            examYear: typeof q.examYear === "number" ? q.examYear : null,
            sittingLabel:
              typeof q.sittingLabel === "string" && q.sittingLabel.trim() ? q.sittingLabel.trim() : null,
            options: opts.length > 0 ? { create: opts } : undefined,
          },
          select: { id: true, options: { select: { id: true } } },
        });
        manifest.created.questions.push(created.id);
        for (const o of created.options) manifest.created.options.push(o.id);
      }
    });
    console.log(`chunk ${chunkIndex}/${chunks.length}: wrote ${chunk.length} questions`);
  }

  for (const { row, lesson, resolved } of resolvedLessons) {
    const l = lesson as Record<string, unknown>;
    const title = typeof l.title === "string" ? l.title : "";
    const titles = await unitTitles(resolved.unitId);
    if (titles.has(title.trim().normalize("NFC").toLowerCase())) {
      skipped++;
      reasons.push(`lessons:${row}: skipped-duplicate (same title already in unit)`);
      continue;
    }
    titles.add(title.trim().normalize("NFC").toLowerCase());
    const paragraphs = Array.isArray(l.body) ? (l.body as unknown[]).filter((p) => typeof p === "string") : [];
    await prisma.$transaction(async (tx) => {
      const createdLesson = await tx.lesson.create({
        data: {
          unitId: resolved.unitId,
          title: typeof l.title === "string" ? l.title : "",
          contentTier: String(l.contentTier ?? "hamame_authored"),
          universityId: null,
        },
        select: { id: true },
      });
      const version = await tx.lessonVersion.create({
        data: {
          lessonId: createdLesson.id,
          versionNumber: 1,
          status: "pending_review",
          authoredBy: args.author as string,
          bodyRichtext: { blocks: paragraphs.map((p) => ({ type: "paragraph", text: p as string })) },
        },
        select: { id: true },
      });
      manifest.created.lessons.push(createdLesson.id);
      manifest.created.lessonVersions.push(version.id);
    });
  }

  const manifestPath = `docs/verification/import-manifest-${Date.now()}.json`;
  manifest.created.years.push(...created.years);
  manifest.created.modules.push(...created.modules);
  manifest.created.units.push(...created.units);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`manifest: ${manifestPath}`);
  console.log(
    `created: lessons=${manifest.created.lessons.length} questions=${manifest.created.questions.length} ` +
    `options=${manifest.created.options.length} years=${manifest.created.years.length} ` +
    `modules=${manifest.created.modules.length} units=${manifest.created.units.length}`
  );
  await prisma.$disconnect();
  process.exit(rejected > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("import failed: " + (err as Error).message);
  process.exit(2);
});
