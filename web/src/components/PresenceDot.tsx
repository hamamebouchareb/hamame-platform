"use client";

import { useLanguage } from "@/context/LanguageContext";

/** Green dot for an online friend/presence (Facebook-style). Renders nothing
 * when the flag is false/unknown so callers never need their own condition. */
export function PresenceDot({ online, className }: { online?: boolean; className?: string }) {
  const { t } = useLanguage();
  if (!online) return null;
  return (
    <span
      title={t("friends.online")}
      aria-label={t("friends.online")}
      className={`${className ?? ""} absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-pill bg-success ring-2 ring-surface-1`}
    />
  );
}
