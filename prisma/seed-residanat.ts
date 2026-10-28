import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

/**
 * Résidanat catalog scaffold seed (2026-10-28, handoff §38).
 *
 * Adds the Résidanat PARITY STRUCTURE the catalog was missing: specialty
 * MODULE names under every existing 'Résidanat' stage Year row, per track
 * ('medecine' | 'dentaire' | 'pharmacie'). The Year rows themselves come
 * from prisma/seed.ts (each wilaya faculty gets 'Internat' + 'Résidanat'
 * per track); this script also recreates any missing 'Résidanat' Year row
 * for safety, then seeds the taxonomy modules under it.
 *
 * The sitting-year dimension (exam years 2005-2026) deliberately stays on
 * Question.examYear/sittingLabel + the bank-derived sitting picker — that is
 * the recorded bank-coverage design (handoff §37: MedSpark's exam-appearance
 * metric is not imported). See docs/residanat-sittings.md for the ladder.
 *
 * Taxonomy provenance: standard Algerian residency specialty nomenclature
 * (starter list, owner-extendable), cross-checked at NAME level against
 * MedSpark's public client bundle (see
 * docs/verification/2026-10-28-medspark-residanat-recon.log). Module names
 * are the intentionally-untranslated curriculum vocabulary (FR), matching
 * 'Internat'/'Résidanat' labels. NO question/answer/explanation content —
 * or any other MedSpark content — is created here.
 *
 * Idempotency: findFirst-by-(yearId,name), the same pattern seed.ts uses for
 * wilaya Year rows (documented deviation from the fixed-UUID convention,
 * which stays in force for fixture rows). Re-runs report 0 created and
 * reconcile orderIndex drift. The seeded fixture modules (Year 1 Cardiology
 * under the 'medicine' faculty) are untouched: only wilaya-faculty
 * 'Résidanat' Year rows are targeted.
 *
 * Safety: DRY-RUN BY DEFAULT; pass --apply to write. Connection uses the
 * standing pooler workaround (handoff §34): process-local DATABASE_URL
 * transform ':5432' -> ':6543' + '&pgbouncer=true' (never '?pgbouncer=true'
 * — appending '?' to a URL that already carries a query string produced an
 * invalid connection string once). Sequential awaits only (session-pooler
 * concurrency limits).
 *
 * Run: npx tsx prisma/seed-residanat.ts [--apply]
 * Raw evidence: docs/verification/2026-10-28-residanat-catalog-raw.log
 */

const LOG_PATH = "docs/verification/2026-10-28-residanat-catalog-raw.log";

// Starter Résidanat specialty taxonomies per track (owner-extendable).
// Name-level only; standard Algerian residency specialty vocabulary.
const RESIDANAT_MEDICINE_MODULES = [
  "Anesthésie-réanimation",
  "Cardiologie",
  "Chirurgie générale",
  "Chirurgie infantile",
  "Chirurgie orthopédique",
  "Chirurgie thoracique et cardio-vasculaire",
  "Chirurgie urologique",
  "Dermatologie",
  "Gastro-entérologie",
  "Gynécologie-obstétrique",
  "Néphrologie",
  "Neurochirurgie",
  "Neurologie",
  "Oncologie médicale",
  "Ophtalmologie",
  "ORL-chirurgie cervico-faciale",
  "Pédiatrie",
  "Pneumologie",
  "Psychiatrie",
  "Urgences médicales",
];

const RESIDANAT_DENTISTRY_MODULES = [
  "Chirurgie buccale",
  "Dentisterie pédiatrique",
  "Odontologie conservatrice et endodontie",
  "Médecine buccale",
  "Orthopédie dento-faciale",
  "Parodontologie",
  "Prothèse dentaire",
];

const RESIDANAT_PHARMACY_MODULES = [
  "Biologie clinique",
  "Pharmacie hospitalière",
  "Radiopharmacie",
  "Toxicologie",
];

const TAXONOMY: Record<string, string[]> = {
  medecine: RESIDANAT_MEDICINE_MODULES,
  dentaire: RESIDANAT_DENTISTRY_MODULES,
  pharmacie: RESIDANAT_PHARMACY_MODULES,
};

// Same wilaya-faculty roster as prisma/seed.ts WILAYA_FACULTIES (source of
// truth there; keep in sync).
const WILAYA_FACULTY_SLUGS = [
  "fac-alger",
  "fac-oran",
  "fac-constantine",
  "fac-annaba",
  "fac-blida",
  "fac-tlemcen",
  "fac-setif",
  "fac-batna",
  "fac-bejaia",
  "fac-tizi-ouzou",
  "fac-sidi-bel-abbes",
  "fac-mostaganem",
  "fac-ouargla",
  "fac-tebessa",
  "fac-djelfa",
];

const TRACKS = ["medecine", "dentaire", "pharmacie"];

function residanatYearOrderIndex(track: string): number {
  // Matches prisma/seed.ts TRACK_YEARS ladder positions:
  // medecine has 8 stage labels (Résidanat at index 7),
  // dentaire/pharmacie have 7 (Résidanat at index 6).
  return track === "medecine" ? 7 : 6;
}

// -- logging -----------------------------------------------------------------

const logLines: string[] = [];
function log(line: string): void {
  console.log(line);
  logLines.push(line);
}
function flushLog(): void {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.writeFileSync(LOG_PATH, logLines.join("\r\n") + "\r\n", "utf8");
  console.log(`log written: ${LOG_PATH}`);
}

// -- pooler-safe connection (handoff §34; process-local only) ----------------

function buildDatasourceUrl(): string | null {
  const raw = process.env.DATABASE_URL;
  if (!raw) return null;
  const transformed = raw
    // Exact documented precedent (tmp-verify-* pooler workaround, handoff §34):
    // first ':5432' -> ':6543', then append '&pgbouncer=true' — never
    // '?pgbouncer=true' (appending '?' to a URL with an existing query
    // produced an invalid connection string once).
    .replace(/(:5432)/, ":6543");
  const withPoolerParam = raw.includes("pgbouncer")
    ? raw
    : transformed + "&pgbouncer=true";
  return withPoolerParam;
}

interface PlannedCreate {
  facultyName: string;
  slug: string;
  track: string;
  items: string[];
  yearExisted: boolean;
}

async function main(): Promise<number> {
  log("# Résidanat catalog scaffold seed — raw run log");
  log(`# date: ${new Date().toISOString()}`);
  log(`# mode: ${process.argv.includes("--apply") ? "APPLY" : "dry-run"}`);
  log("# taxonomy source: standard Algerian residency specialty nomenclature");
  log("# (starter, owner-extendable); MedSpark structures used at name level");
  log("# only — no question/answer/explanation content created (see the");
  log("# companion recon log for the exact structure evidence).");

  const transformedUrl = buildDatasourceUrl();
  if (!transformedUrl) {
    log("FATAL: DATABASE_URL is not set.");
    flushLog();
    return 1;
  }
  log("# connection: transaction-pooler transform applied (6543 + pgbouncer), process-local.");

  const prisma = new PrismaClient({
    datasources: { db: { url: transformedUrl } },
  });

  try {
    // 1. BEFORE snapshot — Résidanat year rows and modules under them.
    const yearsBefore = await prisma.year.findMany({
      where: { label: "Résidanat" },
      select: { id: true, facultyId: true, track: true },
    });
    const modulesBefore = await prisma.module.count({
      where: { year: { label: "Résidanat" } },
    });
    log(
      `BEFORE: residanat year rows=${yearsBefore.length} (expected 45 = 15 faculties x 3 tracks)`
    );
    log(`BEFORE: modules under residanat year rows=${modulesBefore}`);

    // 2. Resolve the wilaya faculties by slug.
    const faculties: {
      id: string;
      name: string;
      slug: string;
    }[] = [];
    const missingSlugs: string[] = [];
    for (const slug of WILAYA_FACULTY_SLUGS) {
      const faculty = await prisma.faculty.findUnique({
        where: { slug },
        select: { id: true, name: true, slug: true },
      });
      if (faculty) faculties.push(faculty);
      else missingSlugs.push(slug);
    }
    if (missingSlugs.length > 0) {
      log(`FATAL: faculties not found by slug: ${missingSlugs.join(", ")}`);
      return 1;
    }
    log(`faculties resolved: ${faculties.length}/${WILAYA_FACULTY_SLUGS.length}`);

    // 3. Plan.
    let plannedYearCreates = 0;
    let plannedModuleCreates = 0;
    let plannedOrderFixes = 0;
    const plans: PlannedCreate[] = [];

    for (const faculty of faculties) {
      for (const track of TRACKS) {
        const existingYear = await prisma.year.findFirst({
          where: { facultyId: faculty.id, label: "Résidanat", track },
          select: { id: true },
        });
        const yearExisted = existingYear !== null;
        if (!yearExisted) plannedYearCreates += 1;
        const taxonomy = TAXONOMY[track];
        const toCreate: string[] = [];
        if (existingYear) {
          // One findMany per year (pooler-friendly) instead of findFirst per name.
          const yearModules = await prisma.module.findMany({
            where: { yearId: existingYear.id },
            select: { name: true, orderIndex: true },
          });
          const byName = new Map(yearModules.map((m) => [m.name, m.orderIndex]));
          for (let i = 0; i < taxonomy.length; i++) {
            const existingOrder = byName.get(taxonomy[i]);
            if (existingOrder === undefined) {
              toCreate.push(taxonomy[i]);
              plannedModuleCreates += 1;
            } else if (existingOrder !== i) {
              plannedOrderFixes += 1;
            }
          }
        } else {
          for (let i = 0; i < taxonomy.length; i++) {
            toCreate.push(taxonomy[i]);
            plannedModuleCreates += 1;
          }
        }
        plans.push({
          facultyName: faculty.name,
          slug: faculty.slug,
          track,
          items: toCreate,
          yearExisted,
        });
      }
    }

    for (const plan of plans) {
      log(
        `PLAN ${plan.slug} ${plan.track}: ${plan.items.length} modules to create (year row ${plan.yearExisted ? "exists" : "MISSING -> creates"})`
      );
    }
    log(
      `PLAN TOTAL: year creates=${plannedYearCreates}, module creates=${plannedModuleCreates}, orderIndex fixes=${plannedOrderFixes}`
    );

    if (!process.argv.includes("--apply")) {
      log("DRY-RUN: nothing written. Re-run with --apply to write.");
      return 0;
    }

    // 4. APPLY.
    let createdYears = 0;
    let createdModules = 0;
    let orderFixes = 0;

    for (const faculty of faculties) {
      for (const track of TRACKS) {
        let yearRow = await prisma.year.findFirst({
          where: { facultyId: faculty.id, label: "Résidanat", track },
          select: { id: true },
        });
        if (!yearRow) {
          yearRow = await prisma.year.create({
            data: {
              facultyId: faculty.id,
              label: "Résidanat",
              track,
              orderIndex: residanatYearOrderIndex(track),
            },
            select: { id: true },
          });
          createdYears += 1;
        }
        const taxonomy = TAXONOMY[track];
        // One findMany per year, diff in memory (pooler-friendly).
        const yearModules = await prisma.module.findMany({
          where: { yearId: yearRow.id },
          select: { id: true, name: true, orderIndex: true },
        });
        const byName = new Map(yearModules.map((m) => [m.name, m]));
        for (let i = 0; i < taxonomy.length; i++) {
          const existing = byName.get(taxonomy[i]);
          if (!existing) {
            await prisma.module.create({
              data: {
                yearId: yearRow.id,
                name: taxonomy[i],
                orderIndex: i,
              },
            });
            createdModules += 1;
          } else if (existing.orderIndex !== i) {
            await prisma.module.update({
              where: { id: existing.id },
              data: { orderIndex: i },
            });
            orderFixes += 1;
          }
        }
      }
    }

    // 5. AFTER snapshot — fresh counts, re-queried after the writes.
    const modulesAfter = await prisma.module.count({
      where: { year: { label: "Résidanat" } },
    });
    const yearsAfter = await prisma.year.count({
      where: { label: "Résidanat" },
    });
    log(
      `CREATED: years=${createdYears}, modules=${createdModules}, order-index fixes=${orderFixes}`
    );
    log(`AFTER: residanat year rows=${yearsAfter}`);
    log(`AFTER: modules under residanat year rows=${modulesAfter}`);
    log(
      `INVARIANT ${modulesAfter === modulesBefore + createdModules && yearsAfter === yearsBefore.length + createdYears ? "OK" : "FAIL"} (before + created == after)`
    );

    // 6. Real-API sample probe of one faculty's Résidanat (medecine) modules.
    const sampleFaculty = faculties[0];
    const sampleYear = await prisma.year.findFirst({
      where: { facultyId: sampleFaculty.id, label: "Résidanat", track: "medecine" },
      select: { id: true },
    });
    if (sampleYear) {
      const sampleModules = await prisma.module.findMany({
        where: { yearId: sampleYear.id },
        orderBy: { orderIndex: "asc" },
        select: { name: true, orderIndex: true },
      });
      log(`SAMPLE ${sampleFaculty.slug} residanat/medecine yearId=${sampleYear.id}`);
      for (const mod of sampleModules) {
        log(`  ${mod.orderIndex} ${mod.name}`);
      }
    }
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then((code) => {
    flushLog();
    process.exit(code);
  })
  .catch((err) => {
    console.error(err);
    logLines.push(`FATAL: ${String(err)}`);
    flushLog();
    process.exit(1);
  });
