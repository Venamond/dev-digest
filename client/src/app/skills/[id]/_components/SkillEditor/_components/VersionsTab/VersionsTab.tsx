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

/** Versions tab — list snapshots; Diff + Restore for non-current. */
export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const diffMut = useSkillVersionDiff();
  const [diffText, setDiffText] = React.useState<string | null>(null);
  const [diffVersion, setDiffVersion] = React.useState<number | null>(null);
  const [diffError, setDiffError] = React.useState<string | null>(null);

  const onDiff = async (version: number) => {
    setDiffError(null);
    setDiffVersion(version);
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
            const note = v.note ?? t("versions.noteFallback", { version: v.version });
            return (
              <div key={v.version} style={s.row}>
                <span className="mono" style={s.versionChip}>
                  {t("versions.version", { version: v.version })}
                </span>
                <div style={s.meta}>
                  <div style={s.noteTitle}>{note}</div>
                  <div style={s.date}>{formatDate(v.created_at)}</div>
                </div>
                {isCurrent ? (
                  <Badge color="var(--ok)" dot>
                    {t("versions.current")}
                  </Badge>
                ) : (
                  <div style={s.actions}>
                    <Button
                      kind="ghost"
                      size="sm"
                      icon="Eye"
                      onClick={() => void onDiff(v.version)}
                      disabled={diffMut.isPending && diffVersion === v.version}
                    >
                      {t("versions.diff")}
                    </Button>
                    <Button
                      kind="secondary"
                      size="sm"
                      icon="History"
                      onClick={() => onRestore(v.version)}
                      disabled={restore.isPending}
                    >
                      {restore.isPending ? t("versions.restoring") : t("versions.restore")}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {diffError && <div style={s.error}>{diffError}</div>}
      {diffText != null && (
        <div style={s.diffPanel}>
          <div style={s.diffHeader}>
            <span style={s.diffTitle}>
              {t("versions.diffTitle")}
              {diffVersion != null ? ` (v${diffVersion})` : ""}
            </span>
            <Button
              kind="ghost"
              size="sm"
              onClick={() => {
                setDiffText(null);
                setDiffVersion(null);
              }}
            >
              {t("versions.close")}
            </Button>
          </div>
          <pre style={s.diffPre}>{diffText}</pre>
        </div>
      )}
    </div>
  );
}
