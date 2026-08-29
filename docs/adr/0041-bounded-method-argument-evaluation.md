# ADR-0041 — Bounded Instance-Method Arguments, Evaluation Order & Receiver Semantics

## 1. Relationship to ADR-0039/ADR-0040

ADR-0039 (M10-A) shipped bounded structural instance-method execution; every real-evidence example carried
one or two arguments and a locally-constructed receiver. ADR-0040 (M10-B) generalized member composition
(one bounded member calling another on the SAME receiver). Neither ADR needed to state, as a standalone
architectural fact, what happens when a method call carries THREE OR MORE arguments, or when the receiver
itself is a richer expression — constructed inline at the call site, produced by a function call, or
produced by a getter/method declared on a DIFFERENT project class. This ADR is the record of that
investigation: real evidence that the existing `MethodCall`/helper/receiver/argument architecture already
generalizes, unchanged, to every one of those shapes, plus the one real gap the investigation found and
closed. **No new UIR representation, helper model, or runtime abstraction was introduced.** Every fact
ADR-0038/ADR-0039/ADR-0040 already established (structural instance model, Option A helper model, member
identity, module ownership, `_dispatchSafeReceiverClass`, the private/static/generic exclusions, same-self
composition) applies exactly as already written.

## 2. Finding: multi-argument, constructed-receiver, and function-produced-receiver calls already worked

A reduction ladder built from real Dart source, run through the real analyzer → extraction → normalization
→ generation pipeline, confirmed the following required ZERO new code:

- **Three-plus required-positional arguments**, non-commutative and non-associative
  (`weighted(a, b, c) => count*100 + a*10 - b*3 + c`) — `emitArguments` already maps every argument
  expression through `emitExpression` and joins them in source order; nothing in the architecture ever
  special-cased "exactly one argument."
- **A receiver constructed inline at the call site** (`Model(7).multiply(3)`) — the receiver is just
  another expression `emitExpression` evaluates, once, before `emitArguments` runs; there is no
  "was this receiver a local variable" branch anywhere in the `MethodCall` case for the helper-call path.
- **A receiver produced by a function call** (`makeModel().multiply(4)`) — same reasoning; a `logic.Call`
  receiver lowers exactly the way a `logic.Ref`/`logic.New` one does.
- **A nested method call inside an argument position** (`a.multiply(b.add(1))`, and the member-composition
  sibling `weighted(a, doubled, multiply(2))`, an argument list mixing a getter call and a method call on
  the SAME receiver as the outer call) — each sub-call lowers through its own, independent
  `emitExpression`/helper-lookup, in the position the source itself put it, exactly once.

This is the strongest form of "the architecture already generalizes": not a claim, but a real, live-probed,
now-permanently-regression-tested absence of change.

## 3. The one real gap found and fixed: transitive project-class-type reachability

`classIdsNeedingTypes` (`functions.ts`) — the set of `logic.ClassDecl`s that need a real emitted TypeScript
interface — was, before this ADR, populated from exactly two sources: a component's or already-reachable
top-level function's own parameter/return types (`reachableClassTypes`, ADR-0034), and the OWNER class of
every reachable getter/method. Neither source chased a DISCOVERED class's own field types or its own
reachable members' return/parameter types for FURTHER class references. A class reached only
TRANSITIVELY — `Container.model: Model`, or `Container.buildModel(): Model`, where `Model` is never itself
a component parameter and `Container` is only reachable through ITS OWN getter/method being called — never
entered the set. `classOf(ModelId)` then returned `undefined`, and the field/return type silently rendered
as `unknown`, failing real `tsc --strict` with `Argument of type 'unknown' is not assignable to parameter
of type 'Model'` at every call site that passed the cross-class value on to a method helper. Confirmed with
a minimal reproduction (a plain field, zero methods or getters) that this predates M10-C — a real,
pre-existing ADR-0034-era gap this milestone's own receiver reduction ladder (a getter-produced and a
method-produced receiver of a DIFFERENT project class) was the first real evidence to reach.

A second, related defect compounded the first even once both classes WERE in the set: `[...classIdsNeedingTypes].sort()`
is a canonical order (by `NodeId`), never a dependency order, so the single-pass class-emission loop could
process a REFERENCING class (`Container`) before the REFERENCED one (`Model`) whenever the referencing
class's own id happened to sort first — `classOf` would then read `classModules` before the referenced
class's own entry existed, with the identical `unknown` result. Confirmed directly against the real
`method_argument_semantics` fixture: `ModelHolder`'s own id sorts before `Model`'s.

### Fix, in two parts, both additive

1. **Transitive type-reachability, a real fixed point.** `directClassTypeTargetsFromClass` walks a single
   class's own ELIGIBLE fields (the identical `isEligibleStructuralField` filter the interface-builder
   itself applies — an ineligible field's type is never emitted, so chasing it would discover a class the
   program never needs a type for) and its own REACHABLE getters'/methods' return and parameter types.
   `emitFunctionModules` seeds a queue from the existing (non-transitive) `classIdsNeedingTypes`, then
   repeats — walk every NEWLY discovered class for further references — until a pass adds nothing. This is
   the identical shape of fixed point ADR-0040 §9 already built for member reachability
   (`reachableMembers`), applied here to TYPES rather than executable members; `Set`-based dedup means a
   cycle between two classes' own field types falls out for free, with no separate cycle-detection state.
2. **Two-pass class emission, name-then-body.** The single class-emission loop is split: **Pass 1** iterates
   the (now-transitively-complete) `classIdsNeedingTypes` in the same canonical sorted order as before, and
   does ONLY name/module reservation — populating `classModules` completely for every eligible class,
   collecting each one's own resolved metadata into an `EligibleClass[]` array. **Pass 2** iterates that
   array and builds interface text and member helpers, exactly as the single pass used to, but `classOf` is
   now safe regardless of which class's id happens to sort first, because EVERY eligible class's own module
   entry already exists before Pass 2 begins. No retry loop is needed here (unlike the member-helper
   emission loop, ADR-0040 §10) — interface/helper emission from a fully-resolved class is unconditional; it
   is not something that can fail and need reattempting the way a function body can.

`isEligibleStructuralField` (previously private to `expression.ts`, duplicated inline inside the
interface-builder loop in `functions.ts`) is now exported and shared by both — the transitive-discovery
walk and the interface-builder loop apply the identical eligibility filter, by construction, rather than
two independently-drifting copies (the situation ADR-0040 §3's own doc-comment fix already corrected once
for the member-`self`-rewrite; this closes the identical class of drift for class-type discovery).

## 4. A second real gap found and fixed: function-typed method parameters

While investigating this milestone's own non-goal "closures/function-valued method references," a method
whose own parameter is FUNCTION-TYPED (`int applyCallback(int Function(int) fn) => fn(count);`) was found
to still resolve a `target` at the extraction layer — `_externalMethodTarget`'s own required-positional
check (`param.isRequiredPositional`) never inspected a parameter's own TYPE, only its positional-ness. The
generator then emitted a real helper whose own signature rendered the function type as `unknown` (this
generator has no lowering for a Dart function type) and whose own BODY called that `unknown`-typed
parameter — code that reaches real `tsc --strict` as `This expression is not callable... 'unknown' has no
call signatures`, never this compiler's own honest `BRG3013`. This is the identical silent-wrong-code shape
the M9-R closure fix and every subsequent `_externalMethodTarget` exclusion (generic methods, M10-A) exist
to prevent, now closed for parameter TYPE the same way it was already closed for parameter ARITY-KIND:
`_externalMethodTarget` now excludes a method with any function-typed parameter at the identical gate the
optional/named-parameter and generic-method exclusions already live at, so `target` never resolves, and the
call reaches the pre-existing M9-J unmodelled-member-receiver refusal (`BRG3013`) instead.

A DYNAMIC receiver (`dynamic model; model.multiply(3)`) was investigated alongside this and found to be
correctly, deliberately UNCHANGED: `isUnmodelledMemberReceiver` (`expression.ts`) already excludes `dynamic`
by name, with its own doc comment recording why (M9-J §6) — `value.foo()` on a `dynamic` receiver is
ordinary, valid Dart the generator has always passed through naively, and refusing it now would be a
regression of pre-existing, accepted behavior, not a new correctness fix. This milestone's own non-goal
"arbitrary dynamic dispatch" was already honestly, narrowly scoped by that pre-existing exclusion; no change
was needed or made.

## 5. Evaluation-order contract

For every `logic.MethodCall` this generator lowers to a helper call:

1. **The receiver is evaluated before any argument.** `expression.ts`'s own `case 'logic.MethodCall':`
   computes `const receiver = emitExpression(node['receiver'], scope)` before `emitArguments` is ever
   called — a structural fact of the function's own control flow, not a runtime guarantee layered on top.
2. **Arguments are evaluated left-to-right.** `emitArguments` maps `node['args']` (already in the program's
   own source order — the extractor never reorders an argument list) through `emitExpression` via `.map`,
   which visits an array in index order, and joins the results with `, ` in that same order.
3. **Every sub-expression is evaluated exactly once.** Neither the receiver nor any argument expression is
   ever re-emitted, referenced twice, or memoized-then-reused within a single call's own lowering — the
   generated call text contains one syntactic occurrence of each source sub-expression, in the position the
   source itself put it.
4. **No sub-expression is reordered relative to another.** The call's own generated argument list is a
   literal, position-preserving projection of the source's own argument list.

This contract was not merely asserted — it was proven by construction (the architecture's own control flow
has no seam where a reorder or duplication COULD occur without an explicit code change) and by adversarial
mutation (§7): reversing argument order, swapping receiver/argument positions in the call template, and
duplicating the receiver's own emitted text were each independently mutated in, confirmed to break a real,
exact-string regression assertion, and reverted.

## 6. Schema — no change

Multi-argument calls, constructed/function/cross-class receivers, and nested argument-position composition
needed no new UIR field or node kind — `logic.MethodCall`'s existing `receiver`/`args`/`target` fields
already carried everything needed. The one schema-ADJACENT change this ADR makes is in the GENERATOR's own
internal type-reachability bookkeeping (`classIdsNeedingTypes`, §3) — not the UIR schema itself, which is
unchanged. This mirrors ADR-0039 §12's and ADR-0040 §13's own "no eligibility flag, extend discovery and
emission instead" pattern.

## 7. Adversarial mutation testing

Six mutate → run → revert cycles, each targeting a real invariant this milestone's own new surface area
depends on (the unchanged M10-A/M10-B mechanisms — BRG1310 precedence, the member-helper retry loop,
same-self composition — were already mutation-proven in their own ADRs and were not re-mutated here):

1. **Swapped argument order** (`emitArguments`: `.reverse()` before `.join`) — caught: 6 test failures
   across the new multi-argument fixture and the existing M10-A external-receiver regression, both via
   exact-string assertions on generated argument order.
2. **Swapped receiver/argument position in the call template** (`` `${name}(${args}, ${receiver})` ``) —
   caught: 18 failures across three build-proof suites.
3. **Duplicated the receiver's own emitted text** (`` `${name}(${receiver}, ${receiver}, ${args})` ``) —
   caught: 21 failures.
4. **Removed the function-typed-parameter exclusion** (§4) — caught at BOTH layers: the new Dart extraction
   test (`target` resolved when it should not have) and the new TypeScript refusal test (`BRG3013` no
   longer reported).
5. **Weakened `isSelfReceiver`** (dropped the `name === 'this'` check, matching any untargeted `logic.Ref`)
   — caught by the PRE-EXISTING M10-A `combineWith`/`other.count` regression test, confirming this
   milestone's own new argument/receiver work did not accidentally widen ADR-0040's own same-self boundary.
6. **Reverted the two-pass class-emission split to a single pass** (moved `classModules.set` from the
   name-reservation loop into the body-building loop) — caught: the cross-class receiver test and the real
   `tsc --strict` test both failed, exactly reproducing the original `unknown`-type defect (§3).

Every mutation was reverted immediately after being confirmed caught; `git diff`/`git status --short` at the
end of this milestone's own work shows zero residue from any of the six cycles.

## 8. Selected Outcome: A — full support, zero new architecture

Every reduction-ladder shape the governing brief named — multi-argument calls, non-commutative evaluation
order, constructed/function/cross-class-getter/cross-class-method-produced receivers, fully nested
construction-and-call chains, argument-name shadowing, external (prop) receivers, and helper composition
inside argument position — lowers correctly through the existing ADR-0038/ADR-0039/ADR-0040 architecture,
with the two additive, narrow fixes recorded above (§3, §4). This is not Outcome B (documented refusal):
investigation found no receiver-evaluation-order, argument-evaluation-order, exactly-once, shadowing, or
helper-reachability question the existing architecture answers incorrectly — only two real gaps, both
closed at the same narrow layer their own M10-A/M10-B precedents already established (a generator-side
reachability/ordering fix for §3, an extraction-side eligibility-gate exclusion for §4), neither requiring a
new representation, a runtime class or prototype, global mutable state, or a name-based special case.

## 9. Future migration

Nothing here forecloses a richer receiver-argument interaction (a receiver expression that itself has an
observable side effect requiring memoization, currently out of scope — the one real render-tree-local
re-inlining gap this milestone's own audit found and left deliberately unfixed, see the milestone doc's own
silent-wrong-code audit section), named/optional method parameters, generic methods, or recursive methods.
The evaluation-order contract (§5), the transitive class-type-reachability fixed point (§3), and the
function-type parameter exclusion (§4) are additive and were not designed around this milestone's own
reduction ladder specifically — a future milestone extending any of these boundaries would reuse every piece
of this ADR unchanged.
