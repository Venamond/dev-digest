"use client";

import { useTranslations } from "next-intl";
import { ErrorState } from "@devdigest/ui";

/** App Router error boundary — catches unexpected render/route errors. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common");
  return (
    <ErrorState
      fullScreen
      title={t("errors.title")}
      body={error.message || t("errors.body")}
      onRetry={reset}
    />
  );
}
