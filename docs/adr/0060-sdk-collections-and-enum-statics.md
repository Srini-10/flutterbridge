# ADR-60 — The List/Set/Map surface real code uses, collection constructors, and static members of emitted classes

- **Status:** Accepted (M12, production-compatibility phase 2). Found by a real 240-file app (`fold`, `firstWhere(orElse:)`, `List.from`,
  `Map.fromEntries`) and by a real 21-package monorepo (35 `BRG1201`: a bare `values` and bare constants inside an enhanced enum's own
  static method; a static method of an enhanced enum).
- **Date:** 2026-09-21

## Decisions

**D1 — More exact-Dart collection helpers** (same discipline as ADR-0051: a runtime helper per method, never the same-named JavaScript
one). List/Iterable: `firstWhere`/`lastWhere`/`singleWhere` (with `orElse:`), `fold`, `reduce`, `expand`, `every`, `indexWhere`,
`takeWhile`, `skipWhile`, `followedBy`, `toSet`, `elementAt`, `single`, `firstOrNull`, `lastOrNull`. Set: `union`, `intersection`,
`difference`, `containsAll`, and every read-only iterable method (a `Set` is converted to an array first). Map: `forEach`, `update`
(with `ifAbsent:`), `removeWhere`, `map`. Where Dart throws (`StateError` for no match / more than one match / empty `reduce`) the helper
throws `BRG4014`, as the ADR-0051 contract says: equivalence for executions in which Dart does not throw.

**D2 — Collection constructors:** `List.from/of/unmodifiable/generate/filled`, `Set.from/of`, `Map.from/of/fromEntries`, `MapEntry(k, v)`.
`growable:` is accepted and ignored — a fixed-length list is a growable one here, which differs only where Dart would throw.

**D3 — A static method of an enhanced enum, or of a class another class inherits from, has a target and reaches its owner.** The ADR-0042
shape gate protects the bounded-helper path; a class emitted as a class has its static methods typed as declared. A bare `values` and a bare
constant inside the enum's own body resolve to the enum (before, `values` fell into the static-field rule and dangled). A `ChangeNotifier`
member the store extraction does not declare (a lifecycle method, a static, a `final` field that is not state) no longer receives a target
that dangles.

## Evidence

`fixtures/apps/sdk_collections` (8 output lines) and `fixtures/apps/enhanced_enums` (`Level.fromTag`, `Unit.magic`) compared with
`flutter test`; 14 mutants (wrong helper, off-by-one start, `skipWhile` that never stops skipping, `reduce` seeding, `Set` not converted,
`update` branches swapped, `List.filled` as `generate`, static-owner reachability) are each killed.
