/** Apply a search-param patch (null deletes) and return the query string
 *  without a leading "?" — "" when no params remain. */
export function patchedSearch(current: URLSearchParams, patch: Record<string, string | null>): string {
  const sp = new URLSearchParams(current.toString());
  for (const [k, v] of Object.entries(patch)) {
    if (v == null) sp.delete(k);
    else sp.set(k, v);
  }
  return sp.toString();
}

/** Opening a finding: switch to the runs tab, name the finding, and clear
 *  the severity filter — visibleFindings() would otherwise hide a target
 *  of a different severity. */
export const openFindingPatch = (findingId: string): Record<string, string | null> =>
  ({ tab: "findings", finding: findingId, severity: null });
