// TextInputFormatter — the edit filters of a text field (ADR-0074).
//
// Flutter runs each formatter over every edit (`formatEditUpdate(oldValue, newValue)`), in order, and the field shows what the last returns. Here
// the value is the text (the caret is the browser's), and a formatter maps `(old, new)` to the text to keep. Measured against `flutter test`:
// `digitsOnly` removes everything that is not `0`–`9` (ASCII only — an Arabic-Indic digit is removed), and `LengthLimitingTextInputFormatter(n)`
// keeps the first `n` *characters*, where a character is a grapheme cluster, not a UTF-16 unit.
//
// `FilteringTextInputFormatter.allow`/`.deny` take a `RegExp`, which the generator refuses everywhere (a Dart `RegExp` is not a JavaScript one), so
// they are not here: a program that writes one gets a diagnostic, never a filter that silently does nothing.

/** Flutter's `TextInputFormatter`, reduced to the text. */
export abstract class TextInputFormatter {
  /** The text to keep after an edit from `oldText` to `newText`. */
  public abstract formatEditUpdate(oldText: string, newText: string): string;
}

const segmenter: { segment(input: string): Iterable<{ segment: string }> } | undefined = (
  globalThis as { Intl?: { Segmenter?: new (locale?: string, options?: { granularity: 'grapheme' }) => { segment(input: string): Iterable<{ segment: string }> } } }
).Intl?.Segmenter
  ? new (globalThis as unknown as { Intl: { Segmenter: new (l?: string, o?: { granularity: 'grapheme' }) => { segment(i: string): Iterable<{ segment: string }> } } }).Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : undefined;

/** The grapheme clusters of `text` (code points where the platform has no segmenter). */
function characters(text: string): string[] {
  return segmenter === undefined ? Array.from(text) : Array.from(segmenter.segment(text), (part) => part.segment);
}

class DigitsOnlyFormatter extends TextInputFormatter {
  public formatEditUpdate(_oldText: string, newText: string): string {
    return newText.replace(/[^0-9]/g, '');
  }
}

/** Flutter's `FilteringTextInputFormatter`, for the one filter that needs no `RegExp`: `digitsOnly`. */
export class FilteringTextInputFormatter extends TextInputFormatter {
  /** Keeps only the ASCII digits `0`–`9`. */
  public static readonly digitsOnly: TextInputFormatter = new DigitsOnlyFormatter();

  public formatEditUpdate(_oldText: string, newText: string): string {
    return newText;
  }
}

/** Flutter's `LengthLimitingTextInputFormatter(maxLength)`: keeps the first `maxLength` characters. */
export class LengthLimitingTextInputFormatter extends TextInputFormatter {
  private readonly maxLength: number | null;

  public constructor(maxLength: number | null) {
    super();
    if (maxLength !== null && maxLength <= 0 && maxLength !== -1) {
      throw new RangeError('`LengthLimitingTextInputFormatter` needs a positive maxLength (or -1 for no limit).');
    }
    this.maxLength = maxLength === -1 ? null : maxLength;
  }

  public formatEditUpdate(_oldText: string, newText: string): string {
    if (this.maxLength === null) return newText;
    const parts = characters(newText);
    return parts.length <= this.maxLength ? newText : parts.slice(0, this.maxLength).join('');
  }
}

/** Applies `formatters` in order, as Flutter does; a formatter that changes nothing is a no-op. */
export function applyFormatters(formatters: readonly TextInputFormatter[] | null | undefined, oldText: string, newText: string): string {
  let text = newText;
  for (const formatter of formatters ?? []) text = formatter.formatEditUpdate(oldText, text);
  return text;
}
