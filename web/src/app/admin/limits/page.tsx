"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuthedPage } from "@/lib/useAuthedPage";
import { useLanguage } from "@/context/LanguageContext";
import { useApiResource } from "@/lib/useApiResource";
import { apiFetch, ApiError } from "@/lib/api";
import { cx } from "@/lib/cx";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  PageShell,
  useToast,
} from "@/components";
import { Input } from "@/components/Field";

interface PlanFeatures {
  dailyQuestionLimit?: number;
  unlimitedFreeAccess?: boolean;
  residanatAllFaculties?: boolean;
  aiCredits?: { dailyAllowance: number; monthlyAllowance: number };
  [key: string]: unknown;
}

interface PlanRow {
  id: string;
  name: string;
  priceDzd: number | null;
  features: PlanFeatures | null;
  isActive: boolean;
}

interface FoundUser {
  id: string;
  fullName: string | null;
}

interface UserLimitsResponse {
  user: {
    id: string;
    email: string | null;
    fullName: string | null;
    dailyQuestionLimitOverride: number | null;
    unlimitedQuestionsOverride: boolean;
    aiDailyAllowanceOverride: number | null;
  };
  effective: {
    dailyQuestions: { limit: number; usedToday: number; remaining: number; isUnlimited: boolean };
    aiCredits: { dailyAllowance: number; monthlyAllowance: number };
  };
}

function canManageLimits(roles: string[] | undefined): boolean {
  if (!roles) return false;
  return roles.includes("admin") || roles.includes("super_admin");
}

function StatusPill({ active }: { active: boolean }) {
  const { t } = useLanguage();
  return (
    <span
      className={cx(
        "rounded-pill border px-2.5 py-0.5 text-caption font-semibold",
        active
          ? "border-success/50 bg-success/10 text-success"
          : "border-border bg-surface-2 text-text-secondary"
      )}
    >
      {active ? t("admin.limOn") : t("admin.limOff")}
    </span>
  );
}

export default function AdminLimitsPage() {
  const { user, isHydrated, handleLogout } = useAuthedPage();
  const { t } = useLanguage();
  const toast = useToast();
  const canFetch = isHydrated && !!user;
  const allowed = canManageLimits(user?.roles);

  const { data: plansData, error: plansError, isLoading: plansLoading, refetch: refetchPlans } =
    useApiResource<{ plans: PlanRow[] }>(canFetch && allowed ? "/plans" : null);

  const freePlan = useMemo(
    () => (plansData?.plans ?? []).find((p) => p.name === "free" || (p.priceDzd ?? 0) === 0) ?? null,
    [plansData]
  );
  const paidPlan = useMemo(
    () => (plansData?.plans ?? []).find((p) => (p.priceDzd ?? 0) > 0) ?? null,
    [plansData]
  );

  const [freeQcmInput, setFreeQcmInput] = useState("20");
  const [freeAiInput, setFreeAiInput] = useState("5");
  const [premAiInput, setPremAiInput] = useState("30");
  const [savingGlobal, setSavingGlobal] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (freePlan?.features) {
      if (typeof freePlan.features.dailyQuestionLimit === "number") {
        setFreeQcmInput(String(freePlan.features.dailyQuestionLimit));
      }
      if (typeof freePlan.features.aiCredits?.dailyAllowance === "number") {
        setFreeAiInput(String(freePlan.features.aiCredits.dailyAllowance));
      }
    }
    if (paidPlan?.features?.aiCredits && typeof paidPlan.features.aiCredits.dailyAllowance === "number") {
      setPremAiInput(String(paidPlan.features.aiCredits.dailyAllowance));
    }
  }, [freePlan, paidPlan]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function patchPlanFeatures(planId: string, features: PlanFeatures) {
    setSavingGlobal(true);
    try {
      await apiFetch(`/admin/plans/${planId}`, {
        method: "PATCH",
        body: JSON.stringify({ features }),
      });
      toast.success({ title: t("admin.limSaved") });
      refetchPlans();
    } catch (err) {
      toast.error({ title: err instanceof ApiError ? err.message : t("auth.genericError") });
    } finally {
      setSavingGlobal(false);
    }
  }

  async function handleSaveGlobalNumbers() {
    if (!freePlan || !paidPlan) return;
    const freeQcm = Number.parseInt(freeQcmInput, 10);
    const freeAi = Number.parseInt(freeAiInput, 10);
    const premAi = Number.parseInt(premAiInput, 10);
    if (![freeQcm, freeAi, premAi].every((n) => Number.isInteger(n) && n >= 0)) return;
    setSavingGlobal(true);
    try {
      await apiFetch(`/admin/plans/${freePlan.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          features: {
            dailyQuestionLimit: freeQcm,
            aiCredits: { dailyAllowance: freeAi, monthlyAllowance: freeAi * 30 },
          },
        }),
      });
      await apiFetch(`/admin/plans/${paidPlan.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          features: {
            aiCredits: { dailyAllowance: premAi, monthlyAllowance: premAi * 30 },
          },
        }),
      });
      toast.success({ title: t("admin.limSaved") });
      refetchPlans();
    } catch (err) {
      toast.error({ title: err instanceof ApiError ? err.message : t("auth.genericError") });
    } finally {
      setSavingGlobal(false);
    }
  }

  // Per-student search + overrides
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);
  const searchPath =
    allowed && canFetch && searched && query.trim().length >= 3
      ? `/users/search?q=${encodeURIComponent(query.trim())}`
      : null;
  const { data: searchData, error: searchError, isLoading: searchLoading } = useApiResource<{
    users: FoundUser[];
  }>(searchPath);
  const found = useMemo(() => searchData?.users ?? [], [searchData]);

  const [selectedUserId, setSelectedUserId] = useState("");
  const [pickedName, setPickedName] = useState<string | null>(null);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    selectedUserId.trim()
  );
  const {
    data: userLimitsData,
    error: userLimitsError,
    isLoading: userLimitsLoading,
    refetch: refetchUserLimits,
  } = useApiResource<UserLimitsResponse>(
    allowed && canFetch && isUuid ? `/admin/users/${selectedUserId.trim()}/limits` : null
  );

  const [userQcmInput, setUserQcmInput] = useState("");
  const [userAiInput, setUserAiInput] = useState("");
  const [userUnlimited, setUserUnlimited] = useState(false);
  const [savingUser, setSavingUser] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!userLimitsData) return;
    setUserQcmInput(
      userLimitsData.user.dailyQuestionLimitOverride !== null
        ? String(userLimitsData.user.dailyQuestionLimitOverride)
        : ""
    );
    setUserAiInput(
      userLimitsData.user.aiDailyAllowanceOverride !== null
        ? String(userLimitsData.user.aiDailyAllowanceOverride)
        : ""
    );
    setUserUnlimited(userLimitsData.user.unlimitedQuestionsOverride);
  }, [userLimitsData]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function patchUserLimits(payload: {
    dailyQuestionLimitOverride?: number | null;
    unlimitedQuestionsOverride?: boolean;
    aiDailyAllowanceOverride?: number | null;
  }) {
    if (!isUuid) return;
    setSavingUser(true);
    try {
      await apiFetch(`/admin/users/${selectedUserId.trim()}/limits`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      toast.success({ title: t("admin.limSaved") });
      refetchUserLimits();
    } catch (err) {
      toast.error({ title: err instanceof ApiError ? err.message : t("auth.genericError") });
    } finally {
      setSavingUser(false);
    }
  }

  const unlimitedFreeActive = freePlan?.features?.unlimitedFreeAccess === true;
  const residanatAllActive = paidPlan?.features?.residanatAllFaculties === true;

  return (
    <PageShell
      user={user}
      isHydrated={isHydrated}
      onLogout={handleLogout}
      width="content"
      title={t("admin.limits")}
      loadingLabel={t("common.loading")}
    >
      {!allowed ? (
        <EmptyState
          title={t("admin.denied")}
          description={t("admin.deniedDesc")}
          action={{ label: t("classement.backToDashboard"), href: "/dashboard" }}
        />
      ) : (
        <>
          <Card className="mt-section-gap">
            <h2 className="font-display text-h3 font-semibold text-text-primary">
              {t("admin.limGlobalTitle")}
            </h2>
            <p className="mt-1 text-meta text-text-secondary">{t("admin.limGlobalDesc")}</p>

            {plansLoading ? (
              <LoadingSkeleton className="mt-4 h-20 w-full" ariaLabel={t("common.loading")} />
            ) : null}
            {plansError ? (
              <ErrorState message={plansError} onRetry={refetchPlans} className="mt-4" />
            ) : null}

            {!plansLoading && !plansError ? (
              <div className="mt-4 flex flex-col gap-4">
                {freePlan ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-border bg-surface-2 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-body font-semibold text-text-primary">
                          {t("admin.limFreeAllTitle")}
                        </p>
                        <StatusPill active={unlimitedFreeActive} />
                      </div>
                      <p className="mt-1 text-meta text-text-secondary">
                        {t("admin.limFreeAllDesc")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant={unlimitedFreeActive ? "outline" : "primary"}
                      disabled={savingGlobal}
                      onClick={() =>
                        patchPlanFeatures(freePlan.id, {
                          unlimitedFreeAccess: !unlimitedFreeActive,
                        })
                      }
                    >
                      {unlimitedFreeActive ? t("admin.limToggleOff") : t("admin.limToggleOn")}
                    </Button>
                  </div>
                ) : null}

                {paidPlan ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-border bg-surface-2 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-body font-semibold text-text-primary">
                          {t("admin.limResidanatAllTitle")}
                        </p>
                        <StatusPill active={residanatAllActive} />
                      </div>
                      <p className="mt-1 text-meta text-text-secondary">
                        {t("admin.limResidanatAllDesc")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant={residanatAllActive ? "outline" : "primary"}
                      disabled={savingGlobal}
                      onClick={() =>
                        patchPlanFeatures(paidPlan.id, {
                          residanatAllFaculties: !residanatAllActive,
                        })
                      }
                    >
                      {residanatAllActive ? t("admin.limToggleOff") : t("admin.limToggleOn")}
                    </Button>
                  </div>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-3">
                  <Input
                    id="lim-free-qcm"
                    label={t("admin.limFreeDailyQcm")}
                    type="number"
                    min={0}
                    max={5000}
                    value={freeQcmInput}
                    onChange={(e) => setFreeQcmInput(e.target.value)}
                  />
                  <Input
                    id="lim-free-ai"
                    label={t("admin.limFreeDailyAi")}
                    type="number"
                    min={0}
                    max={5000}
                    value={freeAiInput}
                    onChange={(e) => setFreeAiInput(e.target.value)}
                  />
                  <Input
                    id="lim-prem-ai"
                    label={t("admin.limPremiumDailyAi")}
                    type="number"
                    min={0}
                    max={5000}
                    value={premAiInput}
                    onChange={(e) => setPremAiInput(e.target.value)}
                  />
                </div>

                <Button
                  type="button"
                  width="full"
                  disabled={savingGlobal || !freePlan || !paidPlan}
                  onClick={handleSaveGlobalNumbers}
                >
                  {t("admin.limSaveGlobal")}
                </Button>
              </div>
            ) : null}
          </Card>

          <Card className="mt-section-gap">
            <h2 className="font-display text-h3 font-semibold text-text-primary">
              {t("admin.limStudentTitle")}
            </h2>
            <p className="mt-1 text-meta text-text-secondary">{t("admin.limStudentDesc")}</p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
              <Input
                id="admin-limits-search"
                label={t("admin.limSearchLabel")}
                placeholder={t("admin.limSearchPh")}
                value={query}
                fieldClassName="flex-1"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSearched(false);
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={query.trim().length < 3 || searchLoading}
                onClick={() => setSearched(true)}
              >
                {t("admin.limSearchBtn")}
              </Button>
            </div>

            {searchError ? <ErrorState message={searchError} className="mt-3" /> : null}
            {searched && !searchLoading && found.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-2">
                {found.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUserId(u.id);
                        setPickedName(u.fullName);
                      }}
                      className="flex w-full items-center justify-between rounded-control border border-border bg-surface-2 px-3 py-2 text-left text-body text-text-primary transition hover:bg-surface-3"
                    >
                      <span className="truncate font-medium">{u.fullName ?? u.id}</span>
                      <span className="ml-2 shrink-0 font-mono text-caption text-text-tertiary">
                        {u.id.slice(0, 8)}…
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <Input
              id="admin-limits-userid"
              label={t("admin.limUserIdLabel")}
              value={selectedUserId}
              fieldClassName="mt-4"
              onChange={(e) => {
                setSelectedUserId(e.target.value);
                setPickedName(null);
              }}
            />

            {userLimitsLoading ? (
              <LoadingSkeleton className="mt-4 h-16 w-full" ariaLabel={t("common.loading")} />
            ) : null}
            {userLimitsError ? (
              <ErrorState message={userLimitsError} onRetry={refetchUserLimits} className="mt-4" />
            ) : null}

            {userLimitsData ? (
              <div className="mt-4 flex flex-col gap-4 border-t border-border pt-4">
                <p className="text-body font-semibold text-text-primary">
                  {pickedName ?? userLimitsData.user.fullName ?? userLimitsData.user.email ?? userLimitsData.user.id}
                </p>
                <p className="text-meta text-text-secondary">
                  {t("admin.limEffective", {
                    qcm: userLimitsData.effective.dailyQuestions.isUnlimited
                      ? t("admin.limEffectiveUnlimited")
                      : String(userLimitsData.effective.dailyQuestions.limit),
                    ai: String(userLimitsData.effective.aiCredits.dailyAllowance),
                  })}
                </p>

                <label className="flex items-center justify-between gap-3 rounded-panel border border-border bg-surface-2 px-3 py-2.5">
                  <span className="text-body text-text-primary">{t("admin.limUserUnlimited")}</span>
                  <input
                    type="checkbox"
                    checked={userUnlimited}
                    onChange={(e) => setUserUnlimited(e.target.checked)}
                    className="h-4 w-4 accent-[var(--color-accent-primary)]"
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    id="lim-user-qcm"
                    label={t("admin.limUserQcm")}
                    type="number"
                    min={0}
                    max={5000}
                    placeholder="20"
                    value={userQcmInput}
                    onChange={(e) => setUserQcmInput(e.target.value)}
                  />
                  <Input
                    id="lim-user-ai"
                    label={t("admin.limUserAi")}
                    type="number"
                    min={0}
                    max={5000}
                    placeholder="5"
                    value={userAiInput}
                    onChange={(e) => setUserAiInput(e.target.value)}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={savingUser}
                    onClick={() => {
                      const qcmVal = userQcmInput.trim() === "" ? null : Number.parseInt(userQcmInput, 10);
                      const aiVal = userAiInput.trim() === "" ? null : Number.parseInt(userAiInput, 10);
                      if ((qcmVal !== null && (!Number.isInteger(qcmVal) || qcmVal < 0)) || (aiVal !== null && (!Number.isInteger(aiVal) || aiVal < 0))) {
                        return;
                      }
                      patchUserLimits({
                        dailyQuestionLimitOverride: qcmVal,
                        unlimitedQuestionsOverride: userUnlimited,
                        aiDailyAllowanceOverride: aiVal,
                      });
                    }}
                  >
                    {t("admin.limSaveUser")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={savingUser}
                    onClick={() =>
                      patchUserLimits({
                        dailyQuestionLimitOverride: null,
                        unlimitedQuestionsOverride: false,
                        aiDailyAllowanceOverride: null,
                      })
                    }
                  >
                    {t("admin.limResetUser")}
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        </>
      )}
    </PageShell>
  );
}
