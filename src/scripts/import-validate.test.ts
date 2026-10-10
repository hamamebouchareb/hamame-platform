import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateLesson, validateQuestion, type RawLesson, type RawQuestion } from "./import-validate";

function goodQcm(over: Partial<RawQuestion> = {}): RawQuestion {
  return {
    faculty: "medicine",
    year: "Year 1",
    track: "medecine",
    module: "Cardiology",
    unit: "Cardiac Physiology",
    type: "QCM",
    source: "hamame_authored",
    difficulty: "moyen",
    body: "Which chamber?",
    options: [
      { text: "Left", correct: true },
      { text: "Right", correct: false },
    ],
    explanation: "Because.",
    ...over,
  };
}

function reasons(row: number, q: RawQuestion): string[] {
  return validateQuestion(q, row, null).errors.map((e) => e.reason);
}

describe("validateQuestion", () => {
  it("accepts a valid QCM row", () => {
    const { errors, warnings } = validateQuestion(goodQcm(), 1, null);
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
  });

  it("rejects missing scope, unknown type/source/track", () => {
    assert.ok(reasons(1, { ...goodQcm(), faculty: "" }).some((r) => r.includes("scope")));
    assert.ok(reasons(1, { ...goodQcm(), type: "NOPE" }).some((r) => r.includes("unknown type")));
    assert.ok(reasons(1, { ...goodQcm(), source: "nope" }).some((r) => r.includes("unknown source")));
    assert.ok(reasons(1, { ...goodQcm(), track: "nope" }).some((r) => r.includes("unknown track")));
  });

  it("rejects bad difficulty and missing/overlong body", () => {
    assert.ok(reasons(1, { ...goodQcm(), difficulty: "hard" }).some((r) => r.includes("difficulty")));
    assert.ok(reasons(1, { ...goodQcm(), body: "" }).some((r) => r.includes("missing body")));
    assert.ok(reasons(1, { ...goodQcm(), body: "x".repeat(5001) }).some((r) => r.includes("over")));
  });

  it("rejects option-count and correctness violations", () => {
    assert.ok(
      reasons(1, { ...goodQcm(), options: [{ text: "Only", correct: true }] }).some((r) => r.includes("fewer than 2"))
    );
    assert.ok(
      reasons(1, {
        ...goodQcm(),
        options: [
          { text: "A", correct: false },
          { text: "B", correct: false },
        ],
      }).some((r) => r.includes("no correct"))
    );
    assert.ok(
      reasons(1, {
        ...goodQcm(),
        type: "QCS",
        options: [
          { text: "A", correct: true },
          { text: "B", correct: true },
        ],
      }).some((r) => r.includes("need exactly 1"))
    );
  });

  it("rejects blank, overlong, and duplicate option text (trimmed, NFC, case-insensitive)", () => {
    assert.ok(
      reasons(1, { ...goodQcm(), options: [{ text: "  ", correct: true }, { text: "B", correct: false }] }).some((r) =>
        r.includes("blank option")
      )
    );
    assert.ok(
      reasons(1, { ...goodQcm(), options: [{ text: "x".repeat(201), correct: true }, { text: "B", correct: false }] }).some(
        (r) => r.includes("over")
      )
    );
    assert.ok(
      reasons(1, {
        ...goodQcm(),
        options: [
          { text: "Choice", correct: true },
          { text: "  choice ", correct: false },
        ],
      }).some((r) => r.includes("duplicate option"))
    );
  });

  it("rejects QROC with options or an answer field, accepts a clean one", () => {
    const qroc: RawQuestion = {
      faculty: "medicine",
      year: "Year 1",
      track: "medecine",
      module: "Cardiology",
      unit: "Cardiac Physiology",
      type: "QROC",
      source: "hamame_authored",
      body: "Name a phase.",
      options: [],
      explanation: "Short answer expected.",
    };
    assert.deepEqual(validateQuestion(qroc, 1, null).errors, []);
    assert.ok(
      reasons(1, { ...qroc, options: [{ text: "A", correct: true }] }).some((r) => r.includes("must not carry options"))
    );
    assert.ok(
      reasons(1, { ...qroc, answer: "Systole" }).some((r) => r.includes("must not carry answer"))
    );
  });

  it("rejects clinical cases, missing explanation, bad examYear", () => {
    assert.ok(reasons(1, { ...goodQcm(), type: "CLINICAL_CASE" }).some((r) => r.includes("clinical-out-of-v1")));
    const noExpl: RawQuestion = {
      faculty: "medicine",
      year: "Year 1",
      track: "medecine",
      module: "Cardiology",
      unit: "Cardiac Physiology",
      type: "QCM",
      source: "hamame_authored",
      body: "Which chamber?",
      options: [
        { text: "Left", correct: true },
        { text: "Right", correct: false },
      ],
    };
    assert.ok(reasons(1, noExpl).some((r) => r.includes("missing explanation")));
    assert.ok(reasons(1, { ...goodQcm(), examYear: 99 }).some((r) => r.includes("examYear")));
  });
});

describe("validateLesson", () => {
  const good: RawLesson = {
    faculty: "medicine",
    year: "Year 1",
    track: "medecine",
    module: "Cardiology",
    unit: "Cardiac Physiology",
    title: "Pump",
    contentTier: "official",
    body: ["First paragraph."],
  };

  it("accepts a valid lesson", () => {
    assert.deepEqual(validateLesson(good, 1).errors, []);
  });

  it("rejects missing scope/title, bad tier, bad body", () => {
    assert.ok(validateLesson({ ...good, title: "" }, 1).errors.some((e) => e.reason.includes("title")));
    assert.ok(validateLesson({ ...good, contentTier: "blog" }, 1).errors.some((e) => e.reason.includes("contentTier")));
    assert.ok(validateLesson({ ...good, body: [] }, 1).errors.some((e) => e.reason.includes("body")));
    assert.ok(validateLesson({ ...good, unit: "" }, 1).errors.some((e) => e.reason.includes("scope")));
  });
});
