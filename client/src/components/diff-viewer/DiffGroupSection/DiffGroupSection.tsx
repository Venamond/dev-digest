/* DiffGroupSection — wraps the real FileCards for one Smart Diff role group
   (or the trailing "Other files" section) behind its own collapse toggle.
   The boilerplate group starts collapsed; every other group starts open. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import type { SmartDiffRole } from "@devdigest/shared";
import { s, chevronFor } from "../styles";
import { FileCard } from "../FileCard";
import { type DiffCommentApi } from "../comments";
import type { DiffLineTarget } from "../target";

export function DiffGroupSection({
  role,
  files,
  meta,
  commenting,
  target,
  onJumpToLine,
  defaultOpen,
}: {
  role: SmartDiffRole | null;
  files: PrFile[];
  meta: Map<string, { role: SmartDiffRole; findingLines: number[] }>;
  commenting?: DiffCommentApi;
  target?: DiffLineTarget | null;
  onJumpToLine?: (path: string, line: number) => void;
  defaultOpen?: boolean;
}) {
  const t = useTranslations("shell");
  const [open, setOpen] = React.useState(defaultOpen ?? role !== "boilerplate");

  // Second-level force-expand: a target inside this (possibly collapsed)
  // group must reveal the group before FileCard's own effects can run.
  const containsTarget = !!target && files.some((f) => f.path === target.path);
  React.useEffect(() => {
    if (containsTarget) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containsTarget, target?.nonce]);

  const label = role ? t(`diffViewer.role.${role}`) : t("diffViewer.otherFiles");

  return (
    <div style={s.groupSection}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={s.groupHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <span style={s.groupLabel}>{label}</span>
        <span style={s.groupCount}>{t("diffViewer.groupCount", { count: files.length })}</span>
      </button>
      {open && (
        <div style={s.groupBody}>
          {files.map((f, i) => (
            <FileCard
              key={i}
              file={f}
              commenting={commenting}
              role={meta.get(f.path)?.role ?? null}
              findingLines={meta.get(f.path)?.findingLines}
              target={target}
              onJumpToLine={onJumpToLine}
            />
          ))}
        </div>
      )}
    </div>
  );
}
