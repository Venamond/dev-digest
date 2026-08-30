/* FindingsPreviewPopover — wraps the PR-list findings badge. On hover (after
   a short delay, via HoverPreviewAnchor), lazily fetches this PR's reviews
   (the same data the PR-detail page uses) and shows a read-only preview of
   the individual findings behind the badge's count. */
"use client";

import React from "react";
import { usePrReviews } from "@/lib/hooks/reviews";
import { HoverPreviewAnchor } from "./HoverPreviewAnchor";
import { FindingsPreviewPanel } from "./FindingsPreviewPanel";

export function FindingsPreviewPopover({
  prId,
  count,
  children,
}: {
  prId: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const { data, isLoading, isError } = usePrReviews(prId, { enabled: open, staleTime: 60_000 });
  const findings = React.useMemo(() => (data ?? []).flatMap((r) => r.findings), [data]);

  return (
    <HoverPreviewAnchor
      onOpenChange={setOpen}
      content={<FindingsPreviewPanel findings={findings} count={count} loading={isLoading} error={isError} />}
    >
      {children}
    </HoverPreviewAnchor>
  );
}
