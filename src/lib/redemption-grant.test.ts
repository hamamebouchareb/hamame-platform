import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decideRedemptionGrant } from "./redemption-grant";

const NOW = new Date("2026-10-10T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const PREMIUM = "premium-id";
const FREE = "free-id";

describe("decideRedemptionGrant", () => {
  it("healthy extend keeps the plan and extends from the current expiry", () => {
    const end = new Date(NOW.getTime() + 10 * DAY);
    const d = decideRedemptionGrant({ active: { planId: PREMIUM, currentPeriodEnd: end }, premiumPlanId: PREMIUM, now: NOW, grantsDays: 30 });
    assert.equal(d.create, false);
    assert.equal(d.planId, PREMIUM);
    assert.equal(d.periodEnd.getTime(), end.getTime() + 30 * DAY);
  });

  it("stale expiry extends from now, never backwards", () => {
    const past = new Date(NOW.getTime() - 5 * DAY);
    const d = decideRedemptionGrant({ active: { planId: PREMIUM, currentPeriodEnd: past }, premiumPlanId: PREMIUM, now: NOW, grantsDays: 30 });
    assert.equal(d.create, false);
    assert.equal(d.planId, PREMIUM);
    assert.equal(d.periodEnd.getTime(), NOW.getTime() + 30 * DAY);
  });

  it("off-plan rows switch onto premium with the extended date", () => {
    const end = new Date(NOW.getTime() + 10 * DAY);
    const d = decideRedemptionGrant({ active: { planId: FREE, currentPeriodEnd: end }, premiumPlanId: PREMIUM, now: NOW, grantsDays: 30 });
    assert.equal(d.create, false);
    assert.equal(d.planId, PREMIUM);
    assert.equal(d.periodEnd.getTime(), end.getTime() + 30 * DAY);
  });

  it("no subscription creates a fresh premium row", () => {
    const d = decideRedemptionGrant({ active: null, premiumPlanId: PREMIUM, now: NOW, grantsDays: 30 });
    assert.equal(d.create, true);
    assert.equal(d.planId, PREMIUM);
    assert.equal(d.periodEnd.getTime(), NOW.getTime() + 30 * DAY);
  });

  it("grantDays boundaries: 1 day and a large grant", () => {
    const one = decideRedemptionGrant({ active: null, premiumPlanId: PREMIUM, now: NOW, grantsDays: 1 });
    assert.equal(one.periodEnd.getTime(), NOW.getTime() + DAY);
    const big = decideRedemptionGrant({ active: null, premiumPlanId: PREMIUM, now: NOW, grantsDays: 3650 });
    assert.equal(big.periodEnd.getTime(), NOW.getTime() + 3650 * DAY);
  });
});
