// Divider and VerticalDivider — Material's thin rules, and the kit's first themed components.
//
// A Flutter `Divider` is not a `<hr>`: it is a box of a given extent (`height` for the horizontal one,
// `width` for the vertical) with a thin line drawn **centred** inside it, optionally inset from the ends.
// The box is what gives the rule its breathing room in a `Column`/`Row`; the line is one logical pixel of
// paint within it. Rendering it as a border on a full-height box would move the line to an edge and lose
// the space, so the two-element shape here — an outer box, an inner line — is the faithful one.
//
// ## The colour, and the literal that used to be here
//
// M4-A shipped this file with `const DIVIDER_COLOR = 'rgba(0, 0, 0, 0.12)'` — Material's light-theme default,
// hard-coded, because there was no way for a component to reach the theme. That is exactly what INV-20
// forbids: *"Generated code and kit components contain no literal colour values. A literal colour in emitted
// output is a compiler bug."* It was also wrong in the dark theme, which is when a 12%-black rule is
// invisible.
//
// It is now `outlineVariant` — the Material 3 role a divider paints, which N10 derives from the app's seed
// colour along with the other 45 — read through `useThemeSurface()`. The component names a *role* and knows
// nothing else: not the hex, not the brightness, not that ADR-21 puts alpha first. Every future Material
// component gets its colours the same way, which is the point of the surface existing.
//
// A theme that defines no `outlineVariant` makes this throw `BRG4006` rather than fall back to a grey. The
// generator refuses the same program at build time (`BRG3010`), so in generated output the throw is
// unreachable — it is there for a hand-written theme, and it says which token is missing.

import { createElement, type CSSProperties, type ReactElement, type ReactNode } from 'react';

import { componentDefault } from '../generated/material_metadata.js';
import { mergeStyles, sizeStyle } from '../layout/constraints.js';
import {
  Offset,
  borderRadiusStyle,
  decorationStyle,
  shadowStyle,
  type BorderRadiusGeometry,
  type BoxDecorationOptions,
  type ColorToken,
} from '../layout/decoration.js';
import { useThemeSurface } from '../react/theme.js';
import type { ThemeSurface } from '../theme/surface.js';

/**
 * The Material role a divider paints.
 *
 * M3 renames M2's `dividerColor` to the `outlineVariant` role — the low-emphasis outline, used for dividers,
 * card borders and the outlines of unselected controls. Stated once here so the two components below cannot
 * drift onto different roles.
 */
const DIVIDER_ROLE = String(componentDefault('Divider', 'colorRole'));

/** Props for {@link Divider}. Flutter's `Divider`. */
export interface DividerProps {
  /** The box's height; the line sits centred in it. Defaults to 16, as in Flutter's `Divider`. */
  readonly height?: number;
  /** The line's thickness. Defaults to 1 — Flutter's `0` renders as one device pixel, which is 1 in CSS. */
  readonly thickness?: number;
  /** Empty space before the line's leading end. Defaults to 0. */
  readonly indent?: number;
  /** Empty space after the line's trailing end. Defaults to 0. */
  readonly endIndent?: number;
}

/**
 * Flutter's `Divider` — a horizontal Material rule.
 *
 * An outer box of `height`, `flex-shrink: 0` so a `Column` cannot squeeze it away, with the line centred
 * inside by a flex `alignItems: center`. The line is a zero-height element carrying a bottom border of
 * `thickness`, inset by `indent`/`endIndent`, in the theme's `outlineVariant`.
 *
 * @param props - see {@link DividerProps}.
 * @returns the rule.
 * @throws RuntimeError - `BRG4006` if the theme defines no `outlineVariant`; see this file's header.
 */
export function Divider(props: DividerProps): ReactElement {
  const theme = useThemeSurface();
  const box: CSSProperties = {
    height: props.height ?? Number(componentDefault('Divider', 'space')),
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  };
  const line: CSSProperties = {
    height: 0,
    width: '100%',
    borderBottomWidth: props.thickness ?? Number(componentDefault('Divider', 'thickness')),
    borderBottomStyle: 'solid',
    borderBottomColor: theme.color(DIVIDER_ROLE),
    marginLeft: props.indent ?? 0,
    marginRight: props.endIndent ?? 0,
  };
  return createElement('div', { style: box }, createElement('div', { style: line }));
}

/** Props for {@link VerticalDivider}. Flutter's `VerticalDivider`. */
export interface VerticalDividerProps {
  /** The box's width; the line sits centred in it. Defaults to 16, as in Flutter. */
  readonly width?: number;
  /** The line's thickness. Defaults to 1; see {@link DividerProps.thickness}. */
  readonly thickness?: number;
  /** Empty space before the line's top. Defaults to 0. */
  readonly indent?: number;
  /** Empty space after the line's bottom. Defaults to 0. */
  readonly endIndent?: number;
}

/**
 * Flutter's `VerticalDivider` — a vertical Material rule. The 90°-rotated {@link Divider}: a box of `width`
 * with a zero-width line carrying a right border, centred by `justifyContent: center`.
 *
 * @param props - see {@link VerticalDividerProps}.
 * @returns the rule.
 * @throws RuntimeError - `BRG4006` if the theme defines no `outlineVariant`; see this file's header.
 */
export function VerticalDivider(props: VerticalDividerProps): ReactElement {
  const theme = useThemeSurface();
  const box: CSSProperties = {
    width: props.width ?? Number(componentDefault('Divider', 'space')),
    display: 'flex',
    justifyContent: 'center',
    flexShrink: 0,
  };
  const line: CSSProperties = {
    width: 0,
    height: '100%',
    borderRightWidth: props.thickness ?? Number(componentDefault('Divider', 'thickness')),
    borderRightStyle: 'solid',
    borderRightColor: theme.color(DIVIDER_ROLE),
    marginTop: props.indent ?? 0,
    marginBottom: props.endIndent ?? 0,
  };
  return createElement('div', { style: box }, createElement('div', { style: line }));
}

// ── Card ──────────────────────────────────────────────────────────────────────────────────────────
//
// A `Card` is a surface: a rounded, tinted box that sits above the background. Every number it needs —
// elevation, corner radius, margin — and the role it paints are Material's, not this file's, so they come
// from `generated/material_metadata.ts`, which the catalog generates from values transcribed out of the
// Flutter SDK. INV-20 is the rule for colours; the same argument holds for a corner radius that would
// otherwise be `12` in one component and `12.0` in the next.

/** Props for {@link Card}. Flutter's `Card`. */
export interface CardProps {
  /**
   * How far the card sits above the surface, in logical pixels. Defaults to Material's, from the catalog.
   *
   * M3 renders elevation as a **surface tint** rather than a shadow alone, so this changes the card's colour;
   * see {@link ThemeSurface.elevation}.
   */
  readonly elevation?: number;
  /** The content. Flutter's `child` slot, per the catalog. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `Card` — a rounded Material surface.
 *
 * The elevation tint is composed rather than approximated: `ThemeSurface.elevation` blends the theme's
 * `surface` toward `surfaceTint` at the opacity Flutter's own `ElevationOverlay` would use, interpolated
 * across the curve the catalog transcribes. A card at elevation 2 is therefore the colour Flutter paints at
 * elevation 2, not the colour of the nearest level.
 *
 * The drop shadow is drawn from the same elevation through {@link elevationShadow}, in the theme's `shadow`
 * token — and omitted entirely when the theme has no such token, rather than invented in black. The tint
 * carries the elevation either way.
 *
 * @param props - see {@link CardProps}.
 * @returns the card.
 * @throws RuntimeError - `BRG4006` if the theme defines no `surface` or `surfaceTint`.
 */
export function Card(props: CardProps): ReactElement {
  const theme = useThemeSurface();
  const elevation = props.elevation ?? Number(componentDefault('Card', 'elevation'));
  const style: CSSProperties = {
    backgroundColor: theme.elevation(elevation),
    borderRadius: Number(componentDefault('Card', 'borderRadius')),
    margin: Number(componentDefault('Card', 'margin')),
    // Material clips its content to the rounded corner; without this an image child squares them off again.
    overflow: 'hidden',
  };
  // The same shadow a `Material` at this elevation casts — one definition, so the two cannot differ.
  const shadow = elevationShadow(elevation, theme);
  if (shadow !== undefined) style.boxShadow = shadow;
  return createElement('div', { style }, props.child);
}

// ── Material and Ink ──────────────────────────────────────────────────────────────────────────────
//
// `Material` is the surface every other Material component is drawn on: it paints a colour, rounds it, and
// raises it. `Ink` paints a decoration that a ripple would stay inside — and since the gesture model does not
// exist yet, what `Ink` reliably *is* today is a decorated box that participates in Material's layering.
// Both are here rather than in `basic.ts` because their elevation is Material's, composed from the tokens the
// catalog carries.

/** Props for {@link Material}. Flutter's `Material`. */
export interface MaterialProps {
  /** The token holding the surface colour. Defaults to the theme's `surface`. */
  readonly color?: ColorToken;
  /** How far the surface sits above the background, in logical pixels. Defaults to `0`. */
  readonly elevation?: number;
  /** The corner radii. */
  readonly borderRadius?: BorderRadiusGeometry;
  /** The content. Flutter's `child` slot, per the catalog. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `Material` — the surface Material components are drawn on.
 *
 * An explicit `color` wins; without one the surface is the theme's `surface` **tinted by elevation**, which
 * is what M3 means by elevation and what `ThemeSurface.elevation` composes from the catalog's transcribed
 * curve. So a `Material(elevation: 3)` is the colour Flutter paints at elevation 3, interpolated, not the
 * colour of the nearest level.
 *
 * The drop shadow is drawn from the same elevation, through the shared {@link shadowStyle} — so a `Material`
 * and a `Card` at the same elevation cast the same shadow rather than two similar ones.
 *
 * @param props - see {@link MaterialProps}.
 * @returns the surface.
 * @throws RuntimeError - `BRG4006` if a named token is not in the theme.
 */
export function Material(props: MaterialProps): ReactElement {
  const theme = useThemeSurface();
  const elevation = props.elevation ?? 0;
  const style: CSSProperties = {
    backgroundColor: props.color === undefined ? theme.elevation(elevation) : theme.color(props.color),
    ...(props.borderRadius === undefined ? {} : borderRadiusStyle(props.borderRadius)),
  };
  const shadow = elevationShadow(elevation, theme);
  if (shadow !== undefined) style.boxShadow = shadow;
  return createElement('div', { style }, props.child);
}

/**
 * The drop shadow for an elevation, or nothing at elevation zero.
 *
 * M3's elevation is *both* a surface tint and a shadow. The tint is exact — the catalog carries Flutter's own
 * opacity curve — and the shadow is not: Flutter composes two penumbras from the `shadow` role at opacities
 * no `ProgressIndicatorTheme`-style defaults class states, so there is no table to transcribe. What is
 * transcribable is the *geometry*: a shadow whose offset and blur scale with elevation, in the theme's
 * `shadow` token.
 *
 * A theme without a `shadow` token gets no shadow rather than a black one, which is the honest degradation:
 * the tint still carries the elevation, and an invented shadow colour would be the INV-20 violation.
 */
function elevationShadow(elevation: number, theme: ThemeSurface): string | undefined {
  if (elevation <= 0 || !theme.has('shadow')) return undefined;
  return shadowStyle(
    [{ color: 'shadow', offset: new Offset(0, elevation), blurRadius: elevation * 2, spreadRadius: 0 }],
    (token) => theme.color(token),
  );
}

/** Props for {@link Ink}. Flutter's `Ink`. */
export interface InkProps {
  /** The token holding the fill colour. Flutter's `color`; mutually exclusive with `decoration`. */
  readonly color?: ColorToken;
  /** What to paint. Flutter's `decoration`. */
  readonly decoration?: BoxDecorationOptions;
  /** An explicit width. */
  readonly width?: number;
  /** An explicit height. */
  readonly height?: number;
  /** The content. Flutter's `child` slot, per the catalog. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `Ink` — a decoration painted on the Material below, so a ripple stays inside it.
 *
 * The ripple is the half that does not exist: it needs the gesture model, which `unsupported.ts` classifies
 * and no part of this kit provides. What `Ink` does today is paint its decoration, which is the visible
 * behaviour of every `Ink` that is not being pressed — and pressing one is an interaction the generator
 * refuses to emit rather than rendering something inert that looks interactive.
 *
 * @param props - see {@link InkProps}.
 * @returns the painted box.
 */
export function Ink(props: InkProps): ReactElement {
  const theme = useThemeSurface();
  const decoration = props.decoration ?? (props.color === undefined ? {} : { color: props.color });
  const style = mergeStyles(
    decorationStyle(decoration, (token) => theme.color(token)),
    sizeStyle(props.width, props.height),
  );
  return createElement('div', { style }, props.child);
}
