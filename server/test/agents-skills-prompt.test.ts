import { describe, it, expect } from 'vitest';
import { buildEditorRows, promptSkillBodies, promptSkillRefs } from '../src/modules/agents/helpers.js';
import type { SkillRow } from '../src/db/rows.js';

/** Minimal skill row for pure helper tests (only fields helpers read). */
function skill(partial: Partial<SkillRow> & Pick<SkillRow, 'id' | 'name' | 'body' | 'enabled'>): SkillRow {
  return {
    workspaceId: 'ws',
    description: '',
    type: 'rubric',
    source: 'manual',
    version: 1,
    evidenceFiles: null,
    createdAt: new Date(),
    ...partial,
  };
}

describe('promptSkillBodies', () => {
  it('includes only skills where both global and per-agent enabled are true, in link order', () => {
    const a = skill({ id: 'a', name: 'a', body: 'BODY_A', enabled: true });
    const b = skill({ id: 'b', name: 'b', body: 'BODY_B', enabled: true });
    const c = skill({ id: 'c', name: 'c', body: 'BODY_C', enabled: false });
    const d = skill({ id: 'd', name: 'd', body: 'BODY_D', enabled: true });

    const bodies = promptSkillBodies([
      { skill: a, order: 1, enabled: true },
      { skill: b, order: 0, enabled: false }, // per-agent off
      { skill: c, order: 2, enabled: true }, // global off
      { skill: d, order: 3, enabled: true },
    ]);

    // Caller (repository) sorts by order; helper preserves input order.
    // With unsorted input we still filter correctly — only A and D.
    expect(bodies).toEqual(['BODY_A', 'BODY_D']);
  });

  it('returns empty when nothing is doubly-enabled', () => {
    expect(
      promptSkillBodies([
        { skill: skill({ id: 'x', name: 'x', body: 'X', enabled: false }), order: 0, enabled: true },
        { skill: skill({ id: 'y', name: 'y', body: 'Y', enabled: true }), order: 1, enabled: false },
      ]),
    ).toEqual([]);
  });
});

describe('promptSkillRefs', () => {
  it('returns skillId and skillVersion for doubly-enabled links, preserving order ASC', () => {
    const a = skill({ id: 'a', name: 'a', body: 'BODY_A', enabled: true, version: 2 });
    const b = skill({ id: 'b', name: 'b', body: 'BODY_B', enabled: true, version: 3 });
    const c = skill({ id: 'c', name: 'c', body: 'BODY_C', enabled: false, version: 1 });
    const d = skill({ id: 'd', name: 'd', body: 'BODY_D', enabled: true, version: 5 });

    // linkedSkills returns rows sorted by order ASC; helper preserves that order.
    const refs = promptSkillRefs([
      { skill: b, order: 0, enabled: false },
      { skill: a, order: 1, enabled: true },
      { skill: c, order: 2, enabled: true },
      { skill: d, order: 3, enabled: true },
    ]);

    expect(refs).toEqual([
      { skillId: 'a', skillVersion: 2 },
      { skillId: 'd', skillVersion: 5 },
    ]);
  });

  it('returns empty when nothing is doubly-enabled', () => {
    expect(
      promptSkillRefs([
        { skill: skill({ id: 'x', name: 'x', body: 'X', enabled: false }), order: 0, enabled: true },
        { skill: skill({ id: 'y', name: 'y', body: 'Y', enabled: true }), order: 1, enabled: false },
      ]),
    ).toEqual([]);
  });
});

describe('buildEditorRows', () => {
  it('marks linked skills and sorts linked-by-order then unlinked-by-name', () => {
    const zebra = skill({ id: 'z', name: 'zebra', body: 'Z', enabled: true });
    const alpha = skill({ id: 'a', name: 'alpha', body: 'A', enabled: true });
    const mid = skill({ id: 'm', name: 'mid', body: 'M', enabled: true });

    const rows = buildEditorRows(
      [zebra, alpha, mid],
      [
        { skill: mid, order: 1, enabled: true },
        { skill: zebra, order: 0, enabled: false },
      ],
    );

    expect(rows.map((r) => r.skill.name)).toEqual(['zebra', 'mid', 'alpha']);
    expect(rows[0]).toMatchObject({ linked: true, enabled: false, order: 0 });
    expect(rows[1]).toMatchObject({ linked: true, enabled: true, order: 1 });
    expect(rows[2]).toMatchObject({ linked: false, enabled: false, order: -1 });
  });
});
