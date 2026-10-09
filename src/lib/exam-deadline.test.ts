import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EXAM_ANSWER_GRACE_MS, isExamAnswerExpired } from "./exam-deadline";

const START = new Date("2026-10-08T12:00:00.000Z");
const at = (ms: number) => new Date(START.getTime() + ms);

describe("isExamAnswerExpired", () => {
  it("practice sessions are never gated", () => {
    assert.equal(isExamAnswerExpired("practice", 1, START, at(3_600_000)), false);
  });

  it("untimed exams are never gated", () => {
    assert.equal(isExamAnswerExpired("exam", null, START, at(3_600_000)), false);
    assert.equal(isExamAnswerExpired("exam", undefined, START, at(3_600_000)), false);
  });

  it("answers before the limit are accepted", () => {
    assert.equal(isExamAnswerExpired("exam", 60, START, at(59_000)), false);
  });

  it("answers inside the 30 s grace are accepted", () => {
    assert.equal(isExamAnswerExpired("exam", 60, START, at(60_000 + EXAM_ANSWER_GRACE_MS - 1000)), false);
  });

  it("answers after limit + grace are rejected", () => {
    assert.equal(isExamAnswerExpired("exam", 60, START, at(60_000 + EXAM_ANSWER_GRACE_MS + 1000)), true);
  });
});
