"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cx } from "@/lib/cx";

export type ToastTone = "success" | "error" | "info";

export interface ToastOptions {
  title: string;
  description?: string;
  /** Auto-dismiss delay in ms (default 5000). Pass 0 to keep until dismissed. */
  duration?: number;
}

interface ToastEntry extends ToastOptions {
  id: number;
  tone: ToastTone;
}

interface ToastContextValue {
  success: (toast: ToastOptions) => void;
  error: (toast: ToastOptions) => void;
  info: (toast: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const toneIcon: Record<ToastTone, ReactNode> = {
  success: (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 10.5l4 4L16 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M10 6v4m0 4h.01M5.6 4.4L4 6l6 6 6-6-1.6-1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M10 9v5m0-9h.01" strokeLinecap="round" />
    </svg>
  ),
};

const toneClass: Record<ToastTone, string> = {
  success: "border-success/40 text-success",
  error: "border-danger/40 text-danger",
  info: "border-accent-suivi/40 text-accent-soft",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (tone: ToastTone, toast: ToastOptions) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { ...toast, id, tone }]);
      if (toast.duration !== 0) {
        window.setTimeout(() => dismiss(id), toast.duration ?? 5000);
      }
    },
    [dismiss]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      success: (toast) => show("success", toast),
      error: (toast) => show("error", toast),
      info: (toast) => show("info", toast),
    }),
    [show]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            className={cx(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card border bg-surface-2 p-card-padding shadow-card-lg",
              toneClass[toast.tone]
            )}
          >
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-surface-3">
              {toneIcon[toast.tone]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body font-medium text-text-primary">{toast.title}</p>
              {toast.description ? <p className="mt-0.5 text-meta text-text-secondary">{toast.description}</p> : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Fermer la notification"
              className="inline-flex min-h-touch-target shrink-0 items-center justify-center rounded-pill text-text-tertiary transition hover:bg-surface-3 hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
