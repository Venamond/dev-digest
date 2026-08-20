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
        path: '^(src/vendor/shared|src/platform/grounding\\.ts|src/modules/pulls/status\\.ts|src/modules/smart-diff/pure/)',
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
        path: '^(src/vendor/shared|src/platform/grounding\\.ts|src/modules/pulls/status\\.ts|src/modules/smart-diff/pure/)',
      },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'no-route-to-db',
      severity: 'error',
      comment:
        'Ring 3 (routes) must go through service → repository, never straight ' +
        'to Drizzle. Known offenders are grandfathered in the baseline; do not ' +
        'add more. See rules/fastify-routes.md',
      from: { path: '^src/modules/[^/]+/routes\\.ts$' },
      to: {
        path: '^(node_modules/\\.pnpm/[^/]+/node_modules/drizzle-orm|node_modules/drizzle-orm|src/db/schema)',
      },
    },
    {
      name: 'no-app-to-schema',
      severity: 'error',
      comment:
        'Ring 1 (services, helpers, executors, pipelines) may name row shapes ' +
        'via src/db/rows.ts, but must not import the Drizzle table objects or ' +
        'the query builder. See rules/drizzle-repositories.md. ' +
        'src/modules/smart-diff/pure/ is the classifier/summarizer/assembler — ' +
        'pure, DB-free by design.',
      from: {
        // feature-models is application-layer (reads settings via repository);
        // keep it in the ring-1 ban so it never grows a direct drizzle import again.
        path: '^src/modules/[^/]+/(service|helpers|run-executor|diff-loader|feature-models)\\.ts$|^src/modules/repo-intel/pipeline/|^src/modules/reviews/intent/|^src/modules/smart-diff/pure/|^src/modules/blast/(constants|shape|summary)\\.ts$',
      },
      to: {
        path: '^(node_modules/\\.pnpm/[^/]+/node_modules/drizzle-orm|node_modules/drizzle-orm|src/db/schema)',
      },
    },
    {
      name: 'no-infra-to-app',
      severity: 'error',
      comment:
        'Ring 2 (adapters) implements ring 0 interfaces. An adapter depending ' +
        'on a service is the inversion Onion Architecture exists to prevent.',
      from: { path: '^src/adapters/' },
      to: { path: '^src/modules/[^/]+/(service|repository|routes)(\\.ts|/)' },
    },
    {
      name: 'no-cross-module-internals',
      severity: 'error',
      comment:
        "A module must not reach into another module's data or application " +
        'layer. Shared repositories are exposed via the container (see ' +
        'container.agentsRepo / container.reviewRepo).',
      from: { path: '^src/modules/([^/]+)/', pathNot: '^src/modules/_shared/' },
      to: {
        path: '^src/modules/([^/]+)/(service|repository)(\\.ts|/)',
        pathNot: '^src/modules/$1/',
      },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies break the ring ordering.',
      from: {},
      to: { circular: true },
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
