import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeEmail } from "./normalize-email";

describe("normalizeEmail", () => {
  it("trims padding and lowercases", () => {
    assert.equal(normalizeEmail("  ALICE@Example.DZ "), "alice@example.dz");
  });

  it("leaves an already-clean address alone", () => {
    assert.equal(normalizeEmail("bob@example.dz"), "bob@example.dz");
  });
});
