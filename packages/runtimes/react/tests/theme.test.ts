import { describe, expect, it, vi } from 'vitest';

import {
  alphaBlend,
  createTheme,
  derived,
  effect,
  elevationOverlay,
  formatColor,
  parseColor,
  RuntimeError,
  stateLayer,
  withOpacity,
  type ThemeDescriptor,
} from '../src/index.js';

// The theme runtime (M3-A), against ADR-13's ownership split.
//
// ADR-13 divides theming on measured evidence: the colours copied verbatim from `ThemeData` were exact, the
// colours guessed were wrong. So the compiler owns the *palette* (N10 derives it with the same package
// Flutter uses) and the kit owns *composition* (state layers, elevation overlays, opacity blends — all
// functions of component state, which the compiler cannot know).
//
// These tests are about the kit's half. That the palette is right is N10's problem and VR-1's (ADR-12); that
// a hovered button composes correctly *from* the palette is this package's.
//
// The token values here are real N10 output shapes: `hexFromArgb(...).toUpperCase()`, so `#RRGGBB`.

/** A theme in the shape the generator will project from `app.Token` nodes. */
const theme: ThemeDescriptor = {
  tokens: [
    { name: 'primary', group: 'color', light: '#6750A4', dark: '#D0BCFF' },
    { name: 'onPrimary', group: 'color', light: '#FFFFFF', dark: '#381E72' },
    { name: 'surface', group: 'color', light: '#FEF7FF', dark: '#141218' },
    { name: 'surfaceTint', group: 'color', light: '#6750A4', dark: '#D0BCFF' },
    { name: 'gap', group: 'space', light: 8 },
    { name: 'corner', group: 'radius', light: 12, dark: 12 },
  ],
};

describe('token resolution follows brightness', () => {
  it('resolves the light value in light and the dark value in dark', () => {
    const instance = createTheme(theme);

    expect(instance.token('primary')).toBe('#6750A4');
    instance.brightness.set('dark');
    expect(instance.token('primary')).toBe('#D0BCFF');
  });

  it('starts in the brightness it was given', () => {
    expect(createTheme(theme, { brightness: 'dark' }).token('primary')).toBe('#D0BCFF');
    expect(createTheme(theme).token('primary')).toBe('#6750A4');
  });

  it('resolves a token with no dark value to its light value in both', () => {
    const instance = createTheme(theme);
    expect(instance.token('gap')).toBe(8);

    instance.brightness.set('dark');

    // A token without `dark` does not vary by brightness — a spacing rarely does. Absent is not missing, and
    // treating it as missing would make every gap in the app throw the moment dark mode was switched on.
    expect(instance.token('gap')).toBe(8);
  });

  it('parses a colour token into channels', () => {
    expect(createTheme(theme).color('primary')).toEqual({ r: 0x67, g: 0x50, b: 0xa4, alpha: 1 });
  });

  it('reports its token names and groups without resolving anything', () => {
    const instance = createTheme(theme);
    expect(instance.names).toContain('primary');
    expect(instance.has('primary')).toBe(true);
    expect(instance.has('nonexistent')).toBe(false);
    expect(instance.groupOf('gap')).toBe('space');
    expect(instance.groupOf('nonexistent')).toBeUndefined();
  });
});

describe('a missing or unreadable token is a defect, not a default', () => {
  it('throws BRG4006 for a token the theme does not define', () => {
    try {
      createTheme(theme).token('nonexistent');
      expect.unreachable('reading an undefined token should throw');
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeError);
      expect((error as RuntimeError).code).toBe('BRG4006');
    }
  });

  it('throws rather than painting a safe grey', () => {
    // INV-20: every colour a mapped widget paints resolves to a token. A fallback colour would be a colour
    // no token accounts for, no Figma sync would export, and no visual diff would attribute — it would hide
    // the hole behind a plausible screen.
    expect(() => createTheme(theme).color('nonexistent')).toThrow(RuntimeError);
  });

  it('throws BRG4007 when a colour token’s value is not a colour', () => {
    const broken = createTheme({ tokens: [{ name: 'primary', group: 'color', light: 42 }] });
    try {
      broken.color('primary');
      expect.unreachable('a non-string colour should throw');
    } catch (error) {
      expect((error as RuntimeError).code).toBe('BRG4007');
    }
  });

  it('throws BRG4007 for a malformed hex string', () => {
    const broken = createTheme({ tokens: [{ name: 'primary', group: 'color', light: 'purple' }] });
    expect(() => broken.color('primary')).toThrow(/BRG4007/);
  });
});

describe('theme propagation is the signal graph, not a second mechanism', () => {
  it('re-runs an effect that read a token when brightness flips', () => {
    const instance = createTheme(theme);
    const seen: unknown[] = [];
    effect(() => {
      seen.push(instance.token('primary'));
    });

    instance.brightness.set('dark');

    expect(seen).toEqual(['#6750A4', '#D0BCFF']);
  });

  it('does not re-run a derivation whose token does not vary by brightness', () => {
    const instance = createTheme(theme);
    const compute = vi.fn(() => instance.token('gap'));
    const gap = derived(compute, 'gap');
    gap.get();

    instance.brightness.set('dark');
    gap.get();

    // `gap` is recomputed — it read `brightness`, which changed — but it recomputes to 8, so nothing
    // downstream of it re-renders (ADR-20 R3). Flipping the theme must not repaint the whole tree.
    expect(compute).toHaveBeenCalledTimes(2);
    expect(gap.peek()).toBe(8);

    const runs = vi.fn();
    effect(() => {
      gap.get();
      runs();
    });
    runs.mockClear();
    instance.brightness.set('light');
    expect(runs).not.toHaveBeenCalled();
  });

  it('gives two theme instances independent brightness', () => {
    const first = createTheme(theme);
    const second = createTheme(theme);

    first.brightness.set('dark');

    // Brightness is mutable state, so ADR-15 applies to it exactly as it does to a cart: on a shared module
    // it would be one user's dark mode on another user's screen.
    expect(first.token('primary')).toBe('#D0BCFF');
    expect(second.token('primary')).toBe('#6750A4');
  });
});

describe('colour parsing round-trips', () => {
  it('parses the #RRGGBB form N10 emits', () => {
    expect(parseColor('#6750A4')).toEqual({ r: 103, g: 80, b: 164, alpha: 1 });
  });

  it('expands the #RGB shorthand by doubling each digit', () => {
    // `#abc` is `#aabbcc`, not `#a0b0c0`.
    expect(parseColor('#ABC')).toEqual(parseColor('#AABBCC'));
  });

  it('reads alpha from the front of the #AARRGGBB form (ADR-21)', () => {
    // Flutter's `Color.value` is 0xAARRGGBB and the analyzer formats it verbatim, so the leading pair is
    // alpha. Reading it from the back — CSS's #RRGGBBAA — is the defect ADR-21 records.
    expect(parseColor('#80000000').alpha).toBeCloseTo(128 / 255, 5);
    expect(parseColor('#803F51B5')).toEqual({ r: 0x3f, g: 0x51, b: 0xb5, alpha: 128 / 255 });
  });

  it('reads hello_bridge\u2019s real scaffoldBackgroundColor correctly', () => {
    // The regression. `Color(0xFFF6F6FA)` in fixtures/apps/hello_bridge/lib/main.dart, formatted by the
    // analyzer as `#FFF6F6FA`. Read as CSS #RRGGBBAA it is rgb(255,246,246) at 98% \u2014 every channel shifted a
    // byte, plus an alpha the source never asked for. It is a different colour, on every colour the author
    // wrote, in every generated application, and no schema check or type could catch it (ADR-21).
    expect(parseColor('#FFF6F6FA')).toEqual({ r: 246, g: 246, b: 250, alpha: 1 });
    expect(parseColor('#FF3F51B5')).toEqual({ r: 0x3f, g: 0x51, b: 0xb5, alpha: 1 });
  });

  it('agrees with material-color-utilities, which is what N10 reads eight digits through', () => {
    // argbFromHex slices (2,4),(4,6),(6,8) for eight digits. The compiler has always read ARGB; the kit was
    // the only component that disagreed.
    expect(parseColor('#FFF6F6FA')).toEqual(parseColor('#F6F6FA'));
  });

  it('is case-insensitive', () => {
    expect(parseColor('#6750a4')).toEqual(parseColor('#6750A4'));
  });

  it('formats back to the form it was parsed from', () => {
    expect(formatColor(parseColor('#6750A4'))).toBe('#6750A4');
  });

  it('formats a translucent colour with alpha leading', () => {
    expect(formatColor({ r: 0, g: 0, b: 0, alpha: 128 / 255 })).toBe('#80000000');
  });

  it('round-trips a translucent eight-digit value', () => {
    for (const value of ['#803F51B5', '#00FFFFFF']) {
      expect(formatColor(parseColor(value)), value).toBe(value);
    }
  });

  it('canonicalises an opaque eight-digit value to six digits', () => {
    // `#FFF6F6FA` and `#F6F6FA` are the same colour, and the six-digit form is the one N10 emits. Formatting
    // to the canonical form is what lets a composed colour be compared against a derived token without the
    // comparison having to know which producer wrote it.
    expect(formatColor(parseColor('#FFF6F6FA'))).toBe('#F6F6FA');
  });

  it('refuses anything that is not a hex colour, with BRG4007', () => {
    for (const bad of ['', 'purple', '#', '#12', '#12345', 'rgb(1,2,3)', '6750A4', '#GGGGGG']) {
      expect(() => parseColor(bad), bad).toThrow(RuntimeError);
    }
  });
});

describe('composition — the kit’s half of ADR-13', () => {
  it('composites an opaque foreground to itself', () => {
    const front = parseColor('#FF0000');
    expect(alphaBlend(front, parseColor('#0000FF'))).toEqual(front);
  });

  it('composites a fully transparent foreground to the background', () => {
    const back = parseColor('#0000FF');
    expect(alphaBlend(withOpacity(parseColor('#FF0000'), 0), back)).toEqual(back);
  });

  it('composites a half-transparent black over white to the midpoint', () => {
    const result = alphaBlend(withOpacity(parseColor('#000000'), 0.5), parseColor('#FFFFFF'));
    expect(formatColor(result)).toBe('#808080');
  });

  it('applies a state layer at the opacity it is given', () => {
    // Material paints the `on` role over the container at a state-dependent opacity. Both colours come from
    // tokens; the opacity comes from the caller — the widget layer, from the catalog (ADR-18) — because a
    // Material constant hand-written here would be framework metadata in a second language.
    const resting = parseColor('#FFFFFF');
    const layer = parseColor('#000000');

    expect(formatColor(stateLayer(resting, layer, 0))).toBe('#FFFFFF');
    expect(formatColor(stateLayer(resting, layer, 1))).toBe('#000000');
    expect(formatColor(stateLayer(resting, layer, 0.5))).toBe('#808080');
  });

  it('tints a surface toward surfaceTint for elevation', () => {
    const instance = createTheme(theme);
    const surface = instance.color('surface');
    const tint = instance.color('surfaceTint');

    const raised = elevationOverlay(surface, tint, 0.05);

    // ADR-13 measured the AppBar 4/255 per channel off the Flutter reference and attributed it to exactly
    // this composition. A raised surface must move toward the tint and stay opaque.
    expect(formatColor(raised)).not.toBe(formatColor(surface));
    expect(raised.alpha).toBe(1);
    expect(raised.r).toBeLessThan(surface.r);
  });

  it('is monotonic in opacity: more tint moves further from the surface', () => {
    const instance = createTheme(theme);
    const surface = instance.color('surface');
    const tint = instance.color('surfaceTint');
    const distance = (opacity: number): number =>
      Math.abs(elevationOverlay(surface, tint, opacity).r - surface.r);

    expect(distance(0.05)).toBeLessThan(distance(0.11));
    expect(distance(0.11)).toBeLessThan(distance(0.15));
  });

  it('clamps an out-of-range opacity rather than producing an impossible colour', () => {
    const base = parseColor('#FFFFFF');
    const layer = parseColor('#000000');
    expect(formatColor(stateLayer(base, layer, -1))).toBe('#FFFFFF');
    expect(formatColor(stateLayer(base, layer, 2))).toBe('#000000');
  });

  it('withOpacity replaces alpha rather than multiplying it, as Flutter’s does', () => {
    const half = withOpacity(parseColor('#FF0000'), 0.5);
    expect(withOpacity(half, 0.5).alpha).toBe(0.5);
  });

  it('is deterministic: the same composition twice is the same bytes', () => {
    const instance = createTheme(theme);
    const once = formatColor(elevationOverlay(instance.color('surface'), instance.color('surfaceTint'), 0.08));
    const twice = formatColor(elevationOverlay(instance.color('surface'), instance.color('surfaceTint'), 0.08));
    expect(once).toBe(twice);
  });
});
