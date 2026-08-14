/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count, Smart Diff findings badge) and, when open, its parsed lines plus any
   outdated comments. Collapse seed is role-aware in Smart order (a boilerplate
   file always starts collapsed) and falls back to the original size rule
   otherwise — see docs/plans/2026-08-14-smart-diff.md S8. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import type { SmartDiffRole } from "@devdigest/shared";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";
import type { DiffLineTarget } from "../target";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export function FileCard({
  file,
  commenting,
  role,
  findingLines,
  target,
  onJumpToLine,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  role?: SmartDiffRole | null;
  findingLines?: number[];
  target?: DiffLineTarget | null;
  onJumpToLine?: (path: string, line: number) => void;
}) {
  const t = useTranslations("shell");
  // Role is checked first: a small boilerplate diff (e.g. a `+3 −1`
  // lock-file), far under AUTO_EXPAND_MAX_LINES, still starts collapsed. In
  // Original order `role` is undefined, so this degrades to today's rule.
  const [open, setOpen] = React.useState(() =>
    role === "boilerplate"
      ? false
      : (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES,
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const lineRef = React.useRef<HTMLDivElement | null>(null);
  const isTarget = !!target && target.path === file.path;
  const targetIndex = isTarget
    ? lines.findIndex((ln) => ln.kind !== "hunk" && ln.newNo === target!.line)
    : -1;

  React.useEffect(() => {
    if (isTarget) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTarget, target?.nonce]);

  React.useEffect(() => {
    if (!isTarget || !open) return;
    (lineRef.current ?? rootRef.current)?.scrollIntoView({ behavior: "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTarget, open, targetIndex, target?.nonce]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div ref={rootRef} style={s.fileCard}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
        {findingLines && findingLines.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const first = findingLines[0];
              if (first !== undefined) onJumpToLine?.(file.path, first);
            }}
            style={s.findingsBadge}
          >
            {t("diffViewer.findingsBadge", { count: findingLines.length })}
          </button>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                anchorRef={i === targetIndex ? lineRef : undefined}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
        </div>
      )}
    </div>
  );
}
