import { describe, it, expect } from 'vitest';
import type { FindingRecord } from '../src/api/types.js';
import {
  SEVERITY_RANK,
  MAX_FINDINGS_SUMMARY,
  MAX_FINDINGS_FULL,
  MAX_CONVENTIONS,
  MAX_AGENTS,
  trimFinding,
  selectFindings,
  jsonContent,
  errorContent,
} from '../src/format.js';

function finding(overrides: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: 'f-0',
    severity: 'WARNING',
    category: 'security',
    title: 'title',
    file: 'a.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'because',
    suggestion: null,
    ...overrides,
  };
}

describe('selectFindings', () => {
  it('filter runs before the cap so criticals are never dropped', () => {
    const criticals = Array.from({ length: 3 }, (_, i) =>
      finding({ id: `c-${i}`, severity: 'CRITICAL', file: `c-${i}.ts` }),
    );
    const warnings = Array.from({ length: 60 }, (_, i) =>
      finding({ id: `w-${i}`, severity: 'WARNING', file: `w-${i}.ts` }),
    );
    const suggestions = Array.from({ length: 10 }, (_, i) =>
      finding({ id: `s-${i}`, severity: 'SUGGESTION', file: `s-${i}.ts` }),
    );

    const result = selectFindings([...criticals, ...warnings, ...suggestions], {
      severityMin: 'WARNING',
      detail: 'summary',
    });

    expect(result.findings).toHaveLength(50);
    expect(result.total).toBe(63);
    expect(result.truncated).toBe(true);
    expect(result.findings.filter((f) => f.severity === 'CRITICAL')).toHaveLength(3);
  });

  it('severity_min: CRITICAL keeps the review verdict untouched', () => {
    const review = {
      verdict: 'request_changes' as const,
      findings: [finding({ severity: 'WARNING' }), finding({ severity: 'SUGGESTION' })],
    };

    const result = selectFindings(review.findings, { severityMin: 'CRITICAL', detail: 'summary' });

    expect(result.findings).toHaveLength(0);
    expect(result.total).toBe(0);
    // selectFindings never sees or returns a verdict field — the review's
    // own verdict is untouched by this call.
    expect(review.verdict).toBe('request_changes');
  });

  it('truncated is absent when nothing was dropped', () => {
    const result = selectFindings([finding(), finding({ id: 'f-1' })], { detail: 'summary' });

    expect(result.truncated).toBe(false);
    expect(result.total).toBe(2);
  });
});

describe('trimFinding', () => {
  it('suggestion is omitted when null and rationale only under detail: full', () => {
    const withSuggestion = finding({ suggestion: 'do X', rationale: 'why' });

    const summary = trimFinding(withSuggestion, 'summary');
    expect(summary.suggestion).toBe('do X');
    expect(summary.rationale).toBeUndefined();
    expect(summary.id).toBeUndefined();
    expect('rationale' in summary).toBe(false);
    expect('id' in summary).toBe(false);

    const full = trimFinding(withSuggestion, 'full');
    expect(full.rationale).toBe('why');
    expect(full.id).toBe(withSuggestion.id);

    const withoutSuggestion = trimFinding(finding({ suggestion: null }), 'summary');
    expect(withoutSuggestion.suggestion).toBeUndefined();
    expect('suggestion' in withoutSuggestion).toBe(false);
  });

  it('lines collapses to a single number when start_line === end_line', () => {
    const single = trimFinding(finding({ start_line: 10, end_line: 10 }), 'summary');
    expect(single.lines).toBe('10');

    const range = trimFinding(finding({ start_line: 10, end_line: 14 }), 'summary');
    expect(range.lines).toBe('10-14');
  });

  it('an out-of-enum category string passes through unchanged', () => {
    // db/seed.ts writes categories like "coverage" that FindingCategory does
    // not enumerate; trimFinding must not throw or re-validate it.
    const trimmed = trimFinding(finding({ category: 'coverage' }), 'summary');
    expect(trimmed.category).toBe('coverage');
  });
});

describe('constants', () => {
  it('exposes the D13 caps and severity ranks as named constants', () => {
    expect(SEVERITY_RANK).toEqual({ CRITICAL: 0, WARNING: 1, SUGGESTION: 2 });
    expect(MAX_FINDINGS_SUMMARY).toBe(50);
    expect(MAX_FINDINGS_FULL).toBe(20);
    expect(MAX_CONVENTIONS).toBe(100);
    expect(MAX_AGENTS).toBe(50);
  });
});

describe('jsonContent / errorContent', () => {
  it('jsonContent wraps the payload as one JSON-stringified text block', () => {
    const result = jsonContent({ a: 1 });
    expect(result).toEqual({ content: [{ type: 'text', text: '{"a":1}' }] });
  });

  it('errorContent sets isError true with the given text', () => {
    const result = errorContent('boom');
    expect(result).toEqual({ content: [{ type: 'text', text: 'boom' }], isError: true });
  });
});
