/* Word-level diff for the prompt compare (old vs new).

   Lifted from the design's own `diffTokens` (LCS over whitespace-split tokens).
   A plain function, not a hook: it calls no hooks and needs no React. */

export type DiffKind = "same" | "add" | "del";

export interface DiffToken {
  /** The token itself, whitespace included — the block renders `pre-wrap`. */
  t: string;
  k: DiffKind;
}

export function diffTokens(a: string, b: string): DiffToken[] {
  const aw = a.split(/(\s+)/);
  const bw = b.split(/(\s+)/);
  const n = aw.length;
  const m = bw.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = aw[i] === bw[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const out: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (aw[i] === bw[j]) {
      out.push({ t: aw[i]!, k: "same" });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ t: aw[i]!, k: "del" });
      i++;
    } else {
      out.push({ t: bw[j]!, k: "add" });
      j++;
    }
  }
  while (i < n) out.push({ t: aw[i++]!, k: "del" });
  while (j < m) out.push({ t: bw[j++]!, k: "add" });
  return out;
}
