/* PR Detail view — findings, run history, diff. Tab/trace in ?tab&trace. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Skeleton, ErrorState } from "@devdigest/ui";
import { useSetCrumb } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { PrDetailHeader } from "../PrDetailHeader/PrDetailHeader";
import { OverviewTab } from "../OverviewTab/OverviewTab";
import { FindingsTab } from "../FindingsTab/FindingsTab";
import { DiffTab } from "../DiffTab/DiffTab";
import RunTraceDrawer from "../RunTraceDrawer/RunTraceDrawer";
import { usePullDetail, usePulls, queryKeys } from "@/lib/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { usePrReviews, useCancelRun, usePrActiveRuns, usePrRuns, useDeleteRun } from "@/lib/hooks/reviews";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import { githubPrUrl } from "@/lib/github-urls";
import type { FindingRecord } from "@devdigest/shared";
import { patchedSearch, openFindingPatch } from "./helpers";
import { useTabScroll } from "./use-tab-scroll";
import { PreservedToggleProvider } from "./preserved-toggle";

/** The provider must sit ABOVE the loading/error branches: those unmount the
 *  whole tab subtree, and the store has to outlive that. */
export function PrDetailView() {
  return (
    <PreservedToggleProvider>
      <PrDetailViewInner />
    </PreservedToggleProvider>
  );
}

function PrDetailViewInner() {
  const params = useParams<{ repoId: string; number: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const t = useTranslations("prReview");
  const { repoId, number } = params;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data: pulls, isLoading: pullsLoading } = usePulls(repoId);
  const prId = pulls?.find((p) => p.number === Number(number))?.id ?? null;
  const { data: pr, isLoading: detailLoading, isError, error, refetch } = usePullDetail(prId);

  const isLoading = pullsLoading || (prId != null && detailLoading);
  const { data: reviews, refetch: refetchReviews } = usePrReviews(prId);

  const qc = useQueryClient();
  const { data: activeRuns } = usePrActiveRuns(prId);
  const { data: prRuns } = usePrRuns(prId);
  const deleteRun = useDeleteRun(prId);
  const liveRunIds = (activeRuns ?? []).map((r) => r.run_id);
  const reviewRunning = liveRunIds.length > 0;
  const cancel = useCancelRun();
  const invalidateActiveRuns = () => {
    if (prId) qc.invalidateQueries({ queryKey: queryKeys.prActiveRuns(prId) });
  };
  const invalidateRunHistory = () => {
    if (prId) qc.invalidateQueries({ queryKey: queryKeys.prRuns(prId) });
  };

  const tab = search.get("tab") ?? "overview";
  const traceRunId = search.get("trace");
  const targetFindingId = search.get("finding");
  // A file/line deep link out of the PR brief (AC-29). Both are cleared when
  // the human switches tab by hand, so a stale target cannot re-fire.
  const targetFile = search.get("file");
  const targetLine = search.get("line");
  // `scroll` defaults to Next's own behaviour (scroll to top). Pass false when
  // the destination does its own scrolling: App Router's default is
  // ScrollBehavior.Default on every push/replace, which lands the viewport at
  // the top of the page and beats a `scrollIntoView` fired from an effect.
  const setParams = (patch: Record<string, string | null>, opts?: { scroll?: boolean }) => {
    const qs = patchedSearch(search, patch);
    router.replace(`/repos/${repoId}/pulls/${number}${qs ? `?${qs}` : ""}`, opts);
  };
  const setParam = (key: string, val: string | null) => setParams({ [key]: val });
  // Remember where the user was in the tab being left, so returning to it does
  // not dump them back at the top. Skip the restore when a ?finding= target is
  // in play — FindingCard scrolls itself to the card and must win.
  const { rootRef, remember } = useTabScroll(tab, { skipRestore: !!targetFindingId });
  const setTab = (t: string) => {
    remember(tab);
    setParams({ tab: t, finding: null, file: null, line: null });
  };

  const runs = reviews ?? [];
  const allFindings: FindingRecord[] = React.useMemo(
    () => runs.flatMap((r) => r.findings),
    [reviews],
  );
  const lethalTrifecta = allFindings.filter((f) => f.kind === "lethal_trifecta");

  const repoName = activeRepo?.full_name ?? repoId;
  const repoFullName = activeRepo?.full_name ?? null;
  useSetCrumb([
    { label: repoName, mono: true, href: `/repos/${repoId}/pulls` },
    { label: t("list.breadcrumb"), href: `/repos/${repoId}/pulls` },
    { label: `#${number}`, mono: true },
  ]);

  if (repoNotFound) {
    return <RepoNotFound />;
  }

  if (isLoading) {
    return (
      <div style={{ padding: "28px 32px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 1240, margin: "0 auto" }}>
        <Skeleton height={28} width={420} />
        <Skeleton height={16} width={300} />
        <Skeleton height={200} />
      </div>
    );
  }

  if (isError || !pr) {
    return (
      <ErrorState
        fullScreen
        title={t("detail.loadErrorTitle")}
        body={
          error instanceof ApiError
            ? error.message
            : t("detail.loadErrorBody", { number })
        }
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <>
      <PrDetailHeader
        pr={pr}
        prId={prId}
        tab={tab}
        runsCount={runs.length}
        githubUrl={repoFullName ? githubPrUrl(repoFullName, pr.number) : null}
        onSetTab={setTab}
        onRunStart={() => setTab("findings")}
        onRunsStarted={() => invalidateActiveRuns()}
      />

      <div
        ref={rootRef}
        style={{
          padding: "24px 32px 44px",
          display: "flex",
          flexDirection: "column",
          gap: 24,
          // Sized to the widest thing the page must hold on one line, and no
          // wider: the Blast Radius counter row with three-digit values needs
          // ~540px, so a card needs ~580px with its padding, so the page needs
          // 2×580 + 16 (grid gap) + 64 (page padding) = 1240. At the previous
          // 1080 a counter wrapped no matter how tight the row got. A cap, not
          // a floor — narrower viewports still use whatever they have.
          maxWidth: 1240,
          margin: "0 auto",
        }}
      >
        {tab === "overview" && <OverviewTab prBody={pr.body} prId={prId} />}

        {tab === "findings" && (
          <FindingsTab
            prId={prId}
            liveRunIds={liveRunIds}
            reviewRunning={reviewRunning}
            lethalTrifecta={lethalTrifecta}
            allFindings={allFindings}
            runs={runs}
            prRuns={prRuns}
            prCommits={pr.commits}
            repoFullName={repoFullName}
            headSha={pr.head_sha}
            cancelMutation={cancel}
            onOpenTrace={(id) => setParam("trace", id)}
            onDelete={(id) => {
              if (window.confirm(t("timeline.deleteConfirm"))) deleteRun.mutate(id);
            }}
            onRunDone={() => {
              invalidateActiveRuns();
              invalidateRunHistory();
              refetchReviews();
              // SSE `done` fires after findings are persisted — this is what
              // makes Smart Diff's "N findings" badges appear without a reload.
              if (prId) qc.invalidateQueries({ queryKey: queryKeys.smartDiff(prId) });
            }}
            targetFindingId={targetFindingId}
          />
        )}

        {tab === "diff" && (
          <DiffTab
            prId={prId}
            filesCount={pr.files_count}
            files={pr.files}
            additions={pr.additions}
            deletions={pr.deletions}
            canComment={pr.status === "open"}
            findings={allFindings}
            // scroll: false — FindingCard scrolls itself to the target card.
            // Without this, Next scrolls to the top of the page first and the
            // user always lands on the first Review runs block instead.
            onOpenFinding={(id) => setParams(openFindingPatch(id), { scroll: false })}
            runs={prRuns}
            targetFile={targetFile}
            targetLine={targetLine != null ? Number(targetLine) : null}
          />
        )}
      </div>

      {prId && traceRunId && (
        <RunTraceDrawer
          runId={traceRunId}
          prNumber={pr.number}
          findings={runs.find((r) => r.run_id === traceRunId)?.findings ?? []}
          agentName={runs.find((r) => r.run_id === traceRunId)?.agent_name ?? null}
          onClose={() => setParam("trace", null)}
        />
      )}
    </>
  );
}
