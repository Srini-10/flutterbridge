// `dart:core` / `dart:async` top-level functions the generated code calls (M12).

import { DartFormatException } from './dart_exceptions.js';

/**
 * `unawaited(future)` — starts nothing, waits for nothing: the future's own work is already running. The lint it silences is the
 * only thing it does in Dart, so it does nothing here.
 */
export function unawaited(_future: unknown): void {
  // Intentionally empty.
}

const identityHashes = new WeakMap<object, number>();
let nextIdentityHash = 1;

function hashOf(value: unknown): number {
  if (value === null || value === undefined) return 2011; // the VM's `null.hashCode`
  switch (typeof value) {
    case 'number':
      return Number.isInteger(value) ? value | 0 : hashString(String(value));
    case 'boolean':
      return value ? 1231 : 1237; // Java/Dart's own constants for `true`/`false`
    case 'string':
      return hashString(value);
    case 'bigint':
      return hashString(value.toString());
    default: {
      const own = (value as { hashCode?: unknown }).hashCode;
      if (typeof own === 'number') return own | 0;
      let id = identityHashes.get(value as object);
      if (id === undefined) {
        id = nextIdentityHash++;
        identityHashes.set(value as object, id);
      }
      return id;
    }
  }
}

function hashString(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (Math.imul(hash, 31) + text.charCodeAt(i)) | 0;
  return hash;
}

/**
 * `Object.hashAll(values)` — a 32-bit hash that combines the elements' hashes in order, so equal sequences of equal values hash
 * equal. **Not Dart's numbers:** Dart's are unspecified across VMs and versions, and nothing may depend on them; only the
 * contract (`a == b` ⇒ same hash) is kept.
 */
export function dartHashAll(values: Iterable<unknown>): number {
  let hash = 17;
  for (const value of values) hash = (Math.imul(hash, 1000003) ^ hashOf(value)) | 0;
  return hash & 0x3fffffff;
}

/** `Object.hash(a, b, …)`. */
export function dartHash(...values: unknown[]): number {
  return dartHashAll(values);
}

const constTokens = new Map<string, object>();

/**
 * The value of a `const` variable the program does not compile (a package's). Dart canonicalises constants, so the value is one
 * object however often it is read: this returns one frozen object per declaration, which keeps identity and `==` exact. It has
 * no members — the program cannot use the value for anything but comparing it.
 */
export function dartConstToken(declaration: string): object {
  let token = constTokens.get(declaration);
  if (token === undefined) {
    token = Object.freeze({ toString: () => `Instance of '${declaration}'` });
    constTokens.set(declaration, token);
  }
  return token;
}

/** `throw e` in expression position: a call, typed `never`, so it composes (`x ?? dartThrow(new Error())`). */
export function dartThrow(error: unknown): never {
  throw error;
}

/** A map entry `[key, value]`, typed as a tuple, so `new Map([...])` infers through spreads and `if`/`for` elements. */
export function dartEntry<K, V>(key: K, value: V): [K, V] {
  return [key, value];
}

/**
 * `value as T`: Dart's checked downcast. Returns `value` typed as `T`, or throws a `TypeError` naming both types, as Dart does.
 * `test` is the runtime test the generator derived from `T`.
 */
export function dartAs<T>(value: unknown, test: (value: unknown) => boolean, typeName: string): T {
  if (test(value)) return value as T;
  const actual =
    value === null || value === undefined
      ? 'Null'
      : Array.isArray(value)
        ? 'List'
        : value instanceof Map
          ? 'Map'
          : typeof value === 'object'
            ? (value as object).constructor.name
            : typeof value;
  throw new TypeError(`type '${actual}' is not a subtype of type '${typeName}' in type cast`);
}

/** `int.parse(source, radix:)`: an optional sign and digits (or `0x` hex); anything else is a `FormatException`. */
export function dartIntParse(source: string, radix?: number): number {
  const parsed = dartIntTryParse(source, radix);
  if (parsed === null) throw new DartFormatException(`Invalid radix-${radix ?? 10} number`, source);
  return parsed;
}

/** `int.tryParse`. */
export function dartIntTryParse(source: string, radix?: number): number | null {
  const text = source.trim();
  const base = radix ?? (/^[+-]?0x/i.test(text) ? 16 : 10);
  const body = base === 16 ? text.replace(/^([+-]?)0x/i, '$1') : text;
  const digits = '0123456789abcdefghijklmnopqrstuvwxyz'.slice(0, base);
  if (!new RegExp(`^[+-]?[${digits}]+$`, 'i').test(body)) return null;
  const value = Number.parseInt(body, base);
  return Number.isSafeInteger(value) ? value : null;
}

/** `double.parse(source)`. */
export function dartDoubleParse(source: string): number {
  const parsed = dartDoubleTryParse(source);
  if (parsed === null) throw new DartFormatException('Invalid double', source);
  return parsed;
}

/** `double.tryParse`. */
export function dartDoubleTryParse(source: string): number | null {
  const text = source.trim();
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text)) return Number(text);
  if (/^[+-]?Infinity$/.test(text)) return text.startsWith('-') ? -Infinity : Infinity;
  if (text === 'NaN') return Number.NaN;
  return null;
}
