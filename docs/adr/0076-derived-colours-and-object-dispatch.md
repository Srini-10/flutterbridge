# ADR-76 — Colours derived from constants; classes that override `toString`/`==`; identifiers that are `Object.prototype` members

- **Status:** Accepted (M14).
- **Date:** 2026-09-21

## Decisions

**D1 — A colour derived by changing only its alpha is a constant.** `AdminTokens.gold.withValues(alpha: 0.14)`, `c.withOpacity(0.4)`, `c.withAlpha(90)` are method calls, not constant expressions, so they escaped
the colour-hoisting that turns constant colours into design tokens (39 + 35 refused named-argument calls in the two real apps). When the receiver is a constant `Color` and the argument a constant, the
result is computed exactly as Flutter computes it (`alpha = (opacity × 255).round()`, checked against `Color.toARGB32()`) and hoisted like any other colour; `withValues` with a channel other than `alpha` is not derived.
**D2 — A class that overrides `toString`, `==`, `hashCode`, `call` or `noSuchMethod` is a class**, not a structural record. As a record, `'$box'` printed `[object Object]` and `a == b` was identity — a
silent semantic loss found by a fixture whose members are named like JavaScript's.
**D3 — Identifiers that are `Object.prototype` members** (`constructor`, `toString`, `valueOf`, `hasOwnProperty`, `__proto__`, `length`, …) work as State fields, parameters, locals, methods, enum values and map keys, and
`list.toString()` / `map.toString()` print Dart's text (`{a: 1}`) for reproducible element types. Generator tables are indexed by own keys only (a name such as `toString` used to index `Object.prototype` and crash the generator).
A **class member named `constructor`** cannot be declared by a JavaScript class and is refused by name (`BRG3013`); a **widget parameter** named `constructor` is a `tsc` error (TypeScript's own rule for object types) and stays loud.

## Evidence

Analyzer tests for the alpha computation (a mutant using `floor` and a mutant dropping the channel guard are killed) and for each `Object` override (mutant killed); `fixtures/apps/prototype_names` compared with Flutter; a refusal fixture for the `constructor` member (mutant killed);
a generator robustness test that applies every prototype-named method to every SDK receiver (it fails without the own-key lookups).
