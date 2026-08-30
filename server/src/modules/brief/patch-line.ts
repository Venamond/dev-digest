/**
 * The one thing the brief reads out of `pr_files.patch`: the first changed line
 * of a file, on the HEAD side.
 *
 * Ring 0 — pure, and deliberately a leaf with no imports at all. It lives here
 * rather than in `focus-lines.ts` because `gather.ts` is its caller and
 * `focus-lines.ts` already imports `gather.ts` for `BriefFinding` — the two
 * together would be a cycle `pnpm arch:check` rejects.
 *
 * Reading a patch SERVER-SIDE is not what AC-2 restricts: AC-2 forbids sending
 * hunk bodies to the model, and this function's result is a number that never
 * enters the prompt (see `gather.ts:RawBriefInputs.changedFileLines`).
 */

/**
 * `@@ -oldStart[,oldLines] +newStart[,newLines] @@` — the only part of a patch
 * this module reads. `newStart` is relative to the pull request HEAD, which is
 * the side the Files changed tab numbers.
 */
const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/m;

/**
 * The first changed line of a file, or `null`.
 *
 * `pr_files.patch` is nullable free text: GitHub omits it for a binary file,
 * and a row seeded by hand may hold anything at all. Every shape that is not a
 * hunk header resolves to `null` rather than throwing — a file whose line
 * cannot be determined keeps no line, which is an outcome the caller already
 * handles.
 */
export function firstChangedLine(patch: string | null | undefined): number | null {
  if (!patch) return null;
  const match = HUNK_HEADER.exec(patch);
  if (!match?.[1]) return null;
  const line = Number(match[1]);
  // A `+0` start is what git writes for a deleted file: no line on the new
  // side exists to open.
  return Number.isFinite(line) && line > 0 ? line : null;
}
