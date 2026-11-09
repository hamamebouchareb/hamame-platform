/**
 * Catalogue cleanup — drops the seeded (fake) curriculum so the only catalogue
 * left is the real hb-db Résidanat one (src/lib/residanat-taxonomy.ts).
 *
 *   npx tsx prisma/cleanup-catalog.ts            # dry-run: report only
 *   npx tsx prisma/cleanup-catalog.ts --apply    # write
 *
 * What it does:
 *   1. Real faculties (RESIDANAT_FACULTIES): rename to the taxonomy name, set live.
 *   2. Faculties with no hb-db paper (Béjaïa, Djelfa, …): delete with their whole
 *      catalogue; users/subscriptions/resources pointing at them are un-scoped.
 *   3. Inside real faculties: delete every year/module/unit that holds no question
 *      and no lesson, except the faculty's single Résidanat/medecine year.
 *   4. hb-db pilot rows (official_exam + examYear) filed under the pre-taxonomy
 *      labels: deleted when nothing references them, otherwise set to 'rejected'
 *      so the full re-import (canonical units) does not show them twice.
 *
 * Anything with a hard reference (activation codes, simulations, study groups,
 * leaderboard snapshots, lessons, questions) is SKIPPED and reported, never forced.
 * Fixtures 'medicine' / 'dentistry' (tests + verify scripts) are left untouched.
 */
import { PrismaClient } from "@prisma/client";
import {
  RESIDANAT_FACULTIES,
  RESIDANAT_TRACK,
  RESIDANAT_YEAR_LABEL,
  canonicalSpecialty,
} from "../src/lib/residanat-taxonomy";

const APPLY = process.argv.includes("--apply");
const FIXTURE_SLUGS = new Set(["medicine", "dentistry"]);

/** Pooler-safe URL (handoff §34, process-local only): ':5432' -> ':6543' then
 *  append '&pgbouncer=true' — never '?pgbouncer=true' (the URL already has a query). */
function buildDatasourceUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  return raw.includes("pgbouncer") ? raw : raw.replace(/(:5432)/, ":6543") + "&pgbouncer=true";
}

const datasourceUrl = buildDatasourceUrl();
const prisma = new PrismaClient(datasourceUrl ? { datasourceUrl } : undefined);

const report: string[] = [];
const log = (line: string) => report.push(line);

type YearRow = { id: string; label: string; track: string | null };

/** Question ids the pilot step removes (so their units count as empty). */
const pilotDeleted = new Set<string>();

async function pilotRows(): Promise<void> {
  const pilots = await prisma.question.findMany({
    where: { source: "official_exam", examYear: { not: null }, status: { not: "rejected" } },
    select: {
      id: true,
      category: true,
      unit: { select: { name: true, module: { select: { name: true } } } },
      _count: { select: { sessionQuestions: true, notes: true, reviewQueueItems: true, flashcards: true } },
    },
  });
  let deleted = 0;
  let retired = 0;
  let kept = 0;
  for (const q of pilots) {
    const canonical = q.category ? canonicalSpecialty(q.category) : null;
    if (canonical && canonical === q.category && q.unit.module.name === canonical) {
      kept++;
      continue;
    }
    const c = q._count;
    const referenced = c.sessionQuestions + c.notes + c.reviewQueueItems + c.flashcards > 0;
    if (referenced) {
      retired++;
      if (APPLY) {
        await prisma.question.update({
          where: { id: q.id },
          data: { status: "rejected", reviewComment: "Superseded by the hb-db import (canonical Résidanat taxonomy)." },
        });
      }
    } else {
      deleted++;
      pilotDeleted.add(q.id);
      if (APPLY) {
        await prisma.$transaction([
          prisma.questionOption.deleteMany({ where: { questionId: q.id } }),
          prisma.clinicalCasePart.deleteMany({ where: { questionId: q.id } }),
          prisma.question.delete({ where: { id: q.id } }),
        ]);
      }
    }
  }
  log(`pilot hb-db rows: ${pilots.length} found, ${deleted} delete, ${retired} reject (in use), ${kept} already canonical`);
}

/** Why a year cannot be deleted, or null when it is safe. */
async function yearBlocker(yearId: string): Promise<string | null> {
  const [codes, sims, groups, boards] = await Promise.all([
    prisma.activationCode.count({ where: { yearId } }),
    prisma.simulation.count({ where: { yearId } }),
    prisma.studyGroup.count({ where: { yearId } }),
    prisma.leaderboardSnapshot.count({ where: { yearId } }),
  ]);
  const hard = [
    codes && `${codes} activation code(s)`,
    sims && `${sims} simulation(s)`,
    groups && `${groups} study group(s)`,
    boards && `${boards} leaderboard snapshot(s)`,
  ].filter(Boolean);
  return hard.length > 0 ? hard.join(", ") : null;
}

/** Deletes empty units/modules of a year; deletes the year too unless keepYear. */
async function pruneYear(year: YearRow, keepYear: boolean, tag: string): Promise<{ year: boolean; modules: number; units: number }> {
  const modules = await prisma.module.findMany({
    where: { yearId: year.id },
    select: {
      id: true,
      units: { select: { id: true, _count: { select: { lessons: true } }, questions: { select: { id: true } } } },
    },
  });
  let unitsGone = 0;
  let modulesGone = 0;
  let yearEmpty = true;
  for (const mod of modules) {
    const emptyUnits = mod.units.filter(
      (u) => u._count.lessons === 0 && u.questions.every((q) => pilotDeleted.has(q.id))
    );
    const moduleEmpty = emptyUnits.length === mod.units.length;
    if (!moduleEmpty) yearEmpty = false;
    if (APPLY && emptyUnits.length > 0) {
      await prisma.unit.deleteMany({ where: { id: { in: emptyUnits.map((u) => u.id) } } });
    }
    unitsGone += emptyUnits.length;
    if (moduleEmpty) {
      if (APPLY) {
        await prisma.progress.updateMany({ where: { subjectModuleId: mod.id }, data: { subjectModuleId: null } });
        await prisma.studyInvite.updateMany({ where: { moduleId: mod.id }, data: { moduleId: null } });
        await prisma.module.delete({ where: { id: mod.id } });
      }
      modulesGone++;
    }
  }
  if (keepYear) return { year: false, modules: modulesGone, units: unitsGone };
  if (!yearEmpty) {
    log(`  keep ${tag} "${year.label}" [${year.track ?? "-"}]: still holds questions/lessons`);
    return { year: false, modules: modulesGone, units: unitsGone };
  }
  const blocker = await yearBlocker(year.id);
  if (blocker) {
    log(`  keep ${tag} "${year.label}" [${year.track ?? "-"}]: referenced by ${blocker}`);
    return { year: false, modules: modulesGone, units: unitsGone };
  }
  if (APPLY) {
    await prisma.user.updateMany({ where: { yearId: year.id }, data: { yearId: null } });
    await prisma.subscription.updateMany({ where: { yearId: year.id }, data: { yearId: null } });
    await prisma.resource.updateMany({ where: { yearId: year.id }, data: { yearId: null } });
    await prisma.year.delete({ where: { id: year.id } });
  }
  return { year: true, modules: modulesGone, units: unitsGone };
}

async function main(): Promise<void> {
  console.log(APPLY ? "mode: APPLY (writes)" : "mode: dry-run (no writes; add --apply)");
  await pilotRows();

  const realBySlug = new Map(RESIDANAT_FACULTIES.map((f) => [f.slug, f]));
  const faculties = await prisma.faculty.findMany({
    select: { id: true, slug: true, name: true, rolloutStatus: true, years: { select: { id: true, label: true, track: true } } },
    orderBy: { slug: "asc" },
  });

  const totals = { years: 0, modules: 0, units: 0, faculties: 0 };
  for (const fac of faculties) {
    if (FIXTURE_SLUGS.has(fac.slug)) {
      log(`fixture ${fac.slug}: untouched`);
      continue;
    }
    const real = realBySlug.get(fac.slug);
    if (real) {
      if (fac.name !== real.name || fac.rolloutStatus !== "live") {
        log(`faculty ${fac.slug}: "${fac.name}" (${fac.rolloutStatus}) -> "${real.name}" (live)`);
        if (APPLY) await prisma.faculty.update({ where: { id: fac.id }, data: { name: real.name, rolloutStatus: "live" } });
      }
      const keeper =
        fac.years.find((y) => y.label === RESIDANAT_YEAR_LABEL && y.track === RESIDANAT_TRACK) ?? null;
      for (const year of fac.years) {
        const r = await pruneYear(year, year.id === keeper?.id, fac.slug);
        totals.years += r.year ? 1 : 0;
        totals.modules += r.modules;
        totals.units += r.units;
      }
      continue;
    }

    // Not a real hb-db faculty: remove entirely when nothing hard-references it.
    const [codes, sims, groups, boards] = await Promise.all([
      prisma.activationCode.count({ where: { facultyId: fac.id } }),
      prisma.simulation.count({ where: { facultyId: fac.id } }),
      prisma.studyGroup.count({ where: { facultyId: fac.id } }),
      prisma.leaderboardSnapshot.count({ where: { facultyId: fac.id } }),
    ]);
    let removable = codes + sims + groups + boards === 0;
    let yearsGone = 0;
    for (const year of fac.years) {
      const r = await pruneYear(year, false, fac.slug);
      totals.modules += r.modules;
      totals.units += r.units;
      if (r.year) yearsGone++;
      else removable = false;
    }
    totals.years += yearsGone;
    if (!removable) {
      log(`faculty ${fac.slug}: no hb-db paper but still referenced — hidden (planned), not deleted`);
      if (APPLY) await prisma.faculty.update({ where: { id: fac.id }, data: { rolloutStatus: "planned" } });
      continue;
    }
    log(`faculty ${fac.slug} ("${fac.name}"): delete (no hb-db paper)`);
    if (APPLY) {
      await prisma.user.updateMany({ where: { facultyId: fac.id }, data: { facultyId: null, yearId: null } });
      await prisma.subscription.updateMany({ where: { facultyId: fac.id }, data: { facultyId: null } });
      await prisma.resource.updateMany({ where: { facultyId: fac.id }, data: { facultyId: null } });
      await prisma.faculty.delete({ where: { id: fac.id } });
    }
    totals.faculties++;
  }

  for (const line of report) console.log(line);
  console.log(
    `${APPLY ? "removed" : "would remove"}: ${totals.faculties} faculties, ${totals.years} years, ${totals.modules} modules, ${totals.units} units`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
