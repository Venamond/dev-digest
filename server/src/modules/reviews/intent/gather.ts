import { posix } from 'node:path';
import type { GitClient, GitHubClient, IntentMissingContext } from '@devdigest/shared';
import type { PullRow } from '../../../db/rows.js';

const FILE_EXCERPT_CAP = 4000;
const HUNK_HEADER = /^@@ /;
const ISSUE_HASH = /(?:closes|fixes|resolves)?\s*#(\d+)/gi;
const URL_RE = /https?:\/\/[^\s<>)"'\]]+/gi;
const MD_LINK = /\[[^\]]*\]\(([^)]+)\)/g;
const DOCS_EXT = /\.(?:md|txt|rst)$/i;
const MANIFEST_NAMES = new Set([
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'Cargo.toml',
  'go.mod',
  'requirements.txt',
  'pyproject.toml',
]);

export type GatherInput = {
  repo: { owner: string; name: string };
  pull: PullRow;
  files: { path: string; patch: string | null }[];
  commits: { message: string }[];
  github: GitHubClient | null;
  git: GitClient;
};

export type GatherResult = {
  evidenceText: string;
  missing_context: IntentMissingContext[];
  sourceLabels: string[];
};

export type NormalizedPath =
  | { ok: true; path: string }
  | { ok: false; reason: string };

/** Strip `./` and one leading `/`, posix.normalize, reject traversal / absolute. */
export function normalizeRepoPath(raw: string): NormalizedPath {
  let p = raw.trim();
  if (p.startsWith('./')) p = p.slice(2);
  if (p.startsWith('/')) p = p.slice(1);
  if (!p) return { ok: false, reason: 'empty path' };
  const normalized = posix.normalize(p);
  if (
    !normalized ||
    normalized === '.' ||
    posix.isAbsolute(normalized) ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized === '..' ||
    normalized.startsWith('../')
  ) {
    return { ok: false, reason: 'path rejected' };
  }
  return { ok: true, path: normalized };
}

function stripUrlJunk(raw: string): string {
  return raw.replace(/[),.;:]+$/g, '');
}

function sameRepo(owner: string, name: string, a: string, b: string): boolean {
  return owner.toLowerCase() === a.toLowerCase() && name.toLowerCase() === b.toLowerCase();
}

function githubPathParts(url: URL): string[] {
  return url.pathname.split('/').filter(Boolean);
}

function isGithubHost(host: string): boolean {
  return host.replace(/^www\./i, '').toLowerCase() === 'github.com';
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function pushMissing(
  missing: IntentMissingContext[],
  lines: string[],
  entry: IntentMissingContext,
): void {
  missing.push(entry);
  lines.push(`UNAVAILABLE: ${entry.kind} ${entry.ref} — ${entry.reason}`);
}

function looksLikeDocsPath(p: string): boolean {
  if (!p || p.startsWith('http://') || p.startsWith('https://') || p.startsWith('#')) return false;
  return p.includes('/') || DOCS_EXT.test(p);
}

export async function gather(input: GatherInput): Promise<GatherResult> {
  const { repo, pull, files, commits, github, git } = input;
  const missing: IntentMissingContext[] = [];
  const sourceLabels: string[] = [];
  const lines: string[] = [];
  const handledUrls = new Set<string>();
  const fetchedIssues = new Set<number>();

  const titleBody = `${pull.title}\n${pull.body ?? ''}`;
  const bodyEmpty = !pull.body?.trim();

  sourceLabels.push('title');
  lines.push(`TITLE: ${pull.title}`);

  sourceLabels.push('body');
  if (bodyEmpty) {
    lines.push('PR_BODY: empty');
  } else {
    lines.push(`BODY:\n${pull.body}`);
  }

  const urls = [...titleBody.matchAll(URL_RE)].map((m) => stripUrlJunk(m[0]));

  const issueUrls: { url: string; parsed: URL }[] = [];
  const otherUrls: { url: string; parsed: URL | null }[] = [];
  for (const url of urls) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      otherUrls.push({ url, parsed: null });
      continue;
    }
    const parts = githubPathParts(parsed);
    const isIssue =
      isGithubHost(parsed.hostname) && parts.length >= 4 && parts[2]?.toLowerCase() === 'issues';
    if (isIssue) issueUrls.push({ url, parsed });
    else otherUrls.push({ url, parsed });
  }

  const hashNums: number[] = [];
  for (const m of titleBody.matchAll(ISSUE_HASH)) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) hashNums.push(n);
  }

  const fetchIssue = async (n: number, ref: string) => {
    if (fetchedIssues.has(n)) return;
    fetchedIssues.add(n);
    if (!github) {
      pushMissing(missing, lines, {
        kind: 'github_unavailable',
        ref,
        reason: 'GITHUB_TOKEN is not configured',
      });
      return;
    }
    try {
      const issue = await github.getIssue(repo, n);
      sourceLabels.push(`issue:#${n}`);
      lines.push(`ISSUE #${issue.number}: ${issue.title}`);
      if (issue.body) lines.push(`ISSUE_BODY:\n${issue.body}`);
    } catch (err) {
      pushMissing(missing, lines, {
        kind: 'issue_fetch_failed',
        ref,
        reason: errMessage(err),
      });
    }
  };

  for (const n of hashNums) {
    await fetchIssue(n, `#${n}`);
  }

  for (const { url, parsed } of issueUrls) {
    handledUrls.add(url);
    const parts = githubPathParts(parsed);
    const owner = parts[0] ?? '';
    const name = parts[1] ?? '';
    const n = Number(parts[3]);
    if (!sameRepo(repo.owner, repo.name, owner, name) || !Number.isFinite(n) || n <= 0) {
      pushMissing(missing, lines, {
        kind: 'unsupported_host',
        ref: url,
        reason: 'only same-repo GitHub issues are fetched',
      });
      continue;
    }
    await fetchIssue(n, url);
  }

  const readSpec = async (rawPath: string, ref: string) => {
    const norm = normalizeRepoPath(rawPath);
    if (!norm.ok) {
      pushMissing(missing, lines, { kind: 'path_rejected', ref, reason: norm.reason });
      return;
    }
    try {
      const contents = await git.readFile(repo, norm.path);
      sourceLabels.push(`spec:${norm.path}`);
      const excerpt = contents.length > FILE_EXCERPT_CAP ? contents.slice(0, FILE_EXCERPT_CAP) : contents;
      lines.push(`SPEC ${norm.path}:\n${excerpt}`);
    } catch (err) {
      pushMissing(missing, lines, {
        kind: 'file_unreadable',
        ref: norm.path,
        reason: errMessage(err),
      });
    }
  };

  for (const { url, parsed } of otherUrls) {
    handledUrls.add(url);
    if (!parsed || !isGithubHost(parsed.hostname)) {
      pushMissing(missing, lines, {
        kind: 'unsupported_host',
        ref: url,
        reason: 'only same-repo GitHub paths and issues are fetched',
      });
      continue;
    }
    const parts = githubPathParts(parsed);
    const owner = parts[0] ?? '';
    const name = parts[1] ?? '';
    const kind = parts[2]?.toLowerCase();
    if (!sameRepo(repo.owner, repo.name, owner, name) || (kind !== 'blob' && kind !== 'tree') || parts.length < 5) {
      pushMissing(missing, lines, {
        kind: 'unsupported_host',
        ref: url,
        reason: 'only same-repo GitHub paths and issues are fetched',
      });
      continue;
    }
    const filePath = parts.slice(4).join('/');
    await readSpec(filePath, url);
  }

  const relativeCandidates = new Set<string>();
  for (const m of titleBody.matchAll(MD_LINK)) {
    const href = m[1]?.trim();
    if (!href || href.startsWith('http://') || href.startsWith('https://')) continue;
    if (looksLikeDocsPath(href)) relativeCandidates.add(href);
  }
  for (const token of titleBody.split(/[\s`'"]+/)) {
    const t = token.replace(/[),.;:]+$/g, '');
    if (looksLikeDocsPath(t) && !t.startsWith('http')) relativeCandidates.add(t);
  }
  for (const rel of relativeCandidates) {
    if ([...handledUrls].some((u) => u.includes(rel))) continue;
    await readSpec(rel, rel);
  }

  sourceLabels.push('files');
  lines.push('FILES:');
  for (const file of files) {
    lines.push(file.path);
    const patch = file.patch ?? '';
    for (const line of patch.split('\n')) {
      if (HUNK_HEADER.test(line)) lines.push(line);
    }
  }

  if (bodyEmpty) {
    sourceLabels.push('commits');
    lines.push('COMMITS:');
    for (const c of commits) {
      const subject = c.message.split('\n')[0] ?? '';
      if (subject) lines.push(`- ${subject}`);
    }
  }

  for (const file of files) {
    const base = posix.basename(file.path);
    if (!MANIFEST_NAMES.has(base) && !MANIFEST_NAMES.has(file.path)) continue;
    const patch = file.patch ?? '';
    const added: string[] = [];
    for (const line of patch.split('\n')) {
      if (line.startsWith('+') && !line.startsWith('+++')) added.push(line);
    }
    if (added.length === 0) continue;
    const label = `manifest_delta:${file.path}`;
    sourceLabels.push(label);
    lines.push(`${label}`);
    lines.push(...added);
  }

  return { evidenceText: lines.join('\n'), missing_context: missing, sourceLabels };
}
