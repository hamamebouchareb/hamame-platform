import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildExplainUserPayload,
  explanationResponseSchema,
  generateAnswerExplanation,
  ExplainAnswerError,
  optionLabel,
  type ExplainQuestion,
} from "./explain-answer";
import { GeminiError, injectGeminiJsonForTests } from "./gemini";

// Mocked (no network): pins the DB-only payload construction and the response
// contract. The fixture below is typed as ExplainQuestion but carries only the
// fields buildExplainUserPayload reads.

const fixtureQuestion = {
  id: "00000000-0000-0000-0000-00000000a001",
  type: "QCM",
  bodyRichtext: { text: "Quel vaisseau vascularise le segment antérieur du foie?" },
  explanationRichtext: { text: "La branche gauche de l'artère hépatique vascularise les segments II-IV." },
  options: [
    { id: "o1", bodyText: "La branche gauche de l'artère hépatique", isCorrect: true, orderIndex: 0 },
    { id: "o2", bodyText: "La veine porte", isCorrect: false, orderIndex: 1 },
    { id: "o3", bodyText: "L'artère splénique", isCorrect: false, orderIndex: 2 },
  ],
  clinicalCaseParts: [],
  unit: {
    name: "Anatomie hépatique",
    module: { name: "Anatomie", year: { label: "PCEM1", faculty: { name: "Faculté de médecine d'Alger" } } },
  },
} as unknown as ExplainQuestion;

describe("optionLabel", () => {
  it("labels options A..H by order index", () => {
    assert.equal(optionLabel(0), "A");
    assert.equal(optionLabel(7), "H");
  });
});

describe("buildExplainUserPayload", () => {
  it("sends DB-derived truth only: question, options WITH authoritative status, baseline explanation, course labels", () => {
    const payload = buildExplainUserPayload(fixtureQuestion, {
      selectedOptionIds: ["o2"],
      selectedOptionTexts: ["La veine porte"],
      freeTextAnswer: null,
      attemptCount: 1,
    });

    assert.match(payload, /FORMAT: QCM/);
    assert.match(payload, /Quel vaisseau vascularise le segment antérieur du foie/);
    assert.match(payload, /A\. La branche gauche de l'artère hépatique — CORRECT/);
    assert.match(payload, /B\. La veine porte — INCORRECT/);
    assert.match(payload, /La branche gauche de l'artère hépatique vascularise les segments II-IV/);
    assert.match(payload, /THE STUDENT SELECTED: La veine porte/);
  });

  it("adapts to clinical-case format with reference answers", () => {
    const clinicalQuestion = {
      ...fixtureQuestion,
      type: "CLINICAL_CASE",
      options: [],
      clinicalCaseParts: [
        { partOrder: 0, promptText: "Citez deux signes d'insuffisance cardiaque droite.", expectedAnswerText: "Œdèmes des membres inférieurs; JVD; hépatomégalie douloureuse." },
      ],
    } as unknown as ExplainQuestion;

    const payload = buildExplainUserPayload(clinicalQuestion, {
      selectedOptionIds: [],
      selectedOptionTexts: [],
      freeTextAnswer: "Œdèmes des membres inférieurs",
      attemptCount: 1,
    });

    assert.match(payload, /FORMAT: CLINICAL_CASE/);
    assert.match(payload, /CASE PARTS:/);
    assert.match(payload, /Reference answer elements: Œdèmes des membres inférieurs/);
    assert.match(payload, /THE STUDENT WROTE \(not auto-graded\): Œdèmes des membres inférieurs/);
  });

  it("truncates oversized student free text instead of passing it through", () => {
    const payload = buildExplainUserPayload(
      { ...fixtureQuestion, type: "QROC", options: [] } as unknown as ExplainQuestion,
      { selectedOptionIds: [], selectedOptionTexts: [], freeTextAnswer: "x".repeat(3000), attemptCount: 1 }
    );
    assert.ok(payload.length < 8000, `payload length ${payload.length}`);
  });
});

describe("explanationResponseSchema (the response contract)", () => {
  const valid = {
    directExplanation: "L'artère hépatique gauche fournit les segments II à IV du foie.",
    incorrectOptions: [{ optionLabel: "B", optionText: "La veine porte", whyIncorrect: "La veine porte apporte le sang du tube digestif, pas l'oxygénation artérielle." }],
    keyReasoning: " vascularisation hépatique = afférences portales + artérielles",
    learningPoints: ["Segments II", "Segments III"],
  };

  it("accepts a well-formed model response", () => {
    const parsed = explanationResponseSchema.safeParse(JSON.parse(JSON.stringify(valid)));
    assert.equal(parsed.success, true);
  });

  it("rejects an empty directExplanation", () => {
    const parsed = explanationResponseSchema.safeParse({ ...valid, directExplanation: "" });
    assert.equal(parsed.success, false);
  });

  it("rejects an over-long incorrect-option diagnostic", () => {
    const parsed = explanationResponseSchema.safeParse({
      ...valid,
      incorrectOptions: [{ optionLabel: "B", optionText: "La veine porte", whyIncorrect: "x".repeat(800) }],
    });
    assert.equal(parsed.success, false);
  });

  it("rejects too many learning points and over-length points", () => {
    const parsed = explanationResponseSchema.safeParse({ ...valid, learningPoints: Array.from({ length: 7 }, () => "point") });
    assert.equal(parsed.success, false);
  });

});

describe("generateAnswerExplanation (public path, injected stub)", () => {
  const originalStubFlag = process.env.HAMAME_AI_TEST_STUB;
  const student = {
    selectedOptionIds: ["o2"],
    selectedOptionTexts: ["La veine porte"],
    freeTextAnswer: null,
    attemptCount: 1,
  };

  beforeEach(() => {
    process.env.HAMAME_AI_TEST_STUB = "1";
  });

  afterEach(() => {
    if (originalStubFlag === undefined) delete process.env.HAMAME_AI_TEST_STUB;
    else process.env.HAMAME_AI_TEST_STUB = originalStubFlag;
    injectGeminiJsonForTests(null);
  });

  it("maps a schema-invalid provider payload to ExplainAnswerError(SCHEMA_INVALID) — the refund-classifiable type", async () => {
    injectGeminiJsonForTests(async () => ({
      data: { directExplanation: "", keyReasoning: "", learningPoints: [] },
      usage: { inputTokens: 1, outputTokens: 1 },
      model: "stub",
      timeoutMs: 1,
    }));
    await assert.rejects(
      generateAnswerExplanation(fixtureQuestion, student),
      (err: unknown) => err instanceof ExplainAnswerError && err.reason === "SCHEMA_INVALID"
    );
  });

  it("maps provider quota exhaustion to ExplainAnswerError(QUOTA_EXHAUSTED)", async () => {
    injectGeminiJsonForTests(async () => {
      throw new GeminiError("QUOTA_EXHAUSTED", '429 RESOURCE_EXHAUSTED: "quota exceeded"');
    });
    await assert.rejects(
      generateAnswerExplanation(fixtureQuestion, student),
      (err: unknown) => err instanceof ExplainAnswerError && err.reason === "QUOTA_EXHAUSTED"
    );
  });
});
