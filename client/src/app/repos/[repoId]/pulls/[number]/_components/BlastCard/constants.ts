/** Beyond this many nodes a mermaid `flowchart LR` stops being readable (and
 *  slow enough to freeze the tab), so the graph view is capped and the card
 *  says so rather than drawing an unusable hairball. */
export const MAX_GRAPH_NODES = 60;

/**
 * `BlastReason` → the i18n key that explains it to a human. Anything not
 * listed falls back to `degraded`; `no_data` and `index_stale` get their own
 * wording because they have their own fix (index the repo / re-index it).
 */
export const REASON_KEY: Record<string, string> = {
  no_data: "notIndexed",
  index_stale: "stale",
};

export const REASON_KEY_FALLBACK = "degraded";

/**
 * Kinds that read better with call parens — `rateLimit()` rather than
 * `rateLimit FUNCTION`. Anything else (interface, type, class, const) keeps
 * its bare name and shows its kind, because parens would be a lie about it.
 */
export const CALLABLE_KINDS = new Set(["function", "method", "arrow", "constructor"]);
