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

import type { BridgePlugin } from '@bridge/plugin-sdk';

/** A plugin that could not be loaded, and why. */
export class PluginError extends Error {
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = 'PluginError';
  }
}

/** Loads plugins by module specifier. */
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
  static async load(specifiers: readonly string[]): Promise<PluginHost> {
    const plugins: BridgePlugin[] = [];

    for (const specifier of specifiers) {
      let module: { readonly default?: unknown };
      try {
        module = (await import(specifier)) as { readonly default?: unknown };
      } catch (cause) {
        throw new PluginError(`plugin "${specifier}" could not be loaded`, { cause });
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
