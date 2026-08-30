import type { ReviewFocusItem } from '@devdigest/shared';
import type { BriefFinding } from './gather.js';

/**
 * AC-40: the line a review-focus row opens its file at.
 *
 * Ring 0 — pure. The line has TWO head-relative sources, tried in this order:
 *
 *  1. a finding of this pull request's finished review run (AC-5) — a finding
 *     points at the actual problem, so it wins;
 *  2. otherwise the first changed line of the file, parsed from the `+c` of the
 *     first hunk header of its `pr_files.patch` by `patch-line.ts` and handed
 *     over in `changedFileLines`. Reading the patch SERVER-SIDE is not what
 *     AC-2 restricts: AC-2 forbids sending hunk bodies to the model, and
 *     nothing here travels into the prompt.
 *
 * Both are optional: a pull request with no finished run and no stored patch
 * yields no lines at all, and that is a normal outcome — never an error, never
 * a logged warning. Such a row still renders and still links to its file.
 *
 * The model is never asked for a line (AC-2 keeps every hunk body out of its
 * input, so a line from the model could only be invented — what AC-9/AC-10
 * exist to reject), and the blast map cannot supply one either, its `file:line`
 * values being relative to the INDEXED commit rather than to the head the Files
 * changed tab renders.
 */

/**
 * Severity BEFORE position, because the review-focus list exists to lead the
 * reviewer to the worst thing in a file, not to the earliest thing in it. A
 * severity outside the enum ranks last rather than throwing: `BriefFinding`
 * carries the column's raw string, and a row this file cannot classify must
 * still not outrank one it can.
 */
const SEVERITY_RANK: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
};
const UNRANKED = 3;

function rank(severity: string): number {
  return SEVERITY_RANK[severity] ?? UNRANKED;
}

/**
 * The path half of a `file_ref`. The model is told to name a file, but the
 * name set accepts `src/a.ts:12` and `src/a.ts:12-18` too
 * (`_shared/name-set.ts:normaliseSpan`), so a trailing line suffix is stripped
 * before the file is matched against the findings.
 */
function refPath(fileRef: string): string {
  return fileRef.trim().replace(/:\d+(?:-\d+)?$/, '');
}

/**
 * Attach a line to every entry whose file a finding or a changed-file line
 * names; leave the others exactly as the model returned them, with no `line`
 * key at all.
 *
 * Called AFTER the response is accepted — after the grounding check of
 * AC-9/AC-10, never before: a rejected response is not a brief and gets no
 * lines attached to it.
 *
 * `changedFileLines` maps a changed path to its first changed line, as
 * `gather` computed it from `pr_files.patch`. It is server-side data and stays
 * that way: it reaches this function and the rendered card, never the prompt.
 */
export function attachFocusLines(
  focus: ReviewFocusItem[],
  findings: BriefFinding[],
  changedFileLines: Record<string, number> = {},
): ReviewFocusItem[] {
  return focus.map((item) => {
    const path = refPath(item.file_ref);
    if (!path) return item;
    let best: BriefFinding | null = null;
    for (const finding of findings) {
      if (finding.file !== path) continue;
      if (
        best === null ||
        rank(finding.severity) < rank(best.severity) ||
        (rank(finding.severity) === rank(best.severity) && finding.start_line < best.start_line)
      ) {
        best = finding;
      }
    }
    if (best !== null) return { ...item, line: best.start_line };
    const changed = changedFileLines[path];
    return changed === undefined ? item : { ...item, line: changed };
  });
}

/**
 * Drop repeated entries, keeping the first occurrence of each file reference.
 *
 * The model returns `review_focus` ordered most important first (AC-11), so the
 * first mention of a file is its highest-priority one and the rest are noise:
 * a list headed "read these first" that names one file twice tells the reviewer
 * nothing the first row did not. Seen 2026-08-24 on a two-file pull request
 * whose focus list named `server/src/modules/settings/service.ts` twice.
 *
 * Comparison is on the reference exactly as returned — two spellings of one
 * path are two entries, because collapsing them would need a normaliser that
 * could just as easily merge two genuinely different files.
 */
export function dedupeFocus(focus: ReviewFocusItem[]): ReviewFocusItem[] {
  const seen = new Set<string>();
  return focus.filter((item) => {
    if (seen.has(item.file_ref)) return false;
    seen.add(item.file_ref);
    return true;
  });
}
