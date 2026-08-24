import type { Finding } from '@devdigest/shared';

const ALWAYS_KEEP = new Set(['secret_leak', 'lethal_trifecta']);

function matchesOutOfScope(finding: Finding, phrases: string[]): boolean {
  const hay = `${finding.title} ${finding.rationale} ${finding.file} ${finding.category}`.toLowerCase();
  return phrases.some((p) => {
    const needle = p.trim().toLowerCase();
    return needle.length > 0 && hay.includes(needle);
  });
}

/** Deterministic post-review filter: keep security kinds, cap out-of-scope CRITICAL at one. */
export function scopeFilter(findings: Finding[], outOfScope: string[]): Finding[] {
  const kept: Finding[] = [];
  let keptOosCritical = false;
  for (const f of findings) {
    if (f.kind && ALWAYS_KEEP.has(f.kind)) {
      kept.push(f);
      continue;
    }
    if (!matchesOutOfScope(f, outOfScope)) {
      kept.push(f);
      continue;
    }
    if (f.severity === 'CRITICAL' && !keptOosCritical) {
      kept.push(f);
      keptOosCritical = true;
      continue;
    }
  }
  return kept;
}
