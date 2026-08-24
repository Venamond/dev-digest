"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { useSetCrumb } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { ApiError } from "@/lib/api";
import {
  useConventions,
  useDeselectAllConventions,
  useExtractConventions,
  useUpdateConvention,
  useRepoIntelStatus,
  useResyncRepoIntel,
} from "@/lib/hooks";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ConventionCard } from "../ConventionCard/ConventionCard";
import { CreateSkillModal } from "../CreateSkillModal/CreateSkillModal";
import { countAccepted, formatRelativeTime, preconditionReason } from "./helpers";
import { s } from "./styles";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);
  const deselect = useDeselectAllConventions(repoId);
  const index = useRepoIntelStatus(repoId);
  const resync = useResyncRepoIntel(repoId);
  const [showModal, setShowModal] = React.useState(false);

  useSetCrumb([
    { label: t("page.crumbLab") },
    { label: t("page.crumbConventions") },
  ]);

  if (repoNotFound) return <RepoNotFound />;

  const repoName = activeRepo?.name ?? activeRepo?.full_name?.split("/")[1] ?? t("page.repoFallback");
  const candidates = data?.candidates ?? [];
  const scan = data?.scan ?? null;
  const accepted = countAccepted(candidates);
  const neverScanned = !isLoading && !isError && scan == null && candidates.length === 0;

  const extractError =
    extract.error instanceof ApiError ? extract.error : null;
  const precondition = extractError ? preconditionReason(extractError.details) : null;

  const notCloned = activeRepo != null && !activeRepo.clone_path;
  const notIndexed =
    !notCloned &&
    index.data != null &&
    (!index.data.lastIndexedSha ||
      index.data.status === "degraded" ||
      index.data.status === "failed");

  const runExtract = () => {
    if (extract.isPending) return;
    extract.mutate();
  };

  // Same action either way: "Scan" before the first run, "Re-scan" after.
  const showExtractButton =
    !isLoading && (scan != null || extract.isPending || (!notCloned && !notIndexed));

  const deselectAll = () => {
    if (deselect.isPending) return;
    deselect.mutate();
  };

  // Only the ungrounded count is worth surfacing: it is the evidence check
  // doing its job. Dedupe/cap losses are housekeeping, not a trust signal.
  const ungrounded = extract.data?.dropped.ungrounded ?? 0;

  return (
    <>
      {showModal && (
        <CreateSkillModal
          repoId={repoId}
          repoName={repoName}
          acceptedCount={accepted}
          onClose={() => setShowModal(false)}
        />
      )}

      <div style={s.page}>
        <div style={s.headerRow}>
          <div>
            <h1 style={s.title}>
              {t("page.headingPrefix")}
              <span style={s.repoAccent}>{repoName}</span>
            </h1>
            <p style={s.subtitle}>
              {scan
                ? t("page.scanMeta", {
                    count: scan.sampled_file_count,
                    when: formatRelativeTime(scan.scanned_at),
                  })
                : t("page.subtitle")}
            </p>
          </div>
          {showExtractButton && (
            <div style={s.actions}>
              <Button
                kind="ghost"
                icon="RefreshCw"
                onClick={runExtract}
                loading={extract.isPending}
                disabled={notCloned}
              >
                {extract.isPending
                  ? t("page.scanning")
                  : scan
                    ? t("page.rescan")
                    : t("page.scan")}
              </Button>
            </div>
          )}
        </div>

        {(notCloned || notIndexed || precondition) && (
          <EmptyState
            icon="AlertTriangle"
            title={
              notCloned || precondition === "not_cloned"
                ? t("page.precondition.notClonedTitle")
                : precondition === "missing_provider_key"
                  ? t("page.precondition.missingKeyTitle")
                  : t("page.precondition.notIndexedTitle")
            }
            body={
              notCloned || precondition === "not_cloned"
                ? t("page.precondition.notClonedBody")
                : precondition === "missing_provider_key"
                  ? t("page.precondition.missingKeyBody")
                  : t("page.precondition.notIndexedBody")
            }
            cta={
              !notCloned && precondition !== "missing_provider_key"
                ? t("page.precondition.notIndexedCta")
                : undefined
            }
            onCta={
              !notCloned && precondition !== "missing_provider_key"
                ? () => resync.mutate()
                : undefined
            }
          />
        )}

        {isLoading && (
          <>
            <Skeleton height={120} />
            <Skeleton height={120} />
          </>
        )}

        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}

        {neverScanned && !notCloned && !notIndexed && !extract.isPending && (
          <EmptyState icon="ListChecks" title={t("page.empty.title")} body={t("page.empty.body")} />
        )}

        {candidates.length > 0 && (
          <>
            <div style={s.selectionRow}>
              <Button
                kind="ghost"
                onClick={deselectAll}
                loading={deselect.isPending}
                disabled={
                  accepted === 0 ||
                  update.isPending ||
                  extract.isPending ||
                  deselect.isPending
                }
              >
                {t("page.deselectAll")}
              </Button>
              <span style={s.acceptedCount}>
                {t("page.acceptedCount", { accepted, total: candidates.length })}
              </span>
              {ungrounded > 0 && (
                <span style={s.droppedCount}>
                  {t("page.droppedUngrounded", { count: ungrounded })}
                </span>
              )}
              <div style={{ marginLeft: "auto" }}>
                <Button
                  kind="primary"
                  icon="Plus"
                  onClick={() => setShowModal(true)}
                  disabled={accepted === 0 || extract.isPending}
                  title={
                    extract.isPending
                      ? t("page.scanning")
                      : accepted === 0
                        ? t("page.createSkillHint")
                        : undefined
                  }
                >
                  {t("page.createSkill")}
                </Button>
              </div>
            </div>

            <div style={s.list}>
              {candidates.map((c) => (
                <ConventionCard
                  key={c.id}
                  candidate={c}
                  // Re-scan replaces all rows — freeze the stale list while extract runs.
                  busy={extract.isPending || (update.isPending && update.variables?.id === c.id)}
                  onAccept={() => update.mutate({ id: c.id, patch: { status: "accepted" } })}
                  onReject={() => update.mutate({ id: c.id, patch: { status: "rejected" } })}
                  onSaveRule={(rule) => update.mutate({ id: c.id, patch: { rule } })}
                />
              ))}
            </div>
          </>
        )}

        {extract.isError && !precondition && (
          <ErrorState
            body={extractError?.message ?? t("page.extractionFailed")}
            onRetry={runExtract}
          />
        )}
      </div>
    </>
  );
}
