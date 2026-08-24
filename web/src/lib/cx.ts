export type ClassValue = string | number | null | undefined | false;

/** Tiny class-name combiner (filters falsy values, joins with a space). */
export function cx(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
