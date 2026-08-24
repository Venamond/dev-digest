/**
 * Protocol-safety and package-purity guards (S6).
 *
 * `mcp/` is not walked by either dependency-cruiser config in this repo
 * (`server/.dependency-cruiser.cjs` anchors `from.path` at `^src/…` and is
 * only ever invoked against `server/src`; `reviewer-core/.dependency-cruiser.cjs`
 * is only ever invoked against `../reviewer-core/src`). So the purity of
 * `mcp/` is enforced here, by a package-local source scan, per D6 in
 * docs/plans/2026-08-18-mcp-server.md.
 *
 * S0 selected **Branch B**: `mcp/tsconfig.json` carries no `@devdigest/shared`
 * paths entry (Zod 4 fails to compile the Zod-3-authored contracts — see
 * `mcp/src/api/types.ts`'s header comment). Under Branch B the alias does not
 * exist at all, so `sharedImportViolations` below flags every `@devdigest/shared`
 * specifier regardless of `typeOnly` — there is no type-only exception,
 * because there is no alias to import type-only *from*.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src');

/** Every import statement's specifier, plus whether it was `import type`. */
export function importsOf(source: string): { specifier: string; typeOnly: boolean }[] {
  const results: { specifier: string; typeOnly: boolean }[] = [];

  // `import [type] <clause> from '<spec>'` — the clause is matched lazily
  // and excludes quote characters, so it tolerates a clause that spans
  // multiple lines (the character class `[^'"]` matches `\n` too).
  const withClause = /import\s+(type\s+)?[^'"]*?\bfrom\b\s*(['"])((?:(?!\2)[\s\S])*)\2/g;
  for (const m of source.matchAll(withClause)) {
    results.push({ specifier: m[3]!, typeOnly: Boolean(m[1]) });
  }

  // The side-effect form has no clause and no `from` — the specifier follows
  // `import` directly: `import '<spec>';`.
  const sideEffect = /import\s*(['"])((?:(?!\1)[\s\S])*)\1\s*;/g;
  for (const m of source.matchAll(sideEffect)) {
    results.push({ specifier: m[2]!, typeOnly: false });
  }

  return results;
}

const isShared = (s: string): boolean => s === '@devdigest/shared' || s.startsWith('@devdigest/shared/');

/**
 * Specifiers that violate the `@devdigest/shared` rule for the active branch.
 *
 * Branch B (selected by S0, this repo): the alias no longer exists, so
 * *every* `isShared` specifier is a violation — type-only or not.
 */
export function sharedImportViolations(source: string): string[] {
  return importsOf(source)
    .filter((imp) => isShared(imp.specifier))
    .map((imp) => imp.specifier);
}

const NO_SERVER_INTERNALS = /(drizzle-orm|^postgres$|^fastify$|@fastify\/|\.\.\/server\/src|@devdigest\/reviewer-core)/;

function listSourceFiles(): string[] {
  const entries = readdirSync(SRC_DIR, { recursive: true }) as string[];
  return entries.filter((entry) => entry.endsWith('.ts')).map((entry) => path.join(SRC_DIR, entry));
}

describe('sharedImportViolations (guard unit tests)', () => {
  it('the shared-contracts guard catches a bare value import', () => {
    const source = `import { Finding } from '@devdigest/shared';`;

    expect(sharedImportViolations(source)).toEqual(['@devdigest/shared']);
  });

  it('the shared-contracts guard catches a subpath value import', () => {
    const bare = `import { Finding } from '@devdigest/shared/contracts/findings.js';`;
    expect(sharedImportViolations(bare)).toEqual(['@devdigest/shared/contracts/findings.js']);

    // Branch B: there is no alias at all, so a type-only subpath import is
    // still a violation — unlike branch A, there is no exception here.
    const typeOnly = `import type { Finding } from '@devdigest/shared/contracts/findings.js';`;
    expect(sharedImportViolations(typeOnly)).toEqual(['@devdigest/shared/contracts/findings.js']);
  });
});

describe('mcp/src source scan', () => {
  it('no source file writes to stdout', () => {
    const files = listSourceFiles();
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      if (/\bconsole\.(log|info|debug|dir|table|trace)\s*\(/.test(source)) {
        throw new Error(`${file}: console.log/info/debug/dir/table/trace writes to stdout`);
      }
      if (/process\.stdout\.write/.test(source)) {
        throw new Error(`${file}: process.stdout.write writes to stdout`);
      }
    }
  });

  it('@devdigest/shared is never imported, bare or subpath', () => {
    const files = listSourceFiles();
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const violations = sharedImportViolations(source);
      if (violations.length > 0) {
        throw new Error(`${file}: imports @devdigest/shared under branch B (${violations.join(', ')})`);
      }
    }
  });

  it('no source file imports drizzle-orm, postgres, fastify, or server internals', () => {
    const files = listSourceFiles();
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const violations = importsOf(source)
        .filter((imp) => NO_SERVER_INTERNALS.test(imp.specifier))
        .map((imp) => imp.specifier);
      if (violations.length > 0) {
        throw new Error(`${file}: imports a server internal (${violations.join(', ')})`);
      }
    }
  });
});
