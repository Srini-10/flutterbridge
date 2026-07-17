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
//   the parent is the constraint model.
//
// Both are the constraint model, which the M3 stub tag in `src/index.ts` defers by name rather than
// half-fixing here.

import { createElement, type CSSProperties, type ReactElement, type ReactNode } from 'react';

import type { EdgeInsets } from './edge_insets.js';

/**
 * `Center`'s style. Frozen and shared: it has no props to vary with, so one object is the whole extent of
 * "same props → same style" for this component (ADR-15 forbids module-scope *state*; a frozen table is not).
 *
 * `width`/`height: 100%` because Flutter's `Center` is `Align(alignment: Alignment.center)` with no size
 * factors, and that expands to fill its constraints — a `Center` that shrink-wrapped would be centring its
 * child within exactly the child, which is to say not centring it. The same `100%`-against-an-auto-ancestor
 * degradation `flex.ts` documents applies to the vertical half.
 */
const CENTER_STYLE: CSSProperties = Object.freeze({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  width: '100%',
  height: '100%',
});

/** Props for {@link Center}. */
export interface CenterProps {
  /** The widget to centre. Flutter's `child` slot, per the catalog. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `Center` — centres its child on both axes.
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
  return createElement('div', { style: CENTER_STYLE }, props.child);
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
  const { padding } = props;
  const style: CSSProperties = {
    paddingTop: padding.top,
    paddingRight: padding.right,
    paddingBottom: padding.bottom,
    paddingLeft: padding.left,
  };
  return createElement('div', { style }, props.child);
}

/**
 * A `SizedBox` dimension → a CSS length.
 *
 * `double.infinity` is the reason this is a function. It is ordinary Flutter — `SizedBox(width:
 * double.infinity)` is *the* idiom for "fill the incoming constraint" — and it reaches JavaScript as
 * `Infinity`, which templates into the string `Infinitypx`. The browser would drop that as an invalid
 * declaration and render the box at its natural size: no error, no warning, a box that fills in Flutter and
 * hugs its content on the web. `100%` is the same degradable "fill the constraint" that `mainAxisSize:
 * 'max'` maps to in `flex.ts`, and it is the same answer for the same reason.
 */
function extent(value: number): NonNullable<CSSProperties['width']> {
  return Number.isFinite(value) ? value : '100%';
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
  // Assigned in a fixed order, so two boxes with the same props produce the same declaration order and the
  // same `style` attribute — which is what the determinism test actually compares.
  const style: CSSProperties = {};
  if (props.width !== undefined) style.width = extent(props.width);
  if (props.height !== undefined) style.height = extent(props.height);
  return createElement('div', { style }, props.child);
}
