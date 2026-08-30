import { simpleGit, type SimpleGit } from 'simple-git';
import { join, resolve, isAbsolute, dirname, basename, sep } from 'node:path';
import {
  mkdir,
  readFile,
  writeFile,
  access,
  rm,
  realpath,
  lstat,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import type {
  GitClient,
  RepoRef,
  CloneOptions,
  UnifiedDiff,
  BlameLine,
  GitCommit,
} from '@devdigest/shared';
import { parseUnifiedDiff } from './diff-parser.js';

/**
 * Depth fetched by `sync()`. Deeper than the shallow clone (CLONE_DEPTH=1) so the
 * previously-indexed sha is usually reachable, keeping the resync diff incremental;
 * when it isn't, the indexer falls back to a full reindex.
 */
const RESYNC_FETCH_DEPTH = 50;

/**
 * GitClient over simple-git. Repos clone to
 * `<cloneDir>/<owner>/<repo>`. We NEVER execute repo code — only git ops.
 */
export class SimpleGitClient implements GitClient {
  constructor(private cloneDir: string) {
    // Force non-interactive auth so an unauthenticated/private clone fails in
    // ~1s with a clear error instead of hanging on a credential prompt until the
    // job timeout. Set on process.env (inherited by git subprocesses) rather
    // than via simple-git's .env(), which inspects and rejects vars like
    // PAGER/EDITOR present in the shell environment.
    process.env.GIT_TERMINAL_PROMPT ??= '0';
    process.env.GCM_INTERACTIVE ??= 'never';
  }

  clonePathFor(repo: RepoRef): string {
    return join(this.cloneDir, repo.owner, repo.name);
  }

  private git(repo: RepoRef): SimpleGit {
    return simpleGit(this.clonePathFor(repo));
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async clone(repo: RepoRef, url: string, opts?: CloneOptions): Promise<{ path: string }> {
    const dest = this.clonePathFor(repo);
    await mkdir(join(this.cloneDir, repo.owner), { recursive: true });
    if (await this.exists(join(dest, '.git'))) {
      // already cloned → fetch latest
      await simpleGit(dest).fetch();
      return { path: dest };
    }
    // A prior clone may have timed out mid-write, leaving a partial dir without
    // a .git — git clone refuses a non-empty dest, so clear it first.
    if (await this.exists(dest)) await rm(dest, { recursive: true, force: true });
    const args: string[] = [];
    if (opts?.depth) args.push('--depth', String(opts.depth));
    if (opts?.branch) args.push('--branch', opts.branch);
    await simpleGit(this.cloneDir).clone(url, dest, args);
    return { path: dest };
  }

  async fetchPullHead(repo: RepoRef, n: number): Promise<void> {
    // Fetch the PR head ref into a local ref (GitHub exposes pull/<n>/head).
    await this.git(repo).fetch(['origin', `pull/${n}/head:pr-${n}`]);
  }

  async sync(repo: RepoRef, branch: string): Promise<{ head: string }> {
    // Resync the read-only mirror to upstream. A bare `fetch` only moves
    // `origin/<branch>`, so we `reset --hard` to advance local HEAD + worktree —
    // safe here because we never commit to or run code from the clone.
    // Fetch a bounded depth (> the shallow CLONE_DEPTH) so the prior indexed sha
    // is usually reachable for an incremental diff; the indexer falls back to a
    // full reindex when it isn't.
    const g = this.git(repo);
    await g.fetch(['origin', branch, '--depth', String(RESYNC_FETCH_DEPTH)]);
    await g.reset(['--hard', `origin/${branch}`]);
    return { head: (await g.revparse(['HEAD'])).trim() };
  }

  async currentHead(repo: RepoRef): Promise<string> {
    return (await this.git(repo).revparse(['HEAD'])).trim();
  }

  async diff(repo: RepoRef, base: string, head: string): Promise<UnifiedDiff> {
    const raw = await this.git(repo).diff([`${base}...${head}`]);
    return parseUnifiedDiff(raw);
  }

  /**
   * `git diff --name-only base..head` — used by the incremental indexer to
   * pick the file set that changed since `last_indexed_sha`. Two-dot is
   * intentional (commits reachable from `head` but not `base`), unlike the
   * three-dot symmetric form `diff()` uses for review diffs.
   */
  async diffNameOnly(repo: RepoRef, base: string, head: string): Promise<string[]> {
    if (base === head) return [];
    const raw = await this.git(repo).raw(['diff', '--name-only', `${base}..${head}`]);
    return raw
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  async blame(repo: RepoRef, path: string): Promise<BlameLine[]> {
    const raw = await this.git(repo).raw(['blame', '--line-porcelain', path]);
    return parseBlamePorcelain(raw);
  }

  async log(repo: RepoRef, path?: string): Promise<GitCommit[]> {
    const log = await this.git(repo).log(path ? { file: path } : undefined);
    return log.all.map((c) => ({
      sha: c.hash,
      message: c.message,
      author: c.author_name,
      date: c.date,
    }));
  }

  async readFile(repo: RepoRef, path: string): Promise<string> {
    return readFile(join(this.clonePathFor(repo), path), 'utf8');
  }

  /**
   * Write UTF-8 `content` to a repository-relative `path` inside the clone.
   *
   * `path` originates in the browser, so this method does NOT trust the caller
   * to have validated it — the service's own check is the first guard, this is
   * the second. It refuses an absolute path, any `..` segment, and anything
   * that resolves outside the clone once symlinks are followed. It creates no
   * directories (a write into a path that does not exist yet fails), makes no
   * commit and contacts no remote: the edit lives in the working tree until the
   * next resync overwrites it.
   */
  async writeFile(repo: RepoRef, path: string, content: string): Promise<void> {
    const dest = await this.resolveWritable(this.clonePathFor(repo), path);
    await writeFile(dest, content, 'utf8');
  }

  async createFile(repo: RepoRef, path: string, content: string): Promise<void> {
    const base = this.clonePathFor(repo);
    // Validate the FULL path first, with the same rules as a write, before any
    // directory is made — otherwise a rejected path could still leave folders
    // behind inside the clone.
    const dest = await this.resolveWritable(base, path, { allowMissingParent: true });
    if (await lstat(dest).catch(() => null)) {
      throw new Error(`refusing to overwrite an existing document: ${path}`);
    }
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, content, 'utf8');
  }

  /** Absolute destination inside `base`, or throw. See `writeFile`. */
  private async resolveWritable(
    base: string,
    relPath: string,
    opts: { allowMissingParent?: boolean } = {},
  ): Promise<string> {
    if (!relPath || isAbsolute(relPath)) {
      throw new Error(`refusing to write outside the clone: ${relPath}`);
    }
    // Reject `..` on the raw segments as well as after normalisation, so a
    // Windows-style or repeated separator cannot smuggle one past `resolve`.
    if (relPath.split(/[\\/]/).some((seg) => seg === '..')) {
      throw new Error(`refusing to write outside the clone: ${relPath}`);
    }
    const dest = resolve(base, relPath);
    if (!dest.startsWith(base + sep)) {
      throw new Error(`refusing to write outside the clone: ${relPath}`);
    }
    // Symlinks: a link INSIDE the clone pointing out of it is the same problem
    // in another shape, so containment is re-checked on the real paths. The
    // parent must already exist — we create no directories.
    const realBase = await realpath(base);
    // When creating, the parent may not exist yet — resolve the nearest ancestor
    // that does, so a symlinked ancestor still cannot carry us out of the clone.
    let probe = dirname(dest);
    if (opts.allowMissingParent) {
      while (probe.startsWith(base) && !(await lstat(probe).catch(() => null))) {
        probe = dirname(probe);
      }
    }
    const realParent = await realpath(probe);
    if (realParent !== realBase && !realParent.startsWith(realBase + sep)) {
      throw new Error(`refusing to write outside the clone: ${relPath}`);
    }
    const existing = await lstat(dest).catch(() => null);
    if (existing?.isSymbolicLink()) {
      const realDest = await realpath(dest);
      if (!realDest.startsWith(realBase + sep)) {
        throw new Error(`refusing to write outside the clone: ${relPath}`);
      }
      return realDest;
    }
    return join(realParent, basename(dest));
  }
}

function parseBlamePorcelain(raw: string): BlameLine[] {
  const out: BlameLine[] = [];
  const lines = raw.split('\n');
  let sha = '';
  let author = '';
  let date = '';
  let summary = '';
  let lineNo = 0;
  for (const line of lines) {
    const header = line.match(/^([0-9a-f]{40})\s+\d+\s+(\d+)/);
    if (header) {
      sha = header[1]!;
      lineNo = Number(header[2]);
    } else if (line.startsWith('author ')) author = line.slice(7);
    else if (line.startsWith('author-time '))
      date = new Date(Number(line.slice(12)) * 1000).toISOString();
    else if (line.startsWith('summary ')) summary = line.slice(8);
    else if (line.startsWith('\t')) {
      out.push({ line: lineNo, sha, author, date, summary });
    }
  }
  return out;
}
