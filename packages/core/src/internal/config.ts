// The project configuration — `bridge.json`.
//
// ## One parser, and why it lives here
//
// `@bridge/core`'s own description has named this since M0: *"Plugin host, VFS + hash-guard, diagnostics
// engine, **config loader**, structured logging"*, carried as an M2 stub tag. Core sits below both the
// compiler and the CLI in Spec §1.2's dependency graph, so it is the one place both can read the same file
// without either importing the other. There is no second parser anywhere.
//
// ## Why JSON and not YAML
//
// The brief offers `bridge.yaml` or `bridge.json`, and the evidence points at JSON:
//
//   * **The workspace has no YAML parser and needs none.** Every authored configuration in this repository
//     is already JSON — the widget catalogs, `tsconfig`, `package.json`, the UIR schemas. Adding a YAML
//     dependency to read one file would put a parser in the dependency tree of a tool that ships to build
//     machines, for no capability.
//   * **`$schema` works.** A JSON file gets completion and validation in every editor with no plugin, which
//     is worth more to a new user than block syntax.
//
// A `bridge.yaml` sitting in a project is therefore not silently ignored: `doctor` reports it, and says
// which format is read. A silent miss would be the worst of both.
//
// ## Every field here is consumed by something
//
// A configuration key that nothing reads is fake functionality — it invites a user to set a value and
// changes nothing, which is worse than not offering it. So this file describes only what the pipeline
// actually consults, and the doc comment on each field says which command reads it.

/** How a project is compiled. Every field is optional; {@link DEFAULT_CONFIG} states the default. */
export interface BridgeConfig {
  /**
   * The Flutter project to compile, relative to the configuration file.
   *
   * Read by `analyze`. It is the directory holding `pubspec.yaml` — the analyzer resolves the package graph
   * from there.
   */
  readonly source: string;

  /**
   * Where the emitted project is written, relative to the configuration file.
   *
   * Read by `generate` and `build`, and emptied by `clean`.
   */
  readonly out: string;

  /**
   * Where intermediate documents are written, relative to the configuration file.
   *
   * The UIR the analyzer produces and the normalized document the compiler produces. Kept because they are
   * the input to every `bridge` inspection command — `widget-tree`, `graph`, `explain` — and a user
   * debugging a build needs them to still be there.
   */
  readonly work: string;

  /**
   * The plugin whose generator emits the project, as a module specifier.
   *
   * Loaded at runtime through the compiler's `PluginHost`, never by static import: Spec §1.2 rule 3 makes
   * first-party generators load exactly the way a third-party one would, and this is the field that proves
   * it. Set it to a package of your own and nothing in the compiler changes.
   */
  readonly generator: string;

  /**
   * Widget catalogs to load, as module specifiers.
   *
   * Read by `analyze`, `normalize` and `generate`. A catalog tells the compiler what a widget *is* — which
   * parameters are slots, which hold ordered children (ADR-18). Adding a package's catalog here is how the
   * compiler learns about that package's widgets.
   */
  readonly plugins: readonly string[];

  /** Diagnostic reporting. */
  readonly diagnostics: {
    /**
     * The lowest severity to print.
     *
     * Does **not** change what is reported — an `error` still fails the build at `error` or `warning` or
     * `info`. It changes what is shown, and nothing else: a filter that could suppress an error would be a
     * filter that makes a broken build look clean.
     */
    readonly level: 'error' | 'warning' | 'info';
  };

  /** What `build` does after generating. */
  readonly build: {
    /**
     * Whether to typecheck the emitted project.
     *
     * On by default. The emitted project imports only React and the runtime kit, so `tsc` covers every
     * module the generator wrote — which is what makes "it generated" and "it compiles" the same claim.
     */
    readonly typecheck: boolean;
  };
}

/**
 * The configuration a project gets when it states nothing.
 *
 * Chosen so that `bridge init` in a Flutter project directory produces a file whose every value is already
 * correct, and so that deleting the file entirely still works. A default that needs editing before the first
 * run is a default that has not done its job.
 */
export const DEFAULT_CONFIG: BridgeConfig = Object.freeze({
  source: '.',
  out: 'build/bridge',
  work: '.bridge',
  generator: '@bridge/gen-react',
  plugins: Object.freeze(['@bridge/widgets-material']) as readonly string[],
  diagnostics: Object.freeze({ level: 'warning' as const }),
  build: Object.freeze({ typecheck: true }),
});

/** The file name looked for, in order. */
export const CONFIG_FILES: readonly string[] = Object.freeze(['bridge.json']);

/** A configuration problem, phrased for the person who wrote the file. */
export interface ConfigProblem {
  /** Dotted path to the offending key, e.g. `diagnostics.level`. */
  readonly key: string;
  /** What is wrong, and what to write instead. */
  readonly message: string;
}

/** A parsed configuration, and everything wrong with it. */
export interface ConfigResult {
  /** The configuration, with defaults filled in. Usable even when {@link problems} is non-empty. */
  readonly config: BridgeConfig;
  /** Everything wrong with the file. Empty when it is valid. */
  readonly problems: readonly ConfigProblem[];
}

/**
 * Parses a configuration document.
 *
 * **Every problem is collected, not the first.** A user who has three keys wrong should learn that once
 * rather than three times, and a parser that stops at the first is a parser that makes a user run the tool
 * once per mistake.
 *
 * An unknown key is a problem rather than an error: it is almost always a typo, and telling somebody that
 * `outDir` is not a key — when `out` is — is the whole value of noticing.
 *
 * @param document - the parsed JSON, or anything at all.
 * @returns the configuration and its problems.
 */
export function parseConfig(document: unknown): ConfigResult {
  const problems: ConfigProblem[] = [];

  if (document === null || typeof document !== 'object' || Array.isArray(document)) {
    return {
      config: DEFAULT_CONFIG,
      problems: [
        {
          key: '',
          message: 'the configuration must be a JSON object, e.g. `{ "source": "." }`.',
        },
      ],
    };
  }

  const raw = document as Record<string, unknown>;
  const known = new Set([
    '$schema',
    'source',
    'out',
    'work',
    'generator',
    'plugins',
    'diagnostics',
    'build',
  ]);
  // Sorted, so two runs over the same file report in the same order — a diagnostic list is part of the
  // output a user diffs.
  for (const key of Object.keys(raw).sort()) {
    if (known.has(key)) continue;
    problems.push({
      key,
      message: `unknown key. Valid keys: ${[...known].filter((k) => k !== '$schema').sort().join(', ')}.`,
    });
  }

  const text = (key: 'source' | 'out' | 'work' | 'generator'): string => {
    const value = raw[key];
    if (value === undefined) return DEFAULT_CONFIG[key];
    if (typeof value !== 'string' || value === '') {
      problems.push({ key, message: `must be a non-empty string; got ${describe(value)}.` });
      return DEFAULT_CONFIG[key];
    }
    return value;
  };

  const plugins = ((): readonly string[] => {
    const value = raw['plugins'];
    if (value === undefined) return DEFAULT_CONFIG.plugins;
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
      problems.push({
        key: 'plugins',
        message: `must be an array of module specifiers, e.g. ["@bridge/widgets-material"]; got ${describe(value)}.`,
      });
      return DEFAULT_CONFIG.plugins;
    }
    return value as readonly string[];
  })();

  const level = ((): 'error' | 'warning' | 'info' => {
    const section = raw['diagnostics'];
    if (section === undefined) return DEFAULT_CONFIG.diagnostics.level;
    if (section === null || typeof section !== 'object' || Array.isArray(section)) {
      problems.push({ key: 'diagnostics', message: `must be an object; got ${describe(section)}.` });
      return DEFAULT_CONFIG.diagnostics.level;
    }
    const value = (section as Record<string, unknown>)['level'];
    if (value === undefined) return DEFAULT_CONFIG.diagnostics.level;
    if (value !== 'error' && value !== 'warning' && value !== 'info') {
      problems.push({
        key: 'diagnostics.level',
        message: `must be "error", "warning" or "info"; got ${describe(value)}.`,
      });
      return DEFAULT_CONFIG.diagnostics.level;
    }
    return value;
  })();

  const typecheck = ((): boolean => {
    const section = raw['build'];
    if (section === undefined) return DEFAULT_CONFIG.build.typecheck;
    if (section === null || typeof section !== 'object' || Array.isArray(section)) {
      problems.push({ key: 'build', message: `must be an object; got ${describe(section)}.` });
      return DEFAULT_CONFIG.build.typecheck;
    }
    const value = (section as Record<string, unknown>)['typecheck'];
    if (value === undefined) return DEFAULT_CONFIG.build.typecheck;
    if (typeof value !== 'boolean') {
      problems.push({ key: 'build.typecheck', message: `must be true or false; got ${describe(value)}.` });
      return DEFAULT_CONFIG.build.typecheck;
    }
    return value;
  })();

  return {
    config: {
      source: text('source'),
      out: text('out'),
      work: text('work'),
      generator: text('generator'),
      plugins,
      diagnostics: { level },
      build: { typecheck },
    },
    problems,
  };
}

/** A value, as a user would recognise it in their own file. */
function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return typeof value === 'string' ? JSON.stringify(value) : typeof value;
}

/**
 * The configuration file a `bridge init` writes.
 *
 * Every default is written out rather than left implicit. A file that says only `{}` is correct and teaches
 * nothing; a file that lists what it is doing is the documentation a user reads first.
 */
export function defaultConfigDocument(): string {
  return `${JSON.stringify(
    {
      $schema: 'https://flutterbridge.dev/schema/bridge.json',
      source: DEFAULT_CONFIG.source,
      out: DEFAULT_CONFIG.out,
      work: DEFAULT_CONFIG.work,
      generator: DEFAULT_CONFIG.generator,
      plugins: DEFAULT_CONFIG.plugins,
      diagnostics: { level: DEFAULT_CONFIG.diagnostics.level },
      build: { typecheck: DEFAULT_CONFIG.build.typecheck },
    },
    null,
    2,
  )}\n`;
}
