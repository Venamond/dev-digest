import { describe, it, expect } from 'vitest';
import {
  Review,
  Finding,
  Intent,
  BlastRadius,
  Risks,
  PrHistory,
  SmartDiff,
  Conformance,
  Onboarding,
  EvalRun,
  MemoryItem,
  RunTrace,
  Settings,
  Repo,
  PrDetail,
  BlastResponse,
  BlastPriorPull,
  BlastReason,
  BlastSummaryResponse,
  FeatureModelId,
  FEATURE_MODELS,
  SpecFile,
  ContextDocUser,
  ContextDocEditorRow,
  SetContextDocsBody,
  SaveContextDocBody,
} from '@devdigest/shared';

/**
 * Contract tests — parse/round-trip the fixtures from data.jsx/data2.jsx
 * so feature agents can rely on the schemas matching the prototype data.
 */
describe('AI contracts parse fixtures', () => {
  it('Review + Finding (data.jsx VERDICT/FINDINGS)', () => {
    const review = Review.parse({
      verdict: 'request_changes',
      summary: 'Two blockers before merge.',
      score: 61,
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key in commit',
          file: 'src/config.ts',
          start_line: 12,
          end_line: 12,
          rationale: 'Line 12 contains a literal `sk_live_` Stripe key.',
          suggestion: 'Move to env and rotate.',
          confidence: 0.98,
          kind: 'secret_leak',
        },
      ],
    });
    expect(review.findings).toHaveLength(1);
    expect(review.score).toBe(61);
  });

  it('lethal-trifecta Finding variant', () => {
    const f = Finding.parse({
      id: 'f2',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Lethal trifecta',
      file: 'src/api/public/webhooks.ts',
      start_line: 61,
      end_line: 74,
      rationale: 'all three legs present',
      confidence: 0.79,
      kind: 'lethal_trifecta',
      trifecta_components: ['private_data_access', 'untrusted_input', 'exfil_path'],
      evidence: [{ component: 'untrusted_input', file: 'src/api/public/webhooks.ts', line: 61 }],
    });
    expect(f.trifecta_components).toContain('exfil_path');
  });

  it('Intent / BlastRadius / Risks / PrHistory', () => {
    expect(() =>
      Intent.parse({ intent: 'x', in_scope: ['a'], out_of_scope: ['b'] }),
    ).not.toThrow();
    expect(() =>
      BlastRadius.parse({
        changed_symbols: [{ name: 'rateLimit', file: 'a.ts', kind: 'function' }],
        downstream: [
          {
            symbol: 'rateLimit',
            callers: [{ name: 'publicRouter', file: 'b.ts', line: 23 }],
            endpoints_affected: ['GET /x'],
            crons_affected: ['c'],
          },
        ],
        summary: 's',
      }),
    ).not.toThrow();
    expect(() =>
      Risks.parse({
        risks: [{ kind: 'security', title: 't', explanation: 'e', severity: 'high', file_refs: [] }],
      }),
    ).not.toThrow();
    expect(() =>
      PrHistory.parse({
        history: [
          {
            pr_number: 401,
            title: 't',
            merged_at: '2026-03-18',
            author: 'a',
            files_overlap: [],
            notes: 'n',
          },
        ],
      }),
    ).not.toThrow();
  });

  it('SmartDiff (data.jsx DIFF)', () => {
    const d = SmartDiff.parse({
      groups: [
        {
          role: 'core',
          files: [{ path: 'a.ts', additions: 84, deletions: 0, finding_lines: [28, 52] }],
        },
      ],
      split_suggestion: { too_big: false, total_lines: 285, proposed_splits: [] },
    });
    expect(d.groups[0]!.role).toBe('core');
  });

  it('Conformance / Onboarding / EvalRun / MemoryItem', () => {
    expect(() =>
      Conformance.parse({
        spec_id: 's1',
        spec_title: 'Spec',
        items: [{ requirement: 'r', status: 'implemented' }],
        completeness_pct: 80,
      }),
    ).not.toThrow();
    expect(() =>
      Onboarding.parse({
        sections: [{ kind: 'architecture', title: 'T', body: 'b', links: [] }],
      }),
    ).not.toThrow();
    expect(() =>
      EvalRun.parse({
        recall: 0.82,
        precision: 0.91,
        citation_accuracy: 0.95,
        traces_passed: 17,
        traces_total: 20,
        duration_ms: 12000,
        cost_usd: 0.23,
        per_trace: [{ name: 't01', pass: true, expected: 'x', actual: 'x' }],
      }),
    ).not.toThrow();
    expect(() =>
      MemoryItem.parse({
        content: 'c',
        scope: 'team',
        kind: 'decision',
        confidence: 0.92,
        sources: [{ pr: 401, context: 'ctx' }],
      }),
    ).not.toThrow();
  });

  it('RunTrace (data2.jsx TRACE single-document)', () => {
    const trace = RunTrace.parse({
      config: { agent: 'Security Reviewer', version: 'v7', model: 'gpt-4.1', pr: 482, source: 'local' },
      stats: { duration_ms: 8200, tokens_in: 14820, tokens_out: 1240, findings: 3, grounding: '3/3 passed', cost_usd: 0.05 },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [{ tool: 'read_file', args: "'src/config.ts'", meta: '1,240 bytes', ms: 120 }],
      raw_output: '{}',
      memory_pulled: [{ pr: 288, text: 'verified via stripe-signature' }],
      specs_read: ['specs/security-baseline.md'],
      log: [{ t: '00.00', kind: 'info', msg: 'started' }],
    });
    expect(trace.tool_calls).toHaveLength(1);
  });
});

describe('platform DTOs', () => {
  it('Settings defaults + passthrough', () => {
    const s = Settings.parse({ extra_key: 'x' });
    expect(s.theme).toBe('dark');
    expect((s as Record<string, unknown>).extra_key).toBe('x');
  });

  it('Repo + PrDetail', () => {
    expect(() =>
      Repo.parse({
        id: 'r1',
        workspace_id: 'w1',
        owner: 'acme',
        name: 'payments-api',
        full_name: 'acme/payments-api',
        default_branch: 'main',
        clone_path: null,
        last_polled_at: null,
        created_by: null,
      }),
    ).not.toThrow();
    expect(() =>
      PrDetail.parse({
        number: 482,
        title: 't',
        author: 'a',
        branch: 'b',
        base: 'main',
        head_sha: 'sha',
        additions: 1,
        deletions: 0,
        files_count: 1,
        status: 'open',
        files: [],
        commits: [],
      }),
    ).not.toThrow();
  });
});

describe('Project Context contracts', () => {
  const doc = {
    path: 'specs/api.md',
    root: 'specs',
    approx_tokens: 120,
    used_by_agents: 1,
    used_by: [{ agent_id: 'a1', agent_name: 'Security Reviewer', via: 'agent' }],
  };

  it('SpecFile carries root, token estimate and its users', () => {
    const parsed = SpecFile.parse(doc);
    expect(parsed.root).toBe('specs');
    expect(parsed.used_by[0].via).toBe('agent');
  });

  it('SpecFile without `root` is rejected — the field is required, not nullish', () => {
    const { root: _root, ...withoutRoot } = doc;
    expect(SpecFile.safeParse(withoutRoot).success).toBe(false);
  });

  it('ContextDocUser records the skill an inherited document arrives through', () => {
    const u = ContextDocUser.parse({
      agent_id: 'a2',
      agent_name: 'Perf Reviewer',
      via: 'skill',
      skill_id: 's1',
      skill_name: 'API conventions',
    });
    expect(u.skill_name).toBe('API conventions');
  });

  it('ContextDocEditorRow marks an unreadable attachment and its inheritance', () => {
    const row = ContextDocEditorRow.parse({
      doc,
      attached: true,
      order: 2,
      inherited_from: [{ skill_id: 's1', skill_name: 'API conventions' }],
      readable: false,
    });
    expect(row.readable).toBe(false);
    expect(row.inherited_from).toHaveLength(1);
  });

  it('SetContextDocsBody / SaveContextDocBody', () => {
    expect(SetContextDocsBody.parse({ repo_id: 'r1', paths: ['specs/api.md'] }).paths).toHaveLength(1);
    expect(SaveContextDocBody.safeParse({ path: '', content: 'x' }).success).toBe(false);
  });
});

describe('RunTrace project-context fields stay optional', () => {
  // This is the case that protects every EXISTING RunTrace literal and fixture:
  // adding the two fields must not make a trace written before this change
  // unparseable, nor make `const trace: RunTrace = {…}` stop compiling.
  const legacyTrace = {
    config: { agent: 'Security Reviewer', model: 'gpt-4.1', source: 'local' as const },
    stats: { duration_ms: 1, tokens_in: 1, tokens_out: 1, cost_usd: null, findings: 0, grounding: 'n/a' },
    prompt_assembly: { system: 's', user: 'u' },
    tool_calls: [],
    raw_output: '{}',
    memory_pulled: [],
    specs_read: [],
    log: [],
  };

  it('a trace without specs_omitted / specs_revision still parses and reads as empty', () => {
    const parsed = RunTrace.parse(legacyTrace);
    expect(parsed.specs_omitted ?? []).toEqual([]);
    expect(parsed.specs_revision ?? null).toBeNull();
  });

  it('an omitted document carries one of the two stated reasons', () => {
    const parsed = RunTrace.parse({
      ...legacyTrace,
      specs_read: ['specs/api.md'],
      specs_omitted: [
        { path: 'docs/huge.md', reason: 'over_ceiling' },
        { path: 'docs/gone.md', reason: 'unreadable' },
      ],
      specs_revision: 'abc123',
    });
    expect(parsed.specs_omitted?.map((o) => o.reason)).toEqual(['over_ceiling', 'unreadable']);
    expect(parsed.specs_revision).toBe('abc123');
    expect(
      RunTrace.safeParse({ ...legacyTrace, specs_omitted: [{ path: 'x.md', reason: 'too_big' }] })
        .success,
    ).toBe(false);
  });
});

describe('Blast Radius API contracts (L04)', () => {
  const okResponse = {
    state: 'ok',
    index: { status: 'full', last_indexed_sha: 'abc', updated_at: '2026-08-19T00:00:00.000Z' },
    totals: { symbols: 1, callers: 2, callers_found: 5, endpoints: 1, crons: 0 },
    symbols: [
      {
        file: 'src/lib/money.ts',
        name: 'formatMoney',
        kind: 'function',
        callers: [{ file: 'src/routes/pay.ts', symbol: 'payHandler', line: 12, rank: 0.5 }],
        callers_total: 5,
        callers_truncated: true,
        importers: [{ file: 'src/routes/pay.ts', depth: 1 }],
        endpoints: ['POST /pay'],
        crons: [],
      },
    ],
    downstream_truncated: false,
    prior_pulls: [],
    link: { repo_full_name: 'acme/api', indexed_sha: 'abc', head_sha: 'def' },
  };

  it('parses an ok response with `reason` omitted entirely', () => {
    const parsed = BlastResponse.parse(okResponse);
    expect(parsed.reason).toBeUndefined();
  });

  it('parses a degraded response with a reason and empty collections', () => {
    expect(() =>
      BlastResponse.parse({
        ...okResponse,
        state: 'degraded',
        reason: 'no_data',
        symbols: [],
        prior_pulls: [],
      }),
    ).not.toThrow();
  });

  it('accepts a prior pull with a null updated_at', () => {
    expect(() =>
      BlastPriorPull.parse({
        number: 1,
        title: 't',
        author: 'a',
        status: 'merged',
        updated_at: null,
        description: null,
        shared_files: ['src/a.ts'],
        unresolved_findings: [],
      }),
    ).not.toThrow();
  });

  it('requires shared_files and unresolved_findings on a prior pull', () => {
    // Both are what make the row answer "why should I care". Optional fields
    // would let a shaper omit them and leave the block back where it started:
    // a list of PR titles with no stated connection to this one.
    expect(() =>
      BlastPriorPull.parse({
        number: 1,
        title: 't',
        author: 'a',
        status: 'merged',
        updated_at: null,
      }),
    ).toThrow();
  });

  it('knows the index_stale reason', () => {
    expect(BlastReason.parse('index_stale')).toBe('index_stale');
  });

  it('registers blast_summary as a selectable feature model', () => {
    expect(FeatureModelId.parse('blast_summary')).toBe('blast_summary');
    expect(FEATURE_MODELS.some((f) => f.id === 'blast_summary')).toBe(true);
  });

  it('rejects a response missing downstream_truncated or totals.callers_found', () => {
    const { downstream_truncated: _dropped, ...withoutTruncated } = okResponse;
    expect(() => BlastResponse.parse(withoutTruncated)).toThrow();

    const { callers_found: _alsoDropped, ...totalsWithoutFound } = okResponse.totals;
    expect(() =>
      BlastResponse.parse({ ...okResponse, totals: totalsWithoutFound }),
    ).toThrow();
  });

  it('parses a BlastSummaryResponse', () => {
    expect(() =>
      BlastSummaryResponse.parse({ summary: 's', model: 'm', nodes: 3 }),
    ).not.toThrow();
  });
});
