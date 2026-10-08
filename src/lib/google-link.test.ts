import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldRotatePasswordOnGoogleLink } from "./google-link";

describe("shouldRotatePasswordOnGoogleLink", () => {
  it("rotates when the email was never verified", () => {
    assert.equal(shouldRotatePasswordOnGoogleLink(null), true);
    assert.equal(shouldRotatePasswordOnGoogleLink(undefined), true);
  });

  it("leaves the password alone when the email was already verified", () => {
    assert.equal(shouldRotatePasswordOnGoogleLink(new Date("2026-01-01T00:00:00.000Z")), false);
  });
});
