/**
 * The product's single token in→out format: "8.2K→1.3K".
 *
 * One decimal on each side and an uppercase K, everywhere tokens are shown —
 * the run-trace drawer's Stats row and the PR brief banner. It lives in
 * `lib/` rather than in either feature's folder because two features use it,
 * and two copies of a display format drift.
 */
export function formatTokens(tokensIn: number, tokensOut: number): string {
  return `${(tokensIn / 1000).toFixed(1)}K→${(tokensOut / 1000).toFixed(1)}K`;
}
