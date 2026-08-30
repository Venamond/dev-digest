import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { matchesExpected, scoreCase } from './scoring.js';
import { readExpected, type ExpectedFinding } from './types.js';

/**
 * The scorer is judged offline: this file imports no provider, no container and
 * no DB, and `pnpm verify:l06` runs it with the network unplugged (AC-13, AC-61).
 */

function finding(over: Partial<Finding> & Pick<Finding, 'file' | 'start_line'>): Finding {
  return {
    id: `f-${over.file}-${over.start_line}`,
    severity: 'WARNING',
    category: 'bug',
    title: 'Some finding',
    rationale: 'because',
    confidence: 0.9,
    end_line: over.start_line,
    ...over,
  };
}

const expected = (file: string, start: number, end = start): ExpectedFinding => ({
  file,
  start_line: start,
  end_line: end,
});

describe('matchesExpected — location and nothing else (AC-15)', () => {
  it('AC-15: same file, overlapping range → match', () => {
    expect(matchesExpected(finding({ file: 'users.ts', start_line: 40, end_line: 44 }), expected('users.ts', 42, 50))).toBe(true);
  });

  it('AC-15: same file, disjoint ranges → no match', () => {
    expect(matchesExpected(finding({ file: 'users.ts', start_line: 3, end_line: 5 }), expected('users.ts', 40, 44))).toBe(false);
  });

  it('AC-15: different file, identical range → no match', () => {
    expect(matchesExpected(finding({ file: 'orders.ts', start_line: 40, end_line: 44 }), expected('users.ts', 40, 44))).toBe(false);
  });

  it('AC-15: identical title, different file → no match (title takes no part)', () => {
    const actual = finding({ file: 'orders.ts', start_line: 7, title: 'SQL injection' });
    expect(matchesExpected(actual, { ...expected('users.ts', 7), })).toBe(false);
  });

  it('AC-15: a different severity/category/title on the same location still matches', () => {
    const actual = finding({
      file: 'users.ts',
      start_line: 40,
      severity: 'CRITICAL',
      category: 'security',
      title: 'Completely different wording',
    });
    expect(matchesExpected(actual, expected('users.ts', 40))).toBe(true);
  });

  it('AC-15: overlap is inclusive at both ends and tolerant of a reversed range', () => {
    expect(matchesExpected(finding({ file: 'a.ts', start_line: 10, end_line: 10 }), expected('a.ts', 10, 20))).toBe(true);
    expect(matchesExpected(finding({ file: 'a.ts', start_line: 20, end_line: 10 }), expected('a.ts', 15, 15))).toBe(true);
  });
});

describe('scoreCase — must_not_flag', () => {
  // The one example AC-46 and AC-17 must agree on: a dismissed "Unused import"
  // at users.ts:3 is the forbidden location; the agent instead reports a real
  // SQL injection at users.ts:40.
  const forbidden = [expected('users.ts', 3)];
  const sqlInjection = finding({
    file: 'users.ts',
    start_line: 40,
    end_line: 44,
    severity: 'CRITICAL',
    category: 'security',
    title: 'SQL injection in query builder',
  });

  it('AC-46 × AC-17: a finding elsewhere in the same file passes the case with fp = 0', () => {
    const score = scoreCase({
      expectation: 'must_not_flag',
      expected: forbidden,
      actual: [sqlInjection],
      kept: 1,
      dropped: 0,
    });
    expect(score.passed).toBe(true);
    expect(score.fp).toBe(0);
    expect(score.tp).toBe(0);
    expect(score.fn).toBe(0);
  });

  it('AC-17: the same fixture with the finding moved onto users.ts:2-4 fails with fp = 1', () => {
    const score = scoreCase({
      expectation: 'must_not_flag',
      expected: forbidden,
      actual: [finding({ file: 'users.ts', start_line: 2, end_line: 4 })],
      kept: 1,
      dropped: 0,
    });
    expect(score.passed).toBe(false);
    expect(score.fp).toBe(1);
  });

  it('AC-17: two findings overlapping the forbidden range give fp = 2', () => {
    const score = scoreCase({
      expectation: 'must_not_flag',
      expected: forbidden,
      actual: [
        finding({ file: 'users.ts', start_line: 3, title: 'Unused import' }),
        finding({ file: 'users.ts', start_line: 2, end_line: 4, title: 'Remove the unused import' }),
      ],
      kept: 2,
      dropped: 0,
    });
    expect(score.fp).toBe(2);
    expect(score.passed).toBe(false);
  });

  it('AC-46: no findings at all passes the case', () => {
    const score = scoreCase({ expectation: 'must_not_flag', expected: forbidden, actual: [], kept: 0, dropped: 0 });
    expect(score.passed).toBe(true);
    expect(score.fp).toBe(0);
  });

  it('a case with no forbidden location declared cannot be violated', () => {
    const score = scoreCase({
      expectation: 'must_not_flag',
      expected: readExpected(null),
      actual: [sqlInjection],
      kept: 1,
      dropped: 0,
    });
    expect(score.passed).toBe(true);
    expect(score.fp).toBe(0);
  });
});

describe('scoreCase — must_find', () => {
  const wanted = [expected('auth.ts', 12, 18), expected('auth.ts', 44)];

  it('AC-51 × AC-16: every expected matched plus one extra unmatched finding still passes, and fp stays 0', () => {
    const score = scoreCase({
      expectation: 'must_find',
      expected: wanted,
      actual: [
        finding({ file: 'auth.ts', start_line: 14 }),
        finding({ file: 'auth.ts', start_line: 44 }),
        finding({ file: 'auth.ts', start_line: 90, title: 'Nobody judged this one' }),
      ],
      kept: 3,
      dropped: 0,
    });
    expect(score.passed).toBe(true);
    expect(score.tp).toBe(2);
    expect(score.fn).toBe(0);
    expect(score.fp).toBe(0);
    expect(score.actual_count).toBe(3);
    expect(score.expected_count).toBe(2);
  });

  it('AC-18: a missed expected finding is a false negative and fails the case', () => {
    const score = scoreCase({
      expectation: 'must_find',
      expected: wanted,
      actual: [finding({ file: 'auth.ts', start_line: 14 })],
      kept: 1,
      dropped: 0,
    });
    expect(score.passed).toBe(false);
    expect(score.tp).toBe(1);
    expect(score.fn).toBe(1);
    expect(score.fp).toBe(0);
  });

  it('AC-16: the same defect reported twice is absorbed into one true positive', () => {
    const score = scoreCase({
      expectation: 'must_find',
      expected: [expected('auth.ts', 12, 18)],
      actual: [
        finding({ file: 'auth.ts', start_line: 12 }),
        finding({ file: 'auth.ts', start_line: 15, title: 'Same defect, different wording' }),
      ],
      kept: 2,
      dropped: 0,
    });
    expect(score.tp).toBe(1);
    expect(score.fn).toBe(0);
    expect(score.fp).toBe(0);
  });

  it('AC-20: kept and dropped are carried through untouched', () => {
    const score = scoreCase({
      expectation: 'must_find',
      expected: wanted,
      actual: [finding({ file: 'auth.ts', start_line: 14 }), finding({ file: 'auth.ts', start_line: 44 })],
      kept: 2,
      dropped: 3,
    });
    expect(score.kept).toBe(2);
    expect(score.dropped).toBe(3);
  });
});

describe('readExpected — a stored jsonb column, not a trusted object', () => {
  it('reads null as an empty list, never throws', () => {
    expect(readExpected(null)).toEqual([]);
    expect(readExpected(undefined)).toEqual([]);
    expect(readExpected('not an array')).toEqual([]);
    expect(readExpected({ file: 'a.ts' })).toEqual([]);
  });

  it('skips junk entries and keeps the usable ones', () => {
    expect(readExpected([{ file: 'a.ts', start_line: 1, end_line: 2 }, { nope: true }, 7])).toEqual([
      { file: 'a.ts', start_line: 1, end_line: 2 },
    ]);
  });

  it('a missing end_line reads as a single line', () => {
    expect(readExpected([{ file: 'a.ts', start_line: 3 }])).toEqual([
      { file: 'a.ts', start_line: 3, end_line: 3 },
    ]);
  });
});
