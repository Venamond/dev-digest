import { describe, it, expect } from 'vitest';
import {
  bodyHeadingDelta,
  bodyLineDelta,
  skillVersionNote,
} from '../src/modules/skills/helpers.js';

describe('bodyHeadingDelta', () => {
  it('detects added headings', () => {
    const from = '# Intro\nhello\n';
    const to = '# Intro\nhello\n\n# Tests\nnew section\n';
    expect(bodyHeadingDelta(from, to)).toEqual({
      added: ['Tests'],
      removed: [],
      reworded: [],
    });
  });

  it('detects removed headings', () => {
    const from = '# Intro\nhello\n\n# Tests\nold\n';
    const to = '# Intro\nhello\n';
    expect(bodyHeadingDelta(from, to)).toEqual({
      added: [],
      removed: ['Tests'],
      reworded: [],
    });
  });

  it('detects reworded content under a shared heading', () => {
    const from = '# Correctness\nCheck null.\n';
    const to = '# Correctness\nCheck null and empty.\n';
    expect(bodyHeadingDelta(from, to)).toEqual({
      added: [],
      removed: [],
      reworded: ['Correctness'],
    });
  });
});

describe('bodyLineDelta', () => {
  it('counts added and removed lines from diffBodies', () => {
    expect(bodyLineDelta('a\nb', 'a\nc')).toEqual({ added: 1, removed: 1 });
  });
});

describe('skillVersionNote', () => {
  const base = {
    name: 'my-skill',
    description: 'A skill.',
    type: 'rubric' as const,
    body: '# Body\ncontent\n',
    source: 'manual' as const,
  };

  it('returns Initial version when there is no previous', () => {
    expect(skillVersionNote({ next: base })).toBe('Initial version');
  });

  it('returns Extracted from codebase scan for extracted source', () => {
    expect(skillVersionNote({ next: { ...base, source: 'extracted' } })).toBe(
      'Extracted from codebase scan',
    );
  });

  it('returns Imported skill for imported_url and community sources', () => {
    expect(skillVersionNote({ next: { ...base, source: 'imported_url' } })).toBe(
      'Imported skill',
    );
    expect(skillVersionNote({ next: { ...base, source: 'community' } })).toBe('Imported skill');
  });

  it('returns Restored from vN when restoredFrom is set', () => {
    expect(
      skillVersionNote({
        previous: base,
        next: { ...base, body: '# Body\nrestored\n' },
        restoredFrom: 3,
      }),
    ).toBe('Restored from v3');
  });

  it('returns Added {heading} section for new headings', () => {
    expect(
      skillVersionNote({
        previous: base,
        next: { ...base, body: '# Body\ncontent\n\n# Tests\nnew\n' },
      }),
    ).toBe('Added Tests section');
  });

  it('returns Removed {heading} section for deleted headings', () => {
    expect(
      skillVersionNote({
        previous: { ...base, body: '# Body\ncontent\n\n# Tests\nold\n' },
        next: base,
      }),
    ).toBe('Removed Tests section');
  });

  it('returns Reworded {heading} when one section changed', () => {
    expect(
      skillVersionNote({
        previous: { ...base, body: '# Correctness\nCheck null.\n' },
        next: { ...base, body: '# Correctness\nCheck null and empty.\n' },
      }),
    ).toBe('Reworded Correctness');
  });

  it('returns Body +N/-M lines when body changed without heading signal', () => {
    expect(
      skillVersionNote({
        previous: { ...base, body: 'line-a\nline-b\n' },
        next: { ...base, body: 'line-a\nline-c\n' },
      }),
    ).toBe('Body +1/-1 lines');
  });

  it('returns Renamed from {old} when name changed', () => {
    expect(
      skillVersionNote({
        previous: { ...base, name: 'pr-rubric' },
        next: { ...base, name: 'security-rubric' },
      }),
    ).toBe('Renamed from pr-rubric');
  });

  it('returns Type {old} → {new} when type changed', () => {
    expect(
      skillVersionNote({
        previous: { ...base, type: 'rubric' },
        next: { ...base, type: 'security' },
      }),
    ).toBe('Type rubric → security');
  });

  it('returns Description updated when description changed', () => {
    expect(
      skillVersionNote({
        previous: { ...base, description: 'Old.' },
        next: { ...base, description: 'New.' },
      }),
    ).toBe('Description updated');
  });

  it('joins multiple metadata parts with ·', () => {
    expect(
      skillVersionNote({
        previous: { ...base, name: 'pr-rubric', type: 'rubric', description: 'Old.' },
        next: { ...base, name: 'security-rubric', type: 'security', description: 'New.' },
      }),
    ).toBe('Renamed from pr-rubric · Type rubric → security · Description updated');
  });
});
