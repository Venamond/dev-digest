/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'core-no-node-builtins',
      severity: 'error',
      comment:
        'reviewer-core is a pure diff→prompt→LLM→findings engine. Its only ' +
        'side effect is the injected LLMProvider. No fs, no child_process.',
      // Unanchored: reviewer-core has no dependency-cruiser of its own, so
      // this always runs from server/ via `arch:check:core`, which reports
      // paths as "../reviewer-core/src/...", not "src/...". Do not anchor
      // this to "^src/" — it silently matches nothing.
      from: { path: '(^|/)src/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'core-allowlisted-deps-only',
      severity: 'error',
      comment:
        'Only openai and zod are permitted. Adding a dependency here means ' +
        'reconsidering whether the logic belongs in server/ instead.',
      from: { path: '(^|/)src/' },
      to: {
        dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer'],
        // Same cwd caveat as the `from` path above: matches must not anchor
        // to "^node_modules/" — the resolved path is prefixed with
        // "../reviewer-core/" when this runs via `arch:check:core`.
        pathNot: '(^|/)node_modules/(openai|zod)(/|$)|(^|/)node_modules/\\.pnpm/[^/]+/node_modules/(openai|zod)(/|$)',
      },
    },
    {
      name: 'core-no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: ['.ts', '.js', '.json'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
