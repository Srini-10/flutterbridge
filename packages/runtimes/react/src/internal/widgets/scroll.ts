// ListView, GridView, SingleChildScrollView — Flutter's scroll views on overflow.
//
// ## What a scroll view is, in both models
//
// Flutter's `ScrollView` is a viewport plus a scrollable extent: it takes an unbounded constraint along its
// scroll axis, lays children out into it, and shows a window. CSS says the same thing with `overflow: auto`
// on a box with a definite size — the box is the viewport, the content is the extent.
//
// So the mapping is direct, and the interesting parts are the two places Flutter's defaults are not CSS's:
//
// - **A `ListView` scrolls by default and a `<div>` does not.** `overflow-y: auto` is always emitted.
// - **A `ListView`'s cross axis is tight.** Its children fill the width; CSS flex items shrink-wrap unless
//   told otherwise, so `align-items: stretch` is stated rather than left to the default `center` this kit
//   applies elsewhere.
//
// ## `shrinkWrap`, and why it is not `height: auto`
//
// Flutter's `shrinkWrap: true` makes the list size itself to its content instead of filling the viewport, and
// its documentation warns it is expensive. In CSS a box that has not been given a height *already* sizes to
// its content, so `shrinkWrap` is the absence of the `height: 100%` a non-shrink-wrapping list needs. Emitting
// `height: auto` for it would be a declaration that overrides an inherited height on its way to meaning
// nothing — the same trap `SizedBox` avoids by omitting rather than defaulting.
//
// ## What is not here
//
// `ListView.builder` and its `itemBuilder`. A builder is a *function of an index*, and the faithful lowering
// is `ui.List` — which the analyzer produces when it can see a real iterable to map over, and cannot when the
// only thing available is `itemCount` and a closure. That is not a rendering gap the kit can close; it is an
// extraction question, and the generator reports it (`BRG3014`) rather than rendering an empty list.

import { Children, createElement, type CSSProperties, type ReactElement, type ReactNode } from 'react';

import { alignItems, justifyContent, type CrossAxisAlignment, type MainAxisAlignment } from '../layout/alignment.js';
import { edgeInsetsStyle, mergeStyles } from '../layout/constraints.js';
import type { EdgeInsets } from '../layout/edge_insets.js';

/** Which way a scroll view scrolls — Flutter's `Axis`. */
export type Axis = 'horizontal' | 'vertical';

/** Flutter's `Axis`, as a value. See `layout/alignment.ts` on why the kit exports enum values. */
export const Axis: Readonly<Record<Axis, Axis>> = Object.freeze({
  horizontal: 'horizontal',
  vertical: 'vertical',
});

/** What every scroll view shares. */
interface ScrollableLike {
  readonly scrollDirection?: Axis;
  readonly padding?: EdgeInsets;
  readonly shrinkWrap?: boolean;
  readonly reverse?: boolean;
}

/**
 * The viewport declarations shared by every scroll view.
 *
 * Stated once because three widgets need the identical answer, and a scroll view that disagreed with another
 * about which axis `overflow` goes on would be a bug visible only on one of them.
 *
 * @param props - the scroll view's shared props.
 * @returns the viewport declarations.
 */
function viewportStyle(props: ScrollableLike): CSSProperties {
  const vertical = (props.scrollDirection ?? 'vertical') === 'vertical';
  const style: CSSProperties = {
    display: 'flex',
    // `reverse: true` starts at the far end — Flutter's reverse, and flexbox's, are the same operation.
    flexDirection: vertical
      ? props.reverse === true
        ? 'column-reverse'
        : 'column'
      : props.reverse === true
        ? 'row-reverse'
        : 'row',
    overflowX: vertical ? 'hidden' : 'auto',
    overflowY: vertical ? 'auto' : 'hidden',
  };
  // A non-shrink-wrapping list fills its viewport. A shrink-wrapping one emits nothing at all: a box with no
  // stated extent already sizes to its content, and `auto` would override an inherited extent on the way.
  if (props.shrinkWrap !== true) {
    if (vertical) style.height = '100%';
    else style.width = '100%';
  }
  return style;
}

/** Props for {@link ListView}. Flutter's `ListView`, with an explicit `children` list. */
export interface ListViewProps {
  /** Which way it scrolls. Defaults to `vertical`, as in Flutter. */
  readonly scrollDirection?: Axis;
  /** Insets inside the viewport, around the children. */
  readonly padding?: EdgeInsets;
  /** Whether it sizes to its content rather than filling the viewport. Defaults to `false`, as in Flutter. */
  readonly shrinkWrap?: boolean;
  /** Whether it starts at the far end. Defaults to `false`, as in Flutter. */
  readonly reverse?: boolean;
  /** The items. Flutter's `List<Widget> children`. */
  readonly children?: ReactNode;
}

/**
 * Flutter's `ListView` — a scrolling list of children.
 *
 * `align-items: stretch` rather than this kit's usual `center`, because a `ListView`'s cross axis is *tight*:
 * its children are given the full cross-axis extent, and a row of centred, shrink-wrapped tiles is a visibly
 * different list from the one Flutter renders.
 *
 * `flex-shrink: 0` is not set on the children here, and cannot be: it belongs on each child, and a scroll
 * view does not construct its children. A list whose items compress instead of scrolling is the flexbox
 * default; the items in this kit that must not compress (`Divider`, `SizedBox` in a list) set it themselves.
 *
 * @param props - see {@link ListViewProps}.
 * @returns the scrolling list.
 */
export function ListView(props: ListViewProps): ReactElement {
  const style = mergeStyles(
    viewportStyle(props),
    { alignItems: 'stretch' },
    props.padding === undefined ? undefined : edgeInsetsStyle(props.padding, 'padding'),
  );
  return createElement('div', { style }, props.children);
}

/** Props for {@link SingleChildScrollView}. */
export interface SingleChildScrollViewProps {
  /** Which way it scrolls. Defaults to `vertical`, as in Flutter. */
  readonly scrollDirection?: Axis;
  /** Insets inside the viewport, around the child. */
  readonly padding?: EdgeInsets;
  /** Whether it starts at the far end. Defaults to `false`, as in Flutter. */
  readonly reverse?: boolean;
  /** The content. Flutter's `child` slot, per the catalog. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `SingleChildScrollView` — one child, scrolled.
 *
 * The idiom it exists for: a `Column` too tall for its screen. Flutter's version relaxes the child's
 * constraint along the scroll axis from tight to unbounded, which is why a `Column` inside one stops
 * overflowing; CSS gets the same result because a box with `overflow: auto` scrolls content taller than
 * itself rather than clipping it.
 *
 * @param props - see {@link SingleChildScrollViewProps}.
 * @returns the scrolling box.
 */
export function SingleChildScrollView(props: SingleChildScrollViewProps): ReactElement {
  const style = mergeStyles(
    viewportStyle(props),
    props.padding === undefined ? undefined : edgeInsetsStyle(props.padding, 'padding'),
  );
  return createElement('div', { style }, props.child);
}

/**
 * How a `GridView` divides its cross axis — Flutter's `SliverGridDelegateWithFixedCrossAxisCount`.
 *
 * Mirrored as a class because that is how it reaches the generator: `GridView(gridDelegate:
 * SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2))` is a `logic.New` of a `package:flutter/`
 * type, so the kit must export the type for the construction to resolve.
 *
 * `GridView.count(crossAxisCount: 2)` is Flutter's sugar for the same delegate, and arrives as a plain prop —
 * {@link GridView} accepts either, converging them the way `Image` converges its three spellings.
 */
export class SliverGridDelegateWithFixedCrossAxisCount {
  /** How many children fit across the cross axis. */
  public readonly crossAxisCount: number;
  /** Space between rows, in logical pixels. */
  public readonly mainAxisSpacing: number;
  /** Space between columns, in logical pixels. */
  public readonly crossAxisSpacing: number;
  /** Each child's width ÷ height. Defaults to `1.0`, as in Flutter. */
  public readonly childAspectRatio: number;

  public constructor(options: {
    readonly crossAxisCount: number;
    readonly mainAxisSpacing?: number;
    readonly crossAxisSpacing?: number;
    readonly childAspectRatio?: number;
  }) {
    this.crossAxisCount = options.crossAxisCount;
    this.mainAxisSpacing = options.mainAxisSpacing ?? 0;
    this.crossAxisSpacing = options.crossAxisSpacing ?? 0;
    this.childAspectRatio = options.childAspectRatio ?? 1;
  }
}

/** Props for {@link GridView}. Flutter's `GridView`, in both of its spellings. */
export interface GridViewProps {
  /** The delegate — Flutter's `GridView(gridDelegate:)`. Takes precedence over the loose props. */
  readonly gridDelegate?: SliverGridDelegateWithFixedCrossAxisCount;
  /** How many children fit across — Flutter's `GridView.count(crossAxisCount:)`. */
  readonly crossAxisCount?: number;
  /** Space between rows — `GridView.count(mainAxisSpacing:)`. */
  readonly mainAxisSpacing?: number;
  /** Space between columns — `GridView.count(crossAxisSpacing:)`. */
  readonly crossAxisSpacing?: number;
  /** Each child's width ÷ height — `GridView.count(childAspectRatio:)`. */
  readonly childAspectRatio?: number;
  /** Which way it scrolls. Defaults to `vertical`, as in Flutter. */
  readonly scrollDirection?: Axis;
  /** Insets inside the viewport. */
  readonly padding?: EdgeInsets;
  /** Whether it sizes to its content. Defaults to `false`, as in Flutter. */
  readonly shrinkWrap?: boolean;
  /** The items. */
  readonly children?: ReactNode;
}

/**
 * Flutter's `GridView` — a scrolling grid.
 *
 * CSS Grid, not flexbox: `grid-template-columns: repeat(n, 1fr)` divides the cross axis into `n` equal
 * tracks, which is precisely what `SliverGridDelegateWithFixedCrossAxisCount` does. The two gaps map to
 * `row-gap`/`column-gap` and `childAspectRatio` to `aspect-ratio` on the implicit rows.
 *
 * `SliverGridDelegateWithMaxCrossAxisExtent` — the other common delegate — is not accepted: it divides by a
 * *maximum tile width*, which CSS expresses as `repeat(auto-fill, minmax(…, 1fr))` with a different rounding
 * rule than Flutter's. The generator refuses it rather than rendering a grid with a different column count.
 *
 * @param props - see {@link GridViewProps}.
 * @returns the scrolling grid.
 */
export function GridView(props: GridViewProps): ReactElement {
  const delegate = props.gridDelegate;
  const columns = delegate?.crossAxisCount ?? props.crossAxisCount ?? 1;
  const rowGap = delegate?.mainAxisSpacing ?? props.mainAxisSpacing ?? 0;
  const columnGap = delegate?.crossAxisSpacing ?? props.crossAxisSpacing ?? 0;
  const ratio = delegate?.childAspectRatio ?? props.childAspectRatio ?? 1;
  const vertical = (props.scrollDirection ?? 'vertical') === 'vertical';

  const style: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    // The ratio sizes the *tracks*, so it goes on the implicit rows rather than on each child — a child that
    // set its own aspect ratio would then be fighting the grid rather than filling its cell.
    gridAutoRows: 'minmax(0, auto)',
    rowGap,
    columnGap,
    overflowX: vertical ? 'hidden' : 'auto',
    overflowY: vertical ? 'auto' : 'hidden',
  };
  if (props.shrinkWrap !== true && vertical) style.height = '100%';

  // Each cell carries the aspect ratio. Applying it to `gridAutoRows` would fix a row height in pixels the
  // grid has not computed yet; applying it per cell lets the track size to the cells, which is Flutter's
  // order of operations too.
  const cellStyle: CSSProperties = { aspectRatio: String(ratio) };
  const children = Array.isArray(props.children) ? props.children : [props.children];
  const cells = children
    .filter((child) => child !== null && child !== undefined && child !== false)
    .map((child, index) => createElement('div', { key: index, style: cellStyle }, child as ReactNode));

  return createElement(
    'div',
    { style: mergeStyles(style, props.padding === undefined ? undefined : edgeInsetsStyle(props.padding, 'padding')) },
    cells,
  );
}

/** Props for {@link Flex}. Flutter's `Flex` — a `Row`/`Column` whose axis is a prop. */
export interface FlexProps {
  /** The main axis. Required, as in Flutter. */
  readonly direction: Axis;
  /** How children are distributed along the main axis. */
  readonly mainAxisAlignment?: MainAxisAlignment;
  /** How children are placed across the cross axis. */
  readonly crossAxisAlignment?: CrossAxisAlignment;
  /** The children. */
  readonly children?: ReactNode;
}

/**
 * Flutter's `Flex` — the widget `Row` and `Column` are each a fixed-axis case of.
 *
 * Written here rather than in `flex.ts` because it is the *scrolling* family's shape: an axis that is a
 * value rather than a choice of widget. Its alignment goes through the same tables `Row` uses, so the three
 * cannot disagree.
 *
 * @param props - see {@link FlexProps}.
 * @returns the flex container.
 */
export function Flex(props: FlexProps): ReactElement {
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: props.direction === 'horizontal' ? 'row' : 'column',
    justifyContent: justifyContent(props.mainAxisAlignment),
    alignItems: alignItems(props.crossAxisAlignment),
  };
  return createElement('div', { style }, props.children);
}

// ── M4-H: PageView ────────────────────────────────────────────────────────────────────────────────

/** Props for {@link PageView}. */
export interface PageViewProps {
  /** The pages, in order. Flutter's `children`. */
  readonly children?: ReactNode;
  /** Which way pages advance. Flutter's `scrollDirection`, defaulting to horizontal — unlike a ListView. */
  readonly scrollDirection?: Axis;
  /** Whether the order is reversed. Flutter's `reverse`. */
  readonly reverse?: boolean;
  /**
   * Invoked with the settled page's index. Flutter's `onPageChanged`.
   *
   * Not wired, and not silently accepted either — see the component's note. Declared so the generator can
   * forward it and the kit can say precisely what does not happen.
   */
  readonly onPageChanged?: ((page: number) => void) | undefined;
}

/**
 * Flutter's `PageView` — a scroll view that settles on whole pages.
 *
 * CSS scroll snapping is the mechanism, and it is a real correspondence rather than an approximation:
 * `scroll-snap-type: x mandatory` on the viewport with `scroll-snap-align: start` on each child is defined
 * to settle scrolling on a child boundary, which is what a `PageView`'s `PageScrollPhysics` does.
 *
 * ## What does not happen, stated rather than hidden
 *
 * **`onPageChanged` is not called.** Firing it needs to know which child the viewport settled on, which
 * means observing scroll position against child geometry — measurement, which `unsupported.ts` owns. A
 * callback that was accepted and never invoked would be worse than one that is refused, so the generator
 * refuses `onPageChanged` by name (`BRG3017`) rather than this component swallowing it.
 *
 * A `PageController` is likewise not a prop: it is an imperative handle (`animateToPage`) on a live
 * viewport, which is the same gap `GlobalKey` names.
 *
 * @param props - see {@link PageViewProps}.
 * @returns the page view.
 */
export function PageView(props: PageViewProps): ReactElement {
  // Horizontal by default — a `PageView`'s default axis is the opposite of a `ListView`'s, and taking the
  // scroll module's shared default would have silently made every page view vertical.
  const horizontal = (props.scrollDirection ?? 'horizontal') === 'horizontal';
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: horizontal
      ? props.reverse === true
        ? 'row-reverse'
        : 'row'
      : props.reverse === true
        ? 'column-reverse'
        : 'column',
    overflowX: horizontal ? 'auto' : 'hidden',
    overflowY: horizontal ? 'hidden' : 'auto',
    scrollSnapType: `${horizontal ? 'x' : 'y'} mandatory`,
    height: '100%',
  };
  // Each child is a full-viewport page that snaps. `flexShrink: 0` is load-bearing: without it a flex item
  // compresses to fit and every page would be visible at once, which is not a smaller version of a
  // PageView — it is a Row.
  const page: CSSProperties = {
    scrollSnapAlign: 'start',
    flexShrink: 0,
    ...(horizontal ? { width: '100%' } : { height: '100%' }),
  };
  return createElement(
    'div',
    { style },
    Children.map(props.children, (child) => createElement('div', { style: page }, child)),
  );
}
