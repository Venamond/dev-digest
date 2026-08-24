/**
 * S6 — document relevance and fragment extraction.
 *
 * Hermetic: `read` is a stub, so nothing here touches a clone or the database.
 */
import { describe, it, expect, vi } from 'vitest';
import { selectDocuments } from '../src/modules/brief/documents.js';

/** A reader over an in-memory map; an absent key reads as `undefined`. */
function reader(files: Record<string, string | undefined>) {
  return vi.fn(async (path: string) => files[path]);
}

const CHANGED = ['src/a.ts'];

describe('selectDocuments', () => {
  it('selects a document that names a changed file', async () => {
    const read = reader({
      'docs/one.md': ['# One', 'The money path lives in src/a.ts today.'].join('\n'),
    });
    const out = await selectDocuments([{ path: 'docs/one.md' }], CHANGED, read);

    expect(out).toHaveLength(1);
    expect(out[0]!.path).toBe('docs/one.md');
    expect(out[0]!.title).toBe('One');
    expect(out[0]!.fragments[0]!.lines.join('\n')).toContain('src/a.ts');
  });

  it('does not select a document merely because the pull request edits it', async () => {
    // The trap AC-3 exists for: `docs/edited.md` is IN changedPaths, but its
    // text names no changed file, so it is not relevant.
    const read = reader({
      'docs/edited.md': ['# Edited', 'This document says nothing about code.'].join('\n'),
    });
    const out = await selectDocuments(
      [{ path: 'docs/edited.md' }],
      ['src/a.ts', 'docs/edited.md'],
      read,
    );

    expect(out).toEqual([]);
  });

  it('caps a document at 3 fragments and leaves the later mentions out entirely', async () => {
    // 10 mentions, 10 lines apart so no two windows overlap.
    const lines: string[] = ['# Ten'];
    for (let i = 1; i <= 10; i += 1) {
      while (lines.length < i * 10) lines.push(`filler ${lines.length}`);
      lines.push(`mention-${i} refers to src/a.ts here`);
    }
    const read = reader({ 'docs/ten.md': lines.join('\n') });

    const out = await selectDocuments([{ path: 'docs/ten.md' }], CHANGED, read);
    expect(out[0]!.fragments).toHaveLength(3);

    const all = JSON.stringify(out);
    expect(all).toContain('mention-1');
    expect(all).toContain('mention-3');
    for (const i of [4, 5, 6, 7, 8, 9, 10]) {
      expect(all).not.toContain(`mention-${i}`);
    }
  });

  it('merges two mentions two lines apart into one fragment', async () => {
    const read = reader({
      'docs/near.md': [
        '# Near',
        'intro',
        'first hit src/a.ts',
        'between',
        'second hit src/a.ts',
        'tail',
      ].join('\n'),
    });

    const out = await selectDocuments([{ path: 'docs/near.md' }], CHANGED, read);
    expect(out[0]!.fragments).toHaveLength(1);
    const text = out[0]!.fragments[0]!.lines.join('\n');
    expect(text).toContain('first hit');
    expect(text).toContain('second hit');
  });

  it('keeps the first 3 of 5 relevant documents and drops the rest completely', async () => {
    const files: Record<string, string> = {};
    const docs: { path: string }[] = [];
    for (let i = 1; i <= 5; i += 1) {
      const path = `docs/doc-${i}.md`;
      files[path] = `# Doc ${i}\nrank-${i} mentions src/a.ts`;
      docs.push({ path });
    }

    const out = await selectDocuments(docs, CHANGED, reader(files));
    expect(out.map((d) => d.path)).toEqual(['docs/doc-1.md', 'docs/doc-2.md', 'docs/doc-3.md']);

    const all = JSON.stringify(out);
    expect(all).not.toContain('rank-4');
    expect(all).not.toContain('rank-5');
    expect(all).not.toContain('docs/doc-4.md');
  });

  it('treats an unreadable or empty document as contributing nothing, not an error', async () => {
    const read = reader({ 'docs/gone.md': undefined, 'docs/empty.md': '' });
    await expect(
      selectDocuments([{ path: 'docs/gone.md' }, { path: 'docs/empty.md' }], CHANGED, read),
    ).resolves.toEqual([]);
  });

  it('returns nothing when the pull request changes no files', async () => {
    const read = reader({ 'docs/one.md': '# One\nsrc/a.ts' });
    const out = await selectDocuments([{ path: 'docs/one.md' }], [], read);

    expect(out).toEqual([]);
    // The empty parent short-circuits: no document is even read.
    expect(read).not.toHaveBeenCalled();
  });

  it('falls back to the basename without .md when there is no h1', async () => {
    const read = reader({ 'specs/deep/no-heading.md': 'plain line about src/a.ts' });
    const out = await selectDocuments([{ path: 'specs/deep/no-heading.md' }], CHANGED, read);

    expect(out[0]!.title).toBe('no-heading');
  });
});
