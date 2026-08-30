import type { SkillStats, SkillStatsAgent } from '@devdigest/shared';

/** Agent currently linked to a skill (Stats → Agents using this skill). */
export interface SkillAgentInput {
  id: string;
  name: string;
  enabled: boolean;
  linkEnabled: boolean;
}

/** Run that counts toward a skill's pull-rate denominator. */
export interface SkillRunInput {
  id: string;
  /** True when this run recorded the skill in `run_skills`. */
  pulled: boolean;
}

/** Finding attributed to a skill (via review → run_skills). */
export interface SkillFindingInput {
  category: string;
  acceptedAt: Date | null;
  dismissedAt: Date | null;
}

/** Inputs for the list-card rate map (workspace-scoped). */
export interface SkillUsageInputs {
  links: Array<{ skillId: string; agentId: string }>;
  runs: Array<{ id: string; agentId: string | null }>;
  pulls: Array<{ runId: string; skillId: string }>;
  findings: Array<{
    skillId: string;
    acceptedAt: Date | null;
    dismissedAt: Date | null;
  }>;
}

export interface SkillUsageRates {
  pullRate: number | null;
  acceptRate: number | null;
}

function rate(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return part / whole;
}

/** Pure aggregation for GET /skills/:id/stats. */
export function buildSkillStats(
  skillId: string,
  skillName: string,
  agents: SkillAgentInput[],
  runs: SkillRunInput[],
  findings: SkillFindingInput[],
  findingsWindowDays: number,
): SkillStats {
  const runsPulled = runs.filter((r) => r.pulled).length;
  const runsTotal = runs.length;

  let accepted = 0;
  let dismissed = 0;
  let pending = 0;
  const byCat: Record<string, number> = {};

  for (const f of findings) {
    if (f.acceptedAt) accepted += 1;
    else if (f.dismissedAt) dismissed += 1;
    else pending += 1;

    const cat = f.category || 'other';
    byCat[cat] = (byCat[cat] ?? 0) + 1;
  }

  const agentsDto: SkillStatsAgent[] = agents.map((a) => ({
    id: a.id,
    name: a.name,
    enabled: a.enabled,
    link_enabled: a.linkEnabled,
  }));

  return {
    skill_id: skillId,
    skill_name: skillName,
    findings_window_days: findingsWindowDays,
    agent_count: agents.length,
    agents: agentsDto,
    runs_total: runsTotal,
    runs_pulled: runsPulled,
    pull_rate: rate(runsPulled, runsTotal),
    findings_total: findings.length,
    accepted,
    dismissed,
    pending,
    accept_rate: rate(accepted, accepted + dismissed),
    findings_by_category: byCat,
  };
}

/**
 * Per-skill pull/accept rates for GET /skills list cards.
 * Uses the same union denominator as `buildSkillStats` so an unlinked agent's
 * historical pull cannot push `pull_rate` above 1.
 */
export function buildSkillUsageRates(
  input: SkillUsageInputs,
): Map<string, SkillUsageRates> {
  const skillIds = new Set<string>();
  for (const l of input.links) skillIds.add(l.skillId);
  for (const p of input.pulls) skillIds.add(p.skillId);
  for (const f of input.findings) skillIds.add(f.skillId);

  const agentsBySkill = new Map<string, Set<string>>();
  for (const l of input.links) {
    let set = agentsBySkill.get(l.skillId);
    if (!set) {
      set = new Set();
      agentsBySkill.set(l.skillId, set);
    }
    set.add(l.agentId);
  }

  const pullsBySkill = new Map<string, Set<string>>();
  for (const p of input.pulls) {
    let set = pullsBySkill.get(p.skillId);
    if (!set) {
      set = new Set();
      pullsBySkill.set(p.skillId, set);
    }
    set.add(p.runId);
  }

  const findingsBySkill = new Map<
    string,
    Array<{ acceptedAt: Date | null; dismissedAt: Date | null }>
  >();
  for (const f of input.findings) {
    let list = findingsBySkill.get(f.skillId);
    if (!list) {
      list = [];
      findingsBySkill.set(f.skillId, list);
    }
    list.push(f);
  }

  const out = new Map<string, SkillUsageRates>();
  for (const skillId of skillIds) {
    const linkedAgents = agentsBySkill.get(skillId) ?? new Set();
    const pulledRunIds = pullsBySkill.get(skillId) ?? new Set();

    const runIds = new Set<string>();
    for (const r of input.runs) {
      if (r.agentId && linkedAgents.has(r.agentId)) runIds.add(r.id);
    }
    for (const runId of pulledRunIds) runIds.add(runId);

    const runsTotal = runIds.size;
    const runsPulled = pulledRunIds.size;

    let accepted = 0;
    let dismissed = 0;
    for (const f of findingsBySkill.get(skillId) ?? []) {
      if (f.acceptedAt) accepted += 1;
      else if (f.dismissedAt) dismissed += 1;
    }

    out.set(skillId, {
      pullRate: rate(runsPulled, runsTotal),
      acceptRate: rate(accepted, accepted + dismissed),
    });
  }
  return out;
}
