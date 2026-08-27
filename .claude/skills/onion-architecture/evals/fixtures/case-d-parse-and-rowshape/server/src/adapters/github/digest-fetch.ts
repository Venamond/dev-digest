import { z } from 'zod';

/**
 * Fetches the PR numbers a digest links to. Responses from the GitHub REST API
 * are untrusted input, so they are validated here at the adapter boundary
 * before anything downstream sees them.
 */

const PullSummary = z.object({
  number: z.number().int(),
  title: z.string(),
  state: z.enum(['open', 'closed']),
});
const PullSummaryList = z.array(PullSummary);
export type PullSummary = z.infer<typeof PullSummary>;

export class DigestFetcher {
  constructor(private token: string) {}

  async recentPulls(owner: string, repo: string): Promise<PullSummary[]> {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?per_page=50`, {
      headers: { authorization: `Bearer ${this.token}`, accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`github responded ${res.status}`);
    return PullSummaryList.parse(await res.json());
  }
}
