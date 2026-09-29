"use client";

import { useLanguage } from "@/context/LanguageContext";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";

export interface ErrorStateProps {
  /** Message from the API layer, already localized by the caller. */
  message: string;
  /** Omit to render the message without a retry affordance. */
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

/**
 * Inline fetch-failure panel: the error-card + retry-button shape that was
 * hand-repeated across every list page. `role="alert"` announces the failure
 * as soon as it renders.
 */
export function ErrorState({ message, onRetry, retryLabel, className }: ErrorStateProps) {
  const { t } = useLanguage();
  return (
    <Card variant="danger" className={className}>
      <p role="alert" className="text-body text-danger">
        {message}
      </p>
      {onRetry ? (
        <Button variant="outline" width="full-mobile" onClick={onRetry} className="mt-3">
          {retryLabel ?? t("common.retry")}
        </Button>
      ) : null}
    </Card>
  );
}
