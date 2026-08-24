/**
 * Split a brief's `file:line` reference into its path and its line.
 *
 * Accepts the same suffix shapes the server's name set normalises:
 * `src/config.ts`, `src/config.ts:12` and `src/config.ts:12-18` — a range
 * targets its START line, which is where the reader wants to land.
 *
 * A reference with no path (`":12"`, `""`) yields an empty path; the caller
 * renders those as plain text rather than as a link that goes nowhere.
 */
export function parseFileRef(ref: string): { path: string; line: number | null } {
  const trimmed = (ref ?? "").trim();
  const m = /^(.*?):(\d+)(?:-\d+)?$/.exec(trimmed);
  if (!m) return { path: trimmed, line: null };
  return { path: m[1] ?? "", line: Number(m[2]) };
}

/** The Files-changed tab, targeted at one file and (optionally) one line. */
export function fileRefHref(
  repoId: string,
  prNumber: number,
  path: string,
  line: number | null,
): string {
  const lineParam = line != null ? `&line=${line}` : "";
  return `/repos/${repoId}/pulls/${prNumber}?tab=diff&file=${encodeURIComponent(path)}${lineParam}`;
}
