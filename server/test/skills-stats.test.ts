import { describe, it, expect } from 'vitest';
import {
  buildSkillStats,
  buildSkillUsageRates,
  type SkillAgentInput,
  type SkillFindingInput,
  type SkillRunInput,
} from '../src/modules/skills/stats-helpers.js';

const agents: SkillAgentInput[] = [
  { id: 'a1', name: 'Test Quality', enabled: true, linkEnabled: true },
];

describe('buildSkillStats', () => {
  it('uses union denominator so pull_rate stays ≤ 1 after unlink', () => {
    // Linked-agent run (not pulled) + historical pulled run from an unlinked agent.
    const runs: SkillRunInput[] = [
      { id: 'r-linked', pulled: false },
      { id: 'r-orphan-pulled', pulled: true },
    ];
    const stats = buildSkillStats('s1', 'happy-path', agents, runs, [], 30);
    expect(stats.runs_total).toBe(2);
    expect(stats.runs_pulled).toBe(1);
    expect(stats.pull_rate).toBeCloseTo(0.5);
    expect(stats.findings_window_days).toBe(30);
    expect(stats.agent_count).toBe(1);
    expect(stats.agents[0]).toMatchObject({
      id: 'a1',
      name: 'Test Quality',
      enabled: true,
      link_enabled: true,
    });
  });

  it('excludes pending from accept_rate denominator', () => {
    const findings: SkillFindingInput[] = [
      { category: 'coverage', acceptedAt: new Date(), dismissedAt: null },
      { category: 'coverage', acceptedAt: null, dismissedAt: new Date() },
      { category: 'style', acceptedAt: null, dismissedAt: null },
    ];
    const stats = buildSkillStats('s1', 'skill', agents, [], findings, 30);
    expect(stats.accepted).toBe(1);
    expect(stats.dismissed).toBe(1);
    expect(stats.pending).toBe(1);
    expect(stats.findings_total).toBe(3);
    expect(stats.accept_rate).toBeCloseTo(0.5);
  });

  it('maps blank category to other', () => {
    const findings: SkillFindingInput[] = [
      { category: '', acceptedAt: null, dismissedAt: null },
      { category: 'security', acceptedAt: null, dismissedAt: null },
    ];
    const stats = buildSkillStats('s1', 'skill', [], [], findings, 30);
    expect(stats.findings_by_category).toEqual({ other: 1, security: 1 });
  });

  it('returns null rates on empty input', () => {
    const stats = buildSkillStats('s1', 'empty', [], [], [], 30);
    expect(stats.runs_total).toBe(0);
    expect(stats.runs_pulled).toBe(0);
    expect(stats.pull_rate).toBeNull();
    expect(stats.accept_rate).toBeNull();
    expect(stats.findings_total).toBe(0);
    expect(stats.findings_by_category).toEqual({});
  });
});

describe('buildSkillUsageRates', () => {
  it('builds a per-skill map of pull and accept rates', () => {
    const rates = buildSkillUsageRates({
      links: [
        { skillId: 's1', agentId: 'a1' },
        { skillId: 's2', agentId: 'a1' },
      ],
      runs: [
        { id: 'r1', agentId: 'a1' },
        { id: 'r2', agentId: 'a1' },
      ],
      pulls: [{ runId: 'r1', skillId: 's1' }],
      findings: [
        { skillId: 's1', acceptedAt: new Date(), dismissedAt: null },
        { skillId: 's1', acceptedAt: null, dismissedAt: new Date() },
        { skillId: 's2', acceptedAt: null, dismissedAt: null },
      ],
    });

    expect(rates.get('s1')).toEqual({ pullRate: 0.5, acceptRate: 0.5 });
    // s2: linked agent has 2 runs, none pulled → pull 0; only pending finding → null accept
    expect(rates.get('s2')).toEqual({ pullRate: 0, acceptRate: null });
  });

  it('keeps pull_rate ≤ 1 when a pulled run\'s agent was since unlinked', () => {
    const rates = buildSkillUsageRates({
      links: [], // unlinked
      runs: [{ id: 'r-old', agentId: 'a-gone' }],
      pulls: [{ runId: 'r-old', skillId: 's1' }],
      findings: [],
    });
    expect(rates.get('s1')).toEqual({ pullRate: 1, acceptRate: null });
  });
});
