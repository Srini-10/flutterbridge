// `dart:core` `String` operations whose JavaScript spelling is not the same operation (ADR-0054).
//
// Until M11 the generator emitted `s.padLeft(5, '*')`, `s.contains('a')`, `s.isEmpty` — the Dart member name on a
// JavaScript string — with no diagnostic. A string has no `isEmpty`, so `s.isEmpty` was `undefined` (falsy): a
// validator's "required" branch never ran. These are the lowerings, verified differentially against real Dart.
//
// Where Dart throws (`RangeError`) these throw `BRG4015` instead of doing what JavaScript does: `'abc'.substring(5)` is
// `''` in JavaScript, and an exception in Dart.

import { RuntimeDiagnosticCode, RuntimeError } from '../diagnostics/codes.js';

function fail(operation: string, message: string): never {
  throw new RuntimeError(RuntimeDiagnosticCode.StringOperation, `\`String.${operation}\`: ${message}`);
}

/** `s.substring(start, [end])` — Dart throws a `RangeError` for `start < 0`, `start > length`, `end < start`, `end > length`. */
export function strSubstring(s: string, start: number, end?: number): string {
  const stop = end ?? s.length;
  if (!Number.isInteger(start) || start < 0 || start > s.length) {
    fail('substring', `start ${start} is out of range for length ${s.length} (Dart: RangeError).`);
  }
  if (!Number.isInteger(stop) || stop < start || stop > s.length) {
    fail('substring', `end ${stop} is out of range [${start}, ${s.length}] (Dart: RangeError).`);
  }
  return s.slice(start, stop);
}

/** `s.codeUnitAt(i)` — Dart throws a `RangeError` where JavaScript's `charCodeAt` returns `NaN`. */
export function strCodeUnitAt(s: string, index: number): number {
  if (!Number.isInteger(index) || index < 0 || index >= s.length) {
    fail('codeUnitAt', `index ${index} is out of range for length ${s.length} (Dart: RangeError).`);
  }
  return s.charCodeAt(index);
}

/** `s.padLeft(width, [padding])` — the padding is repeated `width - length` times, so a multi-character padding overshoots (`padStart` truncates it). */
export function strPadLeft(s: string, width: number, padding = ' '): string {
  const delta = width - s.length;
  return delta <= 0 ? s : padding.repeat(delta) + s;
}

/** `s.padRight(width, [padding])`. */
export function strPadRight(s: string, width: number, padding = ' '): string {
  const delta = width - s.length;
  return delta <= 0 ? s : s + padding.repeat(delta);
}

/** `s * times` — an empty string for `times <= 0`. */
export function strRepeat(s: string, times: number): string {
  return times <= 0 ? '' : s.repeat(times);
}

/**
 * `s.replaceAll(from, to)` for a `String` pattern. JavaScript's `replaceAll` interprets `$&`, `$1`, `` $` `` in the
 * replacement; Dart does not. An empty pattern matches between every code unit and at both ends.
 */
export function strReplaceAll(s: string, from: string, to: string): string {
  if (from === '') {
    let out = to;
    for (let i = 0; i < s.length; i++) out += (s[i] as string) + to;
    return out;
  }
  return s.split(from).join(to);
}

/** `s.replaceFirst(from, to)` for a `String` pattern (no `$` interpretation; an empty pattern inserts at the start). */
export function strReplaceFirst(s: string, from: string, to: string): string {
  const at = s.indexOf(from);
  return at < 0 ? s : s.slice(0, at) + to + s.slice(at + from.length);
}
