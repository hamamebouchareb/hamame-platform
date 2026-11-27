import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { computeDailyQuestionPolicy, resolvePremiumScope } from "./entitlements";
import { requireAuth } from "../middleware/auth";
import questionsRouter from "../routes/questions.routes";

describe("computeDailyQuestionPolicy", () => {
  it("supports global unlimitedFreeAccess on free plan", () => {
    const policy = computeDailyQuestionPolicy({
      freePlanFeatures: { dailyQuestionLimit: 20, unlimitedFreeAccess: true },
    });
    assert.deepEqual(policy, { limit: 20, isUnlimited: true });
  });

  it("applies per-user dailyQuestionLimitOverride (e.g. 39)", () => {
    const policy = computeDailyQuestionPolicy({
      freePlanFeatures: { dailyQuestionLimit: 20 },
      userOverride: { dailyQuestionLimitOverride: 39, unlimitedQuestionsOverride: false },
    });
    assert.deepEqual(policy, { limit: 39, isUnlimited: false });
  });

  it("applies per-user unlimitedQuestionsOverride", () => {
    const policy = computeDailyQuestionPolicy({
      freePlanFeatures: { dailyQuestionLimit: 20 },
      userOverride: { dailyQuestionLimitOverride: null, unlimitedQuestionsOverride: true },
    });
    assert.deepEqual(policy, { limit: 20, isUnlimited: true });
  });
});

describe("resolvePremiumScope", () => {
  it("propagates residanatAllFaculties as allResidanatFaculties", async () => {
    const fakeClient = {
      userRole: { findFirst: async () => null },
      subscription: {
        findFirst: async () => ({
          id: "sub-1",
          facultyId: "fac-alger",
          yearId: "year-res",
          currentPeriodEnd: new Date("2027-01-01T00:00:00.000Z"),
          plan: { name: "premium", features: { residanatAllFaculties: true } },
        }),
      },
    } as unknown as PrismaClient;

    const scope = await resolvePremiumScope(fakeClient, "user-1");
    assert.ok(scope);
    assert.equal(scope.allResidanatFaculties, true);
    assert.equal(scope.yearId, "year-res");
  });
});

describe("GET /api/questions auth gate", () => {
  it("requires requireAuth middleware on /questions", () => {
    const layer = (questionsRouter as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: unknown }> } }> }).stack.find(
      (entry) => entry.route?.path === "/questions" && entry.route.methods.get
    );
    assert.ok(layer?.route);
    const handles = layer.route.stack.map((s) => s.handle);
    assert.ok(handles.includes(requireAuth), "GET /questions must include requireAuth");
  });
});
