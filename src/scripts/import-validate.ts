// Pure row validators for the bulk importer (docs/state/09-content-import-plan.md §4).
// No Prisma, no fs, no network — every rule is a pure function so the logic is
// unit-checkable and reusable by both the dry-run reporter and the writers.

export type QuestionType = "QCM" | "QCS" | "QROC" | "CLINICAL_CASE";

export interface RawOption {
  text?: unknown;
  correct?: unknown;
}

export interface RawQuestion {
  faculty?: unknown;
  year?: unknown;
  track?: unknown;
  module?: unknown;
  unit?: unknown;
  type?: unknown;
  source?: unknown;
  difficulty?: unknown;
  body?: unknown;
  options?: unknown;
  answer?: unknown;
  explanation?: unknown;
  examYear?: unknown;
  sittingLabel?: unknown;
  university?: unknown;
}

export interface Finding {
  row: number;
  reason: string;
}

const TYPES: QuestionType[] = ["QCM", "QCS", "QROC", "CLINICAL_CASE"];
const SOURCES = ["official_exam", "hamame_authored", "ai_generated"];
const DIFFICULTIES = ["facile", "moyen", "difficile"];
const TRACKS = ["medecine", "dentaire", "pharmacie"];

const MAX_BODY = 5000;
const MAX_OPTION = 200;

function isBlank(value: unknown): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function asOptions(value: unknown): { text: string; correct: boolean }[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  const out: { text: string; correct: boolean }[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) return null;
    const record = entry as RawOption;
    out.push({ text: typeof record.text === "string" ? record.text : "", correct: record.correct === true });
  }
  return out;
}

/**
 * Validate one question row. Returns errors (reject the row) and warnings
 * (importable, flagged). `row` is the 1-based data-row number for reports.
 * `allowedSittings` null = no list file configured, no warnings emitted.
 */
export function validateQuestion(
  raw: RawQuestion,
  row: number,
  allowedSittings: string[] | null
): { errors: Finding[]; warnings: Finding[] } {
  const errors: Finding[] = [];
  const warnings: Finding[] = [];
  const fail = (reason: string) => errors.push({ row, reason });
  const warn = (reason: string) => warnings.push({ row, reason });

  for (const field of ["faculty", "year", "track", "module", "unit"] as const) {
    if (isBlank(raw[field])) fail(`missing scope field: ${field}`);
  }
  if (typeof raw.type !== "string" || !(TYPES as string[]).includes(raw.type)) {
    fail(`unknown type: ${String(raw.type)}`);
    return { errors, warnings };
  }
  const type = raw.type as QuestionType;

  if (typeof raw.source !== "string" || !SOURCES.includes(raw.source)) {
    fail(`unknown source: ${String(raw.source)}`);
  }
  if (raw.difficulty !== undefined && raw.difficulty !== null) {
    if (typeof raw.difficulty !== "string" || !DIFFICULTIES.includes(raw.difficulty)) {
      fail(`bad difficulty (facile|moyen|difficile|null): ${String(raw.difficulty)}`);
    }
  }
  if (typeof raw.track === "string" && !TRACKS.includes(raw.track)) {
    fail(`unknown track: ${String(raw.track)}`);
  }
  if (isBlank(raw.body)) {
    fail("missing body");
  } else if ((raw.body as string).length > MAX_BODY) {
    fail(`body over ${MAX_BODY} chars`);
  }

  if (type === "CLINICAL_CASE") {
    fail("clinical-out-of-v1");
    return { errors, warnings };
  }

  const options = asOptions(raw.options);
  if (options === null) {
    fail("options malformed (array of {text, correct} expected)");
    return { errors, warnings };
  }

  if (type === "QROC") {
    if (options.length > 0) fail("QROC must not carry options");
    if (raw.answer !== undefined && raw.answer !== null && String(raw.answer).trim().length > 0) {
      fail("QROC must not carry answer (put reference answer in explanation; no column stores a separate answer)");
    }
  } else {
    if (options.length < 2) fail("fewer than 2 options");
    const correct = options.filter((o) => o.correct).length;
    if (type === "QCM" && correct === 0) fail("QCM with no correct option");
    if (type === "QCS" && correct !== 1) fail(`QCS with ${correct} correct options (need exactly 1)`);
    const seen = new Set<string>();
    for (const option of options) {
      if (isBlank(option.text)) {
        fail("blank option text");
        continue;
      }
      if (option.text.length > MAX_OPTION) fail(`option over ${MAX_OPTION} chars`);
      const key = option.text.trim().normalize("NFC").toLowerCase();
      if (seen.has(key)) fail(`duplicate option text: ${option.text.trim()}`);
      seen.add(key);
    }
  }

  if (isBlank(raw.explanation)) {
    fail("missing explanation (required: schema non-null)");
  }

  if (raw.examYear !== undefined && raw.examYear !== null) {
    if (typeof raw.examYear !== "number" || !Number.isInteger(raw.examYear) || raw.examYear < 1000 || raw.examYear > 9999) {
      fail(`bad examYear (4-digit int): ${String(raw.examYear)}`);
    }
  }
  if (typeof raw.sittingLabel === "string" && raw.sittingLabel.trim().length > 0) {
    if (allowedSittings !== null && !allowedSittings.includes(raw.sittingLabel.trim())) {
      warn(`sittingLabel outside list file: ${raw.sittingLabel.trim()}`);
    }
  }

  return { errors, warnings };
}

export interface RawLesson {
  faculty?: unknown;
  year?: unknown;
  track?: unknown;
  module?: unknown;
  unit?: unknown;
  title?: unknown;
  contentTier?: unknown;
  body?: unknown;
  university?: unknown;
}

export function validateLesson(
  raw: RawLesson,
  row: number
): { errors: Finding[]; warnings: Finding[] } {
  const errors: Finding[] = [];
  const warnings: Finding[] = [];
  const fail = (reason: string) => errors.push({ row, reason });

  for (const field of ["faculty", "year", "track", "module", "unit"] as const) {
    if (isBlank(raw[field])) fail(`missing scope field: ${field}`);
  }
  if (isBlank(raw.title)) fail("missing title");
  if (raw.contentTier !== "official" && raw.contentTier !== "hamame_plus") {
    fail(`bad contentTier (official|hamame_plus): ${String(raw.contentTier)}`);
  }
  if (!Array.isArray(raw.body) || raw.body.length === 0 || raw.body.some((p) => isBlank(p))) {
    fail("body needs ≥1 non-empty paragraph");
  }
  return { errors, warnings };
}
