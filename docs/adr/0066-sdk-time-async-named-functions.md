# ADR-66 — `DateTime`, `Timer`, `Future` factories, parsing, async and named-parameter functions

- **Status:** Accepted (M12, production-compatibility phase 2). Found in two real apps (`DateTime.now/parse` ×20, `Timer`, `Future.value/microtask`,
  `int.tryParse`/`double.tryParse` ×33, `DeepCollectionEquality` ×94 through freezed's `==`, and 144 calls passing named arguments).
- **Date:** 2026-09-21

## Decisions

**D1 — Runtime value classes with Dart's member names:** `DartDateTime` (`now`, `parse`/`tryParse`, `utc`, `fromMillisecondsSinceEpoch`, `year`…`weekday`
(Monday = 1), `add`/`subtract`/`difference`, `isBefore`/`isAfter`/`isAtSameMomentAs`/`compareTo`, `toUtc`/`toLocal`, `toString` and
`toIso8601String` in Dart's format), `DartTimer` (`Timer`, `Timer.periodic`, `cancel`, `isActive`, `tick`) and `DartDeepCollectionEquality`
(`package:collection`). Generated code calls their members as written; `a == b` on two `DateTime`s is the same instant. **Documented differences:**
Dart's microsecond part is not kept (JavaScript has none), and `DateTime.parse` reads the ISO-8601 forms Dart's documentation lists.
**D2 — Constructors table** (`Type.constructor` → text, keyed by *library*): `DateTime(...)`, `Timer(...)`, `Future.value/microtask/error`,
`Future.delayed(d, computation)`, `DeepCollectionEquality()`, and freezed's `EqualUnmodifiable{List,Map,Set}View` (unmodifiable copies).
**D3 — SDK functions:** `int.parse/tryParse` (`radix:`), `double.parse/tryParse`, `DateTime.parse/tryParse`, `Future.wait`. `int.parse` accepts an optional sign,
digits and `0x` hex, trims whitespace, and rejects values beyond 2^53 (ADR-0050).
**D4 — Async top-level functions** are emitted `async` (they were refused); **named parameters on top-level functions** follow ADR-0055's calling convention
(positional then named in declaration order, `undefined` for omitted, callee defaults) and calls are ordered by the callee's signature, with `radix`-style named
parameters of SDK functions ordered by a small table. A lifecycle body (`initState`) reaches the functions it calls.
**D5 — A signal receiver of `?.` is bound once** (`timer?.cancel()` where `timer` is a `State` field): reading a signal twice compiled to a call TypeScript cannot narrow.

## Evidence

`fixtures/apps/sdk_time` compared with `flutter test`: dates in local and UTC, parse with `T`/`Z`, `add`/`difference`, weekdays including Sunday, comparisons and `==`,
`FormatException` from a bad date, deep equality, `Future.value/delayed(computation)/microtask/wait`, a periodic `Timer` cancelled from its callback and in `dispose`,
`int`/`double` parsing with radix and rejects, named-parameter async functions called with named, defaulted and omitted arguments. Seven mutants are killed.
