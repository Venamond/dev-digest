import type {
  BlastCallerRef,
  BlastReason,
  BlastResponse,
  BlastState,
  BlastSymbolImpact,
} from '@devdigest/shared';
import type {
  BlastResult,
  IndexState,
  ReverseDependentsResult,
} from '../repo-intel/types.js';
import type { PriorPullRow } from '../../db/rows.js';

/**
 * Pure response shaping — no I/O, no drizzle, no LLM. Everything this file
 * needs is already in memory by the time the service calls it.
 */

export interface ShapeBlastInput {
  blast: BlastResult;
  reverse: ReverseDependentsResult;
  prior: PriorPullRow[];
  index: IndexState;
  link: { repo_full_name: string; head_sha: string };
  state: BlastState;
  reason?: BlastReason;
}

export function shapeBlastResponse(input: ShapeBlastInput): BlastResponse {
  const { blast, reverse, prior, index, link, state, reason } = input;

  // 1. Callers grouped by the changed symbol they reach.
  const callersBySymbol = new Map<string, BlastCallerRef[]>();
  for (const c of blast.callers) {
    const list = callersBySymbol.get(c.viaSymbol);
    const ref: BlastCallerRef = { file: c.file, symbol: c.symbol, line: c.line, rank: c.rank };
    if (list) list.push(ref);
    else callersBySymbol.set(c.viaSymbol, [ref]);
  }

  const endpointsAll = new Set<string>();
  const cronsAll = new Set<string>();

  const symbols: BlastSymbolImpact[] = blast.changedSymbols.map((sym) => {
    const callers = callersBySymbol.get(sym.name) ?? [];
    const stats = blast.callerStatsBySymbol?.[sym.name] ?? {
      total: callers.length,
      truncated: false,
    };

    // Reverse dependents reached from THIS symbol's declaring file. `via` is a
    // list of seeds, not a single seed — a `===` test would silently drop
    // dependents shared by two changed files.
    const reached = reverse.dependents.filter((d) => d.via.includes(sym.file));

    const importers = reached
      .filter((d) => d.depth === 1)
      .map((d) => ({ file: d.file, depth: d.depth }))
      .sort((a, b) => a.file.localeCompare(b.file));

    const endpoints = new Set<string>();
    const crons = new Set<string>();
    for (const c of callers) {
      const facts = blast.factsByFile?.[c.file];
      if (!facts) continue;
      for (const e of facts.endpoints) endpoints.add(e);
      for (const cr of facts.crons) crons.add(cr);
    }
    for (const d of reached) {
      for (const e of d.endpoints) endpoints.add(e);
      for (const cr of d.crons) crons.add(cr);
    }
    for (const e of endpoints) endpointsAll.add(e);
    for (const cr of crons) cronsAll.add(cr);

    return {
      file: sym.file,
      name: sym.name,
      kind: sym.kind,
      callers,
      callers_total: stats.total,
      callers_truncated: stats.truncated,
      importers,
      endpoints: [...endpoints].sort(),
      crons: [...crons].sort(),
    };
  });

  return {
    state,
    // The key is omitted entirely when the state is 'ok'.
    ...(state === 'ok' ? {} : { reason }),
    index: {
      status: index.status,
      last_indexed_sha: index.lastIndexedSha,
      updated_at: index.updatedAt.toISOString(),
    },
    totals: {
      symbols: symbols.length,
      // Rendered rows, not blast.impactedEndpoints: that flat union excludes
      // reverse dependents and is not what the card shows.
      callers: symbols.reduce((n, s) => n + s.callers.length, 0),
      callers_found: symbols.reduce((n, s) => n + s.callers_total, 0),
      endpoints: endpointsAll.size,
      crons: cronsAll.size,
    },
    symbols,
    downstream_truncated: reverse.truncated,
    prior_pulls: prior.map((p) => ({
      number: p.number,
      title: p.title,
      author: p.author,
      status: p.status,
      updated_at: p.updatedAt?.toISOString() ?? null,
    })),
    link: {
      repo_full_name: link.repo_full_name,
      // Every file:line in this response is relative to the INDEXED commit,
      // never the PR head — the indexer reads the clone's default branch.
      indexed_sha: index.lastIndexedSha,
      head_sha: link.head_sha,
    },
  };
}
