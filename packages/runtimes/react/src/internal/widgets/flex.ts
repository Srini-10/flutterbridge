// Row and Column — Flutter's `Flex` protocol on flexbox.
//
// ## The component this file exists to prevent
//
// ADR-6 opens by naming the choice: `Row(mainAxisAlignment: spaceBetween)` "can be compiled into a bespoke
// flexbox `<div>` at every call site, or into `<Row mainAxisAlignment="spaceBetween">` imported from a
// versioned runtime package". This is the second thing. The alignment tables below are the entire reason:
// they are stated once, so the day one of them is wrong it is wrong in one place, and a kit release fixes
// every converted application without regenerating any of them.
//
// ## Where the mapping lives
//
// Not here. `MainAxisAlignment → justify-content`, `CrossAxisAlignment → align-items`, `MainAxisSize → an
// extent` and `VerticalDirection → a reversed direction` are all in `layout/alignment.ts`, because `Wrap`
// needs three of them, `Align` needs a fourth, and every widget that ever positions anything needs one. ADR-6
// argues for the kit on exactly this ground — a mapping stated once is fixable once — and that argument does
// not survive a copy per widget. This file spends its remaining knowledge on the *shape* of a flex container,
// which is the part that really is `Row`/`Column`-specific.
//
// `mainAxisSize` is the entry worth reading `alignment.ts` for, because it decides whether any of the rest is
// visible: Flutter defaults to `MainAxisSize.max`, the flex fills its main-axis constraint, and *that free
// space is what `mainAxisAlignment` distributes*. A `Column(mainAxisAlignment: spaceBetween)` that
// shrink-wrapped would have nothing to space between and would render as `start` — correct enough to pass
// review, wrong on every screen.
//
// | | `min` | `max` (Flutter's default) |
// | --- | --- | --- |
// | `Column` (main axis vertical) | `height: fit-content` | `height: 100%` |
// | `Row` (main axis horizontal) | `width: fit-content` | `width: 100%` |
//
// ## Where this stops being Flutter, and why it stops there rather than somewhere worse
//
// `height: 100%` resolves against the parent's height, so under an auto-height ancestor it computes to
// `auto` and a `MainAxisSize.max` column shrink-wraps. Flutter does not do that — it throws, because an
// unbounded main-axis constraint on a `max` flex is a real defect in the layout and Flutter says so. We
// degrade instead of throwing, which is the honest limit of props-to-style mapping: a component can see its
// props and cannot see whether its ancestor has a definite height. `layout/constraints.ts` maps what CSS can
// express and its header bounds what it cannot; this is on the far side of that bound, recorded rather than
// papered over, because a kit that guessed at the ancestor would be wrong silently and ADR-12 exists because
// silently wrong output is the failure this project cannot see.

import { createElement, type CSSProperties, type ReactElement, type ReactNode } from 'react';

import {
  alignItems,
  flexDirection,
  justifyContent,
  mainAxisExtent,
  wrapAlignItems,
  type CrossAxisAlignment,
  type MainAxisAlignment,
  type MainAxisSize,
  type VerticalDirection,
  type WrapAlignment,
  type WrapCrossAlignment,
} from '../layout/alignment.js';

export type {
  CrossAxisAlignment,
  MainAxisAlignment,
  MainAxisSize,
  VerticalDirection,
  WrapAlignment,
  WrapCrossAlignment,
};

/** What `Row` and `Column` share: `Flex`'s props, minus the `direction` each of them fixes. */
interface FlexLike {
  readonly mainAxisAlignment?: MainAxisAlignment;
  readonly crossAxisAlignment?: CrossAxisAlignment;
  readonly mainAxisSize?: MainAxisSize;
  readonly verticalDirection?: VerticalDirection;
}

/**
 * Builds the flex container's style. Pure: same props in, same keys in the same order, same values out.
 *
 * Both alignments are always emitted, never left to a CSS default, because the defaults disagree with
 * Flutter's where it matters most: CSS `align-items` defaults to `stretch` and Flutter's
 * `crossAxisAlignment` defaults to `center`. Omitting it would stretch every child of every default `Row`
 * to the tallest one's height — a layout nobody wrote, in the most common widget there is.
 */
function flexStyle(axis: 'row' | 'column', props: FlexLike): CSSProperties {
  const shared = {
    display: 'flex' as const,
    flexDirection: flexDirection(axis, props.verticalDirection),
    justifyContent: justifyContent(props.mainAxisAlignment),
    alignItems: alignItems(props.crossAxisAlignment),
  };
  const extent = mainAxisExtent(props.mainAxisSize);
  return axis === 'column' ? { ...shared, height: extent } : { ...shared, width: extent };
}

/** Props for {@link Column}. Flutter's `Column`, minus what the constraint model still owes it. */
export interface ColumnProps {
  /**
   * How children are distributed **vertically**, the main axis. Defaults to `start`, as in Flutter.
   *
   * Needs free space to do anything — see `mainAxisSize`.
   */
  readonly mainAxisAlignment?: MainAxisAlignment;
  /** How children are placed **horizontally**, the cross axis. Defaults to `center`, as in Flutter. */
  readonly crossAxisAlignment?: CrossAxisAlignment;
  /**
   * Whether the column fills the available height or shrink-wraps its children. Defaults to `max`, as in
   * Flutter.
   */
  readonly mainAxisSize?: MainAxisSize;
  /** The order children are laid out in. `down` (the default) is top-to-bottom; `up` reverses them. */
  readonly verticalDirection?: VerticalDirection;
  /** The children, top to bottom. Flutter's `List<Widget> children`. */
  readonly children?: ReactNode;
}

/**
 * Flutter's `Column` — children in a vertical run (ADR-6).
 *
 * The main axis is vertical and the cross axis is horizontal, which is the only thing that distinguishes it
 * from {@link Row}; every prop means the same thing on the swapped axes.
 *
 * @param props - see {@link ColumnProps}.
 * @returns a flex container, column direction.
 *
 * @example
 * ```ts
 * // Column(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [...])
 * createElement(Column, { mainAxisAlignment: 'spaceBetween' }, header, footer);
 * ```
 */
export function Column(props: ColumnProps): ReactElement {
  return createElement('div', { style: flexStyle('column', props) }, props.children);
}

/** Props for {@link Row}. Flutter's `Row`, minus what the constraint model still owes it. */
export interface RowProps {
  /**
   * How children are distributed **horizontally**, the main axis. Defaults to `start`, as in Flutter.
   *
   * Needs free space to do anything — see `mainAxisSize`.
   */
  readonly mainAxisAlignment?: MainAxisAlignment;
  /** How children are placed **vertically**, the cross axis. Defaults to `center`, as in Flutter. */
  readonly crossAxisAlignment?: CrossAxisAlignment;
  /**
   * Whether the row fills the available width or shrink-wraps its children. Defaults to `max`, as in
   * Flutter.
   */
  readonly mainAxisSize?: MainAxisSize;
  /** The order children are laid out in. `down` (the default) is leading-to-trailing; `up` reverses them. */
  readonly verticalDirection?: VerticalDirection;
  /** The children, leading to trailing. Flutter's `List<Widget> children`. */
  readonly children?: ReactNode;
}

/**
 * Flutter's `Row` — children in a horizontal run. The widget ADR-6 is written about (ADR-6).
 *
 * The main axis is horizontal and the cross axis is vertical. `mainAxisAlignment: 'spaceBetween'` is the
 * ADR's own example, and it works here for the reason the ADR wanted: the meaning of `spaceBetween` lives in
 * this package, not in the call site.
 *
 * @param props - see {@link RowProps}.
 * @returns a flex container, row direction.
 *
 * @example
 * ```ts
 * // Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Text('Total'), Text('£42')])
 * createElement(
 *   Row,
 *   { mainAxisAlignment: 'spaceBetween' },
 *   createElement(Text, null, 'Total'),
 *   createElement(Text, null, '£42'),
 * );
 * ```
 */
export function Row(props: RowProps): ReactElement {
  return createElement('div', { style: flexStyle('row', props) }, props.children);
}

// ── Flex children — Expanded, Flexible, Spacer ────────────────────────────────────────────────────
//
// These are not layouts of their own; they are instructions to the enclosing `Row`/`Column` about how one
// child takes main-axis space. Flexbox says the same thing with `flex`, and — the one subtlety — it says it
// **on the child**, so these emit a wrapper whose `flex` is the whole of their meaning. `flex-grow` and
// `flex-basis` apply to the parent's main axis automatically, so unlike Flutter's widgets these need not
// know whether they sit in a row or a column.
//
// `min-width`/`min-height: 0` is not optional. A flex item's automatic minimum size is its content's
// min-content, so a long `Text` in an `Expanded` refuses to shrink below its longest word and overflows the
// row — Flutter clips instead. Zeroing the minimum restores Flutter's behaviour, and it is the single most
// common flexbox surprise there is.

/** How a {@link Flexible} child is sized within its share — Flutter's `FlexFit`. */
export type FlexFit = 'tight' | 'loose';

/** Props for {@link Expanded}. */
export interface ExpandedProps {
  /** The share of free space this child takes, against its siblings' flexes. Defaults to 1, as in Flutter. */
  readonly flex?: number;
  /** The widget to expand. Flutter's `child` slot. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `Expanded` — a child that fills its share of the main axis (it is `Flexible(fit: tight)`).
 *
 * `flex: N 1 0%` — grow by `N`, shrink if needed, and start from a zero basis so the *whole* main axis is
 * distributed by the grow factors rather than by content size. That zero basis is what makes `Expanded`
 * tight: two `Expanded(flex: 1)` children split the axis in half regardless of what they contain.
 *
 * @param props - see {@link ExpandedProps}.
 * @returns the child, filling its flex share.
 */
export function Expanded(props: ExpandedProps): ReactElement {
  return createElement(
    'div',
    { style: { flex: `${props.flex ?? 1} 1 0%`, minWidth: 0, minHeight: 0 } },
    props.child,
  );
}

/** Props for {@link Flexible}. */
export interface FlexibleProps {
  /** The share of free space this child may take. Defaults to 1, as in Flutter. */
  readonly flex?: number;
  /** Whether the child fills its share (`tight`) or may be smaller (`loose`). Defaults to `loose`, as in Flutter. */
  readonly fit?: FlexFit;
  /** The widget. Flutter's `child` slot. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `Flexible` — a child that may grow into its share but is not forced to fill it.
 *
 * The difference from {@link Expanded} is the basis: `loose` starts from `auto` (the child's content size)
 * and grows from there, so a child smaller than its share stays its content size; `tight` starts from `0%`
 * and is `Expanded`. Shrink is `1` either way — a `Flexible` yields when the axis is over-full, which is the
 * behaviour that keeps a long row from overflowing.
 *
 * @param props - see {@link FlexibleProps}.
 * @returns the child, sized within its flex share.
 */
export function Flexible(props: FlexibleProps): ReactElement {
  const basis = (props.fit ?? 'loose') === 'tight' ? '0%' : 'auto';
  return createElement(
    'div',
    { style: { flex: `${props.flex ?? 1} 1 ${basis}`, minWidth: 0, minHeight: 0 } },
    props.child,
  );
}

/** Props for {@link Spacer}. */
export interface SpacerProps {
  /** The share of free space this spacer takes. Defaults to 1, as in Flutter. */
  readonly flex?: number;
}

/**
 * Flutter's `Spacer` — empty flexible space between children. `Expanded` with no child.
 *
 * `Spacer(flex: 2)` between two items pushes them apart with twice the pull of a plain `Spacer`, exactly as
 * two grow factors do. It has no child and paints nothing; it is the gap.
 *
 * @param props - see {@link SpacerProps}.
 * @returns an empty flex child.
 */
export function Spacer(props: SpacerProps): ReactElement {
  return createElement('div', { style: { flex: `${props.flex ?? 1} 1 0%` } });
}

// ── Wrap — a flex run that wraps ──────────────────────────────────────────────────────────────────
//
// Flutter's `Wrap` is a `Flex` that starts a new run when the current one is full — which is `flex-wrap:
// wrap`. The two gaps map directly: `spacing` is space between children *in* a run (the main axis, so
// `column-gap` for the default horizontal direction), `runSpacing` is space *between* runs (`row-gap`).
// `alignment` distributes free space in a run exactly as `mainAxisAlignment` does in a `Row`, and
// `crossAxisAlignment` places a child across its run's thickness — both from `layout/alignment.ts`, which is
// why `WrapAlignment` and `MainAxisAlignment` cannot drift apart.
//
// `runAlignment` — which distributes the *runs* within the wrap's cross-axis extent — is `align-content`, and
// is not forwarded: it only does anything when the container has a cross-axis extent larger than its runs,
// which needs the constraint model to establish. Not mapped on a guess (this file's rule).

/** Props for {@link Wrap}. Flutter's `Wrap`, horizontal direction. */
export interface WrapProps {
  /** Space between children within a run — the main axis. Defaults to 0, as in Flutter. */
  readonly spacing?: number;
  /** Space between runs — the cross axis. Defaults to 0, as in Flutter. */
  readonly runSpacing?: number;
  /** How free space in a run is distributed. Defaults to `start`, as in Flutter. */
  readonly alignment?: WrapAlignment;
  /** How a child is placed across its run's thickness. Defaults to `start`, as in Flutter. */
  readonly crossAxisAlignment?: WrapCrossAlignment;
  /** The children, wrapping onto new runs as they fill. */
  readonly children?: ReactNode;
}

/**
 * Flutter's `Wrap` — a horizontal run of children that wraps onto new lines.
 *
 * @param props - see {@link WrapProps}.
 * @returns a wrapping flex container.
 */
export function Wrap(props: WrapProps): ReactElement {
  const style: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    columnGap: props.spacing ?? 0,
    rowGap: props.runSpacing ?? 0,
    justifyContent: justifyContent(props.alignment),
    alignItems: wrapAlignItems(props.crossAxisAlignment),
  };
  return createElement('div', { style }, props.children);
}
