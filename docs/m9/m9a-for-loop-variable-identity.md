# M9-A — For/for-in loop variable declaration identity

**Baseline:** `9393567` (M9-0, "chore: separate FlutterBridge from Continuum validation") == `origin/main`,
verified fresh from git, not assumed. Pre-existing, unrelated drift confirmed present and left untouched:
`fixtures/apps/hello_bridge/analysis_options.yaml`.

**Outcome: implemented.** A `for`-loop's own declared variable — a for-in loop's own loop variable, and a
C-style loop's own declared variable (single-declaration case) — now gets the identical declaration-tier
identity ADR-28 already gives an ordinary local, and its own amendment already gives a catch clause's
exception binding. Full detail, evidence, and the exact schema/generator/N5 reasoning live in the ADR
amendment this milestone authored: `docs/adr/0028-amendment-for-loop-variable-identity.md`. This document
is the milestone's own narrative record — read the ADR amendment for the architectural decision itself.

## 1. Root cause — proven, not assumed

The roadmap that named this milestone (`docs/m8/m8z-enum-values-recognition.md` §26) hypothesized
*"`localBindingsIn` never registers `logic.For.loopVariable`"* as the loss point. That hypothesis was
**not** trusted — Phase 1's own instruction required tracing the actual failure stage first, and it named
the wrong layer. `localBindingsIn` is a *generator*-side lookup; the actual defect is upstream, at
*extraction* time, in the Dart analyzer:

- A for-in loop's own loop variable was extracted as a bare string, with no declaration-tier `symbol` on
  its binding — `_reference`'s `target = staticTarget ?? binding?.symbol` therefore always computed
  `null`.
- A C-style loop's own declared variable already had a real `logic.VarDecl` node, but `scope.dart`'s
  `_OrdinalVisitor` explicitly excluded it from the ordinal count that `Symbols.local` needs to mint a
  symbol at all.

Neither N5, normalization, nor the generator ever saw the loop variable's identity — because it never had
one to begin with. Confirmed directly against raw, analyzer-produced UIR (a probe fixture,
`fixtures/apps/m9a_probe/`, deleted after evidence extraction, matching M8-N's own probe discipline): every
`logic.Ref` to a loop variable had no `target` field, while an ordinary local in the same body already
carried one.

## 2. Loop forms investigated

| Rung | Shape | Result |
|---|---|---|
| A | `for (final item in items)` | Identity given (this milestone) |
| B | `for (var item in items)` | Identity given (this milestone) |
| C | `for (var i = 0; i < n; i++)` | Identity given (this milestone) |
| D | Nested loops, distinct names | Correct, no conflation |
| E | Same-name nested shadowing | Correct — JS block scoping reproduces Dart's own shadowing for free |
| F | Loop variable captured by a closure | N5-safe — refused (`BRG2105`) when captured from outside, lifts when declared inside the closure itself |
| G | Loop inside an action | Covered — every rung above runs inside a `State` method |
| H | `for (x in xs)`, no declaration | Unchanged — the existing opaque refusal, untouched |
| I | Body-local reading the loop variable | Correct |
| — | C-style loop, more than one declared variable | Unchanged — the existing, pre-dating, unrelated "no `init` emitted" limitation, left exactly as is |
| — | `ui.List`'s own collection-for (`for (x in xs) Widget(x)`) | **Out of scope** — a structurally different UIR node (`ui.List.itemParam`), bound as a parameter-tier name inside a widget-tree template, not a `logic.For`/`Binds.local` binding at all. Architecturally the same category ADR-28 §4 already defers for `ParamDecl` generally. Not touched. |

## 3. Schema, ADR, and identity mechanism

Full reasoning in the ADR amendment. Summary: `logic.For` gains one additive field, `loopDecl: VarDecl`
(a for-in loop's own loop variable, present exactly when `loopVariable` is). A C-style loop's own declared
variable needed no schema change — only its identity *derivation* changed. ADR-28's existing
`Symbols.local(name, {owner, ordinal})` scheme applies mechanically, unmodified; the ordinal sequence is
shared with ordinary locals and catch bindings (not a new, independent counter), for the identical
collision-freedom reason the catch-clause amendment already proved necessary.

## 4. Collision and shadowing evidence

All proven directly, through the real Dart analyzer, in `dart/bridge_analyzer/test/extraction_test.dart`'s
new `'for-loop variable declaration identity (ADR-28, amended M9-A)'` group (12 tests):

- Two unrelated actions declaring a loop variable under the identical name never collide.
- Nested loops with distinct names never conflate the inner and outer declaration.
- Same-name nested shadowing: the inner read resolves to the inner declaration; the read *after* the
  inner loop ends resolves back to the outer one.
- A loop variable and a later ordinary local sharing a name share one ordinal sequence and never collide.
- A loop variable and a catch-bound exception sharing a name never collide.
- Repeated reads of one loop variable share the same target.
- A C-style loop's own declared variable resolves identically in its test, update, and body.
- Two negative controls, unchanged by this milestone: a C-style loop declaring more than one variable
  (no `init`, no identity), and a for-in loop reusing an already-declared variable (no declaration, no
  `logic.For.loopDecl`, stays opaque).
- Determinism: the same source extracts to the same ids on a second, independent run.

## 5. N5 closure-capture safety

A hard gate, per this milestone's own instructions. Two new tests in `packages/compiler/tests/n5.test.ts`,
mirroring the catch-clause amendment's own precedent exactly:

- A closure capturing a loop variable declared in an *enclosing* loop is refused (`BRG2105`), even though
  the reference now carries a `target` — proving N5's existing, ADR-28-generalised, target-based check
  (walking the *whole* program via `walk(program)`, not `program.ofKind`) already covers a loop variable's
  own `logic.VarDecl`, nested inside `logic.For.loopDecl`/`logic.For.init` rather than a bare statement,
  with zero changes to `n5_lift_closures.ts`.
- A closure that declares and reads its *own*, entirely-nested for-in loop lifts correctly — that capture
  is bound, not free.

**Zero lines of `n5_lift_closures.ts` changed this milestone.**

## 6. Generator findings

`localBindingsIn` and the C-style loop's own `logic.VarDecl` emission needed no change — both already
generic. One **unrelated, pre-existing defect** was found and fixed while proving the C-style-loop
build-proof end to end: `logic.For.update` is an array of expressions in the schema, but the emitter
passed the array directly to `emitExpression` (which expects one node), unconditionally reporting
`BRG3002` for any C-style loop with an update clause, regardless of identity. Fixed with the same
`asArray` helper already used elsewhere in the same file. Full justification for why this was in scope
to fix (not a silent capability expansion) is in the ADR amendment §8.

## 7. Supported / refused subset

**Supported:** a for-in loop's own single declared variable (`final` or `var`); a C-style loop's own
single declared variable, resolved in its initializer, test, update, and body.

**Refused, unchanged:** a C-style loop declaring more than one variable; a for-in loop with no
declaration; a widget-tree collection-for's own `itemParam` (a different, parameter-tier binding kind,
architecturally out of this amendment's scope).

## 8. Diagnostics

Before this milestone, every read of a loop variable reported `BRG3006` ("not declared in this program")
— a real diagnostic, correctly fired for the state the pipeline was actually in (the reference genuinely
had no target), but misleading about *why*: the variable **was** declared, in the exact same program: the
identity to say so was simply never minted. After this milestone, a loop variable read inside its own
scope requires no fallback or name matching to resolve — it targets its own declaration directly, the same
way any other local already does. `BRG3006` is not weakened: a genuinely undeclared reference (the two
negative controls in §4) continues to report it, unchanged.

## 9. Tests added

- `dart/bridge_analyzer/test/extraction_test.dart` — 12 new tests (§4), one obsolete test removed (it
  asserted the now-superseded ADR-28 §17 limitation this milestone lifts).
- `packages/compiler/tests/n5.test.ts` — 2 new tests (§5), plus `loopVarDecl`/`forIn` UIR-construction
  helpers mirroring the existing `catchExceptionDecl`/`tryCatch` ones.
- `packages/generators/react/tests/loop_variables_build.test.ts` — 9 new tests: real analyzer → real
  `bridge normalize` (N1–N11, unmodified) → real generator → real `tsc` against the real, unmocked
  `@bridge/runtime-react`.
- `fixtures/apps/loop_variables/` + `fixtures/uir/loop_variables.ndjson` — a new, permanent, generic
  fixture (no application-specific names), the analyzer-produced golden verified reproducible byte-for-byte
  from a fresh `bridge analyze` run before being committed.

## 10. Validation

- `just ci`: exit 0. Dart `bridge_analyzer` 345/345 ("All tests passed"). TS `@bridge/compiler` 155/155,
  `@bridge/gen-react` 31 files / 320 tests, all green.
- `just determinism`: full e2e harness across the 5 tracked apps (`counter`, `promoted-counter`,
  `inline-push-props`, `async-push-guard`, `local-store`) — "byte-identical across every run," exit 0, no
  environmental kill this run.
- `bridge validate --json` on `fixtures/apps/loop_variables`: `{"ok": true, "checks": [{"deterministic":
  true}, {"fixed point": true}]}`.
- `git diff --check`: clean.

## 11. Regression audit — M8 capabilities, FlutterBridge's own tests only, no Continuum

All confirmed passing, unchanged, as part of the full suite runs above (no capability re-derived or
re-verified against Continuum, per this milestone's own hard rules): M8-B `structured_build_build.test.ts`;
M8-D `enum_reference.test.ts`; M8-G/M8-N `local_variables_build.test.ts` and `extraction_test.dart`'s own
`'local variable declaration identity (ADR-28)'` group; M8-H `action_params.test.ts`; M8-O
`transitive_action_reference.test.ts`, `transitive_actions_build.test.ts`; M8-R promotion/N11 tests
(`promotion_build.test.ts`); M8-S `catch_clause_build.test.ts`, `catch_clause_reference.test.ts`; M8-U
`module_emission_build.test.ts`, `function_module_emission_refusals.test.ts`; M8-V
`numeric_sdk_build.test.ts`, `numeric_sdk_recognition.test.ts`; M8-Y `switch_expression_build.test.ts`,
`switch_expression_recognition.test.ts`; M8-Z `enum_values_build.test.ts`. No capability was reverted.

## 12. Silent-wrong-code audit

The narrow scope admitted here (a single declared variable per loop header, structurally identified via
the same `Symbols.local` scheme every other declaration-tier binding shares, never by name) leaves no room
for duplicate evaluation, lost exceptions, mutation surprises, or declaration-order drift — checked
directly (§4, §5) rather than assumed. The one real, load-bearing finding from this investigation is §6's
pre-existing `update`-array emission defect: before this milestone, **every** C-style loop with an
increment/decrement clause silently failed to generate (`BRG3002`, a real error, correctly reported, but
for a defect unrelated to what it named) — this was not a *silent*-wrong-code hazard (the build correctly
refused to emit rather than emitting something wrong), but it was a real, previously-unknown capability
gap, found honestly and fixed, not silently worked around or left for a future milestone to rediscover.

## 13. Remaining generic FlutterBridge blocker graph

Unchanged from M8-Z except this milestone's own two rungs (for-in loop variable, C-style loop variable)
now resolved. Newly surfaced, recorded, not fixed:

- **A C-style loop declaring more than one variable** (`for (var i = 0, j = 0; ...)`) still emits no
  `init` at all — a real, narrow, well-scoped gap for a future milestone (extend `_for`'s
  `ForPartsWithDeclarations` case to a `logic.Block` of declarations, the same shape
  `VariableDeclarationStatement`'s own multi-declaration case already uses, then extend the ordinal-backed
  symbol to each).
- **A widget-tree collection-for's own `itemParam`** (`for (x in xs) Widget(x)`, a `ui.List` node) remains
  entirely outside declaration-tier identity — the same category ADR-28 §4 already defers for `ParamDecl`
  broadly (component constructor parameters). Not scoped by this milestone; would need its own
  architectural decision about whether a widget-tree template parameter should join the declaration-tier
  scheme at all, or remain a separate, name-based binding by design (Flutter's own `build()` purity
  contract may make this the correct permanent shape, not merely a deferred one — unresolved, and this
  milestone found no new evidence either way).
- Private/derived getter methods on a `State` class, `_logBuffer`, `Theme.of`, dialog destinations,
  `ScaffoldMessenger.of` — all unchanged from the M9-0 roadmap, none touched.

## 14. Recommendation for M9-B

Not preselected — matching this milestone's own instruction not to define M9-B from an external
application's needs. Two concrete, evidence-backed candidates surfaced directly by this milestone's own
work, in order of scope clarity:

1. **C-style loop, multiple declared variables** — the narrower of the two, closely related to this
   milestone's own mechanism, with an exact fix shape already sketched (§13).
2. **Dialog destinations / `ScaffoldMessenger.of`** — carried over from the M9-0 roadmap (M9-B/M9-C
   there), each needing a new ADR before implementation, per M8-X's own finding.

Both are structural Dart/Flutter language or SDK gaps, justified by FlutterBridge's own specification and
fixture coverage — not by any external application's diagnostic count.

**M9-B has not been started.**
