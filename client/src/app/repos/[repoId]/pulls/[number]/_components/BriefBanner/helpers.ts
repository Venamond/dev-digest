import type { ReviewRecord, Verdict } from "@devdigest/shared";

/**
 * The run-derived half of the banner: the verdict label, the findings badge
 * and the PR SCORE ring all describe the pull request's last finished review
 * run, which the brief itself knows nothing about.
 *
 * `reviewed: false` is NOT "zero findings" — AC-38 makes the three elements
 * read "no review yet" rather than as counts of zero, because
 * `0 findings · 0 blockers` and a ring reading `0` both state that a review
 * ran and found nothing.
 */
export interface RunFacts {
  reviewed: boolean;
  verdict: Verdict | null;
  score: number | null;
  findings: number;
  blockers: number;
}

/**
 * The newest review that actually carries a verdict, by `created_at`. The list
 * order the API returns is not relied on — a banner that silently reports the
 * second-newest run is indistinguishable from a correct one on screen.
 */
export function latestReview(reviews: ReviewRecord[] | undefined | null): ReviewRecord | null {
  if (!Array.isArray(reviews)) return null;
  const withVerdict = reviews.filter((r) => r.verdict != null);
  if (withVerdict.length === 0) return null;
  return withVerdict.reduce((newest, r) => (r.created_at > newest.created_at ? r : newest));
}

/** Blockers mirror `ReviewRunAccordion.tsx:68`: CRITICAL and not dismissed. */
export function runFacts(reviews: ReviewRecord[] | undefined | null): RunFacts {
  const review = latestReview(reviews);
  if (!review) {
    return { reviewed: false, verdict: null, score: null, findings: 0, blockers: 0 };
  }
  return {
    reviewed: true,
    verdict: review.verdict,
    score: review.score,
    findings: review.findings.length,
    blockers: review.findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length,
  };
}

/**
 * `what` and `why` are two separate fields and the model ends neither with a
 * full stop, so joining them with a bare space produced one run-on line:
 * "Add external webhook sharing for reviews To allow sharing reviews…".
 * M1 shows a single paragraph, so this keeps one paragraph and supplies the
 * punctuation the model does not.
 *
 * A terminal `.`, `!`, `?`, `:` or `;` already present is left alone, so a
 * model that does write full sentences is not given a second full stop.
 */
export function joinWhatWhy(what: string, why: string): string {
  const head = what.trim();
  const tail = why.trim();
  if (head === "") return tail;
  if (tail === "") return head;
  return /[.!?:;]$/.test(head) ? `${head} ${tail}` : `${head}. ${tail}`;
}
