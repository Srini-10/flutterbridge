// Center, Padding, SizedBox — the single-child layout wrappers, from Flutter's `basic` library.
//
// ## Why `child` is a prop and not React's `children`
//
// `catalog/widgets/material.json` — the single declarative source, and the only place framework metadata is
// allowed to exist (ADR-18) — names the slot for every one of these:
//
//     { "name": "Center",  "slots": ["child"] }
//     { "name": "Padding", "slots": ["child"] }
//     { "name": "SizedBox", "slots": ["child"], "transparentWithoutProps": ["width", "height"] }
//
// against `"childrenProp": "children"` for `Column` and `Row`. The catalog draws the line between one child
// and many; renaming `child` to `children` on the way through would erase a distinction the project's own
// source of truth makes, and would put the generator in the business of translating slot names it was
// handed. So a slot called `child` is a prop called `child`.
//
// The catalog is also emphatic about why `Center` is a component at all rather than a `Container` with
// props: "Wrappers whose identity IS their behaviour: no `transparentWithoutProps`, so they are never
// flattened. A `Center` with no props still centres. Guessing that a prop-less widget must be a pass-through
// is how a compiler silently deletes a layout."
//
// ## How a number becomes a length
//
// Flutter measures in logical pixels and CSS's `px` *is* a logical pixel — both are density-independent,
// both are multiplied by the device pixel ratio at paint. So there is no conversion, and these hand React a
// bare number: React appends `px` to numeric values for dimensional properties, `padding-*`, `width` and
// `height` among them. Writing `` `${n}px` `` would be the same string by a longer road.
//
// ## What these do not do
//
// They map props to style. They do not solve constraints, and Flutter's wrappers do:
//
// - `Padding` sizes itself to child-plus-padding. A block-level `<div>` fills its inline axis instead.
// - `SizedBox` forces a *tight* constraint on its child — `SizedBox(height: 8)` is exactly 8, and a Flutter
//   layout that cannot afford it overflows loudly. Its `<div>` is a flex item with the default
//   `flex-shrink: 1`, so an overflowing parent quietly compresses it instead. The fix, `flex-shrink: 0`, is
//   not written here on purpose: `flex-shrink` only means anything relative to a parent flex container's
//   main axis, and a component that cannot see its parent cannot know which axis that is. Reasoning about
//   the parent is what `layout/constraints.ts` maps and its header bounds.
//
// ## Where the style comes from
//
// Nothing here writes a CSS keyword. Sizing goes through `layout/constraints.ts` and placement through
// `layout/alignment.ts`, so `Center` and `Align` cannot disagree about what "centre" is, and `SizedBox` and
// `Container` cannot disagree about what `double.infinity` becomes. That is the whole reason those modules
// exist; a widget file that reaches for a keyword directly is a widget file with a bug waiting in it.

import { createElement, type ReactElement, type ReactNode } from 'react';

import { Alignment, alignmentStyle, type AlignmentGeometry } from '../layout/alignment.js';
import { useThemeSurface } from '../react/theme.js';
import {
  FILL,
  aspectRatioStyle,
  constraintStyle,
  edgeInsetsStyle,
  fractionStyle,
  intrinsicStyle,
  mergeStyles,
  overflowBoxStyle,
  safeAreaStyle,
  sizeStyle,
  type BoxConstraintsOptions,
} from '../layout/constraints.js';
import {
  BorderRadius,
  clipStyle,
  decorationStyle,
  type BorderRadiusGeometry,
  type BoxDecorationOptions,
  type Clip,
  type ColorToken,
} from '../layout/decoration.js';
import type { EdgeInsets } from '../layout/edge_insets.js';

/** Props for {@link Align}. */
export interface AlignProps {
  /**
   * Where to place the child. Defaults to {@link Alignment.center}, as in Flutter.
   *
   * Flutter's `Align` accepts a continuous position; this kit expresses the nine named ones exactly and
   * raises `BRG4008` for any other, rather than snapping to the nearest. See `layout/alignment.ts`.
   */
  readonly alignment?: AlignmentGeometry;
  /** The widget to place. Flutter's `child` slot, per the catalog. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `Align` — places its child at a point within itself.
 *
 * Expands to fill its constraints, as Flutter's does when given no `widthFactor`/`heightFactor`: an `Align`
 * that shrink-wrapped would be placing its child within exactly the child, which is to say not placing it.
 *
 * `widthFactor`/`heightFactor` — which size the `Align` to a multiple of its *child's* measured size — are
 * not props here. They need the child's size, which is a layout read rather than a style, and the generator
 * refuses them rather than dropping them silently.
 *
 * @param props - see {@link AlignProps}.
 * @returns the child, placed.
 *
 * @example
 * ```ts
 * // Align(alignment: Alignment.bottomRight, child: fab)
 * createElement(Align, { alignment: Alignment.bottomRight, child: fab });
 * ```
 */
export function Align(props: AlignProps): ReactElement {
  const style = mergeStyles(alignmentStyle(props.alignment ?? Alignment.center), FILL);
  return createElement('div', { style }, props.child);
}

/** Props for {@link Center}. */
export interface CenterProps {
  /** The widget to centre. Flutter's `child` slot, per the catalog. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `Center` — centres its child on both axes.
 *
 * `Center extends Align` in Flutter, and it does here: the same call with the alignment fixed. Restating the
 * centring declarations would be a second place for "centre" to be defined, and the second place is the one
 * that goes stale.
 *
 * Takes no props but its child, and is still not a pass-through: see this file's header on the catalog's
 * `transparentWithoutProps`, and on what happens to a layout when a compiler assumes otherwise.
 *
 * @param props - see {@link CenterProps}.
 * @returns the child, centred.
 *
 * @example
 * ```ts
 * // Center(child: Text('hello'))
 * createElement(Center, { child: createElement(Text, null, 'hello') });
 * ```
 */
export function Center(props: CenterProps): ReactElement {
  return Align({ alignment: Alignment.center, child: props.child });
}

/** Props for {@link Padding}. */
export interface PaddingProps {
  /**
   * The insets. Required, as in Flutter — a `Padding` with no padding is a widget that does nothing, and
   * Flutter makes you say `EdgeInsets.zero` if that is genuinely what you meant.
   */
  readonly padding: EdgeInsets;
  /** The widget to inset. Flutter's `child` slot, per the catalog. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `Padding` — insets its child by {@link EdgeInsets}.
 *
 * All four longhands are always set, including the zeroes. `EdgeInsets.only({ top: 8 })` says the other
 * three sides are zero, and it has to say so in the style: an omitted `padding-left` is not zero, it is
 * whatever a stylesheet says, and a converted screen picking up a host app's `padding` is a layout Flutter
 * never rendered. (The CSSOM may serialise the four back as the `padding` shorthand — `padding: 8px 0px 0px`
 * — which is the same declaration by a shorter name. What matters is that all four are stated, not how they
 * are spelled.)
 *
 * @param props - see {@link PaddingProps}.
 * @returns the child, inset.
 *
 * @example
 * ```ts
 * // Padding(padding: EdgeInsets.all(16), child: Text('hello'))
 * createElement(Padding, { padding: EdgeInsets.all(16), child: createElement(Text, null, 'hello') });
 * ```
 */
export function Padding(props: PaddingProps): ReactElement {
  return createElement('div', { style: edgeInsetsStyle(props.padding, 'padding') }, props.child);
}

/** Props for {@link SizedBox}. */
export interface SizedBoxProps {
  /** The width, in logical pixels, or `Infinity` for Flutter's `double.infinity`. Omitted: unconstrained. */
  readonly width?: number;
  /** The height, in logical pixels, or `Infinity` for Flutter's `double.infinity`. Omitted: unconstrained. */
  readonly height?: number;
  /** The widget to size. Flutter's `child` slot, per the catalog. Omitted, this is a gap. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `SizedBox` — a box of a given size, with or without a child.
 *
 * An omitted dimension emits no declaration at all rather than `auto`: the catalog lists `width` and
 * `height` in `SizedBox`'s `transparentWithoutProps`, so a `SizedBox` with neither is a widget the compiler
 * is entitled to delete, and one that emitted `width: auto` would have overridden an inherited width on its
 * way to being nothing.
 *
 * @param props - see {@link SizedBoxProps}.
 * @returns the sized box.
 *
 * @example
 * ```ts
 * createElement(SizedBox, { height: 8 });                        // SizedBox(height: 8) — a gap
 * createElement(SizedBox, { width: Infinity, child: button });   // SizedBox(width: double.infinity, ...)
 * ```
 */
export function SizedBox(props: SizedBoxProps): ReactElement {
  // `sizeStyle` assigns in a fixed order, so two boxes with the same props produce the same declaration order
  // and the same `style` attribute — which is what the determinism test actually compares.
  return createElement('div', { style: sizeStyle(props.width, props.height) }, props.child);
}

/** Props for {@link ConstrainedBox}. */
export interface ConstrainedBoxProps {
  /** The limits to impose. Flutter's `BoxConstraints`; an omitted side is unconstrained. */
  readonly constraints: BoxConstraintsOptions;
  /** The widget to constrain. Flutter's `child` slot, per the catalog. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `ConstrainedBox` — imposes size limits on its child.
 *
 * The most direct expression of the box protocol there is: four numbers in, four CSS longhands out. See
 * {@link constraintStyle} for why an omitted maximum emits nothing while a stated `minWidth: 0` emits `0`.
 *
 * @param props - see {@link ConstrainedBoxProps}.
 * @returns the constrained child.
 *
 * @example
 * ```ts
 * // ConstrainedBox(constraints: BoxConstraints(maxWidth: 400), child: body)
 * createElement(ConstrainedBox, { constraints: { maxWidth: 400 }, child: body });
 * ```
 */
export function ConstrainedBox(props: ConstrainedBoxProps): ReactElement {
  return createElement('div', { style: constraintStyle(props.constraints) }, props.child);
}

/** Props for {@link AspectRatio}. */
export interface AspectRatioProps {
  /** Width ÷ height. Flutter's `aspectRatio`; `16 / 9` is a widescreen box. */
  readonly aspectRatio: number;
  /** The widget to size. Flutter's `child` slot, per the catalog. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `AspectRatio` — sizes its child to a width ÷ height ratio.
 *
 * One of the few exact mappings in the constraint model: CSS's `aspect-ratio` takes the same quotient and
 * resolves it against whichever dimension is constrained, exactly as Flutter's does.
 *
 * @param props - see {@link AspectRatioProps}.
 * @returns the child, at the ratio.
 */
export function AspectRatio(props: AspectRatioProps): ReactElement {
  return createElement('div', { style: aspectRatioStyle(props.aspectRatio) }, props.child);
}

/** Props for {@link FractionallySizedBox}. */
export interface FractionallySizedBoxProps {
  /** The fraction of the parent's width to take. `0.5` is half. Omitted: the child's own width. */
  readonly widthFactor?: number;
  /** The fraction of the parent's height to take. Omitted: the child's own height. */
  readonly heightFactor?: number;
  /** The widget to size. Flutter's `child` slot, per the catalog. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `FractionallySizedBox` — sizes its child to a fraction of the available space.
 *
 * @param props - see {@link FractionallySizedBoxProps}.
 * @returns the fractionally sized child.
 */
export function FractionallySizedBox(props: FractionallySizedBoxProps): ReactElement {
  return createElement(
    'div',
    { style: fractionStyle(props.widthFactor, props.heightFactor) },
    props.child,
  );
}

/** Props for {@link SafeArea}. Flutter's `SafeArea`, one boolean per edge. */
export interface SafeAreaProps {
  /** Whether to inset the top edge. Defaults to `true`, as in Flutter. */
  readonly top?: boolean;
  /** Whether to inset the trailing edge. Defaults to `true`, as in Flutter. */
  readonly right?: boolean;
  /** Whether to inset the bottom edge. Defaults to `true`, as in Flutter. */
  readonly bottom?: boolean;
  /** Whether to inset the leading edge. Defaults to `true`, as in Flutter. */
  readonly left?: boolean;
  /** The widget to keep clear of the cutout. Flutter's `child` slot, per the catalog. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `SafeArea` — insets its child clear of the display's cutouts.
 *
 * Reads the browser's `env(safe-area-inset-*)`, which is the same OS-supplied measurement Flutter's
 * `MediaQuery.padding` reads. See {@link safeAreaStyle} for the viewport-meta requirement that makes it
 * report anything at all.
 *
 * @param props - see {@link SafeAreaProps}.
 * @returns the inset child.
 */
export function SafeArea(props: SafeAreaProps): ReactElement {
  // `props` is passed whole rather than rebuilt side by side: under `exactOptionalPropertyTypes` an omitted
  // `top` and an explicit `top: undefined` are different types, and copying the four fields turns the first
  // into the second. `safeAreaStyle` reads exactly the four it names and ignores `child`.
  return createElement('div', { style: safeAreaStyle(props) }, props.child);
}

/** Props for {@link Opacity}. */
export interface OpacityProps {
  /** How opaque the child is, `0.0`–`1.0`. Required, as in Flutter. */
  readonly opacity: number;
  /** The widget to fade. Flutter's `child` slot, per the catalog. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `Opacity` — paints its child at a fraction of full opacity.
 *
 * CSS `opacity` is the same operation on the same compositing model: the subtree is rendered to a layer and
 * that layer is blended. Both share the consequence, which is why Flutter's documentation warns about the
 * widget and CSS's does not need to — a non-`1.0` opacity forces a separate layer for the whole subtree.
 *
 * @param props - see {@link OpacityProps}.
 * @returns the child, faded.
 */
export function Opacity(props: OpacityProps): ReactElement {
  return createElement('div', { style: { opacity: props.opacity } }, props.child);
}

/** Props for {@link Container}. Flutter's `Container` — the composite of most of this file. */
export interface ContainerProps {
  /** An explicit width, or `Infinity` for `double.infinity`. */
  readonly width?: number;
  /** An explicit height, or `Infinity` for `double.infinity`. */
  readonly height?: number;
  /** Insets *inside* the box, between its edge and the child. */
  readonly padding?: EdgeInsets;
  /** Insets *outside* the box, between it and its siblings. */
  readonly margin?: EdgeInsets;
  /** Additional size limits. Flutter's `constraints`. */
  readonly constraints?: BoxConstraintsOptions;
  /** Where the child sits within the box. Setting it makes the container expand, as in Flutter. */
  readonly alignment?: AlignmentGeometry;
  /** The token holding the background colour. Flutter's `color` (INV-20: a token name, not a value). */
  readonly color?: ColorToken;
  /** What to paint behind the child. Flutter's `decoration`. */
  readonly decoration?: BoxDecorationOptions;
  /** The content. Flutter's `child` slot, per the catalog. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `Container` — the convenience widget that is several widgets at once.
 *
 * Flutter builds it by *composition*: a `Container` with padding and alignment is a `Padding` wrapping an
 * `Align`, and its documentation says so. This does the same job by **merging style fragments onto one
 * element** rather than nesting one `<div>` per concern, and the difference matters: each extra box would
 * change what a percentage resolves against, so a nested `width: 100%` would mean something different from
 * the one Flutter computes.
 *
 * The fragments are the same helpers every other widget here uses, in a fixed order — which is what makes a
 * `Container(padding:)` and a `Padding` produce identical declarations rather than merely similar ones.
 *
 * Two of Flutter's parameters are absent rather than approximated. `decoration` carries borders, gradients
 * and shadows and is a value type of its own; `transform` takes a `Matrix4`. Neither is dropped silently —
 * the generator forwards neither, so a `Container` that uses one is reported rather than rendered flat.
 *
 * @param props - see {@link ContainerProps}.
 * @returns the container.
 * @throws RuntimeError - `BRG4006` if `color` names a token the theme does not define.
 */
export function Container(props: ContainerProps): ReactElement {
  const theme = useThemeSurface();
  const style = mergeStyles(
    // Alignment first: it contributes `display: flex`, and a later fragment's explicit size must win over
    // the fill that alignment implies.
    props.alignment === undefined ? undefined : alignmentStyle(props.alignment),
    props.alignment === undefined ? undefined : FILL,
    props.padding === undefined ? undefined : edgeInsetsStyle(props.padding, 'padding'),
    props.margin === undefined ? undefined : edgeInsetsStyle(props.margin, 'margin'),
    props.constraints === undefined ? undefined : constraintStyle(props.constraints),
    sizeStyle(props.width, props.height),
    // A `Container` takes `color` *or* `decoration`, never both — Flutter asserts on it — so the two compose
    // through the same decoration path rather than through two branches that could disagree.
    props.decoration === undefined
      ? props.color === undefined
        ? undefined
        : decorationStyle({ color: props.color }, (token) => theme.color(token))
      : decorationStyle(props.decoration, (token) => theme.color(token)),
  );
  return createElement('div', { style }, props.child);
}

// ── Clipping and decoration ───────────────────────────────────────────────────────────────────────

/** Props for {@link ClipRect}. */
export interface ClipRectProps {
  /** How to clip. Defaults to `hardEdge`, as in Flutter's `ClipRect`. `none` disables clipping. */
  readonly clipBehavior?: Clip;
  /** The widget to clip. Flutter's `child` slot, per the catalog. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `ClipRect` — clips its child to its own bounds.
 *
 * `overflow: hidden`, which is exact: both clip to the box, and the browser's anti-aliasing is the browser's
 * to choose. See {@link Clip} on why four Flutter values become two CSS states.
 *
 * @param props - see {@link ClipRectProps}.
 * @returns the clipped child.
 */
export function ClipRect(props: ClipRectProps): ReactElement {
  return createElement('div', { style: clipStyle(undefined, props.clipBehavior) }, props.child);
}

/** Props for {@link ClipRRect}. */
export interface ClipRRectProps {
  /** The corner radii. Defaults to {@link BorderRadius.zero}, as in Flutter. */
  readonly borderRadius?: BorderRadiusGeometry;
  /** How to clip. Defaults to `antiAlias`, as in Flutter's `ClipRRect`. */
  readonly clipBehavior?: Clip;
  /** The widget to clip. Flutter's `child` slot, per the catalog. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `ClipRRect` — clips its child to a rounded rectangle.
 *
 * The most common clip in real Flutter code (13 uses in the M0 corpus), and one of the exact mappings: CSS
 * clips to the padding box *after* applying `border-radius`, which is the same rounded rectangle Flutter
 * clips to.
 *
 * @param props - see {@link ClipRRectProps}.
 * @returns the clipped child.
 */
export function ClipRRect(props: ClipRRectProps): ReactElement {
  const radius = props.borderRadius ?? BorderRadius.zero;
  return createElement('div', { style: clipStyle(radius, props.clipBehavior) }, props.child);
}

/** Props for {@link DecoratedBox}. */
export interface DecoratedBoxProps {
  /** What to paint. Required, as in Flutter — a `DecoratedBox` with no decoration decorates nothing. */
  readonly decoration: BoxDecorationOptions;
  /** The widget to decorate. Flutter's `child` slot, per the catalog. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `DecoratedBox` — paints a decoration behind (or in front of) its child.
 *
 * `position: DecorationPosition.foreground` is not a prop. It paints the decoration *over* the child, which
 * in CSS needs a pseudo-element or a second stacking layer; the generator refuses it rather than painting it
 * behind and producing a box that looks right until something overlaps.
 *
 * @param props - see {@link DecoratedBoxProps}.
 * @returns the decorated child.
 * @throws RuntimeError - `BRG4006` if the decoration names a role the theme does not define.
 */
export function DecoratedBox(props: DecoratedBoxProps): ReactElement {
  const theme = useThemeSurface();
  return createElement(
    'div',
    { style: decorationStyle(props.decoration, (role) => theme.color(role)) },
    props.child,
  );
}

/** Props for {@link ColoredBox}. */
export interface ColoredBoxProps {
  /** The token holding the fill colour. Flutter's `color` (INV-20: a token name, not a value). */
  readonly color: ColorToken;
  /** The widget to paint behind. Flutter's `child` slot, per the catalog. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `ColoredBox` — fills its bounds with one colour.
 *
 * `DecoratedBox` with a colour and nothing else, which is exactly what Flutter's documentation calls it: a
 * cheaper `DecoratedBox` for the common case. It delegates rather than restating the fill, so the two cannot
 * disagree about what a role resolves to.
 *
 * @param props - see {@link ColoredBoxProps}.
 * @returns the filled box.
 * @throws RuntimeError - `BRG4006` if `color` names a token the theme does not define.
 */
export function ColoredBox(props: ColoredBoxProps): ReactElement {
  return DecoratedBox({ decoration: { color: props.color }, child: props.child });
}

// ── M4-G: the intrinsic-sizing pair, and the box that ignores its constraints ──────────────────────

/** Props for {@link IntrinsicWidth}. */
export interface IntrinsicWidthProps {
  /** What is being sized. Flutter's `child` slot. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `IntrinsicWidth` — sizes to the child's maximum intrinsic width.
 *
 * `width: max-content`. CSS's `max-content` and Flutter's `computeMaxIntrinsicWidth` are the same definition
 * — the width the subtree takes given unbounded space — so this is a mapping rather than an approximation.
 * See `layout/constraints.ts`'s {@link intrinsicStyle} for why M4-D refused this and M4-G does not, and for
 * exactly where it still diverges.
 *
 * `stepWidth` is not a prop: it rounds the intrinsic up to a multiple, CSS has no expression for that, and
 * the generator refuses an `IntrinsicWidth` that sets one rather than dropping it here.
 *
 * @param props - see {@link IntrinsicWidthProps}.
 * @returns the sized child.
 */
export function IntrinsicWidth(props: IntrinsicWidthProps): ReactElement {
  return createElement('div', { style: intrinsicStyle('width') }, props.child);
}

/** Props for {@link IntrinsicHeight}. */
export interface IntrinsicHeightProps {
  /** What is being sized. Flutter's `child` slot. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `IntrinsicHeight` — sizes to the child's maximum intrinsic height.
 *
 * `height: max-content`, for the reason {@link IntrinsicWidth} gives.
 *
 * Its commonest use in real Flutter is equalising the heights of a `Row`'s children, and that is the case
 * where the mapping is weakest: CSS sizes the *box*, and the row's children then stretch only if the row says
 * `CrossAxisAlignment.stretch`. `layout/constraints.ts` states the divergence in full.
 *
 * @param props - see {@link IntrinsicHeightProps}.
 * @returns the sized child.
 */
export function IntrinsicHeight(props: IntrinsicHeightProps): ReactElement {
  return createElement('div', { style: intrinsicStyle('height') }, props.child);
}

/** Props for {@link OverflowBox}. */
export interface OverflowBoxProps {
  /** The smallest width to give the child. Flutter's `minWidth`. */
  readonly minWidth?: number;
  /** The largest width to give the child. Flutter's `maxWidth`. */
  readonly maxWidth?: number;
  /** The smallest height to give the child. Flutter's `minHeight`. */
  readonly minHeight?: number;
  /** The largest height to give the child. Flutter's `maxHeight`. */
  readonly maxHeight?: number;
  /** Where the child sits within the box. Flutter's `alignment`, defaulting to `Alignment.center`. */
  readonly alignment?: AlignmentGeometry;
  /** The child. Flutter's `child` slot. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `OverflowBox` — imposes different constraints on its child than it received, and lets the child
 * paint outside its bounds.
 *
 * The box takes the size *its* parent gave it and is not sized by the child; the child is laid out against
 * the constraints given here. Both facts are `position: absolute` on the child, which is what removes it from
 * the parent's size calculation — see `layout/constraints.ts`'s {@link overflowBoxStyle}.
 *
 * @param props - see {@link OverflowBoxProps}.
 * @returns the box.
 */
export function OverflowBox(props: OverflowBoxProps): ReactElement {
  const constraints = {
    ...(props.minWidth === undefined ? {} : { minWidth: props.minWidth }),
    ...(props.maxWidth === undefined ? {} : { maxWidth: props.maxWidth }),
    ...(props.minHeight === undefined ? {} : { minHeight: props.minHeight }),
    ...(props.maxHeight === undefined ? {} : { maxHeight: props.maxHeight }),
  };
  const { box, child } = overflowBoxStyle(constraints);
  return createElement(
    'div',
    { style: box },
    createElement(
      'div',
      { style: mergeStyles(child, alignmentStyle(props.alignment ?? Alignment.center)) },
      props.child,
    ),
  );
}
