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
// ## The mapping, and the one entry that is not a rename
//
// `MainAxisAlignment` → `justify-content` and `CrossAxisAlignment` → `align-items` are near-renames:
// `start`/`end` are `flex-start`/`flex-end`, `spaceBetween` is `space-between`, and so on down. Flexbox's
// `flex-start` resolves against the container's direction, which is what Flutter's `start` does against
// `textDirection` — so an RTL subtree flips both, and neither needs a second table.
//
// `mainAxisSize` is the entry that is not a rename, and it is the one that decides whether any of the rest
// is visible. Flutter defaults to `MainAxisSize.max`: the flex fills its main-axis constraint, and *that
// free space is what `mainAxisAlignment` distributes*. A `Column(mainAxisAlignment: spaceBetween)` that
// shrink-wrapped its children would have nothing to space between, and would render as `start` — correct
// enough to pass review, wrong on every screen. So `max` emits an explicit main-axis extent of `100%` rather
// than leaning on a CSS default:
//
// | | `min` | `max` (Flutter's default) |
// | --- | --- | --- |
// | `Column` (main axis vertical) | `height: fit-content` | `height: 100%` |
// | `Row` (main axis horizontal) | `width: fit-content` | `width: 100%` |
//
// `fit-content` and not `auto`, because `auto` means opposite things on the two axes: a block-level flex
// container's `height: auto` shrink-wraps (which is `min`) but its `width: auto` fills (which is `max`). One
// keyword that is right for `Column` and backwards for `Row` is worse than no keyword.
//
// ## Where this stops being Flutter, and why it stops there rather than somewhere worse
//
// `height: 100%` resolves against the parent's height, so under an auto-height ancestor it computes to
// `auto` and a `MainAxisSize.max` column shrink-wraps. Flutter does not do that — it throws, because an
// unbounded main-axis constraint on a `max` flex is a real defect in the layout and Flutter says so. We
// degrade instead of throwing, which is the honest limit of props-to-style mapping: a component can see its
// props and cannot see whether its ancestor has a definite height. Resolving that is the constraint model,
// which the M3 stub tag in `src/index.ts` still defers. It is recorded there and not papered over here,
// because a kit that guessed at the ancestor would be wrong silently, and ADR-12 exists because silently
// wrong output is the failure this project cannot see.

import { createElement, type CSSProperties, type ReactElement, type ReactNode } from 'react';

/**
 * How a `Row` or `Column` distributes free space along its main axis — Flutter's `MainAxisAlignment`.
 *
 * Only meaningful when there *is* free space, which is what `mainAxisSize: 'max'` supplies. See this file's
 * header: with `min`, every value here renders identically to `start`.
 */
export type MainAxisAlignment =
  | 'start'
  | 'end'
  | 'center'
  | 'spaceBetween'
  | 'spaceAround'
  | 'spaceEvenly';

/**
 * How a `Row` or `Column` positions its children across the cross axis — Flutter's `CrossAxisAlignment`.
 *
 * `stretch` makes every child fill the cross axis; the rest place a child at its natural cross-axis size.
 */
export type CrossAxisAlignment = 'start' | 'end' | 'center' | 'stretch' | 'baseline';

/**
 * Whether a `Row` or `Column` fills its main-axis constraint or shrink-wraps its children — Flutter's
 * `MainAxisSize`.
 *
 * `max` is Flutter's default and this kit's, and the choice is not cosmetic: it is what gives
 * {@link MainAxisAlignment} anything to distribute. See this file's header for the full table and for the
 * one place the mapping degrades rather than matching Flutter.
 */
export type MainAxisSize = 'min' | 'max';

/**
 * `MainAxisAlignment` → `justify-content`. Total, so a new enum member cannot be silently dropped.
 *
 * Frozen module-scope data with no state in it (ADR-15): a lookup table that is the same table on every
 * render is what makes "same props → same style" true by construction rather than by care.
 */
const JUSTIFY_CONTENT: Readonly<Record<MainAxisAlignment, string>> = Object.freeze({
  start: 'flex-start',
  end: 'flex-end',
  center: 'center',
  spaceBetween: 'space-between',
  spaceAround: 'space-around',
  spaceEvenly: 'space-evenly',
});

/**
 * `CrossAxisAlignment` → `align-items`. Total, for the same reason as {@link JUSTIFY_CONTENT}.
 *
 * `baseline` is the loose end. Flutter requires a `textBaseline` beside it and asserts if it is missing;
 * CSS has no such parameter and aligns on the alphabetic baseline implicitly. That is the right answer for
 * every Latin-script `Text`, and there is no `textBaseline` prop to thread until `TextStyle` is mapped —
 * so a Flutter tree that set `TextBaseline.ideographic` would come out alphabetic here.
 */
const ALIGN_ITEMS: Readonly<Record<CrossAxisAlignment, string>> = Object.freeze({
  start: 'flex-start',
  end: 'flex-end',
  center: 'center',
  stretch: 'stretch',
  baseline: 'baseline',
});

/** What `Row` and `Column` share: `Flex`'s props, minus the `direction` each of them fixes. */
interface FlexLike {
  readonly mainAxisAlignment?: MainAxisAlignment;
  readonly crossAxisAlignment?: CrossAxisAlignment;
  readonly mainAxisSize?: MainAxisSize;
}

/**
 * Builds the flex container's style. Pure: same props in, same keys in the same order, same values out.
 *
 * Both alignments are always emitted, never left to a CSS default, because the defaults disagree with
 * Flutter's where it matters most: CSS `align-items` defaults to `stretch` and Flutter's
 * `crossAxisAlignment` defaults to `center`. Omitting it would stretch every child of every default `Row`
 * to the tallest one's height — a layout nobody wrote, in the most common widget there is.
 */
function flexStyle(direction: 'row' | 'column', props: FlexLike): CSSProperties {
  const justifyContent = JUSTIFY_CONTENT[props.mainAxisAlignment ?? 'start'];
  const alignItems = ALIGN_ITEMS[props.crossAxisAlignment ?? 'center'];
  const extent = (props.mainAxisSize ?? 'max') === 'max' ? '100%' : 'fit-content';
  return direction === 'column'
    ? { display: 'flex', flexDirection: 'column', justifyContent, alignItems, height: extent }
    : { display: 'flex', flexDirection: 'row', justifyContent, alignItems, width: extent };
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
