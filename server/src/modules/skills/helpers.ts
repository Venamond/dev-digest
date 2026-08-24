import JSZip from 'jszip';
import { z } from 'zod';
import {
  SkillType,
  type Skill,
  type SkillImportDraft,
  type SkillListItem,
  type SkillSource,
  type SkillVersion,
} from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import { AppError } from '../../platform/errors.js';
import { SKILL_IMPORT_TRUST_NOTE, SKILL_ZIP_ROOT_ENTRY } from './constants.js';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping, config-version
 * bump rule, import parsing (.md / .zip), and body text diffs. No DB I/O.
 */

/** Map a persisted skill row to the public `Skill` DTO. */
export function toSkillDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as Skill['type'],
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
  };
}

/** Map a skill row + linked-agent count to a list-card DTO. */
export function toSkillListItemDto(
  row: SkillRow,
  agentCount: number,
  rates: { pullRate: number | null; acceptRate: number | null } = {
    pullRate: null,
    acceptRate: null,
  },
): SkillListItem {
  return {
    ...toSkillDto(row),
    agent_count: agentCount,
    pull_rate: rates.pullRate,
    accept_rate: rates.acceptRate,
  };
}

/** Map a persisted `skill_versions` row to the public `SkillVersion` DTO. */
export function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    note: row.note ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

/** Fields whose change bumps the skill content version (anything but `enabled`). */
export interface SkillConfigChangePatch {
  name?: string;
  description?: string;
  type?: Skill['type'];
  body?: string;
}

/**
 * True when a patch changes content/config (vs. just toggling `enabled`) —
 * a content change bumps `version` and snapshots `skill_versions`.
 */
export function isSkillConfigChange(
  existing: Pick<SkillRow, 'name' | 'description' | 'type' | 'body'>,
  patch: SkillConfigChangePatch,
): boolean {
  return (
    (patch.name !== undefined && patch.name !== existing.name) ||
    (patch.description !== undefined && patch.description !== existing.description) ||
    (patch.type !== undefined && patch.type !== existing.type) ||
    (patch.body !== undefined && patch.body !== existing.body)
  );
}

const FrontmatterSchema = z.object({
  name: z.string().min(1, 'name is required'),
  description: z.string({ required_error: 'description is required' }),
  type: SkillType,
});

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Minimal flat YAML frontmatter parser (`key: value` lines). Enough for skill
 * import — no nested structures, no multi-line scalars.
 */
export function parseFlatYamlFrontmatter(yaml: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of yaml.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const colon = line.indexOf(':');
    if (colon <= 0) {
      throw new AppError('validation_error', 'Invalid skill frontmatter', 400, {
        fields: { frontmatter: `Invalid line: ${rawLine}` },
      });
    }
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Parse a skill markdown document: YAML frontmatter (`name`, `description`,
 * `type`) + remainder body. Throws AppError(400) with field errors on failure.
 */
export function parseSkillMarkdown(markdown: string): SkillImportDraft {
  const match = FRONTMATTER_RE.exec(markdown);
  if (!match) {
    throw new AppError('validation_error', 'Invalid skill frontmatter', 400, {
      fields: {
        frontmatter: 'Expected YAML frontmatter delimited by --- lines (name, description, type)',
      },
    });
  }

  const raw = parseFlatYamlFrontmatter(match[1]!);
  const parsed = FrontmatterSchema.safeParse({
    name: raw.name,
    description: raw.description,
    type: raw.type,
  });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]?.toString() ?? 'frontmatter';
      fields[key] = issue.message;
    }
    throw new AppError('validation_error', 'Invalid skill frontmatter', 400, { fields });
  }

  return {
    name: parsed.data.name,
    description: parsed.data.description,
    type: parsed.data.type,
    body: match[2]!.replace(/^\r?\n/, ''),
    trust_note: SKILL_IMPORT_TRUST_NOTE,
  };
}

/** True when `filename` looks like a zip archive. */
export function isZipFilename(filename: string): boolean {
  return filename.toLowerCase().endsWith('.zip');
}

/**
 * Read root `SKILL.md` from a zip buffer. Other entries are ignored; nothing
 * is written to disk or executed.
 */
export async function extractRootSkillMd(zipBytes: Buffer | Uint8Array): Promise<string> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBytes);
  } catch {
    throw new AppError('validation_error', 'Invalid skill archive', 400, {
      fields: { file: 'Could not read zip archive' },
    });
  }

  const entry = zip.file(SKILL_ZIP_ROOT_ENTRY);
  if (!entry || entry.dir) {
    throw new AppError('validation_error', 'Invalid skill archive', 400, {
      fields: {
        file: `Zip must contain a root ${SKILL_ZIP_ROOT_ENTRY} (other files are ignored)`,
      },
    });
  }

  return entry.async('string');
}

/**
 * Parse an uploaded skill file (`.md` or `.zip` with root `SKILL.md`) into an
 * import draft. Never persists; never executes archive contents.
 */
export async function parseSkillImportFile(
  filename: string,
  bytes: Buffer | Uint8Array,
): Promise<SkillImportDraft> {
  const markdown = isZipFilename(filename)
    ? await extractRootSkillMd(bytes)
    : Buffer.from(bytes).toString('utf8');
  return parseSkillMarkdown(markdown);
}

/**
 * Unified-ish text diff of two bodies (enough for the Versions Diff UI).
 * Prefixes lines with ` ` / `-` / `+`.
 */
export function diffBodies(fromBody: string, toBody: string): string {
  const a = fromBody.split('\n');
  const b = toBody.split('\n');
  const lines: string[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    const left = a[i];
    const right = b[i];
    if (left === right) {
      if (left !== undefined) lines.push(` ${left}`);
    } else {
      if (left !== undefined) lines.push(`-${left}`);
      if (right !== undefined) lines.push(`+${right}`);
    }
  }
  return lines.join('\n');
}

const HEADING_RE = /^#{1,6}\s+(.*)$/;

export interface BodyHeadingDelta {
  added: string[];
  removed: string[];
  reworded: string[];
}

/** Split a markdown body into heading → content-line blocks. */
function parseHeadingSections(body: string): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  for (const line of body.split('\n')) {
    const match = HEADING_RE.exec(line);
    if (match) {
      if (currentHeading !== null) {
        sections.set(currentHeading, currentLines);
      }
      currentHeading = match[1]!.trim();
      currentLines = [];
    } else if (currentHeading !== null) {
      currentLines.push(line);
    }
  }
  if (currentHeading !== null) {
    sections.set(currentHeading, currentLines);
  }
  return sections;
}

/** Compare heading sets and the line blocks beneath them. */
export function bodyHeadingDelta(from: string, to: string): BodyHeadingDelta {
  const fromSections = parseHeadingSections(from);
  const toSections = parseHeadingSections(to);

  const added: string[] = [];
  const removed: string[] = [];
  const reworded: string[] = [];

  for (const heading of toSections.keys()) {
    if (!fromSections.has(heading)) added.push(heading);
  }
  for (const heading of fromSections.keys()) {
    if (!toSections.has(heading)) removed.push(heading);
  }
  for (const heading of fromSections.keys()) {
    if (!toSections.has(heading)) continue;
    const fromLines = fromSections.get(heading)!;
    const toLines = toSections.get(heading)!;
    if (fromLines.length !== toLines.length || fromLines.some((l, i) => l !== toLines[i])) {
      reworded.push(heading);
    }
  }

  return { added, removed, reworded };
}

/** Count `+`/`-` lines produced by `diffBodies`. */
export function bodyLineDelta(from: string, to: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diffBodies(from, to).split('\n')) {
    if (line.startsWith('+')) added++;
    else if (line.startsWith('-')) removed++;
  }
  return { added, removed };
}

export interface SkillVersionNoteInput {
  name: string;
  description: string;
  type: string;
  body: string;
  source?: string;
}

export interface SkillVersionNoteArgs {
  previous?: SkillVersionNoteInput;
  next: SkillVersionNoteInput;
  restoredFrom?: number;
}

function formatAddedSections(headings: string[]): string {
  const [first, ...rest] = headings;
  if (rest.length === 0) return `Added ${first} section`;
  return `Added ${first} section (+ ${rest.length} more)`;
}

function formatRemovedSections(headings: string[]): string {
  const [first, ...rest] = headings;
  if (rest.length === 0) return `Removed ${first} section`;
  return `Removed ${first} section (+ ${rest.length} more)`;
}

/**
 * Generate a human-readable version note. Initial/restored cases return a
 * single string; body changes use first-match-wins heading/body rules;
 * name/type/description parts join with ` · ` when no body rule matches.
 */
export function skillVersionNote({ previous, next, restoredFrom }: SkillVersionNoteArgs): string {
  if (!previous) {
    if (next.source === 'extracted') return 'Extracted from codebase scan';
    if (next.source === 'imported_url' || next.source === 'community') return 'Imported skill';
    return 'Initial version';
  }

  if (restoredFrom !== undefined) return `Restored from v${restoredFrom}`;

  const headingDelta = bodyHeadingDelta(previous.body, next.body);
  if (headingDelta.added.length > 0) return formatAddedSections(headingDelta.added);
  if (headingDelta.removed.length > 0) return formatRemovedSections(headingDelta.removed);
  if (headingDelta.reworded.length === 1) return `Reworded ${headingDelta.reworded[0]}`;

  if (previous.body !== next.body) {
    const { added, removed } = bodyLineDelta(previous.body, next.body);
    return `Body +${added}/-${removed} lines`;
  }

  const parts: string[] = [];
  if (previous.name !== next.name) parts.push(`Renamed from ${previous.name}`);
  if (previous.type !== next.type) parts.push(`Type ${previous.type} → ${next.type}`);
  if (previous.description !== next.description) parts.push('Description updated');
  return parts.join(' · ');
}
