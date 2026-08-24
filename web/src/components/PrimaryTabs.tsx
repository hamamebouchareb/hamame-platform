"use client";

import { useRef } from "react";
import { cx } from "@/lib/cx";

export interface PrimaryTab {
  id: string;
  label: string;
  disabled?: boolean;
}

export interface PrimaryTabsProps {
  tabs: PrimaryTab[];
  activeId: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  className?: string;
}

/**
 * Pill-style segmented control. Real <button> elements with arrow-key navigation
 * and aria-selected. Active tab is a filled accent pill (dark text on volt).
 */
export function PrimaryTabs({ tabs, activeId, onChange, ariaLabel, className }: PrimaryTabsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  function tabButtons(): HTMLButtonElement[] {
    return Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("[role='tab']") ?? []).filter(
      (button) => !button.disabled
    );
  }

  function moveFocus(fromIndex: number, direction: -1 | 1) {
    const buttons = tabButtons();
    if (buttons.length === 0) return;
    const nextIndex = (fromIndex + direction + buttons.length) % buttons.length;
    buttons[nextIndex].focus();
  }

  function moveToEdge(edge: "first" | "last") {
    const buttons = tabButtons();
    if (buttons.length === 0) return;
    (edge === "first" ? buttons[0] : buttons[buttons.length - 1]).focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cx("flex w-fit max-w-full gap-1 overflow-x-auto rounded-pill border border-border bg-surface-2 p-1", className)}
    >
      {tabs.map((tab, index) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={active}
            // Deliberately no aria-controls: neither consumer renders tabpanel
            // elements (dashboard tabs navigate routes), so the reference would
            // dangle and fail axe's aria-valid-attr-value.
            tabIndex={active ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") moveFocus(index, -1);
              if (event.key === "ArrowRight") moveFocus(index, 1);
              if (event.key === "Home") moveToEdge("first");
              if (event.key === "End") moveToEdge("last");
            }}
            className={cx(
              "inline-flex min-h-touch-target items-center justify-center whitespace-nowrap rounded-pill px-4 text-body font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50 disabled:pointer-events-none",
              active
                ? "bg-accent-primary text-background shadow-glow-primary"
                : "text-text-secondary hover:bg-surface-3 hover:text-text-primary active:bg-surface-3"
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
