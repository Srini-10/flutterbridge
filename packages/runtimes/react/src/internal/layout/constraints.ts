// The constraint model — Flutter's box protocol, expressed in CSS once.
//
// ## What Flutter does, and what CSS does instead
//
// Flutter lays out in one pass: *constraints go down, sizes come up, the parent sets the position*. A parent
// hands its child a `BoxConstraints` — four numbers, `minWidth`/`maxWidth`/`minHeight`/`maxHeight` — and the
// child returns a size within them. Every layout widget in the framework is a function on those four numbers.
//
// CSS has no such object. It has `width`/`min-width`/`max-width` on the element itself, resolved lazily
// against a containing block, in a model where a child can affect its parent's size and often does. The two
// are not the same algorithm and this file does not pretend otherwise. What it *does* is state the mapping
// once, so that the ten widgets the milestone names — `Container`, `Align`, `AspectRatio`,
// `FractionallySizedBox`, `ConstrainedBox`, `SizedBox`, `FittedBox`, `Center`, `Padding`, `SafeArea` — share
// one answer instead of arriving with ten.
//
// ## The three mappings that are exact
//
// - **`BoxConstraints` → the four CSS longhands.** Same four numbers, same meaning. The only translation is
//   at the ends: Flutter's `double.infinity` maximum is CSS's `none`, and Flutter's `0` minimum has to be
//   *written* rather than left out (see {@link constraintStyle}).
// - **`AspectRatio` → `aspect-ratio`.** CSS took this from the same place Flutter did; `AspectRatio(aspectRatio:
//   16 / 9)` is `aspect-ratio: 1.7777…`, and both mean width ÷ height.
// - **`EdgeInsets` → the four padding or margin longhands.** Logical pixels are CSS pixels (see
//   {@link edgeInsetsStyle}).
//
// ## The two that degrade, named at the point they degrade
//
// - **`double.infinity` as a *size*** — `SizedBox(width: double.infinity)`, the idiom for "fill the incoming
//   constraint" — becomes `100%`, which resolves against the parent rather than against a constraint that
//   was handed down. Under an auto-sized ancestor the two disagree: Flutter throws on an unbounded
//   constraint, and `100%` quietly computes to `auto`. {@link extent} is the one place that conversion
//   happens.
// - **`FittedBox` over arbitrary content.** Scaling a subtree to fit needs the child's *measured* size, which
//   is a layout read, not a style. CSS `object-fit` does it exactly — but only for replaced elements
//   (`<img>`, `<video>`), which is why {@link objectFit} exists and is used by `Image` rather than by a
//   general `FittedBox`. A `FittedBox` around a `Column` has no styling answer, and is not given a wrong one.
//
// ## Why the helpers return `CSSProperties` rather than applying themselves
//
// A widget composes several: `Container` is insets *and* constraints *and* alignment *and* decoration, and it
// must merge them into one `style` on one element rather than nesting four `<div>`s (which would change what
// a percentage resolves against, and put three extra nodes in every tree). So each helper returns a fragment,
// and the widget spreads them in a fixed order. {@link mergeStyles} is that spread, with the key order pinned
// so the emitted `style` attribute is byte-stable — which is what the determinism tests compare.

import type { CSSProperties } from 'react';

import type { EdgeInsets } from './edge_insets.js';

/**
 * A dimension → a CSS length.
 *
 * `double.infinity` is the reason this is a function. It is ordinary Flutter — `SizedBox(width:
 * double.infinity)` is *the* idiom for "fill the incoming constraint" — and it reaches JavaScript as
 * `Infinity`, which templates into the string `Infinitypx`. The browser drops that as an invalid declaration
 * and renders the box at its natural size: no error, no warning, a box that fills in Flutter and hugs its
 * content on the web. `100%` is the same degradable "fill the constraint" that `MainAxisSize.max` maps to,
 * and it is the same answer for the same reason.
 *
 * Finite values pass through as bare numbers: Flutter measures in logical pixels and CSS's `px` *is* a
 * logical pixel — both density-independent, both multiplied by the device pixel ratio at paint — and React
 * appends `px` to numeric values for dimensional properties. Writing `` `${n}px` `` would be the same string
 * by a longer road.
 *
 * @param value - the dimension, in logical pixels, or `Infinity`.
 * @returns a CSS length.
 */
export function extent(value: number): NonNullable<CSSProperties['width']> {
  return Number.isFinite(value) ? value : '100%';
}

/**
 * A box's size limits — the runtime form of Flutter's `BoxConstraints`.
 *
 * Every field is optional and an omitted one means *unconstrained on that side*, which is Flutter's own
 * default (`minWidth: 0`, `maxWidth: double.infinity`, and likewise for height). Passing `Infinity` for a
 * maximum is the same as omitting it.
 */
export interface BoxConstraintsOptions {
  /** The smallest width the box may be. Flutter's default is `0`. */
  readonly minWidth?: number;
  /** The largest width the box may be. Flutter's default is `double.infinity`. */
  readonly maxWidth?: number;
  /** The smallest height the box may be. Flutter's default is `0`. */
  readonly minHeight?: number;
  /** The largest height the box may be. Flutter's default is `double.infinity`. */
  readonly maxHeight?: number;
}

/**
 * Flutter's `BoxConstraints` — the four numbers the box protocol passes down.
 *
 * A class taking an **options object**, because that is the shape `BoxConstraints(maxWidth: 400)` lowers to:
 * Dart's named parameters become one object argument, which is the kit's convention for every value type it
 * mirrors (`EdgeInsets.symmetric({ vertical: 8 })` is the same rule). The generator applies it automatically
 * for any type whose library is `package:flutter/…`, so a kit value type added later needs no emitter change.
 *
 * Every field is carried through as given, `undefined` included, so {@link constraintStyle} can tell "not
 * constrained" from "constrained to zero" — a distinction CSS needs and Flutter's defaults hide.
 *
 * @example
 * ```ts
 * // BoxConstraints(maxWidth: 400)
 * new BoxConstraints({ maxWidth: 400 });
 * ```
 */
export class BoxConstraints implements BoxConstraintsOptions {
  /** The smallest width the box may be. */
  public readonly minWidth?: number;
  /** The largest width the box may be. */
  public readonly maxWidth?: number;
  /** The smallest height the box may be. */
  public readonly minHeight?: number;
  /** The largest height the box may be. */
  public readonly maxHeight?: number;

  public constructor(options: BoxConstraintsOptions = {}) {
    // Assigned conditionally rather than unconditionally: under `exactOptionalPropertyTypes` an explicit
    // `undefined` is not the same as an absent field, and `constraintStyle` reads absence as "unconstrained".
    if (options.minWidth !== undefined) this.minWidth = options.minWidth;
    if (options.maxWidth !== undefined) this.maxWidth = options.maxWidth;
    if (options.minHeight !== undefined) this.minHeight = options.minHeight;
    if (options.maxHeight !== undefined) this.maxHeight = options.maxHeight;
  }

  /** A box that must be exactly `width` × `height` — Flutter's `BoxConstraints.tight`. */
  public static tight(size: { readonly width: number; readonly height: number }): BoxConstraints {
    return new BoxConstraints({
      minWidth: size.width,
      maxWidth: size.width,
      minHeight: size.height,
      maxHeight: size.height,
    });
  }

  /** A box no larger than `width` × `height` — Flutter's `BoxConstraints.loose`. */
  public static loose(size: { readonly width: number; readonly height: number }): BoxConstraints {
    return new BoxConstraints({ maxWidth: size.width, maxHeight: size.height });
  }
}

/**
 * `BoxConstraints` → the four CSS size longhands.
 *
 * Declarations are emitted **only for the sides the constraints actually name**. An omitted `maxWidth` emits
 * nothing rather than `max-width: none`, because `none` is a real declaration that would override an
 * inherited one — and a converted screen picking up a host stylesheet's limits is a layout Flutter never
 * rendered, while a converted screen *clearing* them is one the author never wrote.
 *
 * The one asymmetry is the minimum. Flutter's default minimum is `0`; CSS's default `min-width` is `auto`,
 * which for a flex item means *the content's min-content size* — so a long word refuses to shrink and
 * overflows its row, where Flutter would have clipped. A stated `minWidth: 0` is therefore emitted as `0`,
 * not skipped as a no-op, because it is not a no-op: it is the single most common flexbox surprise there is,
 * and this is where it gets corrected for every widget at once.
 *
 * @param constraints - the limits.
 * @returns the size declarations.
 */
export function constraintStyle(constraints: BoxConstraintsOptions): CSSProperties {
  const style: CSSProperties = {};
  if (constraints.minWidth !== undefined) style.minWidth = constraints.minWidth;
  if (constraints.maxWidth !== undefined && Number.isFinite(constraints.maxWidth)) {
    style.maxWidth = constraints.maxWidth;
  }
  if (constraints.minHeight !== undefined) style.minHeight = constraints.minHeight;
  if (constraints.maxHeight !== undefined && Number.isFinite(constraints.maxHeight)) {
    style.maxHeight = constraints.maxHeight;
  }
  return style;
}

/**
 * An explicit size — the `width`/`height` half of what `SizedBox` and `Container` do.
 *
 * An omitted dimension emits no declaration at all rather than `auto`: `auto` is a real declaration that
 * overrides an inherited width on its way to meaning nothing, and the catalog lists `width`/`height` in
 * `SizedBox`'s `transparentWithoutProps`, so a box with neither is a widget the compiler may delete outright.
 *
 * @param width - the width, in logical pixels, or `Infinity`. Omitted: unconstrained.
 * @param height - the height, in logical pixels, or `Infinity`. Omitted: unconstrained.
 * @returns the size declarations.
 */
export function sizeStyle(width: number | undefined, height: number | undefined): CSSProperties {
  const style: CSSProperties = {};
  if (width !== undefined) style.width = extent(width);
  if (height !== undefined) style.height = extent(height);
  return style;
}

/**
 * The style that fills the incoming constraint on both axes.
 *
 * Flutter's `Align`, `Center` and a `Container` with no size all *expand* to their constraints rather than
 * shrink-wrapping — a `Center` that shrink-wrapped would be centring its child within exactly the child,
 * which is to say not centring it. Frozen and shared: it varies with nothing, so one object is the whole
 * extent of "same props → same style" for every widget that fills (ADR-15 forbids module-scope *state*; a
 * frozen table is not state).
 *
 * Carries the same `100%`-against-an-auto-ancestor degradation {@link extent} documents.
 */
export const FILL: CSSProperties = Object.freeze({ width: '100%', height: '100%' });

/**
 * `EdgeInsets` → four CSS longhands, as padding or as margin.
 *
 * **All four are always set, including the zeroes.** `EdgeInsets.only({ top: 8 })` says the other three sides
 * are zero, and it has to say so in the style: an omitted `padding-left` is not zero, it is whatever a
 * stylesheet says, and a converted screen picking up a host app's padding is a layout Flutter never rendered.
 * (The CSSOM may serialise the four back as the shorthand — `padding: 8px 0px 0px` — which is the same
 * declaration by a shorter name. What matters is that all four are stated, not how they are spelled.)
 *
 * @param insets - the offsets, in logical pixels.
 * @param property - which box property to write. `Padding` insets inside its own box; `Container`'s `margin`
 * insets outside it, and the two are different declarations of the same four numbers.
 * @returns the four longhands.
 */
export function edgeInsetsStyle(insets: EdgeInsets, property: 'padding' | 'margin'): CSSProperties {
  return property === 'padding'
    ? {
        paddingTop: insets.top,
        paddingRight: insets.right,
        paddingBottom: insets.bottom,
        paddingLeft: insets.left,
      }
    : {
        marginTop: insets.top,
        marginRight: insets.right,
        marginBottom: insets.bottom,
        marginLeft: insets.left,
      };
}

/**
 * `AspectRatio` → CSS `aspect-ratio`.
 *
 * Exact, and one of the few places it is: both take width ÷ height, and both resolve it against whichever
 * dimension is constrained. `AspectRatio(aspectRatio: 16 / 9)` and `aspect-ratio: 1.7778` describe the same
 * box.
 *
 * A non-finite or non-positive ratio emits nothing. Flutter asserts on one (`aspectRatio > 0.0` is a
 * precondition), and a `0` or `NaN` reaching CSS would be an invalid declaration the browser drops silently —
 * so this drops it explicitly rather than emitting something that only looks like a constraint.
 *
 * @param ratio - width ÷ height.
 * @returns the `aspect-ratio` declaration, or nothing.
 */
export function aspectRatioStyle(ratio: number): CSSProperties {
  if (!Number.isFinite(ratio) || ratio <= 0) return {};
  return { aspectRatio: String(ratio) };
}

/**
 * `FractionallySizedBox`'s factors → percentage sizes.
 *
 * Flutter multiplies the *incoming maximum constraint* by the factor and hands the child a tight constraint
 * of that size. CSS resolves a percentage against the containing block's content box. These agree whenever
 * the parent has a definite size, which is the case the widget is used in; they part company under an
 * auto-sized parent, where Flutter's constraint is still infinite and CSS's percentage falls back to `auto` —
 * the same divergence {@link extent} carries, from the same cause.
 *
 * @param widthFactor - the fraction of the parent's width. Omitted: the child's own width.
 * @param heightFactor - the fraction of the parent's height. Omitted: the child's own height.
 * @returns the size declarations.
 */
export function fractionStyle(
  widthFactor: number | undefined,
  heightFactor: number | undefined,
): CSSProperties {
  const style: CSSProperties = {};
  if (widthFactor !== undefined) style.width = `${widthFactor * 100}%`;
  if (heightFactor !== undefined) style.height = `${heightFactor * 100}%`;
  return style;
}

/** How a replaced element's content fills its box — Flutter's `BoxFit`. */
export type BoxFit = 'fill' | 'contain' | 'cover' | 'fitWidth' | 'fitHeight' | 'none' | 'scaleDown';

/**
 * `BoxFit` → `object-fit`. Total, so a new enum member cannot be silently dropped.
 *
 * Five of the seven are exact renames. The two that are not:
 *
 * - **`fitWidth`/`fitHeight`** have no `object-fit` keyword. Flutter scales until *that one* axis matches and
 *   lets the other overflow; CSS's nearest is `cover`, which scales until *both* are covered — the same
 *   result whenever the overflowing axis is the one `cover` would have chosen, and a different crop when it
 *   is not. They map to `cover` with that caveat rather than to `contain`, because `contain` would letterbox
 *   where Flutter overflows, which is visibly a different image rather than a differently-cropped one.
 * - **`scaleDown`** is `contain` but never *up*. CSS has `scale-down`, which is exactly that.
 */
const OBJECT_FIT: Readonly<Record<BoxFit, NonNullable<CSSProperties['objectFit']>>> = Object.freeze({
  fill: 'fill',
  contain: 'contain',
  cover: 'cover',
  fitWidth: 'cover',
  fitHeight: 'cover',
  none: 'none',
  scaleDown: 'scale-down',
});

/**
 * How a replaced element's content fills its box.
 *
 * Applies to `<img>` and `<video>` only — that is a CSS rule, not a choice made here, and it is why there is
 * no general `FittedBox` built on this function. Scaling arbitrary content to fit needs the child's measured
 * size, which is a layout read rather than a style; see this file's header.
 *
 * @param fit - Flutter's `BoxFit`. Defaults to `contain`, as in Flutter's `Image`.
 * @returns the `object-fit` value.
 */
export function objectFit(fit: BoxFit | undefined): NonNullable<CSSProperties['objectFit']> {
  return OBJECT_FIT[fit ?? 'contain'];
}

/**
 * The insets a `SafeArea` applies — the browser's own notion of the display cutout.
 *
 * `env(safe-area-inset-*)` is the platform's answer to exactly the question Flutter's `MediaQuery.padding`
 * answers: how much of the viewport is obscured by a notch, a rounded corner or a home indicator. On iOS
 * Safari and Android Chrome the two agree, because both read the same OS-supplied insets.
 *
 * Elsewhere the variables resolve to `0px`, which is the correct answer on a device with no cutout rather
 * than a degradation. The fallback in each `env()` is written explicitly for the same reason
 * {@link edgeInsetsStyle} writes its zeroes: an unsupported `env()` with no fallback makes the whole
 * declaration invalid, and an invalid `padding-top` is not zero — it is whatever was inherited.
 *
 * **Requires `viewport-fit=cover`** in the page's viewport meta tag; without it the browser reports zero
 * insets because it has already inset the viewport itself. The generated scaffold sets it.
 *
 * @param sides - which edges to inset. Flutter's `SafeArea` takes one boolean per side, all `true` by default.
 * @returns the padding declarations.
 */
export function safeAreaStyle(sides: {
  readonly top?: boolean;
  readonly right?: boolean;
  readonly bottom?: boolean;
  readonly left?: boolean;
}): CSSProperties {
  const inset = (side: string, enabled: boolean | undefined): string =>
    (enabled ?? true) ? `env(safe-area-inset-${side}, 0px)` : '0px';
  return {
    paddingTop: inset('top', sides.top),
    paddingRight: inset('right', sides.right),
    paddingBottom: inset('bottom', sides.bottom),
    paddingLeft: inset('left', sides.left),
  };
}

/**
 * Merges style fragments left to right, later fragments winning.
 *
 * A widget that composes several helpers — `Container` is insets *and* constraints *and* alignment — must end
 * up with one `style` on one element. Nesting a `<div>` per concern would change what a percentage resolves
 * against and put three extra nodes in every tree, so they merge instead.
 *
 * Key order follows argument order, and within a fragment the order that fragment built. That is what makes
 * the rendered `style` attribute byte-stable across runs, which is the property the determinism tests
 * actually compare — object spread preserves insertion order for string keys, so this is a guarantee rather
 * than a hope.
 *
 * @param fragments - the fragments, in precedence order. `undefined` entries are skipped, so a caller can
 * pass a conditional fragment without building an array first.
 * @returns the merged style.
 */
export function mergeStyles(...fragments: readonly (CSSProperties | undefined)[]): CSSProperties {
  const merged: CSSProperties = {};
  for (const fragment of fragments) {
    if (fragment !== undefined) Object.assign(merged, fragment);
  }
  return merged;
}

/**
 * Flutter's `BoxFit`, as a value.
 *
 * A Dart enum member reaches the generator as a reference named `BoxFit.cover`, so the kit must export a
 * `BoxFit` *value* for that reference to resolve — see `layout/alignment.ts`'s note on why the enum tables
 * had never been exercised by real analyzer output before M4-C.
 */
export const BoxFit: Readonly<Record<BoxFit, BoxFit>> = Object.freeze({
  fill: 'fill',
  contain: 'contain',
  cover: 'cover',
  fitWidth: 'fitWidth',
  fitHeight: 'fitHeight',
  none: 'none',
  scaleDown: 'scaleDown',
});

/**
 * Flutter's `IntrinsicWidth` / `IntrinsicHeight` — sizing to a subtree's *intrinsic* dimension.
 *
 * ## Why this exists now, when M4-D classified it as needing measurement
 *
 * M4-D put `IntrinsicWidth`, `IntrinsicHeight` and `FittedBox` in one bucket — *"the constraint model's
 * measuring half"* — and refused all three. That grouped two different problems, and M4-G separates them.
 *
 * **CSS has the intrinsic-sizing vocabulary already.** Flutter's `computeMaxIntrinsicWidth` is defined as the
 * width the subtree would take if it were given unbounded space and never wrapped; CSS's `max-content` is
 * defined the same way, and `min-content` is Flutter's `computeMinIntrinsicWidth`. These are not analogous
 * concepts — they are the same concept, standardised twice. So an `IntrinsicWidth` is `width: max-content`,
 * and the browser's layout engine does the measuring pass Flutter's does.
 *
 * `FittedBox` is genuinely different and stays refused: it needs the measured size as a **number**, to divide
 * by and produce a scale factor. CSS has no expression that reads a layout result back into a value, so there
 * is nothing to write. `unsupported.ts` says so, and this function is why the two entries no longer share a
 * sentence.
 *
 * ## Where it still diverges, precisely
 *
 * Flutter's intrinsic pass is expensive and *authoritative*: `IntrinsicHeight` forces every child of a `Row`
 * to the tallest child's height by re-running layout with a tight constraint. `height: max-content` sizes the
 * **box**, and its children then stretch only if the inner formatting context makes them — which for a `Row`
 * (a flex row) means `align-items: stretch`, i.e. `CrossAxisAlignment.stretch`. A `Row` inside an
 * `IntrinsicHeight` whose `crossAxisAlignment` is Flutter's default `center` therefore gets a correctly-sized
 * *parent* and centred children, where Flutter would stretch them.
 *
 * That is a real difference and it is stated rather than hidden. It is also the narrower of the two errors
 * available: the alternative was rendering nothing at all.
 *
 * `stepWidth`/`stepHeight` are not handled here and are not silently dropped: they round the intrinsic up to
 * a multiple, CSS has no expression for that, and the generator refuses a box that sets one.
 *
 * @param axis - which dimension is intrinsic.
 * @returns the sizing declaration.
 */
export function intrinsicStyle(axis: 'width' | 'height'): CSSProperties {
  // `max-content`, not `fit-content`: Flutter sizes to the *maximum* intrinsic dimension and does not clamp
  // to the incoming constraint. A parent that is too small produces an overflow in Flutter, and `max-content`
  // overflows too — matching the failure as well as the success.
  return axis === 'width' ? { width: 'max-content' } : { height: 'max-content' };
}

/**
 * Flutter's `OverflowBox` — a box that imposes *different* constraints on its child than it received.
 *
 * The child is laid out against the given constraints and is then allowed to paint outside the parent's
 * bounds; the `OverflowBox` itself takes the size its own parent gave it and is **not** sized by the child.
 * Those are two separate facts, and CSS gives each one directly: the box is `position: relative` with no
 * intrinsic contribution, and the child is `position: absolute`, which removes it from its parent's size
 * calculation exactly as Flutter's does.
 *
 * `overflow: visible` is not written here because it is the initial value; stating it would imply some
 * ancestor had set otherwise, and if one has, Flutter's `OverflowBox` is clipped there too.
 *
 * ## The divergence
 *
 * Flutter's alignment positions the child *within the parent's box* using the child's measured size. The
 * absolute child is placed by `inset` and the alignment maps through `alignmentStyle`, which is the same
 * three-positions-per-axis approximation every other aligned widget in this kit uses — so a fractional
 * `Alignment` is refused by the generator here as it is everywhere else, rather than rounded.
 *
 * @param constraints - the constraints to impose on the child.
 * @returns the declarations for the box and for the child, separately: they go on two elements.
 */
export function overflowBoxStyle(constraints: BoxConstraintsOptions): {
  readonly box: CSSProperties;
  readonly child: CSSProperties;
} {
  return {
    box: { position: 'relative' },
    // `position: absolute` is what makes the child not contribute to the parent's size — which *is*
    // `OverflowBox`'s defining behaviour, not a side effect of getting it to overflow.
    child: { position: 'absolute', ...constraintStyle(constraints) },
  };
}

/**
 * Flutter's `Size` — a width and a height, as one value.
 *
 * Mirrored rather than folded, for the reason `edge_insets.ts` gives at length: `Size.fromHeight(48)` must
 * survive into the output as `Size.fromHeight(48)` and not as a bare `48`, because a reviewer reading the
 * emitted file beside its Dart is the whole override workflow.
 *
 * It exists because `PreferredSize` takes one, and `PreferredSize` is what a `Scaffold`'s `appBar` and an
 * `AppBar`'s `bottom` are typed against. Flutter needs the size *before* layout — a scaffold cannot lay out a
 * bar it has not measured — which is a constraint CSS does not have, so the kit reads only the height. That
 * is not a simplification: in both slots that take a `PreferredSizeWidget`, Flutter ignores the width too,
 * because the bar spans the scaffold.
 */
export interface Size {
  /** The width, in logical pixels. */
  readonly width: number;
  /** The height, in logical pixels. */
  readonly height: number;
}

/**
 * The constructors for {@link Size}, mirroring Flutter's.
 *
 * A frozen module-scope constant of pure functions — ADR-15 forbids module-scope *state*, and there is none
 * here: every one returns a fresh object and reads nothing outside its arguments.
 *
 * @example
 * ```ts
 * Size.fromHeight(48);   // { width: Infinity, height: 48 }
 * Size.square(24);       // { width: 24, height: 24 }
 * ```
 */
export const Size = Object.freeze({
  /**
   * A width and a height — Flutter's unnamed `Size(width, height)` constructor.
   *
   * @param width - the width, in logical pixels.
   * @param height - the height, in logical pixels.
   * @returns the size.
   */
  of(width: number, height: number): Size {
    return { width, height };
  },

  /**
   * A height with an infinite width — Flutter's `Size.fromHeight`.
   *
   * `Infinity`, which is what Dart's `double.infinity` is, and {@link extent} already maps to `100%`. It is
   * the honest value: `Size.fromHeight(48)` genuinely states nothing about width.
   *
   * @param height - the height, in logical pixels.
   * @returns the size.
   */
  fromHeight(height: number): Size {
    return { width: Number.POSITIVE_INFINITY, height };
  },

  /**
   * A width with an infinite height — Flutter's `Size.fromWidth`.
   *
   * @param width - the width, in logical pixels.
   * @returns the size.
   */
  fromWidth(width: number): Size {
    return { width, height: Number.POSITIVE_INFINITY };
  },

  /**
   * The same extent on both axes — Flutter's `Size.square`.
   *
   * @param value - the extent, in logical pixels.
   * @returns the size.
   */
  square(value: number): Size {
    return { width: value, height: value };
  },

  /** A size of zero — Flutter's `Size.zero`. */
  zero: { width: 0, height: 0 } as Size,
});
