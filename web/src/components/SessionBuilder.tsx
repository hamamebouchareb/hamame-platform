"use client";

import { useEffect, useMemo, useState } from "react";
import { cx } from "@/lib/cx";
import { useLanguage } from "@/context/LanguageContext";
import type { I18nKey } from "@/lib/i18n";
import { useApiResource } from "@/lib/useApiResource";
import { Button } from "@/components/Button";
import { ErrorState } from "@/components/ErrorState";
import { Input, Select } from "@/components/Field";
import type {
  CurriculumModule,
  Faculty,
  QuestionCountsResponse,
  QuestionSource,
  QuestionType,
  Unit,
  Year,
} from "@/lib/types";

export type ResultSort = "by_year" | "by_course" | "random";

export interface SessionConfig {
  mode: "practice" | "exam";
  /** Auto-generated display name sent as the session's `name`. */
  name: string;
  facultyId?: string;
  yearId?: string;
  moduleId?: string;
  /** Multi-select of units ("courses") inside the module. Empty = whole module scope. */
  unitIds?: string[];
  questionTypes: QuestionType[];
  /** Raw DB `source` value; absent = all sources. */
  source?: QuestionSource;
  /** Past-exam sitting scope; absent = untagged + tagged alike. */
  examYear?: number;
  sittingLabel?: string;
  /** Inclusive exam-year range ends; each absent = open-ended. */
  examYearFrom?: number;
  examYearTo?: number;
  size: number;
  /** Present only when exam mode with an explicit limit. */
  timeLimitSeconds?: number | null;
  /** FR-15 — result ordering, sent as the API's `sort` param. */
  resultSort: ResultSort;
  /** FR-16 — detailed statistics on the results screen (inline switch). */
  showStats: boolean;
}

export interface SessionBuilderProps {
  /** Preselected correction mode (used by the QCM entry point's "Examen" action). */
  initialMode?: "practice" | "exam";
  /** Preselect the student's own faculty/year once the lists load. */
  initialFacultyId?: string | null;
  initialYearId?: string | null;
  onStart: (config: SessionConfig) => void;
  isStarting?: boolean;
  startError?: string | null;
  questionCountOptions?: number[];
  className?: string;
}

const QUESTION_TYPE_OPTIONS: { value: QuestionType; labelKey: I18nKey }[] = [
  { value: "QCM", labelKey: "builder.typeQcm" },
  { value: "QCS", labelKey: "builder.typeQcs" },
  { value: "QROC", labelKey: "builder.typeQroc" },
  { value: "CLINICAL_CASE", labelKey: "builder.typeClinical" },
];

const TIME_LIMIT_VALUES_MINUTES: (number | null)[] = [null, 10, 15, 30, 45, 60, 90, 120];

/** Fixed preset labels (minutes/hours inflect per language — never hard-code). */
function timeLimitLabel(
  value: number | null,
  t: (
    key: "builder.noLimit" | "builder.minutes" | "builder.oneHour" | "builder.oneHourThirty" | "builder.twoHours",
    vars?: Record<string, string | number | null | undefined>
  ) => string
): string {
  if (value === null) return t("builder.noLimit");
  if (value === 60) return t("builder.oneHour");
  if (value === 90) return t("builder.oneHourThirty");
  if (value === 120) return t("builder.twoHours");
  return t("builder.minutes", { n: value });
}

/**
 * P17 sitting time preset: seconds of exam time budgeted per question when a
 * sitting is selected in exam mode. HAMAME'S OWN CONVENTION — not copied from
 * anywhere: the live reference shows no per-paper time, so this derives from
 * the live question counter instead (count × this constant, rounded up to the
 * nearest TIME_LIMIT_VALUES_MINUTES preset). The student can always override.
 */
const EXAM_SECONDS_PER_QUESTION = 90;

/** Smallest TIME_LIMIT_VALUES_MINUTES preset >= seconds (null = no-limit excluded). */
function presetForSeconds(seconds: number): number | null {
  const minutes = seconds / 60;
  for (const value of TIME_LIMIT_VALUES_MINUTES) {
    if (value !== null && value >= minutes) return value * 60;
  }
  return 120 * 60;
}

const RESULT_SORT_OPTIONS: { value: ResultSort; labelKey: I18nKey }[] = [
  { value: "random", labelKey: "builder.sortRandom" },
  { value: "by_year", labelKey: "builder.sortByYear" },
  { value: "by_course", labelKey: "builder.sortByCourse" },
];

/** Raw DB source values with the same labels as the session player's
 * formatSource — deliberately NOT Externat/Résidanat: the questions table has no
 * sitting taxonomy, and relabeling provenance as sittings would invent a mapping. */
const SOURCE_OPTIONS: { value: "" | QuestionSource; labelKey: I18nKey }[] = [
  { value: "", labelKey: "builder.sourceAll" },
  { value: "official_exam", labelKey: "builder.sourceOfficial" },
  { value: "hamame_authored", labelKey: "builder.sourceHamame" },
  { value: "ai_generated", labelKey: "builder.sourceAi" },
];

/** Parses a sitting-year input; undefined unless a plausible 4-digit year. */
function parseSittingYear(value: string): number | undefined {
  if (!/^\d{4}$/.test(value.trim())) return undefined;
  const year = Number(value);
  return year >= 1000 && year <= 9999 ? year : undefined;
}

interface SelectOption {
  value: string;
  label: string;
}

/** Cascade select: shared Select with the builder's loading-placeholder row.
 *  `title` carries the disabled-with-reason microcopy (valid select attr,
 *  passed straight through). */
function LabeledSelect({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  loading,
  title,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
  disabled?: boolean;
  loading?: boolean;
  /** Task 3c reason microcopy, mirroring the reference disabled-with-reason pattern. */
  title?: string;
}) {
  const { t } = useLanguage();
  return (
    <Select
      id={id}
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled || loading}
      title={title}
    >
      <option value="">{loading ? t("builder.loadingShort") : placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}

/** Inline switch row (FR-16: exam mode and statistics toggles live inside the builder,
 * not on a separate screen). role="switch" keeps it accessible without a UI kit. */
function SwitchRow({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <div className="flex items-start justify-between gap-4 rounded-panel border border-border bg-surface-2 px-3 py-2.5">
      <span className="min-w-0">
        <label htmlFor={id} className="block text-body text-text-primary">
          {label}
        </label>
        <span className="mt-0.5 block text-meta text-text-tertiary">{description}</span>
      </span>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        aria-label={`${label} — ${checked ? t("builder.switchOn") : t("builder.switchOff")}`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative mt-0.5 inline-flex h-6 w-11 shrink-0 rounded-pill border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50",
          checked ? "border-accent-qcm bg-accent-qcm" : "border-border bg-surface-3"
        )}
      >
        <span
          aria-hidden
          className={cx(
            "pointer-events-none absolute left-[2px] top-[2px] inline-block h-[18px] w-[18px] rounded-pill bg-surface-1 shadow transition-transform",
            checked && "translate-x-[22px]"
          )}
        />
      </button>
    </div>
  );
}

/** Session configuration form: correction mode, curriculum cascade, question types,
 * count, result ordering, and the FR-16 inline exam/statistics switches. Emits a
 * ready-to-post SessionConfig. */
export function SessionBuilder({
  initialMode = "practice",
  initialFacultyId = null,
  initialYearId = null,
  onStart,
  isStarting = false,
  startError,
  questionCountOptions = [5, 10, 20, 30, 50],
  className,
}: SessionBuilderProps) {
  const { t } = useLanguage();
  const [mode, setMode] = useState<"practice" | "exam">(initialMode);
  const [facultyId, setFacultyId] = useState("");
  const [yearId, setYearId] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>(["QCM", "QCS"]);
  const [source, setSource] = useState<"" | QuestionSource>("");
  // Past-exam picker + period filter. Year stored as string for the select; the
  // sitting list stays DB-driven (distinct values present in scope, never hardcoded).
  const [examYear, setExamYear] = useState("");
  const [sittingLabel, setSittingLabel] = useState("");
  const [examYearFrom, setExamYearFrom] = useState("");
  const [examYearTo, setExamYearTo] = useState("");
  const [size, setSize] = useState(questionCountOptions.includes(20) ? 20 : questionCountOptions[0]);
  const [timeLimitSeconds, setTimeLimitSeconds] = useState<number | null>(null);
  const [resultSort, setResultSort] = useState<ResultSort>("random");
  const [showStats, setShowStats] = useState(true);
  // P17: once the student picks a time manually, proposals stop overriding it.
  // State (not a ref) so the time-basis hint below can read it during render.
  const [timeTouched, setTimeTouched] = useState(false);

  const faculties = useApiResource<{ faculties: Faculty[] }>("/faculties");
  const years = useApiResource<{ years: Year[] }>(facultyId ? `/faculties/${facultyId}/years` : null);
  const modules = useApiResource<{ modules: CurriculumModule[] }>(yearId ? `/years/${yearId}/modules` : null);
  const units = useApiResource<{ units: Unit[] }>(moduleId ? `/modules/${moduleId}/units` : null);

  const facultyList = useMemo(() => faculties.data?.faculties ?? [], [faculties.data]);
  const yearList = useMemo(() => years.data?.years ?? [], [years.data]);
  const moduleList = useMemo(() => modules.data?.modules ?? [], [modules.data]);
  const unitList = useMemo(
    () => [...(units.data?.units ?? [])].sort((a, b) => a.orderIndex - b.orderIndex),
    [units.data]
  );

  // Live counts (GET /api/questions/counts, same visibility rules as the list).  // Two queries: the scope call (no unitIds) feeds stable per-unit/per-module badges
  // plus the counter when nothing is ticked; the total call adds the ticked unitIds
  // and feeds the counter only when boxes are checked. Badges deliberately exclude
  // the unit selection so they don't jitter while ticking.
  const scopeQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (facultyId) params.append("facultyId", facultyId);
    if (yearId) params.append("yearId", yearId);
    if (moduleId) params.append("moduleId", moduleId);
    for (const type of questionTypes) params.append("types", type);
    if (source) params.append("source", source);
    const pickedYear = parseSittingYear(examYear);
    if (pickedYear !== undefined) params.append("examYear", String(pickedYear));
    if (sittingLabel.trim()) params.append("sittingLabel", sittingLabel.trim());
    const from = parseSittingYear(examYearFrom);
    if (from !== undefined) params.append("examYearFrom", String(from));
    const to = parseSittingYear(examYearTo);
    if (to !== undefined) params.append("examYearTo", String(to));
    return params.toString();
  }, [facultyId, yearId, moduleId, questionTypes, source, examYear, sittingLabel, examYearFrom, examYearTo]);

  const totalQuery = useMemo(() => {
    if (unitIds.length === 0) return null;
    const params = new URLSearchParams(scopeQuery);
    for (const id of unitIds) params.append("unitIds", id);
    return params.toString();
  }, [scopeQuery, unitIds]);

  const scopeCounts = useApiResource<QuestionCountsResponse>(`/questions/counts?${scopeQuery}`);
  const totalCounts = useApiResource<QuestionCountsResponse>(
    totalQuery ? `/questions/counts?${totalQuery}` : null
  );

  const countByUnitId = useMemo(
    () => new Map((scopeCounts.data?.byUnit ?? []).map((entry) => [entry.unitId, entry.count])),
    [scopeCounts.data]
  );
  const countByModuleId = useMemo(
    () => new Map((scopeCounts.data?.byModule ?? []).map((entry) => [entry.moduleId, entry.count])),
    [scopeCounts.data]
  );

  // Past-exam picker options: distinct sittings actually present in scope, straight
  // from the counts response — never hardcoded. Year list narrows the label list.
  const sittings = useMemo(() => scopeCounts.data?.sittings ?? [], [scopeCounts.data]);
  const sittingYears = useMemo(
    () =>
      [...new Set(sittings.map((entry) => entry.examYear))]
        .filter((year): year is number => year !== null)
        .sort((a, b) => b - a),
    [sittings]
  );
  const sittingLabels = useMemo(() => {
    const pickedYear = parseSittingYear(examYear);
    const labels = sittings
      .filter(
        (entry) =>
          entry.sittingLabel !== null && (pickedYear === undefined || entry.examYear === pickedYear)
      )
      .map((entry) => entry.sittingLabel as string);
    return [...new Set(labels)].sort((a, b) => a.localeCompare(b, "fr"));
  }, [sittings, examYear]);

  // Effective live counter: scope total when nothing is ticked (no second request),
  // unit-restricted total otherwise.
  const liveTotal = unitIds.length === 0 ? scopeCounts.data?.total : totalCounts.data?.total;
  const countsLoading =
    unitIds.length === 0 ? scopeCounts.isLoading : totalCounts.isLoading || scopeCounts.isLoading;
  const countsError = totalQuery ? (totalCounts.error ?? scopeCounts.error) : scopeCounts.error;
  const countsResolved = liveTotal !== undefined && !countsLoading;
  const emptyResult = countsResolved && liveTotal === 0;

  function refetchCounts() {
    scopeCounts.refetch();
    if (totalQuery) totalCounts.refetch();
  }

  // Preselect the student's own faculty/year once their lists resolve (guarded by
  // existence checks so a hidden faculty or stale year id simply leaves the fields
  // untouched). Same sync-with-external-system convention as useApiResource / the
  // dashboard's localStorage read.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!facultyId && initialFacultyId && facultyList.some((f) => f.id === initialFacultyId)) {
      setFacultyId(initialFacultyId);
    }
  }, [facultyId, initialFacultyId, facultyList]);

  useEffect(() => {
    if (facultyId && !yearId && initialYearId && yearList.some((y) => y.id === initialYearId)) {
      setYearId(initialYearId);
    }
  }, [facultyId, yearId, initialYearId, yearList]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // P17 sitting time preset: in exam mode with a sitting picked, propose a time
  // limit from the live counter (count × EXAM_SECONDS_PER_QUESTION, rounded up
  // to a preset). Manual picks win permanently (timeTouchedRef); clearing the
  // sitting leaves the current value alone rather than yanking it.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (mode !== "exam" || timeTouched) return;
    const sittingPicked =
      parseSittingYear(examYear) !== undefined || sittingLabel.trim() !== "";
    if (!sittingPicked) return;
    if (liveTotal === undefined || liveTotal <= 0) return;
    setTimeLimitSeconds(presetForSeconds(liveTotal * EXAM_SECONDS_PER_QUESTION));
  }, [mode, examYear, sittingLabel, liveTotal, timeTouched]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleFacultyChange(value: string) {
    setFacultyId(value);
    setYearId("");
    setModuleId("");
    setUnitIds([]);
  }

  function handleYearChange(value: string) {
    setYearId(value);
    setModuleId("");
    setUnitIds([]);
  }

  function handleModuleChange(value: string) {
    setModuleId(value);
    setUnitIds([]);
  }

  function toggleUnitId(id: string) {
    setUnitIds((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));
  }

  function toggleQuestionType(type: QuestionType) {
    setQuestionTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  }

  const selectedFaculty = facultyList.find((f) => f.id === facultyId);
  const selectedYear = yearList.find((y) => y.id === yearId);
  const selectedModule = moduleList.find((m) => m.id === moduleId);
  const selectedUnits = unitList.filter((u) => unitIds.includes(u.id));  // Module option labels carry their live counts once the year scope has loaded.
  const showModuleCounts = scopeCounts.data !== null && yearId !== "";
  const moduleOptions = moduleList.map((m) => ({
    value: m.id,
    label: showModuleCounts ? `${m.name} (${countByModuleId.get(m.id) ?? 0})` : m.name,
  }));
  const scopeName =
    selectedUnits.length > 1 && selectedModule
      ? `${selectedModule.name} · ${t("builder.scopeUnits", { count: selectedUnits.length })}`
      : (selectedUnits[0]?.name ??
        selectedModule?.name ??
        selectedYear?.label ??
        selectedFaculty?.name ??
        null);

  const config: SessionConfig = {
    mode,
    name: `${mode === "practice" ? t("builder.namePractice") : t("builder.nameExam")}${scopeName ? ` — ${scopeName}` : ""}`,
    ...(facultyId ? { facultyId } : {}),
    ...(yearId ? { yearId } : {}),
    ...(moduleId ? { moduleId } : {}),
    ...(unitIds.length > 0 ? { unitIds } : {}),
    questionTypes,
    ...(source ? { source } : {}),
    ...(parseSittingYear(examYear) !== undefined ? { examYear: parseSittingYear(examYear)! } : {}),
    ...(sittingLabel.trim() ? { sittingLabel: sittingLabel.trim() } : {}),
    ...(parseSittingYear(examYearFrom) !== undefined ? { examYearFrom: parseSittingYear(examYearFrom)! } : {}),
    ...(parseSittingYear(examYearTo) !== undefined ? { examYearTo: parseSittingYear(examYearTo)! } : {}),
    size,
    resultSort,
    showStats,
    ...(mode === "exam" ? { timeLimitSeconds } : {}),
  };

  return (
    <form
      className={cx("flex flex-col gap-5 rounded-card border border-border bg-surface-1 p-card-padding shadow-card", className)}
      onSubmit={(event) => {
        event.preventDefault();
        onStart(config);
      }}
    >
      {/* FR-16 — exam mode + statistics as inline switches, same flow as the rest of
          the builder (no separate screen/step). */}
      <fieldset>
        <legend className="mb-2 text-meta font-medium text-text-secondary">{t("builder.modeDisplay")}</legend>
        <div className="flex flex-col gap-2">
          <SwitchRow
            id="builder-exam-mode"
            label={t("builder.examMode")}
            description={
              mode === "exam"
                ? t("builder.examModeOn")
                : t("builder.examModeOff")
            }
            checked={mode === "exam"}
            onChange={(checked) => setMode(checked ? "exam" : "practice")}
            disabled={isStarting}
          />
          <SwitchRow
            id="builder-show-stats"
            label={t("builder.showStats")}
            description={t("builder.showStatsDesc")}
            checked={showStats}
            onChange={setShowStats}
            disabled={isStarting}
          />
        </div>
        {/* 3d trust copy: exam-mode withholding, stated exactly as implemented
            (Phase 2 rule) — renders in exam mode only, next to the switch. */}
        {mode === "exam" ? (
          <p className="mt-2 rounded-panel border border-border bg-surface-2 px-3 py-2.5 text-meta text-text-secondary">
            {t("builder.examTrust")}
          </p>
        ) : null}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-meta font-medium text-text-secondary">{t("builder.scope")}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <LabeledSelect
            id="builder-faculty"
            label={t("builder.faculty")}
            value={facultyId}
            onChange={handleFacultyChange}
            options={facultyList.map((f) => ({ value: f.id, label: f.name }))}
            placeholder={t("builder.allFaculties")}
            loading={faculties.isLoading}
          />
          <LabeledSelect
            id="builder-year"
            label={t("builder.year")}
            value={yearId}
            onChange={handleYearChange}
            options={yearList.map((y) => ({ value: y.id, label: y.label }))}
            placeholder={t("builder.allYears")}
            disabled={!facultyId}
            loading={years.isLoading}
            title={!facultyId ? t("builder.needFaculty") : undefined}
          />
          <LabeledSelect
            id="builder-module"
            label={t("builder.module")}
            value={moduleId}
            onChange={handleModuleChange}
            options={moduleOptions}
            placeholder={t("builder.allModules")}
            disabled={!yearId}
            loading={modules.isLoading}
            title={!yearId ? t("builder.needYear") : undefined}
          />
        </div>
        {/* Course-level multi-select (units carry the questions): checkbox list with
            live count badges. Nothing ticked = whole module scope. */}
        <div className="mt-3">
          <span id="builder-units-label" className="mb-2 block text-meta font-medium text-text-secondary">
            {t("builder.units")}{unitIds.length > 0 ? ` ${t(unitIds.length === 1 ? "builder.selectedOne" : "builder.selectedMany", { count: unitIds.length })}` : ""}
          </span>
          {!moduleId ? (
            <p className="rounded-panel border border-border bg-surface-2 px-3 py-2.5 text-meta text-text-tertiary">
              {t("builder.needModule")}
            </p>
          ) : units.isLoading && unitList.length === 0 ? (
            <p className="rounded-panel border border-border bg-surface-2 px-3 py-2.5 text-meta text-text-tertiary">
              {t("builder.loadingUnits")}
            </p>
          ) : unitList.length === 0 ? (
            <p className="rounded-panel border border-border bg-surface-2 px-3 py-2.5 text-meta text-text-tertiary">
              {t("builder.noUnits")}
            </p>
          ) : (
            <>
              <div className="mb-2 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setUnitIds(unitList.map((u) => u.id))}
                  disabled={isStarting}
                >
                  {t("builder.all")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setUnitIds([])}
                  disabled={isStarting}
                >
                  {t("builder.noneWholeModule")}
                </Button>
              </div>
              <ul aria-labelledby="builder-units-label" className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {unitList.map((unit) => {
                  const checked = unitIds.includes(unit.id);
                  const badge =
                    scopeCounts.data !== null ? String(countByUnitId.get(unit.id) ?? 0) : "…";
                  return (
                    <li key={unit.id}>
                      <label
                        className={cx(
                          "flex min-h-touch-target cursor-pointer items-center gap-2 rounded-panel border bg-surface-2 px-3 text-body text-text-primary transition duration-200 hover:bg-surface-3 has-[:checked]:border-accent-qcm has-[:checked]:bg-accent-qcm/10",
                          checked ? "border-accent-qcm" : "border-border"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleUnitId(unit.id)}
                          disabled={isStarting}
                          className="h-4 w-4 shrink-0 accent-[var(--color-accent-qcm)]"
                        />
                        <span className="min-w-0 flex-1 truncate">{unit.name}</span>
                        <span
                          aria-label={t("builder.badgeQuestions", { badge })}
                          className="shrink-0 rounded-pill border border-border bg-surface-3 px-2 py-0.5 text-meta font-semibold text-text-secondary"
                        >
                          {badge}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
        {faculties.error ? (
          <ErrorState
            className="mt-2"
            message={t("builder.facultiesError")}
            onRetry={faculties.refetch}
          />
        ) : null}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-meta font-medium text-text-secondary">{t("builder.questionTypes")}</legend>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
          {QUESTION_TYPE_OPTIONS.map((option) => {
            const checked = questionTypes.includes(option.value);
            return (
              <label
                key={option.value}
                className={cx(
                          "flex min-h-touch-target cursor-pointer items-center gap-2 rounded-panel border bg-surface-2 px-3 text-body text-text-primary transition duration-200 hover:bg-surface-3 has-[:checked]:border-accent-qcm has-[:checked]:bg-accent-qcm/10",
                  checked ? "border-accent-qcm" : "border-border"
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleQuestionType(option.value)}
                  disabled={isStarting}
                  className="h-4 w-4 shrink-0 accent-[var(--color-accent-qcm)]"
                />
                {t(option.labelKey)}
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-meta font-medium text-text-secondary">{t("builder.source")}</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {SOURCE_OPTIONS.map((option) => {
            const checked = source === option.value;
            return (
              <label
                key={option.labelKey}
                className={cx(
                          "flex min-h-touch-target cursor-pointer items-center gap-2 rounded-panel border bg-surface-2 px-3 text-body text-text-primary transition duration-200 hover:bg-surface-3 has-[:checked]:border-accent-qcm has-[:checked]:bg-accent-qcm/10",
                  checked ? "border-accent-qcm" : "border-border"
                )}
              >
                <input
                  type="radio"
                  name="builder-source"
                  checked={checked}
                  onChange={() => setSource(option.value)}
                  disabled={isStarting}
                  className="h-4 w-4 shrink-0 accent-[var(--color-accent-qcm)]"
                />
                {t(option.labelKey)}
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* Past-exam picker + period filter. Options come from the counts response's
          sittings array (distinct values actually in scope) — never hardcoded. */}
      <fieldset>
        <legend className="mb-2 text-meta font-medium text-text-secondary">{t("builder.pastExam")}</legend>
        {sittings.length === 0 && !scopeCounts.isLoading ? (
          <p className="rounded-panel border border-border bg-surface-2 px-3 py-2.5 text-meta text-text-tertiary">
            {t("builder.noSittingDesc")}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              id="builder-exam-year"
              label={t("builder.sittingYear")}
              value={examYear}
              onChange={(event) => {
                setExamYear(event.target.value);
                setSittingLabel("");
              }}
              disabled={isStarting || sittings.length === 0}
              title={sittings.length === 0 ? t("builder.noSitting") : undefined}
            >
              <option value="">{t("builder.allSittingYears")}</option>
              {sittingYears.map((year) => (
                <option key={year} value={String(year)}>
                  {year}
                </option>
              ))}
            </Select>
            <Select
              id="builder-sitting-label"
              label={t("builder.sitting")}
              value={sittingLabel}
              onChange={(event) => setSittingLabel(event.target.value)}
              disabled={isStarting || sittings.length === 0}
              title={sittings.length === 0 ? t("builder.noSitting") : undefined}
            >
              <option value="">{t("builder.allSittings")}</option>
              {sittingLabels.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Input
            id="builder-year-from"
            label={t("builder.periodFrom")}
            inputMode="numeric"
            placeholder={t("builder.yearExample", { year: 2020 })}
            value={examYearFrom}
            onChange={(event) => setExamYearFrom(event.target.value)}
            disabled={isStarting}
          />
          <Input
            id="builder-year-to"
            label={t("builder.periodTo")}
            inputMode="numeric"
            placeholder={t("builder.yearExample", { year: 2025 })}
            value={examYearTo}
            onChange={(event) => setExamYearTo(event.target.value)}
            disabled={isStarting}
          />
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          id="builder-question-count"
          label={t("builder.questionCount")}
          value={String(size)}
          onChange={(event) => setSize(Number(event.target.value))}
          disabled={isStarting}
        >
          {questionCountOptions.map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </Select>

        {/* FR-15 — result ordering (by year / by course / randomized). */}
        <Select
          id="builder-result-sort"
          label={t("builder.resultSort")}
          value={resultSort}
          onChange={(event) => setResultSort(event.target.value as ResultSort)}
          disabled={isStarting}
        >
          {RESULT_SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </Select>

        {mode === "exam" ? (
          <Select
            id="builder-time-limit"
            label={t("builder.timeLimit")}
            value={timeLimitSeconds === null ? "" : String(timeLimitSeconds / 60)}
            onChange={(event) => {
              setTimeTouched(true);
              setTimeLimitSeconds(event.target.value === "" ? null : Number(event.target.value) * 60);
            }}
            disabled={isStarting}
            hint={
              !timeTouched &&
              (parseSittingYear(examYear) !== undefined || sittingLabel.trim() !== "") &&
              liveTotal !== undefined &&
              liveTotal > 0
                ? t(liveTotal === 1 ? "builder.timeBasisOne" : "builder.timeBasisMany", {
                    count: liveTotal,
                    per: EXAM_SECONDS_PER_QUESTION,
                  })
                : undefined
            }
          >
            {TIME_LIMIT_VALUES_MINUTES.map((value) => (
              <option key={value ?? "none"} value={value ?? ""}>
                {timeLimitLabel(value, t)}
              </option>
            ))}
          </Select>
        ) : null}
      </div>

      {startError ? <ErrorState message={startError} /> : null}

      {/* Live counter: exact match count for the current filters, before starting. */}
      <div
        aria-live="polite"
        className="flex min-h-touch-target items-center justify-between gap-3 rounded-panel border border-border bg-surface-2 px-3 py-2.5"
      >
        {countsError ? (
          <>
            <span className="text-meta text-danger">{t("builder.countError")}</span>
            <button
              type="button"
              onClick={refetchCounts}
              className="shrink-0 font-medium text-accent-soft underline underline-offset-2 hover:text-accent-soft/80 text-meta"
            >
              {t("common.retry")}
            </button>
          </>
        ) : liveTotal === undefined ? (
          <span className="text-meta text-text-tertiary">{t("builder.counting")}</span>
        ) : (
          <>
            <span className="text-body font-semibold text-text-primary">
              {t(liveTotal === 1 ? "builder.countOne" : "builder.countMany", { count: liveTotal })}
            </span>
            {emptyResult ? (
              <span className="text-meta text-text-tertiary">{t("builder.widenFilters")}</span>
            ) : null}
          </>
        )}
      </div>

      <Button
        type="submit"
        width="full"
        accent="qcm"
        disabled={isStarting || questionTypes.length === 0 || size <= 0 || emptyResult}
        title={
          emptyResult
            ? t("builder.emptyHint")
            : questionTypes.length === 0
              ? t("builder.needType")
              : undefined
        }
      >
        {isStarting ? t("builder.starting") : mode === "practice" ? t("builder.startPractice") : t("builder.startExam")}
      </Button>
    </form>
  );
}
