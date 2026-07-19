// The theme surface — what a Material component is allowed to know about theming, and the whole of it.
//
// ## The problem this solves
//
// M4-A added `Divider`, and `Divider` needs a colour. `Theme.dividerColor` was not reachable from a
// component, so the component shipped `const DIVIDER_COLOR = 'rgba(0, 0, 0, 0.12)'` — a literal, in a kit
// component, which is precisely what INV-20 (ADR-13) forbids:
//
// > every colour a mapped Material widget paints must resolve to an `app.Token`. Generated code and kit
// > components contain no literal colour values. **A literal colour in emitted output is a compiler bug.**
//
// One widget, one literal. The next forty widgets would have brought forty more, each defensible on its own
// and collectively a second, undocumented, un-themed palette living inside the kit. This module is the
// alternative: components ask for a *role*, and get whatever the app's theme says that role is, in the
// current brightness, as a string they can put in a style.
//
// ## Why a surface object and not `useTheme()` directly
//
// `ThemeInstance` is the theme's *storage* — a token list, a brightness signal, a parse cache, and `token()`
// returning `unknown`. A component that used it directly would have to know that colours are hex, that hex
// is ARGB rather than CSS's RGBA (ADR-21), that `dark` being absent means "does not vary" rather than
// "missing", and that a CSS colour is `rgb(r g b / a)` and not the `#AARRGGBB` `formatColor` produces. Four
// facts about storage, in every component, is four places for the next widget to get one of them wrong.
//
// So the surface exposes *meaning* — `surface.color('outlineVariant')` — and keeps every one of those facts
// on this side of the boundary. That is the "without knowing how they are stored" the milestone asks for,
// and it is what makes the next fifty widgets need no theme architecture at all: they need a role name.
//
// ## Why the vocabulary is not an enum in this file
//
// The role names are Material's, and Material's metadata has exactly one home: `packages/uir/schema/l3.json`
// defines `MaterialRole`, all 46 of them, and ADR-18 forbids restating framework metadata in a second
// language. The kit also declines a dependency on `@bridge/uir` (ADR-19, ADR-6: kits version independently of
// the schema hash). Both hold at once because **the kit does not need the enumeration — it needs lookup.**
// A role is a string here; the *generator* holds `MaterialRole` and checks, at build time, that every role a
// mapped widget paints is one the program's tokens define (`BRG3010`). Type safety sits where the schema is,
// and the kit stays a resolver.
//
// ## Determinism, SSR, and the absence of globals
//
// Nothing here reads a clock, a media query, `document`, or a module-scope variable. A surface is built from
// a `ThemeInstance` and a `Brightness` and is a pure function of the two, so the same theme renders the same
// bytes on a server and in a browser — which is what makes `renderToString` output match the client's first
// paint instead of triggering a hydration mismatch. Brightness lives in the theme's signal, which lives in a
// provider, which is per-request (ADR-15). There is no `darkMode` global to be one user's preference on
// another user's screen.

import type { CSSProperties } from 'react';

import { RuntimeDiagnosticCode, RuntimeError } from '../diagnostics/codes.js';
import { STATE_LAYER_OPACITY, surfaceTintOpacity } from '../generated/material_metadata.js';
import { cssColor, elevationOverlay, stateLayer, type Rgba } from './color.js';
import type { Brightness, ThemeInstance } from './theme.js';

/**
 * A typography token's value — the runtime form of Flutter's `TextStyle`.
 *
 * Field names are Flutter's, not CSS's, and deliberately: a typography token is extracted from a Dart
 * `TextStyle` and the value that reaches the theme should be the one the author wrote. {@link ThemeSurface}
 * translates to CSS at the point of use, which is the only place the translation belongs.
 */
export interface TypographyToken {
  /** The font family. Flutter's `fontFamily`. */
  readonly fontFamily?: string;
  /** The size, in logical pixels. Flutter's `fontSize`. */
  readonly fontSize?: number;
  /** The weight, 100–900. Flutter's `FontWeight`, whose `w400` *is* CSS's `400`. */
  readonly fontWeight?: number;
  /** Extra space between letters, in logical pixels. Flutter's `letterSpacing`. */
  readonly letterSpacing?: number;
  /**
   * The line height as a **multiple of `fontSize`** — Flutter's `height`, not a length.
   *
   * CSS's unitless `line-height` means the same thing, which is why this maps across without arithmetic. A
   * `height: 1.5` and a `line-height: 1.5` are the same line box.
   */
  readonly height?: number;
}

/**
 * The state a Material component is in, for {@link ThemeSurface.stateLayer}.
 *
 * Three, not four. M4-B declared a `dragged` member from the Material 3 specification; reading the Flutter
 * SDK for M4-C found that **no M3 defaults class assigns `WidgetState.dragged` an opacity** — the state
 * exists in Flutter, but the framework states no number for it. A member the catalog cannot supply a value
 * for is one every component would have had to invent, so it is gone rather than defaulted.
 *
 * `press` rather than `pressed`, matching the catalog's key, which matches Flutter's own `overlayColor`
 * naming in `_ElevatedButtonDefaultsM3`.
 */
export type InteractionState = 'hover' | 'focus' | 'press';

/**
 * Everything a Material component may know about the theme.
 *
 * Obtained from `useThemeSurface()`, which subscribes the calling component to brightness — so a component
 * that reads a colour re-renders when the theme flips, with no theme-changed event and no second
 * notification channel (ADR-4: reactivity is the signal graph, and the theme is not an exception).
 *
 * Every accessor throws `BRG4006` rather than returning a default. A theme with a hole in it still looks like
 * a theme (ADR-13's phrase), and painting a safe grey where a token should be hides the defect behind a
 * plausible screen. The generator catches the same hole at build time, so reaching one of these throws in
 * practice means a hand-written theme rather than a generated one.
 */
export interface ThemeSurface {
  /** The brightness these values were resolved at. */
  readonly brightness: Brightness;

  /**
   * A colour role → a CSS colour value.
   *
   * The one way a colour reaches the DOM. Handles the ARGB-vs-RGBA distinction ADR-21 exists for, so a
   * component never sees a hex string.
   *
   * @param role - a Material role name, e.g. `surface`, `primary`, `outlineVariant`.
   * @returns a CSS colour, e.g. `rgb(103 80 164)`.
   * @throws RuntimeError - `BRG4006` if the theme defines no such token, `BRG4007` if its value is not a colour.
   */
  color(role: string): string;

  /**
   * A colour role → its parsed channels, for composition.
   *
   * For components that must blend — a state layer over a container, a tint over a surface. Prefer
   * {@link color} when the colour is used as-is.
   *
   * @param role - a Material role name.
   * @returns the parsed colour.
   * @throws RuntimeError - `BRG4006` / `BRG4007`, as {@link color}.
   */
  rgba(role: string): Rgba;

  /**
   * Whether the theme defines a token.
   *
   * The one non-throwing accessor, for a component with a genuinely optional treatment — a `Card` that paints
   * a `surfaceTint` when the theme has one and a flat surface when it does not, both of which are correct
   * Material. Not an excuse to swallow a missing required role.
   *
   * @param name - a token name.
   * @returns whether it resolves.
   */
  has(name: string): boolean;

  /**
   * A spacing token → logical pixels.
   *
   * @param name - a token in the `space` group.
   * @returns the spacing.
   * @throws RuntimeError - `BRG4006` if undefined, `BRG4007` if its value is not a number.
   */
  space(name: string): number;

  /**
   * A radius token → logical pixels.
   *
   * @param name - a token in the `radius` group.
   * @returns the radius.
   * @throws RuntimeError - `BRG4006` if undefined, `BRG4007` if its value is not a number.
   */
  radius(name: string): number;

  /**
   * A typography token → the CSS text declarations for it.
   *
   * @param name - a token in the `typography` group.
   * @returns `fontFamily`, `fontSize`, `fontWeight`, `letterSpacing` and `lineHeight`, each present only if
   * the token states it — an unstated field must not override an inherited one.
   * @throws RuntimeError - `BRG4006` if undefined, `BRG4007` if its value is not a typography object.
   */
  typography(name: string): TypographyToken;

  /**
   * The surface colour at an elevation — M3's tinted surface.
   *
   * Material 3 expresses elevation as a *tint* rather than a shadow alone: a raised surface is its `surface`
   * role blended toward `surfaceTint`, more strongly the higher it sits. That blend is composition, which
   * ADR-13 puts on the kit's side of the line ("functions of component state, which the compiler cannot
   * know") — and it is why this returns a colour rather than a shadow.
   *
   * Takes an **elevation in logical pixels**, not a level index: that is what Flutter takes
   * (`Card(elevation: 2)`), and M3's own levels are the six elevations 0/1/3/6/8/12 rather than 0–5. The
   * opacity curve is generated from the catalog, which transcribes Flutter's own interpolation stops, so a
   * value between two stops interpolates exactly as Flutter's `ElevationOverlay` interpolates it.
   *
   * @param elevation - the elevation, in logical pixels.
   * @returns the tinted surface colour, as CSS.
   * @throws RuntimeError - `BRG4006` if `surface` or `surfaceTint` is undefined.
   */
  elevation(elevation: number): string;

  /**
   * A Material state layer: the `on*` role painted over a container at the state's opacity.
   *
   * What makes a hovered button a different colour from a resting one. Both colours are roles; the opacity
   * is generated from the catalog, which transcribes Flutter's own M3 button defaults.
   *
   * @param base - the resting colour's role, e.g. `primary`.
   * @param overlay - the state layer's role, e.g. `onPrimary`.
   * @param state - which interaction.
   * @returns the composited colour, as CSS.
   * @throws RuntimeError - `BRG4006` if any of the three tokens is undefined.
   */
  stateLayer(base: string, overlay: string, state: InteractionState): string;
}

function notANumber(name: string, value: unknown): RuntimeError {
  return new RuntimeError(
    RuntimeDiagnosticCode.InvalidToken,
    `token '${name}' resolved to ${typeof value}, and this accessor needs a number`,
    [name],
  );
}

/**
 * Builds the surface a component sees, for one theme at one brightness.
 *
 * A pure function of its two arguments, which is what lets the React layer memoise it on exactly those two
 * and hand every component in a subtree the same object. Kept out of the React layer entirely so that it can
 * be tested — and used by a future non-React kit — without a renderer.
 *
 * @param theme - the live theme, from a `ThemeProvider`.
 * @param brightness - the brightness to resolve at. Passed rather than read from `theme.brightness` so that
 * the caller owns the subscription: reading the signal here would subscribe whoever *built* the surface
 * rather than whoever *uses* it, which in React is the provider rather than the component.
 * @returns the surface.
 */
export function createThemeSurface(theme: ThemeInstance, brightness: Brightness): ThemeSurface {
  // `theme.color`/`theme.token` read `theme.brightness` themselves. That is the reactive path used by
  // `useDerived`, and it is the wrong one here: this surface is built for an explicit brightness, and must
  // resolve at that one even if it is built outside a reactive context. `at` is the non-reactive read.
  const at = (name: string): unknown => theme.tokenAt(name, brightness);

  const rgba = (role: string): Rgba => theme.colorAt(role, brightness);

  const numeric = (name: string): number => {
    const value = at(name);
    if (typeof value !== 'number') throw notANumber(name, value);
    return value;
  };

  return {
    brightness,
    color: (role) => cssColor(rgba(role)),
    rgba,
    has: (name) => theme.has(name),
    space: numeric,
    radius: numeric,
    typography(name) {
      const value = at(name);
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new RuntimeError(
          RuntimeDiagnosticCode.InvalidToken,
          `token '${name}' resolved to ${typeof value}, and a typography token is an object of TextStyle fields`,
          [name],
        );
      }
      return value as TypographyToken;
    },
    elevation(elevation) {
      const opacity = surfaceTintOpacity(elevation);
      return cssColor(elevationOverlay(rgba('surface'), rgba('surfaceTint'), opacity));
    },
    stateLayer(base, overlay, state) {
      return cssColor(stateLayer(rgba(base), rgba(overlay), STATE_LAYER_OPACITY[state] ?? 0));
    },
  };
}

/**
 * The theme's declarations for a typography token, or nothing when the theme has none.
 *
 * ## Why this is optional where a colour role is required
 *
 * INV-20 makes a missing *colour* a hard error: a component that cannot resolve `surface` has no honest
 * colour to paint, and `BRG4006` is right. Typography is not in the same position, and M4-G's runtime tests
 * are what established that — every shell component threw `BRG4006` for `labelMedium` on a theme built from
 * `ColorScheme.fromSeed`, which is what the build proof itself uses.
 *
 * The reason is that **N10 derives colours and nothing else**. It expands a seed into the 46 Material colour
 * roles because ADR-13 puts palette derivation in the compiler; Material's *type scale* has no equivalent
 * pass, so no program that does not state a `TextTheme` has a `labelMedium` to resolve. Making it required
 * would refuse every application in the corpus — including this project's own build proof — for a token the
 * compiler never produces.
 *
 * So a component applies the theme's type when the theme states it and inherits when it does not. Omitting a
 * declaration is not the same as inventing one: the label renders at the inherited size, which is a smaller
 * and visible divergence rather than a wrong value that looks deliberate. A Material type scale in the
 * catalog would close it, and is a milestone of its own — see `docs/m4/m4g-shells-and-navigation.md` §9.
 *
 * @param theme - the surface to read from.
 * @param name - the typography token, e.g. `labelMedium`.
 * @returns the declarations, or an empty object.
 */
export function typographyIfDefined(theme: ThemeSurface, name: string): CSSProperties {
  return theme.has(name) ? theme.typography(name) : {};
}
