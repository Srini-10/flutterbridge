/**
 * Dependency rules — the executable form of Spec v2.0 §1.2 ("Hard rules").
 *
 * These rules exist from day one, before there is any code to violate them.
 * Changing a rule here is an architecture change and requires an ADR.
 */

/** Packages that may only ever depend on @bridge/uir and @bridge/plugin-sdk (Spec §1.2 rule 2). */
const PLUGIN_REALM = '^packages/(generators|adapters|verification|ai)/';
/** Compiler-side packages that must never be reachable from the plugin realm or the runtime kits. */
const COMPILER_SIDE = '^packages/(core|compiler|cli)/';

module.exports = {
  forbidden: [
    {
      name: 'uir-imports-nothing',
      comment:
        'Spec §1.2 rule 1: @bridge/uir is the shared vocabulary and imports nothing from the workspace.',
      severity: 'error',
      from: { path: '^packages/uir/src' },
      to: { path: '^packages/(?!uir/)' },
    },
    {
      name: 'plugin-sdk-only-uir',
      comment: 'Spec §1.2: @bridge/plugin-sdk depends on @bridge/uir only.',
      severity: 'error',
      from: { path: '^packages/plugin-sdk/src' },
      to: { path: '^packages/(?!(uir|plugin-sdk)/)' },
    },
    {
      name: 'plugin-realm-no-compiler-internals',
      comment:
        'Spec §1.2 rule 2: generators, adapters, verifiers and AI import only @bridge/uir + @bridge/plugin-sdk. ' +
        'This is the guarantee that a Vue/Angular/Svelte generator can be added without touching the compiler.',
      severity: 'error',
      from: { path: PLUGIN_REALM },
      to: { path: COMPILER_SIDE },
    },
    {
      name: 'compiler-no-static-plugin-import',
      comment:
        'Spec §1.2 rule 3: the compiler discovers generators/adapters via the plugin host at runtime, ' +
        'never via static import. First-party plugins are wired exactly like third-party ones.',
      severity: 'error',
      from: { path: '^packages/(core|compiler)/src' },
      to: { path: '^packages/(generators|adapters)/' },
    },
    {
      name: 'core-below-compiler',
      comment: 'Spec §1.2 dependency graph: @bridge/core sits below @bridge/compiler and the CLI.',
      severity: 'error',
      from: { path: '^packages/core/src' },
      to: { path: '^packages/(compiler|cli|verification|ai)/' },
    },
    {
      name: 'runtime-kits-are-compiler-free',
      comment:
        'Spec §1.2 rule 4: runtime kits ship to end-user apps, the compiler ships to build machines. ' +
        'A runtime kit may reference @bridge/uir types (tokens) and nothing else in the workspace.',
      severity: 'error',
      from: { path: '^packages/runtimes/' },
      to: { path: '^packages/(?!(uir|runtimes)/)' },
    },
    {
      name: 'nothing-depends-on-cli',
      comment: 'Spec §10: the CLI is the top of the graph; nothing may depend on it (INV-17).',
      severity: 'error',
      from: { pathNot: '^packages/cli/' },
      to: { path: '^packages/cli/' },
    },
    {
      name: 'no-circular',
      comment: 'Cycles break the pass/query model and deterministic builds.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|coverage|node_modules|tests)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.depcruise.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
