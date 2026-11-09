// hb-db → Hamame batch converter (Résidanat, MBset-parity filtering).
//
// Reads hb-db/out-years/<code>-<year>/quiz.json + expl/expl-NN.json (joined by
// `no`, NN=ceil(no/10)) and emits a single Hamame importer batch JSON
// ({ questions: RawQuestion[] }) that src/scripts/import-content.ts can
// dry-run (`--file ...` no writes) or apply (`--apply --author <uid>`).
//
// This script itself NEVER touches the DB — conversion only. Every label goes
// through src/lib/residanat-taxonomy.ts: faculty=slug map, year='Résidanat',
// track='medecine', module=category=canonical specialty, unit=subcategory
// (tidied)|'Général', period=one of the three épreuves, sittingLabel=
// 'Résidanat <year>[ — <session>]'. Exact repeats inside one paper are
// dropped; sections dated more than a year ahead are skipped as mislabeled.
// Combinaison is kept as "Combinaison" here; import-content maps it to QCM
// at write time (DB has no Combinaison type; scoring grades QCM/QCS only).
//
// Run (dry-run conversion + validator report, no DB):
//   npx tsx src/scripts/import-hb-db.ts --out hb-db/hamame-batch.json
//   npx tsx src/scripts/import-content.ts --file hb-db/hamame-batch.json   (dry-run)
// Apply (writes pending_review; stays hidden until academic review):
//   npx tsx src/scripts/import-content.ts --file hb-db/hamame-batch.json --apply --author <user-id> [--allow-production]
//
// Provenance: hb-db `correct[]` letters are PROVISIONAL (parity with
// residanat-papers/README: "MBset's keys are deliberately not a source").
// Every converted question lands pending_review; keys must be confirmed from
// official corrigés via the review queue before students see them.
// Nothing in this file is copied from a live MBset response.

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { validateQuestion, type RawQuestion } from "./import-validate";
import {
  canonicalEpreuve,
  canonicalSpecialty,
  facultyByCode,
  labelKey,
  RESIDANAT_TRACK,
  RESIDANAT_YEAR_LABEL,
  sittingLabelFor,
  tidyLabel,
} from "../lib/residanat-taxonomy";

const SRC_ROOT = "hb-db/out-years";
// Sittings are named by the residency year they open (MBset lists 2027), so
// next year is valid; anything later is a mislabeled section.
const LATEST_EXAM_YEAR = new Date().getUTCFullYear() + 1;

// Raw categories with no taxonomy entry — reported, never silently renamed.
const unmapped = new Map<string, number>();
let droppedDuplicates = 0;

interface Args {
  out: string;
  only: string[];
  limit: number | null;
  batchName: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { out: "hb-db/hamame-batch.json", only: [], limit: null, batchName: "hb-db" };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--out") args.out = argv[++i] ?? args.out;
    else if (flag === "--only") args.only = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (flag === "--limit") args.limit = Math.max(1, Number(argv[++i] ?? 0)) || null;
    else if (flag === "--batch-name") args.batchName = argv[++i] ?? args.batchName;
  }
  return args;
}

interface HbChoice {
  letter?: unknown;
  text?: unknown;
}

interface HbQuestion {
  no?: unknown;
  year?: unknown;
  type?: unknown;
  category?: unknown;
  subcategory?: unknown;
  period?: unknown;
  text?: unknown;
  choices?: unknown;
  correct?: unknown;
  correctFlags?: unknown;
  explMain?: unknown;
  explChoices?: unknown;
  casStory?: unknown;
  isGroup?: unknown;
  masterId?: unknown;
}

interface ExplEntry {
  main?: unknown;
  choices?: unknown;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function facet(v: unknown): string | null {
  const t = str(v);
  return t.length > 0 ? t : null;
}

/** Load + merge all expl/expl-NN.json in a section dir, keyed by String(no). */
function loadExpl(sectionDir: string): Map<string, ExplEntry> {
  const out = new Map<string, ExplEntry>();
  const explDir = join(sectionDir, "expl");
  let files: string[] = [];
  try {
    files = readdirSync(explDir).filter((f) => f.startsWith("expl-") && f.endsWith(".json")).sort();
  } catch {
    return out;
  }
  for (const f of files) {
    try {
      const raw = JSON.parse(readFileSync(join(explDir, f), "utf8")) as Record<string, ExplEntry>;
      for (const [k, v] of Object.entries(raw)) out.set(k, v);
    } catch {
      // unreadable expl file: fall back to quiz.explMain per question
    }
  }
  return out;
}

function buildExplanation(q: HbQuestion, expl: Map<string, ExplEntry>): string {
  const no = String(q.no ?? "");
  const entry = no ? expl.get(no) : undefined;
  const main = str(entry?.main) || str(q.explMain);
  const parts: string[] = [];
  if (main) parts.push(main);
  // Per-choice justifications: prefer expl/ (paraphrased), else quiz.explChoices.
  const choiceExpl: Record<string, string> = {};
  if (entry && typeof entry.choices === "object" && entry.choices !== null) {
    for (const [letter, text] of Object.entries(entry.choices as Record<string, unknown>)) {
      if (typeof text === "string" && text.trim()) choiceExpl[letter] = text.trim();
    }
  }
  const rawChoices = Array.isArray(q.explChoices) ? (q.explChoices as { letter?: unknown; text?: unknown }[]) : [];
  for (const c of rawChoices) {
    const letter = str(c.letter);
    const text = str(c.text);
    if (letter && text && !choiceExpl[letter]) choiceExpl[letter] = text;
  }
  // Deterministic A-E order; only documented letters are emitted.
  const letters = Object.keys(choiceExpl).sort();
  if (letters.length > 0) {
    parts.push(letters.map((l) => `${l} — ${choiceExpl[l]}`).join("\n"));
  }
  return parts.join("\n\n").trim();
}

function convertSection(sectionName: string, sectionDir: string, limit: number | null): RawQuestion[] {
  const dash = sectionName.indexOf("-");
  const code = sectionName.slice(0, dash);
  const yearStr = sectionName.slice(dash + 1);
  const examYear = Number(yearStr);
  const faculty = facultyByCode(code)?.slug;
  if (!faculty || !Number.isInteger(examYear) || examYear > LATEST_EXAM_YEAR) return [];

  const quizPath = join(sectionDir, "quiz.json");
  const raw = JSON.parse(readFileSync(quizPath, "utf8")) as HbQuestion[];
  const expl = loadExpl(sectionDir);

  const rows: RawQuestion[] = [];
  const seenInPaper = new Set<string>();
  const slice = limit === null ? raw : raw.slice(0, limit);
  for (const q of slice) {
    const rawCategory = tidyLabel(str(q.category));
    if (!rawCategory) continue;
    const specialty = canonicalSpecialty(rawCategory);
    if (!specialty) unmapped.set(rawCategory, (unmapped.get(rawCategory) ?? 0) + 1);
    const category = (specialty ?? rawCategory).slice(0, 120);
    const topic = tidyLabel(str(q.subcategory)).slice(0, 120);
    const unit = topic || "Général";
    const isClinicalCase = q.isGroup === true || str(q.casStory).length > 0;
    const period = canonicalEpreuve(str(q.period), category, isClinicalCase);
    const body = str(q.casStory) ? `${str(q.casStory)}\n\n${str(q.text)}` : str(q.text);

    const choices = Array.isArray(q.choices) ? (q.choices as HbChoice[]) : [];
    const dedupeKey = labelKey(body) + "#" + choices.map((c) => labelKey(str(c.text))).join("|");
    if (seenInPaper.has(dedupeKey)) {
      droppedDuplicates++;
      continue;
    }
    seenInPaper.add(dedupeKey);

    // Combinaison stores the key as combined strings ("ABCDE" = all five),
    // QCM/QCS as single letters. Expand combined strings into letters.
    const correctLetters = new Set<string>();
    if (Array.isArray(q.correct)) {
      for (const c of q.correct) {
        const s = String(c).trim();
        for (const ch of s) {
          if (ch >= "A" && ch <= "E") correctLetters.add(ch);
        }
      }
    }
    const rawType = str(q.type) || "QCM";
    // A "QCS" keyed with several letters is graded as a QCM in the real paper.
    const type = rawType === "QCS" && correctLetters.size > 1 ? "QCM" : rawType;
    let options: { text: string; correct: boolean }[] = [];
    if (type !== "QROC") {
      options = choices.map((c) => ({
        text: str(c.text),
        correct: correctLetters.has(str(c.letter)),
      }));
    }
    // Source gap (no expl/main): state the key only, never invent reasoning —
    // ai:backfill-explanations enriches these later.
    const explanation =
      buildExplanation(q, expl) ||
      (correctLetters.size > 0 ? `Réponse${correctLetters.size > 1 ? "s" : ""} : ${[...correctLetters].sort().join(", ")}.` : "");

    rows.push({
      faculty,
      year: RESIDANAT_YEAR_LABEL,
      track: RESIDANAT_TRACK,
      module: category,
      unit,
      type,
      source: "official_exam",
      difficulty: null,
      body,
      options,
      explanation,
      examYear,
      sittingLabel: sittingLabelFor(examYear, str(q.period)),
      university: null,
      category,
      subcategory: topic || null,
      period,
    });
  }
  return rows;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  const sections = readdirSync(SRC_ROOT)
    .filter((d) => d.includes("-"))
    // Only sections that actually carry quiz.json
    .filter((d) => {
      try {
        readFileSync(join(SRC_ROOT, d, "quiz.json"), "utf-8");
        return true;
      } catch {
        return false;
      }
    })
    .sort();

  // --only filters on hb-db CODE (alg,ora,...), not the mapped slug.
  const wanted = new Set(args.only.map((s) => s.trim().toLowerCase()));
  const selected = wanted.size === 0 ? sections : sections.filter((s) => wanted.has(s.split("-")[0]));

  console.log(`sections: ${selected.length}/${sections.length} selected`);
  for (const s of selected) console.log(`  ${s}`);

  const questions: RawQuestion[] = [];
  for (const s of selected) {
    const rows = convertSection(s, join(SRC_ROOT, s), args.limit);
    console.log(`${s}: ${rows.length} converted${args.limit !== null ? ` (limit ${args.limit})` : ""}`);
    questions.push(...rows);
  }

  // Validator dry-run (same pure checks the importer runs per row).
  let valid = 0;
  let rejected = 0;
  const rejectReasons = new Map<string, number>();
  for (let i = 0; i < questions.length; i++) {
    const { errors } = validateQuestion(questions[i], i + 1, null);
    if (errors.length === 0) {
      valid++;
    } else {
      rejected++;
      for (const e of errors) rejectReasons.set(e.reason, (rejectReasons.get(e.reason) ?? 0) + 1);
    }
  }
  console.log(`converted=${questions.length} valid=${valid} rejected=${rejected} droppedDuplicates=${droppedDuplicates}`);
  const specialties = new Map<string, number>();
  for (const q of questions) specialties.set(String(q.category), (specialties.get(String(q.category)) ?? 0) + 1);
  console.log(`specialties: ${specialties.size}`);
  for (const [name, n] of [...specialties.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${n}  ${name}`);
  const periods = new Map<string, number>();
  for (const q of questions) periods.set(String(q.period), (periods.get(String(q.period)) ?? 0) + 1);
  console.log(`épreuves: ${JSON.stringify(Object.fromEntries(periods))}`);
  console.log(`unmapped raw categories (kept as-is): ${unmapped.size}`);
  for (const [name, n] of unmapped) console.log(`  ${n}x ${name}`);
  console.log("reject reasons (top 20):");
  for (const [reason, n] of [...rejectReasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`  ${n}x ${reason}`);
  }

  mkdirSync("hb-db", { recursive: true });
  writeFileSync(args.out, JSON.stringify({ questions }, null, 2) + "\n", "utf8");
  console.log(`batch wrote: ${args.out} (${questions.length} questions)`);
  console.log(
    "next: npx tsx src/scripts/import-content.ts --file " +
      args.out +
      "  (dry-run)  ->  add --apply --author <user-id> to write pending_review"
  );
}

main();
