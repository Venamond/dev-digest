import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Review, type RepoRef } from '@devdigest/shared';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';
import {
  MockLLMProvider,
  MockGitClient,
  MockGitHubClient,
  MockCodeIndex,
  MockEmbedder,
} from '../src/adapters/mocks.js';
import { assemblePrompt } from '../src/platform/prompt.js';
import { groundFindings } from '../src/platform/grounding.js';
import { estimateCost } from '../src/adapters/llm/pricing.js';

const REPO: RepoRef = { owner: 'acme', name: 'payments-api' };

describe('mock adapters (no network)', () => {
  it('MockGitClient.diff parses into hunks with new line numbers', async () => {
    const git = new MockGitClient();
    const diff = await git.diff();
    expect(diff.files[0]!.path).toBe('src/config.ts');
    expect(diff.files[0]!.hunks[0]!.newLineNumbers.length).toBeGreaterThan(0);
  });

  it('MockGitHubClient records posted reviews and opened PRs', async () => {
    const gh = new MockGitHubClient();
    await gh.postReview({ owner: 'a', name: 'b' }, 482, { body: 'x', event: 'COMMENT' });
    expect(gh.posted).toHaveLength(1);
    const { url } = await gh.openPullRequest({ owner: 'a', name: 'b' }, {
      title: 't',
      head: 'h',
      base: 'main',
      body: 'b',
    });
    expect(url).toContain('github.com');
  });

  it('MockCodeIndex + MockEmbedder return deterministic shapes', async () => {
    const ci = new MockCodeIndex();
    expect((await ci.symbols({ owner: 'a', name: 'b' }))[0]!.name).toBe('rateLimit');
    const emb = await new MockEmbedder().embed(['a', 'b']);
    expect(emb[0]!).toHaveLength(1536);
  });

  it('MockGitClient implements writeFile and refuses a traversing path', async () => {
    const git = new MockGitClient({ files: { 'specs/api.md': 'old' } });
    await git.writeFile(REPO, 'specs/api.md', 'new');
    expect(await git.readFile(REPO, 'specs/api.md')).toBe('new');
    expect(git.wrote).toEqual([{ path: 'specs/api.md', content: 'new' }]);
    await expect(git.writeFile(REPO, '../../etc/passwd', 'x')).rejects.toThrow(/outside the clone/);
    await expect(git.writeFile(REPO, '/etc/passwd', 'x')).rejects.toThrow(/outside the clone/);
  });
});

describe('SimpleGitClient.writeFile (real fs, no network)', () => {
  /** A clone directory laid out the way `clonePathFor` expects. */
  async function makeClone(): Promise<{ dir: string; clone: string }> {
    const dir = await mkdtemp(join(tmpdir(), 'devdigest-writefile-'));
    const clone = join(dir, REPO.owner, REPO.name);
    await mkdir(join(clone, 'specs'), { recursive: true });
    return { dir, clone };
  }

  it('writes UTF-8 into the clone and reads the same bytes back', async () => {
    const { dir, clone } = await makeClone();
    try {
      const git = new SimpleGitClient(dir);
      expect(git.clonePathFor(REPO)).toBe(clone);
      await git.writeFile(REPO, 'specs/api.md', '# API\n\nNever log a token — ünicode ✓\n');
      expect(await readFile(join(clone, 'specs', 'api.md'), 'utf8')).toBe(
        '# API\n\nNever log a token — ünicode ✓\n',
      );
      expect(await git.readFile(REPO, 'specs/api.md')).toContain('Never log a token');
      // No commit, no remote: the clone is not even a git repository here, and
      // the write still succeeds.
      expect(existsSync(join(clone, '.git'))).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('refuses a traversal, an absolute path, and a symlink pointing out of the clone', async () => {
    const { dir, clone } = await makeClone();
    const outside = join(dir, 'outside.md');
    await writeFile(outside, 'untouched', 'utf8');
    try {
      const git = new SimpleGitClient(dir);
      await expect(git.writeFile(REPO, '../../outside.md', 'pwned')).rejects.toThrow(
        /outside the clone/,
      );
      await expect(git.writeFile(REPO, outside, 'pwned')).rejects.toThrow(/outside the clone/);
      await expect(git.writeFile(REPO, 'specs/../../../outside.md', 'pwned')).rejects.toThrow(
        /outside the clone/,
      );

      // A symlink INSIDE the clone pointing at a file outside it.
      await symlink(outside, join(clone, 'specs', 'escape.md'));
      await expect(git.writeFile(REPO, 'specs/escape.md', 'pwned')).rejects.toThrow(
        /outside the clone/,
      );
      // A symlinked DIRECTORY inside the clone pointing out of it.
      await symlink(dir, join(clone, 'up'));
      await expect(git.writeFile(REPO, 'up/outside.md', 'pwned')).rejects.toThrow(
        /outside the clone/,
      );

      expect(await readFile(outside, 'utf8')).toBe('untouched');
      // It creates no directories, so a write into a missing folder fails.
      await expect(git.writeFile(REPO, 'nope/api.md', 'x')).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('structured review pipeline (mock LLM → grounding)', () => {
  it('runs assemble → completeStructured(Review) → groundFindings end-to-end', async () => {
    // a fixture review where one finding is grounded and one is hallucinated
    const fixture = {
      verdict: 'request_changes',
      summary: 'secret key committed',
      score: 38,
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key',
          file: 'src/config.ts',
          start_line: 11,
          end_line: 11,
          rationale: 'sk_live in diff',
          confidence: 0.98,
          kind: 'finding',
        },
        {
          id: 'f-hallucinated',
          severity: 'WARNING',
          category: 'bug',
          title: 'phantom finding on a line not in the diff',
          file: 'src/config.ts',
          start_line: 999,
          end_line: 999,
          rationale: 'not real',
          confidence: 0.3,
          kind: 'finding',
        },
      ],
    };
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const git = new MockGitClient();
    const diff = await git.diff();

    const { messages } = assemblePrompt({
      system: 'security reviewer',
      diff: diff.raw,
      task: 'Review PR #482',
    });
    const result = await llm.completeStructured({
      model: 'gpt-4.1',
      schema: Review,
      schemaName: 'Review',
      messages,
    });
    expect(result.data.findings).toHaveLength(2);

    const grounded = groundFindings(result.data.findings, diff);
    expect(grounded.kept).toHaveLength(1); // the real one survives
    expect(grounded.kept[0]!.id).toBe('f1');
    expect(grounded.dropped[0]!.finding.id).toBe('f-hallucinated');
    expect(llm.calls.find((c) => c.method === 'completeStructured')).toBeTruthy();
  });
});

describe('pricing / cost discipline', () => {
  it('estimates cost for known models and returns null for unknown', () => {
    expect(estimateCost('gpt-4o-mini', 1_000_000, 0)).toBeCloseTo(0.15, 5);
    expect(estimateCost('some-future-model', 1000, 1000)).toBeNull();
  });
});
