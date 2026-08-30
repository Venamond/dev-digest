/* Pure helpers for ProjectContextView. Kept out of the JSX so they are testable.

   `folderOf` and `fileNameOf` are NOT here: both editor tabs need the same two
   functions, so they live in `@/lib/project-context` with the rest of the
   project-context logic. */

import type { SpecFile } from "@devdigest/shared";

/**
 * Combined approximate token total over the documents PASSED IN — always the
 * array the footer is rendered beside, never a number re-asked of the payload,
 * so the counter cannot drift from the list above it.
 */
export function totalTokens(docs: ReadonlyArray<Pick<SpecFile, "approx_tokens">>): number {
  return docs.reduce((sum, d) => sum + d.approx_tokens, 0);
}

/**
 * COVERAGE (mockup M1's ring): the share of the workspace's ENABLED agents that
 * read this document — directly, or through a skill they have enabled.
 *
 * `used` is the length of the document's own `used_by` list, so the ring and
 * the `Used by N agents` label beside it are derived from the same array and
 * cannot disagree. With no enabled agents there is nothing to be a share OF,
 * so the ring reads 0 rather than dividing by zero.
 */
export function coveragePercent(used: number, enabledAgents: number): number {
  if (enabledAgents <= 0) return 0;
  return Math.min(100, Math.round((used / enabledAgents) * 100));
}

/**
 * Display order for the rail: alphabetically by the FILE NAME, which is what the
 * row actually shows. Case-insensitive, and ties fall back to the full path so
 * the order is stable — six `README.md` files land together, in a fixed and
 * predictable sequence rather than whatever the server happened to return.
 */
export function byName(a: { path: string }, b: { path: string }): number {
  const nameOf = (p: string) => p.slice(p.lastIndexOf("/") + 1).toLowerCase();
  const an = nameOf(a.path);
  const bn = nameOf(b.path);
  if (an !== bn) return an < bn ? -1 : 1;
  const ap = a.path.toLowerCase();
  const bp = b.path.toLowerCase();
  return ap === bp ? 0 : ap < bp ? -1 : 1;
}

/**
 * How long ago the most recently touched document changed — M1's `last 5m ago`
 * beside the totals. `null` when no document reports a time, which is the case
 * for an attachment whose file has gone.
 *
 * `now` is a parameter so the result is testable without freezing the clock.
 */
export function freshestAgo(
  docs: ReadonlyArray<{ updated_at?: string | null }>,
  now: number,
): string | null {
  let newest = 0;
  for (const d of docs) {
    const at = d.updated_at ? Date.parse(d.updated_at) : NaN;
    if (!Number.isNaN(at) && at > newest) newest = at;
  }
  if (newest === 0) return null;
  const mins = Math.max(0, Math.round((now - newest) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
