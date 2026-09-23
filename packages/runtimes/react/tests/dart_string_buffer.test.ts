import { describe, expect, it } from 'vitest';

import { DartStringBuffer } from '../src/index.js';

// `DartStringBuffer` takes text only — the generator turns each Dart argument into its Dart text at the call site — so what is checked here is the
// buffer itself: append order, `writeln`'s newline, and identity. Every expected string below is what real Dart printed for the same calls
// (`fixtures/apps/string_buffer_semantics/test/expected.json`, recorded by `flutter test`); the value *conversions* are compared there, end to end.

describe('DartStringBuffer', () => {
  it('starts empty, or with initial content', () => {
    expect(new DartStringBuffer().toString()).toBe('');
    expect(new DartStringBuffer('x').toString()).toBe('x');
    expect(new DartStringBuffer('').toString()).toBe('');
  });

  it('appends in call order', () => {
    const b = new DartStringBuffer('₹');
    b.write('-');
    b.write('12,34,567');
    b.write('.50');
    expect(b.toString()).toBe('₹-12,34,567.50');
  });

  it('`writeln` appends the text, then `\\n` — and only `\\n`; with no argument it appends just the newline', () => {
    const b = new DartStringBuffer();
    b.writeln();
    b.writeln('a');
    b.write('b');
    b.writeln('1');
    expect(b.toString()).toBe('\na\nb1\n');
    expect(b.toString()).not.toContain('\r');
  });

  it('is an object with identity: two references see each other`s writes (`a=xyz b=xyz` in Dart)', () => {
    const a = new DartStringBuffer('x');
    const b = a;
    b.write('y');
    a.write('z');
    expect(a.toString()).toBe('xyz');
    expect(b.toString()).toBe('xyz');
    expect(a).toBe(b);
    expect(new DartStringBuffer('xyz')).not.toBe(a);
  });

  it('interpolates as its content, as `"$buffer"` does in Dart', () => {
    const b = new DartStringBuffer('go');
    b.write('!');
    expect(`${b} | [${b}]`).toBe('go! | [go!]');
  });

  it('`toString()` is a snapshot: later writes do not change a string already taken', () => {
    const b = new DartStringBuffer('a');
    const before = b.toString();
    b.write('b');
    expect(before).toBe('a');
    expect(b.toString()).toBe('ab');
  });

  it('keeps every UTF-16 code unit, including surrogate pairs and a string that contains the separator', () => {
    const b = new DartStringBuffer();
    b.write('😀');
    b.write('a,b\n');
    expect(b.toString()).toBe('😀a,b\n');
  });
});
