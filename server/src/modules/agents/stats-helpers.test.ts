import { describe, it, expect } from 'vitest';
import { buildAgentStats, buildTrend } from './stats-helpers.js';

describe('buildTrend', () => {
  it('fills zero days and counts runs on matching UTC dates', () => {
    const now = new Date('2026-08-05T12:00:00.000Z');
    const trend = buildTrend(
      [
        {
          id: '1',
          ranAt: new Date('2026-08-05T01:00:00.000Z'),
          durationMs: 1000,
          tokensIn: 1,
          tokensOut: 1,
          costUsd: 0.01,
          findingsCount: 0,
          source: 'local',
          prNumber: 1,
          repoId: 'r',
        },
        {
          id: '2',
          ranAt: new Date('2026-08-05T02:00:00.000Z'),
          durationMs: 1000,
          tokensIn: 1,
          tokensOut: 1,
          costUsd: 0.01,
          findingsCount: 0,
          source: 'local',
          prNumber: 1,
          repoId: 'r',
        },
      ],
      3,
      now,
    );
    expect(trend).toEqual([
      { label: '2026-08-03', value: 0 },
      { label: '2026-08-04', value: 0 },
      { label: '2026-08-05', value: 2 },
    ]);
  });
});

describe('buildAgentStats', () => {
  it('aggregates cost, latency, accept rate, severity and category', () => {
    const stats = buildAgentStats(
      'ag1',
      'Security',
      [
        {
          id: 'run1',
          ranAt: new Date('2026-08-01T10:00:00.000Z'),
          durationMs: 2000,
          tokensIn: 1000,
          tokensOut: 200,
          costUsd: 0.04,
          findingsCount: 2,
          source: 'local',
          prNumber: 10,
          repoId: 'repo1',
        },
        {
          id: 'run2',
          ranAt: new Date('2026-08-02T10:00:00.000Z'),
          durationMs: 4000,
          tokensIn: 2000,
          tokensOut: 400,
          costUsd: 0.06,
          findingsCount: 1,
          source: 'ci',
          prNumber: 11,
          repoId: 'repo1',
        },
      ],
      [
        {
          severity: 'CRITICAL',
          category: 'security',
          acceptedAt: new Date(),
          dismissedAt: null,
        },
        {
          severity: 'WARNING',
          category: 'bug',
          acceptedAt: null,
          dismissedAt: new Date(),
        },
        {
          severity: 'SUGGESTION',
          category: 'style',
          acceptedAt: null,
          dismissedAt: null,
        },
      ],
    );

    expect(stats.runs).toBe(2);
    expect(stats.avg_cost_usd).toBeCloseTo(0.05);
    expect(stats.avg_latency_ms).toBe(3000);
    expect(stats.accepted).toBe(1);
    expect(stats.dismissed).toBe(1);
    expect(stats.pending).toBe(1);
    expect(stats.accept_rate).toBeCloseTo(0.5);
    expect(stats.findings_by_severity).toEqual({ CRITICAL: 1, WARNING: 1, SUGGESTION: 1 });
    expect(stats.findings_by_category).toEqual({ security: 1, bug: 1, style: 1 });
    expect(stats.recent_runs[0]!.run_id).toBe('run2');
    expect(stats.recent_runs).toHaveLength(2);
  });

  it('returns null rates and averages when there is no data', () => {
    const stats = buildAgentStats('ag1', 'Empty', [], []);
    expect(stats.runs).toBe(0);
    expect(stats.accept_rate).toBeNull();
    expect(stats.avg_cost_usd).toBeNull();
    expect(stats.avg_latency_ms).toBeNull();
    expect(stats.recent_runs).toEqual([]);
  });
});
