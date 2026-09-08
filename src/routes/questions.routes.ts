import { NextFunction, Request, Response, Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { validateBody, validateParams, validateQuery } from "../middleware/validate";
import { paginationQuery, uuidParam } from "../lib/common-schemas";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { buildQuestionWhere } from "../lib/question-filters";
import { resolveViewerUniversityId, universityScopeFilter } from "../lib/university-scope";

// docs/hamame_api_contract.md — "Question Bank & Sessions" section (question-level
// endpoints; session-lifecycle endpoints live in sessions.routes.ts).
const router = Router();

// GET /api/questions — filtered list, FR-15. Left public like curriculum browsing;
// the free plan includes full question-bank access per PRD BR-1, so listing itself
// does not require a paid plan, only (arguably) authentication — revisit if guests
// should NOT see this.
const listQuestionsQuerySchema = paginationQuery.extend({
  facultyId: z.string().uuid().optional(),
  yearId: z.string().uuid().optional(),
  moduleId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  type: z.enum(["QCM", "QCS", "QROC", "CLINICAL_CASE"]).optional(),
  source: z.enum(["official_exam", "hamame_authored", "ai_generated"]).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  examYear: z.coerce.number().int().min(1000).max(9999).optional(),
  sittingLabel: z.string().min(1).max(120).optional(),
});

async function listQuestions(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, facultyId, yearId, moduleId, unitId, type, source, dateFrom, dateTo, examYear, sittingLabel } =
      req.query as unknown as z.infer<typeof listQuestionsQuerySchema>;

    // status: 'approved' is enforced inside buildQuestionWhere by default — BR-2
    // mandatory validation gate. pending_review/rejected questions must never reach
    // students through this endpoint.
    //
    // This endpoint stays public, so req.auth is frequently absent — optionalAuth below
    // exists purely so a signed-in student's university can be read here at all. An
    // anonymous caller resolves to null, i.e. global questions only (FR-10a).
    const viewerUniversityId = await resolveViewerUniversityId(prisma, req.auth?.userId);
    const where = buildQuestionWhere({
      unitId,
      moduleId,
      yearId,
      facultyId,
      type,
      source,
      dateFrom,
      dateTo,
      examYear,
      sittingLabel,
      viewerUniversityId,
    });

    const [total, questions] = await Promise.all([
      prisma.question.count({ where }),
      prisma.question.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          unitId: true,
          type: true,
          source: true,
          difficulty: true,
          bodyRichtext: true,
          createdAt: true,
          // isCorrect intentionally omitted — never reveal the answer in a browse view.
          options: {
            orderBy: { orderIndex: "asc" },
            select: { id: true, bodyText: true, orderIndex: true },
          },
          // expectedAnswerText intentionally omitted for the same reason as isCorrect
          // above — it's the QROC/clinical-case grading reference, i.e. the answer.
          clinicalCaseParts: {
            orderBy: { partOrder: "asc" },
            select: { id: true, partOrder: true, promptText: true },
          },
        },
      }),
    ]);

    res.status(200).json({ questions, pagination: { page, limit, total } });
  } catch (err) {
    next(err);
  }
}

router.get("/questions", optionalAuth, validateQuery(listQuestionsQuerySchema), listQuestions);

// GET /api/questions/counts — live question counts for the session builder (Phase 1
// builder depth). Same visibility rules as GET /api/questions (BR-2 approved-only +
// FR-10a university scoping + faculty rollout gate) because it reuses buildQuestionWhere
// rather than re-implementing filter logic.
//
// Query params mirror the list endpoint, plus plural `unitIds`/`types` (repeated key or
// comma-separated) so the builder can ask about multi-selections. `source` is the raw
// DB enum (official_exam | hamame_authored | ai_generated); there is deliberately no
// "mixed" here — the client omits the param for "all sources".
//
// Response:
//   { total, byUnit: [{unitId, count}], byModule: [{moduleId, count}] }
// - `total` applies the FULL filter set (including unitIds/types/source): the live
//   "N questions" counter.
// - `byUnit` ignores `unitIds` (module scope only) so per-unit badges stay stable while
//   ticking boxes. Present only when `moduleId` is given, else [].
// - `byModule` ignores `moduleId`+`unitIds` (year scope only) for module-dropdown labels.
//   Present only when `yearId` is given, else [].
// - With no scope params, total = everything visible to the viewer; both lists are [].
const uuidArrayQueryParam = z.preprocess((value) => {
  if (value === undefined) return undefined;
  const parts = Array.isArray(value) ? value : String(value).split(",");
  return parts.map((part) => String(part).trim()).filter((part) => part.length > 0);
}, z.array(z.string().uuid()).optional());

const questionTypeQueryEnum = z.enum(["QCM", "QCS", "QROC", "CLINICAL_CASE"]);

const typeArrayQueryParam = z.preprocess((value) => {
  if (value === undefined) return undefined;
  const parts = Array.isArray(value) ? value : String(value).split(",");
  return parts.map((part) => String(part).trim()).filter((part) => part.length > 0);
}, z.array(questionTypeQueryEnum).optional());

const countsQuerySchema = z.object({
  facultyId: z.string().uuid().optional(),
  yearId: z.string().uuid().optional(),
  moduleId: z.string().uuid().optional(),
  unitIds: uuidArrayQueryParam,
  type: questionTypeQueryEnum.optional(),
  types: typeArrayQueryParam,
  source: z.enum(["official_exam", "hamame_authored", "ai_generated"]).optional(),
  examYear: z.coerce.number().int().min(1000).max(9999).optional(),
  examYearFrom: z.coerce.number().int().min(1000).max(9999).optional(),
  examYearTo: z.coerce.number().int().min(1000).max(9999).optional(),
  sittingLabel: z.string().min(1).max(120).optional(),
});

async function getQuestionCounts(req: Request, res: Response, next: NextFunction) {
  try {
    const {
      facultyId,
      yearId,
      moduleId,
      unitIds,
      type,
      types,
      source,
      examYear,
      examYearFrom,
      examYearTo,
      sittingLabel,
    } = req.query as unknown as z.infer<typeof countsQuerySchema>;

    const typeList = type ? [type] : types;
    // Same scoping as the list endpoint: guests resolve to null = global only.
    const viewerUniversityId = await resolveViewerUniversityId(prisma, req.auth?.userId);

    const sittingScope = { examYear, examYearFrom, examYearTo, sittingLabel };

    // 1. Live counter: the exact filter set the session would be created with.
    // Sequential awaits throughout (pooler guidance: no large Promise.all).
    const totalWhere = buildQuestionWhere({
      unitIds,
      moduleId,
      yearId,
      facultyId,
      types: typeList,
      source,
      ...sittingScope,
      viewerUniversityId,
    });
    const total = await prisma.question.count({ where: totalWhere });

    // 2. Per-unit badges for the module scope (unit selection excluded on purpose).
    let byUnit: Array<{ unitId: string; count: number }> = [];
    if (moduleId) {
      const badgeWhere = buildQuestionWhere({
        moduleId,
        yearId,
        facultyId,
        types: typeList,
        source,
        ...sittingScope,
        viewerUniversityId,
      });
      const groups = await prisma.question.groupBy({
        by: ["unitId"],
        where: badgeWhere,
        _count: { _all: true },
      });
      byUnit = groups.map((group) => ({ unitId: group.unitId, count: group._count._all }));
    }

    // 3. Per-module labels for the year scope (module+unit selection excluded).
    // groupBy can only group by Question columns (no moduleId column exists —
    // questions attach at unit level), so group by unit then roll up via units.
    let byModule: Array<{ moduleId: string; count: number }> = [];
    if (yearId) {
      const yearWhere = buildQuestionWhere({
        yearId,
        facultyId,
        types: typeList,
        source,
        ...sittingScope,
        viewerUniversityId,
      });
      const yearGroups = await prisma.question.groupBy({
        by: ["unitId"],
        where: yearWhere,
        _count: { _all: true },
      });
      if (yearGroups.length > 0) {
        const units = await prisma.unit.findMany({
          where: { id: { in: yearGroups.map((group) => group.unitId) } },
          select: { id: true, moduleId: true },
        });
        const moduleByUnitId = new Map(units.map((unit) => [unit.id, unit.moduleId]));
        const countByModuleId = new Map<string, number>();
        for (const group of yearGroups) {
          const rolledModuleId = moduleByUnitId.get(group.unitId);
          if (!rolledModuleId) continue;
          countByModuleId.set(rolledModuleId, (countByModuleId.get(rolledModuleId) ?? 0) + group._count._all);
        }
        byModule = [...countByModuleId.entries()].map(([rolledId, count]) => ({
          moduleId: rolledId,
          count,
        }));
      }
    }

    // 4. Sitting picker options: distinct (examYear, sittingLabel) pairs actually
    // present in the DB, scoped EXACTLY like the badges (faculty/year/module +
    // types/source + university gate) but excluding the sitting selection itself,
    // so picked options stay visible while choosing. Untagged (NULL/NULL) rows are
    // not sittings and are excluded. Empty array = no tagged sittings in scope.
    const sittingsWhere = buildQuestionWhere({
      unitIds,
      moduleId,
      yearId,
      facultyId,
      types: typeList,
      source,
      viewerUniversityId,
    });
    const sittingGroups = await prisma.question.groupBy({
      by: ["examYear", "sittingLabel"],
      where: sittingsWhere,
      _count: { _all: true },
    });
    const sittings = sittingGroups
      .filter((group) => group.examYear !== null || group.sittingLabel !== null)
      .map((group) => ({
        examYear: group.examYear,
        sittingLabel: group.sittingLabel,
        count: group._count._all,
      }))
      .sort((a, b) => {
        if (a.examYear !== b.examYear) return (b.examYear ?? -1) - (a.examYear ?? -1);
        return (a.sittingLabel ?? "").localeCompare(b.sittingLabel ?? "");
      });

    res.status(200).json({ total, byUnit, byModule, sittings });
  } catch (err) {
    next(err);
  }
}

router.get("/questions/counts", optionalAuth, validateQuery(countsQuerySchema), getQuestionCounts);

// POST /api/questions/:id/report — FR-17, feeds `reports` table.
const reportQuestionSchema = z.object({
  reason: z.string().min(1),
  severity: z.enum(["low", "normal", "high", "critical"]).optional(),
});

async function reportQuestion(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { reason, severity } = req.body as z.infer<typeof reportQuestionSchema>;
    const userId = req.auth!.userId;

    // Only approved questions are ever shown to students, so reporting a non-approved
    // (or non-existent) one isn't a real, actionable report.
    const question = await prisma.question.findFirst({
      where: { id, status: "approved" },
      select: { id: true },
    });
    if (!question) {
      throw new ApiError(404, "QUESTION_NOT_FOUND", "No approved question exists with this id.");
    }

    const report = await prisma.report.create({
      data: {
        targetType: "question",
        targetId: question.id,
        reporterUserId: userId,
        reason,
        ...(severity ? { severity } : {}),
      },
    });

    res.status(201).json({ report });
  } catch (err) {
    next(err);
  }
}

router.post(
  "/questions/:id/report",
  requireAuth,
  validateParams(uuidParam("id")),
  validateBody(reportQuestionSchema),
  reportQuestion
);

// GET /api/questions/:id/answer-stats — community pick-rate per option (Phase 2).
//
// Privacy-safe by construction: the response carries ONLY aggregate numbers per
// option id ({questionId, attempts, options: [{optionId, percentage}]}). No user
// ids, session ids, timestamps, or per-attempt rows ever leave this handler, so
// no individual's answer can be reconstructed from it.
//
// Small-sample rule (explicit, not silent): 0 attempts → `options: []` (the UI
// hides the stats block entirely); >= 1 attempt → whole-number percentages plus
// the raw `attempts` count, which the UI always labels ("N réponses") so tiny
// samples are visibly tiny rather than misleadingly precise. Percentages are
// pick-rates (share of attempts selecting each option), NOT correctness — on a
// small sample the correct option can legitimately show a low number.
//
// Scope: practice and exam attempts both count (all are genuine picks); QROC and
// clinical cases have no options to aggregate and get an explicit 400, never an
// empty success. Dedup rule matches scoring: newest attempt per session_question
// wins (re-POSTs create extra rows).
async function getAnswerStats(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const viewerUniversityId = await resolveViewerUniversityId(prisma, req.auth!.userId);

    // Visibility gate first: unapproved/hidden questions are indistinguishable
    // from missing (404), same as the report endpoint.
    const question = await prisma.question.findFirst({
      where: {
        id,
        status: "approved",
        unit: { module: { year: { faculty: { rolloutStatus: { in: ["beta", "live"] } } } } },
        AND: [universityScopeFilter(viewerUniversityId)],
      },
      select: {
        id: true,
        type: true,
        options: { orderBy: { orderIndex: "asc" }, select: { id: true } },
      },
    });
    if (!question) {
      throw new ApiError(404, "QUESTION_NOT_FOUND", "No approved question exists with this id.");
    }
    if (question.type !== "QCM" && question.type !== "QCS") {
      throw new ApiError(
        400,
        "ANSWER_STATS_UNSUPPORTED_TYPE",
        "Answer statistics are only available for QCM/QCS questions."
      );
    }

    // Sequential awaits (pooler guidance: no large Promise.all).
    const sessionQuestions = await prisma.sessionQuestion.findMany({
      where: { questionId: id },
      select: { id: true },
    });
    let attempts: Array<{ selectedOptionIds: Prisma.JsonValue }> = [];
    if (sessionQuestions.length > 0) {
      const rows = await prisma.attempt.findMany({
        where: { sessionQuestionId: { in: sessionQuestions.map((sq) => sq.id) } },
        orderBy: { answeredAt: "desc" },
        select: { sessionQuestionId: true, selectedOptionIds: true },
      });
      const seen = new Set<string>();
      for (const row of rows) {
        if (!seen.has(row.sessionQuestionId)) {
          seen.add(row.sessionQuestionId);
          attempts.push(row);
        }
      }
    }

    const total = attempts.length;
    if (total === 0) {
      res.status(200).json({ questionId: id, attempts: 0, options: [] });
      return;
    }
    const options = question.options.map((option) => {
      let picked = 0;
      for (const attempt of attempts) {
        const selected = attempt.selectedOptionIds;
        if (Array.isArray(selected) && (selected as unknown[]).includes(option.id)) picked += 1;
      }
      return { optionId: option.id, percentage: Math.round((picked / total) * 100) };
    });

    res.status(200).json({ questionId: id, attempts: total, options });
  } catch (err) {
    next(err);
  }
}

router.get(
  "/questions/:id/answer-stats",
  requireAuth,
  validateParams(uuidParam("id")),
  getAnswerStats
);

// GET /api/questions/coverage — approved-question counts per module (Phase 3).
//
// HONESTY CONTRACT (do not relabel): this counts how many validated questions
// the BANK holds per module — i.e. bank coverage, NOT exam-appearance
// frequency. MedSparkDZ's "Hypertombables" ranks what falls most often at the
// résidanat; that semantic needs an exam-paper corpus Hamame doesn't have, so
// the UI must say "Couverture par module", never "Hypertombables" or anything
// implying exam frequency. Same visibility gates as everything else (BR-2 +
// faculty rollout + university scope) via the shared filter builder.
const coverageQuerySchema = z.object({
  facultyId: z.string().uuid().optional(),
  yearId: z.string().uuid().optional(),
  source: z.enum(["official_exam", "hamame_authored", "ai_generated"]).optional(),
});

async function getCoverage(req: Request, res: Response, next: NextFunction) {
  try {
    const { facultyId, yearId, source } = req.query as unknown as z.infer<
      typeof coverageQuerySchema
    >;
    const viewerUniversityId = await resolveViewerUniversityId(prisma, req.auth?.userId);

    const where = buildQuestionWhere({ facultyId, yearId, source, viewerUniversityId });
    // Sequential awaits (pooler guidance).
    const total = await prisma.question.count({ where });
    const groups = await prisma.question.groupBy({
      by: ["unitId"],
      where,
      _count: { _all: true },
    });
    let modules: Array<{
      moduleId: string;
      moduleName: string;
      yearLabel: string;
      facultyName: string;
      questions: number;
    }> = [];
    if (groups.length > 0) {
      const units = await prisma.unit.findMany({
        where: { id: { in: groups.map((group) => group.unitId) } },
        select: {
          id: true,
          module: {
            select: {
              id: true,
              name: true,
              year: { select: { label: true, faculty: { select: { name: true } } } },
            },
          },
        },
      });
      const byUnitId = new Map(units.map((unit) => [unit.id, unit.module]));
      const byModuleId = new Map<
        string,
        { moduleId: string; moduleName: string; yearLabel: string; facultyName: string; questions: number }
      >();
      for (const group of groups) {
        const module = byUnitId.get(group.unitId);
        if (!module) continue;
        const entry = byModuleId.get(module.id) ?? {
          moduleId: module.id,
          moduleName: module.name,
          yearLabel: module.year.label,
          facultyName: module.year.faculty.name,
          questions: 0,
        };
        entry.questions += group._count._all;
        byModuleId.set(module.id, entry);
      }
      modules = [...byModuleId.values()].sort((a, b) => b.questions - a.questions);
    }

    res.status(200).json({ total, modules });
  } catch (err) {
    next(err);
  }
}

router.get("/questions/coverage", optionalAuth, validateQuery(coverageQuerySchema), getCoverage);

export default router;
