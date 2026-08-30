/**
 * Project Context — the effective-document resolver.
 *
 * Pure: no I/O, no database, no clock. It takes what an agent has attached and
 * what each of its linked skills has attached, and answers the one question the
 * run and the editor tab must answer identically — which documents go into the
 * `## Project context` block, once each, in what order.
 *
 * `reviews` consumes this through `facade.ts`, never from here directly
 * (`no-cross-module-internals`).
 */

/** One linked skill's contribution, exactly as `ContextRepository` returns it. */
export interface SkillContribution {
  skillId: string;
  skillName: string;
  /** `agent_skills.order` — the skills' order on this agent (AC-39). */
  order: number;
  /** `agent_skills.enabled` — the per-agent switch. */
  linkEnabled: boolean;
  /** `skills.enabled` — the skill's own switch. */
  skillEnabled: boolean;
  /** That skill's attached paths for this repository, in its own order. */
  paths: string[];
}

export interface ResolveInput {
  /** The agent's own attached paths, in the human's order (AC-13). */
  ownPaths: string[];
  skills: SkillContribution[];
}

/** One document that will reach the prompt, with everything it arrived through. */
export interface EffectiveDoc {
  path: string;
  /** True when the agent attaches it directly — then it holds the agent's index. */
  own: boolean;
  /**
   * Enabled skills that also contribute it, in the skills' order. Non-empty
   * together with `own: true` is the both-ways case (AC-20, AC-34): one entry,
   * at the agent's position, carrying both provenances.
   */
  skills: Array<{ skill_id: string; skill_name: string }>;
}

/**
 * The agent's own documents first, in the human's order; then the documents of
 * its **enabled** skills, ordered by `agent_skills.order` and, within one
 * skill, by that skill's own order (AC-39).
 *
 * A skill contributes only while `linkEnabled && skillEnabled` (AC-40). A
 * document arriving through both paths appears once, at the position the
 * agent's order gives it (AC-20, AC-34) — which is why the own list is walked
 * first and the inherited pass only ever *adds* provenance to it.
 */
export function resolveEffectiveDocs(input: ResolveInput): EffectiveDoc[] {
  const out: EffectiveDoc[] = [];
  const byPath = new Map<string, EffectiveDoc>();

  for (const path of input.ownPaths) {
    if (byPath.has(path)) continue;
    const doc: EffectiveDoc = { path, own: true, skills: [] };
    byPath.set(path, doc);
    out.push(doc);
  }

  const enabled = input.skills
    .filter((s) => s.linkEnabled && s.skillEnabled)
    // Stable within one `order` value: `agent_skills` has no tiebreaker of its
    // own, so the skill's name decides rather than the database's row order.
    .sort((a, b) => a.order - b.order || compare(a.skillName, b.skillName));

  for (const skill of enabled) {
    const provenance = { skill_id: skill.skillId, skill_name: skill.skillName };
    for (const path of skill.paths) {
      const existing = byPath.get(path);
      if (existing) {
        // Already emitted — at the agent's index if it is the agent's own, or
        // at an earlier skill's. Only the provenance grows.
        if (!existing.skills.some((s) => s.skill_id === skill.skillId)) {
          existing.skills.push(provenance);
        }
        continue;
      }
      const doc: EffectiveDoc = { path, own: false, skills: [provenance] };
      byPath.set(path, doc);
      out.push(doc);
    }
  }

  return out;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
