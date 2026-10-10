import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildQuestionWhere, type QuestionFilterInput } from "./question-filters";

// BR-2: only approved questions reach students. The `status` input field is
// internal-only — verified by grep, no route passes user input into it, so
// the default below is what every student caller gets. The explicit-status
// cases pin the pass-through shape so a future caller cannot silently widen it.
const base: QuestionFilterInput = { viewerUniversityId: null };

function facultyStatuses(where: ReturnType<typeof buildQuestionWhere>): unknown {
  const unit = where.unit as
    | { module?: { year?: { faculty?: { rolloutStatus?: unknown } } } }
    | undefined;
  return unit?.module?.year?.faculty?.rolloutStatus;
}

describe("buildQuestionWhere (BR-2)", () => {
  it("defaults to status approved with no filters", () => {
    const where = buildQuestionWhere(base);
    assert.equal(where.status, "approved");
  });

  it("keeps status approved under a full filter combination", () => {
    const where = buildQuestionWhere({
      unitIds: ["u1", "u2"],
      moduleIds: ["m1"],
      yearId: "y1",
      facultyId: "f1",
      types: ["QCM", "QCS"],
      source: "official_exam",
      dateFrom: new Date("2020-01-01"),
      dateTo: new Date("2025-01-01"),
      examYearFrom: 2020,
      examYearTo: 2024,
      sittingLabel: "EMD",
      viewerUniversityId: "uni-1",
    });
    assert.equal(where.status, "approved");
  });

  it("passes an explicit status through unchanged (internal-only field)", () => {
    assert.equal(buildQuestionWhere({ ...base, status: "pending_review" }).status, "pending_review");
    assert.equal(buildQuestionWhere({ ...base, status: "approved" }).status, "approved");
  });

  it("scopes guests to global-only content", () => {
    const where = buildQuestionWhere(base);
    assert.deepEqual(where.AND, [{ universityId: null }]);
  });

  it("scopes university viewers to global plus their university", () => {
    const where = buildQuestionWhere({ ...base, viewerUniversityId: "uni-1" });
    assert.deepEqual(where.AND, [{ OR: [{ universityId: null }, { universityId: "uni-1" }] }]);
  });

  it("applies the faculty rollout gate even with zero filters", () => {
    const where = buildQuestionWhere(base);
    assert.deepEqual(facultyStatuses(where), { in: ["beta", "live"] });
  });
});
