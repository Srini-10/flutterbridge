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

/** A framework catalog. */
export interface Catalog {
  readonly catalog: string;
  readonly priority: number;
  readonly library: string;
  readonly componentBases: readonly string[];
  readonly stateBase: string;
  readonly stateHolders: readonly string[];
  readonly storeBases: readonly string[];
  readonly lifecycle: Readonly<Record<string, string>>;
  readonly stateBatchCalls: readonly string[];
  readonly semantics: SemanticsMeta;
  readonly theme: ThemeMeta;
  readonly widgets: readonly WidgetEntry[];
}

/** Reads and validates a catalog. */
export function parseCatalog(json: unknown, path: string): Catalog {
  const c = json as Catalog;

  const required = ['catalog', 'priority', 'library', 'widgets'] as const;
  for (const key of required) {
    if (c[key] === undefined) throw new Error(`${path}: missing "${key}"`);
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
  }

  return c;
}
