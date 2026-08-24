import { Prisma } from "@prisma/client";
import { universityScopeFilter } from "./university-scope";

// Same visible-status set as curriculum.routes.ts and flashcard-from-question.ts. Kept
// local (like those files) rather than importing across route/lib boundaries, matching
// the repo's deliberate pattern of small duplicated constants — any change here MUST
// stay in sync with both.
const VISIBLE_ROLLOUT_STATUSES = ["beta", "live"] as const;

// Shared question-matching filter logic for GET /api/questions (single-id filters) and
// POST /api/sessions (array filters for the session builder). Kept in one place so the
// unit -> module -> year -> faculty traversal isn't duplicated/drifted between the two.
export interface QuestionFilterInput {
  unitId?: string;
  unitIds?: string[];
  moduleId?: string;
  moduleIds?: string[];
  yearId?: string;
  facultyId?: string;
  type?: string;
  types?: string[];
  source?: string;
  dateFrom?: Date;
  dateTo?: Date;
  // Defaults to 'approved' — per BR-2, non-approved questions must never be surfaced to
  // students through any of these callers.
  status?: string;
  // FR-10a per-university scoping. REQUIRED, not optional, on purpose: making it optional
  // is exactly how a call site ends up silently skipping the visibility gate. Callers must
  // resolve it via resolveViewerUniversityId, and null (guest, or student with no
  // university) legitimately means "global content only".
  viewerUniversityId: string | null;
}

export function buildQuestionWhere(input: QuestionFilterInput): Prisma.QuestionWhereInput {
  const where: Prisma.QuestionWhereInput = { status: input.status ?? "approved" };

  if (input.unitId) {
    where.unitId = input.unitId;
  } else if (input.unitIds && input.unitIds.length > 0) {
    where.unitId = { in: input.unitIds };
  }

  if (input.type) {
    where.type = input.type;
  } else if (input.types && input.types.length > 0) {
    where.type = { in: input.types };
  }

  if (input.source) {
    where.source = input.source;
  }

  if (input.dateFrom || input.dateTo) {
    where.createdAt = {
      ...(input.dateFrom ? { gte: input.dateFrom } : {}),
      ...(input.dateTo ? { lte: input.dateTo } : {}),
    };
  }

  // Faculty-visibility gate, applied UNCONDITIONALLY (not just when a module/year/
  // faculty filter is present): every question's unit resolves up through a faculty, so
  // even a filter-free list must never surface questions that live under a hidden
  // ('planned') faculty — same rule as curriculum.routes.ts and
  // flashcard-from-question.ts. Hidden content stays indistinguishable from missing.
  const yearFilter: Prisma.YearWhereInput = {
    faculty: { rolloutStatus: { in: [...VISIBLE_ROLLOUT_STATUSES] } },
  };
  if (input.facultyId) {
    yearFilter.facultyId = input.facultyId;
  }

  const moduleFilter: Prisma.ModuleWhereInput = { year: yearFilter };
  if (input.yearId) {
    moduleFilter.yearId = input.yearId;
  }

  const unitFilter: Prisma.UnitWhereInput = { module: moduleFilter };
  if (input.moduleId) {
    unitFilter.moduleId = input.moduleId;
  } else if (input.moduleIds && input.moduleIds.length > 0) {
    unitFilter.moduleId = { in: input.moduleIds };
  }

  where.unit = unitFilter;

  // University-visibility gate, ANDed with the faculty gate above and applied just as
  // unconditionally. Deliberately placed in the top-level AND array rather than as a
  // top-level `OR` key: a future caller that sets its own `where.OR` would silently
  // overwrite an OR key here and remove the gate with no type error.
  where.AND = [universityScopeFilter(input.viewerUniversityId)];

  return where;
}
