// The theme runtime — token resolution and brightness, under ADR-13.
//
// ## What a theme is here
//
// A flat set of tokens, each with a light value and optionally a dark one, plus the current brightness. That
// is the whole model, and it is the whole model because UIR's is: there is no `app.Theme` node — a theme is
// a set of `app.Token`s (`group`, `name`, `light`, `dark`, and `role` for colours).
//
// ## Why the input is a projection of `app.Token` and not `app.Token`
//
// ADR-19. `app.Token` carries `id`, `span`, `anchor` and `ext` — content-addressed identity and source
// provenance, which exist so the compiler can attribute diagnostics and dedupe nodes. A runtime resolving
// `surface` for a hovered button needs `name → value`. The generator projects; the kit consumes the
// projection and takes no dependency on the schema's version (`UIR_SCHEMA_HASH` changes whenever the schema
// does — it changed last week for v2.4 §A17 — and ADR-6 requires kits to version independently).
//
// The value shapes are N10's, not invented here: colour tokens are hex strings (`hexFromArgb(...)
// .toUpperCase()`, so `#RRGGBB`); other groups carry whatever JSON their group implies, which the schema
// leaves as `unknown` (`x-uir-json: true`) and so does this module.
//
// ## Brightness is a signal, which is what makes theming reactive
//
// `theme.color('primary')` reads the brightness signal, so any `derived` or `effect` that resolves a token
// is subscribed to brightness and re-runs when it flips. No separate notification channel, no theme-changed
// event: ADR-4 says reactivity is the signal graph, and the theme is not an exception to it. This is also
// what closes the M0-T4 finding recorded in ADR-11 — the hand-written React reference "had to pin the light
// theme rather than invent a resolution", because a toggle crossing a route boundary had nowhere to live.
// Here it lives in a store, like any other cross-route state.

import { RuntimeDiagnosticCode, RuntimeError } from '../diagnostics/codes.js';
import { signal, type WritableSignal } from '../state/graph.js';
import { parseColor, type Rgba } from './color.js';

/** Which of a token's two values resolves. The runtime form of Flutter's `Brightness`. */
export type Brightness = 'light' | 'dark';

/** A token's family, mirroring `app.Token.group`. */
export type TokenGroup = 'color' | 'typography' | 'space' | 'radius' | 'shadow' | 'motion';

/**
 * One design token — the generator's projection of an `app.Token` node.
 *
 * @see ADR-13 for why colour values are derived by the compiler rather than computed here.
 */
export interface TokenDescriptor {
  /** The token name within its group, e.g. `primary`. From `app.Token.name`. */
  readonly name: string;
  /** The token family. From `app.Token.group`. */
  readonly group: TokenGroup;
  /** The value in the light scheme. For colours, a hex string. From `app.Token.light`. */
  readonly light: unknown;
  /**
   * The value in the dark scheme, when the theme defines one. From `app.Token.dark`.
   *
   * Absent means *this token does not vary by brightness* — a radius or a spacing usually does not — and the
   * light value resolves in both. It does not mean "dark is missing".
   */
  readonly dark?: unknown;
}

/** A theme: the token set the generator emitted. Immutable. */
export interface ThemeDescriptor {
  /** Every token in the theme. */
  readonly tokens: readonly TokenDescriptor[];
}

/** Options for {@link createTheme}. */
export interface ThemeOptions {
  /** The brightness to start in. Defaults to `light`. */
  readonly brightness?: Brightness;
}

/** A live theme. Created per provider, like a store (ADR-15). */
export interface ThemeInstance {
  /**
   * The current brightness. Writable: flipping it re-resolves every token read and re-runs everything
   * subscribed, because token reads track it.
   */
  readonly brightness: WritableSignal<Brightness>;
  /** Every token name in the theme, in the order the descriptor listed them. */
  readonly names: readonly string[];
  /** Whether the theme defines `name`. */
  has(name: string): boolean;
  /**
   * Resolves a token for the current brightness. **Reactive** — subscribes the caller to brightness.
   *
   * @throws RuntimeError - `BRG4006` if the theme does not define `name`.
   */
  token(name: string): unknown;
  /**
   * Resolves a colour token for the current brightness. **Reactive**.
   *
   * @throws RuntimeError - `BRG4006` if undefined, `BRG4007` if its value is not a colour.
   */
  color(name: string): Rgba;
  /** The group of a token, or `undefined` if the theme does not define it. Not reactive: groups are static. */
  groupOf(name: string): TokenGroup | undefined;
}

/**
 * Creates a live theme from a descriptor.
 *
 * @param descriptor - the token set, from the generator or hand-written.
 * @param options - the starting brightness.
 * @returns a live theme.
 *
 * @example
 * ```ts
 * // What the generator will emit for N10's derived role set. Hand-written here (ADR-19).
 * const theme = createTheme({
 *   tokens: [
 *     { name: 'primary', group: 'color', light: '#6750A4', dark: '#D0BCFF' },
 *     { name: 'gap', group: 'space', light: 8 },
 *   ],
 * });
 * theme.color('primary');          // { r: 103, g: 80, b: 164, alpha: 1 }
 * theme.brightness.set('dark');
 * theme.color('primary');          // { r: 208, g: 188, b: 255, alpha: 1 }
 * ```
 */
export function createTheme(descriptor: ThemeDescriptor, options: ThemeOptions = {}): ThemeInstance {
  const byName = new Map<string, TokenDescriptor>();
  for (const token of descriptor.tokens) byName.set(token.name, token);
  const names = Object.freeze(descriptor.tokens.map((token) => token.name));
  const brightness = signal<Brightness>(options.brightness ?? 'light');

  // Parsing is deterministic and the token set is immutable, so a parsed colour is cacheable for as long as
  // the theme lives. Keyed by brightness because that is the only thing that can change the answer.
  const colorCache = new Map<string, Rgba>();

  const lookup = (name: string): TokenDescriptor => {
    const token = byName.get(name);
    if (token === undefined) {
      throw new RuntimeError(
        RuntimeDiagnosticCode.UnknownToken,
        `the theme has no token '${name}'. Every colour a mapped widget paints must resolve to a ` +
          `token (INV-20), so a missing one is a hole in the theme rather than a value to default`,
        [name],
      );
    }
    return token;
  };

  const resolve = (name: string, at: Brightness): unknown => {
    const token = lookup(name);
    // A token with no `dark` does not vary by brightness; its light value is its value.
    if (at === 'dark' && token.dark !== undefined) return token.dark;
    return token.light;
  };

  return {
    brightness,
    names,
    has: (name) => byName.has(name),
    groupOf: (name) => byName.get(name)?.group,
    token(name) {
      return resolve(name, brightness.get());
    },
    color(name) {
      const at = brightness.get();
      const key = `${at}:${name}`;
      const cached = colorCache.get(key);
      if (cached !== undefined) return cached;
      const value = resolve(name, at);
      if (typeof value !== 'string') {
        throw new RuntimeError(
          RuntimeDiagnosticCode.InvalidColor,
          `token '${name}' resolved to ${typeof value}, not a colour string; ` +
            `its group is '${lookup(name).group}'`,
          [name],
        );
      }
      const parsed = parseColor(value);
      colorCache.set(key, parsed);
      return parsed;
    },
  };
}
