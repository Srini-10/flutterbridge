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

// ── List: search, fold and combine (read-only) ────────────────────────────────────────────────────

/** `list.firstWhere(test, orElse:)`: the first match; `orElse()` when there is none; otherwise Dart throws a `StateError`. */
export function listFirstWhere<T>(list: Iterable<T>, test: (value: T) => boolean, orElse?: () => T): T {
  for (const value of list) if (test(value)) return value;
  if (orElse !== undefined && orElse !== null) return orElse();
  return fail('firstWhere', 'no element matches (Dart: StateError "No element").');
}

/** `list.lastWhere(test, orElse:)`. */
export function listLastWhere<T>(list: Iterable<T>, test: (value: T) => boolean, orElse?: () => T): T {
  const items = Array.from(list);
  for (let i = items.length - 1; i >= 0; i--) if (test(items[i] as T)) return items[i] as T;
  if (orElse !== undefined && orElse !== null) return orElse();
  return fail('lastWhere', 'no element matches (Dart: StateError "No element").');
}

/** `list.singleWhere(test, orElse:)`: the one match; more than one is a `StateError`. */
export function listSingleWhere<T>(list: Iterable<T>, test: (value: T) => boolean, orElse?: () => T): T {
  let found: { value: T } | undefined;
  for (const value of list) {
    if (!test(value)) continue;
    if (found !== undefined) return fail('singleWhere', 'more than one element matches (Dart: StateError "Too many elements").');
    found = { value };
  }
  if (found !== undefined) return found.value;
  if (orElse !== undefined && orElse !== null) return orElse();
  return fail('singleWhere', 'no element matches (Dart: StateError "No element").');
}

/** `list.fold(initial, combine)`. */
export function listFold<T, R>(list: Iterable<T>, initial: R, combine: (previous: R, element: T) => R): R {
  let value = initial;
  for (const element of list) value = combine(value, element);
  return value;
}

/** `list.reduce(combine)`: an empty list is a `StateError`. */
export function listReduce<T>(list: Iterable<T>, combine: (previous: T, element: T) => T): T {
  const items = Array.from(list);
  if (items.length === 0) return fail('reduce', 'the collection is empty (Dart: StateError "No element").');
  let value = items[0] as T;
  for (let i = 1; i < items.length; i++) value = combine(value, items[i] as T);
  return value;
}

/** `list.expand(f)`. */
export function listExpand<T, R>(list: Iterable<T>, transform: (value: T) => Iterable<R>): R[] {
  const out: R[] = [];
  for (const value of list) out.push(...transform(value));
  return out;
}

/** `list.indexWhere(test, start)`: -1 when there is none. */
export function listIndexWhere<T>(list: readonly T[], test: (value: T) => boolean, start = 0): number {
  for (let i = start; i < list.length; i++) if (test(list[i] as T)) return i;
  return -1;
}

/** `list.takeWhile(test)`. */
export function listTakeWhile<T>(list: Iterable<T>, test: (value: T) => boolean): T[] {
  const out: T[] = [];
  for (const value of list) {
    if (!test(value)) break;
    out.push(value);
  }
  return out;
}

/** `list.skipWhile(test)`. */
export function listSkipWhile<T>(list: Iterable<T>, test: (value: T) => boolean): T[] {
  const out: T[] = [];
  let skipping = true;
  for (const value of list) {
    if (skipping && test(value)) continue;
    skipping = false;
    out.push(value);
  }
  return out;
}

/** `list.followedBy(other)`. */
export function listFollowedBy<T>(list: Iterable<T>, other: Iterable<T>): T[] {
  return [...list, ...other];
}

/** `list.toSet()`. */
export function listToSet<T>(list: Iterable<T>): Set<T> {
  return new Set(list);
}

/** `list.elementAt(index)`. */
export function listElementAt<T>(list: readonly T[], index: number): T {
  rangeCheck('elementAt', index, list.length);
  return list[index] as T;
}

/** `list.every(test)`. */
export function listEvery<T>(list: Iterable<T>, test: (value: T) => boolean): boolean {
  for (const value of list) if (!test(value)) return false;
  return true;
}

/** `list.single`: a list of exactly one element. */
export function listSingle<T>(list: readonly T[]): T {
  if (list.length !== 1) return fail('single', list.length === 0 ? 'the collection is empty (Dart: StateError).' : 'more than one element (Dart: StateError).');
  return list[0] as T;
}

/** `list.firstOrNull`. */
export function listFirstOrNull<T>(list: readonly T[]): T | null {
  return list.length === 0 ? null : (list[0] as T);
}

/** `list.lastOrNull`. */
export function listLastOrNull<T>(list: readonly T[]): T | null {
  return list.length === 0 ? null : (list[list.length - 1] as T);
}

/** `List.from(iterable)` / `List.of` / `Iterable.toList`: a new growable list. */
export function listFrom<T>(source: Iterable<T>): T[] {
  return Array.from(source);
}

/** `List.generate(count, f)`. */
export function listGenerate<T>(count: number, generator: (index: number) => T): T[] {
  if (count < 0) return fail('List.generate', 'the length is negative (Dart: RangeError).');
  return Array.from({ length: count }, (_, index) => generator(index));
}

/** `List.filled(count, value)`. */
export function listFilled<T>(count: number, value: T): T[] {
  if (count < 0) return fail('List.filled', 'the length is negative (Dart: RangeError).');
  return Array.from({ length: count }, () => value);
}

// ── Set: algebra (read-only) ──────────────────────────────────────────────────────────────────────

/** `a.union(b)`. */
export function setUnion<T>(a: ReadonlySet<T>, b: Iterable<T>): Set<T> {
  return new Set([...a, ...b]);
}

/** `a.intersection(b)`. */
export function setIntersection<T>(a: ReadonlySet<T>, b: ReadonlySet<unknown>): Set<T> {
  return new Set(Array.from(a).filter((value) => b.has(value)));
}

/** `a.difference(b)`. */
export function setDifference<T>(a: ReadonlySet<T>, b: ReadonlySet<unknown>): Set<T> {
  return new Set(Array.from(a).filter((value) => !b.has(value)));
}

/** `a.containsAll(b)`. */
export function setContainsAll<T>(a: ReadonlySet<T>, b: Iterable<unknown>): boolean {
  for (const value of b) if (!a.has(value as T)) return false;
  return true;
}

/** `Set.from(iterable)` / `Set.of`. */
export function setFrom<T>(source: Iterable<T>): Set<T> {
  return new Set(source);
}

// ── Map ───────────────────────────────────────────────────────────────────────────────────────────

/** `map.forEach((key, value) { … })`. */
export function mapForEach<K, V>(map: ReadonlyMap<K, V>, action: (key: K, value: V) => void): void {
  for (const [key, value] of Array.from(map)) action(key, value);
}

/** `map.update(key, update, ifAbsent:)`. */
export function mapUpdate<K, V>(map: Map<K, V>, key: K, update: (value: V) => V, ifAbsent?: () => V): V {
  if (map.has(key)) {
    const next = update(map.get(key) as V);
    map.set(key, next);
    inheritOwners(next, map);
    notifyMutation(map);
    return next;
  }
  if (ifAbsent === undefined || ifAbsent === null) return fail('update', `the key is absent and no ifAbsent was given (Dart: ArgumentError).`);
  const created = ifAbsent();
  map.set(key, created);
  inheritOwners(created, map);
  notifyMutation(map);
  return created;
}

/** `map.removeWhere((key, value) => …)`. */
export function mapRemoveWhere<K, V>(map: Map<K, V>, test: (key: K, value: V) => boolean): void {
  let changed = false;
  for (const [key, value] of Array.from(map)) {
    if (test(key, value)) {
      map.delete(key);
      changed = true;
    }
  }
  if (changed) notifyMutation(map);
}

/** `map.map((key, value) => MapEntry(k, v))`: entries are `{ key, value }`. */
export function mapMap<K, V, K2, V2>(map: ReadonlyMap<K, V>, transform: (key: K, value: V) => { readonly key: K2; readonly value: V2 }): Map<K2, V2> {
  const out = new Map<K2, V2>();
  for (const [key, value] of map) {
    const entry = transform(key, value);
    out.set(entry.key, entry.value);
  }
  return out;
}

/** `Map.from(other)` / `Map.of`. */
export function mapFrom<K, V>(source: ReadonlyMap<K, V>): Map<K, V> {
  return new Map(source);
}

/** `Map.fromEntries(entries)`: entries are `{ key, value }`. */
export function mapFromEntries<K, V>(entries: Iterable<{ readonly key: K; readonly value: V }>): Map<K, V> {
  const out = new Map<K, V>();
  for (const entry of entries) out.set(entry.key, entry.value);
  return out;
}

/** `MapEntry(key, value)`. */
export function mapEntry<K, V>(key: K, value: V): { readonly key: K; readonly value: V } {
  return { key, value };
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
