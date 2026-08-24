import { NextFunction, Request, Response, Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { validateBody, validateParams, validateQuery } from "../middleware/validate";
import { paginationQuery, uuidParam } from "../lib/common-schemas";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";

// docs/hamame_api_contract.md — "Moderation, Reporting & Trust" section (FR-53 to
// FR-55, BR-5 SLA-by-severity). Every route below requires requireAuth (identity) AND
// requireRole('moderator', 'admin') (role).
const router = Router();
router.use(requireAuth);

const requireModeratorOrAdmin = requireRole("moderator", "admin");

// Fields safe to return to the client for a restricted user — mirrors safeUserSelect in
// src/routes/auth.routes.ts exactly (that constant isn't exported, so it's duplicated
// here rather than reaching into another route file's internals). Deliberately excludes
// passwordHash.
const safeUserSelect = {
  id: true,
  email: true,
  phone: true,
  fullName: true,
  facultyId: true,
  yearId: true,
  university: true,
  wilaya: true,
  uiLanguage: true,
  theme: true,
  status: true,
  createdAt: true,
} as const;

const SNIPPET_MAX_LENGTH = 160;

function truncate(text: string): string {
  return text.length > SNIPPET_MAX_LENGTH ? `${text.slice(0, SNIPPET_MAX_LENGTH)}…` : text;
}

// bodyRichtext shapes vary by content ("{ text }" for questions, "{ blocks: [...] }" for
// lessons per prisma/seed.ts) — this is just a triage snippet, not a rich-text renderer
// (same scope decision as review.routes.ts's/notes.routes.ts's extractSnippet /
// extractQuestionLabel — duplicated here rather than extracted to a shared lib, since it
// wasn't already shared there either), so it degrades to an empty string rather than
// trying to fully interpret unknown shapes.
function extractSnippet(bodyRichtext: unknown): string {
  if (bodyRichtext && typeof bodyRichtext === "object") {
    const text = (bodyRichtext as { text?: unknown }).text;
    if (typeof text === "string" && text.trim().length > 0) {
      return truncate(text);
    }

    const blocks = (bodyRichtext as { blocks?: unknown }).blocks;
    if (Array.isArray(blocks)) {
      for (const block of blocks) {
        const blockText = (block as { text?: unknown } | null)?.text;
        if (typeof blockText === "string" && blockText.trim().length > 0) {
          return truncate(blockText);
        }
      }
    }
  }
  return "";
}

// Report.severity is a plain string column, not a DB enum, so Prisma's orderBy can't
// express "critical > high > normal > low" directly — this rank map is applied to
// already-fetched rows instead of reaching for raw SQL.
const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 };

function severityRank(severity: string): number {
  return SEVERITY_RANK[severity] ?? SEVERITY_RANK.normal;
}

const moderationQueueQuerySchema = paginationQuery.extend({
  severity: z.enum(["low", "normal", "high", "critical"]).optional(),
  status: z.enum(["open", "in_review", "resolved", "dismissed"]).optional(),
});

// GET /api/moderation/queue — moderator's report queue, BR-5. Role-gated to Community
// Moderators (and Admins) via requireRole below (PRD Section 6).
async function getModerationQueue(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, severity, status } = req.query as unknown as z.infer<typeof moderationQueueQuerySchema>;

    // status isn't provided -> default to 'open' (the actionable queue); severity is
    // never defaulted — omitted means "all severities", per spec.
    const where: Prisma.ReportWhereInput = { status: status ?? "open" };
    if (severity) {
      where.severity = severity;
    }

    const reports = await prisma.report.findMany({
      where,
      include: { reporter: { select: { fullName: true } } },
    });

    // BR-5 SLA intent: highest severity first, then oldest-first within a tier so
    // longest-waiting reports of equal priority surface first.
    const sorted = reports.slice().sort((a, b) => {
      const rankDiff = severityRank(a.severity) - severityRank(b.severity);
      return rankDiff !== 0 ? rankDiff : a.createdAt.getTime() - b.createdAt.getTime();
    });

    const total = sorted.length;
    const paged = sorted.slice((page - 1) * limit, (page - 1) * limit + limit);

    // Only 'question' targets get a snippet (per spec) — other target types
    // (lesson/comment/user) don't have an equally cheap, universally-available text
    // field to snapshot here, so they're left without one rather than over-fetching.
    const questionIds = paged.filter((report) => report.targetType === "question").map((report) => report.targetId);
    const questions =
      questionIds.length > 0
        ? await prisma.question.findMany({
            where: { id: { in: questionIds } },
            select: { id: true, bodyRichtext: true },
          })
        : [];
    const snippetByQuestionId = new Map(questions.map((question) => [question.id, extractSnippet(question.bodyRichtext)]));

    const items = paged.map((report) => ({
      id: report.id,
      targetType: report.targetType,
      targetId: report.targetId,
      reason: report.reason,
      severity: report.severity,
      status: report.status,
      createdAt: report.createdAt,
      reporter: { fullName: report.reporter.fullName },
      snippet: report.targetType === "question" ? snippetByQuestionId.get(report.targetId) ?? "" : undefined,
    }));

    res.status(200).json({ items, pagination: { page, limit, total } });
  } catch (err) {
    next(err);
  }
}

router.get("/queue", requireModeratorOrAdmin, validateQuery(moderationQueueQuerySchema), getModerationQueue);

const resolveReportSchema = z.object({
  resolution: z.enum(["resolved", "dismissed"]),
  note: z.string().optional(),
});

// POST /api/moderation/reports/:id/resolve — BR-5. Role-gated to Community Moderators
// (and Admins) via requireRole below (PRD Section 6).
async function resolveReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { resolution } = req.body as z.infer<typeof resolveReportSchema>;
    const userId = req.auth!.userId;

    const report = await prisma.report.findUnique({ where: { id } });
    if (!report) {
      throw new ApiError(404, "REPORT_NOT_FOUND", "No report exists with this id.");
    }
    if (report.status !== "open") {
      throw new ApiError(409, "INVALID_STATUS", `This report cannot be resolved from status '${report.status}'.`);
    }

    // The body's optional `note` has no corresponding column on Report (see
    // prisma/schema.prisma) — it's accepted for API-contract compatibility but
    // currently has nowhere to be persisted; a resolution-note column/table would be
    // needed to actually store it.
    const updated = await prisma.report.update({
      where: { id },
      data: { status: resolution, resolvedBy: userId, resolvedAt: new Date() },
    });

    res.status(200).json({ report: updated });
  } catch (err) {
    next(err);
  }
}

router.post(
  "/reports/:id/resolve",
  requireModeratorOrAdmin,
  validateParams(uuidParam("id")),
  validateBody(resolveReportSchema),
  resolveReport
);

const restrictUserSchema = z.object({
  reason: z.string().min(1),
  durationDays: z.number().int().min(1).optional(),
});

// POST /api/moderation/users/:id/restrict — BR-5 account restriction. Role-gated to
// Community Moderators/Trust & Safety (and Admins) via requireRole below (PRD Section
// 6). The self-restrict guard below is a separate, additional check: even a
// moderator/admin should not be able to restrict their own account.
async function restrictUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { durationDays } = req.body as z.infer<typeof restrictUserSchema>;
    const actingUserId = req.auth!.userId;

    if (actingUserId === id) {
      throw new ApiError(400, "SELF_RESTRICT_NOT_ALLOWED", "An account cannot restrict itself.");
    }

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      throw new ApiError(404, "USER_NOT_FOUND", "No user exists with this id.");
    }
    if (targetUser.status === "suspended" || targetUser.status === "deleted") {
      throw new ApiError(
        409,
        "INVALID_STATUS",
        `This user cannot be restricted from status '${targetUser.status}'.`
      );
    }

    // durationDays (optional) makes the suspension time-boxed: status 'suspended' plus
    // suspendedUntil = now + durationDays, which src/jobs/unsuspendUsers.ts later flips
    // back to 'active' once the timestamp passes. When omitted the suspension is
    // indefinite (suspendedUntil stays null), preserving the pre-existing behavior for
    // permanent restrictions.
    const suspendedUntil = durationDays
      ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)
      : null;

    const updated = await prisma.user.update({
      where: { id },
      data: { status: "suspended", suspendedUntil },
      select: safeUserSelect,
    });

    res.status(200).json({ user: updated });
  } catch (err) {
    next(err);
  }
}

router.post(
  "/users/:id/restrict",
  requireModeratorOrAdmin,
  validateParams(uuidParam("id")),
  validateBody(restrictUserSchema),
  restrictUser
);

export default router;
