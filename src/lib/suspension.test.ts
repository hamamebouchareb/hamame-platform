import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isEffectivelySuspended } from "./suspension";

const NOW = new Date("2026-10-06T12:00:00.000Z");
const hour = 60 * 60 * 1000;

describe("isEffectivelySuspended", () => {
  it("active account is not suspended", () => {
    assert.equal(isEffectivelySuspended("active", null, NOW), false);
  });

  it("suspended account with no end date is suspended", () => {
    assert.equal(isEffectivelySuspended("suspended", null, NOW), true);
  });

  it("suspended account with a future end date is suspended", () => {
    assert.equal(isEffectivelySuspended("suspended", new Date(NOW.getTime() + hour), NOW), true);
  });

  it("suspended account with a passed end date counts as lifted", () => {
    assert.equal(isEffectivelySuspended("suspended", new Date(NOW.getTime() - hour), NOW), false);
  });

  it("deleted account is not suspended (callers handle it separately)", () => {
    assert.equal(isEffectivelySuspended("deleted", null, NOW), false);
    assert.equal(isEffectivelySuspended("deleted", new Date(NOW.getTime() + hour), NOW), false);
  });
});
