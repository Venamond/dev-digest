"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, useSmartDiff } from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import type { FindingRecord, PrFile, RunSummary } from "@devdigest/shared";
import { SmartDiffViewer } from "../SmartDiffViewer/SmartDiffViewer";
import { DEFAULT_DIFF_ORDER, type DiffOrder } from "../SmartDiffViewer/constants";
import { lastReviewTokensIn } from "../SmartDiffViewer/helpers";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  findings?: FindingRecord[];
  onOpenFinding?: (findingId: string) => void;
  runs?: RunSummary[];
}

function sumDiff(files: PrFile[]): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const f of files) {
    additions += f.additions ?? 0;
    deletions += f.deletions ?? 0;
  }
  return { additions, deletions };
}

export function DiffTab({ prId, filesCount, files, canComment, findings, onOpenFinding, runs }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);

  const { data: smartDiff } = useSmartDiff(prId);
  const [order, setOrder] = React.useState<DiffOrder>(DEFAULT_DIFF_ORDER);
  const { additions, deletions } = sumDiff(files);

  const commentCount = comments?.length ?? 0;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : t("diffTab.postError"));
        throw err;
      }
    },
  };

  return (
    <section>
      <SmartDiffViewer
        smartDiff={smartDiff}
        order={order}
        onOrderChange={setOrder}
        filesCount={filesCount}
        additions={additions}
        deletions={deletions}
        reviewTokensIn={lastReviewTokensIn(runs ?? [])}
        extraRight={
          commentCount > 0 ? (
            <Button
              kind="ghost"
              size="sm"
              icon={showComments ? "EyeOff" : "Eye"}
              onClick={() => setShowComments((v) => !v)}
            >
              {showComments
                ? t("diffTab.hideComments", { count: commentCount })
                : t("diffTab.showComments", { count: commentCount })}
            </Button>
          ) : undefined
        }
      />
      <DiffViewer
        files={files}
        commenting={commenting}
        smartDiff={smartDiff ?? null}
        grouped={order === "smart"}
        findings={findings}
        onOpenFinding={onOpenFinding}
      />
    </section>
  );
}
