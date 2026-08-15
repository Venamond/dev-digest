/** Constants for the DiffViewer. */

/** Files with this many or fewer changed lines start expanded. */
export const AUTO_EXPAND_MAX_LINES = 200;

/** A file whose changed-line count (additions + deletions) exceeds this is
 *  highlighted in Smart order. Deliberately above AUTO_EXPAND_MAX_LINES so
 *  a highlighted file is always also collapsed, never the reverse. */
export const LARGE_FILE_CHANGED_LINES = 300;

/** Matches a unified-diff hunk header, e.g. `@@ -1,2 +1,3 @@`. */
export const HUNK_HEADER_RE = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Duplicated from _components/FindingCard/constants.ts — a shared
 *  component may not import from a feature folder. Keep in step. */
export const MARKER_SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: "var(--crit)", WARNING: "var(--warn)",
  SUGGESTION: "var(--sugg)", INFO: "var(--info)",
};
export const MARKER_SEVERITY_COLOR_FALLBACK = "var(--text-muted)";
