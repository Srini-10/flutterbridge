// The compiler-side widget registry.
//
// The one place the compiler can ask a question about a widget — and it gets back **metadata, never
// behaviour**. There is no `flatten(node)` to call and no callback to invoke, because the SPI provides
// none: an adapter states facts, and the compiler decides what to do with them.
//
// A normalization pass therefore never learns the word `Scaffold`. It asks `slotsOf(widget)` and gets an
// answer, and the same pass normalizes a SwiftUI tree unchanged.

import type { BridgePlugin, WidgetSpec } from '@bridge/plugin-sdk';

import type { Diagnostic } from '../diagnostic.js';

/** A widget, as the UIR names it. */
export interface WidgetRef {
  readonly name: string;
  readonly library?: string;
}

/** Everything the loaded adapters know about widgets, merged. */
export class WidgetRegistry {
  /** The empty registry: knows nothing, and says so. Every query returns "no". */
  static readonly empty = new WidgetRegistry(new Map(), []);

  /** Specs by widget name. Several, when two frameworks share a name — disambiguated by library. */
  readonly #specs: ReadonlyMap<string, readonly WidgetSpec[]>;

  /** Conflicts found while merging. Reported by the caller, which owns the sink. */
  readonly conflicts: readonly Diagnostic[];

  private constructor(
    specs: ReadonlyMap<string, readonly WidgetSpec[]>,
    conflicts: readonly Diagnostic[],
  ) {
    this.#specs = specs;
    this.conflicts = conflicts;
  }

  /**
   * Merges the catalogs of [plugins].
   *
   * Catalogs are applied in `(priority, name)` order — a **total** order, so the result cannot depend on
   * the order plugins were loaded in. A widget described by two catalogs at the **same priority** is
   * ambiguous, and ambiguity in a compiler is a defect, not a preference: which one won would depend on
   * a list's order, and the meaning of a user's program may never depend on that.
   */
  static from(plugins: readonly BridgePlugin[]): WidgetRegistry {
    const catalogs = plugins
      .flatMap((p) => (p.widgets ? [p.widgets] : []))
      .sort((a, b) =>
        a.priority !== b.priority ? a.priority - b.priority : a.name < b.name ? -1 : 1,
      );

    const specs = new Map<string, WidgetSpec[]>();
    const owner = new Map<string, { name: string; priority: number }>();
    const conflicts: Diagnostic[] = [];

    for (const catalog of catalogs) {
      for (const spec of catalog.widgets) {
        const key = keyOf(spec.name, spec.library);
        const previous = owner.get(key);

        if (previous !== undefined && previous.priority === catalog.priority) {
          conflicts.push({
            code: 'BRG2108',
            severity: 'error',
            message:
              `The catalogs \`${previous.name}\` and \`${catalog.name}\` both describe the widget ` +
              `\`${spec.name}\` at the same priority. Which one wins would depend on the order they ` +
              `happen to be listed in, so the compiler refuses to let that decide what your code means. ` +
              `Give one of them a higher priority, deliberately.`,
          });
          continue;
        }

        // A higher-priority catalog already claimed it: first match wins, and it wins deterministically.
        if (previous !== undefined) continue;

        const byName = specs.get(spec.name) ?? [];
        byName.push(spec);
        specs.set(spec.name, byName);
        owner.set(key, { name: catalog.name, priority: catalog.priority });
      }
    }

    return new WidgetRegistry(specs, conflicts);
  }

  /** What is known about [widget], or undefined if nothing is. */
  specOf(widget: WidgetRef): WidgetSpec | undefined {
    const candidates = this.#specs.get(widget.name);
    if (candidates === undefined) return undefined;

    // The library is matched as a **prefix**, and it has to be. A catalog says `package:flutter/`; the
    // UIR carries the library the element model resolved, which is
    // `package:flutter/src/widgets/container.dart`. An exact comparison matches neither, and the
    // registry answers "I have never heard of Container" for every widget in Flutter — which is exactly
    // what it did until the corpus said otherwise.
    //
    // Two frameworks may both call something `Card`, and the prefix is what tells them apart. An entry
    // with **no** library matches any library: a deliberate escape hatch for a widget that is genuinely
    // universal, and the fallback when nothing more specific matches.
    return (
      candidates.find(
        (spec) => spec.library !== undefined && widget.library?.startsWith(spec.library) === true,
      ) ?? candidates.find((spec) => spec.library === undefined)
    );
  }

  /** The named parameters of [widget] that hold a single child rather than a prop. */
  slotsOf(widget: WidgetRef): readonly string[] {
    return this.specOf(widget)?.slots ?? [];
  }

  /** The parameter of [widget] that holds an ordered list of children, if it has one. */
  childrenPropOf(widget: WidgetRef): string | undefined {
    return this.specOf(widget)?.childrenProp;
  }

  /**
   * Whether [widget], carrying exactly [props], is a transparent wrapper — a pass-through that renders
   * its child and nothing else.
   *
   * **A widget with no entry is never transparent**, and that is the safe default. A `Center` with no
   * props still centres: its identity *is* its behaviour. Guessing that a prop-less widget must be a
   * pass-through is how a compiler silently deletes a layout.
   */
  isTransparent(widget: WidgetRef, props: readonly string[]): boolean {
    const significant = this.specOf(widget)?.transparentWithoutProps;
    if (significant === undefined) return false;

    return props.every((prop) => !significant.includes(prop));
  }
}

/** A widget's key. The library qualifies the name, because two frameworks may share one. */
function keyOf(name: string, library?: string): string {
  return library === undefined ? name : `${library}${name}`;
}
