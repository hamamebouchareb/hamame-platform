import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { validateBody, validateParams, validateQuery } from "../middleware/validate";
import { paginationQuery, uuidParam } from "../lib/common-schemas";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { buildQuestionWhere } from "../lib/question-filters";
import { resolveViewerUniversityId } from "../lib/university-scope";

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
});

async function listQuestions(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, facultyId, yearId, moduleId, unitId, type, source, dateFrom, dateTo } =
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

export default router;
