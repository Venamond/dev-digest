/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count, Smart Diff findings badge) and, when open, its parsed lines plus any
   outdated comments. Collapse seed is role-aware in Smart order (a boilerplate
   file always starts collapsed) and falls back to the original size rule
   otherwise. In Smart order a non-boilerplate file with findings starts
   open even when it exceeds AUTO_EXPAND_MAX_LINES. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import type { FindingRecord, SmartDiffRole } from "@devdigest/shared";
import { LARGE_FILE_CHANGED_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import { fileCardStartsOpen } from "./helpers";
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
  smart,
  findings,
  onOpenFinding,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  role?: SmartDiffRole | null;
  smart?: boolean;
  findings?: FindingRecord[];
  onOpenFinding?: (findingId: string) => void;
}) {
  const t = useTranslations("shell");
  // Boilerplate always starts collapsed. In Smart order a file with findings
  // starts open even when it is "large"; otherwise the size threshold applies.
  // userOpen is null until the header is clicked, so findings that arrive
  // after mount (Run Review finishing) still open the card.
  const changedLines = (file.additions ?? 0) + (file.deletions ?? 0);
  // Dismissed findings are "not a problem" — they must not inflate the badge
  // nor force a file open, same rule as ReviewRunAccordion's blocker count
  // (`ReviewRunAccordion.tsx:66`). Accepted ones still count: accepting a
  // finding acknowledges it, it does not retract it. The markers themselves
  // still render for both, dimmed (see FindingMarker).
  const activeFindings = React.useMemo(
    () => (findings ?? []).filter((f) => !f.dismissed_at),
    [findings],
  );
  const defaultOpen = fileCardStartsOpen({
    role,
    smart,
    changedLines,
    findingsCount: activeFindings.length,
  });
  const [userOpen, setUserOpen] = React.useState<boolean | null>(null);
  const open = userOpen ?? defaultOpen;
  const large = !!smart && changedLines > LARGE_FILE_CHANGED_LINES;
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  const findingsByLine = React.useMemo(() => {
    const m = new Map<number, FindingRecord[]>();
    for (const f of findings ?? []) {
      const list = m.get(f.start_line);
      if (list) list.push(f);
      else m.set(f.start_line, [f]);
    }
    return m;
  }, [findings]);

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
    <div style={s.fileCard(large)}>
      <div onClick={() => setUserOpen(!(userOpen ?? defaultOpen))} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {large && (
          <span style={s.largeChip} title={t("diffViewer.largeFileTitle", { count: changedLines })}>
            {t("diffViewer.largeFile")}
          </span>
        )}
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
        {activeFindings.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const first = activeFindings[0];
              if (first) onOpenFinding?.(first.id);
            }}
            style={s.findingsBadge}
          >
            {t("diffViewer.findingsBadge", { count: activeFindings.length })}
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
                findings={smart && ln.newNo != null ? findingsByLine.get(ln.newNo) : undefined}
                onOpenFinding={onOpenFinding}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
        </div>
      )}
    </div>
  );
}
