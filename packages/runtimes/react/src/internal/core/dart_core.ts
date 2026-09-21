// `dart:core` / `dart:async` top-level functions the generated code calls (M12).

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
