/**
 * S5 — `modules/context/walk.ts`.
 *
 * Hermetic: no DB, no git, no real filesystem. The walk takes an injected
 * `CloneFs`, so an in-memory one is enough — and it is the only way to model a
 * symlink dirent without creating one on disk.
 */
import { describe, it, expect } from 'vitest';
import type { CloneDirent, CloneFs } from '../src/adapters/clone-fs.js';
import { resolveInsideClone, rootOf, walkMarkdown } from '../src/modules/context/walk.js';
import { DEFAULT_ROOTS } from '../src/modules/context/constants.js';

const CLONE = '/clones/acme/api';

type Entry = { kind: 'file' | 'dir' | 'symlink'; content?: string };

/**
 * In-memory CloneFs over a flat `absolute path → entry` map. Directories are
 * implied by their children; `dirs` lists the ones that must exist as entries
 * of their parent.
 *
 * `links` models real symlinks — `{ '<clone>/docs': '/etc' }` is `docs -> /etc`
 * — and `readdir`/`realpath` both follow them, exactly as `node:fs` does. That
 * is the only way to reproduce a root whose bytes live outside the clone.
 */
function memFs(
  files: Record<string, string>,
  symlinks: string[] = [],
  links: Record<string, string> = {},
): CloneFs {
  const entries = new Map<string, Entry>();
  for (const [path, content] of Object.entries(files)) {
    entries.set(path, { kind: 'file', content });
    // Imply every parent directory up to the clone root.
    let parent = path.slice(0, path.lastIndexOf('/'));
    while (parent.length > CLONE.length) {
      entries.set(parent, { kind: 'dir' });
      parent = parent.slice(0, parent.lastIndexOf('/'));
    }
  }
  for (const path of symlinks) entries.set(path, { kind: 'symlink' });
  // A real `readdir` LISTS a symlink as a dirent; only `realpath` resolves it.
  // The walk discovers roots by listing, so a link that exists solely in the
  // `links` table would be invisible to it — and invisible in the fixture only,
  // never on a real clone.
  for (const path of Object.keys(links)) {
    if (!entries.has(path)) entries.set(path, { kind: 'symlink' });
  }

  const dirent = (name: string, kind: Entry['kind']): CloneDirent => ({
    name,
    isFile: () => kind === 'file',
    isDirectory: () => kind === 'dir',
    isSymbolicLink: () => kind === 'symlink',
  });

  /** Follow `links` the way the kernel does: the entry itself, or a prefix. */
  const follow = (path: string): string => {
    const exact = links[path];
    if (exact) return exact;
    for (const [link, target] of Object.entries(links)) {
      if (path.startsWith(`${link}/`)) return target + path.slice(link.length);
    }
    return path;
  };

  const exists = (path: string) =>
    entries.has(path) || path === CLONE || [...entries.keys()].some((p) => p.startsWith(`${path}/`));

  return {
    async readFile(path) {
      const entry = entries.get(follow(path));
      if (!entry || entry.kind !== 'file') throw new Error(`ENOENT: ${path}`);
      return entry.content ?? '';
    },
    async realpath(path) {
      const real = follow(path);
      if (!exists(real)) throw new Error(`ENOENT: ${path}`);
      return real;
    },
    async readdir(pathIn) {
      const path = follow(pathIn);
      const prefix = `${path}/`;
      const children = [...entries.keys()].filter(
        (p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'),
      );
      // A directory nobody put a child in does not exist — the missing-root case.
      if (children.length === 0 && !entries.has(path)) throw new Error(`ENOENT: ${path}`);
      return children.map((p) => dirent(p.slice(prefix.length), entries.get(p)!.kind));
    },
    async stat(pathIn) {
      const entry = entries.get(follow(pathIn));
      if (!entry) throw new Error(`ENOENT: ${pathIn}`);
      return { size: (entry.content ?? '').length };
    },
  };
}

describe('walkMarkdown', () => {
  it('finds the same file name under two roots, each with its own root (AC-3)', async () => {
    const fs = memFs({
      [`${CLONE}/specs/api.md`]: '# specs api',
      [`${CLONE}/docs/api.md`]: '# docs api',
    });

    const docs = await walkMarkdown(fs, CLONE, DEFAULT_ROOTS);

    expect(docs).toEqual([
      { path: 'specs/api.md', root: 'specs', size: '# specs api'.length },
      { path: 'docs/api.md', root: 'docs', size: '# docs api'.length },
    ]);
    // Two distinguishable documents, not one — the bare file name is ambiguous.
    expect(new Set(docs.map((d) => d.path)).size).toBe(2);
  });

  it('recurses into subdirectories and keeps repository-relative paths', async () => {
    const fs = memFs({
      [`${CLONE}/docs/adr/0002-onion.md`]: 'b',
      [`${CLONE}/docs/adr/0001-ports.md`]: 'a',
      [`${CLONE}/docs/index.md`]: 'i',
    });

    const docs = await walkMarkdown(fs, CLONE, ['docs']);

    expect(docs.map((d) => d.path)).toEqual([
      'docs/adr/0001-ports.md',
      'docs/adr/0002-onion.md',
      'docs/index.md',
    ]);
  });

  it('excludes anything that is not .md', async () => {
    const fs = memFs({
      [`${CLONE}/docs/api.md`]: 'keep',
      [`${CLONE}/docs/api.mdx`]: 'drop',
      [`${CLONE}/docs/api.txt`]: 'drop',
      [`${CLONE}/docs/Makefile`]: 'drop',
    });

    expect((await walkMarkdown(fs, CLONE, ['docs'])).map((d) => d.path)).toEqual([
      'docs/api.md',
    ]);
  });

  it('yields [] for a root that does not exist, rather than throwing', async () => {
    const fs = memFs({ [`${CLONE}/specs/api.md`]: 'x' });

    await expect(walkMarkdown(fs, CLONE, ['insights'])).resolves.toEqual([]);
    // …and the roots that DO exist are unaffected by the one that does not.
    expect((await walkMarkdown(fs, CLONE, DEFAULT_ROOTS)).map((d) => d.path)).toEqual([
      'specs/api.md',
    ]);
  });

  it('never emits a symlink — a link inside the clone can point outside it', async () => {
    const fs = memFs(
      { [`${CLONE}/docs/real.md`]: 'real' },
      [`${CLONE}/docs/passwd.md`, `${CLONE}/docs/elsewhere`],
    );

    expect((await walkMarkdown(fs, CLONE, ['docs'])).map((d) => d.path)).toEqual([
      'docs/real.md',
    ]);
  });

  it('ignores a search root that is a symlink out of the clone', async () => {
    // `docs -> /etc`: git stores and checks out symlinks, so a reviewed
    // repository may legally contain this. The path passes every LEXICAL check
    // — it has no `..` and resolves under the clone — and the bytes it reaches
    // are outside it. `readdir` follows the link here exactly as the kernel
    // does, so without the realpath guard this fixture yields `docs/passwd.md`.
    const fs = memFs(
      { [`${CLONE}/specs/api.md`]: 'x', '/etc/passwd.md': 'root:x:0:0' },
      [],
      { [`${CLONE}/docs`]: '/etc' },
    );

    await expect(walkMarkdown(fs, CLONE, ['docs'])).resolves.toEqual([]);
    // …and the roots that are genuinely inside the clone still enumerate.
    expect((await walkMarkdown(fs, CLONE, DEFAULT_ROOTS)).map((d) => d.path)).toEqual([
      'specs/api.md',
    ]);
  });

  it('finds a root at ANY depth, not only at the top of the repository (AC-2)', async () => {
    // AC-2's default glob puts a globstar BEFORE the root name, so
    // `server/docs/adr.md` is a document exactly as `docs/adr.md` is. Walking
    // only `<clone>/docs` would return the second and silently miss the first.
    const fs = memFs({
      [`${CLONE}/docs/top.md`]: 'a',
      [`${CLONE}/server/docs/adr.md`]: 'b',
      [`${CLONE}/client/specs/ui.md`]: 'c',
      [`${CLONE}/server/src/notes.md`]: 'not under a root',
    });

    const found = await walkMarkdown(fs, CLONE, ['specs', 'docs']);
    expect(found.map((d) => d.path).sort()).toEqual([
      'client/specs/ui.md',
      'docs/top.md',
      'server/docs/adr.md',
    ]);
    // The root reported is the segment that matched, wherever it sat.
    expect(found.find((d) => d.path === 'server/docs/adr.md')?.root).toBe('docs');
    expect(found.find((d) => d.path === 'client/specs/ui.md')?.root).toBe('specs');
  });

  it('never descends into node_modules, however deep a docs folder sits there', async () => {
    const fs = memFs({
      [`${CLONE}/docs/real.md`]: 'a',
      [`${CLONE}/node_modules/pkg/docs/vendored.md`]: 'b',
    });
    expect((await walkMarkdown(fs, CLONE, ['docs'])).map((d) => d.path)).toEqual(['docs/real.md']);
  });

  it('keeps a root that only LOOKS linked — one resolving back inside the clone', async () => {
    // `docs -> <clone>/documentation` never leaves the clone, so it is walked.
    const fs = memFs(
      { [`${CLONE}/documentation/api.md`]: 'inside' },
      [],
      { [`${CLONE}/docs`]: `${CLONE}/documentation` },
    );

    expect((await walkMarkdown(fs, CLONE, ['docs'])).map((d) => d.path)).toEqual([
      'docs/api.md',
    ]);
  });

  it('ignores a configured root that escapes the clone', async () => {
    const fs = memFs({ [`${CLONE}/specs/api.md`]: 'x' });

    await expect(walkMarkdown(fs, CLONE, ['../../etc'])).resolves.toEqual([]);
    await expect(walkMarkdown(fs, CLONE, ['/etc'])).resolves.toEqual([]);
  });
});

describe('rootOf — the one rule the walk AND both guards share', () => {
  const ROOTS = ['specs', 'docs', 'insights'];

  it('matches a root at any depth, which is what AC-2 asks for', () => {
    expect(rootOf('docs/adr.md', ROOTS)).toBe('docs');
    expect(rootOf('server/docs/adr.md', ROOTS)).toBe('docs');
    expect(rootOf('a/b/c/insights/x.md', ROOTS)).toBe('insights');
  });

  it('reports the OUTERMOST matching segment, so the answer is stable', () => {
    // Otherwise the reported root would depend on which root was checked first.
    expect(rootOf('docs/specs/x.md', ROOTS)).toBe('docs');
    expect(rootOf('specs/docs/x.md', ROOTS)).toBe('specs');
  });

  it('ignores the FILE name — only folder segments count', () => {
    // `docs.md` at the top level is not a project-context document.
    expect(rootOf('docs.md', ROOTS)).toBeNull();
    expect(rootOf('README.md', ROOTS)).toBeNull();
  });

  it('rejects a path under no root, which is what keeps the guards closed', () => {
    expect(rootOf('server/src/index.md', ROOTS)).toBeNull();
  });
});

describe('resolveInsideClone', () => {
  it('resolves a legitimate repository-relative path', () => {
    expect(resolveInsideClone(CLONE, 'specs/api.md')).toBe(`${CLONE}/specs/api.md`);
    expect(resolveInsideClone(CLONE, 'docs/adr/0001-ports.md')).toBe(
      `${CLONE}/docs/adr/0001-ports.md`,
    );
  });

  it('rejects traversal, absolute paths and the empty path', () => {
    expect(resolveInsideClone(CLONE, '../../etc/passwd')).toBeNull();
    expect(resolveInsideClone(CLONE, 'specs/../../../etc/passwd')).toBeNull();
    expect(resolveInsideClone(CLONE, '/etc/passwd')).toBeNull();
    expect(resolveInsideClone(CLONE, '')).toBeNull();
    expect(resolveInsideClone(CLONE, '.')).toBeNull();
  });

  it('rejects a `..` hidden behind an odd separator or a NUL byte', () => {
    // `resolve` normalises `//` away, so the raw-segment check is what catches this.
    expect(resolveInsideClone(CLONE, 'specs//../../etc/passwd')).toBeNull();
    expect(resolveInsideClone(CLONE, 'specs\\..\\..\\etc\\passwd')).toBeNull();
    expect(resolveInsideClone(CLONE, 'specs/api.md\0.png')).toBeNull();
  });

  it('does not let a sibling directory pass as a prefix match', () => {
    // `/clones/acme/api-secrets` starts with the clone path as a STRING but is
    // not inside it; the separator in the comparison is what rules it out.
    expect(resolveInsideClone('/clones/acme/api', '../api-secrets/x.md')).toBeNull();
  });
});
