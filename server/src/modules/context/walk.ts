/**
 * Project Context — enumerating the markdown documents of a repository's clone,
 * and the one place a stored repository-relative path becomes an absolute one.
 *
 * Application layer (ring 1): every filesystem read goes through the injected
 * {@link CloneFs} port — `node:fs` is never imported here. `node:path` is pure
 * string arithmetic and carries no I/O.
 *
 * This is deliberately NOT `repo-intel`'s walk: that one is bound to
 * `INDEXER_VERSION` and to source extensions, and widening it would change what
 * the code index contains. This enumeration is simpler and separate.
 */
import { extname, isAbsolute, join, resolve, sep } from 'node:path';
import type { CloneDirent, CloneFs } from '../../adapters/clone-fs.js';
import { MARKDOWN_EXTENSION, SKIPPED_DIRS } from './constants.js';

/** One markdown document found under a search root. */
export interface WalkedDoc {
  /** Repository-relative, forward slashes. */
  path: string;
  /** The search root it was found under (`specs`, `docs`, …). */
  root: string;
  /** Size in bytes — fed to `approxTokens`, which takes a character count. */
  size: number;
  /** Last modification, epoch milliseconds — the footer's "updated N ago". */
  mtimeMs: number;
}

/**
 * Turn a repository-relative `relPath` into an absolute path inside
 * `clonePath`, or `null` when it does not belong there.
 *
 * Every stored path is untrusted input: it arrives from the browser through
 * `POST /agents/:id/context`, is persisted, and is later read back and handed
 * to the filesystem. This is the ONLY function that performs that conversion,
 * so a single check covers the read path and the write path alike.
 *
 * Rejected: an empty path, an absolute path, a path containing a `..` segment
 * (checked on the raw separators as well as after normalisation, so a repeated
 * or backslash separator cannot smuggle one past `resolve`), a path carrying a
 * NUL byte, and anything that resolves outside `clonePath`.
 *
 * **This function's check is LEXICAL only.** Its signature is synchronous, so
 * it cannot resolve symlinks; a path that passes here may still lead out of
 * the clone through a link. The physical check therefore happens wherever the
 * I/O does: `SimpleGitClient.writeFile` re-resolves through `realpath` before
 * writing, and `walkMarkdown` below re-resolves every search root through
 * `CloneFs.realpath` (and skips symlinked entries as it descends) before
 * enumerating anything — so no document it emits has its bytes outside the
 * clone.
 */
export function resolveInsideClone(clonePath: string, relPath: string): string | null {
  if (!relPath || isAbsolute(relPath) || relPath.includes('\0')) return null;
  if (relPath.split(/[\\/]/).some((segment) => segment === '..')) return null;
  const base = resolve(clonePath);
  const abs = resolve(base, relPath);
  if (!abs.startsWith(base + sep)) return null;
  return abs;
}

/**
 * Every `.md` file under `roots` in the clone at `clonePath`, repository-relative.
 *
 * A root that does not exist — or cannot be read — contributes nothing rather
 * than throwing: a repository with no `insights/` folder is the normal case,
 * not an error, and the empty list is the empty state the UI renders.
 *
 * Nothing emitted here has its bytes outside the clone. Two guards are needed
 * for that, because a reviewed repository may legally hold a symlink (git
 * stores and checks them out): every search root is re-resolved through
 * `CloneFs.realpath` and dropped unless it really lands inside the clone —
 * `docs -> /etc` is a root that lexically passes and physically escapes — and
 * every symlinked dirent met while descending is skipped. The walked set is
 * what `ContextService.readDoc` validates a requested path against, so a
 * document that escapes here is a document the API will happily read out.
 */
export async function walkMarkdown(
  fs: CloneFs,
  clonePath: string,
  roots: readonly string[],
): Promise<WalkedDoc[]> {
  const out: WalkedDoc[] = [];
  // Resolved once: the clone's own path may contain a link (`/var` on macOS),
  // and everything below is compared against the same resolved form.
  const realBase = await fs.realpath(clonePath).catch(() => null);
  if (realBase == null) return out;
  if (!(await isRealDirInside(fs, clonePath, realBase))) return out;

  // AC-2's default glob matches a root at ANY depth, not only at the top of the
  // repository: `server/docs/adr.md` is as much a document as `docs/adr.md`. So
  // the whole clone is walked once and a file is kept when any segment of its
  // folder path is one of the roots.
  // The loop guard is per BRANCH, not global: the same real directory may be
  // legitimately reachable twice (once as itself, once through a link that
  // points at it), and a global set would drop the second view.
  await collect(fs, clonePath, "", roots, out, realBase, new Set([realBase]));

  const rank = new Map(roots.map((r, i) => [r, i]));
  // Roots keep their configured order; paths are stable within a root.
  out.sort((a, b) => {
    const byRoot = (rank.get(a.root) ?? 0) - (rank.get(b.root) ?? 0);
    if (byRoot !== 0) return byRoot;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });
  return out;
}

/**
 * The root a document belongs to: the OUTERMOST folder segment that is a
 * configured root, so `docs/specs/x.md` is reported under `docs` rather than
 * flipping depending on which root was checked first. `null` when no segment
 * matches — the file is not a project-context document.
 */
export function rootOf(relPath: string, roots: readonly string[]): string | null {
  const segments = relPath.split("/");
  // The last segment is the file name, never a folder.
  for (let i = 0; i < segments.length - 1; i += 1) {
    const seg = segments[i]!;
    if (roots.includes(seg)) return seg;
  }
  return null;
}

async function collect(
  fs: CloneFs,
  absDir: string,
  relDir: string,
  roots: readonly string[],
  out: WalkedDoc[],
  realBase: string,
  seen: Set<string>,
): Promise<void> {
  let entries: CloneDirent[];
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    // Unreadable directory — contributes nothing; nothing here may throw.
    return;
  }
  for (const entry of entries) {
    const abs = join(absDir, entry.name);
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;

    if (entry.isSymbolicLink()) {
      // A link is followed ONLY when it resolves back inside the clone. A repo
      // may legitimately symlink its docs folder; one pointing outside is the
      // escape this whole helper exists to refuse.
      if (SKIPPED_DIRS.includes(entry.name)) continue;
      const real = await fs.realpath(abs).catch(() => null);
      if (real == null) continue;
      if (real !== realBase && !real.startsWith(realBase + sep)) continue;
      // Only a target already on THIS chain is a cycle.
      if (seen.has(real)) continue;
      await collect(fs, abs, rel, roots, out, realBase, new Set([...seen, real]));
      continue;
    }

    if (entry.isDirectory()) {
      if (SKIPPED_DIRS.includes(entry.name)) continue;
      await collect(fs, abs, rel, roots, out, realBase, seen);
      continue;
    }
    if (!entry.isFile()) continue;
    if (extname(entry.name).toLowerCase() !== MARKDOWN_EXTENSION) continue;
    const root = rootOf(rel, roots);
    if (root == null) continue;
    let stat: { size: number; mtimeMs: number };
    try {
      stat = await fs.stat(abs);
    } catch {
      // Enumerated but unreadable — leave it out.
      continue;
    }
    out.push({ path: rel, root, size: stat.size, mtimeMs: stat.mtimeMs });
  }
}

/**
 * Whether `absRoot` still lives inside `realBase` once symlinks are followed.
 * A root that does not exist answers `false` — the same "contributes nothing"
 * as an unreadable one, never an error.
 */
async function isRealDirInside(fs: CloneFs, absRoot: string, realBase: string): Promise<boolean> {
  const real = await fs.realpath(absRoot).catch(() => null);
  if (real == null) return false;
  return real === realBase || real.startsWith(realBase + sep);
}

