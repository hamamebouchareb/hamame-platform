"use client";

import { useCallback, useEffect, useState } from "react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLanguage } from "@/context/LanguageContext";
import { localeFor, type UiLanguage } from "@/lib/i18n";
import { useApiResource } from "@/lib/useApiResource";
import { apiFetch, ApiError } from "@/lib/api";
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
  const { user, isHydrated } = useRequireAuth();
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

  if (!isHydrated || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-gray-500">{t("billing.loading")}</p>
      </main>
    );
  }

  // GET /subscriptions/me returns the most recent subscription row regardless of
  // status, so a long-expired subscription would still come back non-null here.
  // Only a row with status 'active' represents real current access — anything else
  // (or no row at all) means the user is effectively on the Free plan.
  const activeSubscription = subscription !== null && subscription.status === "active" ? subscription : null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-md px-4 py-8">
      <h1 className="text-2xl font-semibold text-gray-900">{t("nav.subscription")}</h1>

      <section className="mt-6 rounded-lg border border-gray-200 bg-white px-4 py-4">
        {isLoadingSubscription && !subscriptionLoaded && (
          <p className="text-sm text-gray-500">{t("billing.loadingSub")}</p>
        )}
        {subscriptionError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{subscriptionError}</p>
        )}

        {subscriptionLoaded && !subscriptionError && (
          <>
            {activeSubscription === null && <p className="text-base text-gray-900">{t("billing.freePlan")}</p>}

            {activeSubscription !== null && activeSubscription.autoRenew && (
              <>
                <p className="text-base font-medium text-gray-900">
                  {capitalize(activeSubscription.plan.name)} — {formatPrice(activeSubscription.plan, t)}
                </p>
                <p className="mt-1 text-sm text-gray-600">{t("billing.renews", { date: formatDate(activeSubscription.currentPeriodEnd, lang) })}</p>
              </>
            )}

            {activeSubscription !== null && !activeSubscription.autoRenew && (
              <p className="text-sm text-gray-900">
                {t("billing.cancelledDesc", {
                  plan: capitalize(activeSubscription.plan.name),
                  date: formatDate(activeSubscription.currentPeriodEnd, lang),
                })}
              </p>
            )}

            {activeSubscription !== null && activeSubscription.autoRenew && (
              <button
                type="button"
                onClick={handleCancel}
                disabled={isCancelling}
                className="mt-3 w-full rounded-lg border border-gray-300 px-4 py-3 text-base font-medium text-gray-900 transition hover:bg-gray-50 disabled:opacity-60"
              >
                {isCancelling ? t("billing.cancelling") : t("billing.cancel")}
              </button>
            )}

            {cancelError && (
              <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{cancelError}</p>
            )}
            {cancelConfirmation && (
              <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{cancelConfirmation}</p>
            )}
          </>
        )}
      </section>

      <h2 className="mt-8 text-lg font-semibold text-gray-900">{t("billing.plansTitle")}</h2>

      {plansLoading && <p className="mt-4 text-sm text-gray-500">{t("billing.loadingPlans")}</p>}
      {plansError && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{plansError}</p>}

      <ul className="mt-4 flex flex-col gap-3">
        {plansData?.plans.map((plan) => {
          const isCurrentPlan = activeSubscription !== null && activeSubscription.planId === plan.id;
          const isSubscribing = subscribingPlanId === plan.id;

          return (
            <li key={plan.id} className="rounded-lg border border-gray-200 bg-white px-4 py-4 shadow-sm">
              <p className="text-base font-medium text-gray-900">{capitalize(plan.name)}</p>
              <p className="mt-1 text-sm text-gray-600">{formatPrice(plan, t)}</p>
              <p className="mt-1 text-sm text-gray-500">{plan.features.description}</p>

              {isCurrentPlan ? (
                <button
                  type="button"
                  disabled
                  className="mt-3 w-full rounded-lg bg-gray-100 px-4 py-3 text-base font-medium text-gray-500"
                >
                  {t("billing.currentPlan")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSubscribe(plan)}
                  disabled={isSubscribing}
                  className="mt-3 w-full rounded-lg bg-blue-600 px-4 py-3 text-base font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {isSubscribing ? t("billing.subscribing") : t("billing.subscribe")}
                </button>
              )}

              {subscribeError && subscribeError.planId === plan.id && (
                <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{subscribeError.message}</p>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
