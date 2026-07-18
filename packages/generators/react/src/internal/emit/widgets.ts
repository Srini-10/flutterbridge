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
  /**
   * Flutter enum values that must be lowered to the kit's, per prop — the **`bind.Const` path**.
   *
   * Worth being precise about, because M4-C found this table is not the path real programs take. A Dart enum
   * member reaches the generator as a `bind.Expr` wrapping a `logic.Ref` named `BoxFit.cover`, *not* as a
   * `bind.Const` carrying `'cover'`: the analyzer resolves it as a static reference, and the reference lowers
   * by importing the type from the kit and emitting the member access unchanged. Every test that exercised
   * these maps before M4-C used hand-built UIR carrying a `bind.Const` no analyzer has ever produced.
   *
   * The table is kept because the `bind.Const` shape is legal UIR that another frontend or a future
   * normalization pass may emit, and because it *validates* membership — an unknown member is refused rather
   * than passed through. It is a second, narrower path, not the main one.
   */
  readonly enums?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /**
   * Material roles this component paints — a **capability requirement**, checked before emission.
   *
   * INV-20 (ADR-13): *"every colour a mapped Material widget paints must resolve to an `app.Token`"*. The
   * kit enforces the second half — a component reads a role through the theme surface and can hold no
   * literal — but nothing enforced the first, so a `Divider` in an app whose theme has no `outlineVariant`
   * compiled cleanly and threw `BRG4006` in the browser.
   *
   * Naming the roles here makes that a build error (`BRG3010`). It is deliberately on the mapping rather
   * than inferred: the generator cannot read the kit's source, and a requirement it cannot see is a
   * requirement it cannot check.
   */
  readonly roles?: readonly string[];
  /**
   * Props whose value is an `Alignment` — checked for representability before emission.
   *
   * Flutter's alignment is continuous; CSS flexbox has three positions per axis. A fractional alignment has
   * no faithful emission, and the generator refuses it (`BRG3011`) rather than letting the kit throw
   * `BRG4008` at render. Listed per prop because a widget may take several (`Stack.alignment`,
   * `Align.alignment`).
   */
  readonly alignmentProps?: readonly string[];
  /**
   * Props whose value is an **asset key** — a capability requirement, like {@link roles}.
   *
   * The generator collects these into the asset manifest, so a widget that references an asset needs no
   * bespoke collection code: naming the prop here is the whole registration. A key it cannot read as a
   * constant is reported (`BRG3012`) rather than omitted, because an asset silently missing from the
   * manifest becomes a broken `<img>`, which looks like a slow network.
   */
  readonly assetProps?: readonly string[];
  /**
   * Props whose value is a **colour token name** — a capability requirement, like {@link roles}.
   *
   * The analyzer turns every resolvable colour into a token name (M4-E), so a colour prop that arrives as
   * anything other than a constant string is one it could not resolve: a runtime-computed colour with no
   * single value to hoist. Naming the prop here makes that a build error (`BRG3014`) instead of a `[object
   * Object]` in a `background-color`.
   *
   * Nested colours — a `BoxDecoration`'s `border`'s — are not listed and do not need to be: the analyzer
   * resolves at every depth, so an unresolved one stays a `logic.*` node and fails `tsc` against the kit's
   * `ColorToken`. This catches the top-level case early, with a message rather than a type error.
   */
  readonly colorProps?: readonly string[];
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

/** `FlexFit.tight`/`.loose` arrive as `tight`/`loose`; the kit's `FlexFit` takes the same words. */
const FLEX_FIT: Readonly<Record<string, string>> = { tight: 'tight', loose: 'loose' };

/** `BoxFit` — how a replaced element's content fills its box. The kit's `BoxFit` takes the same words. */
const BOX_FIT: Readonly<Record<string, string>> = {
  fill: 'fill',
  contain: 'contain',
  cover: 'cover',
  fitWidth: 'fitWidth',
  fitHeight: 'fitHeight',
  none: 'none',
  scaleDown: 'scaleDown',
};

/** `Clip` — four Flutter values, of which only `none` is distinguishable in CSS (see the kit's decoration.ts). */
const CLIP: Readonly<Record<string, string>> = {
  none: 'none',
  hardEdge: 'hardEdge',
  antiAlias: 'antiAlias',
  antiAliasWithSaveLayer: 'antiAliasWithSaveLayer',
};

/** `Axis` — which way a scroll view or a `Flex` runs. */
const AXIS: Readonly<Record<string, string>> = { horizontal: 'horizontal', vertical: 'vertical' };

/** `TextAlign` — every member is its own CSS keyword, and stating them keeps the map total. */
const TEXT_ALIGN: Readonly<Record<string, string>> = {
  left: 'left',
  right: 'right',
  center: 'center',
  justify: 'justify',
  start: 'start',
  end: 'end',
};

/** `TextInputType` — which keyboard a field asks for. The kit's type takes the same words. */
const TEXT_INPUT_TYPE: Readonly<Record<string, string>> = {
  text: 'text',
  number: 'number',
  emailAddress: 'emailAddress',
  phone: 'phone',
  url: 'url',
  multiline: 'multiline',
};

/** `TextInputAction` — what the keyboard's action key does. */
const TEXT_INPUT_ACTION: Readonly<Record<string, string>> = {
  done: 'done',
  next: 'next',
  send: 'send',
  search: 'search',
  go: 'go',
};

/** `TextCapitalization` — how a field auto-capitalises. */
const TEXT_CAPITALIZATION: Readonly<Record<string, string>> = {
  none: 'none',
  words: 'words',
  sentences: 'sentences',
  characters: 'characters',
};

/** `WrapCrossAlignment` — three values, not the five of `CrossAxisAlignment`; the kit's type matches. */
const WRAP_CROSS_ALIGNMENT: Readonly<Record<string, string>> = {
  start: 'start',
  end: 'end',
  center: 'center',
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
    slots: { child: 'child', icon: 'icon', label: 'label' },
  },

  // ── M4-A: flex children ──
  Expanded: { component: 'Expanded', props: { flex: 'flex' }, slots: { child: 'child' } },
  Flexible: {
    component: 'Flexible',
    props: { flex: 'flex', fit: 'fit' },
    slots: { child: 'child' },
    enums: { fit: FLEX_FIT },
  },
  Spacer: { component: 'Spacer', props: { flex: 'flex' } },

  // ── M4-A: overflow and positioning ──
  Wrap: {
    component: 'Wrap',
    props: {
      spacing: 'spacing',
      runSpacing: 'runSpacing',
      alignment: 'alignment',
      crossAxisAlignment: 'crossAxisAlignment',
    },
    enums: { alignment: AXIS_ALIGNMENT, crossAxisAlignment: WRAP_CROSS_ALIGNMENT },
  },
  // `alignment` now forwards: M4-B's `layout/alignment.ts` carries the `Alignment` value type M4-A lacked.
  // `fit` still does not — `StackFit` sizes the stack against its children, which is the constraint model.
  Stack: { component: 'Stack', props: { alignment: 'alignment' }, alignmentProps: ['alignment'] },
  Positioned: {
    component: 'Positioned',
    props: {
      top: 'top',
      left: 'left',
      right: 'right',
      bottom: 'bottom',
      width: 'width',
      height: 'height',
    },
    slots: { child: 'child' },
  },

  // ── M4-A: Material rules, themed in M4-B ──
  // `color` is not forwarded: it is a `Color`, and a colour reaches the kit only through the token system
  // (ADR-21), not as a raw prop. The component paints `outlineVariant` — M3's divider role — which is now a
  // *declared* requirement rather than an implicit one, so an app whose theme lacks it fails here (BRG3010)
  // instead of in a browser.
  Divider: {
    component: 'Divider',
    props: { height: 'height', thickness: 'thickness', indent: 'indent', endIndent: 'endIndent' },
    roles: ['outlineVariant'],
  },
  VerticalDivider: {
    component: 'VerticalDivider',
    props: { width: 'width', thickness: 'thickness', indent: 'indent', endIndent: 'endIndent' },
    roles: ['outlineVariant'],
  },

  // ── M4-B: the constraint and alignment models ──
  Align: {
    component: 'Align',
    props: { alignment: 'alignment' },
    slots: { child: 'child' },
    alignmentProps: ['alignment'],
  },
  ConstrainedBox: {
    component: 'ConstrainedBox',
    props: { constraints: 'constraints' },
    slots: { child: 'child' },
  },
  AspectRatio: {
    component: 'AspectRatio',
    props: { aspectRatio: 'aspectRatio' },
    slots: { child: 'child' },
  },
  FractionallySizedBox: {
    component: 'FractionallySizedBox',
    props: { widthFactor: 'widthFactor', heightFactor: 'heightFactor' },
    slots: { child: 'child' },
  },
  SafeArea: {
    component: 'SafeArea',
    props: { top: 'top', bottom: 'bottom', left: 'left', right: 'right' },
    slots: { child: 'child' },
  },

  // ── M4-C: the family the asset and metadata infrastructure unlocked ──
  //
  // `Container` forwards `color` and `decoration` since M4-E; `transform` it still does not, because a
  // `Matrix4` is a value type the kit does not carry and `unsupported.ts` classifies it.
  Container: {
    component: 'Container',
    props: {
      width: 'width',
      height: 'height',
      padding: 'padding',
      margin: 'margin',
      constraints: 'constraints',
      alignment: 'alignment',
      color: 'color',
      decoration: 'decoration',
    },
    slots: { child: 'child' },
    alignmentProps: ['alignment'],
    colorProps: ['color'],
  },
  Opacity: { component: 'Opacity', props: { opacity: 'opacity' }, slots: { child: 'child' } },
  Card: {
    component: 'Card',
    props: { elevation: 'elevation' },
    slots: { child: 'child' },
    // A card's surface is the theme's, tinted by elevation — so it needs both roles the tint composes from.
    roles: ['surface', 'surfaceTint'],
  },

  // One mapping for all three spellings of `Image`. `Image.asset` arrives with a `name` prop, `Image.network`
  // with `src`, and `Image(image:)` with a provider — the catalog names the first two positionals (ADR-0023)
  // and the kit's component converges all three onto one `ImageSource`. Keying the map by constructor would
  // have meant three entries that render the same component.
  Image: {
    component: 'Image',
    props: {
      name: 'name',
      src: 'src',
      image: 'image',
      width: 'width',
      height: 'height',
      fit: 'fit',
      semanticLabel: 'semanticLabel',
    },
    enums: { fit: BOX_FIT },
    assetProps: ['name'],
  },
  Icon: {
    component: 'Icon',
    props: { icon: 'icon', size: 'size', semanticLabel: 'semanticLabel' },
  },

  // ── M4-D: clipping and decoration ──
  //
  // `color` is absent from every entry below for the reason it is absent from `Container`: a colour reaches a
  // component as a *role* (INV-20), and `ColoredBox(color: Colors.red)` names a literal the token system has
  // no entry for. The kit's props are `colorRole`, and a program that paints a literal is refused rather than
  // painted from a hex the theme has never heard of.
  ClipRect: { component: 'ClipRect', props: { clipBehavior: 'clipBehavior' }, slots: { child: 'child' }, enums: { clipBehavior: CLIP } },
  ClipRRect: {
    component: 'ClipRRect',
    props: { borderRadius: 'borderRadius', clipBehavior: 'clipBehavior' },
    slots: { child: 'child' },
    enums: { clipBehavior: CLIP },
  },
  // ── M4-E: the decoration family, unblocked by colour hoisting ──
  //
  // `color` forwards now. Until M4-E it could not: a `Color` written at a call site was not an `app.Token`,
  // so INV-20 had nothing for the kit to resolve. The analyzer now hoists every literal colour into a token
  // and passes the token's *name* down, so a colour prop is a plain string by the time it reaches here and
  // needs no conversion at all — which is why there is no colour-lowering code in this file.
  DecoratedBox: { component: 'DecoratedBox', props: { decoration: 'decoration' }, slots: { child: 'child' } },
  ColoredBox: { component: 'ColoredBox', props: { color: 'color' }, slots: { child: 'child' }, colorProps: ['color'] },
  Material: {
    component: 'Material',
    props: { color: 'color', elevation: 'elevation', borderRadius: 'borderRadius' },
    slots: { child: 'child' },
    colorProps: ['color'],
    // Without an explicit colour a Material is the theme's surface, tinted by elevation.
    roles: ['surface', 'surfaceTint'],
  },
  Ink: {
    component: 'Ink',
    props: { color: 'color', decoration: 'decoration', width: 'width', height: 'height' },
    slots: { child: 'child' },
    colorProps: ['color'],
  },

  // ── M4-D: scrolling ──
  ListView: {
    component: 'ListView',
    props: {
      scrollDirection: 'scrollDirection',
      padding: 'padding',
      shrinkWrap: 'shrinkWrap',
      reverse: 'reverse',
    },
    enums: { scrollDirection: AXIS },
  },
  GridView: {
    component: 'GridView',
    props: {
      gridDelegate: 'gridDelegate',
      crossAxisCount: 'crossAxisCount',
      mainAxisSpacing: 'mainAxisSpacing',
      crossAxisSpacing: 'crossAxisSpacing',
      childAspectRatio: 'childAspectRatio',
      scrollDirection: 'scrollDirection',
      padding: 'padding',
      shrinkWrap: 'shrinkWrap',
    },
    enums: { scrollDirection: AXIS },
  },
  SingleChildScrollView: {
    component: 'SingleChildScrollView',
    props: { scrollDirection: 'scrollDirection', padding: 'padding', reverse: 'reverse' },
    slots: { child: 'child' },
    enums: { scrollDirection: AXIS },
  },
  Flex: {
    component: 'Flex',
    props: {
      direction: 'direction',
      mainAxisAlignment: 'mainAxisAlignment',
      crossAxisAlignment: 'crossAxisAlignment',
    },
    enums: { direction: AXIS, mainAxisAlignment: AXIS_ALIGNMENT, crossAxisAlignment: CROSS_ALIGNMENT },
  },

  // ── M4-D: Material components ──
  //
  // Each declares the roles its kit component paints, so an app whose theme cannot supply one is refused at
  // build time (BRG3010) rather than throwing BRG4006 on first paint.
  ListTile: {
    component: 'ListTile',
    props: { isThreeLine: 'isThreeLine' },
    slots: { leading: 'leading', title: 'title', subtitle: 'subtitle', trailing: 'trailing' },
    roles: ['onSurface', 'onSurfaceVariant'],
  },
  Chip: {
    component: 'Chip',
    slots: { label: 'label', avatar: 'avatar' },
    roles: ['onSurfaceVariant', 'outlineVariant', 'primary'],
  },
  CircleAvatar: {
    component: 'CircleAvatar',
    props: { radius: 'radius' },
    slots: { child: 'child' },
    roles: ['primaryContainer', 'onPrimaryContainer'],
  },
  Badge: {
    component: 'Badge',
    props: { isLabelVisible: 'isLabelVisible' },
    slots: { label: 'label', child: 'child' },
    roles: ['error', 'onError'],
  },
  LinearProgressIndicator: {
    component: 'LinearProgressIndicator',
    props: { value: 'value', minHeight: 'minHeight' },
    roles: ['primary', 'secondaryContainer'],
  },
  CircularProgressIndicator: {
    component: 'CircularProgressIndicator',
    props: { value: 'value', strokeWidth: 'strokeWidth' },
    roles: ['primary'],
  },
  Tooltip: { component: 'Tooltip', props: { message: 'message' }, slots: { child: 'child' } },

  // ── M4-D: display ──
  RichText: {
    component: 'RichText',
    props: { text: 'text', textAlign: 'textAlign', softWrap: 'softWrap', maxLines: 'maxLines' },
    enums: { textAlign: TEXT_ALIGN },
  },
  SelectableText: { component: 'SelectableText', props: { data: 'data', textAlign: 'textAlign' }, enums: { textAlign: TEXT_ALIGN } },

  // ── M4-F: forms and input ──
  //
  // Nothing here needed a new lowering. A `controller:` is a `bind.Signal` because the catalog already lists
  // `TextEditingController` among its `stateHolders`; an `onChanged:` is a `logic.Lambda` because ADR-19
  // lowers behaviour to closures; a `decoration:` is a kit-provided `logic.New`. The analyzer proved all
  // three before a line of this was written, which is why these are ordinary map rows.
  TextField: {
    component: 'TextField',
    props: {
      controller: 'controller',
      focusNode: 'focusNode',
      decoration: 'decoration',
      keyboardType: 'keyboardType',
      textInputAction: 'textInputAction',
      textCapitalization: 'textCapitalization',
      obscureText: 'obscureText',
      maxLines: 'maxLines',
      minLines: 'minLines',
      maxLength: 'maxLength',
      enabled: 'enabled',
      readOnly: 'readOnly',
      autofocus: 'autofocus',
      onChanged: 'onChanged',
      onSubmitted: 'onSubmitted',
      onEditingComplete: 'onEditingComplete',
    },
    enums: {
      keyboardType: TEXT_INPUT_TYPE,
      textInputAction: TEXT_INPUT_ACTION,
      textCapitalization: TEXT_CAPITALIZATION,
    },
    roles: ['onSurface', 'onSurfaceVariant', 'primary', 'error'],
  },
  TextFormField: {
    component: 'TextFormField',
    props: {
      controller: 'controller',
      initialValue: 'initialValue',
      decoration: 'decoration',
      validator: 'validator',
      onChanged: 'onChanged',
      obscureText: 'obscureText',
      enabled: 'enabled',
      keyboardType: 'keyboardType',
    },
    enums: { keyboardType: TEXT_INPUT_TYPE },
    roles: ['onSurface', 'onSurfaceVariant', 'primary', 'error'],
  },
  InputDecorator: {
    component: 'InputDecorator',
    props: { decoration: 'decoration' },
    slots: { child: 'child' },
    roles: ['onSurface', 'onSurfaceVariant', 'primary', 'error'],
  },
  Form: { component: 'Form', slots: { child: 'child' } },
  Checkbox: {
    component: 'Checkbox',
    props: { value: 'value', onChanged: 'onChanged' },
    roles: ['primary', 'onPrimary', 'onSurfaceVariant'],
  },
  Switch: {
    component: 'Switch',
    props: { value: 'value', onChanged: 'onChanged' },
    roles: ['primary', 'onPrimary', 'outline', 'surfaceContainerHighest'],
  },
  Radio: {
    component: 'Radio',
    props: { value: 'value', groupValue: 'groupValue', onChanged: 'onChanged' },
    roles: ['primary', 'onPrimary', 'onSurfaceVariant'],
  },
  Slider: {
    component: 'Slider',
    props: { value: 'value', min: 'min', max: 'max', divisions: 'divisions', onChanged: 'onChanged' },
    roles: ['primary', 'surfaceContainerHighest'],
  },

  // ── M4-G: the application shell ──
  //
  // There is no `MaterialApp` row, and its absence is the milestone's central finding rather than an
  // omission. An app root is *consumed* — `home:`/`routes:` are already `app.Route` nodes, `theme:` is
  // already the palette N10 derives, and the emitted App Router project is the lowering. `app_root.ts`
  // holds the reasoning and reports the parameters that genuinely have nowhere to go.
  //
  // Every row below declares the Material roles its component paints, so an app whose theme cannot supply
  // one fails at build time (BRG3010) rather than throwing BRG4006 on first paint. The roles are the SDK's,
  // transcribed into the catalog with a file:line citation each.
  Scaffold: {
    component: 'Scaffold',
    props: { extendBodyBehindAppBar: 'extendBodyBehindAppBar' },
    slots: {
      appBar: 'appBar',
      body: 'body',
      bottomNavigationBar: 'bottomNavigationBar',
      bottomSheet: 'bottomSheet',
      drawer: 'drawer',
      endDrawer: 'endDrawer',
      floatingActionButton: 'floatingActionButton',
    },
    roles: ['surface'],
  },
  AppBar: {
    component: 'AppBar',
    props: { centerTitle: 'centerTitle', toolbarHeight: 'toolbarHeight' },
    slots: { title: 'title', leading: 'leading', bottom: 'bottom', flexibleSpace: 'flexibleSpace' },
    // M3 paints an app bar's leading icon `onSurface` and its action icons `onSurfaceVariant`. Both are
    // declared: a theme missing either would render one of the two wrong, on every screen.
    roles: ['surface', 'onSurface', 'onSurfaceVariant'],
  },
  PreferredSize: {
    component: 'PreferredSize',
    props: { preferredSize: 'preferredSize' },
    slots: { child: 'child' },
  },
  Drawer: {
    component: 'Drawer',
    props: { width: 'width' },
    slots: { child: 'child' },
    roles: ['surfaceContainerLow'],
  },
  DrawerHeader: { component: 'DrawerHeader', slots: { child: 'child' }, roles: ['outlineVariant'] },
  BottomAppBar: {
    component: 'BottomAppBar',
    props: { height: 'height' },
    slots: { child: 'child' },
    roles: ['surfaceContainer'],
  },
  IconButton: {
    component: 'IconButton',
    props: { onPressed: 'onPressed', tooltip: 'tooltip' },
    slots: { icon: 'icon' },
    roles: ['onSurfaceVariant'],
  },
  FloatingActionButton: {
    component: 'FloatingActionButton',
    props: { onPressed: 'onPressed', tooltip: 'tooltip', mini: 'mini' },
    // One mapping for `FloatingActionButton` and `.extended`: they are the same class, so the catalog's
    // entry carries the union of their slots and so does this.
    slots: { child: 'child', icon: 'icon', label: 'label' },
    roles: ['primaryContainer', 'onPrimaryContainer'],
  },
  MaterialBanner: {
    component: 'MaterialBanner',
    slots: { content: 'content', leading: 'leading' },
    roles: ['surfaceContainerLow', 'onSurface', 'outlineVariant'],
  },

  // ── M4-G: navigation ──
  //
  // `NavigationRailDestination` and `BottomNavigationBarItem` are not Flutter `Widget`s, and they are rows
  // here anyway: the catalog names them as their parent's ordered children, which is what puts them in the
  // UI tree. Before that entry existed the whole list sat in `props` as an expression and N8 reported
  // BRG2110 — see `navigation.ts` in the kit for what that diagnostic got wrong about the owner.
  NavigationBar: {
    component: 'NavigationBar',
    props: { selectedIndex: 'selectedIndex', onDestinationSelected: 'onDestinationSelected', height: 'height' },
    roles: ['surfaceContainer', 'secondaryContainer', 'onSecondaryContainer', 'onSurfaceVariant'],
  },
  NavigationDestination: {
    component: 'NavigationDestination',
    props: { label: 'label' },
    slots: { icon: 'icon', selectedIcon: 'selectedIcon' },
    roles: ['secondaryContainer', 'onSecondaryContainer', 'onSurfaceVariant'],
  },
  NavigationRail: {
    component: 'NavigationRail',
    props: { selectedIndex: 'selectedIndex', onDestinationSelected: 'onDestinationSelected', extended: 'extended' },
    slots: { leading: 'leading', trailing: 'trailing' },
    roles: ['surface', 'secondaryContainer', 'onSecondaryContainer', 'onSurfaceVariant', 'onSurface'],
  },
  NavigationRailDestination: {
    component: 'NavigationRailDestination',
    // `label` is a *slot* here and a *prop* on NavigationDestination. That asymmetry is Flutter's — one is a
    // `Widget`, the other a `String` — and the catalog records it rather than smoothing it over.
    slots: { icon: 'icon', selectedIcon: 'selectedIcon', label: 'label' },
    roles: ['secondaryContainer', 'onSecondaryContainer', 'onSurfaceVariant', 'onSurface'],
  },
  NavigationDrawer: {
    component: 'NavigationDrawer',
    props: { selectedIndex: 'selectedIndex', onDestinationSelected: 'onDestinationSelected' },
    roles: ['surfaceContainerLow', 'secondaryContainer', 'onSecondaryContainer', 'onSurfaceVariant'],
  },
  NavigationDrawerDestination: {
    component: 'NavigationDrawerDestination',
    slots: { icon: 'icon', selectedIcon: 'selectedIcon', label: 'label' },
    roles: ['secondaryContainer', 'onSecondaryContainer', 'onSurfaceVariant'],
  },
  BottomNavigationBar: {
    component: 'BottomNavigationBar',
    props: { currentIndex: 'currentIndex', onTap: 'onTap' },
    // `primary` *and* `secondary`: M2 picks between them by brightness (bottom_navigation_bar.dart:933-936),
    // so a theme that defines only one renders the wrong colour in the other mode.
    roles: ['surface', 'primary', 'secondary', 'onSurfaceVariant'],
  },
  BottomNavigationBarItem: {
    component: 'BottomNavigationBarItem',
    props: { label: 'label' },
    slots: { icon: 'icon', activeIcon: 'selectedIcon' },
    roles: ['primary', 'secondary', 'onSurfaceVariant'],
  },

  // ── M4-G: the intrinsic-sizing pair ──
  //
  // M4-D refused these as "the constraint model's measuring half", grouped with `FittedBox`. That grouping
  // was wrong and M4-G corrects it: CSS's `max-content` **is** Flutter's `computeMaxIntrinsicWidth` — the
  // same definition standardised twice — so these are a mapping, not an approximation. `FittedBox` still
  // needs the measured size as a *number* to divide by, which CSS cannot produce, and stays refused.
  IntrinsicWidth: { component: 'IntrinsicWidth', slots: { child: 'child' } },
  IntrinsicHeight: { component: 'IntrinsicHeight', slots: { child: 'child' } },
  OverflowBox: {
    component: 'OverflowBox',
    props: {
      minWidth: 'minWidth',
      maxWidth: 'maxWidth',
      minHeight: 'minHeight',
      maxHeight: 'maxHeight',
      alignment: 'alignment',
    },
    slots: { child: 'child' },
    alignmentProps: ['alignment'],
  },

  // ── M4-H: paged scrolling ──
  //
  // CSS scroll snapping, which is a real correspondence: `scroll-snap-type: x mandatory` is defined to
  // settle scrolling on a child boundary, which is what `PageScrollPhysics` does. `onPageChanged` and
  // `controller` are refused by name rather than accepted and ignored — see UNSUPPORTED_PARAMETERS.
  PageView: {
    component: 'PageView',
    props: { scrollDirection: 'scrollDirection', reverse: 'reverse' },
    enums: { scrollDirection: AXIS },
  },

  // ── M4-I: expansion, tabs and the selectable chips ──
  //
  // Buildable now, with no gesture model, because each maps to a native element that already owns the
  // interaction: `<details>` for disclosure, `role="tablist"` for tabs, a `<button>`'s pressed-ness for a
  // chip. Nothing here needs a ripple, a drag or a measured position.
  ExpansionTile: {
    component: 'ExpansionTile',
    props: { initiallyExpanded: 'initiallyExpanded', onExpansionChanged: 'onExpansionChanged' },
    slots: { title: 'title', subtitle: 'subtitle', leading: 'leading', trailing: 'trailing' },
    roles: ['onSurface', 'onSurfaceVariant', 'primary'],
  },
  Tab: { component: 'Tab', props: { text: 'text' }, slots: { icon: 'icon', child: 'child' }, roles: ['primary', 'onSurfaceVariant'] },
  TabBar: {
    component: 'TabBar',
    props: { isScrollable: 'isScrollable' },
    roles: ['primary', 'onSurfaceVariant', 'outlineVariant'],
  },
  TabBarView: { component: 'TabBarView' },
  DefaultTabController: { component: 'DefaultTabController', props: { length: 'length' }, slots: { child: 'child' } },
  ChoiceChip: {
    component: 'ChoiceChip',
    props: { selected: 'selected', onSelected: 'onSelected' },
    slots: { label: 'label', avatar: 'avatar' },
    roles: ['secondaryContainer', 'onSecondaryContainer', 'onSurfaceVariant', 'outlineVariant'],
  },
  FilterChip: {
    component: 'FilterChip',
    props: { selected: 'selected', onSelected: 'onSelected' },
    slots: { label: 'label', avatar: 'avatar' },
    roles: ['secondaryContainer', 'onSecondaryContainer', 'onSurfaceVariant', 'outlineVariant'],
  },
  ActionChip: {
    component: 'ActionChip',
    props: { onPressed: 'onPressed' },
    slots: { label: 'label', avatar: 'avatar' },
    roles: ['secondaryContainer', 'onSecondaryContainer', 'onSurfaceVariant', 'outlineVariant'],
  },

  // ── M5-A: found by running real applications ──
  //
  // `FilledButton` is M3's default emphasis button and did not exist in the map at all; Continuum reports
  // it and so does the corpus. `.icon` is a factory on the *same* class for all four button types, so each
  // entry carries the union of `child`/`icon`/`label` — the `FloatingActionButton` precedent.
  FilledButton: {
    component: 'ElevatedButton',
    props: { onPressed: 'onPressed' },
    slots: { child: 'child', icon: 'icon', label: 'label' },
  },
  TextButton: {
    component: 'ElevatedButton',
    props: { onPressed: 'onPressed' },
    slots: { child: 'child', icon: 'icon', label: 'label' },
  },
  OutlinedButton: {
    component: 'ElevatedButton',
    props: { onPressed: 'onPressed' },
    slots: { child: 'child', icon: 'icon', label: 'label' },
  },

  // ── M4-I: the `gap` package ──
  //
  // The first entry here for a widget that is not Flutter's. It reaches the generator as an ordinary
  // `ui.Element` whose `library` is `package:gap/gap.dart`, because the analyzer resolved it through a
  // package catalog and adapter (ADR-18) — so from this table's point of view nothing is special about it.
  // That is the result worth noting: a package cost one JSON file, one adapter and one line, and no
  // extractor, pass or emitter changed.
  Gap: { component: 'Gap', props: { mainAxisExtent: 'mainAxisExtent' } },
  MaxGap: { component: 'MaxGap', props: { mainAxisExtent: 'mainAxisExtent' } },

  // ── M4-H: the implicit-animation family ──
  //
  // Not "the animation engine". Flutter's `ImplicitlyAnimatedWidget` takes a target value and a duration
  // and interpolates when the value changes; that is a CSS transition, and the browser is the ticker. The
  // evidence is the analyzer's own output: `AnimatedContainer(width: _width)` extracts as an ordinary
  // `ui.Element` whose `width` is a `bind.Signal` — the same binding a plain `Container` gets. Nothing in
  // it needed a construct that does not exist.
  //
  // `curve` forwards through the kit static-const path, the same one `BoxFit.cover` takes, so
  // `Curves.easeInOut` reaches the kit as a member access and resolves to the SDK's own cubic.
  AnimatedOpacity: {
    component: 'AnimatedOpacity',
    props: { opacity: 'opacity', duration: 'duration', curve: 'curve' },
    slots: { child: 'child' },
  },
  AnimatedAlign: {
    component: 'AnimatedAlign',
    props: { alignment: 'alignment', duration: 'duration', curve: 'curve' },
    slots: { child: 'child' },
    alignmentProps: ['alignment'],
  },
  AnimatedPadding: {
    component: 'AnimatedPadding',
    props: { padding: 'padding', duration: 'duration', curve: 'curve' },
    slots: { child: 'child' },
  },
  AnimatedContainer: {
    component: 'AnimatedContainer',
    props: {
      width: 'width',
      height: 'height',
      color: 'color',
      padding: 'padding',
      margin: 'margin',
      alignment: 'alignment',
      duration: 'duration',
      curve: 'curve',
    },
    slots: { child: 'child' },
    alignmentProps: ['alignment'],
    colorProps: ['color'],
  },
};

/**
 * Parameters a mapped widget cannot be rendered *with*, and why.
 *
 * Keyed `Widget.parameter`. Distinct from {@link WIDGET_MAP}'s silence about a prop, which means "not
 * forwarded": that is right for a prop whose absence changes nothing visible, and wrong for one whose
 * presence changes the geometry. `IntrinsicWidth(stepWidth: 8)` is a different width from
 * `IntrinsicWidth()`, so dropping the parameter would render a box the author did not write.
 */
export const UNSUPPORTED_PARAMETERS: Readonly<Record<string, string>> = {
  'IntrinsicWidth.stepWidth':
    'it rounds the intrinsic width up to a multiple, and CSS has no expression that rounds a computed ' +
    'layout value. Owner: the runtime kit.',
  'IntrinsicHeight.stepHeight':
    'it rounds the intrinsic height up to a multiple, and CSS has no expression that rounds a computed ' +
    'layout value. Owner: the runtime kit.',
  'AppBar.elevation':
    "an M3 AppBar's elevation is 0 at rest and 3 once content has scrolled under it, which needs a scroll " +
    'listener the kit does not install. A bar that painted the scrolled-under tint at rest would be wrong ' +
    'on every screen nobody has scrolled. Owner: the runtime kit.',
  'AnimatedContainer.decoration':
    'Flutter lerps a whole BoxDecoration — border, radius, shadows and gradient together — and CSS ' +
    'interpolates each of those separately with different rules, so some parts would animate and the rest ' +
    'would snap. `color:` animates; a decoration does not. Owner: the runtime kit.',
  'AnimatedContainer.transform':
    'it interpolates a Matrix4, which is the value type `Transform` is refused for. Owner: the runtime kit.',
  'TabBar.controller':
    'a `TabController` is shared between a `TabBar` and a `TabBarView`, and nothing in UIR says two elements ' +
    'share a selection — they are related only by sitting under one `DefaultTabController`. Wiring them ' +
    'through kit context would work at runtime and be invisible to every diagnostic, which is the silent ' +
    'coupling this project refuses. Pass `selectedIndex` from the application’s own state instead. ' +
    'Owner: the UIR schema.',
  'PageView.onPageChanged':
    'firing it needs to know which child the viewport settled on, which means observing scroll position ' +
    "against child geometry — the constraint model's measuring half. A callback accepted and never invoked " +
    'is worse than one refused. Owner: the runtime kit.',
  'PageView.controller':
    'a `PageController` is an imperative handle on a live viewport (`animateToPage`), which is the same gap ' +
    '`GlobalKey` names: UIR has no construct for a handle on a mounted element. Owner: the UIR schema.',
  'Scaffold.resizeToAvoidBottomInset':
    'it resizes the body when the on-screen keyboard appears, which is a viewport-inset signal the kit has ' +
    'no model for. Owner: the runtime kit (it is the same gap as MediaQuery).',
};

/** The mapping for `name`, or `undefined` if this generator cannot render it. */
export function mappingOf(name: string): WidgetMapping | undefined {
  return WIDGET_MAP[name];
}

/**
 * Every widget this generator can render, in a stable order — for the `BRG3001` diagnostic.
 *
 * Derived from {@link WIDGET_MAP} rather than restated. A hand-kept copy of this list is what M3-B shipped,
 * and by M4-A it had drifted to naming seven widgets when fifteen were supported: the diagnostic that exists
 * to tell an author what *is* available was itself out of date. A list computed from the map cannot drift.
 */
export function supportedWidgetNames(): readonly string[] {
  return Object.keys(WIDGET_MAP).sort();
}
