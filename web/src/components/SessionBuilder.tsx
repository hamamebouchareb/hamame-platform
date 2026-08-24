"use client";

import { useEffect, useMemo, useState } from "react";
import { cx } from "@/lib/cx";
import { useApiResource } from "@/lib/useApiResource";
import { PrimaryTabs } from "@/components/PrimaryTabs";
import type { CurriculumModule, Faculty, QuestionType, Unit, Year } from "@/lib/types";

export interface SessionConfig {
  mode: "practice" | "exam";
  /** Auto-generated display name sent as the session's `name`. */
  name: string;
  facultyId?: string;
  yearId?: string;
  moduleId?: string;
  unitId?: string;
  questionTypes: QuestionType[];
  size: number;
  /** Present only when exam mode with an explicit limit. */
  timeLimitSeconds?: number | null;
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
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
  disabled?: boolean;
  loading?: boolean;
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

/** Session configuration form: correction mode, curriculum cascade, question types,
 * count, and an exam-only time limit. Emits a ready-to-post SessionConfig. */
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
  const [unitId, setUnitId] = useState("");
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>(["QCM", "QCS"]);
  const [size, setSize] = useState(questionCountOptions.includes(20) ? 20 : questionCountOptions[0]);
  const [timeLimitSeconds, setTimeLimitSeconds] = useState<number | null>(null);

  const faculties = useApiResource<{ faculties: Faculty[] }>("/faculties");
  const years = useApiResource<{ years: Year[] }>(facultyId ? `/faculties/${facultyId}/years` : null);
  const modules = useApiResource<{ modules: CurriculumModule[] }>(yearId ? `/years/${yearId}/modules` : null);
  const units = useApiResource<{ units: Unit[] }>(moduleId ? `/modules/${moduleId}/units` : null);

  const facultyList = useMemo(() => faculties.data?.faculties ?? [], [faculties.data]);
  const yearList = useMemo(() => years.data?.years ?? [], [years.data]);
  const moduleList = useMemo(() => modules.data?.modules ?? [], [modules.data]);
  const unitList = useMemo(() => units.data?.units ?? [], [units.data]);

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

  function handleFacultyChange(value: string) {
    setFacultyId(value);
    setYearId("");
    setModuleId("");
    setUnitId("");
  }

  function handleYearChange(value: string) {
    setYearId(value);
    setModuleId("");
    setUnitId("");
  }

  function handleModuleChange(value: string) {
    setModuleId(value);
    setUnitId("");
  }

  function toggleQuestionType(type: QuestionType) {
    setQuestionTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  }

  const selectedFaculty = facultyList.find((f) => f.id === facultyId);
  const selectedYear = yearList.find((y) => y.id === yearId);
  const selectedModule = moduleList.find((m) => m.id === moduleId);
  const selectedUnit = unitList.find((u) => u.id === unitId);
  const scopeName = selectedUnit?.name ?? selectedModule?.name ?? selectedYear?.label ?? selectedFaculty?.name ?? null;

  const config: SessionConfig = {
    mode,
    name: `${mode === "practice" ? "Entraînement" : "Examen"}${scopeName ? ` — ${scopeName}` : ""}`,
    ...(facultyId ? { facultyId } : {}),
    ...(yearId ? { yearId } : {}),
    ...(moduleId ? { moduleId } : {}),
    ...(unitId ? { unitId } : {}),
    questionTypes,
    size,
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
      <div>
        <span className="mb-2 block text-meta font-medium text-text-secondary">Correction</span>
        <PrimaryTabs
          tabs={[
            { id: "practice", label: "Immédiate (entraînement)" },
            { id: "exam", label: "En fin de session (examen)" },
          ]}
          activeId={mode}
          onChange={(id) => setMode(id as "practice" | "exam")}
          ariaLabel="Mode de correction"
        />
        <p className="mt-2 text-meta text-text-tertiary">
          {mode === "practice"
            ? "Chaque réponse est corrigée immédiatement avec l'explication."
            : "Aucune correction pendant la session — score et corrigé à la fin, comme à l'examen."}
        </p>
      </div>

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
          />
          <LabeledSelect
            id="builder-module"
            label="Module"
            value={moduleId}
            onChange={handleModuleChange}
            options={moduleList.map((m) => ({ value: m.id, label: m.name }))}
            placeholder="Tous les modules"
            disabled={!yearId}
            loading={modules.isLoading}
          />
          <LabeledSelect
            id="builder-unit"
            label="Unité"
            value={unitId}
            onChange={(value) => setUnitId(value)}
            options={unitList.map((u) => ({ value: u.id, label: u.name }))}
            placeholder="Toutes les unités"
            disabled={!moduleId}
            loading={units.isLoading}
          />
        </div>
        {faculties.error ? (
          <p className="mt-2 text-meta text-danger">
            Impossible de charger les facultés.{" "}
            <button
              type="button"
              onClick={faculties.refetch}
              className="font-medium text-accent-primary underline underline-offset-2 hover:text-accent-primary/80"
            >
              Réessayer
            </button>
          </p>
        ) : null}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-meta font-medium text-text-secondary">Types de questions</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {QUESTION_TYPE_OPTIONS.map((option) => {
            const checked = questionTypes.includes(option.value);
            return (
              <label
                key={option.value}
                className={cx(
                  "flex min-h-touch-target cursor-pointer items-center gap-2 rounded-panel border bg-surface-2 px-3 text-body text-text-primary transition hover:bg-surface-3 has-[:checked]:border-accent-qcm has-[:checked]:bg-accent-qcm/10",
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

        {mode === "exam" ? (
          <div>
            <label htmlFor="builder-time-limit" className="mb-2 block text-meta font-medium text-text-secondary">
              Limite de temps
            </label>
            <select
              id="builder-time-limit"
              value={timeLimitSeconds === null ? "" : String(timeLimitSeconds / 60)}
              onChange={(event) =>
                setTimeLimitSeconds(event.target.value === "" ? null : Number(event.target.value) * 60)
              }
              disabled={isStarting}
              className={selectClass}
            >
              {TIME_LIMIT_OPTIONS_MINUTES.map((option) => (
                <option key={option.value ?? "none"} value={option.value ?? ""}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {startError ? (
        <p role="alert" className="rounded-control border border-danger bg-surface-1 px-3 py-2 text-meta text-danger">
          {startError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isStarting || questionTypes.length === 0 || size <= 0}
        className="inline-flex min-h-touch-target w-full items-center justify-center gap-2 rounded-control bg-accent-qcm px-5 text-body font-semibold text-background shadow-glow-qcm transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50 disabled:pointer-events-none"
      >
        {isStarting ? "Création de la session…" : mode === "practice" ? "Commencer l'entraînement" : "Commencer l'examen"}
      </button>
    </form>
  );
}
