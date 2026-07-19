// What this generator cannot render, and precisely why.
//
// ## Why a generic diagnostic is not good enough
//
// `BRG3001` used to say the same sentence for every unmapped widget: *"`X` has no mapping to a runtime
// component"*, followed by a list of what is supported. True, and useless — it tells an author that something
// is missing without telling them *what kind* of missing it is. A `Hero` and a `CustomPaint` and a
// `ListView.builder` all failed identically, and they are not remotely the same problem: one needs a shared
// element transition, one needs a raster canvas, one needs the analyzer to see an iterable it currently
// cannot.
//
// So a widget this generator knows about but cannot render carries its **missing capability** and the
// **layer that owns it**. An author reads which of their screens is blocked; a maintainer reads which piece
// of work unblocks the most screens. The corpus counts in `docs/m4/` are only actionable because of this
// table.
//
// ## What is in here, and what is not
//
// Entries are drawn from the M0 corpus scan of two real applications (`spikes/m0-compat-report/c1/out/`) plus
// the families the M4-A triage identified. A widget *not* in this table and not in `WIDGET_MAP` is one this
// generator has never heard of — most often the application's own widget, which is a different diagnostic
// with different advice.
//
// This table is deliberately **not** in `catalog/widgets/material.json`. The catalog says what a widget *is*
// (ADR-18); this says what *this target* cannot do with it, which is a fact about the React generator and its
// kit. A Vue generator will lack different things.

/** Which layer has to change before a widget can be rendered. */
export type CapabilityOwner =
  /** A component the kit does not have, or a browser capability it cannot reach. */
  | 'runtime'
  /** A lowering the generator does not perform. */
  | 'generator'
  /** Something extraction does not yet model, so it never reaches UIR. */
  | 'analyzer'
  /** A normalization pass that does not exist. */
  | 'compiler'
  /** UIR has nowhere to put it. */
  | 'schema'
  /** A modelling decision that has to be made before anything can be built. */
  | 'adr';

/**
 * The capability an imperative navigation needs, stated as a thing that could be built.
 *
 * Written once and shared by every entry that needs it, so the wording cannot drift between them and so
 * the set of things blocked on one construct is greppable. **It names a capability, not a history**: no
 * count of how many programs hit it, no fixture, no milestone. A sentence that has to be re-measured to
 * stay true will eventually be false, and a diagnostic is the worst place for that to happen — `BRG3008`
 * spent three milestones telling users the evidence was "one push, in one fixture" while the corpus grew
 * past 60.
 */
const NAVIGATE_CALL =
  'lowering an imperative navigation call — the analyzer emits an `app.RouteTransition` for the edge, the ' +
  'route table is generated, and the runtime kit has the live router; what no UIR node says is *perform ' +
  'this transition here*. ADR-0025 D2 names the construct (`logic.Navigate`)';

/**
 * A pop — a return along an existing edge, which is why it is not the same capability as a push.
 *
 * Measured as the **most frequent navigation verb in the corpus** (M6-D), which is also the evidence that
 * decided ADR-0025 in favour of `logic.Navigate` over a field on the edge: a pop has no edge to carry one.
 */
const NAVIGATE_POP =
  'lowering a pop. Spec v2.4 §A17.3 rules that a pop is not an `app.RouteTransition` at all — it returns ' +
  'along an edge that already exists — so nothing in the document marks the call. ADR-0025 D2 covers it as ' +
  'a `logic.Navigate` with no transition';

/**
 * A route overlay — a dialog, modal sheet or menu.
 *
 * These push a `Route`, so they are the same problem as an imperative navigation and close with it
 * (ADR-0024 verified the SDK: `showDialog` → `DialogRoute`, `showModalBottomSheet` →
 * `ModalBottomSheetRoute`, `showMenu` → `_PopupMenuRoute`).
 */
const OVERLAY_ROUTE =
  'a route overlay — a dialog, modal sheet or menu is a navigation to an inline destination, so it needs ' +
  'the same construct an imperative navigation does: a UIR node that says *perform this here*. ADR-0025 D2 ' +
  'names it (`logic.Navigate`)';

/**
 * A messenger overlay — the `ScaffoldMessenger` family.
 *
 * Deliberately **not** `OVERLAY_ROUTE`. A snack bar is not a route: `showSnackBar` enqueues on the nearest
 * `ScaffoldMessenger`, which owns the queue, the lifetime and the dismissal. `logic.Navigate` does not model
 * that, so ADR-0025 does not close it and the owner is genuinely still an unmade decision.
 */
const OVERLAY_MESSENGER =
  'a messenger overlay — a snack bar is not in the widget tree and is not a route either; it is enqueued on ' +
  'the nearest `ScaffoldMessenger`, which owns its queue, its lifetime and its dismissal. That is a ' +
  'different construct from a route overlay and no ADR models it yet';

/** Why one widget cannot be rendered. */
export interface MissingCapability {
  /** The capability, named as a thing that could be built. */
  readonly capability: string;
  /** The layer that owns it. */
  readonly owner: CapabilityOwner;
  /** What an author can do about it now, when there is anything. */
  readonly workaround?: string;
}

/**
 * Widgets this generator knows about and cannot render, with the reason.
 *
 * Keyed by widget name, or by `Widget.constructor` where the constructor is what makes the difference —
 * `ListView` renders and `ListView.builder` does not, because the second is a closure over an index rather
 * than a list of children.
 */
export const MISSING_CAPABILITIES: Readonly<Record<string, MissingCapability>> = {
  // ── Builders ──
  //
  // `ListView.builder` and `GridView.builder` are **gone from this table**: M4-H expands them into `ui.List`
  // in the frontend, where the resolved scope is. The note that used to sit here said the analyzer "cannot
  // see an iterable to map over", and it was right about the owner for the wrong reason — the iterable was
  // there all along, as the receiver of `items[index]`, and extraction was discarding it because
  // `IndexExpression` had no lowering.
  //
  // The expansion is a *proof*, not a pattern match: it holds only when the builder's index is used for
  // nothing but indexing one collection, and the count is that collection's length. A builder that fails it
  // stays an ordinary element and its closure is refused here.
  'ListView.separated': {
    capability:
      'a separator between items — `ui.List` renders one template per item and has nowhere to put a second ' +
      'template that goes between them',
    owner: 'schema',
    workaround: 'a `ListView.builder` whose template ends in a `Divider` renders the same thing',
  },
  'PageView.builder': {
    capability:
      'a builder over an index range that is not a collection. `ui.List` requires a `source` to iterate; a ' +
      'builder whose index does not index anything has none, and inventing a range would be inventing the ' +
      'collection',
    owner: 'schema',
    workaround:
      'a `PageView(children: [...])` renders a fixed set of pages; a builder over `items.length` that ' +
      'indexes `items` expands into a `ui.List` like the other two',
  },

  // ── The sliver protocol ──
  CustomScrollView: {
    capability: 'the sliver protocol — a scroll view whose children are viewport-aware',
    owner: 'adr',
    workaround: 'a `ListView` or `SingleChildScrollView` covers a non-sliver scroll',
  },
  SliverList: { capability: 'the sliver protocol', owner: 'adr' },
  SliverGrid: { capability: 'the sliver protocol', owner: 'adr' },
  SliverAppBar: { capability: 'the sliver protocol, plus a collapsing app bar', owner: 'adr' },
  SliverPadding: { capability: 'the sliver protocol', owner: 'adr' },
  SliverToBoxAdapter: { capability: 'the sliver protocol', owner: 'adr' },
  NestedScrollView: { capability: 'the sliver protocol, plus coordinated scroll positions', owner: 'adr' },

  // ── Animation: the *explicit* family, which is a different capability from the implicit one ──
  //
  // Until M4-H every widget with `Animated` in its name was here under one sentence — "the animation
  // engine" — and M4-H's evidence run showed that grouped two unrelated problems, exactly as M4-G found
  // `IntrinsicWidth` and `FittedBox` had been grouped.
  //
  // Flutter draws the line itself. An **implicitly** animated widget (`ImplicitlyAnimatedWidget`) takes a
  // target value and a duration and interpolates when the value changes: no controller, no ticker exposed
  // to the program, nothing to drive. That is a CSS transition, and `AnimatedOpacity`, `AnimatedContainer`,
  // `AnimatedAlign` and `AnimatedPadding` are now mapped.
  //
  // What is left is the **explicit** family, and it needs something that genuinely does not exist: a value
  // produced per frame and handed to arbitrary Dart. There is no CSS property to attach that to, and no UIR
  // construct for a per-frame value — a `sig.Signal` written 60 times a second is not what a `Tween` is.
  AnimationController: {
    capability:
      'a per-frame animated value — a controller produces one every frame and hands it to Dart, and no UIR ' +
      'construct models that',
    owner: 'schema',
  },
  AnimatedBuilder: {
    capability: 'a per-frame animated value, plus a builder that reads it (see `AnimationController`)',
    owner: 'schema',
  },
  TweenAnimationBuilder: {
    capability: 'a per-frame animated value, plus a builder that reads it (see `AnimationController`)',
    owner: 'schema',
  },
  AnimatedScale: {
    capability: 'interpolating a transform, which needs the Matrix4 value type `Transform` is refused for',
    owner: 'runtime',
  },
  AnimatedSwitcher: {
    capability:
      'an exit transition — Flutter keeps the outgoing child mounted and cross-fades it out, and React ' +
      'unmounts a replaced child before anything can animate it',
    owner: 'runtime',
    workaround:
      'an `AnimatedOpacity` around a child that is always present fades in and out without needing the ' +
      'outgoing one to survive',
  },
  FadeTransition: { capability: 'a per-frame animated value (see `AnimationController`)', owner: 'schema' },
  RotationTransition: { capability: 'a per-frame animated value', owner: 'schema' },
  ScaleTransition: { capability: 'a per-frame animated value', owner: 'schema' },
  SlideTransition: { capability: 'a per-frame animated value', owner: 'schema' },
  Hero: {
    capability:
      'shared-element transitions — one widget animating across a route change. It needs the route ' +
      'transition to be something the emitted app performs, which is the imperative-navigation blocker, ' +
      'and then both positions measured',
    owner: 'schema',
  },

  // ── Raster and filter effects ──
  CustomPaint: {
    capability: 'a raster canvas — CustomPainter draws imperatively, and its paint calls are Dart',
    owner: 'adr',
  },
  BackdropFilter: { capability: 'backdrop filters over a composited layer', owner: 'runtime' },
  ImageFiltered: { capability: 'image filters over a composited layer', owner: 'runtime' },
  ShaderMask: { capability: 'shader masks', owner: 'runtime' },
  ClipPath: {
    capability: 'arbitrary clip paths — a CustomClipper is Dart code, not a shape',
    owner: 'adr',
    workaround: '`ClipRect` and `ClipRRect` cover rectangular and rounded clips',
  },
  ClipOval: { capability: 'an oval clip', owner: 'runtime', workaround: 'a `CircleAvatar` clips to a circle' },

  // ── Interaction: no gesture model yet ──
  //
  // The *input* half of this section is gone. M4-F implemented it after the analyzer proved the pipeline
  // already carried controllers, callbacks and disposal; what remains here is the gesture model, which is a
  // different capability and still missing.
  GestureDetector: { capability: 'the gesture model', owner: 'runtime' },
  InkWell: { capability: 'the gesture model, plus Material ink ripples', owner: 'runtime' },
  InkResponse: { capability: 'the gesture model, plus Material ink ripples', owner: 'runtime' },
  Dismissible: { capability: 'the gesture model, plus a dismiss animation', owner: 'runtime' },
  Draggable: { capability: 'the gesture model, plus drag-and-drop', owner: 'runtime' },
  // Both were "controlled inputs" until M4-F built those. What each still needs is now different, and
  // saying so is the difference between a triage note and an actionable one.
  CheckboxListTile: {
    capability: 'a mapping — it is a ListTile and a Checkbox composed, and both exist',
    owner: 'generator',
    workaround: 'a `ListTile` with a `Checkbox` in its `trailing` slot renders the same control',
  },
  DropdownButton: {
    capability: OVERLAY_ROUTE,
    owner: 'schema',
  },
  GlobalKey: {
    capability: 'a handle on a live widget State — UIR has no construct for one',
    owner: 'schema',
    workaround: 'a `Form` validates on submission, which needs no key',
  },

  // ── Overlays, which are two different problems and were one capability string ──
  //
  // M6-D separated them, because they had the same `capability` text and the same owner and do not have the
  // same blocker:
  //
  //   * A **route overlay** *is* a navigation. The SDK settles it — `showDialog` pushes a `DialogRoute`,
  //     `showModalBottomSheet` a `ModalBottomSheetRoute`, `showMenu` a `_PopupMenuRoute` (ADR-0024 cites the
  //     SDK line numbers). So they are blocked by exactly what imperative navigation is blocked by, and
  //     ADR-0025 D2 names the construct: `logic.Navigate`. **The owning layer is the schema.**
  //
  //   * A **messenger overlay** is not a route at all. `showSnackBar` enqueues on the nearest
  //     `ScaffoldMessenger`, which owns the lifetime, the queue and the dismissal. `logic.Navigate` does not
  //     model that, and no ADR does yet. **The owning layer is still an unmade decision.**
  //
  // Saying "an architectural decision that has not been made yet" about the first group became false the
  // moment ADR-0025 was written, which is the whole reason this split exists.
  SnackBar: {
    capability: OVERLAY_MESSENGER,
    owner: 'adr',
    workaround:
      'a `MaterialBanner` is a persistent message that *is* in the tree, and renders — the difference is ' +
      'exactly what makes one supported and the other not',
  },
  BottomSheet: {
    capability: OVERLAY_ROUTE,
    owner: 'schema',
    workaround: "put the sheet in `Scaffold(bottomSheet:)`, which is Flutter's own persistent form",
  },
  ScaffoldMessenger: {
    capability: OVERLAY_MESSENGER,
    owner: 'adr',
  },
  // The `of(context)` spelling as well as the bare name: a program never writes `ScaffoldMessenger` alone,
  // it writes `ScaffoldMessenger.of(context).showSnackBar(...)`, and the reference the generator refuses is
  // the qualified one. A lookup that only held the class name matched nothing a real program contains.
  'ScaffoldMessenger.of': {
    capability: OVERLAY_MESSENGER,
    owner: 'adr',
    workaround:
      'a `MaterialBanner` placed in the tree is a persistent message and renders; what has no equivalent is ' +
      'the transient overlay a call puts on screen',
  },
  PopupMenuButton: { capability: OVERLAY_ROUTE, owner: 'schema' },
  AlertDialog: { capability: OVERLAY_ROUTE, owner: 'schema' },
  SnackBarAction: { capability: OVERLAY_MESSENGER, owner: 'adr' },

  // The **calls** that open a route overlay. Widget names alone never matched these: a program writes
  // `showDialog(context: …, builder: …)`, and the reference the generator refuses is `showDialog`, not
  // `AlertDialog`. Without an entry each fell through to `BRG3006` — *"`showDialog` is not declared in this
  // program"* — which blames a valid Flutter program for a gap the compiler owns. M6-D found this by running
  // the pipeline, not by reading the table: `showDialog` and `showModalBottomSheet` are the two most
  // frequent overlay calls in the measured corpus and neither had an entry.
  showDialog: { capability: OVERLAY_ROUTE, owner: 'schema' },
  showModalBottomSheet: { capability: OVERLAY_ROUTE, owner: 'schema' },
  showMenu: { capability: OVERLAY_ROUTE, owner: 'schema' },
  showGeneralDialog: { capability: OVERLAY_ROUTE, owner: 'schema' },
  showBottomSheet: { capability: OVERLAY_ROUTE, owner: 'schema' },
  showSnackBar: { capability: OVERLAY_MESSENGER, owner: 'adr' },

  // ── Layout that needs measurement ──
  LayoutBuilder: {
    capability: "the constraint model's measuring half — a builder that reads its own constraints",
    owner: 'runtime',
  },
  // `IntrinsicHeight`, `IntrinsicWidth` and `OverflowBox` were here until M4-G, grouped with `FittedBox`
  // under one sentence — "the constraint model's measuring half". That grouping was wrong, and correcting it
  // is worth more than the three mappings it unblocked:
  //
  //   * **Intrinsic sizing is not missing from CSS.** `max-content` is defined as the size a subtree takes
  //     given unbounded space, which is Flutter's `computeMaxIntrinsicWidth` verbatim. Two standards, one
  //     concept. So those two are a *mapping*.
  //   * **`OverflowBox` never needed measurement either.** Its defining behaviour is that the child does not
  //     contribute to the parent's size, which is what `position: absolute` means.
  //   * **`FittedBox` genuinely does.** It needs the measured size as a *number*, to divide by and produce a
  //     scale factor, and CSS has no expression that reads a layout result back into a value.
  //
  // What was actually shared was a phrase, not a capability.
  FittedBox: {
    capability:
      'reading a measured size back as a number — a scale factor is child-size ÷ box-size, and CSS has no ' +
      'expression that consumes a layout result',
    owner: 'runtime',
    workaround: 'an `Image` with a `fit:` scales exactly, because object-fit applies to replaced elements',
  },
  Baseline: {
    capability:
      "positioning by a child's text baseline, which needs the baseline as a number — CSS aligns *to* a " +
      'baseline (`align-items: baseline`) but cannot offset by one',
    owner: 'runtime',
    workaround: 'a `Row` with `CrossAxisAlignment.baseline` aligns siblings without needing the distance',
  },
  Transform: {
    capability: 'the Matrix4 value type',
    owner: 'runtime',
    workaround: 'none — `Transform.scale`/`.translate` need the matrix vocabulary',
  },

  // ── Tabs: a controller, and a transition ──
  //
  // In the catalog since M4-G so their structure survives extraction, and refused here: a `TabBar` and its
  // `TabBarView` are driven by a shared `TabController` whose value animates between pages. The controller
  // half is a signal and would lower; the animation is the M5 engine, and a tab bar that jumped between
  // pages would be a different interaction, not a smaller one.
  TabBar: {
    capability: 'a TabController shared with a TabBarView, plus the page transition it animates',
    owner: 'runtime',
  },
  TabBarView: { capability: 'a TabController, plus the page transition', owner: 'runtime' },
  DefaultTabController: { capability: 'a TabController', owner: 'runtime' },

  // ── Platform and media ──
  MediaQuery: {
    capability: 'a media-query model — viewport size and platform insets as reactive values',
    owner: 'runtime',
    workaround: '`SafeArea` covers display cutouts, which is what most MediaQuery reads are for',
  },
  Scrollbar: { capability: 'a styled scrollbar', owner: 'runtime' },
  RawScrollbar: { capability: 'a styled scrollbar', owner: 'runtime' },
  RepaintBoundary: {
    capability: 'none — it is a compositing hint with no visual effect',
    owner: 'generator',
    workaround: 'it can be treated as transparent; the catalog already marks it so',
  },

  // ── Imperative navigation: the edge is modelled, the call site is not ──
  //
  // These are not widgets, and they are here because the table's job is *naming a missing capability and its
  // owner*, which is exactly what an unresolved `Navigator.pushNamed` needs. Without them the generator
  // reported `BRG3006` — "`Navigator.pushNamed` is not declared in this program" — which blames the program
  // for a gap the compiler owns, and is the generic message §5 exists to abolish.
  //
  // The gap is narrow and worth stating precisely, because most of it is already built:
  //
  //   * the **analyzer** does see the call: it emits an `app.RouteTransition` edge for it;
  //   * the **generator** does emit a route table from `app.Route`;
  //   * the **kit** has the live router — `useRouter().push({ kind: 'route', route })` is ready and tested.
  //
  // What is missing is the link between the transition and the *call expression* that performs it.
  // `app.RouteTransition` records `source`, `target` and `arguments`; it does not record the node of the call
  // site, and its schema is `additionalProperties: false`. Matching the two by source span would work and is
  // exactly the generator heuristic this project refuses. So the honest fix is a schema field, which is an
  // ADR — and this entry is what says so instead of a wrong sentence about the program.
  'Navigator.push': { capability: NAVIGATE_CALL, owner: 'schema' },
  'Navigator.pushNamed': { capability: NAVIGATE_CALL, owner: 'schema' },
  'Navigator.pushReplacement': { capability: NAVIGATE_CALL, owner: 'schema' },
  'Navigator.pushReplacementNamed': { capability: NAVIGATE_CALL, owner: 'schema' },
  'Navigator.pushAndRemoveUntil': { capability: NAVIGATE_CALL, owner: 'schema' },
  'Navigator.of': { capability: NAVIGATE_CALL, owner: 'schema' },
  // A return, not a departure. Spec v2.4 §A17.3 rules that a pop is **not** an `app.RouteTransition` — it
  // returns along an edge that already exists — so unlike a push there is no edge in the document to point
  // at, and `logic.Navigate` carries no transition for it. Stated separately because "there is no edge" is a
  // different fact from "the edge is not linked to its call site", and a user debugging a pop should read
  // the one that is true of a pop.
  'Navigator.pop': { capability: NAVIGATE_POP, owner: 'schema' },
  'Navigator.popUntil': { capability: NAVIGATE_POP, owner: 'schema' },
  'Navigator.maybePop': { capability: NAVIGATE_POP, owner: 'schema' },
  'Navigator.popAndPushNamed': { capability: NAVIGATE_POP, owner: 'schema' },

  // ── M4-I: structures UIR cannot hold ──
  //
  // `DataTable` is the one genuinely structural refusal this project has met. Its `columns` are
  // `List<DataColumn>` and its `rows` are `List<DataRow>` — **two** widget-bearing lists on one element —
  // and a `ui.Element` holds exactly one ordered `children` collection. That is not an oversight in the
  // schema: N8 reports `BRG2113` for an element that ends up with two, precisely because *which comes first
  // is not recoverable, and child order is what the user sees*.
  //
  // The catalog mechanism that carried `NavigationRail`'s non-widget destinations (M4-G) cannot help: it
  // names *one* children property. And a `DataCell` sits a third level down, inside a `DataRow`'s `cells`.
  // So this needs either a second ordered collection on `ui.Element` or a `ui.Table` node — a schema
  // amendment, and one with no corpus evidence behind it: `DataTable` is used **0 times** in the M0 corpus.
  // Naming it here is the honest end of that analysis.
  DataTable: {
    capability:
      'two ordered widget-bearing collections on one element (`columns` and `rows`), where `ui.Element` ' +
      'holds one — plus `DataCell`, a third level inside `DataRow.cells`',
    owner: 'schema',
    workaround:
      'a `Column` of `Row`s renders the same grid without needing the table protocol; what is lost is ' +
      'column-wise alignment and sorting',
  },
  DataRow: { capability: 'see `DataTable`', owner: 'schema' },
  DataCell: { capability: 'see `DataTable`', owner: 'schema' },
  DataColumn: { capability: 'see `DataTable`', owner: 'schema' },
  ReorderableListView: {
    capability:
      'drag-to-reorder — the gesture model, plus a drop-target model and the position animation that ' +
      'follows a drag',
    owner: 'runtime',
    workaround: 'a `ListView` renders the same items; only the reordering affordance is missing',
  },
  ToggleButtons: {
    capability:
      'a mapping — it is a row of buttons whose pressed-ness is `isSelected[i]`, and M3 supersedes it with ' +
      '`SegmentedButton`. The catalog and the SDK metrics are in place; only the component is not',
    owner: 'generator',
    workaround: 'a `Row` of `FilterChip`s expresses the same multi-selection and renders today',
  },
  SegmentedButton: {
    capability:
      'a mapping — its `ButtonSegment`s are already named as its children in the catalog, so the structure ' +
      'reaches the generator intact. What is missing is the component and the `Set<T>` selection lowering: ' +
      'a set literal is `BRG1302` in extraction today',
    owner: 'analyzer',
    workaround: 'a `Row` of `ChoiceChip`s expresses single selection and renders today',
  },
  FadeInImage: {
    capability:
      'a placeholder that cross-fades to the loaded image — which is the exit transition `AnimatedSwitcher` ' +
      'is refused for, applied to a load event the kit does not observe',
    owner: 'runtime',
    workaround: '`Image.network` renders the same image without the fade',
  },

  // ── Third-party packages: a second catalog under ADR-18 ──
  // `Gap` used to be the headline entry here — 115 uses, the most of any unsupported widget in the corpus.
  // It is gone because M4-I built the package-catalog path ADR-18 described, and the path is now proven: a
  // package costs one JSON file, one adapter and one line in `AdapterRegistry.production()`. The entries
  // below are the ones nobody has written that file for yet, which is a different and much smaller problem
  // than the one this section used to describe.
  SvgPicture: {
    capability: 'an SVG image provider, and a catalog for flutter_svg',
    owner: 'adr',
    workaround: 'an `Image` renders a raster asset',
  },
  CachedNetworkImage: {
    capability: 'a catalog for cached_network_image',
    owner: 'adr',
    workaround: '`Image.network` renders the same URL; the browser does the caching',
  },
  GoogleMap: { capability: 'a catalog for google_maps_flutter', owner: 'adr' },
};

/**
 * Why `widget` cannot be rendered, or `undefined` if this generator has never heard of it.
 *
 * Consults the constructor-qualified key first: `ListView` renders and `ListView.builder` does not, and a
 * lookup that only saw the class name would give the wrong answer for both.
 *
 * @param widget - the Flutter class name.
 * @param constructorName - the named constructor, if there is one.
 * @returns the missing capability.
 */
export function missingCapabilityOf(
  widget: string,
  constructorName: string | undefined,
): MissingCapability | undefined {
  if (constructorName !== undefined && constructorName !== '') {
    const qualified = MISSING_CAPABILITIES[`${widget}.${constructorName}`];
    if (qualified !== undefined) return qualified;
  }
  return MISSING_CAPABILITIES[widget];
}

/** How an owner is described in a diagnostic — the layer, in the words the report uses. */
export const OWNER_LABEL: Readonly<Record<CapabilityOwner, string>> = {
  runtime: 'the runtime kit',
  generator: 'this generator',
  analyzer: 'the analyzer',
  compiler: 'a normalization pass (N1–N11)',
  schema: 'the UIR schema',
  adr: 'an architectural decision that has not been made yet (it needs an ADR)',
};
