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
