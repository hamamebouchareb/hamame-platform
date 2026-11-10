"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { useLanguage } from "@/context/LanguageContext";
import type { I18nKey } from "@/lib/i18n";
import { useApiResource } from "@/lib/useApiResource";
import { Button } from "@/components/Button";
import { ErrorState } from "@/components/ErrorState";
import { Input, Select } from "@/components/Field";
import { Icon } from "@/components/Icon";
import type { Faculty, QuestionCountsResponse, QuestionType } from "@/lib/types";

export type ResultSort = "by_year" | "by_course" | "random";

/** Stage every Résidanat question lives under (src/lib/residanat-taxonomy.ts). */
export const RESIDANAT_YEAR_LABEL = "Résidanat";

export interface SessionConfig {
  mode: "practice" | "exam";
  name: string;
  yearLabel: string;
  facultyId?: string;
  /** Sitting years; empty = every year. */
  examYears: number[];
  /** Épreuves; empty = the whole paper. */
  periods: string[];
  /** Canonical specialties; empty = every specialty. */
  categories: string[];
  /** Topics inside the picked specialties; empty = every topic. */
  subcategories: string[];
  questionTypes: QuestionType[];
  size: number;
  timeLimitSeconds?: number | null;
  resultSort: ResultSort;
  showStats: boolean;
}

/** "Repeat my last quiz" hydration (the session echo carries settings, not scope). */
export interface SessionBuilderPrefill {
  mode: "practice" | "exam";
  size: number;
  timeLimitSeconds?: number | null;
  resultSort: ResultSort;
  showStats: boolean;
  questionTypes: QuestionType[];
}

export interface SessionBuilderProps {
  initialMode?: "practice" | "exam";
  initialFacultyId?: string | null;
  prefill?: SessionBuilderPrefill | null;
  onStart: (config: SessionConfig) => void;
  isStarting?: boolean;
  startError?: string | null;
  className?: string;
}

const MAX_SIZE = 5000;
const SIZE_PRESETS = [10, 20, 40, 60, 100, 200, 500, 1000];
const TIME_LIMIT_VALUES_MINUTES: (number | null)[] = [null, 10, 15, 30, 45, 60, 90, 120];

const TYPE_OPTIONS: { value: QuestionType; labelKey: I18nKey }[] = [
  { value: "QCS", labelKey: "rb.typeQcs" },
  { value: "QCM", labelKey: "rb.typeQcm" },
  { value: "QROC", labelKey: "rb.typeQroc" },
];

const ORDER_OPTIONS: { value: ResultSort; labelKey: I18nKey }[] = [
  { value: "random", labelKey: "rb.orderRandom" },
  { value: "by_year", labelKey: "rb.orderYear" },
  { value: "by_course", labelKey: "rb.orderCourse" },
];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
}

/** "Faculté de Médecine d'Alger" → "Alger" for chips and quiz names. */
function facultyShortName(name: string): string {
  return name.replace(/^Facult[ée] de M[ée]decine\s*(—\s*|d'|de\s+)/i, "").trim() || name;
}

function yearsLabel(years: number[]): string {
  const sorted = [...years].sort((a, b) => a - b);
  if (sorted.length === 0) return "";
  if (sorted.length <= 5) return sorted.join(", ");
  return `${sorted[0]}–${sorted[sorted.length - 1]}`;
}

function Chip({
  selected,
  onClick,
  disabled,
  count,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  count?: number;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "inline-flex min-h-touch-target items-center gap-2 rounded-pill border px-3 text-body transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50",
        selected
          ? "border-accent-qcm bg-accent-qcm text-white"
          : "border-border bg-surface-2 text-text-primary hover:bg-surface-3"
      )}
    >
      <span className="truncate">{children}</span>
      {count !== undefined ? (
        <span
          className={cx(
            "shrink-0 rounded-pill px-1.5 text-meta font-semibold",
            selected ? "bg-white/20 text-white" : "bg-surface-3 text-text-secondary"
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function Step({
  index,
  title,
  done,
  hint,
  aside,
  children,
}: {
  index: number;
  title: string;
  done: boolean;
  hint?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-card border border-border bg-surface-1 p-card-padding shadow-card">
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-meta font-semibold uppercase tracking-wide text-text-secondary">
          <span
            aria-hidden
            className={cx(
              "inline-flex h-6 w-6 items-center justify-center rounded-control text-meta font-bold",
              done ? "bg-accent-qcm text-white" : "bg-surface-3 text-text-secondary"
            )}
          >
            {done ? "✓" : index}
          </span>
          {title}
        </h2>
        {aside}
      </header>
      {children}
      {hint ? <p className="mt-2 text-meta text-text-tertiary">{hint}</p> : null}
    </section>
  );
}

/**
 * Résidanat session builder, MBset "by exam paper" flow on Hamame's own bank:
 * faculty → sitting years → épreuve → (optional) specialties → topics, then
 * the settings panel. Every chip and count comes from GET /questions/counts,
 * where each facet excludes its own selection so picked chips stay visible.
 */
export function SessionBuilder({
  initialMode = "practice",
  initialFacultyId = null,
  prefill = null,
  onStart,
  isStarting = false,
  startError,
  className,
}: SessionBuilderProps) {
  const { t } = useLanguage();
  const [mode, setMode] = useState<"practice" | "exam">(initialMode);
  const [facultyId, setFacultyId] = useState("");
  const [examYears, setExamYears] = useState<number[]>([]);
  const [periods, setPeriods] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [subcategories, setSubcategories] = useState<string[]>([]);
  const [specialtySearch, setSpecialtySearch] = useState("");
  const [topicSearch, setTopicSearch] = useState("");
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>(["QCS", "QCM"]);
  const [size, setSize] = useState(40);
  const [timeLimitSeconds, setTimeLimitSeconds] = useState<number | null>(null);
  const [resultSort, setResultSort] = useState<ResultSort>("random");
  const [showStats, setShowStats] = useState(true);
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);

  const faculties = useApiResource<{ faculties: Faculty[] }>("/faculties");

  const countsQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.append("yearLabel", RESIDANAT_YEAR_LABEL);
    if (facultyId) params.append("facultyId", facultyId);
    if (examYears.length > 0) params.append("examYears", examYears.join(","));
    for (const period of periods) params.append("periods", period);
    for (const category of categories) params.append("categories", category);
    for (const subcategory of subcategories) params.append("subcategories", subcategory);
    for (const type of questionTypes) params.append("types", type);
    return params.toString();
  }, [facultyId, examYears, periods, categories, subcategories, questionTypes]);

  const counts = useApiResource<QuestionCountsResponse>(`/questions/counts?${countsQuery}`);
  const data = counts.data;

  const facultyById = useMemo(
    () => new Map((faculties.data?.faculties ?? []).map((faculty) => [faculty.id, faculty])),
    [faculties.data]
  );
  const facultyChips = useMemo(
    () =>
      (data?.byFaculty ?? [])
        .filter((entry) => facultyById.has(entry.facultyId))
        .map((entry) => ({
          id: entry.facultyId,
          label: facultyShortName(facultyById.get(entry.facultyId)!.name),
          count: entry.count,
        })),
    [data, facultyById]
  );
  const yearChips = useMemo(() => data?.byExamYear ?? [], [data]);
  const availableYears = useMemo(() => yearChips.map((entry) => entry.examYear), [yearChips]);
  const periodChips = useMemo(() => data?.byPeriod ?? [], [data]);
  const specialtyChips = useMemo(() => {
    const needle = specialtySearch.trim().toLowerCase();
    return (data?.byCategory ?? []).filter(
      (entry) => categories.includes(entry.category) || entry.category.toLowerCase().includes(needle)
    );
  }, [data, specialtySearch, categories]);
  const topicChips = useMemo(() => {
    const needle = topicSearch.trim().toLowerCase();
    return (data?.bySubcategory ?? []).filter(
      (entry) => subcategories.includes(entry.subcategory) || entry.subcategory.toLowerCase().includes(needle)
    );
  }, [data, topicSearch, subcategories]);

  const total = data?.total;
  const effectiveSize = Math.max(1, Math.min(size, MAX_SIZE, total ?? MAX_SIZE));

  // Preselect the student's own faculty once it is known to carry questions.
  const facultyPreselected = useRef(false);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (facultyPreselected.current || !initialFacultyId) return;
    if (facultyChips.some((chip) => chip.id === initialFacultyId)) {
      facultyPreselected.current = true;
      setFacultyId(initialFacultyId);
    }
  }, [initialFacultyId, facultyChips]);

  const prefillApplied = useRef(false);
  useEffect(() => {
    if (!prefill || prefillApplied.current) return;
    prefillApplied.current = true;
    setMode(prefill.mode);
    setSize(Math.min(Math.max(prefill.size, 1), MAX_SIZE));
    setResultSort(prefill.resultSort);
    setShowStats(prefill.showStats);
    const types = prefill.questionTypes.filter((type) => TYPE_OPTIONS.some((option) => option.value === type));
    if (types.length > 0) setQuestionTypes(types);
    if (prefill.timeLimitSeconds) setTimeLimitSeconds(prefill.timeLimitSeconds);
  }, [prefill]);

  // Topics belong to specialties: dropping a specialty drops its topics.
  useEffect(() => {
    if (categories.length === 0 && subcategories.length > 0) setSubcategories([]);
  }, [categories, subcategories.length]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const facultyLabel = facultyId ? facultyShortName(facultyById.get(facultyId)?.name ?? "") : "";
  const autoName = [RESIDANAT_YEAR_LABEL, facultyLabel, yearsLabel(examYears)].filter(Boolean).join(" ");
  const sessionName = nameTouched && name.trim() ? name.trim() : autoName;

  function pickLastYears(n: number | null) {
    setExamYears(n === null ? [] : availableYears.slice(0, n));
  }

  const yearPreset =
    examYears.length === 0
      ? "all"
      : [3, 5].find(
          (n) => examYears.length === n && availableYears.slice(0, n).every((year) => examYears.includes(year))
        ) ?? null;

  const config: SessionConfig = {
    mode,
    name: sessionName,
    yearLabel: RESIDANAT_YEAR_LABEL,
    ...(facultyId ? { facultyId } : {}),
    examYears,
    periods,
    categories,
    subcategories,
    questionTypes,
    size: effectiveSize,
    resultSort,
    showStats,
    ...(mode === "exam" ? { timeLimitSeconds } : {}),
  };

  const canStart = !isStarting && questionTypes.length > 0 && (total ?? 0) > 0;

  return (
    <form
      className={cx("flex flex-col gap-4", className)}
      onSubmit={(event) => {
        event.preventDefault();
        if (canStart) onStart(config);
      }}
    >
      <Input
        id="builder-name"
        label={t("rb.quizName")}
        value={nameTouched ? name : autoName}
        onChange={(event) => {
          setNameTouched(true);
          setName(event.target.value);
        }}
        disabled={isStarting}
      />

      <Step index={1} title={t("rb.stepFaculty")} done={facultyId !== ""}>
        <div className="flex flex-wrap gap-2">
          <Chip selected={facultyId === ""} onClick={() => setFacultyId("")} disabled={isStarting}>
            {t("rb.allFaculties")}
          </Chip>
          {facultyChips.map((chip) => (
            <Chip
              key={chip.id}
              selected={facultyId === chip.id}
              onClick={() => setFacultyId(facultyId === chip.id ? "" : chip.id)}
              count={chip.count}
              disabled={isStarting}
            >
              {chip.label}
            </Chip>
          ))}
        </div>
        {faculties.error ? (
          <ErrorState className="mt-2" message={t("builder.facultiesError")} onRetry={faculties.refetch} />
        ) : null}
      </Step>

      <Step
        index={2}
        title={t("rb.stepYears")}
        done={examYears.length > 0}
        hint={examYears.length > 0 ? yearsLabel(examYears) : t("rb.noYear")}
      >
        <div className="mb-3 flex flex-wrap gap-2">
          <Chip selected={yearPreset === 3} onClick={() => pickLastYears(3)} disabled={isStarting}>
            {t("rb.last3")}
          </Chip>
          <Chip selected={yearPreset === 5} onClick={() => pickLastYears(5)} disabled={isStarting}>
            {t("rb.last5")}
          </Chip>
          <Chip selected={yearPreset === "all"} onClick={() => pickLastYears(null)} disabled={isStarting}>
            {t("rb.allYears")}
          </Chip>
        </div>
        <div className="flex flex-wrap gap-2">
          {yearChips.map((entry) => (
            <Chip
              key={entry.examYear}
              selected={examYears.includes(entry.examYear)}
              onClick={() => setExamYears(toggle(examYears, entry.examYear))}
              count={entry.count}
              disabled={isStarting}
            >
              {entry.examYear}
            </Chip>
          ))}
        </div>
      </Step>

      <Step index={3} title={t("rb.stepPaper")} done={periods.length > 0}>
        <div className="flex flex-wrap gap-2">
          <Chip selected={periods.length === 0} onClick={() => setPeriods([])} disabled={isStarting}>
            {t("rb.allPaper")}
          </Chip>
          {periodChips.map((entry) => (
            <Chip
              key={entry.period}
              selected={periods.includes(entry.period)}
              onClick={() => setPeriods(toggle(periods, entry.period))}
              count={entry.count}
              disabled={isStarting}
            >
              {entry.period}
            </Chip>
          ))}
        </div>
      </Step>

      <Step
        index={4}
        title={t("rb.stepSpecialties")}
        done={categories.length > 0}
        hint={t("rb.specialtiesHint")}
        aside={
          categories.length > 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setCategories([])} disabled={isStarting}>
              {t("rb.clear")}
            </Button>
          ) : null
        }
      >
        <Input
          id="builder-specialty-search"
          label={t("rb.searchSpecialty")}
          value={specialtySearch}
          onChange={(event) => setSpecialtySearch(event.target.value)}
          disabled={isStarting}
        />
        <div className="mt-3 flex max-h-80 flex-wrap gap-2 overflow-y-auto">
          {specialtyChips.map((entry) => (
            <Chip
              key={entry.category}
              selected={categories.includes(entry.category)}
              onClick={() => setCategories(toggle(categories, entry.category))}
              count={entry.count}
              disabled={isStarting}
            >
              {entry.category}
            </Chip>
          ))}
        </div>
      </Step>

      {categories.length > 0 ? (
        <Step
          index={5}
          title={t("rb.stepTopics")}
          done={subcategories.length > 0}
          hint={t("rb.topicsHint")}
          aside={
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSubcategories(topicChips.map((entry) => entry.subcategory))}
                disabled={isStarting || topicChips.length === 0}
              >
                {t("rb.selectAll")}
              </Button>
              {subcategories.length > 0 ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setSubcategories([])} disabled={isStarting}>
                  {t("rb.clear")}
                </Button>
              ) : null}
            </div>
          }
        >
          <Input
            id="builder-topic-search"
            label={t("rb.searchTopic")}
            value={topicSearch}
            onChange={(event) => setTopicSearch(event.target.value)}
            disabled={isStarting}
          />
          <div className="mt-3 flex max-h-80 flex-wrap gap-2 overflow-y-auto">
            {topicChips.map((entry) => (
              <Chip
                key={entry.subcategory}
                selected={subcategories.includes(entry.subcategory)}
                onClick={() => setSubcategories(toggle(subcategories, entry.subcategory))}
                count={entry.count}
                disabled={isStarting}
              >
                {entry.subcategory}
              </Chip>
            ))}
          </div>
        </Step>
      ) : null}

      <section className="flex flex-col gap-4 rounded-card border border-border bg-surface-1 p-card-padding shadow-card">
        <h2 className="text-meta font-semibold uppercase tracking-wide text-text-secondary">{t("rb.settings")}</h2>

        <fieldset>
          <legend className="mb-2 text-meta font-medium text-text-secondary">{t("rb.mode")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["practice", "exam"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
                disabled={isStarting}
                className={cx(
                  "flex min-h-touch-target flex-col items-start gap-1 rounded-control border px-3 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50",
                  mode === value
                    ? "border-accent-qcm bg-accent-qcm/15 text-text-primary"
                    : "border-border bg-surface-2 text-text-secondary hover:bg-surface-3"
                )}
              >
                <span className="inline-flex items-center gap-2 text-body font-semibold">
                  <Icon name={value === "practice" ? "qcm" : "simulations"} size={18} />
                  {t(value === "practice" ? "rb.practice" : "rb.exam")}
                </span>
                <span className="text-caption">{t(value === "practice" ? "rb.practiceDesc" : "rb.examDesc")}</span>
              </button>
            ))}
          </div>
          {mode === "exam" ? (
            <p className="mt-2 rounded-panel border border-border bg-surface-2 px-3 py-2.5 text-meta text-text-secondary">
              {t("builder.examTrust")}
            </p>
          ) : null}
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-meta font-medium text-text-secondary">{t("rb.count")}</legend>
          <div className="flex flex-wrap items-center gap-2">
            {SIZE_PRESETS.map((preset) => (
              <Chip
                key={preset}
                selected={effectiveSize === preset}
                onClick={() => setSize(preset)}
                disabled={isStarting || (total !== undefined && preset > total && preset !== SIZE_PRESETS[0])}
              >
                {preset}
              </Chip>
            ))}
            {total !== undefined && total > 0 ? (
              <Chip
                selected={effectiveSize === Math.min(total, MAX_SIZE)}
                onClick={() => setSize(Math.min(total, MAX_SIZE))}
                disabled={isStarting}
              >
                {t("rb.countAll", { count: Math.min(total, MAX_SIZE) })}
              </Chip>
            ) : null}
            <Input
              id="builder-size"
              label={t("rb.countCustom")}
              inputMode="numeric"
              value={String(effectiveSize)}
              onChange={(event) => {
                const next = Number(event.target.value.replace(/\D/g, ""));
                if (Number.isFinite(next) && next > 0) setSize(next);
              }}
              disabled={isStarting}
              fieldClassName="w-28"
            />
          </div>
          {total !== undefined ? (
            <p className="mt-1 text-meta text-text-tertiary">{t("rb.countHint", { count: total })}</p>
          ) : null}
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-meta font-medium text-text-secondary">{t("rb.types")}</legend>
          <div className="flex flex-wrap gap-2">
            {TYPE_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                selected={questionTypes.includes(option.value)}
                onClick={() => setQuestionTypes(toggle(questionTypes, option.value))}
                disabled={isStarting}
              >
                {t(option.labelKey)}
              </Chip>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            id="builder-order"
            label={t("rb.order")}
            value={resultSort}
            onChange={(event) => setResultSort(event.target.value as ResultSort)}
            disabled={isStarting}
          >
            {ORDER_OPTIONS.map((option) => (
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
              onChange={(event) =>
                setTimeLimitSeconds(event.target.value === "" ? null : Number(event.target.value) * 60)
              }
              disabled={isStarting}
            >
              {TIME_LIMIT_VALUES_MINUTES.map((value) => (
                <option key={value ?? "none"} value={value ?? ""}>
                  {value === null ? t("builder.noLimit") : t("builder.minutes", { n: value })}
                </option>
              ))}
            </Select>
          ) : null}
        </div>

        <label className="flex items-start justify-between gap-4 rounded-panel border border-border bg-surface-2 px-3 py-2.5">
          <span className="min-w-0">
            <span className="block text-body text-text-primary">{t("builder.showStats")}</span>
            <span className="mt-0.5 block text-meta text-text-tertiary">{t("builder.showStatsDesc")}</span>
          </span>
          <input
            type="checkbox"
            checked={showStats}
            onChange={(event) => setShowStats(event.target.checked)}
            disabled={isStarting}
            className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent-qcm)]"
          />
        </label>
      </section>

      {startError ? <ErrorState message={startError} /> : null}

      <div
        aria-live="polite"
        className="flex min-h-touch-target items-center justify-between gap-3 rounded-panel border border-border bg-surface-2 px-3 py-2.5"
      >
        {counts.error ? (
          <>
            <span className="text-meta text-danger">{t("builder.countError")}</span>
            <button
              type="button"
              onClick={counts.refetch}
              className="shrink-0 text-meta font-medium text-accent-soft underline underline-offset-2"
            >
              {t("common.retry")}
            </button>
          </>
        ) : total === undefined ? (
          <span className="text-meta text-text-tertiary">{t("builder.counting")}</span>
        ) : (
          <span className="min-w-0 truncate text-body font-semibold text-text-primary">
            {t("rb.summary")} · {sessionName}
          </span>
        )}
      </div>

      <Button type="submit" width="full" accent="qcm" disabled={!canStart}>
        {isStarting
          ? t("builder.starting")
          : total === 0
            ? t("rb.startZero")
            : t("rb.start", { count: effectiveSize })}
      </Button>
    </form>
  );
}
