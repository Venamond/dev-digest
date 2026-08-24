import { describe, it, expect } from 'vitest';
import { describeByRoot, describeInherited } from '../src/modules/reviews/run-executor.js';

describe('describeByRoot — what the run log says went in', () => {
  const ROOTS = ['specs', 'docs', 'insights'];

  it('names the KIND, not only the count', () => {
    expect(
      describeByRoot([{ path: 'specs/a.md' }, { path: 'docs/b.md' }, { path: 'docs/c.md' }], ROOTS),
    ).toBe('1 spec, 2 docs');
  });

  it('keeps the configured root order, and omits a root that contributed nothing', () => {
    expect(describeByRoot([{ path: 'insights/x.md' }, { path: 'specs/y.md' }], ROOTS)).toBe(
      '1 spec, 1 insight',
    );
  });

  it('counts a nested root correctly — AC-2 allows any depth', () => {
    // The root is `docs` wherever it sits, and one document reads as `1 doc`.
    expect(describeByRoot([{ path: 'server/docs/adr.md' }], ROOTS)).toBe('1 doc');
  });

  it('falls back to `other` for a path under no configured root', () => {
    expect(describeByRoot([{ path: 'weird/x.md' }], ROOTS)).toBe('1 other');
  });
});

describe('describeInherited — documents that arrived through a skill', () => {
  it('NAMES the skill when there is one, because that is what a reader must go and change', () => {
    expect(describeInherited([{ skills: ['lethal-trifecta'] }, { skills: ['lethal-trifecta'] }])).toBe(
      '2 via skill lethal-trifecta',
    );
  });

  it('counts the skills when several contributed — a log line is not a list', () => {
    expect(
      describeInherited([{ skills: ['a'] }, { skills: ['b'] }, { skills: ['a', 'b'] }]),
    ).toBe('3 via 2 skills');
  });

  it('still reports the count when no skill name survived', () => {
    // Defensive: a resolver row with an empty `skills` must not print "via ".
    expect(describeInherited([{ skills: [] }])).toBe('1 inherited');
  });
});
