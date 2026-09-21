# ADR-61 — Exception classes and typed catch clauses

- **Status:** Accepted (M12, production-compatibility phase 2). Found in a real app: `FormatException`, `StateError` constructed; two-
  and three-clause `try`/`catch` refused (`BRG3003`); and — found by the oracle — `try { … } finally { … }` swallowed the exception.
- **Date:** 2026-09-21

## Decisions

**D1 — Runtime exception classes.** `Exception`, `FormatException`, `StateError`, `ArgumentError`, `RangeError`, `UnsupportedError`,
`UnimplementedError` and `TimeoutException` are constructed as runtime classes that print as Dart's do (`FormatException: msg`,
`Bad state: msg`, `Invalid argument(s): msg`, `Exception: msg`). `DartException` and `DartError` are separate bases, so `on Exception`
does not catch a `StateError`.

**D2 — Typed catch clauses dispatch on type.** JavaScript has one `catch`; the clauses become a chain of runtime tests inside it
(`dartIs` for a project class, `instanceof` for an SDK exception, the `is` set for `int`/`String`/…), each binding the caught value
typed as the clause's type, and an exception no clause names is thrown again. A clause with no `on`, or `on Object`, catches everything.
A clause naming a type that cannot be tested at runtime is refused, by name. Before, only the first clause was lowered and the others
reported — and a single typed clause caught *everything*.

**D3 — `rethrow`** throws the enclosing clause's binding; a failed `as` throws a JavaScript `TypeError`, which counts as a Dart `Error`.

**D4 — `try { } finally { }` has no `catch`.** The generator emitted `catch {}`, which swallowed the exception a Dart `try`/`finally`
propagates — a silent semantic loss present since M3.

## Documented difference

The errors the *runtime helpers* throw (`BRG4014`, ADR-0051) are not `StateError`/`RangeError` instances: an `on StateError` around
`list.first` on an empty list does not catch them. Dart's message text for `RangeError` details is not reproduced.

## Evidence

`fixtures/apps/exceptions` compared with `flutter test`: all eight raise modes through a seven-clause `try`, an unmatched exception
propagating past a typed clause, `try`/`finally` with and without a catch, and a failed cast as an `Error` but not an `Exception`.
Seven mutants are killed.
