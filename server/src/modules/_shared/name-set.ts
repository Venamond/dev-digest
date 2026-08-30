/**
 * The deterministic name set, and the grounding check that reads it.
 *
 * Ring 0: pure string work, no imports at all. Shared because two features now
 * ground model output against a set of names the server computed — `modules/blast`
 * (a summary paragraph) and `modules/brief` (structured `file_refs`). It lived
 * inside `blast/summary.ts` until the second consumer appeared; a second COPY
 * would drift, and the drift only shows against a real LLM
 * (`server/INSIGHTS.md:551-568` records that exact failure for a predicate that
 * existed in three copies).
 *
 * Everything here has already failed CLOSED twice — a correct model answer
 * turned into a 422 whose only symptom was a dead button (`server/INSIGHTS.md:14-30`).
 * The rule that came out of it: enumerate what a model writing naturally
 * produces from the data it was handed, or the guard spends its life rejecting
 * truth. Do not tighten any of this without a case that proves it lets a
 * hallucination through.
 */

/**
 * Add a path to the set, and its segments too — not just the whole string.
 *
 * `client/.../SettingsModels/SettingsModels.tsx` legitimately lets the model
 * write `SettingsModels`: that name is in the map, character for character,
 * just not as a standalone entry. Rejecting it made a correct summary a 422,
 * which is the validator being stricter than the instruction it enforces.
 * Segments of one or two characters are dropped: they match noise.
 */
export function addPath(path: string, into: Set<string>): void {
  into.add(path);
  for (const seg of path.split('/')) {
    if (seg.length > 2) into.add(seg);
    const bare = seg.replace(/\.[a-z0-9]+$/i, '');
    if (bare.length > 2) into.add(bare);
  }
}

/**
 * Normalise a quoted span to the bare name the set stores.
 *
 * The prompt tells the model to backtick every name, and a model writing
 * naturally produces `rateLimit()` for a function and `src/a.ts:23` for a call
 * site. The set holds bare names and bare paths, so checking the raw span
 * rejected correct output. Strip a trailing call suffix and a trailing
 * `:line` / `:line-line` before comparing.
 */
export function normaliseSpan(span: string): string {
  return span
    .trim()
    .replace(/\(\s*\)$/, '')
    .replace(/:\d+(?:-\d+)?$/, '')
    .trim();
}

/** Backtick-quoted spans, the only thing the prose check looks at. */
const BACKTICKED = /`([^`\n]+)`/g;

/**
 * Does `raw` name a DIRECTORY that really prefixes a path in the set?
 *
 * The set holds file paths plus their segments, so a directory the model lifted
 * out of the paths it was handed — `mcp/src/tools/`, `.claude/` — matches
 * nothing and turned a factually correct brief into a 422
 * (`server/INSIGHTS.md`, Recurring Errors & Fixes, 2026-08-24). The trailing
 * slash is optional because the model writes it both ways.
 *
 * Narrow on purpose: the candidate must prefix a real path AT A SEGMENT
 * BOUNDARY. `src/mw` does not pass for `src/mw.ts`, and an invented directory
 * prefixes nothing, so the guard still rejects a hallucination.
 */
function prefixesRealPath(raw: string, nodes: Set<string>): boolean {
  const dir = raw.endsWith('/') ? raw.slice(0, -1) : raw;
  if (dir.length === 0) return false;
  const withSlash = `${dir}/`;
  for (const node of nodes) {
    if (node.startsWith(withSlash)) return true;
  }
  return false;
}

/**
 * The same name with a leading dot on its LAST segment, or `null` when there is
 * no dot to add.
 *
 * The model wrote `dependency-cruiser.cjs`; the file is
 * `server/.dependency-cruiser.cjs`, and the segment stored in the set carries
 * the dot, so the dotless spelling missed. Only the dot differs — the caller
 * still requires the dotted form to be in the set (or to prefix a real path),
 * so this admits a spelling of a real name, never a new name.
 */
function withLeadingDot(raw: string): string | null {
  const bare = raw.endsWith('/') ? raw.slice(0, -1) : raw;
  const cut = bare.lastIndexOf('/');
  const last = bare.slice(cut + 1);
  if (last.length === 0 || last.startsWith('.')) return null;
  return `${bare.slice(0, cut + 1)}.${last}`;
}

/**
 * The membership test both checks below share.
 *
 * A name is grounded when it — as written, or normalised, or with a leading dot
 * restored on its last segment — either IS a name in the set or is a directory
 * prefix of a real path in it. Each admitted form is checked against the set,
 * so nothing passes that the server did not actually hand the model.
 */
function isGrounded(raw: string, nodes: Set<string>): boolean {
  for (const form of [raw, normaliseSpan(raw)]) {
    if (nodes.has(form)) return true;
    if (prefixesRealPath(form, nodes)) return true;
    const dotted = withLeadingDot(form);
    if (dotted !== null && (nodes.has(dotted) || prefixesRealPath(dotted, nodes))) return true;
  }
  return false;
}

/**
 * Every backtick-quoted span in `text` must name something in `nodes`.
 * Checking only backticked spans is deliberate: the system prompt instructs
 * the model to backtick every name it uses, which makes the check cheap and
 * complete for what it promises. Free-text scanning would flag ordinary
 * English words containing a dot or a slash.
 *
 * Returns the offending spans (as written, so the error names what the model
 * actually said); an empty array means the text is grounded.
 */
export function ungroundedNodes(text: string, nodes: Set<string>): string[] {
  const bad: string[] = [];
  for (const match of text.matchAll(BACKTICKED)) {
    const raw = (match[1] ?? '').trim();
    if (raw.length === 0) continue;
    if (normaliseSpan(raw).length === 0) continue;
    if (isGrounded(raw, nodes)) continue;
    if (!bad.includes(raw)) bad.push(raw);
  }
  return bad;
}

/**
 * The same membership test applied to an explicit list of references rather
 * than to prose.
 *
 * Structured fields — a brief's `file_refs[]` and `review_focus[].file_ref` —
 * carry no backticks, so `ungroundedNodes` would scan them and find nothing to
 * check, i.e. pass everything. Returns the offending refs as written; an empty
 * array means every ref is grounded.
 */
export function ungroundedNames(refs: string[], nodes: Set<string>): string[] {
  const bad: string[] = [];
  for (const ref of refs) {
    const raw = ref.trim();
    if (raw.length === 0) continue;
    if (normaliseSpan(raw).length === 0) continue;
    if (isGrounded(raw, nodes)) continue;
    if (!bad.includes(raw)) bad.push(raw);
  }
  return bad;
}
