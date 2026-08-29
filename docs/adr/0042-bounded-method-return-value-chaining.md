# ADR-0042 — Bounded Instance-Method Return Values, Chaining & Result Semantics

## 1. Relationship to ADR-0038/0039/0040/0041

ADR-0038/0039 (M9-Q/M10-A) built bounded getter/method execution; every real-evidence example consumed
the result as a terminal expression (interpolated directly, or assigned once). ADR-0040 (M10-B) proved
one bounded member calling ANOTHER on the SAME receiver. ADR-0041 (M10-C) proved multi-argument calls and
richer receiver expressions. None of the four needed to state, as a standalone architectural fact, what
happens to a method's own RETURN VALUE once the call returns — whether it may be consumed by a further
expression, a further member access, or a further eligible method/getter call, and whether that holds
across TWO DIFFERENT classes, not just within one. This ADR is the record of that investigation. **No new
UIR representation, helper model, or runtime abstraction was introduced.** Every fact ADR-0038/0039/0040/
0041 already established (structural instance model, Option A helper model, member identity, module
ownership, `_dispatchSafeReceiverClass`, the evaluation-order contract) applies exactly as already
written.

## 2. Finding: return-value consumption already worked, for every shape tested — same class or not

A reduction ladder built from real Dart source, run through the real analyzer → extraction →
normalization → generation pipeline, confirmed the following required ZERO new code:

- **A primitive result, standalone, in arithmetic, or combined from multiple calls**
  (`model.multiply(3)`, `model.multiply(3) + 1`, `model.multiply(2) + model.multiply(3)`) — the call's own
  generated text is an ordinary TypeScript expression; nothing about "this value came from a method call"
  needed representing beyond the call text itself.
- **A field read on a method's own result** (`model.transform(2).count`, `model.getNext().count`) —
  `PropertyAccess`'s own receiver-emission is `emitExpression(node['receiver'])`, recursively handling
  whatever kind of node the receiver is; a `logic.MethodCall` receiver is emitted exactly the same way a
  `logic.Ref`/`logic.New` one already is.
- **A getter call on a method's own result** (`model.getNext().doubled`) — same reasoning, composing to
  `Model_doubled(Model_getNext(self))`, never `.doubled` property syntax on the call's own result.
- **A method call on a method's own result — the critical chaining case**
  (`model.getNext().multiply(4)`) — composes to `Model_multiply(Model_getNext(self), 4)`, never
  `Model_getNext(self).multiply(4)` (which would be a runtime-prototype-method call the emitted structural
  object has no member for).
- **A project-class result declared in a DIFFERENT Dart file** (`Model.toOther(): OtherModel`, `OtherModel`
  declared in `other_model.dart`) — the cross-module import wiring, the class's own emitted interface, and
  a further getter call chained off the cross-file result (`model.toOther().doubled`) all worked
  identically to the same-file case, because the transitive class-type-reachability fixed point ADR-0041
  §3 already built chases a method's own RETURN type exactly the same way it chases a field's type,
  regardless of which file declares it.

Every method helper's own generated signature already carried its real, resolved return type
(`typeTextOf(method['returnType'], ..., classOf)`, unchanged since M10-A) — there was no separate "does the
helper expose its return type" question to answer; the machinery already existed and was already correct
for every return type this ADR's own eligibility subset (§3) admits.

## 3. Bounded subset: return-type eligibility

The method itself must still meet every existing ADR-0039/ADR-0040/ADR-0041 eligibility gate (public,
instance, concrete, non-static, non-abstract, non-`@override`, non-generic, uniformly required-positional,
non-function-typed parameters, owner-consistent). Additionally, the method's own return type must now be
one of:

- **A.** A `dart:core` value type already representable by the existing `TypeRef`/`typeTextOf` machinery:
  `int`, `double`, `num`, `bool`, `String` — checked via the real analyzer's own resolved type identity
  (`DartType.isDartCoreInt`/`isDartCoreDouble`/`isDartCoreNum`/`isDartCoreBool`/`isDartCoreString`), never
  a type-name string comparison.
- **B.** A project class satisfying the IDENTICAL dispatch-safety shape a RECEIVER's own type already
  must (`_dispatchSafeReceiverClass`: non-generic `InterfaceType`, public `ClassElement`, no explicit
  superclass other than `Object`, not a component/`State`/store base) — reused verbatim, not re-derived,
  for exactly the reason ADR-0038 §10 already gives for receivers: a subclass-typed value can never pass
  this gate, closing the identical dynamic-dispatch safety argument for a RETURNED value that already holds
  for a received one.

Excluded, and confirmed refused honestly (never silently emitting `unknown` or a broken type) by real
probes: `dynamic` (a return type the source itself declined to state — trivially fails both A and B);
`List<int>`/any generic instantiation (`_dispatchSafeReceiverClass`'s own `typeArguments.isNotEmpty` check
already excludes it, reused unchanged); `Future<int>` on a NON-`async` method (fails both A and B; a
non-async method returning a bare `Future` has no established support anywhere in this codebase and is not
newly excluded by this ADR — it was already unreachable for an unrelated reason, confirmed by probe: the
method's own body, `Future.value(count)`, already had no lowering, refusing via the PRE-EXISTING "target
set but no helper" path); a subclass-typed return (`Derived extends Base`); a private-class return
(`_PrivateReturn`); an external-package/framework class with an explicit superclass (Flutter's own `Size`,
which extends `OffsetBase` — excluded by the identical superclass check, not a new named exclusion).

**Deliberately exempted from this check: an `async` method** (`element.firstFragment.isAsynchronous`).
ADR-0039 §5's own established, separately-tested split keeps the async EXCLUSION at the GENERATOR layer,
not the extractor — an async method's return type is language-mandated to be `Future`/`FutureOr`/
`Stream`-shaped, which this gate would otherwise always reject, moving the exclusion to the wrong layer
and breaking the pre-existing, real regression test "an async method still resolves a target at THIS
layer — the generator, not the extractor, excludes it." Confirmed directly: without this exemption, that
test failed; with it, the full Dart suite passes unchanged.

## 4. A real gap found and fixed: return type was unchecked, and reached the generator as `unknown`

Before this milestone, `_externalMethodTarget` checked a method's own PARAMETERS (arity-kind since M10-A,
function-typed-ness since M10-C) but never its own RETURN type. A method returning `dynamic` or
`List<int>` still resolved a `target` and reached a real, un-refused helper whose own signature rendered
the return type `unknown` (`typeTextOf`'s own SDK-type fallback) — safe only by accident, wherever the
caller happened to consume it in a position `unknown` also satisfies (a template-literal interpolation),
and a real `tsc --strict` failure, never this compiler's own honest `BRG3013`, the moment a caller chained
a further member off the result or assigned it to a narrower type. This is the identical silent-wrong-code
shape the M9-R closure fix and the M10-C function-typed-parameter fix both already exist to prevent, now
closed for RETURN type the same way it was already closed for parameter type and arity-kind: a new
`_isEligibleMethodReturnType` function, checked at the identical extraction-layer gate every other
unsupported method shape already refuses at (§3).

## 5. A second real gap found and fixed: cross-class method-helper emission was not a global fixed point

The member-helper retry loop ADR-0040 §10 built (`memberAttempts`/`remainingMembers`/`memberProgressed`)
was scoped PER CLASS — each eligible class's own getters/methods were attempted to a fixed point before
ever moving to the NEXT class in the (canonically NodeId-sorted, not dependency-ordered) class-emission
loop. This was sufficient for ADR-0040's own scope (one member depending on ANOTHER member of the SAME
class), but a real, live-probed bug emerged the moment one class's own method could depend on a DIFFERENT
class's own method (return-value chaining, this ADR's own new capability): if class `Bravo`'s id happened
to sort before class `Alpha`'s, and `Bravo.chain()` called `toAlpha().terminal()` (a real,
otherwise-fully-supported, ACYCLIC dependency on `Alpha.terminal()`), `Bravo`'s own per-class retry loop
exhausted itself with `chain` still unresolved — `Alpha_terminal` did not exist in `methodHelpers` yet,
since `Alpha` had not been processed — and `Bravo` was never revisited once its own loop finished, even
though `Alpha.terminal()` became available moments later. `chain()` refused `BRG3013` PERMANENTLY, purely
as an artifact of class processing order, for a call this generator is fully capable of lowering. This is
structurally the identical "declaration/class order is not a dependency order" problem ADR-0040 §10 itself
already names and ADR-0041 §3 already re-solved once for TYPE reachability — now recurring a third time,
for METHOD-HELPER BODIES, across classes.

### Fix

The per-class member-attempt collection and its retry loop are split: each eligible class's own field
INTERFACE is still built per-class, in the existing canonical order (unconditional — an interface can
never fail to lower the way a method body can, so no retry is needed there, unchanged from ADR-0041 §3).
Each eligible class's own getters/methods, however, are collected into ONE GLOBAL `memberAttempts` array
spanning every eligible class, and the fixed-point retry loop (`remainingMembers`/`memberProgressed`) now
runs ONCE, globally, over that combined pool — mirroring `reachableFunctions`'s own top-level-function
retry discipline, and ADR-0040 §10's own per-class one, extended one level further. `Bravo.chain()` and
`Alpha.terminal()` are now both in the SAME retry pool: `Alpha.terminal()` succeeds on the pool's first
pass (no dependency of its own), and `Bravo.chain()` succeeds on the pool's SECOND pass (its dependency,
`Alpha_terminal`, now exists in `methodHelpers`) — regardless of which class's own id happened to sort
first. Confirmed directly: the exact `Bravo`-sorts-before-`Alpha` probe that previously refused now
lowers correctly (`Bravo_chain(self) { return Alpha_terminal(Bravo_toAlpha(self)); }`), passing real
`tsc --strict`.

**Recursion — self-, mutual-, and now cross-class — is still refused for free, with no special-casing.**
A member anywhere in a dependency cycle can never be first (each depends on another member of the SAME
cycle already being present in `getterHelpers`/`methodHelpers`), so none of them ever converges, and the
pre-existing "target set but no helper" refusal (`BRG3013`) handles it exactly as it already handled a
same-class self-recursive method (ADR-0040 §10). Proven directly with a real, two-class mutual cycle via
return-value chaining (`MutualA.cycle() => toB().cycle2();` / `MutualB.cycle2() => toA().cycle();`, no base
case) — confirmed to refuse cleanly (`cycle` has no supported lowering...) and TERMINATE QUICKLY (no hang,
no infinite loop), both before and after the global-retry-loop restructuring.

## 6. Evaluation order — unchanged, re-proven under chaining

ADR-0041 §5's own contract (receiver before arguments, left-to-right, exactly once, never reordered) holds
unchanged for a chained call: `model.first(a(), b()).second(c())` lowers with `first`'s own receiver and
arguments evaluated exactly once, in source order, BEFORE `first`'s own call text is ever used as
`second`'s receiver — a structural fact of `emitExpression`'s own recursive, single-pass evaluation, not a
new guarantee this milestone had to add. Confirmed by exact-string assertion in the real fixture (§9) and
by the identical mutation-testing discipline ADR-0041 §7 already established (reordering or duplicating any
sub-expression breaks a real, exact-string regression test).

## 7. Schema — no change

Return-value chaining needed no new UIR field or node kind — `logic.MethodCall`'s existing
`receiver`/`args`/`target`/`returnType` fields already carried everything needed; a chained call is simply
one `logic.MethodCall` (or `logic.PropertyAccess`) nested as ANOTHER `logic.MethodCall`'s own `receiver`,
a shape the schema already permits and the generator already recurses into via `emitExpression`. The two
real gaps this ADR closes (§4, §5) are both generator/extractor-internal — a new extraction-layer
eligibility predicate and a broadened, already-existing retry-loop scope — never a schema change. This
mirrors ADR-0041 §6's own "no eligibility flag, extend discovery and emission instead" pattern.

## 8. Rejected alternative: a runtime class or prototype for a chained result

Considered and rejected, for the identical reason ADR-0038 §2/ADR-0039 §2 already give: a returned
project-class value is, and remains, a plain structural object literal (`{ count: 8 }`) — attaching a
runtime method/getter to it (a class, a prototype, a wrapper) would let `.multiply(4)` resolve as an
ordinary JavaScript method call, reintroducing exactly the unsafe-dynamic-dispatch shape M9-J's own
refusal exists to prevent, for no benefit the existing helper-composition model does not already provide
soundly. No runtime class or prototype was introduced or is required.

## 9. No new identity concept required

A chained call's own "identity" — which class's method it is, which helper it resolves to — is carried
entirely by the EXISTING mechanisms: `MethodCall.target` (declaration provenance, ADR-0033), `classOf`
(module-qualified name resolution, ADR-0034), and `methodHelpers`/`getterHelpers` (the existing helper
registry, ADR-0038/0039). Nothing about "this value came from a chained call rather than a bare receiver"
needed its own representation anywhere in the pipeline — the generator's own recursive `emitExpression`
already treats a `logic.MethodCall` receiver exactly like any other expression-shaped receiver, which is
precisely why zero new representation was needed for chaining to already work (§2).

## 10. Selected Outcome: A — full support for the bounded subset, zero new architecture

Primitive and eligible-project-class return values may be consumed by arithmetic, assignment, a further
property read, a further eligible getter, or a further eligible method call — same class or a different
one, same file or a different one — through the existing ADR-0038/0039/0040/0041 architecture, with two
narrow, additive fixes: a return-type eligibility gate (§4) and a cross-class global retry loop for
method-helper emission (§5). This is not Outcome B: no chaining, evaluation-order, return-type-identity,
or recursion question was found unanswerable by the existing architecture — only two real gaps, both
closed at the same narrow layer their own ADR-0039/ADR-0040 precedents already established.

## 11. Future migration

Nothing here forecloses a richer return-type subset (nullable project-class returns, a broader `dart:core`
value-type allowlist), constructors as first-class runtime values, or async/Future-returning method
support. The return-type eligibility gate (§4) and the global member-helper retry pool (§5) are additive
and were not designed around this milestone's own reduction ladder specifically — a future milestone
extending either boundary would reuse every piece of this ADR unchanged.
