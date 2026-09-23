// `dart:core` `StringBuffer` — the subset real code uses: construct (optionally with initial content), `write`, `writeln`, `toString`.
//
// A `StringBuffer` is a *mutable object with identity*: two references to one buffer see each other's writes, which a string
// concatenation cannot model, so it is a class, not a helper. Every method takes **text**: Dart's `write(Object? obj)` writes
// `"$obj"`, and turning a value into its Dart text depends on its static type (a `double` `1.0` prints `1.0`), which only the
// generator knows — it does the conversion at the call site, exactly as it does for string interpolation, and passes the result.
//
// `writeln` appends `\n` — always, not the platform's separator, as in Dart. The result of `toString()` is the concatenation of
// everything written, in call order. What is not here (`length`, `isEmpty`, `writeAll`, `writeCharCode`, `clear`) is refused by
// the generator rather than approximated; each needs its own evidence.

export class DartStringBuffer {
  private content: string;

  constructor(content = '') {
    this.content = content;
  }

  /** `write(obj)`: appends the text of `obj`. */
  write(text: string): void {
    this.content += text;
  }

  /** `writeln([obj])`: appends the text of `obj` (nothing when omitted), then a newline. */
  writeln(text = ''): void {
    this.content += `${text}\n`;
  }

  toString(): string {
    return this.content;
  }
}
