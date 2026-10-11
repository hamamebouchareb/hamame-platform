import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isTokenCurrent } from "./token-version";

describe("isTokenCurrent", () => {
  it("grandfathers claim-less tokens as version 1", () => {
    assert.equal(isTokenCurrent(null, 1), true);
    assert.equal(isTokenCurrent(null, 2), false);
  });

  it("matches equal versions and rejects drifted ones", () => {
    assert.equal(isTokenCurrent(1, 1), true);
    assert.equal(isTokenCurrent(1, 2), false);
    assert.equal(isTokenCurrent(2, 1), false);
  });
});
