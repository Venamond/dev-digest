import type { AgentSkillEditorRow } from "@devdigest/shared";

/** Local draft row for the Skills tab (before save). */
export interface SkillDraftRow {
  skill_id: string;
  name: string;
  description: string;
  type: AgentSkillEditorRow["skill"]["type"];
  linked: boolean;
  enabled: boolean;
  /** Order among linked skills; unlinked keep -1 until linked. */
  order: number;
  /** Global skill kill-switch (read-only in this tab). */
  skillEnabled: boolean;
}

export function toDraftRows(rows: AgentSkillEditorRow[]): SkillDraftRow[] {
  return rows.map((r) => ({
    skill_id: r.skill.id,
    name: r.skill.name,
    description: r.skill.description,
    type: r.skill.type,
    linked: r.linked,
    enabled: r.enabled,
    order: r.order,
    skillEnabled: r.skill.enabled,
  }));
}

/** Linked+enabled count for the “N of M” caption. */
export function enabledCount(rows: SkillDraftRow[]): number {
  return rows.filter((r) => r.linked && r.enabled).length;
}

export function filterDraftRows(rows: SkillDraftRow[], q: string): SkillDraftRow[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter(
    (r) =>
      r.name.toLowerCase().includes(needle) ||
      r.description.toLowerCase().includes(needle) ||
      r.type.toLowerCase().includes(needle),
  );
}

/**
 * Row ids in display order: linked first by `order`, then unlinked by name.
 *
 * The tab freezes this order instead of re-deriving it every render — ticking
 * a checkbox links the skill, which would otherwise move the row from the
 * unlinked group up into the linked one, out from under the pointer.
 */
export function displayOrderIds(rows: SkillDraftRow[]): string[] {
  return [
    ...rows.filter((r) => r.linked).sort((a, b) => a.order - b.order),
    ...rows.filter((r) => !r.linked).sort((a, b) => a.name.localeCompare(b.name)),
  ].map((r) => r.skill_id);
}

/**
 * Apply a frozen id order to the visible rows. Ids missing from the frozen
 * order (a skill created after the tab loaded) sort last, by name.
 */
export function applyDisplayOrder(rows: SkillDraftRow[], order: string[]): SkillDraftRow[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  // A row the frozen order does not know — a skill created after the tab
  // loaded — is placed by whether it is LINKED, not dumped at the end. Sending
  // it to the bottom put a freshly linked skill below every unlinked one, which
  // reads as "linking did nothing". Same fix as `applyDisplayOrder` in
  // `@/lib/project-context`; the two lists must not diverge.
  return [...rows].sort((a, b) => {
    const ra = rank.get(a.skill_id);
    const rb = rank.get(b.skill_id);
    if (ra != null && rb != null) return ra - rb;
    if (ra == null && rb == null) {
      if (a.linked !== b.linked) return a.linked ? -1 : 1;
      return a.name.localeCompare(b.name);
    }
    const unknownLinked = (ra == null ? a : b).linked;
    const knownLinked = (ra == null ? b : a).linked;
    if (unknownLinked !== knownLinked) {
      return ra == null ? (unknownLinked ? -1 : 1) : knownLinked ? 1 : -1;
    }
    return ra == null ? 1 : -1;
  });
}

function reindexLinked(rows: SkillDraftRow[]): SkillDraftRow[] {
  const linked = rows.filter((r) => r.linked).sort((a, b) => a.order - b.order);
  const orderById = new Map(linked.map((r, i) => [r.skill_id, i]));
  return rows.map((r) =>
    r.linked ? { ...r, order: orderById.get(r.skill_id) ?? r.order } : { ...r, order: -1 },
  );
}

/** Move a linked skill up/down within the linked set. */
export function moveLinked(rows: SkillDraftRow[], skillId: string, dir: -1 | 1): SkillDraftRow[] {
  const linked = rows.filter((r) => r.linked).sort((a, b) => a.order - b.order);
  const idx = linked.findIndex((r) => r.skill_id === skillId);
  if (idx < 0) return rows;
  const j = idx + dir;
  if (j < 0 || j >= linked.length) return rows;
  const nextLinked = [...linked];
  const tmp = nextLinked[idx]!;
  nextLinked[idx] = nextLinked[j]!;
  nextLinked[j] = tmp;
  const orderById = new Map(nextLinked.map((r, i) => [r.skill_id, i]));
  return rows.map((r) =>
    r.linked ? { ...r, order: orderById.get(r.skill_id) ?? r.order } : r,
  );
}

/**
 * Move `dragId` to `targetId`'s slot among the linked skills (drag & drop).
 *
 * Walks the DRAGGED skill one adjacent swap at a time — `moveLinked` re-finds
 * its current index on each call, so naming any other row here would undo the
 * previous step and leave multi-position drags off by one.
 */
export function reorderLinked(
  rows: SkillDraftRow[],
  dragId: string,
  targetId: string,
): SkillDraftRow[] {
  if (dragId === targetId) return rows;
  const linked = rows.filter((r) => r.linked).sort((a, b) => a.order - b.order);
  const from = linked.findIndex((r) => r.skill_id === dragId);
  const to = linked.findIndex((r) => r.skill_id === targetId);
  if (from < 0 || to < 0) return rows;

  const dir = to > from ? 1 : -1;
  let next = rows;
  for (let i = from; i !== to; i += dir) {
    next = moveLinked(next, dragId, dir);
  }
  return next;
}

/** Toggle link; newly linked appends at end with enabled=true. */
export function toggleLinked(rows: SkillDraftRow[], skillId: string, linked: boolean): SkillDraftRow[] {
  const maxOrder = Math.max(-1, ...rows.filter((r) => r.linked).map((r) => r.order));
  const next = rows.map((r) => {
    if (r.skill_id !== skillId) return r;
    if (linked) return { ...r, linked: true, enabled: true, order: maxOrder + 1 };
    return { ...r, linked: false, enabled: false, order: -1 };
  });
  return reindexLinked(next);
}

/** Per-agent enabled checkbox; enabling an unlinked skill also links it. */
export function toggleEnabled(rows: SkillDraftRow[], skillId: string, enabled: boolean): SkillDraftRow[] {
  const maxOrder = Math.max(-1, ...rows.filter((r) => r.linked).map((r) => r.order));
  const next = rows.map((r) => {
    if (r.skill_id !== skillId) return r;
    if (enabled && !r.linked) {
      return { ...r, linked: true, enabled: true, order: maxOrder + 1 };
    }
    return { ...r, enabled };
  });
  return reindexLinked(next);
}

/** Payload for POST /agents/:id/skills — only linked rows. */
export function toLinksPayload(rows: SkillDraftRow[]): Array<{
  skill_id: string;
  order: number;
  enabled: boolean;
}> {
  return rows
    .filter((r) => r.linked)
    .sort((a, b) => a.order - b.order)
    .map((r, order) => ({ skill_id: r.skill_id, order, enabled: r.enabled }));
}
