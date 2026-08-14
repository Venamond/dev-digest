/* DiffGroupSection — wraps the real FileCards for one Smart Diff role group
   (or the trailing "Other files" section) behind its own collapse toggle.
   The boilerplate group starts collapsed; every other group starts open. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import type { FindingRecord, SmartDiffRole } from "@devdigest/shared";
import { s, chevronFor } from "../styles";
import { FileCard } from "../FileCard";
import { type DiffCommentApi } from "../comments";

export function DiffGroupSection({
  role,
  files,
  roleByPath,
  findingsByPath,
  commenting,
  smart,
  onOpenFinding,
  defaultOpen,
}: {
  role: SmartDiffRole | null;
  files: PrFile[];
  roleByPath: Map<string, SmartDiffRole>;
  findingsByPath: Map<string, FindingRecord[]>;
  commenting?: DiffCommentApi;
  smart?: boolean;
  onOpenFinding?: (findingId: string) => void;
  defaultOpen?: boolean;
}) {
  const t = useTranslations("shell");
  const [open, setOpen] = React.useState(defaultOpen ?? role !== "boilerplate");

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
              smart={smart}
              role={roleByPath.get(f.path) ?? null}
              findings={findingsByPath.get(f.path)}
              onOpenFinding={onOpenFinding}
            />
          ))}
        </div>
      )}
    </div>
  );
}
