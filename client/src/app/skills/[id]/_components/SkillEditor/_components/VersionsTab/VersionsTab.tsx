"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import {
  useRestoreSkillVersion,
  useSkillVersionDiff,
  useSkillVersions,
} from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { s } from "./styles";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * Versions tab — list snapshots; Diff + Restore for non-current.
 * Diff expands inline under its own row (Diff → Hide toggles it), pushing
 * later rows down — not a single shared panel below the whole list.
 */
export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const diffMut = useSkillVersionDiff();
  const [openVersion, setOpenVersion] = React.useState<number | null>(null);
  const [diffText, setDiffText] = React.useState<string | null>(null);
  const [diffError, setDiffError] = React.useState<string | null>(null);

  // Only one row's diff is ever open — reusing this single mutation instance
  // is safe because a second Diff click can't fire while the panel it would
  // affect is being replaced.
  const onToggleDiff = async (version: number) => {
    if (openVersion === version) {
      setOpenVersion(null);
      setDiffText(null);
      setDiffError(null);
      return;
    }
    setOpenVersion(version);
    setDiffText(null);
    setDiffError(null);
    try {
      const result = await diffMut.mutateAsync({ id: skill.id, version });
      setDiffText(result.diff || t("versions.diffEmpty"));
    } catch (e) {
      setDiffText(null);
      setDiffError(e instanceof ApiError ? e.message : t("versions.diffError"));
    }
  };

  const onRestore = (version: number) => {
    if (!window.confirm(t("versions.restoreConfirm", { version }))) return;
    restore.mutate(
      { id: skill.id, version },
      {
        onSuccess: (data) => toast.success(t("versions.restoreToast", { version: data.version })),
      },
    );
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.titleRow}>
          <h2 style={s.h2}>{t("versions.title")}</h2>
          {versions && versions.length > 0 && (
            <Badge color="var(--text-secondary)" bg="var(--bg-surface)">
              {t("versions.count", { count: versions.length })}
            </Badge>
          )}
        </div>
        <p style={s.subtitle}>{t("versions.subtitle")}</p>
      </div>

      {isLoading && (
        <>
          <Skeleton height={56} />
          <div style={{ height: 10 }} />
          <Skeleton height={56} />
        </>
      )}
      {isError && <ErrorState body={t("detail.loadError")} onRetry={() => refetch()} />}
      {!isLoading && !isError && (versions?.length ?? 0) === 0 && (
        <p style={s.empty}>{t("versions.empty")}</p>
      )}

      {versions && versions.length > 0 && (
        <div style={s.list}>
          {versions.map((v) => {
            const isCurrent = v.version === skill.version;
            const isOpen = openVersion === v.version;
            const note = v.note ?? t("versions.noteFallback", { version: v.version });
            return (
              <div key={v.version}>
                <div style={s.row}>
                  <span className="mono" style={s.versionChip}>
                    {t("versions.version", { version: v.version })}
                  </span>
                  <div style={s.meta}>
                    <div style={s.noteTitle}>{note}</div>
                    <div style={s.date}>{formatDate(v.created_at)}</div>
                  </div>
                  <div style={s.actions}>
                    <Button
                      kind="ghost"
                      size="sm"
                      icon={isOpen ? "EyeOff" : "Eye"}
                      onClick={() => void onToggleDiff(v.version)}
                      disabled={diffMut.isPending && isOpen}
                    >
                      {isOpen ? t("versions.hide") : t("versions.diff")}
                    </Button>
                    {/* Fixed-width slot so Diff/Hide lands at the same x on
                        every row — Current's badge and Restore's button are
                        different widths, so this side must not resize. */}
                    <div style={s.statusSlot}>
                      {isCurrent ? (
                        <Badge color="var(--ok)" dot>
                          {t("versions.current")}
                        </Badge>
                      ) : (
                        <Button
                          kind="secondary"
                          size="sm"
                          icon="History"
                          onClick={() => onRestore(v.version)}
                          disabled={restore.isPending}
                        >
                          {restore.isPending ? t("versions.restoring") : t("versions.restore")}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {isOpen && (
                  <div style={s.diffPanel}>
                    {diffError ? (
                      <div style={s.error}>{diffError}</div>
                    ) : diffText != null ? (
                      <>
                        {/* Diffing current against itself is a no-op — the
                            "vs current" caption would be misleading here. */}
                        {!isCurrent && (
                          <div style={s.diffTitle}>
                            {t("versions.diffTitle")} (v{v.version})
                          </div>
                        )}
                        <pre style={s.diffPre}>{diffText}</pre>
                      </>
                    ) : (
                      <Skeleton height={80} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
