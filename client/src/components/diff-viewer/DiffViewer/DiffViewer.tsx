/* DiffViewer — basic GitHub-style unified diff viewer. Renders real PrFile.patch
   (unified-diff text from the F1 API) as a list of collapsible FileCards.
   Optional inline comments (Files changed tab): hover a line → "+" → comment,
   posted live to GitHub; existing GitHub review comments render inline.
   Optionally groups the same real FileCards into Smart Diff role sections
   (Smart order) instead of the flat server-ordered list (Original order) —
   see docs/plans/2026-08-14-smart-diff.md §2b: one list, never a second. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrFile } from "@/lib/types";
import type { SmartDiff, SmartDiffRole } from "@devdigest/shared";
import { type DiffCommentApi } from "../comments";
import { s } from "../styles";
import { FileCard } from "../FileCard";
import { DiffGroupSection } from "../DiffGroupSection";
import type { DiffLineTarget } from "../target";

export function DiffViewer({
  files,
  commenting,
  target,
  smartDiff,
  grouped = false,
  onJumpToLine,
}: {
  files: PrFile[];
  commenting?: DiffCommentApi;
  target?: DiffLineTarget | null;
  smartDiff?: SmartDiff | null;
  grouped?: boolean;
  onJumpToLine?: (path: string, line: number) => void;
}) {
  const t = useTranslations("shell");

  const meta = React.useMemo(() => {
    const m = new Map<string, { role: SmartDiffRole; findingLines: number[] }>();
    for (const g of smartDiff?.groups ?? []) {
      for (const f of g.files) m.set(f.path, { role: g.role, findingLines: f.finding_lines });
    }
    return m;
  }, [smartDiff]);

  if (!files || files.length === 0) {
    return <div style={s.empty}>{t("diffViewer.noChangedFiles")}</div>;
  }

  if (!grouped || !smartDiff) {
    // Original order: exactly today's behaviour — flat, server-ordered list,
    // no group headers, no `role` (so collapse seeding stays size-only).
    return (
      <div style={s.list}>
        {files.map((f, i) => (
          <FileCard
            key={i}
            file={f}
            commenting={commenting}
            findingLines={meta.get(f.path)?.findingLines}
            target={target}
            onJumpToLine={onJumpToLine}
          />
        ))}
      </div>
    );
  }

  // Smart order: one DiffGroupSection per SmartDiffGroup, in server order.
  const filesByPath = new Map(files.map((f) => [f.path, f]));
  const groupedPaths = new Set<string>();

  const sections = smartDiff.groups.map((g) => {
    const groupFiles = g.files
      .map((sdf) => filesByPath.get(sdf.path))
      .filter((f): f is PrFile => f != null);
    for (const f of groupFiles) groupedPaths.add(f.path);
    return (
      <DiffGroupSection
        key={g.role}
        role={g.role}
        files={groupFiles}
        meta={meta}
        commenting={commenting}
        target={target}
        onJumpToLine={onJumpToLine}
      />
    );
  });

  const leftovers = files.filter((f) => !groupedPaths.has(f.path));

  return (
    <div style={s.list}>
      {sections}
      {leftovers.length > 0 && (
        <DiffGroupSection
          role={null}
          files={leftovers}
          meta={meta}
          commenting={commenting}
          target={target}
          onJumpToLine={onJumpToLine}
          defaultOpen
        />
      )}
    </div>
  );
}
