// Generation diagnostics — the BRG3xxx range.
//
// `docs/architecture/compiler.md` reserves the ranges: `BRG0xxx` environment, `BRG1xxx` extraction,
// `BRG2xxx` normalization, **`BRG3xxx` generation**, `BRG4xxx` verification. Nothing had ever used
// `BRG3xxx`. Generation claims it here.
//
// ## The rule these encode
//
// A generator that cannot represent something **says so and stops**. It does not approximate. The severity
// semantics are the compiler's, and they are not advisory (`docs/architecture/compiler.md`):
//
// > **error** — the program is not fit to generate from. Something would have to be invented.
// > **warning** — a generator *can* proceed, but will have to guess at something the frontend should have
// >   stated.
// > **info** — the compiler changed something, and is telling you what and why.
//
// So an `error` here means: this construct reached the generator, the generator has no faithful emission for
// it, and the alternative to failing is emitting something the author did not write.

/** A diagnostic code owned by the React generator. */
export const GeneratorDiagnosticCode = {
  /** A widget has no mapping to a runtime component. */
  UnmappedWidget: 'BRG3001',
  /** A `logic.*` construct has no faithful TypeScript lowering. */
  UnsupportedExpression: 'BRG3002',
  /** A `logic.*` statement has no faithful TypeScript lowering. */
  UnsupportedStatement: 'BRG3003',
  /** A `ui.Opaque` / `logic.Opaque*` reached the generator: the frontend could not model it (INV-4). */
  OpaqueConstruct: 'BRG3004',
  /** The program carries an `error` diagnostic from an earlier stage; it is not fit to generate from. */
  ProgramNotFitToGenerate: 'BRG3005',
  /** A reference names a node the program does not contain. */
  UnresolvedReference: 'BRG3006',
  /** A `ui.Async` has no loading or error branch, so a generator would have to invent one. */
  IncompleteAsync: 'BRG3007',
  /** A route transition names a destination the generator cannot turn into a URL (Spec v2.4 §A17.6). */
  UnroutableDestination: 'BRG3008',
  /** Two nodes want the same module-level symbol. */
  SymbolCollision: 'BRG3009',
  /**
   * A mapped widget paints a Material role the program's tokens do not define (INV-20, ADR-13).
   *
   * The build-time half of INV-20. The kit's half — components hold no literal colours — has been enforceable
   * since M4-B's theme surface; this is the other side: *"every colour a mapped Material widget paints must
   * resolve to an `app.Token`."* Without it a `Divider` in an app with no `ColorScheme` compiled cleanly and
   * threw `BRG4006` on first render, which is the same defect a browser away.
   */
  UnresolvedThemeRole: 'BRG3010',
  /**
   * An `Alignment` names a position CSS flexbox cannot express.
   *
   * Flutter's alignment is continuous — `Alignment(0.3, -0.7)` is legal — and flexbox has three positions per
   * axis. Emitting the nearest keyword would place the child somewhere the author did not write, with nothing
   * on screen to say so, so the program is refused instead.
   */
  UnrepresentableAlignment: 'BRG3011',
  /**
   * An asset key the generator cannot read as a constant, so it cannot reach the manifest.
   *
   * An asset missing from the manifest becomes a broken image at runtime, which looks like a slow network
   * rather than a defect — so a computed path is refused here instead of silently omitted.
   */
  UnresolvableAsset: 'BRG3012',
  /**
   * A widget this generator knows about and cannot render, named with the capability it is missing.
   *
   * Distinct from {@link GeneratorDiagnosticCode.UnmappedWidget}, which is now reserved for a widget nothing
   * in the system has heard of — usually the application's own. The difference matters to whoever reads it:
   * `BRG3001` means *teach the compiler about this widget*, and this means *this named capability is not
   * built yet, and here is the layer that owns it*.
   */
  UnsupportedCapability: 'BRG3013',
  /**
   * A colour the analyzer could not resolve to a token, so no widget can paint it.
   *
   * INV-20 (ADR-13) requires every colour a mapped widget paints to resolve to an `app.Token`. M4-E made
   * that reachable for every *constant* colour and for a `colorScheme.<role>` read, by hoisting the first
   * into a token and recognising the second. What is left is a colour computed at runtime — a ternary, a
   * value from a store — which has no single value to hoist. Painting one branch would be inventing.
   */
  UnresolvableColor: 'BRG3014',
  /**
   * A `GlobalKey` — a handle on a live widget's `State`, which UIR has no construct for.
   *
   * `Form(key: _formKey)` with `_formKey.currentState!.validate()` is how Flutter validates a form
   * imperatively. A `GlobalKey` is not a value, not a signal and not a route; it is a reference to a mounted
   * element's state, and nothing in the schema represents one. Emitting the call anyway would produce a
   * button that compiles and does nothing.
   */
  UnsupportedGlobalKey: 'BRG3015',
  /**
   * A parameter of an application root (`MaterialApp`, `CupertinoApp`, `WidgetsApp`) the project cannot model.
   *
   * M4-G's evidence run established that an app root is **consumed rather than rendered**: `home:` and
   * `routes:` are already `app.Route` nodes, `theme:` is already the token set N10 expands, and the emitted
   * App Router project's `layout.tsx` / `providers.tsx` / `page.tsx` are the lowering. Most of a `MaterialApp`
   * therefore needs no diagnostic at all.
   *
   * What is left genuinely has nowhere to go — `builder:` wraps every route, `onGenerateRoute:` computes
   * routes at runtime, `themeMode:` switches brightness after mount. Dropping those silently is how a
   * converted application loses its global error boundary and nobody finds out until production, so each is
   * named with the capability and the layer that owns it.
   */
  UnmodelledAppRootParameter: 'BRG3016',
  /**
   * A widget sets a parameter this generator can render the widget *without*, but not *with*.
   *
   * Narrower than {@link GeneratorDiagnosticCode.UnsupportedCapability}, which refuses a whole widget. An
   * `IntrinsicWidth` renders; an `IntrinsicWidth(stepWidth: 8)` rounds its result up to a multiple of 8, and
   * CSS has no expression that does. Rendering it without the step would be a box of the wrong width with
   * nothing on screen to say so, so the parameter is named rather than dropped.
   */
  UnsupportedParameter: 'BRG3017',
} as const;

/** A diagnostic code owned by the React generator. */
export type GeneratorDiagnosticCode =
  (typeof GeneratorDiagnosticCode)[keyof typeof GeneratorDiagnosticCode];
