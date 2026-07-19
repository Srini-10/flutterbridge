// The catalog, as authored.
//
// One JSON file per framework, in `catalog/widgets/`. It is the **only** place framework metadata is
// written (ADR-18). Everything in both language domains is generated from it.

/** One widget's facts. */
export interface WidgetEntry {
  readonly name: string;
  /** Named parameters holding a single child. */
  readonly slots?: readonly string[];
  /** The parameter holding an ordered list of children — often, but not always, `children`. */
  readonly childrenProp?: string;
  /** The widget is a transparent wrapper when none of these props is set. Absent = never transparent. */
  readonly transparentWithoutProps?: readonly string[];
  /** `text` — its whole purpose is one text value. `async` — it renders on an asynchronous value. */
  readonly role?: 'text' | 'async';
  /**
   * Names for the widget's **positional** arguments, keyed by constructor (`""` is the unnamed one).
   *
   * Extraction knows a named argument's meaning from its label and a slot's from {@link slots}. A
   * positional argument has neither, so before ADR-0023 it reached UIR under a synthetic `_positional0`
   * key — present, correctly typed, and impossible for any consumer to interpret. `Image.asset`'s path and
   * `Icon`'s icon both landed there.
   *
   * Keyed by constructor because Flutter names them differently per constructor: `Image.asset(String name)`
   * against `Image.network(String src)`. A single list would have to pick one and be wrong for the other.
   *
   * `positionalProps[ctor][i]` names the *i*th positional argument. Where none is declared the old
   * behaviour stands, so this is additive and no existing extraction moves.
   */
  readonly positionalProps?: Readonly<Record<string, readonly string[]>>;
}

/**
 * Material's own numbers, transcribed from the Flutter SDK.
 *
 * INV-20 (ADR-13) forbids literal values in kit components, and M4-A proved why by shipping one: a
 * hard-coded divider colour that was wrong in dark mode. Colours resolve through the theme; *these* are the
 * non-colour constants Material defines — opacities, elevations, shapes, sizes — and ADR-18 puts them here,
 * in the one declarative source, generated into every runtime that needs them.
 *
 * Every field cites the SDK file and line it came from. A number that cannot be cited is a number somebody
 * remembered, and this file is the place that must not contain one.
 */
export interface MaterialMeta {
  /** The SDK version the values were read from. */
  readonly flutterVersion: string;
  /** State layer opacities, by interaction. */
  readonly stateLayerOpacity: Readonly<Record<string, number>>;
  /** Disabled-state opacities, for the container and its content. */
  readonly disabledOpacity: Readonly<Record<string, number>>;
  /** M3 renders elevation as a surface tint; these are the interpolation stops. */
  readonly elevationOverlay: { readonly stops: readonly { elevation: number; opacity: number }[] };
  /** Icon geometry and the icon font's family. */
  readonly icon: Readonly<Record<string, number | string>>;
  /** Per-component defaults. `colorRole` names a role the theme resolves, never a literal colour. */
  readonly components: Readonly<Record<string, Readonly<Record<string, number | string>>>>;
}

/** How a framework announces accessibility. */
export interface SemanticsMeta {
  readonly labelProps: readonly string[];
  readonly widgets: Readonly<Record<string, Readonly<Record<string, string | boolean>>>>;
}

/** How a framework declares a theme. */
export interface ThemeMeta {
  readonly types: readonly string[];
  readonly seedConstructor: string;
  readonly seedProp: string;
  readonly brightnessProp: string;
  readonly nonRoleProps: readonly string[];
}

/** How a framework navigates. */
export interface NavigationMeta {
  /** The classes that own the navigation methods — `Navigator`, `NavigatorState`. */
  readonly types: readonly string[];
  /** Methods taking a **Route object**, whose destination is built inline → `RouteTransition.component`. */
  readonly pushRoute: readonly string[];
  /** Methods taking a **path string** → `RouteTransition.target`. */
  readonly pushPath: readonly string[];
  /** Methods that return along an existing edge. Not transitions at all (Spec v2.4 §A17.3). */
  readonly pop: readonly string[];
  /** Top-level functions that open a route overlay — each pushes a `Route` (ADR-0024). */
  readonly overlayOpeners: readonly string[];
  /** The `Route` implementations whose `builder` produces the destination. */
  readonly routeTypes: readonly string[];
  /** The parameter of a route type that builds the destination widget. */
  readonly builderProp: string;
  /**
   * The `RouteSettings` property an `onGenerateRoute` switch selects on.
   *
   * Reading that switch is what makes a router written as a *function* visible to the static route
   * graph. M6-D measured that the corpus declares **zero** `routes:` maps and routes entirely through
   * `onGenerateRoute`, so without this the largest application's whole routing surface is invisible.
   */
  readonly settingsNameProp: string;
}

/**
 * A constructor whose children come from a builder closure over an index range.
 *
 * `ListView.builder(itemCount: n, itemBuilder: (context, i) => W)` states the same thing
 * `for (final x in xs) W(x)` does, in the spelling Flutter chose for large lists. Extraction expands both
 * into `ui.List`, so no pass and no generator has to know which spelling the author used.
 *
 * The parameter *names* are framework metadata — `itemBuilder`/`itemCount` for these three, and a package
 * with its own lazy list would use its own — so ADR-18 puts them here rather than in an extractor.
 */
export interface LazyBuilder {
  /** The parameter holding the `(BuildContext, int) -> Widget` closure. */
  readonly builderProp: string;
  /** The parameter holding the item count. */
  readonly countProp: string;
}

/**
 * A widget whose only purpose is to scope a rebuild.
 *
 * Flutter needs these because `setState` rebuilds a whole `State`. Under ADR-4 and ADR-20 a signal read *is*
 * the subscription, so the scope a Flutter program had to state by hand is what the signal graph already
 * computes — and INV-22 requires the wrapper not to survive extraction.
 */
export interface RebuildBuilder {
  /** The parameter holding the `(BuildContext, …) -> Widget` closure. */
  readonly builderProp: string;
  /** The parameter whose listenable binds the builder's *value* parameter, when it has one. */
  readonly valueProp?: string;
}

/** A framework catalog. */
export interface Catalog {
  readonly catalog: string;
  readonly priority: number;
  readonly library: string;
  // ── Framework-only sections. ──
  //
  // Optional since M4-I, which added the first **package** catalog. A package contributes widgets and
  // nothing else: `gap` declares no component base, no lifecycle, no navigation vocabulary and no theme,
  // and requiring it to state empty ones would be requiring it to answer questions about a framework it is
  // not. ADR-18's promise was that a package costs "a line and a file"; making these required would have
  // made it cost a page of empty objects too.
  readonly componentBases?: readonly string[];
  readonly stateBase?: string;
  /** The getter a `State` uses to reach its `StatefulWidget`'s fields — `widget` (INV-22). */
  readonly componentPropsGetter?: { readonly name?: string };
  readonly stateHolders?: readonly string[];
  readonly storeBases?: readonly string[];
  readonly lifecycle?: Readonly<Record<string, string>>;
  readonly stateBatchCalls?: readonly string[];
  /**
   * Framework calls that announce a change and carry no other meaning (INV-22).
   *
   * A nested object rather than a bare list, so the catalog can carry the `$comment` that explains why
   * erasing is correct — the reasoning is the load-bearing part, and a bare array has nowhere to put it.
   */
  readonly changeNotificationCalls?: { readonly calls?: readonly string[] };
  readonly navigation?: NavigationMeta;
  readonly semantics?: SemanticsMeta;
  readonly theme?: ThemeMeta;
  /**
   * Types whose static consts are extracted as their **value** rather than as a reference, and the fields
   * to read off the evaluated constant.
   *
   * `Icons.star` is `IconData(0xe5f9, fontFamily: 'MaterialIcons')`. Extracting it as a reference obliges
   * every runtime kit to carry Flutter's ~2000-entry `Icons` table so the name resolves; folding it to the
   * constant carries the codepoint, which is the icon's actual identity. Catalog-driven rather than a
   * special case in the extractor, so a second font-backed type is one JSON edit.
   */
  readonly constValues?: Readonly<Record<string, readonly string[]>>;
  /**
   * Widgets whose only purpose is to scope a rebuild, keyed by name. See {@link RebuildBuilder}.
   */
  readonly rebuildBuilders?: Readonly<Record<string, RebuildBuilder>>;
  /**
   * Constructors whose children come from a builder closure, keyed `Widget.constructor`.
   *
   * See {@link LazyBuilder}. Absent means no widget has one, which is true of a framework that spells every
   * list literally.
   */
  readonly lazyBuilders?: Readonly<Record<string, LazyBuilder>>;
  /**
   * Easing curves → their CSS timing function.
   *
   * Flutter declares most of its curves as `Cubic(x1, y1, x2, y2)`, which *is* CSS's
   * `cubic-bezier(x1, y1, x2, y2)` — the same four control points of the same unit cubic Bezier. A curve
   * with no CSS equivalent (the bounce, elastic and three-point families) is absent, and the generator
   * refuses it by name rather than substituting a nearby one.
   */
  readonly curves?: Readonly<Record<string, string>>;
  /** Material's numbers, for the runtime kits. See {@link MaterialMeta}. */
  readonly material?: MaterialMeta;
  readonly widgets: readonly WidgetEntry[];
}

/** Reads and validates a catalog. */
export function parseCatalog(json: unknown, path: string): Catalog {
  const c = json as Catalog;

  const required = ['catalog', 'priority', 'library', 'widgets'] as const;
  for (const key of required) {
    if (c[key] === undefined) throw new Error(`${path}: missing "${key}"`);
  }

  // One method cannot mean two things. `pushNamed` in both pushRoute and pushPath would make the
  // destination depend on which list was consulted first, and a compiler may never be ambiguous.
  const nav = c.navigation;
  if (nav !== undefined) {
    const groups = { pushRoute: nav.pushRoute, pushPath: nav.pushPath, pop: nav.pop };
    const owner = new Map<string, string>();
    for (const [group, methods] of Object.entries(groups)) {
      for (const method of methods ?? []) {
        const previous = owner.get(method);
        if (previous !== undefined) {
          throw new Error(
            `${path}: navigation method "${method}" is in both "${previous}" and "${group}". ` +
              `One method cannot both create an edge and not create one.`,
          );
        }
        owner.set(method, group);
      }
    }
  }

  // A duplicate widget is a fact stated twice, and the second statement is the one nobody notices.
  const seen = new Set<string>();
  for (const widget of c.widgets) {
    if (seen.has(widget.name)) throw new Error(`${path}: widget "${widget.name}" is declared twice`);
    seen.add(widget.name);

    if (widget.childrenProp !== undefined && widget.slots?.includes(widget.childrenProp)) {
      throw new Error(
        `${path}: "${widget.name}" declares "${widget.childrenProp}" as both a slot and its children ` +
          `property. One parameter cannot be both a single child and a list of them.`,
      );
    }

    // A positional name that collides with a named parameter would make extraction's output depend on
    // which argument it read first, and one of the two would silently overwrite the other.
    for (const [ctor, names] of Object.entries(widget.positionalProps ?? {})) {
      for (const name of names) {
        if (widget.slots?.includes(name) || widget.childrenProp === name) {
          throw new Error(
            `${path}: "${widget.name}" names positional argument "${name}" (constructor ` +
              `"${ctor || '<unnamed>'}"), which is already a slot or its children property. A parameter ` +
              `cannot be reached both positionally and by name.`,
          );
        }
      }
      if (new Set(names).size !== names.length) {
        throw new Error(
          `${path}: "${widget.name}" constructor "${ctor || '<unnamed>'}" names two positional ` +
            `arguments the same. Each index must have its own name.`,
        );
      }
    }
  }

  return c;
}
