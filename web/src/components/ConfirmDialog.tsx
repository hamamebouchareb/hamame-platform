"use client";

import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Modal } from "@/components/Modal";

export type ConfirmTone = "primary" | "secondary" | "danger";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  isConfirming?: boolean;
  confirmError?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

const confirmButtonClass: Record<ConfirmTone, string> = {
  primary: "bg-accent-primary text-on-accent shadow-glow-primary",
  secondary: "bg-accent-secondary text-on-accent shadow-glow-secondary",
  danger: "bg-danger text-background",
};

const buttonBase =
  "inline-flex min-h-touch-target items-center justify-center rounded-control px-4 text-body font-medium transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50 disabled:pointer-events-none";

/** Confirm-action dialog built on Modal, with a blocking confirm button + inline error. */
export function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel = "Annuler",
  tone = "primary",
  isConfirming = false,
  confirmError,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <button type="button" onClick={onCancel} disabled={isConfirming} className={cx(buttonBase, "border border-border text-text-primary hover:bg-surface-3")}>
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} disabled={isConfirming} className={cx(buttonBase, confirmButtonClass[tone])}>
            {isConfirming ? "Chargement..." : confirmLabel}
          </button>
        </>
      }
    >
      {description ? <p className="mb-3 text-body text-text-secondary">{description}</p> : null}
      {children}
      {confirmError ? (
        <p role="alert" className="mt-3 rounded-control border border-danger bg-surface-1 px-3 py-2 text-meta text-danger">
          {confirmError}
        </p>
      ) : null}
    </Modal>
  );
}
