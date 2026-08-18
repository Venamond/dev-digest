/**
 * `run_agent_on_pr` — the only non-read tool (§2c, Call sequence). Resolves
 * repo/pr/agent, starts a run, polls it to a terminal status, then reads the
 * persisted review. Deliberately carries no `detail`/`severity_min` — it is
 * the one tool that spends money, so its response size stays fixed; a
 * caller who wants more re-reads the same run through the free
 * `get_findings` (D5 note on run cost, §2c).
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { DevDigestApi } from '../api/client.js';
import { resolveAgentId, resolvePullId, resolveRepoId } from '../api/resolve.js';
import type { ReviewRecord, ReviewRunResponse, RunSummary } from '../api/types.js';
import { errorContent, jsonContent, selectFindings } from '../format.js';
import { logError, logInfo } from '../log.js';

export const RUN_AGENT_ON_PR_DESCRIPTION =
  'Runs one review agent on a pull request, waits for it to finish, and returns the verdict with its findings. Starts a real LLM run: slow and not free.';

/** §2c, Call sequence: the inner wait's fixed cadence. */
export const POLL_INTERVAL_MS = 2000;

/** The subset of `log.ts` a caller of `pollRunUntilTerminal` must provide. */
export interface PollLogger {
  info(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

export type PollOutcome = { timedOut: true } | { timedOut: false; run: RunSummary };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Polls `GET /pulls/:id/runs` every `POLL_INTERVAL_MS` (first poll after one
 * interval) until the named run reaches a terminal status — `done`,
 * `failed`, `cancelled`, verified against the writers in
 * `repository/run.repo.ts` and `run-executor.ts` (§2c) — or `timeoutMs`
 * elapses. `RunSummary.status === null` is treated as "still running"
 * (§2c, nullable-fields table).
 *
 * The deadline is wall-clock (`Date.now() + timeoutMs`), checked before each
 * sleep — not a fixed poll count. A poll-count budget (`floor(timeoutMs /
 * POLL_INTERVAL_MS)` iterations, regardless of how long each one actually
 * took) would let a single slow `GET` — up to `REQUEST_TIMEOUT_MS = 60_000`
 * per request — eat the whole budget without counting against it, so the
 * real time to the timeout message could run well past `timeout_s`. At
 * least one poll always happens: the check runs before the first sleep, and
 * `timeout_s`'s schema floor (10s) is always ≥ one `POLL_INTERVAL_MS`.
 */
export async function pollRunUntilTerminal(
  api: DevDigestApi,
  prId: string,
  runId: string,
  timeoutMs: number,
  log: PollLogger,
): Promise<PollOutcome> {
  const deadline = Date.now() + timeoutMs;
  let pollCount = 0;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    pollCount += 1;
    const runs = await api.get<RunSummary[]>(`/pulls/${encodeURIComponent(prId)}/runs`);
    const run = runs.find((r) => r.run_id === runId);
    log.info('run_agent_on_pr: poll', { runId, pollCount, status: run?.status ?? null });
    if (run && (run.status === 'done' || run.status === 'failed' || run.status === 'cancelled')) {
      return { timedOut: false, run };
    }
  }
  return { timedOut: true };
}

export function registerRunAgentOnPr(server: McpServer, api: DevDigestApi): void {
  server.registerTool(
    'run_agent_on_pr',
    {
      description: RUN_AGENT_ON_PR_DESCRIPTION,
      inputSchema: z.object({
        repo: z.string().describe('owner/name, e.g. octocat/hello-world'),
        pr: z.number().int().positive(),
        agent: z.string().describe('agent name or id from list_agents'),
        timeout_s: z.number().int().min(10).max(900).default(180).optional(),
      }),
    },
    async ({ repo, pr, agent, timeout_s }) => {
      const timeoutS = timeout_s ?? 180;
      try {
        const { repoId } = await resolveRepoId(api, repo);
        const prId = await resolvePullId(api, repoId, pr, repo);
        const { agentId } = await resolveAgentId(api, agent);

        const response = await api.post<ReviewRunResponse>(`/pulls/${encodeURIComponent(prId)}/review`, {
          agentId,
        });
        const firstRun = response.runs[0];
        if (!firstRun) {
          return errorContent(
            `No run was started for agent "${agent}" — the DevDigest API returned zero runs for this request. Try again, or check that the agent still exists in the studio.`,
          );
        }
        const runId = firstRun.run_id;

        const outcome = await pollRunUntilTerminal(api, prId, runId, timeoutS * 1000, {
          info: logInfo,
          error: logError,
        });

        if (outcome.timedOut) {
          return errorContent(
            `Review run ${runId} is still going after ${timeoutS}s. It is not lost — call get_findings with repo "${repo}", pr ${pr} and agent "${agent}" in a minute to collect the result.`,
          );
        }

        const { run } = outcome;
        if (run.status === 'failed') {
          return errorContent(`Review run ${runId} failed: ${run.error ?? 'run failed without a recorded error'}.`);
        }
        if (run.status === 'cancelled') {
          return errorContent(`Review run ${runId} was cancelled.`);
        }

        const reviews = await api.get<ReviewRecord[]>(`/pulls/${encodeURIComponent(prId)}/reviews`);
        const review = reviews.find((r) => r.run_id === runId);
        if (!review) {
          return errorContent(
            `Run ${runId} finished but no review was persisted. Call get_findings with the same repo and pr.`,
          );
        }

        const { findings, total, truncated } = selectFindings(review.findings, { detail: 'summary' });
        return jsonContent({
          verdict: review.verdict,
          summary: review.summary,
          findings,
          total,
          ...(truncated ? { truncated: true } : {}),
        });
      } catch (err) {
        return errorContent(err instanceof Error ? err.message : String(err));
      }
    },
  );
}
