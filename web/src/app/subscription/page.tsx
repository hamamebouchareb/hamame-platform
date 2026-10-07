"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuthedPage } from "@/lib/useAuthedPage";
import { useLanguage } from "@/context/LanguageContext";
import { localeFor, type UiLanguage } from "@/lib/i18n";
import { useApiResource } from "@/lib/useApiResource";
import { apiFetch, ApiError } from "@/lib/api";
import { ActivationCodeCard, Button, Card, ErrorState, LoadingSkeleton, PageShell, PromoCodeCard } from "@/components";
import type { Plan, Subscription } from "@/lib/types";

interface SubscribeErrorState {
  planId: string;
  message: string;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatPrice(
  plan: Plan,
  t: (key: "billing.free" | "billing.perYear" | "billing.perMonth") => string
): string {
  if (plan.priceDzd === null || plan.priceDzd === 0) return t("billing.free");
  const period = plan.billingPeriod === "yearly" ? t("billing.perYear") : plan.billingPeriod === "monthly" ? t("billing.perMonth") : "";
  return `${plan.priceDzd} DZD${period}`;
}

function formatDate(iso: string, lang: UiLanguage): string {
  return new Date(iso).toLocaleDateString(localeFor(lang), { dateStyle: "medium" });
}

export default function SubscriptionPage() {
  const { user, isHydrated, handleLogout } = useAuthedPage();
  const { lang, t } = useLanguage();
  const canFetch = isHydrated && !!user;

  const { data: plansData, error: plansError, isLoading: plansLoading } = useApiResource<{ plans: Plan[] }>(
    canFetch ? "/plans" : null
  );

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [subscriptionLoaded, setSubscriptionLoaded] = useState(false);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);

  const [subscribingPlanId, setSubscribingPlanId] = useState<string | null>(null);
  const [subscribeError, setSubscribeError] = useState<SubscribeErrorState | null>(null);

  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelConfirmation, setCancelConfirmation] = useState<string | null>(null);

  const loadSubscription = useCallback(async () => {
    setIsLoadingSubscription(true);
    setSubscriptionError(null);
    try {
      const data = await apiFetch<{ subscription: Subscription | null }>("/subscriptions/me");
      setSubscription(data.subscription);
    } catch (err) {
      setSubscriptionError(err instanceof ApiError ? err.message : t("auth.genericError"));
    } finally {
      setIsLoadingSubscription(false);
      setSubscriptionLoaded(true);
    }
  }, [t]);

  // Fetching on mount (an external system) and syncing the result into React state is
  // exactly what this effect is for, mirroring the same disable in useApiResource.ts.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (canFetch && !subscriptionLoaded) {
      loadSubscription();
    }
  }, [canFetch, subscriptionLoaded, loadSubscription]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleSubscribe(plan: Plan) {
    setSubscribeError(null);
    setCancelConfirmation(null);

    // The backend only knows "already has an active subscription" and returns the
    // same generic 409 either way, but a user who already cancelled (autoRenew:
    // false) is in a different situation from one who hasn't — they can't switch
    // plans yet either, but "cancel first" is confusing advice when they already
    // did. Catch that case on the frontend before even calling the API.
    const current = subscription !== null && subscription.status === "active" ? subscription : null;
    if (current !== null && current.planId !== plan.id && !current.autoRenew) {
      setSubscribeError({
        planId: plan.id,
        message: t("billing.switchAfter", {
          date: formatDate(current.currentPeriodEnd, lang),
          plan: capitalize(current.plan.name),
        }),
      });
      return;
    }

    setSubscribingPlanId(plan.id);
    try {
      await apiFetch("/subscriptions", {
        method: "POST",
        body: JSON.stringify({ planId: plan.id }),
      });
      await loadSubscription();
    } catch (err) {
      const message =
        err instanceof ApiError && err.code === "SUBSCRIPTION_ALREADY_ACTIVE"
          ? t("billing.alreadyActive")
          : err instanceof ApiError
            ? err.message
            : t("auth.genericError");
      setSubscribeError({ planId: plan.id, message });
    } finally {
      setSubscribingPlanId(null);
    }
  }

  async function handleCancel() {
    setCancelError(null);
    setCancelConfirmation(null);
    setIsCancelling(true);
    try {
      const data = await apiFetch<{ subscription: Subscription }>("/subscriptions/me/cancel", {
        method: "PUT",
      });
      setSubscription(data.subscription);
      setCancelConfirmation(
        t("billing.cancelConfirm", { date: formatDate(data.subscription.currentPeriodEnd, lang) })
      );
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : t("auth.genericError"));
    } finally {
      setIsCancelling(false);
    }
  }

  // GET /subscriptions/me returns the most recent subscription row regardless of
  // status, so a long-expired subscription would still come back non-null here.
  // Only a row with status 'active' represents real current access — anything else
  // (or no row at all) means the user is effectively on the Free plan.
  const activeSubscription = subscription !== null && subscription.status === "active" ? subscription : null;

  return (
    <PageShell
      user={user}
      isHydrated={isHydrated}
      onLogout={handleLogout}
      width="narrow"
      title={t("nav.subscription")}
      loadingLabel={t("billing.loading")}
    >
      <Card className="mt-section-gap">
        {isLoadingSubscription && !subscriptionLoaded && (
          <LoadingSkeleton className="h-5 w-48" ariaLabel={t("billing.loadingSub")} />
        )}
        {subscriptionError && <ErrorState message={subscriptionError} onRetry={loadSubscription} />}

        {subscriptionLoaded && !subscriptionError && (
          <>
            {activeSubscription === null && <p className="text-body text-text-primary">{t("billing.freePlan")}</p>}

            {activeSubscription !== null && activeSubscription.autoRenew && (
              <>
                <p className="text-body font-medium text-text-primary">
                  {capitalize(activeSubscription.plan.name)} — {formatPrice(activeSubscription.plan, t)}
                </p>
                <p className="mt-1 text-meta text-text-secondary">{t("billing.renews", { date: formatDate(activeSubscription.currentPeriodEnd, lang) })}</p>
              </>
            )}

            {activeSubscription !== null && !activeSubscription.autoRenew && (
              <p className="text-meta text-text-primary">
                {t("billing.cancelledDesc", {
                  plan: capitalize(activeSubscription.plan.name),
                  date: formatDate(activeSubscription.currentPeriodEnd, lang),
                })}
              </p>
            )}

            {activeSubscription !== null && activeSubscription.autoRenew && (
              <Button variant="outline" width="full" onClick={handleCancel} disabled={isCancelling} className="mt-3">
                {isCancelling ? t("billing.cancelling") : t("billing.cancel")}
              </Button>
            )}

            {cancelError && <ErrorState message={cancelError} className="mt-2" />}
            {cancelConfirmation && (
              <Card variant="default" className="mt-2 border-success">
                <p className="text-meta text-success">{cancelConfirmation}</p>
              </Card>
            )}
          </>
        )}
      </Card>

      <h2 className="mt-section-gap font-display text-h3 font-semibold text-text-primary">{t("billing.plansTitle")}</h2>

      {plansLoading && <LoadingSkeleton className="mt-4 h-5 w-48" ariaLabel={t("billing.loadingPlans")} />}
      {plansError && <ErrorState message={plansError} className="mt-4" />}

      <ul className="mt-4 flex flex-col gap-card-gap">
        {plansData?.plans.map((plan) => {
          const isCurrentPlan = activeSubscription !== null && activeSubscription.planId === plan.id;
          const isSubscribing = subscribingPlanId === plan.id;

          return (
            <Card as="li" key={plan.id}>
              <p className="text-body font-medium text-text-primary">{capitalize(plan.name)}</p>
              <p className="mt-1 text-meta text-text-secondary">{formatPrice(plan, t)}</p>
              <p className="mt-1 text-meta text-text-tertiary">{plan.features.description}</p>

              {isCurrentPlan ? (
                <Button variant="outline" width="full" disabled className="mt-3">
                  {t("billing.currentPlan")}
                </Button>
              ) : plan.priceDzd === null || plan.priceDzd === 0 ? (
                <Button width="full" onClick={() => handleSubscribe(plan)} disabled={isSubscribing} className="mt-3">
                  {isSubscribing ? t("billing.subscribing") : t("billing.subscribe")}
                </Button>
              ) : (
                <p className="mt-3 text-meta text-text-secondary">{t("billing.paidNeedsCode")}</p>
              )}

              {subscribeError && subscribeError.planId === plan.id && (
                <ErrorState message={subscribeError.message} className="mt-2" />
              )}
            </Card>
          );
        })}
      </ul>

      <h2 className="mt-section-gap font-display text-h3 font-semibold text-text-primary">{t("billing.redeemTitle")}</h2>
      <div className="mt-4 flex flex-col gap-card-gap">
        <ActivationCodeCard onRedeemed={loadSubscription} />
        <PromoCodeCard onRedeemed={loadSubscription} />
      </div>
    </PageShell>
  );
}
