// Decoration and clipping — Flutter's `BoxDecoration`, `BorderRadius` and the clip widgets, on CSS.
//
// ## Why these are value types rather than props
//
// `BoxDecoration(borderRadius: BorderRadius.circular(12), color: …)` reaches the generator as a `logic.New`
// of a `package:flutter/` type, so the kit must mirror the type for the construction to resolve — the same
// contract `EdgeInsets` and `BoxConstraints` sit under. Flattening a decoration into `borderRadius` and
// `backgroundColor` props at the call site would lose the fact that the author wrote one decoration, which is
// what the override workflow reads (ADR-6).
//
// ## The colour rule, and how M4-E made it hold everywhere
//
// INV-20: a colour a mapped widget paints must resolve to an `app.Token`. Until M4-E that was only true for
// the roles a `ColorScheme` names, so `BoxDecoration(color: Colors.red)` had no token to resolve to and the
// whole decoration family was refused. It resolves now because the **analyzer** hoists every literal colour
// into an `app.Token` and passes the token's *name* down — the only place in the pipeline that can, since a
// colour's value lives in Dart's constant evaluator and nowhere downstream.
//
// So `color` here is a `ColorToken`: a name, never a value. `Color(0xFF2196F3)` arrives as
// `'colorFF2196F3'` and `colorScheme.primary` as `'primary'`, and this module cannot tell them apart.
//
// ## What CSS gives for free, and the one thing it does not
//
// `border-radius`, `border`, `background`, `box-shadow` and `overflow: hidden` cover borders, rounded
// corners, solid fills, gradients and clipping exactly. What CSS has no equivalent for is Flutter's
// `BoxShape.circle` *with a non-square box*: Flutter insets the circle, CSS's `border-radius: 50%` makes an
// ellipse. That divergence is named at {@link boxShapeStyle} rather than smoothed over.

import type { CSSProperties } from 'react';

/**
 * The name of an `app.Token` holding a colour.
 *
 * **Not a colour value.** INV-20 (ADR-13) forbids a kit component from holding one, and M4-E made that
 * enforceable everywhere rather than only for the roles a `ColorScheme` names: the analyzer hoists every
 * literal colour an application writes into an `app.Token` and passes the token's *name* down, so
 * `Color(0xFF2196F3)` arrives here as `'colorFF2196F3'` and `colorScheme.primary` as `'primary'`. Both are
 * resolved the same way, through the theme, and a component cannot tell them apart — which is the point.
 *
 * A string alias rather than a union of the 46 roles, for the reason `ThemeSurface` gives: the kit resolves
 * names and does not enumerate them, and a hoisted token's name is not in any enumeration anyway.
 */
export type ColorToken = string;

/**
 * A corner radius — the runtime form of Flutter's `BorderRadius`.
 *
 * Four corners, in logical pixels. Flutter's `Radius` is elliptical (`Radius.elliptical(x, y)`); this carries
 * the circular case, which is what `BorderRadius.circular` and `BorderRadius.all(Radius.circular(n))` — the
 * two spellings real code uses — produce. An elliptical radius has no field to land in and is refused by the
 * generator rather than flattened to its larger axis.
 */
export interface BorderRadiusGeometry {
  /** The top-left corner's radius. */
  readonly topLeft: number;
  /** The top-right corner's radius. */
  readonly topRight: number;
  /** The bottom-right corner's radius. */
  readonly bottomRight: number;
  /** The bottom-left corner's radius. */
  readonly bottomLeft: number;
}

/**
 * Flutter's `BorderRadius` — the named constructors, mirrored.
 *
 * Same names and same defaults as Dart's, so `BorderRadius.circular(12)` survives into the output as itself.
 */
export const BorderRadius = Object.freeze({
  /** The same radius on all four corners — Flutter's `BorderRadius.circular`. */
  circular(radius: number): BorderRadiusGeometry {
    return { topLeft: radius, topRight: radius, bottomRight: radius, bottomLeft: radius };
  },
  /** The same radius on all four corners — Flutter's `BorderRadius.all`. */
  all(radius: number): BorderRadiusGeometry {
    return BorderRadius.circular(radius);
  },
  /** Radii on named corners only; the rest are `0` — Flutter's `BorderRadius.only`. */
  only(corners: {
    readonly topLeft?: number;
    readonly topRight?: number;
    readonly bottomRight?: number;
    readonly bottomLeft?: number;
  }): BorderRadiusGeometry {
    return {
      topLeft: corners.topLeft ?? 0,
      topRight: corners.topRight ?? 0,
      bottomRight: corners.bottomRight ?? 0,
      bottomLeft: corners.bottomLeft ?? 0,
    };
  },
  /** Radii on the vertical edges — Flutter's `BorderRadius.vertical`. */
  vertical(edges: { readonly top?: number; readonly bottom?: number }): BorderRadiusGeometry {
    const top = edges.top ?? 0;
    const bottom = edges.bottom ?? 0;
    return { topLeft: top, topRight: top, bottomRight: bottom, bottomLeft: bottom };
  },
  /** Radii on the horizontal edges — Flutter's `BorderRadius.horizontal`. */
  horizontal(edges: { readonly left?: number; readonly right?: number }): BorderRadiusGeometry {
    const left = edges.left ?? 0;
    const right = edges.right ?? 0;
    return { topLeft: left, topRight: right, bottomRight: right, bottomLeft: left };
  },
  /** No rounding — Flutter's `BorderRadius.zero`. */
  zero: Object.freeze({ topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 }) as BorderRadiusGeometry,
});

/**
 * `BorderRadius` → the four CSS corner longhands.
 *
 * All four are written, including the zeroes, for the reason {@link edgeInsetsStyle} writes its own: an
 * omitted `border-top-left-radius` is not zero, it is whatever a stylesheet says.
 *
 * @param radius - the corner radii.
 * @returns the corner declarations.
 */
export function borderRadiusStyle(radius: BorderRadiusGeometry): CSSProperties {
  return {
    borderTopLeftRadius: radius.topLeft,
    borderTopRightRadius: radius.topRight,
    borderBottomRightRadius: radius.bottomRight,
    borderBottomLeftRadius: radius.bottomLeft,
  };
}

/** Whether a box is rectangular or circular — Flutter's `BoxShape`. */
export type BoxShape = 'rectangle' | 'circle';

/**
 * `BoxShape` → a corner radius.
 *
 * **Degrades on a non-square box.** Flutter's `BoxShape.circle` inscribes a *circle*, using the shorter side;
 * CSS's `border-radius: 50%` produces an *ellipse* filling the box. They agree exactly when the box is square
 * — which is every real use, because a circular avatar or badge is sized by one dimension — and differ when
 * it is not. Stated here rather than corrected by forcing an aspect ratio the author did not write.
 *
 * @param shape - Flutter's `BoxShape`. Defaults to `rectangle`.
 * @returns the radius declaration, or nothing for a rectangle.
 */
export function boxShapeStyle(shape: BoxShape | undefined): CSSProperties {
  return (shape ?? 'rectangle') === 'circle' ? { borderRadius: '50%' } : {};
}

/** One side of a border — the runtime form of Flutter's `BorderSide`. */
export interface BorderSideOptions {
  /** The line's thickness, in logical pixels. Defaults to `1`, as in Flutter. */
  readonly width?: number;
  /** The token holding its colour. A token name, never a colour value (INV-20). */
  readonly color?: ColorToken;
}

/** Flutter's `BorderSide`, as a constructible value. */
export class BorderSide implements BorderSideOptions {
  /** The line's thickness. */
  public readonly width: number;
  /** The token holding its colour. */
  public readonly color?: ColorToken;

  public constructor(options: BorderSideOptions = {}) {
    this.width = options.width ?? 1;
    if (options.color !== undefined) this.color = options.color;
  }
}

/**
 * Flutter's `Border` — the four sides of a box.
 *
 * Only `Border.all` is mirrored, and that is what the shape of CSS allows rather than a shortcut: a uniform
 * border is `border-width`/`border-style`/`border-color`, while `Border(top: …, left: …)` needs the four
 * longhands per property and a different merge order. A non-uniform border is refused by the generator with
 * its own diagnostic rather than painted uniformly, which would be a visibly different box.
 */
export const Border = Object.freeze({
  /** The same side on all four edges — Flutter's `Border.all`. */
  all(options: BorderSideOptions = {}): BorderSide {
    return new BorderSide(options);
  },
});

/** An offset, in logical pixels — Flutter's `Offset`. */
export class Offset {
  /** The horizontal component. */
  public readonly dx: number;
  /** The vertical component. */
  public readonly dy: number;

  public constructor(dx: number, dy: number) {
    this.dx = dx;
    this.dy = dy;
  }
}

/** A shadow cast by a box — the runtime form of Flutter's `BoxShadow`. */
export interface BoxShadowOptions {
  /** The token holding its colour. */
  readonly color?: ColorToken;
  /** How far the shadow is blurred. Defaults to `0`, as in Flutter. */
  readonly blurRadius?: number;
  /** How far the shadow is grown before blurring. Defaults to `0`, as in Flutter. */
  readonly spreadRadius?: number;
  /** How far the shadow is displaced. Defaults to no displacement, as in Flutter. */
  readonly offset?: Offset;
}

/**
 * Flutter's `BoxShadow`, as a constructible value.
 *
 * Maps to one `box-shadow` layer exactly: CSS takes the same four quantities in the same units, and a list of
 * `BoxShadow`s is a comma-separated list of layers painted in the same order.
 */
export class BoxShadow implements BoxShadowOptions {
  /** The token holding its colour. */
  public readonly color?: ColorToken;
  /** The blur radius. */
  public readonly blurRadius: number;
  /** The spread radius. */
  public readonly spreadRadius: number;
  /** The displacement. */
  public readonly offset: Offset;

  public constructor(options: BoxShadowOptions = {}) {
    if (options.color !== undefined) this.color = options.color;
    this.blurRadius = options.blurRadius ?? 0;
    this.spreadRadius = options.spreadRadius ?? 0;
    this.offset = options.offset ?? new Offset(0, 0);
  }
}

/** A linear gradient — the runtime form of Flutter's `LinearGradient`. */
export interface LinearGradientOptions {
  /** The tokens holding the gradient's colours, in order. At least two for a gradient to mean anything. */
  readonly colors: readonly ColorToken[];
}

/**
 * Flutter's `LinearGradient`, as a constructible value.
 *
 * `begin`/`end` are not carried. Flutter states them as `Alignment`s and CSS as an angle or a side pair, and
 * the conversion is exact only for the eight alignments that name an edge or a corner — so a gradient with a
 * non-default `begin` is refused by the generator rather than rendered at the wrong angle. The default,
 * `centerLeft` → `centerRight`, is `to right`, which is what a bare `LinearGradient(colors: …)` means.
 */
export class LinearGradient implements LinearGradientOptions {
  /** The tokens holding the gradient's colours. */
  public readonly colors: readonly ColorToken[];

  public constructor(options: LinearGradientOptions) {
    this.colors = options.colors;
  }
}

/**
 * Flutter's `BoxDecoration` — what is painted behind a box.
 *
 * A subset of Dart's, and the omissions are deliberate rather than pending: `image` needs an
 * `DecorationImage` and its own fit/repeat vocabulary, `gradient` needs the gradient value types, and
 * `boxShadow` needs the `shadow`-group tokens no compiler pass emits. Each is refused by the generator with
 * its own diagnostic rather than dropped, so a decoration that uses one is reported at build time.
 */
export interface BoxDecorationOptions {
  /** The token holding the fill colour. Flutter's `color` (INV-20: a token name, not a value). */
  readonly color?: ColorToken;
  /** The corner radii. Ignored by Flutter when `shape` is `circle`, and by this too. */
  readonly borderRadius?: BorderRadiusGeometry;
  /** A uniform border on all four sides. */
  readonly border?: BorderSideOptions;
  /** The shadows cast, painted in order. */
  readonly boxShadow?: readonly BoxShadowOptions[];
  /** A gradient fill. Painted over `color` when both are given, as in Flutter. */
  readonly gradient?: LinearGradientOptions;
  /** Whether the box is rectangular or circular. Defaults to `rectangle`, as in Flutter. */
  readonly shape?: BoxShape;
}

/**
 * Flutter's `BoxDecoration`, as a constructible value.
 *
 * Named arguments become one options object, which is the kit's convention for every mirrored value type
 * (`EdgeInsets.symmetric`, `BoxConstraints`) and what the generator's kit-provided lowering emits.
 *
 * @example
 * ```ts
 * // BoxDecoration(borderRadius: BorderRadius.circular(12), shape: BoxShape.rectangle)
 * new BoxDecoration({ borderRadius: BorderRadius.circular(12) });
 * ```
 */
export class BoxDecoration implements BoxDecorationOptions {
  /** The token holding the fill colour. */
  public readonly color?: ColorToken;
  /** The corner radii. */
  public readonly borderRadius?: BorderRadiusGeometry;
  /** A uniform border. */
  public readonly border?: BorderSideOptions;
  /** The shadows cast. */
  public readonly boxShadow?: readonly BoxShadowOptions[];
  /** A gradient fill. */
  public readonly gradient?: LinearGradientOptions;
  /** Rectangular or circular. */
  public readonly shape?: BoxShape;

  public constructor(options: BoxDecorationOptions = {}) {
    // Conditional assignment, because `exactOptionalPropertyTypes` distinguishes an absent field from an
    // explicit `undefined`, and `decorationStyle` reads absence as "paint nothing for this".
    if (options.color !== undefined) this.color = options.color;
    if (options.borderRadius !== undefined) this.borderRadius = options.borderRadius;
    if (options.border !== undefined) this.border = options.border;
    if (options.boxShadow !== undefined) this.boxShadow = options.boxShadow;
    if (options.gradient !== undefined) this.gradient = options.gradient;
    if (options.shape !== undefined) this.shape = options.shape;
  }
}

/**
 * `BoxDecoration` → CSS.
 *
 * @param decoration - the decoration.
 * @param color - resolves a Material role to a CSS colour. Passed in rather than read here, because this
 * module holds no React and the theme reaches a component through a hook.
 * @returns the paint declarations.
 */
export function decorationStyle(
  decoration: BoxDecorationOptions,
  color: (token: ColorToken) => string,
): CSSProperties {
  const style: CSSProperties = {};
  if (decoration.color !== undefined) style.backgroundColor = color(decoration.color);

  // A gradient is a background *image* in CSS, so it layers over the background colour rather than replacing
  // it — which is exactly what Flutter does when a decoration carries both.
  if (decoration.gradient !== undefined) {
    // `to right` is the default `centerLeft → centerRight`; see `LinearGradient` on why other directions are
    // refused upstream rather than approximated here.
    const stops = decoration.gradient.colors.map((token) => color(token)).join(', ');
    style.backgroundImage = `linear-gradient(to right, ${stops})`;
  }

  // Shape wins over an explicit radius, as it does in Flutter: `BoxDecoration` asserts that a circle carries
  // no `borderRadius`, so a decoration with both is one Flutter would have rejected.
  if ((decoration.shape ?? 'rectangle') === 'circle') {
    Object.assign(style, boxShapeStyle('circle'));
  } else if (decoration.borderRadius !== undefined) {
    Object.assign(style, borderRadiusStyle(decoration.borderRadius));
  }

  if (decoration.border !== undefined) {
    style.borderWidth = decoration.border.width ?? 1;
    style.borderStyle = 'solid';
    if (decoration.border.color !== undefined) style.borderColor = color(decoration.border.color);
  }

  if (decoration.boxShadow !== undefined && decoration.boxShadow.length > 0) {
    style.boxShadow = shadowStyle(decoration.boxShadow, color);
  }
  return style;
}

/**
 * A list of `BoxShadow`s → one `box-shadow` value.
 *
 * Exact: CSS takes `<offset-x> <offset-y> <blur> <spread> <color>` in the same units and the same order
 * Flutter stores them, and paints a comma-separated list in the same front-to-back order. Shared rather than
 * inlined so that `Card`'s elevation shadow and a `BoxDecoration`'s cannot be spelled differently.
 *
 * @param shadows - the shadows, in paint order.
 * @param color - resolves a token to a CSS colour.
 * @returns the `box-shadow` value.
 */
export function shadowStyle(
  shadows: readonly BoxShadowOptions[],
  color: (token: ColorToken) => string,
): string {
  return shadows
    .map((shadow) => {
      const offset = shadow.offset ?? new Offset(0, 0);
      const parts = [
        `${offset.dx}px`,
        `${offset.dy}px`,
        `${shadow.blurRadius ?? 0}px`,
        `${shadow.spreadRadius ?? 0}px`,
      ];
      if (shadow.color !== undefined) parts.push(color(shadow.color));
      return parts.join(' ');
    })
    .join(', ');
}

/**
 * The clip declarations for a rectangular clip, optionally rounded.
 *
 * `overflow: hidden` is the whole of it: Flutter's `ClipRect` clips to the box, and `ClipRRect` clips to the
 * box with rounded corners — which is `overflow: hidden` plus a radius. Exact in both cases, because CSS
 * clips to the padding box after applying the radius, which is the same rectangle Flutter clips to.
 *
 * `Clip.none` is honoured by emitting nothing: a clip widget set to `none` is a widget that does not clip,
 * and forcing `overflow: hidden` anyway would cut off a child the author meant to overflow.
 *
 * @param radius - the corner radii, if the clip is rounded.
 * @param clipBehavior - Flutter's `Clip`. `none` disables clipping entirely.
 * @returns the clip declarations.
 */
export function clipStyle(
  radius: BorderRadiusGeometry | undefined,
  clipBehavior: Clip | undefined,
): CSSProperties {
  if ((clipBehavior ?? 'antiAlias') === 'none') return {};
  const style: CSSProperties = { overflow: 'hidden' };
  if (radius !== undefined) Object.assign(style, borderRadiusStyle(radius));
  return style;
}

/**
 * How a widget clips its children — Flutter's `Clip`.
 *
 * The four members differ only in *anti-aliasing quality*, which the browser decides for itself: `hardEdge`,
 * `antiAlias` and `antiAliasWithSaveLayer` all become `overflow: hidden`, and only `none` is distinguishable.
 * Mapping four values onto two is not a loss — the other three describe how Flutter's compositor should
 * rasterise an edge, and CSS has no such knob to set wrongly.
 */
export type Clip = 'none' | 'hardEdge' | 'antiAlias' | 'antiAliasWithSaveLayer';

/** Flutter's `Clip`, as a value. See `layout/alignment.ts` on why the kit exports enum values. */
export const Clip: Readonly<Record<Clip, Clip>> = Object.freeze({
  none: 'none',
  hardEdge: 'hardEdge',
  antiAlias: 'antiAlias',
  antiAliasWithSaveLayer: 'antiAliasWithSaveLayer',
});

/** Flutter's `BoxShape`, as a value. */
export const BoxShape: Readonly<Record<BoxShape, BoxShape>> = Object.freeze({
  rectangle: 'rectangle',
  circle: 'circle',
});
