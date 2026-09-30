import Link from "next/link";
import { cx } from "@/lib/cx";
import type { CurriculumContext } from "@/lib/types";

export interface BreadcrumbItem {
  label: string;
  /** Omitted on the current page, which renders as text. */
  href?: string;
}

/**
 * Faculty → year → module → unit trail. The last item is the current page.
 * Labels come from the caller (API `context` plus i18n), never hard-coded here.
 */
export function Breadcrumb({ label, items }: { label: string; items: BreadcrumbItem[] }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label={label} className="min-w-0">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-meta">
        {items.map((item, index) => {
          const current = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="inline-flex min-w-0 items-center gap-1.5">
              {index > 0 ? (
                <span aria-hidden className="text-text-tertiary">
                  ›
                </span>
              ) : null}
              {current || !item.href ? (
                <span
                  aria-current={current ? "page" : undefined}
                  className="truncate font-medium text-text-primary"
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className={cx(
                    "truncate font-medium text-text-secondary transition hover:text-accent-soft",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                  )}
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Library root plus the parents in `context`. The deepest level is the current
 * page. Pass `currentLabel` when this page sits one step past that level (a lesson
 * title); the context's deepest level then stays a link.
 */
export function curriculumTrail(
  libraryLabel: string,
  context: CurriculumContext | null | undefined,
  currentLabel?: string
): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = [{ href: "/faculties", label: libraryLabel }];
  if (!context) {
    if (currentLabel) items.push({ label: currentLabel });
    return items;
  }

  const depth = context.unit ? "unit" : context.module ? "module" : context.year ? "year" : "faculty";
  const here = (level: string) => !currentLabel && depth === level;

  items.push(
    here("faculty")
      ? { label: context.faculty.name }
      : { href: `/faculties/${context.faculty.id}/years`, label: context.faculty.name }
  );
  if (context.year) {
    items.push(
      here("year")
        ? { label: context.year.label }
        : { href: `/years/${context.year.id}/modules`, label: context.year.label }
    );
  }
  if (context.module) {
    items.push(
      here("module")
        ? { label: context.module.name }
        : { href: `/modules/${context.module.id}/units`, label: context.module.name }
    );
  }
  if (context.unit) {
    items.push(
      here("unit")
        ? { label: context.unit.name }
        : { href: `/units/${context.unit.id}`, label: context.unit.name }
    );
  }
  if (currentLabel) items.push({ label: currentLabel });
  return items;
}
