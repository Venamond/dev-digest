import type { PrIntentRecord, GitHubClient } from '@devdigest/shared';
import {
  Intent as IntentSchema,
  IntentMissingContext,
  IntentRiskArea,
  RiskSeverity,
} from '@devdigest/shared';
import { z } from 'zod';
import {
  summarizePromptSections,
  type PromptAssemblySummary,
} from '@devdigest/reviewer-core';
import type { Container } from '../../../platform/container.js';
import { ConfigError } from '../../../platform/errors.js';
import { fingerprint } from '../../../platform/prompt-log.js';
import type { PrIntentRow, PullRow, RepoRow } from '../../../db/rows.js';
import type { ReviewRepository } from '../repository.js';
import { resolveFeatureModel } from '../../settings/feature-models.js';
import { gather } from './gather.js';
import { INTENT_SYSTEM_PROMPT } from './prompt.js';

/** All fields required — OpenAI/OpenRouter strict json_schema rejects `.default()` optionals. */
const IntentLlmSchema = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  risk_areas: z.array(
    z.object({
      title: z.string(),
      severity: RiskSeverity,
      explanation: z.string(),
      file_ref: z.string(),
    }),
  ),
  confidence: z.number().min(0).max(1),
  sources: z.array(z.string()),
  missing_context: z.array(IntentMissingContext),
});

export type ClassifyResult = {
  record: PrIntentRecord;
  reused: boolean;
  durationMs: number;
  model: string;
  tokensIn: number;
  tokensOut: number;
  /** Present only when a classifier prompt was actually assembled (not cache-hit). */
  promptStats?: PromptAssemblySummary;
  /** sha256-12 of system + evidence; never the bodies. */
  promptFingerprints?: { system: string; evidence: string };
};

export function toPrIntentRecord(row: PrIntentRow, pull: PullRow): PrIntentRecord {
  return {
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    risk_areas: (row.riskAreas ?? []).map((r) => IntentRiskArea.parse(r)),
    confidence: row.confidence ?? 0,
    sources: row.sources ?? [],
    missing_context: row.missingContext ?? [],
    pr_id: pull.id,
    head_sha: row.headSha ?? '',
    model: row.model ?? '',
    classified_at: row.classifiedAt?.toISOString() ?? '',
    stale: !row.headSha || row.headSha !== pull.headSha,
  };
}

export async function classify(args: {
  container: Container;
  reviews: ReviewRepository;
  workspaceId: string;
  pull: PullRow;
  repo: RepoRow;
  force?: boolean;
}): Promise<ClassifyResult> {
  const { container, reviews, workspaceId, pull, repo, force } = args;
  const existing = await reviews.getIntent(pull.id);
  if (!force && existing?.headSha && existing.headSha === pull.headSha) {
    const record = toPrIntentRecord(existing, pull);
    return {
      record: { ...record, stale: false },
      reused: true,
      durationMs: 0,
      model: record.model,
      tokensIn: 0,
      tokensOut: 0,
    };
  }

  const files = await reviews.getPrFiles(pull.id);
  const commits = await reviews.getPrCommits(pull.id);

  const feature = await resolveFeatureModel(container, workspaceId, 'review_intent');
  const llm = await container.llm(feature.provider);
  // Vitest integration tests only inject `llm.openai`. A developer machine with
  // OPENROUTER_API_KEY in ~/.devdigest/secrets.json would otherwise call the
  // live API and blow the 10s waitForPrRuns budget. MockLLMProvider.id is never
  // `'openrouter'` (inject the instance under overrides.llm.openrouter).
  if (process.env.VITEST && llm.id === 'openrouter') {
    throw new ConfigError('OPENROUTER_API_KEY is not configured');
  }

  let github: GitHubClient | null = null;
  try {
    github = await container.github();
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
  }

  const gathered = await gather({
    repo: { owner: repo.owner, name: repo.name },
    pull,
    files,
    commits,
    github,
    git: container.git,
  });

  const promptStats = summarizePromptSections([
    { name: 'system', source: 'intent.prompt', chars: INTENT_SYSTEM_PROMPT.length },
    { name: 'evidence', source: 'intent.gather', chars: gathered.evidenceText.length },
  ]);
  const promptFingerprints = {
    system: fingerprint(INTENT_SYSTEM_PROMPT),
    evidence: fingerprint(gathered.evidenceText),
  };

  const t0 = Date.now();
  const result = await llm.completeStructured({
    model: feature.model,
    schema: IntentLlmSchema,
    schemaName: 'PrIntent',
    messages: [
      { role: 'system', content: INTENT_SYSTEM_PROMPT },
      { role: 'user', content: gathered.evidenceText },
    ],
    maxRetries: 2,
  });
  const durationMs = Date.now() - t0;

  const parsed = IntentSchema.parse(result.data);
  const intent = {
    ...parsed,
    missing_context:
      parsed.missing_context.length > 0 ? parsed.missing_context : gathered.missing_context,
    sources: parsed.sources.length > 0 ? parsed.sources : gathered.sourceLabels,
  };

  const classifiedAt = new Date();
  await reviews.upsertIntent(pull.id, {
    intent,
    headSha: pull.headSha,
    model: feature.model,
    classifiedAt,
  });

  const record: PrIntentRecord = {
    ...intent,
    pr_id: pull.id,
    head_sha: pull.headSha,
    model: feature.model,
    classified_at: classifiedAt.toISOString(),
    stale: false,
  };

  return {
    record,
    reused: false,
    durationMs,
    model: feature.model,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    promptStats,
    promptFingerprints,
  };
}
