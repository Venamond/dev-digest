/**
 * repo-intel pipeline — walk + filter (step 1+2).
 *
 * Walks a clone directory and returns the set of files the parse phase should
 * process, applying:
 *   - EXCLUDED_DIRS  (node_modules, dist, build, coverage, .next, out, vendor, .git)
 *   - SUPPORTED_EXT  (.ts, .tsx, .js, .jsx, .mjs, .cjs)
 *   - MAX_FILE_SIZE  (400 KB) — files larger than this are counted in
 *                    `stats.skippedTooLarge` and left out of the result.
 *   - MAX_INDEXED_FILES (5000) — if exceeded, take the FIRST N (by walk order)
 *                    and record `stats.bounded = total - N`. T3 will replace
 *                    "first N" with "top N by hotness" once `file_rank` lands.
 *
 * NOT YET HANDLED:
 *   - `.gitignore` filtering. Would require the `ignore` npm package; the
 *     EXCLUDED_DIRS list covers the heaviest dirs (node_modules, build outputs),
 *     so the practical loss is small. TODO(T3): wire `ignore` once we accept
 *     a new dep, OR honor `git ls-files` so we get .gitignore for free.
 *
 * Takes an injected {@link CloneFs} — no direct `node:fs` import.
 */
import { extname, join, relative, sep } from 'node:path';
import type { CloneFs } from '../../../adapters/clone-fs.js';
import {
  EXCLUDED_DIRS,
  MAX_FILE_SIZE,
  MAX_INDEXED_FILES,
  SUPPORTED_EXT,
} from '../constants.js';

const EXCLUDED_SET: ReadonlySet<string> = new Set(EXCLUDED_DIRS);
const SUPPORTED_SET: ReadonlySet<string> = new Set(SUPPORTED_EXT);

export interface WalkStats {
  /** Files seen on disk with a SUPPORTED_EXT extension (before size + bound filters). */
  totalCandidates: number;
  /** Candidates dropped because stat().size > MAX_FILE_SIZE. */
  skippedTooLarge: number;
  /** Candidates dropped because the file list exceeded MAX_INDEXED_FILES. */
  bounded: number;
}

export interface WalkResult {
  /** Paths relative to `root`, separator-normalized to forward slashes. */
  files: string[];
  stats: WalkStats;
}

/**
 * Recursively walk `root`, returning the file set to parse + a small stats
 * object the pipeline persists into `repo_index_state.stats`.
 */
export async function walkClone(root: string, fs: CloneFs): Promise<WalkResult> {
  const out: string[] = [];
  const stats: WalkStats = { totalCandidates: 0, skippedTooLarge: 0, bounded: 0 };

  await walkDir(fs, root, root, out, stats);

  // Stable order: alphabetical relpath. Keeps "first N when bounded" reproducible
  // across runs (until T3 replaces it with rank-driven selection).
  out.sort();

  if (out.length > MAX_INDEXED_FILES) {
    stats.bounded = out.length - MAX_INDEXED_FILES;
    out.length = MAX_INDEXED_FILES;
  }

  return { files: out, stats };
}

async function walkDir(
  fs: CloneFs,
  root: string,
  dir: string,
  out: string[],
  stats: WalkStats,
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    // Unreadable directory (permissions, dangling symlink) — skip cleanly so
    // the indexer keeps making progress on the parts of the clone it CAN read.
    return;
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue; // never follow symlinks (loops, perf)
    const name = entry.name;

    if (entry.isDirectory()) {
      if (EXCLUDED_SET.has(name)) continue;
      await walkDir(fs, root, join(dir, name), out, stats);
      continue;
    }

    if (!entry.isFile()) continue;

    const ext = extname(name).toLowerCase();
    if (!SUPPORTED_SET.has(ext)) continue;

    stats.totalCandidates += 1;

    const full = join(dir, name);
    let size: number;
    try {
      size = (await fs.stat(full)).size;
    } catch {
      continue;
    }
    if (size > MAX_FILE_SIZE) {
      stats.skippedTooLarge += 1;
      continue;
    }

    // Posix-style relative path so DB rows are platform-agnostic (matches the
    // `pr_files.path` convention).
    const rel = relative(root, full).split(sep).join('/');
    out.push(rel);
  }
}
