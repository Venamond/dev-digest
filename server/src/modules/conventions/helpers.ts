import { z } from 'zod';
import type { ConventionCandidate, ConventionSkillDraft, ConventionStatus } from '@devdigest/shared';
import type { ConventionRow } from '../../db/rows.js';
import {
  DEFAULT_SKILL_NAME,
  EVIDENCE_CONTEXT_PAD,
  EVIDENCE_MAX_LINES,
  MAX_CANDIDATES,
  PER_FILE_CHAR_BUDGET,
} from './constants.js';

/**
 * Pure helpers for Conventions Extractor — sampling merge, prompt/parse,
 * grounding, dedupe, skill-body composition, evidence URLs. No I/O.
 */

/** One file packed into the extraction prompt. */
export interface SampleFile {
  path: string;
  content: string;
}

/** Raw candidate as returned by the model (pre-grounding). */
export interface RawCandidate {
  category: string;
  rule: string;
  evidence: {
    path: string;
    line_start: number;
    line_end: number;
    snippet: string;
  };
  confidence: number;
}

/** Candidate after successful grounding against the clone. */
export interface GroundedCandidate {
  category: string;
  rule: string;
  evidence_path: string;
  evidence_snippet: string;
  evidence_line_start: number;
  evidence_line_end: number;
  confidence: number;
}

const RawCandidateSchema = z.object({
  category: z.string().min(1),
  rule: z.string().min(1),
  evidence: z.object({
    path: z.string().min(1),
    line_start: z.coerce.number().int().positive(),
    line_end: z.coerce.number().int().positive(),
    snippet: z.string().min(1),
  }),
  confidence: z.coerce.number().min(0).max(1),
});

/**
 * Structured LLM response for extraction. OpenRouterProvider only implements
 * completeStructured — free-form `complete()` throws.
 */
export const ExtractionResponseSchema = z.object({
  candidates: z.array(RawCandidateSchema),
});
export type ExtractionResponse = z.infer<typeof ExtractionResponseSchema>;

/** Schema name passed to completeStructured (OpenRouter / OpenAI json_schema). */
export const EXTRACTION_SCHEMA_NAME = 'ConventionExtraction';

/** Merge config paths (that exist) with top-ranked source paths, configs first. */
export function selectSamplePaths(configPaths: string[], topFiles: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of [...configPaths, ...topFiles]) {
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

/** Build the single extraction prompt from sampled file contents. */
export function buildPrompt(files: SampleFile[]): string {
  const parts = files.map((f) => {
    const body =
      f.content.length > PER_FILE_CHAR_BUDGET
        ? `${f.content.slice(0, PER_FILE_CHAR_BUDGET)}\n…[truncated]`
        : f.content;
    return `### ${f.path}\n\`\`\`\n${body}\n\`\`\``;
  });

  return [
    'You extract recurring HOUSE coding conventions from the sampled repository files below.',
    'Return ONLY valid JSON of the form:',
    '{"candidates":[{"category":"string","rule":"string","evidence":{"path":"string","line_start":1,"line_end":1,"snippet":"exact lines"},"confidence":0.0}]}',
    '',
    'Rules:',
    `- At most ${MAX_CANDIDATES} candidates.`,
    '- Cite ONLY paths from the files below. Never invent files or line numbers.',
    `- \`snippet\` must be an exact contiguous excerpt from that file (prefer ${EVIDENCE_CONTEXT_PAD}–${EVIDENCE_MAX_LINES} lines of real code, not a lone signature; whitespace may differ slightly).`,
    '- Prefer conventions observable in a PR diff (naming, error handling, layering, API shapes, imports).',
    '- Ignore formatting rules already enforced by prettier/eslint (semicolons, quotes, indent).',
    '- Each rule must be a directive the reviewing agent can enforce.',
    '',
    '## Sampled files',
    ...parts,
  ].join('\n');
}

/**
 * Parse model text into raw candidates. Tolerant: wraps bare arrays, drops
 * malformed items, never throws on bad JSON (returns []).
 */
export function parseCandidates(raw: string): RawCandidate[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(trimmed));
  } catch {
    return [];
  }

  let items: unknown[];
  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { candidates?: unknown }).candidates)) {
    items = (parsed as { candidates: unknown[] }).candidates;
  } else {
    return [];
  }

  const out: RawCandidate[] = [];
  for (const item of items) {
    const r = RawCandidateSchema.safeParse(item);
    if (!r.success) continue;
    const { line_start, line_end } = r.data.evidence;
    out.push({
      ...r.data,
      evidence: {
        ...r.data.evidence,
        line_start: Math.min(line_start, line_end),
        line_end: Math.max(line_start, line_end),
      },
    });
  }
  return out;
}

/** Strip markdown fences / leading prose so JSON.parse can succeed. */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.search(/[\[{]/);
  if (start < 0) return text;
  return text.slice(start);
}

/** Whitespace-normalise for snippet comparison. */
export function normalizeWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Ground one candidate against sampled file contents.
 * Returns null when the path is outside the sample or the snippet is not found.
 * Corrects line numbers when the snippet exists elsewhere in the file.
 */
export function groundCandidate(
  candidate: RawCandidate,
  sampledPaths: ReadonlySet<string>,
  fileContents: ReadonlyMap<string, string>,
): GroundedCandidate | null {
  const path = candidate.evidence.path;
  if (!sampledPaths.has(path)) return null;

  const content = fileContents.get(path);
  if (content == null) return null;

  const lines = content.split(/\r?\n/);
  const want = normalizeWs(candidate.evidence.snippet);
  if (!want) return null;

  const start = candidate.evidence.line_start;
  const end = candidate.evidence.line_end;
  // Accept the claimed range only when it fully covers the snippet.
  // Do NOT use want.includes(atClaim) — that collapses multi-line evidence to one line.
  if (start >= 1 && end >= start && end <= lines.length) {
    const atClaim = normalizeWs(lines.slice(start - 1, end).join('\n'));
    if (atClaim.includes(want)) {
      return toGrounded(candidate, path, lines, start, end);
    }
  }

  const found = findSnippetLines(lines, want);
  if (!found) return null;
  return toGrounded(candidate, path, lines, found.start, found.end);
}

function toGrounded(
  c: RawCandidate,
  path: string,
  lines: string[],
  matchStart: number,
  matchEnd: number,
): GroundedCandidate {
  const { start, end } = expandEvidenceRange(lines.length, matchStart, matchEnd);
  return {
    category: c.category,
    rule: c.rule,
    evidence_path: path,
    evidence_snippet: lines.slice(start - 1, end).join('\n'),
    evidence_line_start: start,
    evidence_line_end: end,
    confidence: c.confidence,
  };
}

/**
 * Widen a grounded match with surrounding file context for the UI card.
 * Does not affect skill body composition (rule + path:line only).
 */
export function expandEvidenceRange(
  lineCount: number,
  matchStart: number,
  matchEnd: number,
  pad = EVIDENCE_CONTEXT_PAD,
  maxLines = EVIDENCE_MAX_LINES,
): { start: number; end: number } {
  if (lineCount < 1) return { start: 1, end: 1 };
  const coreStart = Math.max(1, Math.min(matchStart, matchEnd, lineCount));
  const coreEnd = Math.min(lineCount, Math.max(matchStart, matchEnd, 1));
  let start = Math.max(1, coreStart - pad);
  let end = Math.min(lineCount, coreEnd + pad);

  while (end - start + 1 > maxLines) {
    const canTrimStart = start < coreStart;
    const canTrimEnd = end > coreEnd;
    if (canTrimStart && (!canTrimEnd || coreStart - start >= end - coreEnd)) {
      start += 1;
    } else if (canTrimEnd) {
      end -= 1;
    } else {
      end = Math.min(lineCount, start + maxLines - 1);
      break;
    }
  }
  return { start, end };
}

/**
 * Locate a whitespace-normalised snippet across consecutive file lines.
 * Returns the smallest window whose normalised text contains `want`.
 * Never matches via want.includes(line) — that collapses multi-line snippets.
 */
function findSnippetLines(
  lines: string[],
  want: string,
): { start: number; end: number } | null {
  const maxWindow = Math.min(12, lines.length);
  for (let w = 1; w <= maxWindow; w++) {
    for (let i = 0; i + w <= lines.length; i++) {
      const block = normalizeWs(lines.slice(i, i + w).join('\n'));
      if (block.includes(want)) {
        return { start: i + 1, end: i + w };
      }
    }
  }
  return null;
}

/** Keep highest-confidence copy of each normalised rule; cap at MAX_CANDIDATES. */
export function dedupeCandidates(candidates: GroundedCandidate[]): GroundedCandidate[] {
  const best = new Map<string, GroundedCandidate>();
  for (const c of candidates) {
    const key = normalizeWs(c.rule).toLowerCase();
    const prev = best.get(key);
    if (!prev || c.confidence > prev.confidence) best.set(key, c);
  }
  return [...best.values()]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_CANDIDATES);
}

/** Slug a rule for markdown `##` headings (mockup: async-await-then-chains). */
export function ruleSlug(rule: string): string {
  const slug = rule
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
  return slug || 'convention';
}

/** Format evidence path for display / skill body: `path:23-31` or `path:23`. */
export function formatEvidenceRef(path: string, start: number | null, end: number | null): string {
  if (start == null) return path;
  if (end == null || end === start) return `${path}:${start}`;
  return `${path}:${start}-${end}`;
}

/**
 * GitHub blob URL pinned to a SHA (or branch fallback). Browsing only —
 * extraction never calls GitHub.
 */
export function evidenceUrl(
  fullName: string,
  shaOrBranch: string,
  path: string,
  lineStart: number | null,
  lineEnd: number | null,
): string | null {
  if (!fullName || !shaOrBranch || !path) return null;
  const base = `https://github.com/${fullName}/blob/${shaOrBranch}/${path}`;
  if (lineStart == null) return base;
  if (lineEnd == null || lineEnd === lineStart) return `${base}#L${lineStart}`;
  return `${base}#L${lineStart}-L${lineEnd}`;
}

/**
 * Compose the skill markdown body from accepted candidates.
 * Rule text + source path only — never the evidence snippet/code (UI-only).
 * Line ranges are omitted: padded UI windows (e.g. 1–12) must not land in the skill.
 */
export function composeSkillBody(
  skillName: string,
  repoName: string,
  accepted: Array<{
    rule: string;
    evidence_path: string;
    evidence_line_start?: number | null;
    evidence_line_end?: number | null;
  }>,
): string {
  const sections = accepted.map((c) => {
    const slug = ruleSlug(c.rule);
    const path = c.evidence_path.trim() || 'unknown';
    return [`## ${slug}`, c.rule, '', `Source: \`${path}\``].join('\n');
  });

  return [
    `# ${skillName}`,
    '',
    `House conventions for \`${repoName}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`,
    '',
    sections.join('\n\n'),
  ]
    .join('\n')
    .trimEnd()
    .concat('\n');
}

/** Default name / description / body for the create-skill modal. */
export function composeDraftMeta(
  repoName: string,
  accepted: Array<{
    rule: string;
    evidence_path: string;
    evidence_line_start: number | null;
    evidence_line_end: number | null;
  }>,
): ConventionSkillDraft {
  const name = DEFAULT_SKILL_NAME;
  const n = accepted.length;
  return {
    name,
    description: `${n} house convention${n === 1 ? '' : 's'} extracted from ${repoName}`,
    body: composeSkillBody(name, repoName, accepted),
  };
}

/** Map a DB row to the public ConventionCandidate DTO. */
export function toCandidateDto(
  row: ConventionRow,
  fullName: string | null,
): ConventionCandidate {
  const sha = row.sourceSha;
  const url =
    fullName && row.evidencePath
      ? evidenceUrl(
          fullName,
          sha || 'main',
          row.evidencePath,
          row.evidenceLineStart,
          row.evidenceLineEnd,
        )
      : null;

  return {
    id: row.id,
    rule: row.rule,
    category: row.category,
    evidence_path: row.evidencePath ?? '',
    evidence_snippet: row.evidenceSnippet ?? '',
    evidence_line_start: row.evidenceLineStart,
    evidence_line_end: row.evidenceLineEnd,
    evidence_url: url,
    confidence: row.confidence ?? 0,
    status: row.status as ConventionStatus,
  };
}
