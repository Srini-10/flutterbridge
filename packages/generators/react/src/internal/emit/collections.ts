// Dart `List` / `Set` / `Map` lowering — M11 (ADR-0051).
//
// A Dart collection is a JavaScript array / `Set` / `Map`, and its methods are lowered to calls into the runtime kit's
// `dart_collections` (exact Dart semantics — verified differentially against real Dart), never to the same-named
// JavaScript method. Until M11 the generator emitted `receiver.method(args)` for any of them, which was a `tsc` error for
// most names and *silently wrong* for the ones that coincide (`sort`, `join`, `Map[k]`, `Set.add`'s return value).
//
// ## Mutation
//
// A mutator changes its collection **in place**, so aliases see it as they do in Dart, and the runtime helper announces
// the change itself: every signal that holds the collection — directly, through an alias, a prop, or nested inside
// another State-held collection — is touched (`notifyMutation`, `state/graph.ts`). The generator therefore emits the bare
// helper for a State-held collection, a local and a prop alike:
//
//     _items.add(x)          →   listAdd(_items.get(), x)
//     _grid[0].add(x)        →   listAdd(_grid.get()[0], x)
//
// Emitting from the call site — "if the receiver is rooted at a signal, wrap it" — was the first design and it was
// wrong: an alias (`final a = _items; a.add(1)`), a collection passed down as a prop, and a nested list reached through a
// callback have no root the call site can name. Ownership is a runtime fact, so it is decided at runtime.
//
// ## What this file does not do
//
// It decides *which* helper. What a construct means, and what is refused, is ADR-0051's; anything without a row in the
// tables below is reported by the caller, never emitted as a JavaScript method of the same name.

type Node = Record<string, unknown>;

/** What the lowering needs from the expression emitter, passed in so this file imports none of it. */
export interface CollectionDeps {
  /** Emits an expression node. */
  readonly emit: (node: Node) => string;
  /** The text `emit` returns for a refused expression. */
  readonly refused: string;
  /** The generic-free `dart:core` name of a `TypeRef` — `Set<int>?` → `Set` — or `undefined`. */
  readonly baseType: (type: Node | undefined) => string | undefined;
  /** The full `dart:core` name of a `TypeRef` with its type arguments, nullability stripped. */
  readonly fullType: (type: Node | undefined) => string | undefined;
  /** Registers and returns the local name of a runtime-kit export. */
  readonly use: (name: string) => string;
}

/** One method: its runtime helper, and whether it changes the receiver in place. */
interface Row {
  readonly helper: string;
  readonly mutates: boolean;
  /** The argument counts accepted. */
  readonly arity: readonly number[];
}

const row = (helper: string, mutates: boolean, ...arity: number[]): Row => ({ helper, mutates, arity });

const LIST: Readonly<Record<string, Row>> = {
  add: row('listAdd', true, 1),
  addAll: row('listAddAll', true, 1),
  insert: row('listInsert', true, 2),
  insertAll: row('listInsertAll', true, 2),
  remove: row('listRemove', true, 1),
  removeAt: row('listRemoveAt', true, 1),
  removeLast: row('listRemoveLast', true, 0),
  removeWhere: row('listRemoveWhere', true, 1),
  retainWhere: row('listRetainWhere', true, 1),
  clear: row('listClear', true, 0),
  sort: row('listSort', true, 0, 1),
  shuffle: row('listShuffle', true, 0),
  contains: row('listContains', false, 1),
  toList: row('listToList', false, 0),
  sublist: row('listSublist', false, 1, 2),
  take: row('listTake', false, 1),
  skip: row('listSkip', false, 1),
  where: row('listWhere', false, 1),
  map: row('listMap', false, 1),
  any: row('listAny', false, 1),
  every: row('listEvery', false, 1),
  fold: row('listFold', false, 2),
  reduce: row('listReduce', false, 1),
  expand: row('listExpand', false, 1),
  indexWhere: row('listIndexWhere', false, 1, 2),
  takeWhile: row('listTakeWhile', false, 1),
  skipWhile: row('listSkipWhile', false, 1),
  followedBy: row('listFollowedBy', false, 1),
  toSet: row('listToSet', false, 0),
  elementAt: row('listElementAt', false, 1),
};

/** Methods with an `orElse:` named argument: the test is positional, the fallback a function. */
const SEARCH: Readonly<Record<string, string>> = {
  firstWhere: 'listFirstWhere',
  lastWhere: 'listLastWhere',
  singleWhere: 'listSingleWhere',
};

/** Same-meaning JavaScript methods, passed through: (name → accepted argument counts). */
const LIST_NATIVE: Readonly<Record<string, readonly number[]>> = {
  indexOf: [1],
  lastIndexOf: [1],
  forEach: [1],
};

const SET: Readonly<Record<string, Row>> = {
  union: row('setUnion', false, 1),
  intersection: row('setIntersection', false, 1),
  difference: row('setDifference', false, 1),
  containsAll: row('setContainsAll', false, 1),
  add: row('setAdd', true, 1),
  remove: row('setRemove', true, 1),
  addAll: row('setAddAll', true, 1),
  clear: row('setClear', true, 0),
  contains: row('setContains', false, 1),
  toList: row('setToList', false, 0),
};

const MAP: Readonly<Record<string, Row>> = {
  remove: row('mapRemove', true, 1),
  putIfAbsent: row('mapPutIfAbsent', true, 2),
  addAll: row('mapAddAll', true, 1),
  clear: row('mapClear', true, 0),
  containsKey: row('mapContainsKey', false, 1),
  containsValue: row('mapContainsValue', false, 1),
  forEach: row('mapForEach', false, 1),
  update: row('mapUpdate', true, 2, 3),
  removeWhere: row('mapRemoveWhere', true, 1),
  map: row('mapMap', false, 1),
};

/** The element types `List.sort()` orders without a comparator: Dart's `compareTo` exists and JavaScript agrees. */
const ORDERED: ReadonlySet<string> = new Set(['int', 'double', 'num', 'String']);

/** The type arguments of a generic type name — `Map<String, List<int>>` → `['String', 'List<int>']`. */
export function typeArgumentsOf(name: string | undefined): string[] {
  if (name === undefined) return [];
  const open = name.indexOf('<');
  if (open < 0 || !name.endsWith('>')) return [];
  const inner = name.slice(open + 1, -1);
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '<') depth++;
    else if (c === '>') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(inner.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(inner.slice(start).trim());
  return parts;
}

/** Whether `type` is one of the collection types this file lowers, and which. */
export function collectionKindOf(type: Node | undefined, deps: CollectionDeps): 'List' | 'Set' | 'Map' | 'Iterable' | undefined {
  const base = deps.baseType(type);
  return base === 'List' || base === 'Set' || base === 'Map' || base === 'Iterable' ? base : undefined;
}

/** The refusal text for a collection method with no row. */
export function unsupportedCollectionMethod(kind: string, method: string): string {
  const supported =
    kind === 'Map'
      ? Object.keys(MAP)
      : kind === 'Set'
        ? Object.keys(SET)
        : [...Object.keys(LIST), ...Object.keys(LIST_NATIVE), 'join'];
  return (
    `\`${kind}.${method}\` has no lowering yet. A Dart \`${kind}\` is not a JavaScript one, and this generator emits ` +
    `calls into exact-Dart runtime helpers rather than the same-named method (ADR-0051). Supported on a ` +
    `\`${kind}\`: ${supported.map((m) => `\`${m}\``).join(', ')}` +
    `${kind === 'Map' ? ', `[]`, `[]=`' : kind === 'List' ? ', `[]`, `[]=`' : ''}.`
  );
}

/**
 * Lowers `receiver.method(args)` on a `List`, `Set`, `Map` or `Iterable`.
 *
 * @returns the text; `deps.refused` after the caller-reported failure cases below return `undefined`; `undefined` when
 * the receiver is not a collection or the method has no row (the caller reports it).
 */
export function lowerCollectionMethod(node: Node, deps: CollectionDeps): string | undefined {
  const receiverNode = node['receiver'] as Node | undefined;
  const receiverType = receiverNode?.['type'] as Node | undefined;
  const kind = collectionKindOf(receiverType, deps);
  if (kind === undefined || receiverNode === undefined) return undefined;
  const method = String(node['method'] ?? '');
  const args = Array.isArray(node['args']) ? (node['args'] as Node[]) : [];

  // The subscript.
  if (method === '[]' && args.length === 1) {
    const receiver = deps.emit(receiverNode);
    const index = deps.emit(args[0] as Node);
    if (receiver === deps.refused || index === deps.refused) return deps.refused;
    // A `Map`'s subscript is not JavaScript's: `map['a']` on a `Map` is `undefined`, and Dart's is the value or `null`.
    return kind === 'Map' ? `${deps.use('mapGet')}(${receiver}, ${index})` : `${receiver}[${index}]`;
  }

  // An `Iterable` (what `where`/`map`/`take` return in Dart) is an array here, so it takes the list rows read-only.
  const effective = kind === 'Iterable' ? 'List' : kind;

  if (effective === 'List' && method === 'join' && args.length <= 1) {
    const receiver = deps.emit(receiverNode);
    if (receiver === deps.refused) return deps.refused;
    const separator = args.length === 0 ? "''" : deps.emit(args[0] as Node);
    return `${receiver}.join(${separator})`;
  }
  if (effective === 'List' && (Object.hasOwn(LIST_NATIVE, method) ? LIST_NATIVE[method] : undefined)?.includes(args.length) === true) {
    const receiver = deps.emit(receiverNode);
    const emitted = args.map((a) => deps.emit(a));
    if (receiver === deps.refused || emitted.includes(deps.refused)) return deps.refused;
    return `${receiver}.${method}(${emitted.join(', ')})`;
  }

  // `firstWhere(test, orElse: () => x)` and its siblings.
  const searchHelper = Object.hasOwn(SEARCH, method) ? SEARCH[method] : undefined;
  if (searchHelper !== undefined && kind !== 'Map') {
    const namedArgs = (node['namedArgs'] ?? {}) as Record<string, Node>;
    const named = Object.keys(namedArgs);
    if (args.length !== 1 || named.some((name) => name !== 'orElse')) return undefined;
    const receiver = deps.emit(receiverNode);
    const emitted = [args[0] as Node, ...(namedArgs['orElse'] === undefined ? [] : [namedArgs['orElse']])].map((a) => deps.emit(a));
    if (receiver === deps.refused || emitted.includes(deps.refused)) return deps.refused;
    return `${deps.use(searchHelper)}(${[receiver, ...emitted].join(', ')})`;
  }

  // A `Set` is not an array: a read-only iterable operation on one runs over its elements.
  const setAsIterable = effective === 'Set' && !Object.hasOwn(SET, method) && Object.hasOwn(LIST, method) && !LIST[method]!.mutates;
  const table = setAsIterable ? LIST : effective === 'Map' ? MAP : effective === 'Set' ? SET : LIST;
  // Own keys only: `toString`, `constructor` and the rest of `Object.prototype` are not rows (indexing them crashed the generator on `map.toString()`).
  const entry = Object.hasOwn(table, method) ? table[method] : undefined;
  if (entry === undefined || !entry.arity.includes(args.length)) return undefined;
  if (kind === 'Iterable' && entry.mutates) return undefined;

  // `sort()` with no comparator: only for the element types Dart's default ordering and JavaScript's agree on.
  if (effective === 'List' && method === 'sort' && args.length === 0) {
    const element = typeArgumentsOf(deps.fullType(receiverType))[0];
    if (element === undefined || !ORDERED.has(element)) return undefined;
  }

  // `map.update(key, f, ifAbsent: () => v)`.
  const ifAbsent = effective === 'Map' && method === 'update' ? ((node['namedArgs'] ?? {}) as Record<string, Node>)['ifAbsent'] : undefined;
  const receiver = deps.emit(receiverNode);
  const emitted = [...args, ...(ifAbsent === undefined ? [] : [ifAbsent])].map((a) => deps.emit(a));
  if (receiver === deps.refused || emitted.includes(deps.refused)) return deps.refused;
  const receiverText = setAsIterable ? `Array.from(${receiver})` : receiver;
  const call = `${deps.use(entry.helper)}(${[receiverText, ...emitted].join(', ')})`;
  return call;
}

/**
 * Lowers a property read on a collection: `length`, `isEmpty`, `isNotEmpty`, `first`, `last`, `reversed`, and a `Map`'s
 * `keys`/`values`/`entries`. `Set` and `Map` have `.size`, not `.length`, so `set.length` was `undefined`.
 *
 * @returns the text, or `undefined` when the receiver is not a collection or the property has no lowering.
 */
export function lowerCollectionProperty(node: Node, deps: CollectionDeps): string | undefined {
  const receiverNode = node['receiver'] as Node | undefined;
  const kind = collectionKindOf(receiverNode?.['type'] as Node | undefined, deps);
  if (kind === undefined || receiverNode === undefined) return undefined;
  const property = String(node['property'] ?? '');
  const receiver = deps.emit(receiverNode);
  if (receiver === deps.refused) return deps.refused;

  if (kind === 'Map') {
    switch (property) {
      case 'length': return `${receiver}.size`;
      case 'isEmpty': return `(${receiver}.size === 0)`;
      case 'isNotEmpty': return `(${receiver}.size > 0)`;
      case 'keys': return `${deps.use('mapKeys')}(${receiver})`;
      case 'values': return `${deps.use('mapValues')}(${receiver})`;
      case 'entries': return `${deps.use('mapEntries')}(${receiver})`;
      default: return undefined;
    }
  }
  if (kind === 'Set') {
    switch (property) {
      case 'length': return `${receiver}.size`;
      case 'isEmpty': return `(${receiver}.size === 0)`;
      case 'isNotEmpty': return `(${receiver}.size > 0)`;
      default: return undefined;
    }
  }
  // List, and an Iterable (an array here).
  switch (property) {
    case 'length': return `${receiver}.length`;
    case 'isEmpty': return `(${receiver}.length === 0)`;
    case 'isNotEmpty': return `(${receiver}.length > 0)`;
    case 'first': return `${deps.use('listFirst')}(${receiver})`;
    case 'last': return `${deps.use('listLast')}(${receiver})`;
    case 'reversed': return `${deps.use('listReversed')}(${receiver})`;
    case 'single': return `${deps.use('listSingle')}(${receiver})`;
    case 'firstOrNull': return `${deps.use('listFirstOrNull')}(${receiver})`;
    case 'lastOrNull': return `${deps.use('listLastOrNull')}(${receiver})`;
    default: return undefined;
  }
}

/**
 * Lowers `target[index] = value` (and the compound and `++`/`--` forms) where `target` is a `List` or a `Map`.
 *
 * @param indexTarget - the `MethodCall` named `[]` an assignment writes to.
 * @param compute - given the text that *reads* the current element, the text of the value to store. For a plain `=`
 *   it ignores its argument.
 * @returns the text, or `undefined` when the receiver is not a `List` or `Map`.
 */
export function lowerIndexWrite(
  indexTarget: Node,
  compute: (current: string) => string,
  deps: CollectionDeps,
): string | undefined {
  const receiverNode = indexTarget['receiver'] as Node | undefined;
  const kind = collectionKindOf(receiverNode?.['type'] as Node | undefined, deps);
  const args = Array.isArray(indexTarget['args']) ? (indexTarget['args'] as Node[]) : [];
  if ((kind !== 'List' && kind !== 'Map') || receiverNode === undefined || args.length !== 1) return undefined;
  const receiver = deps.emit(receiverNode);
  const index = deps.emit(args[0] as Node);
  if (receiver === deps.refused || index === deps.refused) return deps.refused;
  const current = kind === 'Map' ? `${deps.use('mapGet')}(${receiver}, ${index})` : `${receiver}[${index}]`;
  const value = compute(current);
  const call = `${deps.use(kind === 'Map' ? 'mapSet' : 'listSetAt')}(${receiver}, ${index}, ${value})`;
  return call;
}
