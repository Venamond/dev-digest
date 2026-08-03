/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-domain-io',
      severity: 'error',
      comment:
        'Ring 0 (domain) must have no I/O. It defines port interfaces; ' +
        'ring 2 implements them. See .claude/skills/onion-architecture/rules/layers.md',
      from: {
        path: '^(src/vendor/shared|src/platform/grounding\\.ts|src/modules/pulls/status\\.ts)',
      },
      to: {
        path: '^(node_modules/\\.pnpm/[^/]+/node_modules/(fastify|drizzle-orm|octokit|postgres|simple-git|@fastify)|node_modules/(fastify|drizzle-orm|octokit|postgres|simple-git|@fastify)|octokit$|src/db/)',
      },
    },
    {
      name: 'no-domain-node-builtins',
      severity: 'error',
      comment: 'Ring 0 must not touch Node builtins (fs, child_process, …).',
      from: {
        path: '^(src/vendor/shared|src/platform/grounding\\.ts|src/modules/pulls/status\\.ts)',
      },
      to: { dependencyTypes: ['core'] },
    },
  ],
  options: {
    // doNotFollow stops recursion INTO node_modules but still records the
    // edge from our source files to the npm package — that edge is what
    // every forbidden rule below needs to see. A separate `exclude` for
    // node_modules (removed here) drops those edges from the graph
    // entirely, which silently makes every "don't import X" rule match
    // nothing. Do not reintroduce it.
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    // REQUIRED: most leaks here are `import type`, erased at runtime and
    // invisible without this flag.
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: ['.ts', '.js', '.json'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
