// `double.toString()` — M11-I.
//
// A Dart `double` and a JavaScript `number` are the same IEEE-754 binary64, and their decimal spellings agree
// almost everywhere — the digits, the exponent form (`1e+21`, `1e-7`), `NaN`, `Infinity`. They differ in
// exactly two places, both observed by running each language on the same values rather than assumed:
//
//   - an integral value below the exponent threshold: Dart prints `1.0`, `-3.0`, `100.0`; JavaScript prints
//     `1`, `-3`, `100`;
//   - negative zero: Dart prints `-0.0`; JavaScript prints `0`.
//
// The difference is not visible in the value — JavaScript has one number type, so `1` is both a Dart `int` and a
// Dart `double` — which is why this is a function the *generator* calls on a value whose static Dart type is
// `double`, and never one the runtime could apply on its own. A `num` is refused upstream for the same reason.
//
// Before this existed a `Text('$price')` on a `double` holding `3.0` rendered `3`, with no diagnostic anywhere.

/**
 * Dart's `double.toString()`.
 *
 * @param value - a JavaScript number that is a Dart `double`, or `null`/`undefined` for a nullable one.
 * @returns the text Dart prints; `"null"` for an absent value, as Dart's own interpolation does.
 */
export function doubleToString(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'null';
  if (Object.is(value, -0)) return '-0.0';
  const text = String(value);
  return Number.isInteger(value) && !text.includes('e') ? `${text}.0` : text;
}
