// The alignment model — every Flutter alignment vocabulary, mapped to CSS exactly once.
//
// ## Why one module and not a table per widget
//
// Before this file, `MainAxisAlignment → justify-content` lived in `flex.ts` and `WrapAlignment` reused it by
// importing it, which worked only because `Wrap` happens to sit in the same file. `Align`, `Stack`,
// `ListView`, `Table` and every other widget that positions something would each have arrived with its own
// copy. ADR-6's argument for the runtime kit is precisely that a mapping stated once is *fixable* once — "the
// day one of them is wrong it is wrong in one place" — and that argument does not survive nine copies of
// `spaceBetween: 'space-between'`.
//
// So every alignment enum Flutter has is here, and the widgets import. A widget file that writes a CSS
// alignment keyword is a widget file with a bug waiting in it.
//
// ## The one genuine divergence: physical vs directional
//
// Flutter has **two** alignment types and they are not interchangeable:
//
// - `Alignment(x, y)` is **physical**. `Alignment.centerLeft` is the left of the screen, in Arabic as in
//   English.
// - `AlignmentDirectional(start, y)` is **logical**. `AlignmentDirectional.centerStart` is the left in LTR
//   and the *right* in RTL.
//
// CSS has both, and they are different keywords: `justify-content: left` is physical, `justify-content:
// flex-start` resolves against the container's `direction`. Mapping both onto `flex-start` — the obvious
// shortcut — silently turns every physical `Alignment.centerLeft` into a directional one, which is invisible
// until the first RTL locale and wrong on every screen of it. So {@link alignmentStyle} branches on
// `directional`, and that is the only branch in this file.
//
// ## Where this stops being Flutter
//
// Flexbox distributes free space to **three** positions per axis: start, centre, end. Flutter's `Alignment`
// takes a *continuous* pair — `Alignment(0.3, -0.7)` is legal and means 65% across, 15% down. There is no CSS
// alignment keyword for that, and no way to express "a fraction of the free space" without taking the child
// out of flow (`position: absolute` with a percentage `translate` is exact, but an out-of-flow child stops
// contributing to its parent's height, so a `Center` inside an auto-height `Column` would collapse to nothing
// — a worse failure, in a far more common shape, than the one it fixes).
//
// So the nine named constants — which is what Flutter source actually writes — map exactly, and a fractional
// alignment raises `BRG4008` rather than snapping to the nearest keyword. Snapping would put the child in the
// wrong place with no indication that it had; ADR-12 exists because silently-wrong output is the failure this
// project cannot see. The generator refuses the same case at compile time (`BRG3011`), so a program that uses
// one is rejected at build rather than in a browser.

import { createElement, type CSSProperties, type ReactElement, type ReactNode } from 'react';

import { RuntimeDiagnosticCode, RuntimeError } from '../diagnostics/codes.js';

// ── The flex enums ────────────────────────────────────────────────────────────────────────────────

/**
 * How a `Row`/`Column` distributes free space along its main axis — Flutter's `MainAxisAlignment`.
 *
 * Only meaningful when there *is* free space, which is what `mainAxisSize: 'max'` supplies; with `min`, every
 * value renders identically to `start`. See {@link mainAxisExtent}.
 */
export type MainAxisAlignment =
  | 'start'
  | 'end'
  | 'center'
  | 'spaceBetween'
  | 'spaceAround'
  | 'spaceEvenly';

/**
 * How a `Row`/`Column` places its children across the cross axis — Flutter's `CrossAxisAlignment`.
 *
 * `stretch` makes every child fill the cross axis; the rest place a child at its natural cross-axis size.
 */
export type CrossAxisAlignment = 'start' | 'end' | 'center' | 'stretch' | 'baseline';

/**
 * Whether a `Row`/`Column` fills its main-axis constraint or shrink-wraps — Flutter's `MainAxisSize`.
 *
 * `max` is Flutter's default and this kit's, and the choice is not cosmetic: it is what gives
 * {@link MainAxisAlignment} anything to distribute.
 */
export type MainAxisSize = 'min' | 'max';

/** How a `Wrap` distributes free space within a run — Flutter's `WrapAlignment`, the six of {@link MainAxisAlignment}. */
export type WrapAlignment = MainAxisAlignment;

/**
 * How a `Wrap` aligns children *within* a run, across the run's thickness — Flutter's `WrapCrossAlignment`.
 *
 * Three values, not five: Flutter's `WrapCrossAlignment` has no `stretch` or `baseline`.
 */
export type WrapCrossAlignment = 'start' | 'end' | 'center';

/** How text is aligned within its line box — Flutter's `TextAlign`. */
export type TextAlign = 'left' | 'right' | 'center' | 'justify' | 'start' | 'end';

/**
 * The order a `Row`/`Column` lays children out in — Flutter's `VerticalDirection`.
 *
 * `down` is Flutter's default: children run top-to-bottom in a `Column`, and `up` reverses them. It is named
 * for the vertical axis but Flutter applies it to a `Row`'s cross axis too, which is why {@link flexDirection}
 * takes it alongside the direction rather than resolving it separately.
 */
export type VerticalDirection = 'up' | 'down';

/** Which way the inline axis runs — Flutter's `TextDirection`. Maps to CSS `direction`. */
export type TextDirection = 'ltr' | 'rtl';

/**
 * `MainAxisAlignment` → `justify-content`. Total, so a new enum member cannot be silently dropped.
 *
 * Frozen module-scope data with no state in it (ADR-15): a lookup table that is the same table on every render
 * is what makes "same props → same style" true by construction rather than by care.
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
 * `baseline` is the loose end. Flutter requires a `textBaseline` beside it and asserts if it is missing; CSS
 * has no such parameter and aligns on the alphabetic baseline implicitly. That is the right answer for every
 * Latin-script `Text`, and there is no `textBaseline` prop to thread until `TextStyle` is mapped — so a
 * Flutter tree that set `TextBaseline.ideographic` comes out alphabetic here.
 */
const ALIGN_ITEMS: Readonly<Record<CrossAxisAlignment, string>> = Object.freeze({
  start: 'flex-start',
  end: 'flex-end',
  center: 'center',
  stretch: 'stretch',
  baseline: 'baseline',
});

/** `WrapCrossAlignment` → `align-items`. A restriction of {@link ALIGN_ITEMS}, stated rather than derived. */
const WRAP_ALIGN_ITEMS: Readonly<Record<WrapCrossAlignment, string>> = Object.freeze({
  start: 'flex-start',
  end: 'flex-end',
  center: 'center',
});

/**
 * `TextAlign` → `text-align`. Every member is its own CSS keyword, so this is an identity map — and it is
 * written out anyway, because being total is what makes a future Flutter enum member a compile error here
 * instead of an `undefined` in a stylesheet.
 */
const TEXT_ALIGN: Readonly<Record<TextAlign, string>> = Object.freeze({
  left: 'left',
  right: 'right',
  center: 'center',
  justify: 'justify',
  start: 'start',
  end: 'end',
});

/**
 * How a `Row`/`Column` distributes free space along its main axis.
 *
 * @param alignment - Flutter's `MainAxisAlignment`. Defaults to `start`, as in Flutter.
 * @returns the `justify-content` value.
 */
export function justifyContent(alignment: MainAxisAlignment | undefined): string {
  return JUSTIFY_CONTENT[alignment ?? 'start'];
}

/**
 * How a `Row`/`Column` places children across its cross axis.
 *
 * @param alignment - Flutter's `CrossAxisAlignment`. Defaults to `center`, **as in Flutter** — which is not
 * the CSS default. Omitting the declaration would leave `align-items: stretch`, stretching every child of
 * every default `Row` to the tallest one's height: a layout nobody wrote, in the most common widget there is.
 * @returns the `align-items` value.
 */
export function alignItems(alignment: CrossAxisAlignment | undefined): string {
  return ALIGN_ITEMS[alignment ?? 'center'];
}

/**
 * How a `Wrap` aligns children within a run.
 *
 * @param alignment - Flutter's `WrapCrossAlignment`. Defaults to `start`, as in Flutter.
 * @returns the `align-items` value.
 */
export function wrapAlignItems(alignment: WrapCrossAlignment | undefined): string {
  return WRAP_ALIGN_ITEMS[alignment ?? 'start'];
}

/**
 * How text sits in its line box.
 *
 * @param align - Flutter's `TextAlign`. Defaults to `start`, as in Flutter.
 * @returns the `text-align` value.
 */
export function textAlign(align: TextAlign | undefined): string {
  return TEXT_ALIGN[align ?? 'start'];
}

/**
 * The main-axis extent a `Row`/`Column` takes.
 *
 * Flutter's `MainAxisSize.max` fills the main-axis constraint, and *that free space is what
 * {@link MainAxisAlignment} distributes* — so `max` emits an explicit `100%` rather than leaning on a CSS
 * default. `fit-content` and not `auto` for `min`, because `auto` means opposite things on the two axes: a
 * block-level flex container's `height: auto` shrink-wraps but its `width: auto` fills. One keyword that is
 * right for `Column` and backwards for `Row` is worse than no keyword.
 *
 * **Degrades**: `100%` resolves against the parent's extent, so under an auto-height ancestor a
 * `MainAxisSize.max` column shrink-wraps. Flutter throws there instead, because an unbounded main-axis
 * constraint on a `max` flex is a real defect and Flutter says so. A component can see its props and cannot
 * see whether its ancestor is bounded; resolving that is `constraints.ts`'s subject and its header's limit.
 *
 * @param size - Flutter's `MainAxisSize`. Defaults to `max`, as in Flutter.
 * @returns `'100%'` or `'fit-content'`.
 */
export function mainAxisExtent(size: MainAxisSize | undefined): string {
  return (size ?? 'max') === 'max' ? '100%' : 'fit-content';
}

/**
 * The `flex-direction` for an axis and a layout order.
 *
 * @param axis - `row` or `column`, the axis the widget fixes.
 * @param direction - Flutter's `VerticalDirection`. `down` is the default and lays children out in order;
 * `up` reverses them, which is `row-reverse`/`column-reverse`.
 * @returns the `flex-direction` value.
 */
export function flexDirection(
  axis: 'row' | 'column',
  direction: VerticalDirection | undefined,
): CSSProperties['flexDirection'] {
  const reversed = (direction ?? 'down') === 'up';
  if (axis === 'column') return reversed ? 'column-reverse' : 'column';
  return reversed ? 'row-reverse' : 'row';
}

// ── Alignment and AlignmentDirectional ────────────────────────────────────────────────────────────

/**
 * A point within a box — the runtime form of Flutter's `AlignmentGeometry`.
 *
 * Both axes run `-1` to `1` with `0` at the centre, exactly as in Flutter: `x: -1` is the leading edge, `y:
 * -1` the top. The base type of {@link Alignment} and {@link AlignmentDirectional}, and the type every widget
 * prop takes — because a widget accepts either, and {@link alignmentStyle} is one function over both rather
 * than two that must be kept in step.
 *
 * The name is Flutter's own: `Alignment` and `AlignmentDirectional` both extend `AlignmentGeometry` there,
 * for the same reason.
 */
export interface AlignmentGeometry {
  /** The horizontal position: `-1` leading, `0` centre, `1` trailing. */
  readonly x: number;
  /** The vertical position: `-1` top, `0` centre, `1` bottom. */
  readonly y: number;
  /**
   * Whether {@link x} resolves against the text direction.
   *
   * `false` is Flutter's `Alignment` — physical, so `x: -1` is the screen's left in every locale. `true` is
   * `AlignmentDirectional` — logical, so `x: -1` is the left in LTR and the right in RTL. See this file's
   * header on why collapsing the two is a defect that only appears in RTL.
   */
  readonly directional: boolean;
}

/**
 * Flutter's `Alignment` — a physical point within a box.
 *
 * **Physical**: `topLeft` is the top-left of the screen whatever the text direction. Use
 * {@link AlignmentDirectional} for the locale-sensitive kind.
 *
 * A class with static members rather than a frozen object of data, because that is the shape Dart has and so
 * the shape the emitted code needs: `Alignment.bottomRight` lowers to a static read and `Alignment(0.3, 0.5)`
 * to `new Alignment(0.3, 0.5)`. Mirroring the API rather than improving it is what keeps generated output
 * recognisable as the Dart it came from (ADR-6).
 *
 * @example
 * ```ts
 * Alignment.center;             // Alignment.center
 * new Alignment(0.3, -0.7);     // Alignment(0.3, -0.7) — legal Dart, and refused by alignmentStyle
 * ```
 */
export class Alignment implements AlignmentGeometry {
  /** The horizontal position: `-1` left, `0` centre, `1` right. */
  public readonly x: number;
  /** The vertical position: `-1` top, `0` centre, `1` bottom. */
  public readonly y: number;
  /** Always `false`: an `Alignment` is physical. */
  public readonly directional = false;

  public constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  /** The top-left corner. */
  public static readonly topLeft = new Alignment(-1, -1);
  /** The centre of the top edge. */
  public static readonly topCenter = new Alignment(0, -1);
  /** The top-right corner. */
  public static readonly topRight = new Alignment(1, -1);
  /** The centre of the left edge. */
  public static readonly centerLeft = new Alignment(-1, 0);
  /** The centre. */
  public static readonly center = new Alignment(0, 0);
  /** The centre of the right edge. */
  public static readonly centerRight = new Alignment(1, 0);
  /** The bottom-left corner. */
  public static readonly bottomLeft = new Alignment(-1, 1);
  /** The centre of the bottom edge. */
  public static readonly bottomCenter = new Alignment(0, 1);
  /** The bottom-right corner. */
  public static readonly bottomRight = new Alignment(1, 1);
}

/**
 * Flutter's `AlignmentDirectional` — a point resolved against the text direction.
 *
 * **Logical**: `topStart` is the top-left in LTR and the top-*right* in RTL. Use {@link Alignment} for the
 * physical kind.
 */
export class AlignmentDirectional implements AlignmentGeometry {
  /** The position along the inline axis: `-1` leading, `0` centre, `1` trailing. */
  public readonly x: number;
  /** The vertical position: `-1` top, `0` centre, `1` bottom. */
  public readonly y: number;
  /** Always `true`: an `AlignmentDirectional` follows the text direction. */
  public readonly directional = true;

  public constructor(start: number, y: number) {
    this.x = start;
    this.y = y;
  }

  /** The top of the leading edge. */
  public static readonly topStart = new AlignmentDirectional(-1, -1);
  /** The centre of the top edge. */
  public static readonly topCenter = new AlignmentDirectional(0, -1);
  /** The top of the trailing edge. */
  public static readonly topEnd = new AlignmentDirectional(1, -1);
  /** The centre of the leading edge. */
  public static readonly centerStart = new AlignmentDirectional(-1, 0);
  /** The centre. */
  public static readonly center = new AlignmentDirectional(0, 0);
  /** The centre of the trailing edge. */
  public static readonly centerEnd = new AlignmentDirectional(1, 0);
  /** The bottom of the leading edge. */
  public static readonly bottomStart = new AlignmentDirectional(-1, 1);
  /** The centre of the bottom edge. */
  public static readonly bottomCenter = new AlignmentDirectional(0, 1);
  /** The bottom of the trailing edge. */
  public static readonly bottomEnd = new AlignmentDirectional(1, 1);
}

/** The three positions flexbox can place a child at, per axis, as `-1 | 0 | 1`. */
const PHYSICAL_X: Readonly<Record<string, string>> = Object.freeze({
  '-1': 'left',
  '0': 'center',
  '1': 'right',
});

const LOGICAL_X: Readonly<Record<string, string>> = Object.freeze({
  '-1': 'flex-start',
  '0': 'center',
  '1': 'flex-end',
});

const AXIS_Y: Readonly<Record<string, string>> = Object.freeze({
  '-1': 'flex-start',
  '0': 'center',
  '1': 'flex-end',
});

/**
 * The flex declarations that place a single child at `alignment`.
 *
 * Returns a **complete** flex container style: `display`, both alignment properties, and nothing else — a
 * caller composes it with its own sizing (see `constraints.ts`) rather than receiving sizing it did not ask
 * for.
 *
 * The `x` mapping is where physical and directional part company. Physical uses CSS's `left`/`right`, which
 * are direction-independent by definition; directional uses `flex-start`/`flex-end`, which CSS resolves
 * against the container's `direction` exactly as Flutter resolves `start`/`end` against `textDirection`. The
 * `y` mapping is shared: no text direction affects the block axis, in Flutter or in CSS.
 *
 * @param alignment - the point to place the child at.
 * @returns the flex container declarations.
 * @throws RuntimeError - `BRG4008` if either coordinate is not `-1`, `0` or `1`. Flexbox has three positions
 * per axis and Flutter's alignment is continuous; see this file's header on why the fractional case is
 * refused rather than snapped to the nearest keyword.
 */
export function alignmentStyle(alignment: AlignmentGeometry): CSSProperties {
  const { x, y, directional } = alignment;
  const horizontal = (directional ? LOGICAL_X : PHYSICAL_X)[String(x)];
  const vertical = AXIS_Y[String(y)];
  if (horizontal === undefined || vertical === undefined) {
    throw new RuntimeError(
      RuntimeDiagnosticCode.UnrepresentableAlignment,
      `Alignment(${x}, ${y}) is not one of the nine positions CSS flexbox can express. Flutter's alignment ` +
        `is continuous and flexbox has three positions per axis; snapping to the nearest would put the child ` +
        `somewhere the author did not write, with nothing on screen to say so`,
      [`${x}`, `${y}`],
    );
  }
  return { display: 'flex', justifyContent: horizontal, alignItems: vertical };
}

/**
 * Whether {@link alignmentStyle} can express `alignment` — the same test, without the throw.
 *
 * The generator asks this at build time so a fractional alignment is a compile error (`BRG3011`) rather than
 * an exception in a browser. Exported so that test is the *same* test, not a second one that could drift.
 *
 * @param alignment - the point.
 * @returns whether both coordinates are `-1`, `0` or `1`.
 */
export function isRepresentableAlignment(alignment: AlignmentGeometry): boolean {
  const discrete = (value: number): boolean => value === -1 || value === 0 || value === 1;
  return discrete(alignment.x) && discrete(alignment.y);
}

// ── Directionality ────────────────────────────────────────────────────────────────────────────────

/** Props for {@link Directionality}. */
export interface DirectionalityProps {
  /** Which way the inline axis runs. Flutter's `TextDirection`. */
  readonly textDirection: TextDirection;
  /** The subtree the direction applies to. */
  readonly children?: ReactNode;
}

/**
 * Flutter's `Directionality` — sets the text direction for a subtree.
 *
 * A plain `direction` declaration, which is the whole mapping: CSS resolves `flex-start`, `start`, logical
 * margins and text flow against it, exactly as Flutter resolves `AlignmentDirectional`, `EdgeInsetsDirectional`
 * and `TextAlign.start` against `textDirection`. Everything directional in this kit inherits it for free, and
 * everything physical is unaffected — which is the distinction {@link alignmentStyle} exists to preserve.
 *
 * @param props - see {@link DirectionalityProps}.
 * @returns the subtree, in the given direction.
 */
export function Directionality(props: DirectionalityProps): ReactElement {
  return createElement('div', { style: { direction: props.textDirection } }, props.children);
}

// ── The enums, as values ──────────────────────────────────────────────────────────────────────────
//
// Each alignment vocabulary above is a string union — a *type*. Generated code needs the matching **value**,
// and the reason is a fact about real analyzer output rather than a preference: a Dart enum member reaches
// UIR as a `logic.Ref` named `BoxFit.cover`, not as the string `'cover'`. (M4-C established this by running
// the analyzer; before that, every test of the enum path used hand-built UIR carrying `bind.Const 'cover'`,
// which no analyzer has ever produced. The generator's enum tables were being exercised by fixtures only.)
//
// The generator lowers such a reference by importing the type's name from the kit and emitting the member
// access unchanged, which is what keeps `mainAxisAlignment={MainAxisAlignment.spaceBetween}` reading like the
// Dart it came from (ADR-6). That only resolves if the kit exports a value called `MainAxisAlignment`. So it
// does — one frozen object per vocabulary, each member mapping to its own name, so the value and the type
// cannot drift apart.
//
// TypeScript permits a type and a value to share a name, which is why these can be declared beside the unions
// rather than under invented ones.

/** Flutter's `MainAxisAlignment`, as a value. See {@link MainAxisAlignment} for the type. */
export const MainAxisAlignment: Readonly<Record<MainAxisAlignment, MainAxisAlignment>> = Object.freeze({
  start: 'start',
  end: 'end',
  center: 'center',
  spaceBetween: 'spaceBetween',
  spaceAround: 'spaceAround',
  spaceEvenly: 'spaceEvenly',
});

/** Flutter's `CrossAxisAlignment`, as a value. */
export const CrossAxisAlignment: Readonly<Record<CrossAxisAlignment, CrossAxisAlignment>> = Object.freeze({
  start: 'start',
  end: 'end',
  center: 'center',
  stretch: 'stretch',
  baseline: 'baseline',
});

/** Flutter's `MainAxisSize`, as a value. */
export const MainAxisSize: Readonly<Record<MainAxisSize, MainAxisSize>> = Object.freeze({
  min: 'min',
  max: 'max',
});

/** Flutter's `WrapAlignment`, as a value. The same six members as {@link MainAxisAlignment}. */
export const WrapAlignment: Readonly<Record<WrapAlignment, WrapAlignment>> = MainAxisAlignment;

/** Flutter's `WrapCrossAlignment`, as a value. Three members, not five. */
export const WrapCrossAlignment: Readonly<Record<WrapCrossAlignment, WrapCrossAlignment>> = Object.freeze({
  start: 'start',
  end: 'end',
  center: 'center',
});

/** Flutter's `TextAlign`, as a value. */
export const TextAlign: Readonly<Record<TextAlign, TextAlign>> = Object.freeze({
  left: 'left',
  right: 'right',
  center: 'center',
  justify: 'justify',
  start: 'start',
  end: 'end',
});

/** Flutter's `VerticalDirection`, as a value. */
export const VerticalDirection: Readonly<Record<VerticalDirection, VerticalDirection>> = Object.freeze({
  up: 'up',
  down: 'down',
});

/** Flutter's `TextDirection`, as a value. */
export const TextDirection: Readonly<Record<TextDirection, TextDirection>> = Object.freeze({
  ltr: 'ltr',
  rtl: 'rtl',
});
