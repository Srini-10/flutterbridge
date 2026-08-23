# ADR-28 amendment — for-loop variable declaration identity

- **Status:** Accepted and implemented (M9-A). Amends ADR-28 §3, §17, and its own catch-clause amendment
  (`docs/adr/0028-amendment-catch-clause-parameter-identity.md`).
- **Date:** 2026-08-23.

## 1. What ADR-28 left open

ADR-28 §17 was explicit about what it did not cover: *"It does not authorize `for`-loop-variable or
`catch`-clause-parameter symbol minting — the same category of gap, measured only for ordinary
`final`/`var` declarations here, left for separate evidence."* The catch-clause amendment (M8-S) supplied
that evidence for the exception-binding half of the gap. This amendment supplies it for the other half:
a `for`-loop's own declared variable — both a for-in loop's own loop variable, and a C-style loop's own
declared variable.

## 2. Evidence

M8-Z's own §26 recommendation named this as the clearest, most concrete, generically-useful finding
remaining after M8: *"a real, generically-useful gap (not specific to enums or `.values`) with a clear
loss point... and a plausible fix shape."*

A fresh probe (`fixtures/apps/m9a_probe/`, deleted after evidence extraction — the identical discipline
M8-N's own probe used), a `State` class with one action per rung (for-in with `final`, for-in with `var`,
a classic C-style loop, nested loops, same-name shadowing, a body-local reading the loop variable, cross-
action same-name loops, and a loop variable colliding with a later ordinary local of the same name),
reproduced the defect directly through the real analyzer and real generator: every read of a loop
variable — `item`, `i`, `value`, `outer`, `inner` — reported `BRG3006`, "not declared in this program".

Direct inspection of the extractor (`dart/bridge_analyzer/lib/src/session/extract/statement_extractor.dart`,
`_for` method) traced the exact loss point, precisely, before any implementation began — not assumed from
the roadmap's own hypothesis:

- For a for-in loop (`ForEachPartsWithDeclaration`), the loop variable was extracted as a bare
  `RawLiteral` string (`loopVariable`), and the body's own scope bound it via
  `Binding(name: name, binds: Binds.local)` — **no `symbol:` argument**. `_reference`'s existing
  computation, `target = staticTarget ?? binding?.symbol` (unchanged since ADR-28 §8), therefore always
  computed `null` for any read.
- For a C-style loop (`ForPartsWithDeclarations`), the single-declaration case already built a real
  `logic.VarDecl` via the existing `_variable` helper — but `scope.dart`'s `_OrdinalVisitor` explicitly
  excluded a for-loop-declared `VariableDeclaration` from its ordinal count (`node.parent?.parent is
  VariableDeclarationStatement`, deliberately not matching `ForPartsWithDeclarations`), so `_localSymbol`
  always returned `null` for it too — and the `inner` scope's own `Binding`, used to resolve reads in the
  loop's test/update/body, was built without a `symbol:` argument regardless.

Both loss points are extraction-time binding-creation defects, identical in shape and location to the
ones ADR-28 (§2, ordinary locals) and its catch-clause amendment (§2, exception bindings) each already
found and fixed — not an N5, normalization, or generator defect, confirmed directly by inspecting the raw,
analyzer-produced UIR before writing any fix: every `logic.Ref{name: 'i', ...}` targeting the loop's own
declaration had no `target` field at all, while an ordinary local in the same body (`out`) already carried
one correctly.

## 3. Declaration-tier identity rule

The identical shape ADR-28 §3 and its catch-clause amendment §3 already define applies here, using the
*same* symbol scheme, unmodified:

```
Symbols.local(name, {required String owner, required int ordinal})
  → 'local:$path#$owner.$ordinal.$name'
```

**The ordinal sequence is shared with ordinary locals and catch bindings, not separate** — the identical
reasoning the catch-clause amendment's own §3 gives, re-applied: since the symbol string includes both
`ordinal` and `name`, two independently-zeroed counters could produce the identical `(ordinal, name)` pair
for an ordinary local and a loop variable sharing a name in the same owning body — a real, avoidable
collision a shared counter makes structurally impossible, proven directly by dedicated tests
(`extraction_test.dart`, "a loop variable and an ordinary local sharing a name share one ordinal sequence"
and "a loop variable and a catch exception binding sharing a name never collide").

`scope.dart`'s `_OrdinalVisitor` now also visits:

- `DeclaredIdentifier` (a for-in loop's own loop variable — a distinct AST node type from
  `VariableDeclaration` in `package:analyzer`'s own grammar, used exclusively for this one purpose, so no
  parent-shape guard is needed, unlike the check below), and
- a `VariableDeclaration` whose parent is a `ForPartsWithDeclarations` (a C-style loop's own declared
  variable) — the *same* `visitVariableDeclaration` override ADR-28 §3 already installed, its guard
  condition widened by one clause.

Both are numbered in the same monotonic, per-owning-body sequence every other declaration-tier binding
already shares.

## 4. What this amendment authorizes, and what it does not

**Authorized and implemented:** a for-in loop's own single declared variable, and a C-style loop's own
declared variable when the loop declares exactly one (`for (var i = ...; ...; ...)`).

**Not authorized:** a C-style loop declaring more than one variable in its initializer
(`for (var i = 0, j = 0; ...)`). This is not a new refusal this amendment introduces — `_for`'s own
`ForPartsWithDeclarations` case already emitted no `init` field at all for this shape, an existing,
independent limitation predating this milestone. A symbol is only ever minted when a real `logic.VarDecl`
node exists to carry it (ADR-28 §9, BRG1207 safety) — since no node is emitted for any of several
declared variables, none is given a symbol either, leaving this shape exactly as unsupported as it always
was (proven directly by a dedicated negative-control test). Extending module emission to this shape is a
separate, unrelated capability, not this amendment's to add.

**Not authorized:** a for-in loop with no declaration at all (`for (x in xs)`, reusing an
already-declared `x`) — the existing `ForLoopParts()` catch-all continues to refuse this as opaque,
unchanged, proven directly by a dedicated negative-control test.

## 5. Schema

**Additive only**, the identical shape the catch-clause amendment's own §5 used for `exceptionDecl`.
`For` (`packages/uir/schema/l1.json`) gains one new optional field, `loopDecl: VarDecl` — a real,
declaration-tier `logic.VarDecl` with no `initializer` (the runtime binds it once per iteration, not an
expression), present exactly when `loopVariable` is (a for-in loop, never a C-style one). `loopVariable`
(the existing plain string) is retained, unchanged, for description; nothing currently reads it besides
the generator's own fallback path (§7). No `x-uir-breaking` marker: no existing field's shape or
requiredness changes.

A C-style loop's own declared variable needed **no schema change at all** — `init` was already a real
`logic.VarDecl`, produced by the same `_variable` helper every ordinary local uses; only its identity
derivation was withheld, exactly as ADR-28's own original local-variable fix was purely an
identity-derivation change, not a schema one (ADR-28 §16).

## 6. Normalization (N5) — no change required, and this is itself evidence

Identical finding to the catch-clause amendment's own §6. `walk(program)` (`packages/compiler/src/internal/
normalize/pass.ts`) is a fully generic, structural collector — it visits every value under every field
name, pushing anything with a `kind` and an `id`, regardless of nesting. A for-in loop's own `loopDecl`
(nested inside `logic.For.loopDecl`) and a C-style loop's own `init` (nested inside `logic.For.init`) are
both found by this walk with zero changes to it, exactly as `TryCatch.catches[].exceptionDecl` already
was. Proven directly: two new N5 tests (`packages/compiler/tests/n5.test.ts`) — a closure capturing a
loop variable declared in an *enclosing* loop is refused (`BRG2105`), and a closure that declares and
reads its own, entirely-nested for-in loop lifts correctly — both pass against the **unmodified** N5 pass.
Zero lines of `n5_lift_closures.ts` changed this milestone.

## 7. Generator

`localBindingsIn` (`packages/generators/react/src/internal/emit/expression.ts`) is, identically to the
catch-clause amendment's own finding, already a generic, recursive walk over an action body finding every
`logic.VarDecl` with a real id — it needed no change at all: it already picks up a `loopDecl` or a
C-style loop's own `init` wherever nested, the same way it already picks up an ordinary local or a
catch-bound exception.

`statement.ts`'s `logic.For` case for a C-style loop needed no change either — `init`'s own `logic.VarDecl`
already emits its declaration line the ordinary way (`const`/`let <name> = ...`), and every read resolves
against it through the same `EmitScope.localName` lookup every other local already uses.

## 8. A pre-existing, independently-discovered generator defect — fixed, not this amendment's own scope

Proving a C-style loop's build-proof end to end (Flutter → analyzer → normalize → generate → real `tsc`)
surfaced an unrelated, pre-existing defect this amendment's own work did not introduce and does not
change the shape of: `logic.For`'s own `update` field is an *array* of expressions in the schema (Dart's
own `for (...; ...; a, b)` admits a comma-separated list), but `statement.ts`'s emission code passed the
array directly to `emitExpression`, which expects a single node. `kindOf` found no `.kind` string on the
array and unconditionally reported `BRG3002` ("`<unknown>` has no lowering"), for *any* C-style loop with
an update clause — independent of whether the loop variable itself resolved. Confirmed pre-existing by
direct reproduction against the unmodified generator, before this amendment's own identity fix, using the
identical probe. Fixed minimally: `asArray(node['update']).map(u => emitExpression(u, scope)).join(', ')`
— the same `asArray` helper this file already uses for `logic.Switch.cases` and `logic.TryCatch.catches`.
Without this fix, this amendment's own C-style-loop identity work would have had no real-world payoff
(every C-style loop with an increment/decrement clause — the overwhelming majority — would still fail to
generate, for an unrelated reason) and the milestone's own required build-proof (§9 of the Phase 15 gate)
could not have been completed honestly.

## 9. Rename/edit stability, cross-file behaviour

Not claimed, not required — identical reasoning to ADR-28 §13/§14 and the catch-clause amendment's own
§9, unchanged: a loop variable's own `Element` never resolves outside the one loop body it is declared
in, and nothing outside the single extraction pass that mints its symbol and consumes it ever looks it up
again.

## 10. Migration / schema-version consequences

None beyond ADR-28 §16's own precedent, applied to one more, newly-introduced field: `loopDecl` did not
exist before this milestone, so no existing document's id values change for it. A C-style loop's own
`init` node's id *does* change on the next extraction of unchanged source (content-derived to
symbol-derived, the identical, expected consequence ADR-28 §16 already names for ordinary locals) — not a
breaking schema version bump, since no field's shape or requiredness changes.
