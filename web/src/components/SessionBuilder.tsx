"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/lib/cx";
import { useApiResource } from "@/lib/useApiResource";
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

const QUESTION_TYPE_OPTIONS: { value: QuestionType; label: string }[] = [
  { value: "QCM", label: "QCM — choix multiples" },
  { value: "QCS", label: "QCS — choix simple" },
  { value: "QROC", label: "QROC — réponse ouverte courte" },
  { value: "CLINICAL_CASE", label: "Cas clinique" },
];

const TIME_LIMIT_OPTIONS_MINUTES: { value: number | null; label: string }[] = [
  { value: null, label: "Sans limite" },
  { value: 10, label: "10 minutes" },
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 45, label: "45 minutes" },
  { value: 60, label: "1 heure" },
  { value: 90, label: "1 h 30" },
  { value: 120, label: "2 heures" },
];

/**
 * P17 sitting time preset: seconds of exam time budgeted per question when a
 * sitting is selected in exam mode. HAMAME'S OWN CONVENTION — not copied from
 * anywhere: the live reference shows no per-paper time, so this derives from
 * the live question counter instead (count × this constant, rounded up to the
 * nearest TIME_LIMIT_OPTIONS_MINUTES preset). The student can always override.
 */
const EXAM_SECONDS_PER_QUESTION = 90;

/** Smallest TIME_LIMIT_OPTIONS_MINUTES preset >= seconds (null = Sans limite excluded). */
function presetForSeconds(seconds: number): number | null {
  const minutes = seconds / 60;
  for (const option of TIME_LIMIT_OPTIONS_MINUTES) {
    if (option.value !== null && option.value >= minutes) return option.value * 60;
  }
  return 120 * 60;
}

const RESULT_SORT_OPTIONS: { value: ResultSort; label: string }[] = [
  { value: "random", label: "Aléatoire" },
  { value: "by_year", label: "Par année" },
  { value: "by_course", label: "Par cours" },
];

/** Raw DB source values with the same French labels as the session player's
 * formatSource — deliberately NOT Externat/Résidanat: the questions table has no
 * sitting taxonomy, and relabeling provenance as sittings would invent a mapping. */
const SOURCE_OPTIONS: { value: "" | QuestionSource; label: string }[] = [
  { value: "", label: "Toutes sources" },
  { value: "official_exam", label: "Examen officiel" },
  { value: "hamame_authored", label: "Hamame" },
  { value: "ai_generated", label: "IA" },
];

/** Parses a sitting-year input; undefined unless a plausible 4-digit year. */
function parseSittingYear(value: string): number | undefined {
  if (!/^\d{4}$/.test(value.trim())) return undefined;
  const year = Number(value);
  return year >= 1000 && year <= 9999 ? year : undefined;
}

const selectClass =
  "min-h-touch-target w-full rounded-input border border-border bg-surface-2 px-4 text-body text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50";

interface SelectOption {
  value: string;
  label: string;
}

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
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-meta font-medium text-text-secondary">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled || loading}
        title={title}
        className={selectClass}
      >
        <option value="">{loading ? "Chargement…" : placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
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
        aria-label={`${label} — ${checked ? "activé" : "désactivé"}`}
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
  const timeTouchedRef = useRef(false);

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
    if (mode !== "exam" || timeTouchedRef.current) return;
    const sittingPicked =
      parseSittingYear(examYear) !== undefined || sittingLabel.trim() !== "";
    if (!sittingPicked) return;
    if (liveTotal === undefined || liveTotal <= 0) return;
    setTimeLimitSeconds(presetForSeconds(liveTotal * EXAM_SECONDS_PER_QUESTION));
  }, [mode, examYear, sittingLabel, liveTotal]);
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
      ? `${selectedModule.name} · ${selectedUnits.length} unités`
      : (selectedUnits[0]?.name ??
        selectedModule?.name ??
        selectedYear?.label ??
        selectedFaculty?.name ??
        null);

  const config: SessionConfig = {
    mode,
    name: `${mode === "practice" ? "Entraînement" : "Examen"}${scopeName ? ` — ${scopeName}` : ""}`,
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
        <legend className="mb-2 text-meta font-medium text-text-secondary">Mode & affichage</legend>
        <div className="flex flex-col gap-2">
          <SwitchRow
            id="builder-exam-mode"
            label="Mode examen"
            description={
              mode === "exam"
                ? "Aucune correction pendant la session — score et corrigé à la fin, comme à l'examen."
                : "Chaque réponse est corrigée immédiatement avec l'explication."
            }
            checked={mode === "exam"}
            onChange={(checked) => setMode(checked ? "exam" : "practice")}
            disabled={isStarting}
          />
          <SwitchRow
            id="builder-show-stats"
            label="Statistiques détaillées"
            description="Affiche la précision et la répartition des réponses sur l'écran de résultats (score seul si désactivé)."
            checked={showStats}
            onChange={setShowStats}
            disabled={isStarting}
          />
        </div>
        {/* 3d trust copy: exam-mode withholding, stated exactly as implemented
            (Phase 2 rule) — renders in exam mode only, next to the switch. */}
        {mode === "exam" ? (
          <p className="mt-2 rounded-panel border border-border bg-surface-2 px-3 py-2.5 text-meta text-text-secondary">
            En mode examen, la correction, les explications et les statistiques de réponses sont retenues
            jusqu&apos;à la remise de la session — seul le score final est affiché.
          </p>
        ) : null}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-meta font-medium text-text-secondary">Domaine (optionnel)</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <LabeledSelect
            id="builder-faculty"
            label="Faculté"
            value={facultyId}
            onChange={handleFacultyChange}
            options={facultyList.map((f) => ({ value: f.id, label: f.name }))}
            placeholder="Toutes les facultés"
            loading={faculties.isLoading}
          />
          <LabeledSelect
            id="builder-year"
            label="Année"
            value={yearId}
            onChange={handleYearChange}
            options={yearList.map((y) => ({ value: y.id, label: y.label }))}
            placeholder="Toutes les années"
            disabled={!facultyId}
            loading={years.isLoading}
            title={!facultyId ? "Sélectionnez d'abord une faculté" : undefined}
          />
          <LabeledSelect
            id="builder-module"
            label="Module"
            value={moduleId}
            onChange={handleModuleChange}
            options={moduleOptions}
            placeholder="Tous les modules"
            disabled={!yearId}
            loading={modules.isLoading}
            title={!yearId ? "Sélectionnez d'abord une année" : undefined}
          />
        </div>
        {/* Course-level multi-select (units carry the questions): checkbox list with
            live count badges. Nothing ticked = whole module scope. */}
        <div className="mt-3">
          <span id="builder-units-label" className="mb-2 block text-meta font-medium text-text-secondary">
            Unités (cours){unitIds.length > 0 ? ` — ${unitIds.length} sélectionnée${unitIds.length > 1 ? "s" : ""}` : ""}
          </span>
          {!moduleId ? (
            <p className="rounded-panel border border-border bg-surface-2 px-3 py-2.5 text-meta text-text-tertiary">
              Sélectionnez un module pour choisir des unités.
            </p>
          ) : units.isLoading && unitList.length === 0 ? (
            <p className="rounded-panel border border-border bg-surface-2 px-3 py-2.5 text-meta text-text-tertiary">
              Chargement des unités…
            </p>
          ) : unitList.length === 0 ? (
            <p className="rounded-panel border border-border bg-surface-2 px-3 py-2.5 text-meta text-text-tertiary">
              Aucune unité dans ce module.
            </p>
          ) : (
            <>
              <div className="mb-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setUnitIds(unitList.map((u) => u.id))}
                  disabled={isStarting}
                  className="min-h-touch-target rounded-control border border-border px-3 text-meta font-medium text-text-secondary transition hover:bg-surface-3 disabled:opacity-50"
                >
                  Toutes
                </button>
                <button
                  type="button"
                  onClick={() => setUnitIds([])}
                  disabled={isStarting}
                  className="min-h-touch-target rounded-control border border-border px-3 text-meta font-medium text-text-secondary transition hover:bg-surface-3 disabled:opacity-50"
                >
                  Aucune (= tout le module)
                </button>
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
                          aria-label={`${badge} questions`}
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
          <p className="mt-2 text-meta text-danger">
            Impossible de charger les facultés.{" "}
            <button
              type="button"
              onClick={faculties.refetch}
              className="font-medium text-accent-soft underline underline-offset-2 hover:text-accent-soft/80"
            >
              Réessayer
            </button>
          </p>
        ) : null}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-meta font-medium text-text-secondary">Types de questions</legend>
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
                {option.label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-meta font-medium text-text-secondary">Source</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {SOURCE_OPTIONS.map((option) => {
            const checked = source === option.value;
            return (
              <label
                key={option.label}
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
                {option.label}
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* Past-exam picker + period filter. Options come from the counts response's
          sittings array (distinct values actually in scope) — never hardcoded. */}
      <fieldset>
        <legend className="mb-2 text-meta font-medium text-text-secondary">Examen passé</legend>
        {sittings.length === 0 && !scopeCounts.isLoading ? (
          <p className="rounded-panel border border-border bg-surface-2 px-3 py-2.5 text-meta text-text-tertiary">
            Aucun examen tagué pour le moment — les questions ne sont pas encore rattachées à une
            session d&apos;examen.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="builder-exam-year" className="mb-2 block text-meta font-medium text-text-secondary">
                Année de session
              </label>
              <select
                id="builder-exam-year"
                value={examYear}
                onChange={(event) => {
                  setExamYear(event.target.value);
                  setSittingLabel("");
                }}
                disabled={isStarting || sittings.length === 0}
                title={sittings.length === 0 ? "Aucun examen tagué pour le moment" : undefined}
                className={selectClass}
              >
                <option value="">Toutes les années</option>
                {sittingYears.map((year) => (
                  <option key={year} value={String(year)}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="builder-sitting-label" className="mb-2 block text-meta font-medium text-text-secondary">
                Session
              </label>
              <select
                id="builder-sitting-label"
                value={sittingLabel}
                onChange={(event) => setSittingLabel(event.target.value)}
                disabled={isStarting || sittings.length === 0}
                title={sittings.length === 0 ? "Aucun examen tagué pour le moment" : undefined}
                className={selectClass}
              >
                <option value="">Toutes les sessions</option>
                {sittingLabels.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="builder-year-from" className="mb-2 block text-meta font-medium text-text-secondary">
              Période — de
            </label>
            <input
              id="builder-year-from"
              inputMode="numeric"
              placeholder="ex. 2020"
              value={examYearFrom}
              onChange={(event) => setExamYearFrom(event.target.value)}
              disabled={isStarting}
              className={selectClass}
            />
          </div>
          <div>
            <label htmlFor="builder-year-to" className="mb-2 block text-meta font-medium text-text-secondary">
              Période — à
            </label>
            <input
              id="builder-year-to"
              inputMode="numeric"
              placeholder="ex. 2025"
              value={examYearTo}
              onChange={(event) => setExamYearTo(event.target.value)}
              disabled={isStarting}
              className={selectClass}
            />
          </div>
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="builder-question-count" className="mb-2 block text-meta font-medium text-text-secondary">
            Nombre de questions
          </label>
          <select
            id="builder-question-count"
            value={size}
            onChange={(event) => setSize(Number(event.target.value))}
            disabled={isStarting}
            className={selectClass}
          >
            {questionCountOptions.map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </div>

        {/* FR-15 — result ordering (by year / by course / randomized). */}
        <div>
          <label htmlFor="builder-result-sort" className="mb-2 block text-meta font-medium text-text-secondary">
            Ordre des résultats
          </label>
          <select
            id="builder-result-sort"
            value={resultSort}
            onChange={(event) => setResultSort(event.target.value as ResultSort)}
            disabled={isStarting}
            className={selectClass}
          >
            {RESULT_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {mode === "exam" ? (
          <div>
            <label htmlFor="builder-time-limit" className="mb-2 block text-meta font-medium text-text-secondary">
              Limite de temps
            </label>
            <select
              id="builder-time-limit"
              value={timeLimitSeconds === null ? "" : String(timeLimitSeconds / 60)}
              onChange={(event) => {
                timeTouchedRef.current = true;
                setTimeLimitSeconds(event.target.value === "" ? null : Number(event.target.value) * 60);
              }}
              disabled={isStarting}
              className={selectClass}
            >
              {TIME_LIMIT_OPTIONS_MINUTES.map((option) => (
                <option key={option.value ?? "none"} value={option.value ?? ""}>
                  {option.label}
                </option>
              ))}
            </select>
            {!timeTouchedRef.current &&
            (parseSittingYear(examYear) !== undefined || sittingLabel.trim() !== "") &&
            liveTotal !== undefined &&
            liveTotal > 0 ? (
              <p className="mt-1 text-caption text-text-tertiary">
                Proposé d&apos;après {liveTotal} question{liveTotal === 1 ? "" : "s"} × {EXAM_SECONDS_PER_QUESTION}{" "}
                s — modifiable.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {startError ? (
        <p role="alert" className="rounded-control border border-danger bg-surface-1 px-3 py-2 text-meta text-danger">
          {startError}
        </p>
      ) : null}

      {/* Live counter: exact match count for the current filters, before starting. */}
      <div
        aria-live="polite"
        className="flex min-h-touch-target items-center justify-between gap-3 rounded-panel border border-border bg-surface-2 px-3 py-2.5"
      >
        {countsError ? (
          <>
            <span className="text-meta text-danger">Comptage indisponible.</span>
            <button
              type="button"
              onClick={refetchCounts}
              className="shrink-0 font-medium text-accent-soft underline underline-offset-2 hover:text-accent-soft/80 text-meta"
            >
              Réessayer
            </button>
          </>
        ) : liveTotal === undefined ? (
          <span className="text-meta text-text-tertiary">Comptage des questions…</span>
        ) : (
          <>
            <span className="text-body font-semibold text-text-primary">
              {liveTotal} question{liveTotal === 1 ? "" : "s"} disponible{liveTotal === 1 ? "" : "s"}
            </span>
            {emptyResult ? (
              <span className="text-meta text-text-tertiary">Élargissez les filtres pour lancer.</span>
            ) : null}
          </>
        )}
      </div>

      <button
        type="submit"
        disabled={isStarting || questionTypes.length === 0 || size <= 0 || emptyResult}
        title={
          emptyResult
            ? "Aucune question ne correspond aux filtres — élargissez-les pour lancer"
            : questionTypes.length === 0
              ? "Sélectionnez au moins un type de question"
              : undefined
        }
        className="inline-flex min-h-touch-target w-full items-center justify-center gap-2 rounded-control bg-accent-qcm px-5 text-body font-semibold text-on-accent shadow-glow-qcm transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50 disabled:pointer-events-none"
      >
        {isStarting ? "Création de la session…" : mode === "practice" ? "Commencer l'entraînement" : "Commencer l'examen"}
      </button>
    </form>
  );
}
