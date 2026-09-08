"use client";

// FR-66 — Pomodoro-style study/focus timer presets. Purely client-side: no API calls,
// no persistence of the countdown itself. The selected preset (not the running timer)
// survives a page reload via localStorage, mirroring the codebase's existing
// client-preference pattern (hamame_active_session / hamame_auth keys).
//
// Deliberately NOT shown in exam mode — exam sessions have their own chronometer
// (FR-19); this is an optional productivity tool for practice sessions.

import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "@/lib/cx";

type PresetId = "pomodoro" | "52-17" | "90-20" | "custom";
type Phase = "idle" | "study" | "pause";

interface TimerPreset {
  id: PresetId;
  label: string;
  studyMinutes: number | null; // null = user-defined
  pauseMinutes: number | null;
}

const PRESETS: TimerPreset[] = [
  { id: "pomodoro", label: "Pomodoro", studyMinutes: 25, pauseMinutes: 5 },
  { id: "52-17", label: "Méthode 52/17", studyMinutes: 52, pauseMinutes: 17 },
  { id: "90-20", label: "Focus 90 minutes", studyMinutes: 90, pauseMinutes: 20 },
  { id: "custom", label: "Personnalisé", studyMinutes: null, pauseMinutes: null },
];

const CUSTOM_MIN = 5;
const CUSTOM_MAX = 180;

const STORAGE_KEY = "hamame_study_timer";

interface StoredSelection {
  presetId: PresetId;
  customStudyMin: number;
  customPauseMin: number;
}

function loadStoredSelection(): StoredSelection {
  const fallback: StoredSelection = { presetId: "pomodoro", customStudyMin: 30, customPauseMin: 10 };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<StoredSelection>;
    const presetId = PRESETS.some((p) => p.id === parsed.presetId) ? (parsed.presetId as PresetId) : fallback.presetId;
    const clamp = (value: unknown, dflt: number) =>
      typeof value === "number" && Number.isFinite(value)
        ? Math.min(CUSTOM_MAX, Math.max(CUSTOM_MIN, Math.round(value)))
        : dflt;
    return {
      presetId,
      customStudyMin: clamp(parsed.customStudyMin, fallback.customStudyMin),
      customPauseMin: clamp(parsed.customPauseMin, fallback.customPauseMin),
    };
  } catch {
    return fallback;
  }
}

function clampMinutes(value: number): number {
  if (!Number.isFinite(value)) return CUSTOM_MIN;
  return Math.min(CUSTOM_MAX, Math.max(CUSTOM_MIN, Math.round(value)));
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

export function StudyTimer() {
  const [open, setOpen] = useState(false);
  // Selection state hydrates from localStorage after mount (SSR-safe, mirrors the
  // dashboard's guarded localStorage reads).
  const [presetId, setPresetId] = useState<PresetId>("pomodoro");
  const [customStudyMin, setCustomStudyMin] = useState(30);
  const [customPauseMin, setCustomPauseMin] = useState(10);
  const [hydrated, setHydrated] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  // Deadline timestamp (not a ticking counter) so timekeeping stays correct even if
  // the browser throttles background tabs.
  const [endsAtMs, setEndsAtMs] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [frozenRemainingMs, setFrozenRemainingMs] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const intervalRef = useRef<number | null>(null);

  // Selection state hydrates from localStorage after mount (SSR-safe). Sync-from-storage
  // on mount is the same external-system sync the dashboard/SessionBuilder use; the
  // scoped lint disable matches their existing convention.
  /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration from an
    external store (localStorage); cannot run during SSR, hence not a lazy initializer */
  useEffect(() => {
    const stored = loadStoredSelection();
    setPresetId(stored.presetId);
    setCustomStudyMin(stored.customStudyMin);
    setCustomPauseMin(stored.customPauseMin);
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Persist the SELECTION only — the countdown intentionally does not survive a reload.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ presetId, customStudyMin, customPauseMin } satisfies StoredSelection)
      );
    } catch {
      // localStorage unavailable — the selection simply won't persist.
    }
  }, [hydrated, presetId, customStudyMin, customPauseMin]);

  const activePreset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
  // Clamp at DERIVATION time, not just on input blur — a user can click "Démarrer"
  // without ever blurring the input, and blur events race click handlers. The clamped
  // value is therefore the only one that ever reaches the countdown.
  const studyMinutes = clampMinutes(activePreset.studyMinutes ?? customStudyMin);
  const pauseMinutes = clampMinutes(activePreset.pauseMinutes ?? customPauseMin);

  const stopTicking = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => stopTicking, [stopTicking]);

  useEffect(() => {
    if (phase === "idle") {
      stopTicking();
      return;
    }
    // Tick twice a second so the displayed second never visibly sticks.
    intervalRef.current = window.setInterval(() => {
      if (endsAtMs === null) return;
      const remainingMs = endsAtMs - Date.now();
      if (remainingMs > 0) {
        setRemainingSeconds(Math.ceil(remainingMs / 1000));
        return;
      }
      // Phase completed — flip automatically with a visible state change (the label
      // pill and clock color below both derive from `phase`) plus an aria-live
      // announcement for screen readers.
      if (phase === "study") {
        setPhase("pause");
        setEndsAtMs(Date.now() + pauseMinutes * 60_000);
        setRemainingSeconds(pauseMinutes * 60);
        setAnnouncement("Temps d'étude terminé — pause commencée.");
      } else {
        setPhase("study");
        setEndsAtMs(Date.now() + studyMinutes * 60_000);
        setRemainingSeconds(studyMinutes * 60);
        setAnnouncement("Pause terminée — reprise de l'étude.");
      }
    }, 500);
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [phase, endsAtMs, studyMinutes, pauseMinutes, stopTicking]);

  function handleStart() {
    setPhase("study");
    setFrozenRemainingMs(null);
    setEndsAtMs(Date.now() + studyMinutes * 60_000);
    setRemainingSeconds(studyMinutes * 60);
    setAnnouncement("");
  }

  function handlePauseResume() {
    if (phase === "idle") return;
    if (endsAtMs !== null) {
      setFrozenRemainingMs(Math.max(0, endsAtMs - Date.now()));
      setEndsAtMs(null);
    } else if (frozenRemainingMs !== null) {
      setEndsAtMs(Date.now() + frozenRemainingMs);
      setFrozenRemainingMs(null);
    }
  }

  function handleReset() {
    setPhase("idle");
    setEndsAtMs(null);
    setFrozenRemainingMs(null);
    setRemainingSeconds(null);
    setAnnouncement("");
  }

  const isRunning = phase !== "idle";
  const isPaused = isRunning && endsAtMs === null;
  const displaySeconds = remainingSeconds ?? 0;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-28 right-4 z-20 inline-flex min-h-touch-target items-center gap-2 rounded-pill border border-border bg-surface-1 px-4 py-2 text-meta font-medium text-text-secondary shadow-card transition hover:bg-surface-2 hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring sm:bottom-6"
        aria-label="Ouvrir le minuteur d'étude"
        data-testid="study-timer-closed"
      >
        <span aria-hidden>⏱</span> Minuteur d&apos;étude
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-28 right-4 z-20 w-64 rounded-card border border-border bg-surface-1 p-4 shadow-card sm:bottom-6"
      role="group"
      aria-label="Minuteur d'étude"
      data-testid="study-timer-open"
    >
      <div className="flex items-center justify-between">
        <p className="text-meta font-medium text-text-secondary">Minuteur d&apos;étude</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-control px-1 text-meta text-text-tertiary transition hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          aria-label="Fermer le minuteur d'étude"
        >
          ✕
        </button>
      </div>

      {/* Phase banner — doubles as the visible study↔pause state change */}
      <div className="mt-3 flex items-center justify-between rounded-panel border px-3 py-2" data-phase={isRunning ? phase : undefined} aria-hidden>
        <span
          className={cx(
            "rounded-pill px-2 py-0.5 text-meta font-semibold",
            phase === "pause" ? "bg-success/15 text-success" : "bg-accent-qcm/15 text-accent-soft"
          )}
        >
          {phase === "pause" ? "Pause" : "Étude"}
        </span>
        <span
          className={cx(
            "font-display text-h2 font-bold tabular-nums",
            phase === "pause" ? "text-success" : "text-text-primary"
          )}
        >
          {formatClock(displaySeconds)}
        </span>
      </div>
      {/* Screen-reader announcement of automatic phase flips */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {!isRunning ? (
        <fieldset className="mt-3" disabled={!hydrated}>
          <legend className="mb-1.5 text-meta text-text-tertiary">Préréglage</legend>
          <div className="grid grid-cols-2 gap-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setPresetId(preset.id)}
                aria-pressed={presetId === preset.id}
                className={cx(
                  "min-h-touch-target rounded-control border px-2 py-1.5 text-meta font-medium transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                  presetId === preset.id
                    ? "border-accent-qcm bg-accent-qcm/15 text-accent-soft"
                    : "border-border bg-surface-2 text-text-secondary hover:bg-surface-3 hover:text-text-primary"
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
          {presetId === "custom" && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-meta text-text-secondary">
                Étude (min)
                <input
                  type="number"
                  min={CUSTOM_MIN}
                  max={CUSTOM_MAX}
                  value={customStudyMin}
                  onChange={(event) => setCustomStudyMin(Number(event.target.value))}
                  onBlur={(event) => setCustomStudyMin(clampMinutes(Number(event.target.value)))}
                  className="mt-1 w-full rounded-control border border-border bg-surface-2 px-2 py-1.5 text-body text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                  aria-label="Minutes d'étude personnalisées"
                />
              </label>
              <label className="text-meta text-text-secondary">
                Pause (min)
                <input
                  type="number"
                  min={CUSTOM_MIN}
                  max={CUSTOM_MAX}
                  value={customPauseMin}
                  onChange={(event) => setCustomPauseMin(Number(event.target.value))}
                  onBlur={(event) => setCustomPauseMin(clampMinutes(Number(event.target.value)))}
                  className="mt-1 w-full rounded-control border border-border bg-surface-2 px-2 py-1.5 text-body text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                  aria-label="Minutes de pause personnalisées"
                />
              </label>
            </div>
          )}
          <button
            type="button"
            onClick={handleStart}
            className="mt-3 inline-flex min-h-touch-target w-full items-center justify-center rounded-control bg-accent-qcm px-4 text-body font-semibold text-on-accent transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50 disabled:pointer-events-none"
          >
            Démarrer ({studyMinutes} min étude / {pauseMinutes} min pause)
          </button>
        </fieldset>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={handlePauseResume}
            className="inline-flex min-h-touch-target flex-1 items-center justify-center rounded-control border border-border px-3 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            {isPaused ? "Reprendre" : "Suspendre"}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex min-h-touch-target flex-1 items-center justify-center rounded-control border border-border px-3 text-body font-medium text-text-secondary transition hover:bg-surface-2 hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            Réinitialiser
          </button>
        </div>
      )}
    </div>
  );
}
