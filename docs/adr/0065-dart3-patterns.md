# ADR-65 — Dart 3 patterns: switch expressions and pattern cases

- **Status:** Accepted (M12, production-compatibility phase 2). Found in two real apps: 47 + 20 opaque `switch` expressions, `case A():` pattern
  cases (every freezed `map`/`when`), sealed-class switches.
- **Date:** 2026-09-21

## Decisions

**D1 — `logic.Pattern`** (variants `const`, `wildcard`, `bind`, `object`, `or`, `and`, `relational`, `nullCheck`, `nullAssert`, `cast`) and
**`logic.SwitchExpr`**; `SwitchCase` gains `pattern` and `guard`. A case that is a plain constant keeps `test`.

**D2 — Lowering.** A pattern is a runtime test on a subject plus the variables it binds: a constant is `===` (never `==`: `'' == 0` in
JavaScript), an object pattern is a type test (`dartIs` for a project class, `instanceof` for an SDK exception, the `is` set for the rest) and
its field patterns over `(subject as T).field`, `||`/`&&`, relational `< >= …`, `x?` is `!== null`. A switch expression is an immediately-invoked
function trying each arm in order (binding, guard, value); no arm matching throws (Dart's exhaustiveness makes it unreachable). A switch
statement with pattern cases is a chain of labelled blocks — test, bind, guard, body, leave — so bindings are scoped to their case; a trailing
`break` only ends the case.

**D3 — A widget-typed switch expression** is `ui.Nodes` over the expression, whose arms are `logic.WidgetExpr` values (ADR-0062).

**D4 — Refused, whole, with the source:** list, map and record patterns; an or-pattern that binds variables. The extractor never lowers part of a
switch.

## Evidence

`fixtures/apps/patterns` compared with `flutter test`: object patterns with guards and nested constants, `null`/`int n when`/`String s`
subjects, `A || B` enum arms, relational and `&&` patterns, a switch statement with pattern cases and guards, `var t?`, `0` vs `''`, and case
bodies that do not return. Seven mutants (`||`→`&&`, relational operator, null check, guard dropped, `===`→`==`, field access not typed, missing
case-exit) are killed. Six M8-Y tests that pinned "stays opaque" were updated to the new contract.
