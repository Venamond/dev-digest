import { describe, it, expect } from 'vitest';
import {
  extractSymbols,
  extractReferences,
  extractEndpoints,
  extractCrons,
  humanizeCron,
} from '../src/adapters/codeindex/extract.js';

/**
 * A3 — unit tests for the enhanced TS/JS symbol/reference extractor (L04).
 * Pure (no DB/network) — the core of blast-radius accuracy.
 */
describe('extractSymbols', () => {
  it('finds functions, arrows, classes, methods, interfaces, types', () => {
    const src = `
export function rateLimit(req) { return true; }
const helper = (x) => x + 1;
export const compute = async (n: number) => n * 2;
export class Bucket {
  refill(now: number) { return now; }
  static make() { return new Bucket(); }
}
export interface Config { port: number }
export type Id = string;
`;
    const syms = extractSymbols(src);
    const names = syms.map((s) => s.name);
    expect(names).toContain('rateLimit');
    expect(names).toContain('helper');
    expect(names).toContain('compute');
    expect(names).toContain('Bucket');
    expect(names).toContain('refill'); // class method (bare)
    expect(names).toContain('Bucket.refill'); // class method (qualified)
    expect(names).toContain('Config');
    expect(names).toContain('Id');
    expect(syms.find((s) => s.name === 'Bucket')?.kind).toBe('class');
    expect(syms.find((s) => s.name === 'Config')?.kind).toBe('interface');
  });

  it('ignores keywords and comment lines', () => {
    const src = `
// function notReal(x) {}
/* class AlsoNot {} */
if (x) { doThing(); }
`;
    const syms = extractSymbols(src);
    expect(syms.map((s) => s.name)).not.toContain('notReal');
    expect(syms.map((s) => s.name)).not.toContain('AlsoNot');
    expect(syms.map((s) => s.name)).not.toContain('if');
  });
});

describe('extractReferences (downstream callers)', () => {
  it('finds call sites and excludes the declaration', () => {
    const caller = `
import { rateLimit } from './mw';
export function handler(req) {
  if (!rateLimit(req)) return 429;
  return 200;
}
`;
    const refs = extractReferences(caller, 'rateLimit');
    // exactly the call site on the if-line, NOT the import line
    expect(refs.length).toBe(1);
    expect(refs[0]!.line).toBe(4);
  });

  it('matches member calls, new, and JSX usage', () => {
    expect(extractReferences('obj.compute(1)', 'compute').length).toBe(1);
    expect(extractReferences('const b = new Bucket()', 'Bucket').length).toBe(1);
    expect(extractReferences('return <Widget id={1} />', 'Widget').length).toBe(1);
  });

  it('does not count the declaration line as a reference', () => {
    const decl = `export function rateLimit(req) { return true; }`;
    expect(extractReferences(decl, 'rateLimit').length).toBe(0);
  });
});

describe('extractEndpoints / extractCrons', () => {
  it('detects fastify/express route registrations', () => {
    const src = `
app.get('/users', handler);
router.post("/users/:id", update);
app.get<{ Params: { id: string } }>('/pulls/:id/blast', blast);
`;
    const eps = extractEndpoints(src);
    expect(eps).toContain('GET /users');
    expect(eps).toContain('POST /users/:id');
    expect(eps).toContain('GET /pulls/:id/blast');
  });

  it('detects cron expressions and background job kinds', () => {
    const src = `
cron.schedule('*/5 * * * *', poll);
jobs.register('poll_repo', handler);
`;
    const crons = extractCrons(src);
    // The handler names the schedule; the expression is humanised.
    expect(crons).toContain('poll (every 5 minutes)');
    expect(crons).toContain('job:poll_repo');
  });

  it('names a schedule from a quoted job name when the line carries one', () => {
    const src = `
cron.schedule('0 * * * *', resetBuckets, { name: 'reset-rate-buckets' });
new CronJob('0 0 * * *', nightly);
schedule('0 3 * * *');
`;
    const crons = extractCrons(src);
    // A quoted kebab name wins over the handler identifier — it is what the
    // operator sees in logs and dashboards.
    expect(crons).toContain('reset-rate-buckets (hourly)');
    expect(crons).toContain('nightly (daily)');
    // No name on the line: the schedule stands alone rather than inventing one.
    expect(crons).toContain('daily at 03:00');
  });

  it('keeps an expression it cannot name in words', () => {
    // A wrong friendly label is worse than an unfriendly correct one.
    expect(humanizeCron('15 2 * * 1-5')).toBe('15 2 * * 1-5');
    expect(extractCrons("cron.schedule('15 2 * * 1-5');")).toContain('15 2 * * 1-5');
  });
});

describe('humanizeCron', () => {
  it.each([
    ['* * * * *', 'every minute'],
    ['*/5 * * * *', 'every 5 minutes'],
    ['0 * * * *', 'hourly'],
    ['0 */6 * * *', 'every 6 hours'],
    ['0 0 * * *', 'daily'],
    ['0 9 * * *', 'daily at 09:00'],
    ['0 0 * * 0', 'weekly'],
    ['0 0 1 * *', 'monthly'],
  ])('%s → %s', (expr, expected) => {
    expect(humanizeCron(expr)).toBe(expected);
  });

  it('returns a malformed expression untouched', () => {
    expect(humanizeCron('nonsense')).toBe('nonsense');
  });
});
