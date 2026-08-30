import { describe, it, expect } from 'vitest';
import { latestScored, previousScored } from './latest-scored.js';

const b = (id: string, state: string) => ({ id, state });

describe('latestScored', () => {
  /* The regression this guards: pressing "Run all evals" inserts a `running`
     batch with null metrics, and taking the newest row blanked the strip. */
  it('skips a run in flight and reports the last one that scored', () => {
    const rows = [b('r3', 'running'), b('r2', 'complete'), b('r1', 'partial')];
    expect(latestScored(rows)?.id).toBe('r2');
    expect(previousScored(rows)?.id).toBe('r1');
  });

  it('counts a partial run — it produced numbers, just not for every case', () => {
    expect(latestScored([b('r1', 'partial')])?.id).toBe('r1');
  });

  it('is undefined when nothing has ever finished, so the caller renders em dashes', () => {
    expect(latestScored([b('r1', 'running')])).toBeUndefined();
    expect(latestScored([])).toBeUndefined();
    expect(previousScored([b('r2', 'running'), b('r1', 'complete')])).toBeUndefined();
  });
});
