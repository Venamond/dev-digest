/**
 * S8 — `modules/context/resolve.ts`, the effective-document resolver.
 *
 * Hermetic by construction: the resolver is pure, so every fixture is a plain
 * object. Each one is built so the two sources DISAGREE — an overlap fixture
 * that would pass if the skill's index won, two skills whose order decides, and
 * the two ways a skill can be switched off.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveEffectiveDocs,
  type SkillContribution,
} from '../src/modules/context/resolve.js';
import { resolveEffectiveDocs as viaFacade } from '../src/modules/context/facade.js';

function skill(over: Partial<SkillContribution> = {}): SkillContribution {
  return {
    skillId: 's1',
    skillName: 'security',
    order: 0,
    linkEnabled: true,
    skillEnabled: true,
    paths: [],
    ...over,
  };
}

describe('resolveEffectiveDocs', () => {
  it('emits an overlapping document once, at the AGENT’s index (AC-20, AC-34)', () => {
    const docs = resolveEffectiveDocs({
      ownPaths: ['specs/a.md', 'specs/shared.md', 'specs/b.md'],
      // The skill lists the shared document FIRST — if the skill's position
      // won, `specs/shared.md` would land at index 0, not 1.
      skills: [skill({ paths: ['specs/shared.md', 'docs/only-skill.md'] })],
    });

    expect(docs.map((d) => d.path)).toEqual([
      'specs/a.md',
      'specs/shared.md',
      'specs/b.md',
      'docs/only-skill.md',
    ]);

    const shared = docs[1]!;
    expect(shared.own).toBe(true);
    expect(shared.skills).toEqual([{ skill_id: 's1', skill_name: 'security' }]);
    // Once, not twice — the count the tab shows and the run injects.
    expect(docs.filter((d) => d.path === 'specs/shared.md')).toHaveLength(1);
  });

  it('orders two skills by agent_skills.order, and within a skill by its own order', () => {
    const docs = resolveEffectiveDocs({
      ownPaths: [],
      skills: [
        skill({ skillId: 'late', skillName: 'zebra', order: 5, paths: ['docs/z1.md', 'docs/z2.md'] }),
        skill({ skillId: 'early', skillName: 'alpha', order: 1, paths: ['docs/a1.md', 'docs/a2.md'] }),
      ],
    });

    expect(docs.map((d) => d.path)).toEqual([
      'docs/a1.md',
      'docs/a2.md',
      'docs/z1.md',
      'docs/z2.md',
    ]);
    // With no own documents, the inherited ones start at index 0.
    expect(docs[0]!.own).toBe(false);
    expect(docs[0]!.skills).toEqual([{ skill_id: 'early', skill_name: 'alpha' }]);
  });

  it('gives a document contributed by two skills both provenances, once', () => {
    const docs = resolveEffectiveDocs({
      ownPaths: [],
      skills: [
        skill({ skillId: 'b', skillName: 'beta', order: 1, paths: ['docs/x.md'] }),
        skill({ skillId: 'a', skillName: 'alpha', order: 0, paths: ['docs/x.md'] }),
      ],
    });

    expect(docs).toHaveLength(1);
    expect(docs[0]!.own).toBe(false);
    expect(docs[0]!.skills).toEqual([
      { skill_id: 'a', skill_name: 'alpha' },
      { skill_id: 'b', skill_name: 'beta' },
    ]);
  });

  it('contributes nothing while either switch is off (AC-40)', () => {
    const paths = ['docs/x.md'];

    expect(
      resolveEffectiveDocs({ ownPaths: [], skills: [skill({ linkEnabled: false, paths })] }),
    ).toEqual([]);
    expect(
      resolveEffectiveDocs({ ownPaths: [], skills: [skill({ skillEnabled: false, paths })] }),
    ).toEqual([]);
    expect(
      resolveEffectiveDocs({
        ownPaths: [],
        skills: [skill({ linkEnabled: false, skillEnabled: false, paths })],
      }),
    ).toEqual([]);
    // Both on → it contributes.
    expect(
      resolveEffectiveDocs({ ownPaths: [], skills: [skill({ paths })] }).map((d) => d.path),
    ).toEqual(['docs/x.md']);
  });

  it('keeps the agent’s own document when the skill that also had it is disabled', () => {
    const docs = resolveEffectiveDocs({
      ownPaths: ['docs/x.md'],
      skills: [skill({ linkEnabled: false, paths: ['docs/x.md'] })],
    });

    expect(docs).toHaveLength(1);
    expect(docs[0]!.own).toBe(true);
    // No provenance from a skill that is not contributing.
    expect(docs[0]!.skills).toEqual([]);
  });

  it('tolerates a repeated path in one owner’s list', () => {
    const docs = resolveEffectiveDocs({
      ownPaths: ['docs/x.md', 'docs/x.md'],
      skills: [skill({ paths: ['docs/y.md', 'docs/y.md'] })],
    });
    expect(docs.map((d) => d.path)).toEqual(['docs/x.md', 'docs/y.md']);
  });

  it('returns [] for an agent with nothing attached and no skills', () => {
    expect(resolveEffectiveDocs({ ownPaths: [], skills: [] })).toEqual([]);
  });

  it('is reachable through the facade — the only seam `reviews` may use', () => {
    expect(viaFacade).toBe(resolveEffectiveDocs);
    expect(
      viaFacade({ ownPaths: ['specs/a.md'], skills: [] }).map((d) => d.path),
    ).toEqual(['specs/a.md']);
  });
});
