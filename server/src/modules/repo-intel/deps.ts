/**
 * Narrow dependency bag for repo-intel application code.
 *
 * Deliberately NOT `Container`: importing the composition root from
 * service/pipeline creates a no-circular cycle (container → RepoIntelService
 * → container). Callers (composition root, routes, tests) pass any object
 * that structurally matches — typically the Container itself.
 */
import type { CodeIndex, GitClient } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import type { JobRunner } from '../../platform/jobs.js';
import type { DepGraph } from '../../adapters/depgraph/index.js';
import type { Tokenizer } from '../../adapters/tokenizer/index.js';
import type { CloneFs } from '../../adapters/clone-fs.js';
import type { CodeAnalysis } from '../../adapters/code-analysis.js';

export interface RepoIntelConfigSlice {
  repoIntelEnabled: boolean;
}

export interface RepoIntelDeps {
  db: Db;
  git: GitClient;
  codeIndex: CodeIndex;
  jobs: JobRunner;
  config: RepoIntelConfigSlice;
  depgraph: DepGraph;
  tokenizer: Tokenizer;
  /** Clone filesystem (walk + per-file reads) — no direct node:fs in app code. */
  fs: CloneFs;
  /** Ast-grep + extract facts — no concrete adapter imports in app code. */
  codeAnalysis: CodeAnalysis;
}
