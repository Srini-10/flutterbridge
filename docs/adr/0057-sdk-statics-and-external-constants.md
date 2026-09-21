# ADR-57 — SDK top-level functions and statics, and external package constants

- **Status:** Accepted (M12, production-compatibility phase 2). Found in a real 240-file application: after the class model,
  `identical` (254), `freezed` (216), `Object.hash` (57), `unawaited` (18) and `double.infinity` (4) were 549 of the 1 076
  remaining generator errors — all `BRG3006` "not declared in this program".
- **Date:** 2026-09-21

## Decision

**D1 — A name the program does not declare says where it comes from.** `logic.Ref` gains an optional `library`: the analyzer sets it
when the name resolves to a `dart:` top-level function, top-level variable or static member, or to a `const` top-level variable of a
package the program does not extract. A project name has a `target` and no `library`. The generator never keys on the bare
spelling — a package may declare its own `identical`.

**D2 — A table of exact SDK lowerings**, keyed `library#name`: `identical` → `Object.is` (reference identity for objects, value
identity for numbers, `NaN` identical to itself, `0.0` not to `-0.0` — exactly Dart's); `unawaited` → a no-op (the future is
already running); `double.infinity/negativeInfinity/nan/maxFinite/minPositive`; `Object.hash/hashAll` → runtime `dartHash`.
Anything else the SDK declares stays `BRG3006`.

**D3 — Documented semantic difference: hash values.** Dart does not specify `hashCode` values (they differ across VMs and versions),
so nothing may depend on them. `dartHash` keeps the contract — equal inputs, equal hash; `null`, `true`/`false`, strings, numbers
and order all change the result — and is not Dart's number.

**D4 — A package `const` is an opaque canonical token.** Dart canonicalises constants, so `freezed` is one object however often it
is read. The generator emits `dartConstToken("<library>#<name>")`: one frozen object per declaration, so identity and `==` are
exact (the copy-with pattern `x == freezed ? this.x : x` works). It has no members: a member read or call on it has no receiver
model and is refused where it occurs. This is not specific to freezed; any package constant used as a sentinel behaves so.

## Evidence

`fixtures/apps/sdk_statics` compared with `flutter test`: `identical` on ints, `0.0`/`-0.0`, `NaN`, strings, a shared and a
distinct object; the sentinel pattern with `visibleForTesting` (a `package:meta` const); hash contract cases; the double constants;
`unawaited(bump())` from a button. Mutants (`===` for `Object.is`, wrong `Infinity`, `minPositive`, `hashAll` → `hash`, a fresh
token per read, order-insensitive hash, boolean/`null`/string hash) are each killed. Effect on the real application: 1 076 → 544
generator errors.
