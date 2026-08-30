/**
 * Response formatting: trimming, filtering, and capping the arrays this
 * package returns to the model (S3 in docs/plans/2026-08-18-mcp-server.md).
 *
 * `selectFindings`'s order is fixed and load-bearing: filter -> sort -> cap.
 * Capping before filtering could drop a CRITICAL finding just to make room
 * for findings the caller asked to exclude anyway — that is the bug the
 * tests in test/format.test.ts exist to catch.
 *
 * `category` is passed through as a raw string and never re-validated
 * against `FindingCategory` — the seed writes out-of-enum values (D1, §2c
 * of the plan), and re-validating here would reintroduce the exact 500 this
 * package is built to route around.
 */
import type { FindingRecord } from './api/types.js';

/** `FindingRecord.severity`'s own type — branch B has no Zod enum to alias. */
export type Severity = FindingRecord['severity'];

export const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
};

// D13 — chosen, not derived. Named exports so one edit retunes them.
export const MAX_FINDINGS_SUMMARY = 50;
export const MAX_FINDINGS_FULL = 20;
export const MAX_CONVENTIONS = 100;
export const MAX_AGENTS = 50;
export const MAX_BLAST_SYMBOLS = 25;
export const MAX_BLAST_CALLERS_PER_SYMBOL = 10;

export interface TrimmedFinding {
  severity: Severity;
  category: string;
  title: string;
  file: string;
  lines: string;
  suggestion?: string;
  rationale?: string;
  id?: string;
}

export function trimFinding(f: FindingRecord, detail: 'summary' | 'full'): TrimmedFinding {
  const lines = f.start_line === f.end_line ? String(f.start_line) : `${f.start_line}-${f.end_line}`;

  const trimmed: TrimmedFinding = {
    severity: f.severity,
    category: f.category,
    title: f.title,
    file: f.file,
    lines,
  };

  if (typeof f.suggestion === 'string' && f.suggestion.length > 0) {
    trimmed.suggestion = f.suggestion;
  }

  if (detail === 'full') {
    trimmed.rationale = f.rationale;
    trimmed.id = f.id;
  }

  return trimmed;
}

export function selectFindings(
  findings: FindingRecord[],
  opts: { severityMin?: Severity; detail: 'summary' | 'full' },
): { findings: TrimmedFinding[]; total: number; truncated: boolean } {
  const severityMin = opts.severityMin;

  // 1. Filter.
  const filtered =
    severityMin === undefined
      ? findings
      : findings.filter((f) => SEVERITY_RANK[f.severity] <= SEVERITY_RANK[severityMin]);

  // 2. Sort: severity rank ascending, then file ascending, then start_line ascending.
  const sorted = [...filtered].sort((a, b) => {
    const rankDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (rankDiff !== 0) return rankDiff;
    const fileDiff = a.file.localeCompare(b.file);
    if (fileDiff !== 0) return fileDiff;
    return a.start_line - b.start_line;
  });

  // 3. Cap.
  const cap = opts.detail === 'full' ? MAX_FINDINGS_FULL : MAX_FINDINGS_SUMMARY;
  const capped = sorted.slice(0, cap);

  return {
    findings: capped.map((f) => trimFinding(f, opts.detail)),
    total: filtered.length,
    truncated: capped.length < sorted.length,
  };
}

/**
 * Success payloads travel as `structuredContent` — a real JSON object on the
 * wire — not as `JSON.stringify` inside a text block. The spec's "SHOULD also
 * return the serialized JSON in a TextContent block" is a backwards-compat
 * concession for clients that predate `structuredContent` and read only
 * `content[]`; duplicating costs a second full copy of every response (measured
 * 919 tokens for one `get_findings` reply), so we send one copy. Errors keep
 * using `errorContent`: those are prose for the model, not data.
 */
export function jsonContent(payload: unknown): {
  content: [];
  structuredContent: Record<string, unknown>;
} {
  // `content: []` is not decoration: the SDK's `registerTool` callback type
  // requires the field, and the wire format carries it either way.
  return { content: [], structuredContent: payload as Record<string, unknown> };
}

export function errorContent(text: string): { content: [{ type: 'text'; text: string }]; isError: true } {
  return { content: [{ type: 'text', text }], isError: true };
}
