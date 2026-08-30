import type { BriefCut, BriefOverBudget } from '@devdigest/shared';
import type { RawBriefInputs } from './gather.js';
import { BRIEF_REQUEST_OVERHEAD } from './prompt.js';

/**
 * Fit the assembled model input to AC-12's hard cap.
 *
 * It does NOT touch the allowed-name set, and that is the point: the set is
 * built by `collectAllowedNames(raw)` from the COMPLETE inputs before this
 * function runs, so trimming shrinks the prompt and never the set. A changed
 * file cut here still belongs to the pull request; rejecting the model for
 * naming it turned a correct brief into a 422 on 2026-08-24 (see
 * `prompt.ts`'s `collectAllowedNames`). Anything outside the pull request is
 * still rejected.
 */

/**
 * AC-12, counted with `cl100k_base`, and bounding ONE request: the system
 * prompt plus the JSON schema plus the user text. It does not bound the sum
 * across a build's reprompt attempts — the live 109-file call of 2026-08-24
 * reported `usage.prompt_tokens` = 35 255 for three attempts, and each attempt
 * carries the rejected answer plus the reprompt on top of the request below.
 * The ceiling is 16 000 rather than 8 000 because under this boundary one
 * ordinary request already exceeded 8 000 (spec revision 2026-08-24).
 */
export const BRIEF_TOKEN_BUDGET = 16_000;

/**
 * The severities cut 4 keeps. The `findings` table's `severity` is free text
 * and the contract's own enum is `CRITICAL | WARNING | SUGGESTION`
 * (`vendor/shared/contracts/findings.ts:11`), so AC-13's "below `high`
 * severity" is read as "not in the top tier" and both spellings are accepted.
 */
const HIGH_SEVERITIES = new Set(['CRITICAL', 'HIGH']);

/**
 * What one request costs: the fixed overhead of `BRIEF_REQUEST_OVERHEAD` plus
 * the rendered user text. This is the quantity AC-12 bounds, and the fitter
 * below is the only thing that keeps it under the cap — so both it and the
 * tests measure through this function rather than restating the sum.
 */
export function measureRequestTokens(
  inputs: RawBriefInputs,
  count: (text: string) => number,
  render: (inputs: RawBriefInputs) => string,
): number {
  return count(BRIEF_REQUEST_OVERHEAD) + count(render(inputs));
}

/**
 * `count` is `deps.countTokens`, wired to `container.tokenizer.count` — a real
 * `js-tiktoken` `cl100k_base` encoder. AC-12 names the encoding, so this is the
 * counter. The chars/4 heuristic in `reviewer-core/src/prompt-log.ts:4-6`
 * exists to log prompt sizes and must never be used to truncate anything.
 *
 * `render` is `(inputs) => buildBriefPrompt(inputs).userText`, injected so this
 * file stays free of the prompt builder and the cut chain can be measured
 * exactly in a unit test.
 */
export interface BriefFit {
  fitted: RawBriefInputs;
  cut: BriefCut[];
  /**
   * `null` when the result is inside the cap. Non-null when it is not — see
   * `BriefOverBudget`. EVERY exit of `fitToBudget` goes through `done()`
   * below, so this is measured on what the caller actually gets, and an
   * unachievable budget can never read the same as a satisfied one.
   */
  overBudget: BriefOverBudget | null;
}

export function fitToBudget(
  raw: RawBriefInputs,
  count: (text: string) => number,
  render: (inputs: RawBriefInputs) => string,
): BriefFit {
  const cut: BriefCut[] = [];
  const fitted: RawBriefInputs = structuredClone(raw);
  // Hoisted: the overhead is the same string on every probe, and `fits` runs
  // once per caller tail and once per step of the changed-file binary search.
  const overhead = count(BRIEF_REQUEST_OVERHEAD);
  const measure = () => overhead + count(render(fitted));
  const fits = () => measure() <= BRIEF_TOKEN_BUDGET;
  /**
   * The ONLY way out of this function. It re-measures rather than trusting the
   * last `fits()` probe: the binary search of cut 5 leaves `fitted` on a
   * different slice than the one it last measured, so a cached number would be
   * the wrong one exactly where it matters most.
   */
  const done = (): BriefFit => {
    const measured = measure();
    return {
      fitted,
      cut,
      overBudget:
        measured <= BRIEF_TOKEN_BUDGET ? null : { measured, budget: BRIEF_TOKEN_BUDGET },
    };
  };

  if (fits()) return done();

  // 1. Caller tails of the blast map. A caller is not a symbol NAME of the map,
  //    which is why AC-14's never-cut list does not protect it — but every
  //    symbol keeps at least one, so no symbol loses its evidence entirely.
  let tails = 0;
  for (;;) {
    const symbol = longestCallerList(fitted);
    if (!symbol) break;
    symbol.callers.pop();
    tails += 1;
    if (fits()) break;
  }
  if (tails > 0) cut.push({ input: 'blast_map', detail: `${tails} caller tails` });
  if (tails > 0 && fits()) return done();

  // 2. Document fragments: the 3rd of each document, then the 2nd of each, then
  //    the lowest-ranked document entirely — repeatedly, until none is left.
  const docDetails: string[] = [];
  for (const nth of [3, 2]) {
    for (const doc of fitted.documents) {
      if (doc.fragments.length < nth) continue;
      doc.fragments = doc.fragments.slice(0, nth - 1);
      docDetails.push(`${ordinal(nth)} fragment of ${doc.path}`);
      if (fits()) break;
    }
    if (fits()) break;
  }
  while (!fits() && fitted.documents.length > 0) {
    const dropped = fitted.documents.pop();
    if (dropped) docDetails.push(dropped.path);
  }
  if (docDetails.length > 0) cut.push({ input: 'documents', detail: docDetails.join(', ') });
  if (docDetails.length > 0 && fits()) return done();

  // 3. The linked issue's body, keeping its title.
  if (fitted.issue && fitted.issue.body.length > 0) {
    fitted.issue = { ...fitted.issue, body: '' };
    cut.push({ input: 'issue', detail: 'issue body' });
    if (fits()) return done();
  }

  // 4. Findings below the top severity tier.
  const before = fitted.findings.length;
  if (before > 0) {
    fitted.findings = fitted.findings.filter((f) =>
      HIGH_SEVERITIES.has(f.severity.toUpperCase()),
    );
    const dropped = before - fitted.findings.length;
    if (dropped > 0) {
      cut.push({ input: 'findings', detail: `${dropped} findings below high` });
      if (fits()) return done();
    }
  }

  // 5. The changed-file list. Not one of AC-13's four cuts and not a
  //    requirement: AC-12 is a hard cap, and a several-hundred-file pull request
  //    cannot be fitted by the four above alone. The list arrives ranked by
  //    `additions + deletions` descending then by path (see `gather.ts`), so
  //    keeping its head is deterministic.
  const total = fitted.changedFiles.length;
  if (total > 0 && !fits()) {
    const keep = largestPrefixThatFits(fitted, fits);
    if (keep < total) {
      fitted.changedFiles = fitted.changedFiles.slice(0, keep);
      cut.push({ input: 'changed_files', detail: `${total - keep} of ${total} changed files` });
    }
  }

  // Nothing left to cut. `done()` decides whether that was enough — when it was
  // not, the overrun travels with the result instead of going unmentioned.
  return done();
}

/**
 * The symbol whose caller list is longest, or `undefined` when no symbol has
 * more than one caller left. Longest first, so the cut lands where the tokens
 * actually are, and never below length 1.
 */
function longestCallerList(inputs: RawBriefInputs) {
  const symbols = inputs.blastMap?.symbols ?? [];
  let bestLength = 1;
  let found: (typeof symbols)[number] | undefined;
  for (const symbol of symbols) {
    if (symbol.callers.length > bestLength) {
      bestLength = symbol.callers.length;
      found = symbol;
    }
  }
  return found;
}

/** Binary search for the longest head of `changedFiles` that still fits. */
function largestPrefixThatFits(fitted: RawBriefInputs, fits: () => boolean): number {
  const all = [...fitted.changedFiles];
  let low = 0;
  let high = all.length;
  let best = 0;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    fitted.changedFiles = all.slice(0, mid);
    if (fits()) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  fitted.changedFiles = all;
  return best;
}

function ordinal(n: number): string {
  return n === 3 ? '3rd' : n === 2 ? '2nd' : `${n}th`;
}
