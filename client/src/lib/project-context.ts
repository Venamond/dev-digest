/* Pure logic for project context — shared by the agent editor's Context tab,
   the skill editor's Context tab and the Project Context page.

   It lives in `lib/` rather than in one of those feature folders because all
   three need it and a feature must not import another feature: the tabs have
   to agree on order, counts and the ceiling, and a second copy is where they
   would drift apart. `lib/` rather than `utils/` because these functions know
   this project's domain (search roots, attachment order, token estimates).

   Everything that decides ORDER, a COUNT or a TOTAL lives here rather than in
   the JSX: the sibling SkillsTab has no component test, and that is exactly
   how a broken drag-reorder shipped. */

import type { ContextDocEditorRow } from "@devdigest/shared";

/** Where a row sits: the owner's own list, inherited from a skill, or neither. */
export type RowKind = "attached" | "inherited" | "available";

/** Local draft row for a Context tab (before save). */
export interface ContextDraftRow {
  path: string;
  root: string;
  approxTokens: number;
  /** Agents reaching this document — the descriptor's own list, not a count. */
  usedBy: ContextDocEditorRow["doc"]["used_by"];
  attached: boolean;
  /** Position in the owner's own ordered list; -1 when not attached. */
  order: number;
  inheritedFrom: ContextDocEditorRow["inherited_from"];
  /** False when the document is attached but can no longer be read (AC-36). */
  readable: boolean;
}

export function toDraftRows(rows: ContextDocEditorRow[]): ContextDraftRow[] {
  return rows.map((r) => ({
    path: r.doc.path,
    root: r.doc.root,
    approxTokens: r.doc.approx_tokens,
    usedBy: r.doc.used_by,
    attached: r.attached,
    order: r.attached ? r.order : -1,
    inheritedFrom: r.inherited_from,
    readable: r.readable,
  }));
}

/**
 * A document attached directly AND inherited from a skill is ONE row of kind
 * `attached` — its own attachment decides its position, and it is therefore
 * counted exactly once everywhere below (AC-20, AC-34).
 */
export function rowKind(r: ContextDraftRow): RowKind {
  if (r.attached) return "attached";
  if (r.inheritedFrom.length > 0) return "inherited";
  return "available";
}

/**
 * The document's own containing folder, repository-relative. `specs/api.md`
 * yields `specs`, `docs/adr/0001.md` yields `docs/adr`. A file at the clone
 * root has no folder, so its search root is used as the label instead.
 *
 * Takes the structural shape rather than a named type, so a `SpecFile` and a
 * `ContextDraftRow` — which carry the same two fields — both pass.
 */
export function folderOf(doc: { path: string; root: string }): string {
  const cut = doc.path.lastIndexOf("/");
  return cut > 0 ? doc.path.slice(0, cut) : doc.root;
}

/** The document's file name, without its folders. */
export function fileNameOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut >= 0 ? path.slice(cut + 1) : path;
}

/** Client-side filter over path and root (AC-15). */
export function filterDraftRows(rows: ContextDraftRow[], q: string): ContextDraftRow[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter(
    (r) => r.path.toLowerCase().includes(needle) || r.root.toLowerCase().includes(needle),
  );
}

/**
 * Row paths in display order (AC-14): the owner's own attached documents first
 * in the human's order, then the inherited ones, then everything else grouped
 * by root and alphabetical within a root.
 *
 * The tab FREEZES this order instead of re-deriving it every render — attaching
 * a document moves it between groups, which would otherwise pull the row out
 * from under the pointer the moment it is ticked.
 */
export function displayOrderIds(rows: ContextDraftRow[]): string[] {
  const byRootThenPath = (a: ContextDraftRow, b: ContextDraftRow) =>
    a.root === b.root ? a.path.localeCompare(b.path) : a.root.localeCompare(b.root);
  return [
    ...rows.filter((r) => rowKind(r) === "attached").sort((a, b) => a.order - b.order),
    ...rows.filter((r) => rowKind(r) === "inherited").sort(byRootThenPath),
    ...rows.filter((r) => rowKind(r) === "available").sort(byRootThenPath),
  ].map((r) => r.path);
}

/**
 * Apply a frozen path order to the visible rows. Paths missing from the frozen
 * order (a document that appeared after the tab loaded) sort last, by path.
 */
export function applyDisplayOrder(rows: ContextDraftRow[], order: string[]): ContextDraftRow[] {
  const rank = new Map(order.map((p, i) => [p, i]));
  // A row the frozen order does not know — a document that appeared in the
  // repository after the tab loaded — is placed by its KIND, not dumped at the
  // end. Sending it to the bottom put a freshly ATTACHED document below fifty
  // unattached ones, which reads as "attaching did nothing" and breaks AC-14.
  const kindRank = (r: ContextDraftRow) =>
    rowKind(r) === "attached" ? 0 : rowKind(r) === "inherited" ? 1 : 2;
  return [...rows].sort((a, b) => {
    const ra = rank.get(a.path);
    const rb = rank.get(b.path);
    if (ra != null && rb != null) return ra - rb;
    // Both unknown: order them among themselves the way the list is grouped.
    if (ra == null && rb == null) {
      const byKind = kindRank(a) - kindRank(b);
      return byKind !== 0 ? byKind : a.path.localeCompare(b.path);
    }
    // One known, one not: the unknown one still respects the grouping — an
    // attached newcomer outranks a known unattached row, and only that.
    const unknown = ra == null ? a : b;
    const known = ra == null ? b : a;
    const byKind = kindRank(unknown) - kindRank(known);
    if (byKind !== 0) return ra == null ? byKind : -byKind;
    return ra == null ? 1 : -1;
  });
}

function reindexAttached(rows: ContextDraftRow[]): ContextDraftRow[] {
  const attached = rows.filter((r) => r.attached).sort((a, b) => a.order - b.order);
  const orderByPath = new Map(attached.map((r, i) => [r.path, i]));
  return rows.map((r) =>
    r.attached ? { ...r, order: orderByPath.get(r.path) ?? r.order } : { ...r, order: -1 },
  );
}

/**
 * Move an attached document one slot up or down within the attached set. This
 * is the pure move both the drag and the KEYBOARD controls drive — the sibling
 * SkillsTab has drag only, with an `aria-hidden` handle and no `onKeyDown`, so
 * the keyboard path here is new work rather than reuse.
 */
export function moveAttached(
  rows: ContextDraftRow[],
  path: string,
  dir: -1 | 1,
): ContextDraftRow[] {
  const attached = rows.filter((r) => r.attached).sort((a, b) => a.order - b.order);
  const idx = attached.findIndex((r) => r.path === path);
  if (idx < 0) return rows;
  const j = idx + dir;
  if (j < 0 || j >= attached.length) return rows;
  const next = [...attached];
  const tmp = next[idx]!;
  next[idx] = next[j]!;
  next[j] = tmp;
  const orderByPath = new Map(next.map((r, i) => [r.path, i]));
  return rows.map((r) => (r.attached ? { ...r, order: orderByPath.get(r.path) ?? r.order } : r));
}

/**
 * Move `dragPath` into `targetPath`'s slot among the attached documents.
 * Walks the DRAGGED row one adjacent swap at a time — `moveAttached` re-finds
 * its current index on each call, so naming any other row here would undo the
 * previous step and leave multi-position drags off by one.
 */
export function reorderAttached(
  rows: ContextDraftRow[],
  dragPath: string,
  targetPath: string,
): ContextDraftRow[] {
  if (dragPath === targetPath) return rows;
  const attached = rows.filter((r) => r.attached).sort((a, b) => a.order - b.order);
  const from = attached.findIndex((r) => r.path === dragPath);
  const to = attached.findIndex((r) => r.path === targetPath);
  if (from < 0 || to < 0) return rows;

  const dir = to > from ? 1 : -1;
  let next = rows;
  for (let i = from; i !== to; i += dir) {
    next = moveAttached(next, dragPath, dir);
  }
  return next;
}

/** Attach/detach; a newly attached document appends at the end of the list. */
export function toggleAttached(
  rows: ContextDraftRow[],
  path: string,
  attached: boolean,
): ContextDraftRow[] {
  const maxOrder = Math.max(-1, ...rows.filter((r) => r.attached).map((r) => r.order));
  const next = rows.map((r) => {
    if (r.path !== path) return r;
    return attached
      ? { ...r, attached: true, order: maxOrder + 1 }
      : { ...r, attached: false, order: -1 };
  });
  return reindexAttached(next);
}

/** Payload for POST /agents/:id/context and /skills/:id/context — paths only. */
export function toPathsPayload(rows: ContextDraftRow[]): string[] {
  return rows
    .filter((r) => r.attached)
    .sort((a, b) => a.order - b.order)
    .map((r) => r.path);
}

/** `N` of the `N of M attached` caption — over the rows passed in (AC-9). */
export function attachedCount(rows: ContextDraftRow[]): number {
  return rows.filter((r) => r.attached).length;
}

/**
 * Approximate tokens a run would inject: attached plus inherited (AC-18). A
 * document reached both ways is a single `attached` row, so it is summed once
 * by construction rather than by a de-duplication step that could be forgotten.
 */
export function injectedTokens(rows: ContextDraftRow[]): number {
  return rows
    .filter((r) => rowKind(r) !== "available")
    .reduce((sum, r) => sum + r.approxTokens, 0);
}

/**
 * Whether the injected total exceeds the ceiling (AC-24).
 *
 * `ceiling` has no default on purpose: it is a per-workspace setting the run
 * caps against, served with the rows as `token_ceiling`. A default here would
 * be a second source of truth, and the tab would quote a number a workspace
 * that overrode the setting does not run with.
 */
export function overCeiling(total: number, ceiling: number): boolean {
  return total > ceiling;
}

/** The order the grouped index lists roots in; anything else follows, sorted. */
const ROOT_ORDER = ["specs", "docs", "insights"];

/** One root's attached documents, for the skill editor's grouped index (AC-17). */
export interface AttachedGroup {
  root: string;
  paths: string[];
}

/**
 * Attached documents grouped by their search root, in the human's order within
 * a group. A root with nothing attached produces NO group — an empty heading
 * would claim the run sends a section it does not.
 *
 * This is an INDEX of what is attached, not the serialization: the block a run
 * actually sends is one `## Project context` with the documents in the human's
 * order, so grouping by root deliberately reorders them.
 */
export function groupAttachedByRoot(rows: ContextDraftRow[]): AttachedGroup[] {
  const byRoot = new Map<string, string[]>();
  for (const r of rows.filter((x) => x.attached).sort((a, b) => a.order - b.order)) {
    const list = byRoot.get(r.root);
    if (list) list.push(r.path);
    else byRoot.set(r.root, [r.path]);
  }
  const rank = (root: string) => {
    const i = ROOT_ORDER.indexOf(root);
    return i < 0 ? ROOT_ORDER.length : i;
  };
  return [...byRoot.entries()]
    .map(([root, paths]) => ({ root, paths }))
    .sort((a, b) =>
      rank(a.root) === rank(b.root) ? a.root.localeCompare(b.root) : rank(a.root) - rank(b.root),
    );
}

/**
 * Colour per search root, as mockup M5 draws them: `specs` blue, `docs` green,
 * `insights` amber. One map, used by both Context tabs and their preview
 * drawers, so a root never changes colour between two screens.
 *
 * Roots are configurable, so an unknown one falls back to neutral rather than
 * borrowing the meaning of a colour it was not assigned.
 */
export const ROOT_COLORS: Record<string, { text: string; bg: string }> = {
  specs: { text: "var(--accent-text)", bg: "var(--accent-bg)" },
  docs: { text: "var(--ok)", bg: "var(--ok-bg)" },
  insights: { text: "var(--warn)", bg: "var(--warn-bg)" },
};

const NEUTRAL_ROOT = { text: "var(--text-muted)", bg: "var(--bg-hover)" };

/** The colour for a root, neutral when it is not one of the three named ones. */
export function rootColor(root: string): { text: string; bg: string } {
  return ROOT_COLORS[root] ?? NEUTRAL_ROOT;
}

/**
 * Which move controls a row may actually offer. A control that cannot move
 * anything must not be drawn: the first attached row has no "up", the last has
 * no "down", and a lone attached document has neither.
 *
 * Reported 2026-08-23 as "there are buttons and they do not work" — which was
 * exactly right. Rendering an inert control tells the human the feature is
 * broken; the feature was fine, the affordance was a lie.
 */
export function movableDirs(
  rows: ContextDraftRow[],
  path: string,
): { up: boolean; down: boolean } {
  const attached = rows.filter((r) => r.attached).sort((a, b) => a.order - b.order);
  const idx = attached.findIndex((r) => r.path === path);
  if (idx < 0) return { up: false, down: false };
  return { up: idx > 0, down: idx < attached.length - 1 };
}

/**
 * Move `path` one position in the DISPLAYED order — any row, attached or not.
 *
 * The list is the human's: they arrange it, and the attached documents enter the
 * prompt in whatever relative order that arrangement gives them. Restricting the
 * move to the attached subset made a lone attached document unmovable in every
 * direction, which reads as a broken list (reported 2026-08-23).
 *
 * Returns the new display order, or the same array when the row is already at
 * the end it is being moved towards — the caller uses identity to skip a write.
 */
export function moveInOrder(order: string[], path: string, dir: -1 | 1): string[] {
  const idx = order.indexOf(path);
  if (idx < 0) return order;
  const j = idx + dir;
  if (j < 0 || j >= order.length) return order;
  const next = [...order];
  next[idx] = next[j]!;
  next[j] = path;
  return next;
}

/**
 * Re-derive each attached row's prompt order from the display order, so what a
 * run injects matches what the human sees, top to bottom.
 */
export function orderFromDisplay(rows: ContextDraftRow[], order: string[]): ContextDraftRow[] {
  const rank = new Map(order.map((p, i) => [p, i]));
  const attached = rows
    .filter((r) => r.attached)
    .sort((a, b) => (rank.get(a.path) ?? 0) - (rank.get(b.path) ?? 0));
  const promptOrder = new Map(attached.map((r, i) => [r.path, i]));
  return rows.map((r) => (r.attached ? { ...r, order: promptOrder.get(r.path) ?? r.order } : r));
}

/** Where a row sits in the displayed list — both ends of it are unmovable. */
export function movableInList(order: string[], path: string): { up: boolean; down: boolean } {
  const idx = order.indexOf(path);
  if (idx < 0) return { up: false, down: false };
  return { up: idx > 0, down: idx < order.length - 1 };
}

/**
 * Keep the frozen display order in step with the rows it orders.
 *
 * Positions already held are preserved — that is the whole point of freezing —
 * but a path the order has never seen is INSERTED rather than left out, and a
 * path whose document is gone is dropped. An order that omits a row is the bug
 * behind "the arrows disappeared but I can still drag it": the arrows ask this
 * array for a position and get −1, while the drag handler does not.
 */
export function reconcileOrder(rows: ContextDraftRow[], order: string[]): string[] {
  const present = new Set(rows.map((r) => r.path));
  const kept = order.filter((p) => present.has(p));
  if (kept.length === rows.length) return kept.length === order.length ? order : kept;

  const known = new Set(kept);
  const missing = rows.filter((r) => !known.has(r.path));
  if (missing.length === 0) return kept;

  // A newcomer lands with its own kind, not at the end — same rule as
  // `applyDisplayOrder`, so the two cannot disagree.
  const rank = (r: ContextDraftRow) =>
    rowKind(r) === "attached" ? 0 : rowKind(r) === "inherited" ? 1 : 2;
  const byPath = new Map(rows.map((r) => [r.path, r]));
  const out = [...kept];
  for (const r of missing.sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path))) {
    const at = out.findIndex((p) => {
      const other = byPath.get(p);
      return other != null && rank(other) > rank(r);
    });
    if (at < 0) out.push(r.path);
    else out.splice(at, 0, r.path);
  }
  return out;
}

/**
 * The injected total, split by where it comes from. One number cannot answer
 * both "how much did I choose" and "how much will this run send": a document a
 * SKILL contributes is injected without ever being ticked here, so an agent with
 * nothing selected can still carry thousands of tokens (reported 2026-08-23 —
 * "не выделено ни одного файла, но посчитано 4766 токенов").
 */
export function injectedBreakdown(rows: ContextDraftRow[]): {
  own: number;
  inherited: number;
  total: number;
} {
  let own = 0;
  let inherited = 0;
  for (const r of rows) {
    const kind = rowKind(r);
    if (kind === "attached") own += r.approxTokens;
    else if (kind === "inherited") inherited += r.approxTokens;
  }
  return { own, inherited, total: own + inherited };
}
