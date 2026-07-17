// The widget map — Flutter widget → runtime component.
//
// ## Why this table exists, and why it is small on purpose
//
// ADR-6 fixes the emission shape: `Row(mainAxisAlignment: spaceBetween)` becomes
// `<Row mainAxisAlignment="spaceBetween">` **imported from the kit**, not a bespoke flexbox `<div>` inlined at
// every call site. So the generator's job for a `ui.Element` is a lookup, and this is the table.
//
// ## Why it is not in catalog/widgets/material.json
//
// ADR-18 governs *framework* metadata — what a widget **is**: which named parameters are slots, which holds
// ordered children, when it is a transparent wrapper. That is authored once and generated into every domain
// that needs it, because the analyzer and the compiler both need the same answer and once gave two.
//
// This is not that. "Flutter's `Column` is rendered by `@bridge/runtime-react`'s `Column`" is a fact about
// **one target**, needed by exactly one package. Putting it in the shared catalog would push React's
// vocabulary into the file the Dart analyzer generates from, which is the direction ADR-18 exists to prevent.
// A Vue generator will have its own table, naming its own kit, and the two will not disagree — they are not
// answering the same question.
//
// The catalog is still consulted, and must be: `WidgetSpec.slots` and `.childrenProp` are what tell the
// emitter that `Scaffold.body` is a place on the screen and `AppBar.actions` is an ordered list. This table
// says only *what to render*.
//
// ## Unmapped is an error, not a fallback
//
// A widget with no entry gets `BRG3001`, and generation of that subtree stops. It does not become a `<div>`.
// A `<div>` where a `Card` belonged is an application that renders, looks nearly right, and is wrong — which
// is worth less than one that says exactly what it could not do.

/** How a Flutter widget is rendered by the kit. */
export interface WidgetMapping {
  /** The component exported by `@bridge/runtime-react`. */
  readonly component: string;
  /**
   * Flutter prop → runtime prop. Props absent from this map are **not forwarded**.
   *
   * Silence is the point: a `Text` with a `style:` the kit cannot express must not have `style` passed
   * through to a component that would ignore it, because then the output claims to have applied it.
   */
  readonly props?: Readonly<Record<string, string>>;
  /**
   * Flutter **slot** → runtime prop.
   *
   * A slot holds a single child rather than a value — `Center`'s `child`, `Scaffold`'s `body`, `AppBar`'s
   * `title`. `ui.Element` keeps them in their own `slots` field, apart from `props` and `children`, and the
   * distinction is not cosmetic: ADR-18 records what happened when extraction flattened them into props —
   * *"the UI structure was simply gone"*, because no pass and no generator could see they were children.
   *
   * The analyzer has already done the classification, using the catalog, so the emitter reads `node.slots`
   * and does not re-derive which parameter is a slot. This map only says what the *kit* calls it.
   */
  readonly slots?: Readonly<Record<string, string>>;
  /** Flutter enum values that must be lowered to the kit's, per prop. */
  readonly enums?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

/** Flutter's `MainAxisAlignment.spaceBetween` arrives as `spaceBetween`; the kit takes the same word. */
const AXIS_ALIGNMENT: Readonly<Record<string, string>> = {
  start: 'start',
  end: 'end',
  center: 'center',
  spaceBetween: 'spaceBetween',
  spaceAround: 'spaceAround',
  spaceEvenly: 'spaceEvenly',
};

const CROSS_ALIGNMENT: Readonly<Record<string, string>> = {
  start: 'start',
  end: 'end',
  center: 'center',
  stretch: 'stretch',
  baseline: 'baseline',
};

/**
 * The widgets this generator can render, and nothing else.
 *
 * M3-B's supported surface, deliberately minimal per its brief ("support the smallest complete end-to-end
 * application", "do NOT begin implementing advanced widgets"). Every entry here has a real component in
 * `@bridge/runtime-react`; adding a row without adding the component is how a generator emits an import that
 * does not resolve.
 */
export const WIDGET_MAP: Readonly<Record<string, WidgetMapping>> = {
  Text: { component: 'Text' },
  Column: {
    component: 'Column',
    props: {
      mainAxisAlignment: 'mainAxisAlignment',
      crossAxisAlignment: 'crossAxisAlignment',
      mainAxisSize: 'mainAxisSize',
    },
    enums: { mainAxisAlignment: AXIS_ALIGNMENT, crossAxisAlignment: CROSS_ALIGNMENT },
  },
  Row: {
    component: 'Row',
    props: {
      mainAxisAlignment: 'mainAxisAlignment',
      crossAxisAlignment: 'crossAxisAlignment',
      mainAxisSize: 'mainAxisSize',
    },
    enums: { mainAxisAlignment: AXIS_ALIGNMENT, crossAxisAlignment: CROSS_ALIGNMENT },
  },
  Center: { component: 'Center', slots: { child: 'child' } },
  Padding: { component: 'Padding', props: { padding: 'padding' }, slots: { child: 'child' } },
  SizedBox: {
    component: 'SizedBox',
    props: { width: 'width', height: 'height' },
    slots: { child: 'child' },
  },
  ElevatedButton: {
    component: 'ElevatedButton',
    props: { onPressed: 'onPressed' },
    slots: { child: 'child' },
  },
};

/** The mapping for `name`, or `undefined` if this generator cannot render it. */
export function mappingOf(name: string): WidgetMapping | undefined {
  return WIDGET_MAP[name];
}
