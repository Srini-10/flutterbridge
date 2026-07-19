// The plugin host.
//
// Loads adapters **by name, at runtime**. The compiler never imports one.
//
// `.dependency-cruiser.cjs` enforces that (`compiler-no-static-plugin-import`), and the rule is not
// ceremony. A normalization pass that could `import { materialWidgets } from '@bridge/widgets-material'`
// is a pass that knows what Flutter is — and the moment one does, the pipeline stops being universal.
// A SwiftUI frontend and a React frontend could no longer share it.
//
// So the compiler holds the *shape* of a plugin (`@bridge/plugin-sdk`) and nothing else, and the host
// resolves the plugin itself through a dynamic `import()` of a specifier it is handed. Which adapters a
// build uses is a fact about that build's configuration, not about the compiler's source.

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import type { BridgePlugin } from '@bridge/plugin-sdk';

/** A plugin that could not be loaded, and why. */
export class PluginError extends Error {
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = 'PluginError';
  }
}

/** Loads plugins by module specifier. */
/** Where to resolve plugin specifiers from. */
export interface LoadOptions {
  /**
   * The directory a plugin specifier is resolved against — normally the user's project.
   *
   * ## Why this exists
   *
   * A bare `import(specifier)` resolves relative to **the module performing the import**, which is this
   * file. So without it every plugin had to be a dependency of `@bridge/compiler` — which is why
   * `@bridge/widgets-material` appears in the compiler's own manifest, and which means **a third-party
   * generator could never have been loaded at all**: nobody can add a dependency to a package they do not
   * publish.
   *
   * That is the opposite of what Spec §1.2 rule 3 is for. The rule exists so that "a Vue/Angular/Svelte
   * generator can be added without touching the compiler", and resolving from the compiler made touching
   * the compiler mandatory.
   *
   * M5-B found it the first time a plugin was loaded from outside this workspace. A project declares its
   * plugins in `bridge.json`; they now resolve from the project, which is where its `node_modules` is.
   *
   * Several bases are tried in order, because there are legitimately two: a plugin the *project* installed,
   * and a first-party plugin that ships beside the tool. A user who has installed neither gets the import's
   * own error, naming every place that was looked.
   */
  readonly from?: string | readonly string[];
}

export class PluginHost {
  readonly plugins: readonly BridgePlugin[];

  private constructor(plugins: readonly BridgePlugin[]) {
    this.plugins = plugins;
  }

  /** A host over plugins already in hand. Used by tests, and by a caller that has its own loader. */
  static of(plugins: readonly BridgePlugin[]): PluginHost {
    return new PluginHost(sorted(plugins));
  }

  /**
   * Loads each of [specifiers] and takes its default export as a plugin.
   *
   * A specifier that does not resolve, or resolves to something that is not a plugin, is a **hard
   * failure**. Skipping it would produce a compiler that silently knows less than it was configured to
   * know — and the symptom of that is not an error, it is a widget catalog with a hole in it, and a
   * generated application missing a layout nobody can explain.
   */
  static async load(specifiers: readonly string[], options: LoadOptions = {}): Promise<PluginHost> {
    const plugins: BridgePlugin[] = [];
    const resolve = resolverFrom(options.from);

    for (const specifier of specifiers) {
      let module: { readonly default?: unknown };
      try {
        module = (await import(resolve(specifier))) as { readonly default?: unknown };
      } catch (cause) {
        const bases = basesOf(options.from);
        throw new PluginError(
          `plugin "${specifier}" could not be loaded` +
            (bases.length === 0 ? '' : `. Looked in: ${bases.join(', ')}`),
          { cause },
        );
      }

      const plugin = module.default;
      if (!isPlugin(plugin)) {
        throw new PluginError(
          `plugin "${specifier}" has no default export that looks like a BridgePlugin ` +
            `(it needs a \`name\` and a \`version\`).`,
        );
      }
      plugins.push(plugin);
    }

    return new PluginHost(sorted(plugins));
  }
}

/**
 * Plugins in a **total** order: by name.
 *
 * Not the order they were listed in, and not the order their imports happened to resolve in. A registry
 * whose merge order could differ between two runs is a registry that could make the compiler
 * non-deterministic (D1–D5), which is the one thing it may never be.
 */
function sorted(plugins: readonly BridgePlugin[]): readonly BridgePlugin[] {
  return [...plugins].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function isPlugin(value: unknown): value is BridgePlugin {
  if (value === null || typeof value !== 'object') return false;
  const plugin = value as Record<string, unknown>;
  return typeof plugin['name'] === 'string' && typeof plugin['version'] === 'string';
}

/**
 * A specifier resolver rooted at [from], or the plain specifier when there is none.
 *
 * Resolution goes through `createRequire`, which is Node's own algorithm — the same one `import` uses — so a
 * plugin resolves exactly the way it would if the project imported it directly. Falling back to the bare
 * specifier keeps every existing caller working: a host built with no base behaves as it always did.
 *
 * The trailing separator on each base matters: `createRequire` treats its argument as a *file*, so resolving
 * from `/project` would look in `/`'s `node_modules` rather than `/project`'s.
 */
function resolverFrom(from: string | readonly string[] | undefined): (specifier: string) => string {
  const bases = basesOf(from);
  if (bases.length === 0) return (specifier) => specifier;

  const resolvers = bases.map((base) => createRequire(pathToFileURL(`${base}/`)));
  return (specifier) => {
    for (const resolver of resolvers) {
      try {
        return pathToFileURL(resolver.resolve(specifier)).href;
      } catch {
        // Not here. Try the next base; the last resort is the bare specifier, so the error a caller sees is
        // the import's own rather than one this function invented.
      }
    }
    return specifier;
  };
}

/** The bases to try, as a list. */
function basesOf(from: string | readonly string[] | undefined): readonly string[] {
  if (from === undefined) return [];
  return typeof from === 'string' ? [from] : from;
}
