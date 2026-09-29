"use client";

import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cx } from "@/lib/cx";

/** Shared control surface for inputs, selects, and textareas. */
const controlBase =
  "min-h-touch-target w-full rounded-input border bg-surface-2 text-body text-text-primary transition placeholder:text-text-tertiary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50";

function controlClasses(invalid: boolean, className?: string): string {
  return cx(controlBase, invalid ? "border-danger" : "border-border", className);
}

export const labelClasses = "mb-2 block text-meta font-medium text-text-secondary";

interface FieldShellProps {
  id: string;
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}

/** Label + control + hint/error stack, with the aria wiring done once. */
function FieldShell({ id, label, hint, error, children, className }: FieldShellProps) {
  return (
    <div className={className}>
      {label ? (
        <label htmlFor={id} className={labelClasses}>
          {label}
        </label>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-meta text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-meta text-text-tertiary">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Points the control at whichever helper text is currently rendered. */
function describedBy(id: string, error?: string | null, hint?: ReactNode): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

interface SharedFieldProps {
  id: string;
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  /** Classes for the wrapper; `className` styles the control itself. */
  fieldClassName?: string;
}

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id">,
    SharedFieldProps {}

export function Input({ id, label, hint, error, fieldClassName, className, ...rest }: InputProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={fieldClassName}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={controlClasses(!!error, cx("px-4 py-3", className))}
        {...rest}
      />
    </FieldShell>
  );
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id">,
    SharedFieldProps {
  children: ReactNode;
}

export function Select({
  id,
  label,
  hint,
  error,
  fieldClassName,
  className,
  children,
  ...rest
}: SelectProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={fieldClassName}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={controlClasses(!!error, cx("px-4", className))}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
}

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id">,
    SharedFieldProps {}

export function Textarea({
  id,
  label,
  hint,
  error,
  fieldClassName,
  className,
  ...rest
}: TextareaProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={fieldClassName}>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={controlClasses(!!error, cx("px-4 py-3", className))}
        {...rest}
      />
    </FieldShell>
  );
}
