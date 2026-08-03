/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [],
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
