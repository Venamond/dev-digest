/**
 * CI report + token-budget gate for one eval-tier job (or one matrix entry within it).
 *
 * Reads THIS job's own results/records.jsonl — written fresh, this run only, by record()
 * (evals/src/records/record.ts) during the vitest run that just finished in the same job.
 * `results/` is gitignored and per-job-runner-local, so there is no cross-run history here —
 * this is a report on the current run, not a comparison to a prior CI run. For a real
 * before/after diff use `pnpm eval:repeat --label baseline` / `pnpm eval:delta` locally (see
 * root AGENTS.md's Evals routing table and evals/README.md).
 *
 * Does two things:
 *   1. Appends a per-test markdown table (outcome, score, tokens) to $GITHUB_STEP_SUMMARY
 *      (falls back to stdout when that env var is unset, e.g. a local run).
 *   2. Sums inputTokens+outputTokens across every recorded row and exits 1 if the total
 *      exceeds $EVAL_TOKEN_BUDGET — the token half of the CI budget (the time half is each
 *      job's `timeout-minutes`).
 *
 * Env:
 *   EVAL_TOKEN_BUDGET   max input+output tokens for this job (0/unset = unlimited, report only)
 *   CI_REPORT_LABEL     heading for the summary block, e.g. "eval-skills / onion-architecture"
 */

import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

const RECORDS = join("results", "records.jsonl");
const label = process.env.CI_REPORT_LABEL ?? "eval run";
const budget = Number(process.env.EVAL_TOKEN_BUDGET ?? 0);

if (!existsSync(RECORDS)) {
  // Not a failure: a matrix entry whose vitest pattern matched zero cases (or every case threw
  // before record()'s `finally` ran) leaves nothing to report or budget-check.
  console.error(`[ci-report] no ${RECORDS} — nothing recorded this run for '${label}'`);
  process.exit(0);
}

const rows = readFileSync(RECORDS, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));

let totalTokens = 0;
let passed = 0;
const lines = [`### ${label}`, "", "| test | outcome | score | tokens |", "|---|---|---|---|"];

for (const r of rows) {
  const tokens = (r.metrics?.inputTokens ?? 0) + (r.metrics?.outputTokens ?? 0);
  totalTokens += tokens;
  if (r.outcome) passed++;
  const score = r.score !== undefined ? Number(r.score).toFixed(2) : "—";
  lines.push(`| ${r.label} | ${r.outcome ? "✅" : "❌"} | ${score} | ${tokens} |`);
}

lines.push(
  "",
  `**${passed}/${rows.length} passed · ${totalTokens} tokens total — this run only, no cross-run baseline**`,
  "",
);

const summary = process.env.GITHUB_STEP_SUMMARY;
if (summary) appendFileSync(summary, lines.join("\n") + "\n");
else console.log(lines.join("\n"));

if (budget > 0 && totalTokens > budget) {
  console.error(`[ci-report] token budget exceeded for '${label}': ${totalTokens} > ${budget}`);
  process.exit(1);
}
