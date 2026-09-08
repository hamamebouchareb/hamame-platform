"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cx } from "@/lib/cx";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Fixed-width footer row (buttons). */
  footer?: ReactNode;
  className?: string;
}

/**
 * Accessible modal: `role="dialog"`, Escape to close, backdrop-click to close,
 * focus moved into the dialog on open and restored on close, body scroll locked.
 * The only close control is a real <button> (the backdrop is inert).
 */
export function Modal({ open, onClose, title, children, footer, className }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-[color:var(--color-overlay)] p-card-padding"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hamame-dialog-title"
        tabIndex={-1}
        className={cx(
          "hamame-dialog-enter w-full max-w-sm rounded-card-lg border border-border bg-surface-2 p-card-padding shadow-card-lg focus:outline-none",
          className
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="hamame-dialog-title" className="font-display text-h2 font-semibold text-text-primary">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="inline-flex min-h-touch-target min-w-touch-target items-center justify-center rounded-pill border border-border text-text-secondary transition hover:bg-surface-3 hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-3"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="mt-3 text-body text-text-secondary">{children}</div>
        {footer ? <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">{footer}</div> : null}
      </div>
    </div>
  );
}
