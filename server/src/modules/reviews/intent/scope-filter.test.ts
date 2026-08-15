import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { scopeFilter } from './scope-filter.js';

let idSeq = 0;
function finding(overrides: Partial<Finding> = {}): Finding {
  idSeq += 1;
  return {
    id: `f-${idSeq}`,
    severity: 'WARNING',
    category: 'bug',
    title: 'A finding',
    file: 'src/config.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'because',
    confidence: 0.8,
    kind: 'finding',
    ...overrides,
  };
}

describe('scopeFilter', () => {
  it('always keeps secret_leak findings even when they match an out-of-scope phrase', () => {
    const f = finding({ kind: 'secret_leak', title: 'Hardcoded logging secret', category: 'security' });
    const kept = scopeFilter([f], ['logging']);
    expect(kept).toEqual([f]);
  });

  it('always keeps lethal_trifecta findings even when they match an out-of-scope phrase', () => {
    const f = finding({ kind: 'lethal_trifecta', title: 'Exfil via logging pipeline', category: 'security' });
    const kept = scopeFilter([f], ['logging']);
    expect(kept).toEqual([f]);
  });

  it('keeps at most one out-of-scope CRITICAL, drops subsequent ones', () => {
    const first = finding({ severity: 'CRITICAL', title: 'Refactor unrelated logging module', rationale: 'r1' });
    const second = finding({ severity: 'CRITICAL', title: 'Another logging refactor', rationale: 'r2' });
    const kept = scopeFilter([first, second], ['logging']);
    expect(kept).toEqual([first]);
  });

  it('drops WARNING findings that match an out-of-scope phrase', () => {
    const f = finding({ severity: 'WARNING', title: 'Logging style nit', rationale: 'unrelated to this PR' });
    const kept = scopeFilter([f], ['logging']);
    expect(kept).toEqual([]);
  });

  it('drops SUGGESTION findings that match an out-of-scope phrase', () => {
    const f = finding({ severity: 'SUGGESTION', title: 'Consider renaming the logging helper' });
    const kept = scopeFilter([f], ['logging']);
    expect(kept).toEqual([]);
  });

  it('keeps findings that do not match any out-of-scope phrase, regardless of severity', () => {
    const inScopeWarning = finding({ severity: 'WARNING', title: 'Missing null check', rationale: 'could crash' });
    const inScopeSuggestion = finding({ severity: 'SUGGESTION', title: 'Simplify this expression' });
    const kept = scopeFilter([inScopeWarning, inScopeSuggestion], ['logging']);
    expect(kept).toEqual([inScopeWarning, inScopeSuggestion]);
  });

  it('preserves original order among kept findings', () => {
    const a = finding({ severity: 'WARNING', title: 'Alpha issue' });
    const b = finding({ kind: 'secret_leak', title: 'Beta secret', category: 'security' });
    const c = finding({ severity: 'SUGGESTION', title: 'Gamma nit' });
    const kept = scopeFilter([a, b, c], []);
    expect(kept.map((f) => f.id)).toEqual([a.id, b.id, c.id]);
  });

  it('matches out-of-scope substrings case-insensitively across title/rationale/file/category', () => {
    const f = finding({
      severity: 'WARNING',
      title: 'unrelated',
      rationale: 'unrelated',
      file: 'src/LOGGING/setup.ts',
      category: 'style',
    });
    const kept = scopeFilter([f], ['logging']);
    expect(kept).toEqual([]);
  });

  it('with no out-of-scope phrases, keeps everything', () => {
    const findings = [finding({ severity: 'CRITICAL' }), finding({ severity: 'WARNING' }), finding({ severity: 'SUGGESTION' })];
    const kept = scopeFilter(findings, []);
    expect(kept).toEqual(findings);
  });
});
