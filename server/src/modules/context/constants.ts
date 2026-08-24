/**
 * Project Context folder — constants.
 *
 * Two of these are configurable per workspace through the existing `settings`
 * table (there is no UI for either yet); the values here are the defaults used
 * whenever the workspace has not overridden them. `ContextRepository` reads
 * `settings` directly — the data layer may import `db/schema`, the application
 * layer may not.
 */

/**
 * Directories of the reviewed repository's clone searched for markdown.
 * Repository-relative, searched recursively. AC-2 — NOT `.devdigest/specs/`,
 * which is what `client/messages/en/context.json`'s empty state still says.
 */
export const DEFAULT_ROOTS = ['specs', 'docs', 'insights'] as const;

/** The only file extension enumerated as a project-context document. */
export const MARKDOWN_EXTENSION = '.md';

/**
 * AC-28 — the combined approximate token budget for the `## Project context`
 * block of ONE run. Documents are taken in order and included whole or not at
 * all; one that does not fit is skipped and the ones after it are still
 * considered.
 */
export const DEFAULT_PROJECT_CONTEXT_TOKEN_CEILING = 32_000;

/**
 * Directories never descended into while looking for documents. AC-2's default
 * glob matches a root at ANY depth (a leading globstar before the root name), so
 * the walk covers the whole clone — and a vendored `node_modules` carrying its
 * own `docs` folders would otherwise bury the repository's own documents in
 * thousands of third-party files.
 *
 * Note: the glob is spelled in words here on purpose. A literal star-star-slash
 * inside a block comment contains the comment terminator and would end it early.
 */
export const SKIPPED_DIRS: readonly string[] = [
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  'coverage',
];

/** `settings.key` holding a `string[]` that replaces `DEFAULT_ROOTS`. */
export const SETTINGS_KEY_SEARCH_ROOTS = 'context.search_roots';

/**
 * `settings.key` holding a positive integer that replaces
 * `DEFAULT_PROJECT_CONTEXT_TOKEN_CEILING`.
 */
export const SETTINGS_KEY_TOKEN_CEILING = 'context.token_ceiling';

/**
 * The ONE token estimator for this feature. The editor tabs' over-ceiling
 * warning and a run's actual skipping must agree, or the UI states a number
 * the run does not honour — so both call this, and nothing else.
 *
 * Its argument is a CHARACTER COUNT, not the text:
 * `approxTokens(text.length)`, `approxTokens(file.size)`.
 */
export { approxTokens } from '@devdigest/reviewer-core/prompt-log.js';
