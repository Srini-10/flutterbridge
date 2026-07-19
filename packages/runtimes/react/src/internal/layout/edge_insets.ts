// EdgeInsets — the geometry `Padding` takes, mirrored from Flutter's `painting` library.
//
// ## Why this is a value type and not four numbers at the call site
//
// ADR-6's example is about `Row`, but the argument is the same one sentence down: `EdgeInsets.symmetric(
// vertical: 8)` must survive into the output as `EdgeInsets.symmetric({ vertical: 8 })`, not be folded into
// `paddingTop: 8; paddingBottom: 8`. Folding loses the fact that the author said *symmetric* — and a
// reviewer reading the generated file next to the Dart it came from is the whole override workflow. It also
// puts the definition of "symmetric" in ten thousand files instead of one, so the day it needs to respect
// text direction there is nowhere to change it.
//
// ## The two absent values, and why they are not the same absent value
//
// Dart's optional named parameters here are **non-nullable with a default**: `EdgeInsets.symmetric({double
// vertical = 0.0})` cannot be passed `null`, and "not passed" is the only way to be absent. It means zero.
// So these take `vertical?: number` and deliberately not `vertical?: number | undefined` — under
// `exactOptionalPropertyTypes` that rejects an explicit `undefined`, which leaves exactly one way to be
// absent, exactly as Dart has. `ElevatedButton.onPressed` is the opposite case and `button.ts` says why;
// the difference is not stylistic, and collapsing the two would make a disabled button and an unstyled one
// indistinguishable.
//
// ## Units
//
// Logical pixels, which is what Flutter measures in and what CSS's `px` already is: both are
// density-independent and both are scaled by the device pixel ratio at paint. There is no conversion here
// because there is no conversion to do — see `widgets.ts`'s note on how the number reaches the DOM.

/**
 * An offset on each of a box's four sides, in logical pixels — the runtime form of Flutter's `EdgeInsets`.
 *
 * Plain readonly data rather than a class, because three things need to read it and none of them want
 * methods: the generator emits it as a literal, tests compare it with `toEqual`, and a future token export
 * serialises it. Flutter's own `EdgeInsets` is immutable data too — the class buys encapsulation of nothing.
 *
 * Construct it with {@link EdgeInsets}'s named constructors rather than writing the object literal, so the
 * intent (`all`, `symmetric`, `only`) stays legible in the emitted code.
 */
export interface EdgeInsets {
  /** The offset from the top edge. Becomes `padding-top`. */
  readonly top: number;
  /** The offset from the right edge. Becomes `padding-right`. */
  readonly right: number;
  /** The offset from the bottom edge. Becomes `padding-bottom`. */
  readonly bottom: number;
  /** The offset from the left edge. Becomes `padding-left`. */
  readonly left: number;
}

/**
 * The named constructors for {@link EdgeInsets}, mirroring Flutter's.
 *
 * Same names, same defaults, same shape — an unspecified side is `0`, as in Dart. Mirroring the API rather
 * than improving it is the point: the generator's output should be recognisably the Dart it came from, and a
 * constructor we invented would be one more thing a reviewer has to translate.
 *
 * A frozen module-scope constant holding only pure functions. ADR-15 forbids module-scope *state*; this
 * holds none, and could not — every method returns a fresh object and reads nothing outside its arguments.
 *
 * @example
 * ```ts
 * EdgeInsets.all(16);                            // { top: 16, right: 16, bottom: 16, left: 16 }
 * EdgeInsets.symmetric({ horizontal: 24 });      // { top: 0, right: 24, bottom: 0, left: 24 }
 * EdgeInsets.only({ top: 8 });                   // { top: 8, right: 0, bottom: 0, left: 0 }
 * ```
 */
export const EdgeInsets = Object.freeze({
  /**
   * The same offset on all four sides — Flutter's `EdgeInsets.all`.
   *
   * @param value - the offset, in logical pixels.
   * @returns the insets.
   */
  all(value: number): EdgeInsets {
    return { top: value, right: value, bottom: value, left: value };
  },

  /**
   * Offsets symmetric about each axis — Flutter's `EdgeInsets.symmetric`.
   *
   * `vertical` is top *and* bottom; `horizontal` is left *and* right. Both default to `0`, as in Dart, so
   * `symmetric({ vertical: 8 })` is a vertical gap with no horizontal one rather than an error.
   *
   * @param sides - the two axes. An omitted axis is `0`.
   * @returns the insets.
   */
  symmetric(sides: { readonly vertical?: number; readonly horizontal?: number }): EdgeInsets {
    const vertical = sides.vertical ?? 0;
    const horizontal = sides.horizontal ?? 0;
    return { top: vertical, right: horizontal, bottom: vertical, left: horizontal };
  },

  /**
   * Offsets on named sides only — Flutter's `EdgeInsets.only`.
   *
   * Every side defaults to `0`, so `only({})` is `EdgeInsets.zero` by construction rather than by a second
   * constant that could drift from it.
   *
   * @param sides - the sides to offset. An omitted side is `0`.
   * @returns the insets.
   */
  only(sides: {
    readonly top?: number;
    readonly right?: number;
    readonly bottom?: number;
    readonly left?: number;
  }): EdgeInsets {
    return {
      top: sides.top ?? 0,
      right: sides.right ?? 0,
      bottom: sides.bottom ?? 0,
      left: sides.left ?? 0,
    };
  },
});
