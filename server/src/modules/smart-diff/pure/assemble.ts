import type { SmartDiff, SmartDiffFile, SmartDiffGroup, SmartDiffRole, ProposedSplit } from '@devdigest/shared';
import { classifyPath } from './classify.js';
import { summarizePatch } from './summary.js';
import {
  MAX_PROPOSED_SPLITS,
  ROLE_ORDER,
  ROOT_SPLIT_NAME,
  SPLIT_MIN_FILES_PER_GROUP,
  SPLIT_TOO_BIG_TOTAL_LINES,
} from './constants.js';

export type SmartDiffFileInput = {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
};

type Bucketed = SmartDiffFile & { role: SmartDiffRole };

/**
 * Build the full Smart Diff response from raw PR files + finding lines.
 * Calls classifyPath / summarizePatch itself — the service passes only the
 * two named fields of this single input object. See
 * docs/plans/2026-08-14-smart-diff.md S3 for the algorithm.
 */
export function buildSmartDiff(input: {
  files: SmartDiffFileInput[];
  findingLinesByFile: Map<string, number[]>;
}): SmartDiff {
  const { files, findingLinesByFile } = input;

  // 1. Map + classify each file.
  const mapped: Bucketed[] = files.map((f) => ({
    path: f.path,
    pseudocode_summary: summarizePatch(f.patch),
    additions: f.additions,
    deletions: f.deletions,
    finding_lines: [...new Set(findingLinesByFile.get(f.path) ?? [])].sort((a, b) => a - b),
    role: classifyPath(f.path),
  }));

  // 2. Bucket by role, sort within each bucket by size desc then path asc.
  const buckets = new Map<SmartDiffRole, Bucketed[]>();
  for (const role of ROLE_ORDER) buckets.set(role, []);
  for (const f of mapped) buckets.get(f.role)!.push(f);
  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => {
      const sizeDiff = b.additions + b.deletions - (a.additions + a.deletions);
      if (sizeDiff !== 0) return sizeDiff;
      return a.path.localeCompare(b.path);
    });
  }

  // 3. Emit groups for non-empty buckets, walking ROLE_ORDER.
  const groups: SmartDiffGroup[] = [];
  for (const role of ROLE_ORDER) {
    const bucketFiles = buckets.get(role)!;
    if (bucketFiles.length === 0) continue;
    groups.push({
      role,
      files: bucketFiles.map(({ role: _role, ...rest }) => rest),
    });
  }

  // 4. total_lines: core + wiring only.
  const coreFiles = buckets.get('core')!;
  const wiringFiles = buckets.get('wiring')!;
  const total_lines = [...coreFiles, ...wiringFiles].reduce(
    (sum, f) => sum + f.additions + f.deletions,
    0,
  );

  // 5. too_big
  const too_big = total_lines > SPLIT_TOO_BIG_TOTAL_LINES;

  // 6. proposed_splits
  let proposed_splits: ProposedSplit[] = [];
  if (too_big) {
    const byFirstSegment = new Map<string, string[]>();
    for (const f of coreFiles) {
      const slashIndex = f.path.indexOf('/');
      const name = slashIndex === -1 ? ROOT_SPLIT_NAME : f.path.slice(0, slashIndex);
      const list = byFirstSegment.get(name) ?? [];
      list.push(f.path);
      byFirstSegment.set(name, list);
    }
    proposed_splits = [...byFirstSegment.entries()]
      .filter(([, paths]) => paths.length >= SPLIT_MIN_FILES_PER_GROUP)
      .sort((a, b) => {
        const countDiff = b[1].length - a[1].length;
        if (countDiff !== 0) return countDiff;
        return a[0].localeCompare(b[0]);
      })
      .slice(0, MAX_PROPOSED_SPLITS)
      .map(([name, paths]) => ({ name, files: paths }));
  }

  return { groups, split_suggestion: { too_big, total_lines, proposed_splits } };
}
