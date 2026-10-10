import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeSessionScore, type ScorableQuestion } from "./scoring";

let n = 0;
function qcm(correct: boolean | null): ScorableQuestion {
  n += 1;
  return { question: { id: `q${n}`, type: "QCM" }, attempts: [{ isCorrect: correct }] };
}

function typed(type: string, correct: boolean | null, hasAttempts = true): ScorableQuestion {
  n += 1;
  return { question: { id: `q${n}`, type }, attempts: hasAttempts ? [{ isCorrect: correct }] : [] };
}

describe("computeSessionScore", () => {
  it("all correct scores 100", () => {
    assert.equal(computeSessionScore([qcm(true), qcm(true)]), 100);
  });

  it("all wrong scores 0", () => {
    assert.equal(computeSessionScore([qcm(false), qcm(false)]), 0);
  });

  it("unanswered gradable questions count as wrong", () => {
    assert.equal(computeSessionScore([qcm(true), typed("QCM", null, false)]), 50);
  });

  it("non-gradable types are excluded from both sides", () => {
    const rows: ScorableQuestion[] = [
      qcm(true),
      typed("QROC", null, false),
      typed("CLINICAL_CASE", null),
    ];
    assert.equal(computeSessionScore(rows), 100);
  });

  it("no gradable questions yields null, not 0", () => {
    assert.equal(computeSessionScore([typed("QROC", null, false)]), null);
    assert.equal(computeSessionScore([]), null);
  });

  it("keeps today's float division (no rounding)", () => {
    assert.equal(computeSessionScore([qcm(true), qcm(false), qcm(false)]), (1 / 3) * 100);
  });
});
