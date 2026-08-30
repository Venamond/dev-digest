import type { EvalSkillCaseFiles } from '@devdigest/shared';

/**
 * Ring 0 — build a unified diff from a skill case's authored `Before`/`After`
 * file contents. A skill case's diff is GENERATED, never pasted, so the case
 * editor's preview and the bytes stored in `input_diff` are the same bytes and
 * one round-trip test covers both.
 *
 * The output format is dictated by `parseUnifiedDiff`
 * (`server/src/adapters/git/diff-parser.ts`), which is what will read it back:
 *   - it takes the path from the `+++` line and ignores `---` entirely, so
 *     `+++ b/<path>` always carries the real path, new file or not;
 *   - it drops any file whose path is empty, and
 *   - **it ignores every line until it has seen a `@@` header**, so a diff
 *     without a hunk header parses to nothing rather than to something wrong.
 * There is no existing builder to borrow: `diffBodies`
 * (`modules/skills/helpers.ts:210-226`) emits bare ` `/`-`/`+` lines with no
 * `diff --git`, no `---`/`+++` and no `@@`, which that parser cannot read.
 */

/** Context lines kept either side of a change — git's own default. */
const CONTEXT = 3;

/**
 * Above this the LCS table stops being worth its memory. An eval case holds an
 * authored snippet, not a repository, so the fallback (delete everything, add
 * everything) is a correct diff for the only inputs that can reach it.
 */
const MAX_DP_CELLS = 250_000;

type OpKind = ' ' | '-' | '+';

interface Op {
  kind: OpKind;
  text: string;
}

/**
 * Split a file body into lines. One trailing newline is dropped so that
 * `"a\nb\n"` and `"a\nb"` are the same two lines — the difference between them
 * is not a change a reviewer can act on, and representing it would require the
 * `\ No newline at end of file` marker, which `parseUnifiedDiff` would read as
 * a context line and let it consume a new-side line number that does not exist.
 */
function toLines(body: string): string[] {
  if (body === '') return [];
  const trimmed = body.endsWith('\n') ? body.slice(0, -1) : body;
  return trimmed.split('\n');
}

/** Longest-common-subsequence line diff — deterministic, dependency-free. */
function diffLines(before: string[], after: string[]): Op[] {
  const n = before.length;
  const m = after.length;
  if (n * m > MAX_DP_CELLS) {
    return [
      ...before.map((text): Op => ({ kind: '-', text })),
      ...after.map((text): Op => ({ kind: '+', text })),
    ];
  }

  // dp[i][j] = LCS length of before[i..] and after[j..].
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] =
        before[i] === after[j]
          ? dp[i + 1]![j + 1]! + 1
          : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      ops.push({ kind: ' ', text: before[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ops.push({ kind: '-', text: before[i]! });
      i++;
    } else {
      ops.push({ kind: '+', text: after[j]! });
      j++;
    }
  }
  while (i < n) ops.push({ kind: '-', text: before[i++]! });
  while (j < m) ops.push({ kind: '+', text: after[j++]! });
  return ops;
}

/** Index ranges of `ops` that make up one hunk, changes padded by `CONTEXT`. */
function hunkRanges(ops: Op[]): { start: number; end: number }[] {
  const changed: number[] = [];
  ops.forEach((op, idx) => {
    if (op.kind !== ' ') changed.push(idx);
  });
  if (changed.length === 0) return [];

  const ranges: { start: number; end: number }[] = [];
  for (const idx of changed) {
    const start = Math.max(0, idx - CONTEXT);
    const end = Math.min(ops.length - 1, idx + CONTEXT);
    const last = ranges[ranges.length - 1];
    // Adjacent or overlapping windows become one hunk, exactly as git merges
    // them — two `@@` headers describing touching regions is not valid output.
    if (last && start <= last.end + 1) last.end = Math.max(last.end, end);
    else ranges.push({ start, end });
  }
  return ranges;
}

/**
 * `buildUnifiedDiff` returns `''` when `before` and `after` are the same. That
 * is deliberate: a `diff --git` header with no `@@` would parse back to a file
 * with zero hunks, and the caller could not tell it from a real one. An empty
 * string parses to zero files, which is what "this case can never run" means —
 * the service refuses to save it.
 */
export function buildUnifiedDiff(input: EvalSkillCaseFiles): string {
  const path = input.path;
  // A new file has no old side, whatever `before` happens to hold — otherwise a
  // half-filled `Before` box on the `New file` tab would emit deletions from a
  // file that does not exist yet.
  const before = input.mode === 'new' ? [] : toLines(input.before);
  const after = toLines(input.after);

  const ops = diffLines(before, after);
  const ranges = hunkRanges(ops);
  if (ranges.length === 0) return '';

  const lines: string[] = [
    `diff --git a/${path} b/${path}`,
    input.mode === 'new' ? '--- /dev/null' : `--- a/${path}`,
    // The parser reads the path from HERE and nowhere else, so it always
    // carries the real path — `/dev/null` on this line would drop the file.
    `+++ b/${path}`,
  ];

  for (const range of ranges) {
    const slice = ops.slice(range.start, range.end + 1);
    const prefix = ops.slice(0, range.start);
    const oldBefore = prefix.filter((o) => o.kind !== '+').length;
    const newBefore = prefix.filter((o) => o.kind !== '-').length;
    const oldLines = slice.filter((o) => o.kind !== '+').length;
    const newLines = slice.filter((o) => o.kind !== '-').length;
    // A hunk that adds to an empty side starts AT the count, not after it —
    // `@@ -0,0 +1,3 @@` for a new file, which is git's own spelling.
    const oldStart = oldLines === 0 ? oldBefore : oldBefore + 1;
    const newStart = newLines === 0 ? newBefore : newBefore + 1;
    lines.push(`@@ -${oldStart},${oldLines} +${newStart},${newLines} @@`);
    for (const op of slice) lines.push(`${op.kind}${op.text}`);
  }

  // NO trailing newline. `parseUnifiedDiff` splits the raw text on `\n` and
  // treats anything that is not a `+`/`-`/header line as a CONTEXT line, so a
  // final empty element would consume one more new-side line number than the
  // file has — a phantom line a finding could then ground itself on.
  return lines.join('\n');
}
