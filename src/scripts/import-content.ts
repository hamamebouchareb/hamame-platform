// Bulk content importer — CHECKLIST STEPS 1+2 ONLY (skeleton + validator).
// Parses argv, loads UTF-8/BOM/NFC input, converts CSV/TSV rows to the JSON
// model, validates every row, and prints the dry-run report. No DB writes:
// --apply is rejected until checklist step 4 (writers) lands.

import { readFileSync } from "node:fs";
import { validateLesson, validateQuestion, type RawLesson, type RawQuestion } from "./import-validate";

interface Args {
  file: string;
  apply: boolean;
  author: string | null;
  batch: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { file: "", apply: false, author: null, batch: 25 };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--file") args.file = argv[++i] ?? "";
    else if (flag === "--apply") args.apply = true;
    else if (flag === "--author") args.author = argv[++i] ?? null;
    else if (flag === "--batch") args.batch = Number(argv[++i] ?? 25);
    else {
      console.error(`unknown flag: ${flag}`);
      process.exit(2);
    }
  }
  if (!args.file) {
    console.error("usage: import-content.ts --file <batch.json|batch.csv|batch.tsv> [--apply] [--author <user-id>] [--batch N]");
    process.exit(2);
  }
  return args;
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

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.apply) {
    console.error("refusing --apply: writers land in checklist step 4 (this build is skeleton + validator only)");
    process.exit(2);
  }

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

  let validQcm = 0;
  let validQcs = 0;
  let validQroc = 0;
  let validLessons = 0;
  let skipped = 0;
  let rejected = 0;
  const reasons: string[] = [];

  lessons.forEach((lesson, index) => {
    const row = index + 1;
    const { errors } = validateLesson(lesson, row);
    if (errors.length === 0) {
      validLessons++;
    } else {
      rejected++;
      for (const finding of errors) reasons.push(`lessons:${finding.row}: ${finding.reason}`);
    }
  });

  questions.forEach((question, index) => {
    const row = index + 1;
    const { errors, warnings } = validateQuestion(question, row, null);
    if (errors.length > 0) {
      rejected++;
      for (const finding of errors) reasons.push(`questions:${finding.row}: ${finding.reason}`);
      return;
    }
    if (question.type === "QCM") validQcm++;
    else if (question.type === "QCS") validQcs++;
    else if (question.type === "QROC") validQroc++;
    else skipped++;
    for (const finding of warnings) reasons.push(`questions:${finding.row}: WARN ${finding.reason}`);
  });

  console.log(`file: ${args.file}`);
  console.log(`rows: lessons=${lessons.length} questions=${questions.length}`);
  console.log(`valid: lessons=${validLessons} QCM=${validQcm} QCS=${validQcs} QROC=${validQroc} other=${skipped}`);
  console.log(`rejected=${rejected}`);
  for (const reason of reasons) console.log(`  - ${reason}`);
  console.log("mode: dry-run (no DB writes; writers land in checklist step 4)");
  process.exit(rejected > 0 ? 1 : 0);
}

main();
