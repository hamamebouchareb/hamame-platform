import { cx } from "@/lib/cx";

const TONES = [
  "bg-accent-primary",
  "bg-accent-secondary",
  "bg-accent-library",
  "bg-accent-suivi",
] as const;

export function initialsOf(name: string | null | undefined): string {
  if (!name || !name.trim()) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join("");
}

function toneFor(seed: string): string {
  let n = 0;
  for (let i = 0; i < seed.length; i += 1) n = (n + seed.charCodeAt(i)) % TONES.length;
  return TONES[n];
}

export function UserAvatar({
  name,
  seed,
  size = 36,
  className,
}: {
  name: string | null | undefined;
  seed?: string;
  size?: number;
  className?: string;
}) {
  const label = initialsOf(name);
  return (
    <span
      aria-hidden
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-pill font-display font-bold text-on-accent",
        toneFor(seed ?? name ?? label),
        className
      )}
      style={{ width: size, height: size, fontSize: size < 32 ? 11 : 13 }}
    >
      {label}
    </span>
  );
}
