# ADR-51 — State-held collection mutation: in place, announced by the runtime to whoever owns the collection

- **Status:** Accepted (M11, production-compatibility milestone). Resolves ADR-0049 D4, which recorded the mechanism as
  undecided and refused every in-place mutation.
- **Date:** 2026-09-20

## Context

`final List<int> _items = [];` followed by `setState(() => _items.add(x))` is the idiomatic Flutter way to hold a list.
Until M11 the generator either refused it (ADR-0049) or, before that, emitted `_items.get().add(x)` — a `tsc` error for
most method names and, for the ones that coincide, silently wrong. Every observation below was made by running Dart.

| Dart | JavaScript spelling | What went wrong |
|---|---|---|
| `l.add(x)` | `l.add(x)` | not a method of an array (`tsc` error) |
| `l.sort()` | `l.sort()` | compiled, ran, and **never updated the screen** — a signal cannot see an in-place change; JavaScript orders `[10, 9, 1]` as strings |
| `s.add(x)` | `s.add(x)` | returns the `Set`, Dart's returns `bool` |
| `m['a']` | `m['a']` | `undefined` on a `Map`; Dart's is the value or `null` |
| `m.remove(k)` | `m.delete(k)` | different name, different return value |
| `final List<int> _l = []` | — | never reactive: the analyzer treated a `final` field as an immutable constant, so every read was `BRG3006` |
| `signal([])` | — | inferred `never[]` |

## The decision

**D1 — A collection is mutated in place.** A Dart `List`/`Set`/`Map` is a JavaScript array/`Set`/`Map`, and a mutator
changes it where it stands, so identity is preserved: `final other = _items; _items.add(1)` reaches `other`, exactly as
in Dart. *Copy-on-write* (`set([...items, x])`) was rejected: it notifies, but breaks every alias, every collection
passed as a prop, and every nested collection. It is the "always clone" workaround, and it is wrong wherever a second
reference exists.

**D2 — Ownership is a runtime fact, so the runtime decides who is told.** The first design wrapped a mutator on a
State-held receiver in `mutate(signal, () => …)`, deciding at compile time which signal to touch. It was found wrong before
it shipped: `final a = _items; a.add(1)`, a collection handed to a child as a prop, and `_grid[0].add(1)` through a
callback have no root the call site can name. So:

- Every `Signal` registers the collection graph it holds (`WeakMap<object, Set<Signal>>`): the value, and everything
  reachable through arrays, `Set`s, `Map`s and plain objects. `Signal.set` re-registers the new value.
- Every mutator helper (`listAdd`, `listSort`, `mapSet`, …; `internal/collections/dart_collections.ts`) changes the
  collection, then calls `notifyMutation(collection)`, which `touch()`es every owner in one batch.
- An element inserted into an owned collection inherits its owners (`inheritOwners`), so `_g.add(<int>[]); _g.last.add(3)`
  reaches the signal though the inner list did not exist when the signal was built.

`Signal.touch()` is the single, explicit exception to ADR-20 R3 (an equal write does not notify): it bumps the version
whether or not the value changed. `useSignal` subscribes to a **version**, not the value (`useSyncExternalStore`), so a
component re-renders for an in-place change to the reference it already holds.

**Over-notification is allowed; under-notification is not.** An element removed from a list stays registered to the
signal that once held it, so mutating it later costs one extra render, never a missed one. A no-op mutation
(`remove(absent)`, `add` of a present element, `clear()` of an empty list) does not announce.

**D3 — The generator lowers by the receiver's resolved type, never the bare method name.** A `List`, `Set` or `Map`
method becomes a call into the runtime (`listAdd(l, x)`, `setAdd`, `mapPutIfAbsent`, `listSort`, …) — exact Dart
semantics, verified differentially against real Dart (361 generated cases). `a[i]`, `a[i] = v`, `m[k] = v`, `m[k] += 1`
lower to element access / `listSetAt` / `mapSet` (the analyzer emits `logic.MethodCall '[]'`; an `Assign` target may be an
index; a `Set` literal is a `ListLit` typed `Set`. **No UIR schema change.**) `length` on a `Set`/`Map` is `.size`;
`first`/`last`/`isEmpty`/`keys`/`values` have rows; `join()` is `join('')`; `sort()` with no comparator is lowered only
for element types on which Dart's ordering and JavaScript's agree (`int`, `double`, `num`, `String`). A method with no
row is refused by name (`BRG3002`, with what *is* lowered), never emitted as a same-named JavaScript method.

**D4 — Analyzer.** A `List`/`Set`/`Map` field **with an initializer** is reactive even when `final`. A `final` field with no
initializer — a constructor-filled prop — is not state the class owns and never becomes a signal (it used to, empty, when
a mutating call named it). Typed initialisers: `signal<number[]>([])`, `signal<number | null>(null)`.

## Consequences

- **Deviation, inherited from ADR-0048 and pinned by a test:** a mutation with no `setState` re-renders the generated
  component at once; Flutter shows the change at the next rebuild. `setState(() {})` is a no-op here. The differential
  suite compares Flutter and the component at every step *except* the silent ones of `NoSetState`, where it asserts the
  divergence exists.
- Contract: **equivalence for executions in which Dart does not throw.** Out-of-range `list[i]` reads yield `undefined`
  (Dart throws `RangeError`); the mutating helpers *do* throw `BRG4014` for the range errors Dart throws. Dart's
  `List.sort` is not stable and JavaScript's is; an unstable order is not reproduced. `Iterable` results of
  `where`/`map`/`take` are eager arrays.
- Cost: `Signal.set` walks the new value once to register owners — O(size) per whole-collection replacement.
- **Refused, by name:** the null-aware `?.` on an SDK member when the receiver is not a plain variable (`m['k']?.join()`)
  — it used to drop the `?.` silently and throw where Dart yields `null`. `List.from`/`List.of`, spread, `List.generate`,
  `Iterable.fold`/`reduce`/`expand`/`firstWhere`… have no row.
- A field initializer that reads another field (`late final _same = _l`) is still `BRG3006`.

## Evidence

- 361 differential cases from real Dart (`packages/runtimes/react/tests/col_scenarios.json` / `col_expected.json`).
- 15 scenarios executed **twice**: by Flutter itself under `flutter test` (`fixtures/apps/collection_mutation/test/`,
  `expected.json`) and by the generated React component in jsdom (real `react-dom`, the real runtime kit, real
  analyzer output) — compared after every tap. They cover add/insert/remove/removeAt/removeLast/removeWhere/clear/sort
  (with and without comparator)/shuffle/index-assign/addAll/insertAll on a `final` and a non-final list, `Set`, `Map`
  (`putIfAbsent`, `addAll`, `??=`-style bump), nested lists and `Map<String, List<int>>`, aliases (local, chained, copy),
  a collection shared with a child by prop and mutated by the child, a captured callback, several mutations in one
  `setState`, no-op mutations, a mutation without `setState`, a parent rebuild over a child's state, and a list rendered
  as widgets.
- A per-helper table (`mutate.test.ts`, 31 cases): each mutator notifies exactly when it changed something.
- Mutations, all killed: `notifyMutation` a no-op (14 of 16 fail); `inheritOwners` a no-op; `adopt` not recursive;
  `useSignal` ignoring the version (13 fail); and dropping the announcement from `listSetAt`, `mapPutIfAbsent`,
  `listSort`, `setAdd`.
