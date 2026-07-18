// Colour composition — the kit's half of ADR-13.
//
// ## The ownership line this module sits on
//
// ADR-13 splits theme ownership at a clean line, on measured evidence: the colours copied verbatim from
// `ThemeData` were pixel-exact, and the colours guessed were wrong by up to 15/255 per channel. So:
//
// - **The compiler owns the palette.** N10 derives the full Material role set with
//   `material_color_utilities` — the same package Flutter itself uses — and emits it as `app.Token` nodes.
//   Deriving at runtime would mean re-implementing Material's algorithm inside *every* kit, and would put a
//   non-deterministic-by-default computation on the render path.
// - **The kit owns composition.** Elevation overlays, state layers and opacity blends are functions of
//   *component state* — hover, pressed, focus, disabled — which the compiler cannot know. This module is
//   that, and only that.
//
// ADR-13 attributes the two defects it measured to the two owners separately: the AppBar's Δ4 is a
// surface-tint composition defect and belongs here; the button's Δ15 was a role-derivation defect and
// belongs to N10. This module exists to make the first kind fixable without touching the compiler.
//
// ## INV-20, and why there is not one colour value in this file
//
// > every colour a mapped Material widget paints must resolve to an `app.Token`. Generated code and kit
// > components contain no literal colour values.
//
// Every function here takes its colours as arguments. There is no default, no fallback shade, no
// `#FFFFFF`. A literal here would be a colour no token accounts for and no Figma sync would export.
//
// ## Why the opacities are parameters too
//
// Material's state-layer opacities (hover, focus, pressed, dragged) are *framework metadata*, and ADR-18 is
// unambiguous about where that lives: "Every framework catalog originates from a single declarative source
// and is generated into every runtime that needs it." `catalog/widgets/material.json` does not carry them
// today, and inventing them here would hand-write framework metadata in a second language — the exact
// mistake ADR-18 records the project having already paid for twice. So composition takes the opacity; the
// widget layer supplies it, from the catalog, when it lands.

import { RuntimeDiagnosticCode, RuntimeError } from '../diagnostics/codes.js';

/** A colour with straight (non-premultiplied) alpha. Channels are 0–255; `alpha` is 0–1. */
export interface Rgba {
  /** Red, 0–255. */
  readonly r: number;
  /** Green, 0–255. */
  readonly g: number;
  /** Blue, 0–255. */
  readonly b: number;
  /** Opacity, 0–1. */
  readonly alpha: number;
}

const HEX_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function invalid(value: string, why: string): RuntimeError {
  return new RuntimeError(
    RuntimeDiagnosticCode.InvalidColor,
    `'${value}' is not a colour the runtime can read: ${why}. ` +
      `Colour tokens are hex strings — N10 emits '#RRGGBB' (ADR-13)`,
    [value],
  );
}

function clampChannel(value: number): number {
  // Rounds half away from zero and clamps. Blending produces fractions, and a channel of 255.4 or -0.2 is a
  // rounding artefact, not a colour.
  return Math.min(255, Math.max(0, Math.round(value)));
}

function pair(hex: string, index: number): number {
  return Number.parseInt(hex.slice(index, index + 2), 16);
}

/**
 * Parses a colour token's value (ADR-21).
 *
 * | form | meaning |
 * | --- | --- |
 * | `#RRGGBB` | opaque. What N10 emits for a derived Material role. |
 * | `#AARRGGBB` | **alpha first** — Flutter's `Color.value`. What the analyzer emits for a colour the author wrote. |
 * | `#RGB` | shorthand for `#RRGGBB`. Hand-written themes and overrides. |
 *
 * **`#RRGGBBAA` — CSS's ordering — is not accepted**, and that is the point of ADR-21. `#FFF6F6FA` is valid
 * under both readings and means two different colours, so a parser taking both cannot be right, only lucky.
 * `material_color_utilities` — the package Flutter itself uses, and the one N10 reads eight-digit values
 * through — puts alpha first, so the whole system does.
 *
 * Throws rather than falling back to a default colour: a theme with an unreadable token is a theme with a
 * hole in it, and — as ADR-13 puts it about a different hole — a theme with a hole in it still looks like a
 * theme. Painting some safe grey would hide the defect behind a plausible screen.
 *
 * @param value - a hex colour string.
 * @returns the parsed colour.
 * @throws RuntimeError - `BRG4007` if `value` is not a hex colour.
 */
export function parseColor(value: string): Rgba {
  if (!HEX_PATTERN.test(value)) {
    throw invalid(value, 'expected #RGB, #RRGGBB or #AARRGGBB');
  }
  const hex = value.slice(1);
  if (hex.length === 3) {
    // #abc means #aabbcc — each digit is doubled, not zero-padded.
    const expanded = [...hex].map((digit) => digit + digit).join('');
    return { r: pair(expanded, 0), g: pair(expanded, 2), b: pair(expanded, 4), alpha: 1 };
  }
  if (hex.length === 8) {
    // ARGB: the leading pair is alpha, and the colour starts two digits in.
    return { r: pair(hex, 2), g: pair(hex, 4), b: pair(hex, 6), alpha: pair(hex, 0) / 255 };
  }
  return { r: pair(hex, 0), g: pair(hex, 2), b: pair(hex, 4), alpha: 1 };
}

/**
 * Formats a colour as a hex string: `#RRGGBB` when opaque, `#AARRGGBB` otherwise (ADR-21).
 *
 * Round-trips with {@link parseColor}, and matches N10's own output format for opaque colours — which is
 * what lets a composed colour be compared against a token in a test, or handed to a Figma sync, without
 * anyone having to know whether a human or the kit produced it.
 *
 * Alpha leads, because that is the ordering the rest of the system uses. This is not a CSS colour and must
 * not be pasted into a stylesheet as one; a translucent colour reaches the DOM through the composition
 * functions above, resolved against what is behind it.
 *
 * @param color - the colour.
 * @returns the hex string, uppercase.
 */
export function formatColor(color: Rgba): string {
  const channel = (value: number): string =>
    clampChannel(value).toString(16).padStart(2, '0').toUpperCase();
  const rgb = `${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
  if (color.alpha >= 1) return `#${rgb}`;
  return `#${channel(Math.max(0, Math.min(1, color.alpha)) * 255)}${rgb}`;
}

/**
 * Formats a colour for CSS — `rgb(r g b)` when opaque, `rgb(r g b / a)` otherwise.
 *
 * **Not** {@link formatColor}, and the difference is the whole reason both exist. `formatColor` writes the
 * project's interchange form, `#AARRGGBB`, which CSS reads as `#RRGGBBAA` — the exact confusion ADR-21 was
 * written about, and pasting one into a stylesheet is how a colour arrives shifted by a byte with an alpha
 * nobody asked for. So a colour reaches the DOM through this function and no other, and the two forms cannot
 * be swapped by accident because they do not look alike.
 *
 * Space-separated syntax (CSS Color 4) rather than `rgba(r, g, b, a)`: one form covers both opaque and
 * translucent, so there is no branch that could disagree with itself, and every browser Next 15 supports
 * parses it.
 *
 * @param color - the colour.
 * @returns a CSS colour value.
 */
export function cssColor(color: Rgba): string {
  const r = clampChannel(color.r);
  const g = clampChannel(color.g);
  const b = clampChannel(color.b);
  if (color.alpha >= 1) return `rgb(${r} ${g} ${b})`;
  // Rounded to three places: an alpha is a ratio, and the full float would put a value like
  // `0.12000000000000001` in a style attribute, making the emitted bytes depend on floating-point noise.
  const alpha = Math.round(Math.max(0, Math.min(1, color.alpha)) * 1000) / 1000;
  return `rgb(${r} ${g} ${b} / ${alpha})`;
}

/**
 * Composites `foreground` over `background` using the standard source-over rule.
 *
 * The one place alpha is actually resolved. Everything else here is a special case of it.
 *
 * @param foreground - the colour on top; its `alpha` drives the blend.
 * @param background - the colour underneath.
 * @returns the composite. Opaque when `background` is opaque.
 */
export function alphaBlend(foreground: Rgba, background: Rgba): Rgba {
  const fa = Math.max(0, Math.min(1, foreground.alpha));
  const ba = Math.max(0, Math.min(1, background.alpha));
  const alpha = fa + ba * (1 - fa);
  if (alpha === 0) return { r: 0, g: 0, b: 0, alpha: 0 };
  const mix = (f: number, b: number): number => (f * fa + b * ba * (1 - fa)) / alpha;
  return {
    r: mix(foreground.r, background.r),
    g: mix(foreground.g, background.g),
    b: mix(foreground.b, background.b),
    alpha,
  };
}

/**
 * Applies a Material state layer: `overlay` at `opacity`, composited over `base`.
 *
 * This is what makes a hovered button a different colour from a resting one. Material 3 paints the "on"
 * role over the container at a state-dependent opacity; both colours come from tokens and the opacity comes
 * from the caller (see this module's header on ADR-18).
 *
 * @param base - the resting colour, from a token.
 * @param overlay - the state layer colour, from a token (typically the matching `on*` role).
 * @param opacity - the layer's opacity, 0–1, from the widget layer.
 * @returns the composited colour.
 */
export function stateLayer(base: Rgba, overlay: Rgba, opacity: number): Rgba {
  return alphaBlend({ ...overlay, alpha: Math.max(0, Math.min(1, opacity)) }, base);
}

/**
 * Applies a Material 3 elevation overlay: `surfaceTint` over `surface` at `opacity`.
 *
 * M3 expresses elevation as a tint rather than a shadow alone — a raised surface is its `surface` role
 * tinted toward `surfaceTint`. ADR-13 measured the AppBar rendering 4/255 per channel off the Flutter
 * reference and attributed it to exactly this composition; that defect is fixable here, in the kit, without
 * regenerating any application (ADR-6).
 *
 * @param surface - the `surface` role's colour.
 * @param surfaceTint - the `surfaceTint` role's colour.
 * @param opacity - the tint opacity for the elevation level, 0–1, from the widget layer.
 * @returns the tinted surface.
 */
export function elevationOverlay(surface: Rgba, surfaceTint: Rgba, opacity: number): Rgba {
  return stateLayer(surface, surfaceTint, opacity);
}

/**
 * Scales a colour's opacity — Flutter's `Color.withOpacity`.
 *
 * @param color - the colour.
 * @param opacity - the new opacity, 0–1. Replaces the existing alpha rather than multiplying it, which is
 * what `withOpacity` does in Flutter.
 * @returns the colour at `opacity`.
 */
export function withOpacity(color: Rgba, opacity: number): Rgba {
  return { ...color, alpha: Math.max(0, Math.min(1, opacity)) };
}
