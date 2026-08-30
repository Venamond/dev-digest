import { describe, it, expect } from 'vitest';
import { PrBrief, PrBriefRecord, BriefInputId } from '@devdigest/shared';

/**
 * Contract tests for the PR Why + Risk Brief
 * (SPEC-2026-08-23-pr-why-risk-brief).
 */
describe('PrBrief contract', () => {
  const full = {
    what: 'Adds a cached PR brief to the Overview tab.',
    why: 'Reviewers open a PR without knowing what it is for.',
    risk_level: 'medium',
    risks: [
      {
        title: 'Cache key misses a head push',
        explanation: 'A stale brief would be shown as current.',
        severity: 'high',
        file_refs: ['server/src/modules/brief/service.ts'],
      },
    ],
    review_focus: [
      { file_ref: 'server/src/modules/brief/budget.ts', reason: 'New trimming logic.' },
    ],
  };

  it('accepts a full brief object', () => {
    const parsed = PrBrief.parse(full);
    expect(parsed.risk_level).toBe('medium');
    expect(parsed.risks[0].file_refs).toEqual(['server/src/modules/brief/service.ts']);
    expect(parsed.review_focus[0].file_ref).toBe('server/src/modules/brief/budget.ts');
  });

  // AC-40: the line is OPTIONAL. A brief persisted before the field existed
  // has no `line` key at all, and it must still parse — `.nullish()` is what
  // keeps the fields stored beside it from disappearing with it.
  it('AC-40: accepts a review_focus entry with a line and one without', () => {
    const parsed = PrBrief.parse({
      ...full,
      review_focus: [
        { file_ref: 'server/src/modules/brief/budget.ts', reason: 'New trimming logic.', line: 42 },
        { file_ref: 'server/src/modules/brief/service.ts', reason: 'The cache key.' },
      ],
    });
    expect(parsed.review_focus[0].line).toBe(42);
    expect(parsed.review_focus[1].line).toBeUndefined();
  });

  it('AC-40: rejects a non-integer line', () => {
    const bad = {
      ...full,
      review_focus: [{ file_ref: 'server/src/modules/brief/budget.ts', reason: 'r', line: 4.5 }],
    };
    expect(PrBrief.safeParse(bad).success).toBe(false);
  });

  // AC-35: risk_level is exactly high | medium | low.
  it('AC-35: rejects risk_level "unknown"', () => {
    expect(PrBrief.safeParse({ ...full, risk_level: 'unknown' }).success).toBe(false);
  });

  it('AC-35: rejects risk_level "critical" — there is no fourth value', () => {
    expect(PrBrief.safeParse({ ...full, risk_level: 'critical' }).success).toBe(false);
  });

  it('AC-35: accepts each of high, medium and low', () => {
    for (const level of ['high', 'medium', 'low']) {
      expect(PrBrief.safeParse({ ...full, risk_level: level }).success).toBe(true);
    }
  });

  it('rejects a risk whose severity is outside the enum', () => {
    const bad = { ...full, risks: [{ ...full.risks[0], severity: 'blocker' }] };
    expect(PrBrief.safeParse(bad).success).toBe(false);
  });

  it('requires every field — no .default() makes one omittable', () => {
    const { why, ...withoutWhy } = full;
    expect(PrBrief.safeParse(withoutWhy).success).toBe(false);
  });
});

describe('PrBriefRecord contract', () => {
  const record = {
    pr_id: '11111111-2222-3333-4444-555555555555',
    brief: {
      what: 'What it does.',
      why: 'Why it exists.',
      risk_level: 'low',
      risks: [],
      review_focus: [],
    },
    model: 'gpt-4.1',
    cost_usd: 0.014,
    tokens_in: 8200,
    tokens_out: 1300,
    built_at: '2026-08-23T21:05:50.000Z',
    state_key: 'abc:def:ghi:jkl',
    head_sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    stale: false,
    inputs_included: ['pr_meta', 'blast_map'],
    inputs_cut: [{ input: 'documents', detail: '3rd fragment of docs/x.md' }],
    inputs_missing: ['issue'],
    inputs_over_budget: null,
    blast_state: 'partial',
  };

  it('accepts a full record', () => {
    const parsed = PrBriefRecord.parse(record);
    expect(parsed.stale).toBe(false);
    expect(parsed.inputs_cut[0].detail).toBe('3rd fragment of docs/x.md');
  });

  it('accepts a null cost_usd and a null blast_state', () => {
    const parsed = PrBriefRecord.parse({ ...record, cost_usd: null, blast_state: null });
    expect(parsed.cost_usd).toBeNull();
    expect(parsed.blast_state).toBeNull();
  });

  // The over-budget statement is a REQUIRED key, so a brief that did fit says
  // so explicitly rather than by omission.
  it('carries the over-budget statement, and requires it either way', () => {
    const over = PrBriefRecord.parse({
      ...record,
      inputs_over_budget: { measured: 35_299, budget: 16_000 },
    });
    expect(over.inputs_over_budget).toEqual({ measured: 35_299, budget: 16_000 });
    const { inputs_over_budget: _omitted, ...withoutIt } = record;
    expect(PrBriefRecord.safeParse(withoutIt).success).toBe(false);
  });

  it('rejects an input id outside the vocabulary', () => {
    expect(PrBriefRecord.safeParse({ ...record, inputs_missing: ['diff'] }).success).toBe(false);
    expect(BriefInputId.safeParse('diff').success).toBe(false);
  });
});
