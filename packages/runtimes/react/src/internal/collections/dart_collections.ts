// Dart `List`, `Set` and `Map` operations — M11 (ADR-0051).
//
// A Dart `List` is a JavaScript array, a `Set` a `Set`, a `Map` a `Map`, and the generator emits **calls into this
// file** for their methods rather than the same-named JavaScript ones. The names coincide often enough to look safe,
// and it is exactly the coincidences that are wrong — each observed by running Dart and JavaScript on the same values:
//
//   `[10, 9, 1].sort()`      Dart [1, 9, 10]        JavaScript [1, 10, 9]   (default comparator is string order)
//   `['a','b'].join()`       Dart "ab"              JavaScript "a,b"
//   `map['zzz']`             Dart null              a JavaScript `Map` has no such property: `undefined`
//   `set.add(x)`             Dart returns whether x was new; JavaScript returns the set
//   `list.removeAt(9)`       Dart throws RangeError  `splice` silently does nothing
//
// ## Mutation
//
// Every mutator here changes its argument **in place**, returns Dart's result, and then tells the graph
// (`notifyMutation`): every signal that holds the collection is touched. In place is what preserves identity —
// `final other = items; items.add(1)` reaches `other`, as in Dart — and announcing from the helper, rather than from the
// call site, is what makes it right for an alias, a prop or a nested list, none of which the call site can name
// (ADR-0051). A collection no signal holds — a local — has no owners, and the announcement costs one `WeakMap` lookup.
//
// ## Errors
//
// Where Dart throws (`RangeError`, `StateError`, `ArgumentError`) these throw `BRG4014` rather than doing something
// else, so an out-of-range index cannot quietly corrupt state. The contract (ADR-0051) is equivalence for executions
// in which Dart does not throw; on the throwing path the generated program throws a different error.

import { RuntimeDiagnosticCode, RuntimeError } from '../diagnostics/codes.js';
import { inheritOwners, notifyMutation } from '../state/graph.js';

function fail(operation: string, message: string): never {
  throw new RuntimeError(RuntimeDiagnosticCode.CollectionOperation, `\`${operation}\`: ${message}`);
}

function rangeCheck(operation: string, index: number, length: number, inclusive = false): void {
  if (!Number.isInteger(index) || index < 0 || index > (inclusive ? length : length - 1)) {
    fail(operation, `index ${index} is out of range for a collection of length ${length} (Dart: RangeError).`);
  }
}

/** Dart's default `compareTo` for the types `sort()` accepts: numbers numerically, strings by UTF-16 code unit. */
export function defaultCompare(a: unknown, b: unknown): number {
  if ((typeof a === 'number' && typeof b === 'number') || (typeof a === 'string' && typeof b === 'string')) {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  return fail('sort', 'the default ordering needs numbers or strings; give sort a comparator (Dart: a non-Comparable element throws).');
}

// ── List: mutators ────────────────────────────────────────────────────────────────────────────────

/** `list.add(value)`. */
export function listAdd<T>(list: T[], value: T): void {
  list.push(value);
  inheritOwners(value, list);
  notifyMutation(list);
}

/** `list.addAll(values)`. The argument is copied first, so `list.addAll(list)` is well-defined. */
export function listAddAll<T>(list: T[], values: Iterable<T>): void {
  for (const value of Array.from(values)) {
    list.push(value);
    inheritOwners(value, list);
  }
  notifyMutation(list);
}

/** `list.insert(index, value)`; `index` may equal the length. */
export function listInsert<T>(list: T[], index: number, value: T): void {
  rangeCheck('insert', index, list.length, true);
  list.splice(index, 0, value);
  inheritOwners(value, list);
  notifyMutation(list);
}

/** `list.insertAll(index, values)`. */
export function listInsertAll<T>(list: T[], index: number, values: Iterable<T>): void {
  rangeCheck('insertAll', index, list.length, true);
  const inserted = Array.from(values);
  list.splice(index, 0, ...inserted);
  for (const value of inserted) inheritOwners(value, list);
  notifyMutation(list);
}

/** `list.remove(value)`: removes the first element `==` to it, and says whether there was one. */
export function listRemove<T>(list: T[], value: T): boolean {
  const index = list.indexOf(value);
  if (index < 0) return false;
  list.splice(index, 1);
  notifyMutation(list);
  return true;
}

/** `list.removeAt(index)`: the removed element. */
export function listRemoveAt<T>(list: T[], index: number): T {
  rangeCheck('removeAt', index, list.length);
  const removed = list.splice(index, 1)[0] as T;
  notifyMutation(list);
  return removed;
}

/** `list.removeLast()`: the removed element; throws on an empty list. */
export function listRemoveLast<T>(list: T[]): T {
  if (list.length === 0) fail('removeLast', 'the list is empty (Dart: StateError).');
  const removed = list.pop() as T;
  notifyMutation(list);
  return removed;
}

/** `list.removeWhere(test)`. */
export function listRemoveWhere<T>(list: T[], test: (value: T) => boolean): void {
  const kept = list.filter((value) => !test(value));
  const changed = kept.length !== list.length;
  list.length = 0;
  for (const value of kept) list.push(value);
  if (changed) notifyMutation(list);
}

/** `list.retainWhere(test)`. */
export function listRetainWhere<T>(list: T[], test: (value: T) => boolean): void {
  listRemoveWhere(list, (value) => !test(value));
}

/** `list.clear()`. */
export function listClear<T>(list: T[]): void {
  const changed = list.length > 0;
  list.length = 0;
  if (changed) notifyMutation(list);
}

/** `list.sort([compare])`. Numbers and strings order as Dart's `compareTo` does; anything else needs a comparator. */
export function listSort<T>(list: T[], compare?: (a: T, b: T) => number): void {
  list.sort(compare ?? defaultCompare);
  notifyMutation(list);
}

/** `list.shuffle()`. Unseeded, as Dart's is: the order is not reproducible in either language. */
export function listShuffle<T>(list: T[]): void {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j] as T, list[i] as T];
  }
  notifyMutation(list);
}

/** `list[index] = value`. */
export function listSetAt<T>(list: T[], index: number, value: T): void {
  rangeCheck('[]=', index, list.length);
  list[index] = value;
  inheritOwners(value, list);
  notifyMutation(list);
}

// ── List: reads ───────────────────────────────────────────────────────────────────────────────────

/** `list.first`; throws on an empty list. */
export function listFirst<T>(list: readonly T[]): T {
  if (list.length === 0) fail('first', 'the list is empty (Dart: StateError).');
  return list[0] as T;
}

/** `list.last`; throws on an empty list. */
export function listLast<T>(list: readonly T[]): T {
  if (list.length === 0) fail('last', 'the list is empty (Dart: StateError).');
  return list[list.length - 1] as T;
}

/** `list.contains(value)` — `==`, so `NaN` is never found (JavaScript's `includes` would find it). */
export function listContains<T>(list: readonly T[], value: T): boolean {
  return list.indexOf(value) >= 0;
}

/** `list.toList()`: a copy. */
export function listToList<T>(list: Iterable<T>): T[] {
  return Array.from(list);
}

/** `list.reversed` (consumed as a list): a reversed copy. */
export function listReversed<T>(list: readonly T[]): T[] {
  return list.slice().reverse();
}

/** `list.sublist(start, [end])`. */
export function listSublist<T>(list: readonly T[], start: number, end?: number): T[] {
  const stop = end ?? list.length;
  rangeCheck('sublist', start, list.length, true);
  rangeCheck('sublist', stop, list.length, true);
  if (start > stop) fail('sublist', `start ${start} is after end ${stop} (Dart: RangeError).`);
  return list.slice(start, stop);
}

/** `list.take(count)` (consumed as a list). */
export function listTake<T>(list: readonly T[], count: number): T[] {
  if (count < 0) fail('take', 'the count is negative (Dart: RangeError).');
  return list.slice(0, count);
}

/** `list.skip(count)` (consumed as a list). */
export function listSkip<T>(list: readonly T[], count: number): T[] {
  if (count < 0) fail('skip', 'the count is negative (Dart: RangeError).');
  return list.slice(count);
}

/** `list.where(test)` (consumed as a list). */
export function listWhere<T>(list: readonly T[], test: (value: T) => boolean): T[] {
  return list.filter((value) => test(value));
}

/** `list.map(transform)` (consumed as a list). */
export function listMap<T, R>(list: readonly T[], transform: (value: T) => R): R[] {
  return list.map((value) => transform(value));
}

/** `list.any(test)`. */
export function listAny<T>(list: readonly T[], test: (value: T) => boolean): boolean {
  return list.some((value) => test(value));
}

// ── Set ───────────────────────────────────────────────────────────────────────────────────────────

/** `set.add(value)`: whether it was new — JavaScript's `add` returns the set. */
export function setAdd<T>(set: Set<T>, value: T): boolean {
  const had = set.has(value);
  set.add(value);
  if (had) return false;
  inheritOwners(value, set);
  notifyMutation(set);
  return true;
}

/** `set.remove(value)`: whether it was present. */
export function setRemove<T>(set: Set<T>, value: unknown): boolean {
  const removed = set.delete(value as T);
  if (removed) notifyMutation(set);
  return removed;
}

/** `set.addAll(values)`. */
export function setAddAll<T>(set: Set<T>, values: Iterable<T>): void {
  for (const value of Array.from(values)) {
    set.add(value);
    inheritOwners(value, set);
  }
  notifyMutation(set);
}

/** `set.clear()`. */
export function setClear<T>(set: Set<T>): void {
  const changed = set.size > 0;
  set.clear();
  if (changed) notifyMutation(set);
}

/** `set.contains(value)`. */
export function setContains<T>(set: ReadonlySet<T>, value: unknown): boolean {
  return set.has(value as T);
}

/** `set.toList()`. */
export function setToList<T>(set: ReadonlySet<T>): T[] {
  return Array.from(set);
}

// ── Map ───────────────────────────────────────────────────────────────────────────────────────────

/** `map[key]`: the value, or `null` — Dart's, where a JavaScript `Map` has no such subscript at all. */
export function mapGet<K, V>(map: ReadonlyMap<K, V>, key: unknown): V | null {
  return map.get(key as K) ?? null;
}

/** `map[key] = value`. */
export function mapSet<K, V>(map: Map<K, V>, key: K, value: V): void {
  map.set(key, value);
  inheritOwners(key, map);
  inheritOwners(value, map);
  notifyMutation(map);
}

/** `map.remove(key)`: the removed value, or `null`. */
export function mapRemove<K, V>(map: Map<K, V>, key: unknown): V | null {
  const value = map.get(key as K) ?? null;
  if (map.delete(key as K)) notifyMutation(map);
  return value;
}

/** `map.putIfAbsent(key, ifAbsent)`: the existing value, or the newly stored one. */
export function mapPutIfAbsent<K, V>(map: Map<K, V>, key: K, ifAbsent: () => V): V {
  if (!map.has(key)) {
    const value = ifAbsent();
    map.set(key, value);
    inheritOwners(key, map);
    inheritOwners(value, map);
    notifyMutation(map);
  }
  return map.get(key) as V;
}

/** `map.addAll(other)`. */
export function mapAddAll<K, V>(map: Map<K, V>, other: ReadonlyMap<K, V>): void {
  for (const [key, value] of Array.from(other)) {
    map.set(key, value);
    inheritOwners(key, map);
    inheritOwners(value, map);
  }
  notifyMutation(map);
}

/** `map.clear()`. */
export function mapClear<K, V>(map: Map<K, V>): void {
  const changed = map.size > 0;
  map.clear();
  if (changed) notifyMutation(map);
}

/** `map.containsKey(key)`. */
export function mapContainsKey<K, V>(map: ReadonlyMap<K, V>, key: unknown): boolean {
  return map.has(key as K);
}

/** `map.containsValue(value)`. */
export function mapContainsValue<K, V>(map: ReadonlyMap<K, V>, value: unknown): boolean {
  for (const candidate of map.values()) if (candidate === value) return true;
  return false;
}

/** `map.keys`, consumed as a list. */
export function mapKeys<K, V>(map: ReadonlyMap<K, V>): K[] {
  return Array.from(map.keys());
}

/** `map.values`, consumed as a list. */
export function mapValues<K, V>(map: ReadonlyMap<K, V>): V[] {
  return Array.from(map.values());
}

/** `map.entries`, consumed as a list of `{ key, value }` — the shape of Dart's `MapEntry`. */
export function mapEntries<K, V>(map: ReadonlyMap<K, V>): { readonly key: K; readonly value: V }[] {
  return Array.from(map, ([key, value]) => ({ key, value }));
}
