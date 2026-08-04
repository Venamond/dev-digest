"use client";

import { ErrorState } from "@devdigest/ui";

/** App Router error boundary — catches unexpected render/route errors. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      fullScreen
      title="Something went wrong"
      body={error.message || "An unexpected error occurred in the studio."}
      onRetry={reset}
    />
  );
}
