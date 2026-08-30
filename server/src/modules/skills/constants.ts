/** Constants for the skills module. */

/** Findings window for skill stats (runs / pull rate stay all-time). */
export const SKILL_FINDINGS_WINDOW_DAYS = 30;

/** Initial content version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Default skill description when none is supplied on insert. */
export const DEFAULT_SKILL_DESCRIPTION = '';

/** Shown on import preview — foreign skill text becomes agent instructions. */
export const SKILL_IMPORT_TRUST_NOTE =
  'Imported skills are text only and never executed. Treat foreign skill content as untrusted instructions that will be injected into the reviewing agent prompt.';

/** Multipart form field name for skill file upload. */
export const SKILL_IMPORT_FILE_FIELD = 'file';

/** Root entry read from a skill zip archive (other files are ignored). */
export const SKILL_ZIP_ROOT_ENTRY = 'SKILL.md';
