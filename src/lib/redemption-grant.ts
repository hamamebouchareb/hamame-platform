// Subscription-grant decision shared by promo-code and activation-code
// redemption (moved verbatim from both routes so the two paths can never
// drift). Pure date/plan math — the routes keep doing all database work.
// Rule: extend from max(currentPeriodEnd, now); switch an off-premium row
// onto the premium plan; create a fresh premium row when none is active;
// period end = start + grantsDays.
export interface GrantInput {
  active: { planId: string; currentPeriodEnd: Date } | null;
  premiumPlanId: string;
  now: Date;
  grantsDays: number;
}

export interface GrantDecision {
  /** false = update the existing row in place, true = create a fresh row. */
  create: boolean;
  planId: string;
  periodEnd: Date;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function decideRedemptionGrant(input: GrantInput): GrantDecision {
  if (input.active === null) {
    return { create: true, planId: input.premiumPlanId, periodEnd: addDays(input.now, input.grantsDays) };
  }
  const base =
    input.active.currentPeriodEnd > input.now ? input.active.currentPeriodEnd : input.now;
  return {
    create: false,
    planId: input.active.planId !== input.premiumPlanId ? input.premiumPlanId : input.active.planId,
    periodEnd: addDays(base, input.grantsDays),
  };
}
