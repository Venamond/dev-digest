/**
 * Which repository documents the brief may quote, and which lines of them.
 *
 * Ring 1, and deterministic: no model call, no clone walk, no database. The
 * candidate list arrives already restricted to markdown under the workspace's
 * configured roots (`ContextService.listDocs`); this file neither re-implements
 * that walk nor imports `context/walk.ts`.
 *
 * The output is the ONLY document text that may reach the model — a whole
 * document is never returned (AC-4).
 */

/** Up to `FRAGMENT_CONTEXT` lines either side of the line naming a changed file. */
const FRAGMENT_CONTEXT = 3;
/** At most 3 documents (AC-4). */
const MAX_DOCUMENTS = 3;
/** At most 3 fragments per document (AC-4). */
const MAX_FRAGMENTS_PER_DOCUMENT = 3;

const MARKDOWN_SUFFIX = /\.md$/i;
const FIRST_H1 = /^#\s+(.+?)\s*$/;

export interface DocumentFragment {
  path: string;
  title: string;
  lines: string[];
}

export interface SelectedDocument {
  path: string;
  title: string;
  fragments: DocumentFragment[];
}

/**
 * Pick at most 3 documents that literally mention a changed file, and at most
 * 3 windows of lines from each.
 *
 * Relevance (AC-3) is a literal containment test on the document's TEXT against
 * the repository-relative path as `pr_files.path` spells it. A document that
 * this pull request happens to EDIT is not relevant on that ground alone —
 * there is deliberately no `changedPaths.includes(doc.path)` here.
 *
 * `read` returning `undefined` (unreadable, or not valid UTF-8) means the
 * document contributes nothing; it is never an error, and zero documents is a
 * normal result (AC-33).
 */
export async function selectDocuments(
  docs: readonly { path: string }[],
  changedPaths: readonly string[],
  read: (path: string) => Promise<string | undefined>,
): Promise<SelectedDocument[]> {
  // Nothing can be relevant when the pull request changes no files.
  if (changedPaths.length === 0) return [];

  const selected: SelectedDocument[] = [];
  // Document order is the order `listDocs` returned — roots keep their
  // configured order and paths are stable within a root — so the same PR state
  // always selects the same three.
  for (const doc of docs) {
    if (selected.length >= MAX_DOCUMENTS) break;
    const content = await read(doc.path);
    if (!content) continue;

    const lines = content.split('\n');
    const hits = mentionLines(lines, changedPaths);
    if (hits.length === 0) continue;

    const title = titleOf(lines, doc.path);
    const fragments = mergeWindows(hits, lines.length)
      .slice(0, MAX_FRAGMENTS_PER_DOCUMENT)
      .map((w) => ({ path: doc.path, title, lines: lines.slice(w.start, w.end + 1) }));

    selected.push({ path: doc.path, title, fragments });
  }
  return selected;
}

/** Indices of the lines that name at least one changed file, ascending. */
function mentionLines(lines: readonly string[], changedPaths: readonly string[]): number[] {
  const hits: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (changedPaths.some((p) => p.length > 0 && line.includes(p))) hits.push(i);
  }
  return hits;
}

/**
 * One window per mention, overlapping windows merged.
 *
 * Merging happens BEFORE the 3-fragment cap, so a document mentioning a file
 * twice two lines apart spends one fragment, not two — otherwise the cap would
 * be consumed by near-duplicates of the same passage.
 */
function mergeWindows(hits: readonly number[], lineCount: number): { start: number; end: number }[] {
  const merged: { start: number; end: number }[] = [];
  for (const hit of hits) {
    const start = Math.max(0, hit - FRAGMENT_CONTEXT);
    const end = Math.min(lineCount - 1, hit + FRAGMENT_CONTEXT);
    const last = merged[merged.length - 1];
    if (last && start <= last.end) {
      last.end = Math.max(last.end, end);
      continue;
    }
    merged.push({ start, end });
  }
  return merged;
}

/** The first `# ` heading, else the basename without its `.md` extension. */
function titleOf(lines: readonly string[], path: string): string {
  for (const line of lines) {
    const m = FIRST_H1.exec(line);
    if (m?.[1]) return m[1];
  }
  return (path.split('/').pop() ?? path).replace(MARKDOWN_SUFFIX, '');
}
