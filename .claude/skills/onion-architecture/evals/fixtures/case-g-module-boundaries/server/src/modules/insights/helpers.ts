import type { FindingRow } from '../../db/rows.js';

/**
 * A14 — pure shapers for the insights list. No I/O.
 */

export interface CategoryGroup {
  category: string;
  rows: FindingRow[];
}

export function groupByCategory(findings: FindingRow[]): CategoryGroup[] {
  const byCategory = new Map<string, CategoryGroup>();
  for (const finding of findings) {
    const group = byCategory.get(finding.category) ?? { category: finding.category, rows: [] };
    group.rows.push(finding);
    byCategory.set(finding.category, group);
  }
  return [...byCategory.values()];
}
