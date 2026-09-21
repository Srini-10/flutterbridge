# ADR-69 — Records, and record/list/map patterns

- **Status:** Accepted (M13). Found in two real apps: 133 opaque record expressions, 33 pattern declarations, list/map/record patterns in switches.
- **Date:** 2026-09-21

## Decisions

**D1 — A record is an object** whose positional fields are `$1`, `$2`, … and whose named fields are their names (`logic.RecordLit`); its type is
`{ readonly $1: T; readonly name: U }` (parsed from the display name, nullable → `| null`); `r.$1`/`r.name` are ordinary property reads; `==`/`!=` on two
records is `dartRecordEquals` (field-wise, each `==` or `$eq`).
**D2 — Patterns.** A record pattern is an `object` pattern with no type: `dartIsRecord(value, names)` (exactly these fields) and field patterns over
`(value as any).$1`. A list pattern tests `Array.isArray` and the length (`===`, or `>=` with a rest), indexes from the front and from the end
around one `...rest`, and binds the rest as a slice. A map pattern requires the key (`has`) and matches its value. Or-patterns that bind and any
pattern this model does not hold still refuse the whole construct.
**D3 — Where patterns appear:** switch expressions and cases (ADR-0065), `if (v case pattern when guard)` (a labelled block, so the `else` runs when the
pattern *or* the guard fails), `final (a, b) = value;` (`logic.PatternDecl`: the variables are in scope for the rest of the block) and
`for (final (a, b) in xs)` (a hidden loop variable destructured first). Not held: `(a, b) = (b, a)` (pattern assignment), `if`-case inside a
collection literal, and using `value case pattern` as an expression.
**D4 — Diagnostics.** A top-level function refused because of a construct in its body now says which one in the diagnostic ("Its body reports: …") instead of only
that it was not lowered.

## Evidence

`fixtures/apps/records` compared with `flutter test`: positional/named/mixed/nullable records, equality, destructuring declarations, list patterns with a
rest at both ends, map patterns (present, absent, guarded), record patterns against `Object` (exact fields only), `if`-case with and without `else` where the
then-branch completes, for-in destructuring. Nine mutants are killed (rest arity, index from end, missing-key match, record equality by identity, the
`else` branch, the branch exit, record-shape exactness).
