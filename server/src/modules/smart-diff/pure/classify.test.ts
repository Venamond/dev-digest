import { describe, it, expect } from 'vitest';
import { classifyPath } from './classify.js';
import type { SmartDiffRole } from '@devdigest/shared';

/**
 * Table test over [path, expectedRole] pairs — see
 * docs/plans/2026-08-14-smart-diff.md S1 for the required-cases table and
 * why each row is there.
 */
const CASES: [string, SmartDiffRole, string][] = [
  ['pnpm-lock.yaml', 'boilerplate', 'acceptance criterion: a lock-file is always boilerplate'],
  ['client/pnpm-lock.yaml', 'boilerplate', 'nested lock-file'],
  [
    'package.json',
    'wiring',
    'two rules, one example: package.json is a manifest, not a lock-file — filename check runs before suffix, boilerplate before wiring',
  ],
  ['package-lock.json', 'boilerplate', 'the other half of the same example'],
  [
    'server/src/vendor/shared/contracts/brief.ts',
    'core',
    "the trap: repo-intel's EXCLUDED_DIRS contains 'vendor'; this repo's own Zod contracts must NOT demote to boilerplate",
  ],
  [
    'client/src/vendor/shared/contracts/brief.ts',
    'core',
    'the client-side copy of the same vendor trap',
  ],
  ['server/dist/index.js', 'boilerplate', 'dir segment beats the index.js wiring filename'],
  ['server/src/modules/pulls/index.ts', 'wiring', 'wiring filename beats the core default'],
  ['server/src/modules/pulls/service.ts', 'core', 'the happy path'],
  ['.github/workflows/server-unit.yml', 'wiring', 'dir segment'],
  ['client/src/components/__snapshots__/x.snap', 'boilerplate', 'snapshot dir AND suffix'],
  ['README.md', 'core', 'no .md rule exists, so docs read as core'],
];

describe('classifyPath', () => {
  it.each(CASES)('%s -> %s (%s)', (path, expected) => {
    expect(classifyPath(path)).toBe(expected);
  });

  it('is case-insensitive on the filename-set lookups', () => {
    expect(classifyPath('PNPM-LOCK.YAML')).toBe('boilerplate');
  });
});
