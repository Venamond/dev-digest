"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffLineTarget } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, useSmartDiff } from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";
import { SmartDiffViewer } from "../SmartDiffViewer/SmartDiffViewer";
import { DEFAULT_DIFF_ORDER, type DiffOrder } from "../SmartDiffViewer/constants";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
}

export function DiffTab({ prId, filesCount, files, canComment }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);

  const { data: smartDiff } = useSmartDiff(prId);
  const [order, setOrder] = React.useState<DiffOrder>(DEFAULT_DIFF_ORDER);
  const [target, setTarget] = React.useState<DiffLineTarget | null>(null);
  const onJumpToLine = (path: string, line: number) =>
    setTarget((prev) => ({ path, line, nonce: (prev?.nonce ?? 0) + 1 }));

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
      <SectionLabel
        icon="Code"
        right={
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
      >
        {t("diffTab.sectionLabel", { count: filesCount })}
      </SectionLabel>
      <SmartDiffViewer smartDiff={smartDiff} order={order} onOrderChange={setOrder} />
      <DiffViewer
        files={files}
        commenting={commenting}
        smartDiff={smartDiff ?? null}
        grouped={order === "smart"}
        target={target}
        onJumpToLine={onJumpToLine}
      />
    </section>
  );
}
