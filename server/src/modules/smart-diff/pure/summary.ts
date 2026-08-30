import { MAX_SUMMARY_SYMBOLS } from './constants.js';

const EXPORT_RE =
  /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:const|let|var|function|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/;

/**
 * Dry, deterministic patch statistics — no model call, structurally
 * incapable of one (this file imports nothing but ./constants.js).
 */
export function summarizePatch(patch: string | null | undefined): string | null {
  if (patch == null || patch.trim() === '') return null;

  let added = 0;
  let removed = 0;
  const names: string[] = [];
  const seen = new Set<string>();

  for (const line of patch.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      added += 1;
      const text = line.slice(1);
      const m = EXPORT_RE.exec(text);
      if (m?.[1] && !seen.has(m[1])) {
        seen.add(m[1]);
        if (names.length < MAX_SUMMARY_SYMBOLS) names.push(m[1]);
      }
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      removed += 1;
    }
  }

  const base = `+${added}/−${removed}`;
  return names.length === 0 ? base : `${base} · new exports: ${names.join(', ')}`;
}
