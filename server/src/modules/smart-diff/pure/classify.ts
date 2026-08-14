import type { SmartDiffRole } from '@devdigest/shared';
import {
  BOILERPLATE_DIR_SEGMENTS,
  BOILERPLATE_FILENAMES,
  BOILERPLATE_SUFFIXES,
  WIRING_DIR_SEGMENTS,
  WIRING_FILENAMES,
  WIRING_SUFFIXES,
} from './constants.js';

/**
 * Classify a PR file path into a Smart Diff role. Deterministic, no I/O.
 * Precedence: boilerplate wins, then wiring, then core (see
 * docs/plans/2026-08-14-smart-diff.md S1). Paths are always POSIX
 * (GitHub), so `String.split('/')` is used — never `node:path`.
 */
export function classifyPath(path: string): SmartDiffRole {
  const segments = path.split('/');
  const base = segments[segments.length - 1] ?? path;
  const baseLower = base.toLowerCase();

  if (segments.some((seg) => BOILERPLATE_DIR_SEGMENTS.has(seg))) return 'boilerplate';
  if (BOILERPLATE_FILENAMES.has(baseLower)) return 'boilerplate';
  if (BOILERPLATE_SUFFIXES.some((suf) => base.endsWith(suf))) return 'boilerplate';

  if (segments.some((seg) => WIRING_DIR_SEGMENTS.has(seg))) return 'wiring';
  if (WIRING_FILENAMES.has(baseLower)) return 'wiring';
  if (WIRING_SUFFIXES.some((suf) => base.endsWith(suf))) return 'wiring';

  return 'core';
}
