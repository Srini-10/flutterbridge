# ADR-0040 — Bounded Member Helper Composition

## 1. Relationship to ADR-0038/ADR-0039

ADR-0038 (M9-Q) built the member-helper architecture and deliberately scoped getter bodies to reading
fields only — "no cross-member matrix... a getter's own body can never itself reference a further getter"
(§13). ADR-0039 (M10-A) generalized the architecture to methods, keeping the identical restriction for
methods (§10): an internal call (`node.target == null || node.target is ThisExpression`) was never passed
to `_externalMethodTarget` at all. This ADR closes that gap for both member kinds together: one bounded
executable member (a getter or a method) may now call ANOTHER bounded executable member on the SAME
receiver — `int quadrupled() => doubled * 2;` lowers to `Model_quadrupled(self) { return
Model_doubled(self) * 2; }`, never `self.doubled` (there is no such property). Every other piece of
ADR-0038/ADR-0039 is reused verbatim: the structural instance model, the helper model (Option A), member
and helper identity, module ownership, the dispatch-safe subset (`_dispatchSafeReceiverClass`), and the
private/static/generic exclusions all apply exactly as already written.

## 2. Architecture — Option A, selected

Of the five candidates the governing brief named:

- **A — semantic helper dependency edges** (selected): a member's own body may reference another member's
  declaration, resolved as a real `target`, with the generator's own reachability and emission logic
  extended to a genuine dependency graph. Reuses the entire existing helper model; the only new machinery
  is a fixed-point discovery walk and a fixed-point emission retry loop, both mirroring precedents already
  proven elsewhere in this codebase (`component.ts`'s own `referencedActions`, and `emitFunctionModules`'s
  own top-level-function retry loop).
- **B — generator discovers helper from target alone**: not adopted as a *separate* architecture — it is
  what Option A already does at the call site; the real work is upstream, in extraction and reachability.
- **C — normalize member dependency to an ordinary function call**: rejected — would blur member identity
  (owner-qualification, ADR-0032) into function identity for no benefit, and the existing helper model
  already handles the call shape directly.
- **D — inline the dependency's own body at each use site**: rejected for the identical reason ADR-0038 §2
  and ADR-0039 §2 already give — receiver/argument duplication, and (newly) a genuine correctness question
  for a member with side effects a bounded body could produce.
- **E — no composition (Outcome B)**: not selected — investigation found the remaining gap (evaluation
  order, shadowing, reachability, recursion policy) was closeable without new runtime architecture.

## 3. A real, pre-existing bug found and fixed before composition could be built safely

Composition could not be designed on top of the pre-existing member-`self`-rewrite without first fixing a
genuine, live correctness bug that predates this milestone: `PropertyAccess.target`/`Ref.target` is pure
declaration provenance (ADR-0033) — `other.count`, where `other` is some OTHER value of the SAME class
(a parameter, say), resolves to the IDENTICAL `FieldDecl`/`GetterDecl` target a genuine `this.count`/bare
`count` read would, since `_externalFieldTarget`/`_externalGetterTarget`/`_externalMethodTarget` all
delegate to `_instanceMemberTarget` for their own final symbol — confirmed directly (a method
`int combine(Model other) => other.count;` produces the exact same target a bare `count` read inside the
identical class would). The member-`self`-rewrite in `expression.ts` matched on `target` ALONE, with no
check that the receiver was actually `this` — so `other.count` was silently rewritten to `self.count`, a
wrong value no `tsc` check could ever catch (both sides are typed `Model`). Fixed with `isSelfReceiver`
(§7 below), shipped as a standalone commit (`c874ef8`) ahead of this ADR's own composition work, since
composition would otherwise have inherited and *widened* the identical flaw (a getter calling a sibling
getter, if matched on target alone, is exactly as vulnerable to the same confusion).

A second, related bug — private/static/late fields silently reaching the member-`self`-rewrite despite
M9-L's own DELIBERATELY eligibility-agnostic identity resolution for fields (§6 below) — was found and
fixed the same way, with its own new eligibility check (`isEligibleStructuralField`) rather than by
narrowing extraction.

## 4. Same-self only

Composition is supported ONLY for a receiver that is provably `this` (bare or explicit `this.`) — never a
DIFFERENT value of the same eligible type (`other.multiply(4)`, where `other` is some other parameter).
`isSelfReceiver` (§3) is the same check that fixed the field bug, reused here as the architectural
boundary, not merely a bug fix: `other.multiply(4)` continues to lower through the EXISTING, unmodified
external-method-call architecture (ADR-0039) — a real function call over `other`, never `self` — which was
already correct and needed no change. Nested-other-receiver composition (a member's body calling a method
on a project-class-typed FIELD it holds, or widening to arbitrary receivers) is explicitly out of this
milestone's own scope.

## 5. Bare internal method calls — a real extraction gap, closed

A bare instance method call (`multiply(4)`, implicit `this`, no explicit or cascade receiver) has no
`realTarget` at all — the analyzer only populates it for an explicit or cascade receiver — so, before this
ADR, it reached UIR as `logic.Call` with an unresolvable `callee` Ref, structurally identical to a call to
a top-level function this generator has no model for; a bare getter/field read, by contrast, already
carried a target via the pre-existing bare-`SimpleIdentifier` dispatch. `_invocation` now detects this case
explicitly — via `_externalMethodTarget(_thisType(element), element) != null`, the identical eligibility
gate an external call already uses — and synthesizes the identical `this`-receiver `logic.MethodCall`
shape an explicit `this.multiply(4)` already produces, so the generator has exactly one shape to handle
either way. Anything else (a genuine top-level function, a store/component method, or an instance method
that is not independently eligible) falls through completely unchanged to the pre-existing `logic.Call`
branch.

A real, live bug was found while building this: the synthesized receiver's own TYPE was built from the
whole `MethodInvocation` node's own `staticType` (the call's own RETURN type, `int`) rather than the
receiver's — `_thisType`, reconstructing the receiver type from the resolved member's own declaring class,
fixes this; `_instanceRef`'s own existing helper is not reused for the synthesized case, precisely because
it derives its type from `node.staticType`, which is only ever correct for a REAL `ThisExpression`/
`SuperExpression` AST node, never a synthesized one.

## 6. `_thisType`/`_receiverTypeFor` — internal access routes through the identical external gate

`_thisType(element)` reconstructs the receiver type an internal (`this`/bare) access has, from the resolved
member's own `enclosingElement`; `_receiverTypeFor(target, element)` returns it for a literal `this`
receiver, or the receiver expression's own `staticType` otherwise. Both a genuine external access and an
internal one now resolve a GETTER or METHOD through the IDENTICAL `_externalGetterTarget`/
`_externalMethodTarget` gate — never a separately, more weakly checked path — closing a real gap found
live: `_instanceMemberTarget`, called directly (as it was before this ADR, for `this.getter`/bare-method
internal reads), does not check static/abstract/`@override`/generic/required-positional, so an internal
composition reference to an otherwise-ineligible getter or method would have silently slipped through a
check an external reference to the identical declaration already had.

Fields are the one deliberate exception: `_internalMemberTarget` (§7) still routes a field read through
the broader, ungated `_instanceMemberTarget` — M9-L's own established, deliberately eligibility-agnostic
identity-resolution scope for fields (a real, pre-existing, correct test: a `static` field read inside a
`static` method still resolves a `target`) is preserved, not narrowed. The field-shape eligibility check
(public/final/non-static/non-late) instead lives at the GENERATOR layer (§3), which already had — and
after this ADR, has again — a second, independent re-check the way the class's own type-interface-building
code already does. An explicit getter has no such second safety net (the getter-helper emission loop
trusts the extractor's own gate completely), so it is routed through `_externalGetterTarget` even for
internal access, unlike a field.

## 7. `self` resolution — one new fact, taught once

`case 'logic.Ref':` (the generator) now recognizes `{kind: 'logic.Ref', name: 'this', target: undefined}`
— the only shape the extractor ever produces for `this` (a reserved word, so no other value can share it)
— and resolves it to the current member helper's own explicit `self` parameter, whenever
`scope.memberSelf` is set. This is reached wherever something else (the getter-helper lookup in
`PropertyAccess`, the method-helper lookup in `MethodCall`) emits `this` as an ordinary sub-expression via
`emitExpression(node['receiver'])` — e.g. `this.doubled` calling a SIBLING getter, or a bare `multiply(4)`
call's own synthesized `this`-receiver. `this.count` (a FIELD) never reaches this case at all, because the
field-rewrite, immediately preceding it in the same `case`, short-circuits before its own receiver is ever
emitted. Teaching this ONE new fact, in ONE place, is what lets the EXISTING getter-helper and
method-helper lookups compose "for free" — neither needed its own new code to support an internal `this`
receiver once `logic.Ref` itself understood what `this` means inside a member helper's own body.

A bare (implicit) getter-of-getter reference (`int quadrupled() => doubled * 2;`) needed one further
addition: `case 'logic.Ref':`'s own field-rewrite already tries a field-array match first; when that fails
AND the target is a member of `projectClassGetterIds` (§8), the getter-helper map is consulted directly,
resolving to `Model_doubled(self)` with no separate receiver expression to emit at all — there IS no
receiver node for a bare identifier.

## 8. `projectClassGetterIds` — the getter sibling of `projectClassMethodIds`

`MethodCall.target` was not this capability's own exclusive field (ADR-0039 §4: `_storeMemberTarget`
already uses it for unrelated reasons) — the identical fact turns out to hold for `PropertyAccess.target`
too, but for a DIFFERENT reason: a field never needs a helper (it is always `receiver.field`, correctly,
regardless of `target`), so `target` alone cannot distinguish "this names a field" from "this names a
getter that is eligible but was never emitted a helper for." `projectClassGetterIds` — the full,
unconditional set of every declared getter, mirroring `projectClassMethodIds`'s own construction — is what
lets `PropertyAccess`'s own getter-helper lookup refuse (`BRG3013`) rather than silently fall through to
`receiver.doubled`, closing a LATENT gap ADR-0038 itself already flagged (§16: "silently correct only
because no getter has yet existed with a set-but-un-helpered target in practice") — one composition makes
newly, directly reachable (an async getter, or a getter whose own body references something unsupported,
called internally from another member).

## 9. Reachability — a real fixed point, mirroring `referencedActions`

`reachableGetters`/`reachableMethods` (ADR-0038/ADR-0039) were each a single, non-recursive pass —
deliberately, since neither getter nor method bodies could reference a further member before this ADR.
Replaced with `reachableMembers`: seed exactly as before (component render trees, `sig.Action` bodies,
already-reachable top-level function bodies), then repeat — walk every NEWLY found member's own body for
further member references — until a pass adds nothing. Mirrors `component.ts`'s own `referencedActions`
(M8-O) exactly, the identical shape of problem already solved once in this codebase for `sig.Action`-to-
`sig.Action` calls: `foundGetters`/`foundMethods` are `Set<NodeId>`, so a self-reference or a mutual cycle
falls out for free, with no separate cycle-detection state. Proven directly, in a real fixture: `a` calling
`b` calling `c`, used only via `.a()`, makes all three reachable; the identical shape, used only via `.b()`
(never `.a()` anywhere in the program), reaches `b`/`c` but never emits `a` — reachability is directional,
never "the whole class is reachable because one of its own members is."

## 10. Emission — a real fixed point, mirroring `emitFunctionModules`'s own retry loop

The getter-helper and method-helper emission loops (previously two separate, single-pass loops per class)
are now ONE unified retry loop over a combined getter+method attempt pool, mirroring
`emitFunctionModules`'s own "Attempts, not a single ordered pass" discipline for top-level functions
exactly: a member whose own body references another member of the SAME class may be visited before or
after the one it depends on (declaration order is not a dependency order), so a failed attempt (`hadError`)
is retried, monotonically, until a full pass makes no progress. Proven adversarially: mutated to a single
pass, a method declared BEFORE its own dependency fails; reverting the mutation restores it — kept as a
permanent regression fixture, not only a mutation-test artifact.

**Recursion is refused for free, with no special-casing.** A self- or mutually-recursive member can never
be first (each depends on the other already being present in `getterHelpers`/`methodHelpers`), so neither
ever converges, and the pre-existing "target set but no helper" refusal (`BRG3013`) handles it exactly as
it already handles an async method — no recursion-specific check was written or is needed. Proven directly,
with a real fixture, and confirmed to terminate quickly (no hang) rather than loop forever: the loop's own
termination argument is unchanged from `emitFunctionModules`'s own — the known-good set is bounded and
never shrinks, and every pass that makes zero progress ends the loop.

A real scope-population bug was found and fixed while building this: `projectClassGetterIds`/
`projectClassMethodIds` are only threaded onto the real, shared root scope AFTER `emitFunctionModules`
fully returns (`pipeline.ts`) — correct for every EXTERNAL consumer, which only ever runs afterward — but a
member helper's OWN body, emitted from WITHIN this same function, needs to resolve an internal composition
reference DURING this function's own execution. Reading the not-yet-populated outer scope's version
silently produced `undefined` for every such lookup (surfacing as literal `undefined` text in the
generated source) instead of a real symbol. Fixed by computing both sets locally, immediately after
`getterOwnerOf`/`methodOwnerOf`, and explicitly overriding them in each member helper's own `helperScope`
— never inherited from the outer, not-yet-complete `scope` via the `...scope` spread.

## 11. Shadowing under composition

A parameter or local named identically to a sibling getter/method wins — a bare reference stays lexical,
never becomes a dependency edge, because a parameter/local reference carries no `target` at all
(`_instanceMemberTarget` requires `owner is InstanceElement`; a parameter's own `enclosingElement` is the
enclosing executable, never the class) — the identical mechanism ADR-0039 §6/§7 already established for
method parameters shadowing fields, requiring no new code for members too. The explicit member target
wins even under shadowing (`this.doubled` inside a method whose own parameter is also named `doubled`) —
the method-composition sibling of ADR-0039's own `this.value + value` proof.

## 12. Generic/async/static/private composition targets — regression re-proof, not new logic

`_externalMethodTarget` is the identical function both external and internal calls route through (§6) —
the M10-A second-pass fix (generic methods excluded via `element.typeParameters`) is not bypassed by
internal composition, proven directly rather than assumed: a bare generic-method call
(`identity<int>(3)`) never even reaches the `logic.MethodCall`/`target` shape at all, mirroring the
static-qualified-call precedent exactly. An async method dependency still resolves a `target` internally,
exactly as ADR-0039 §5 already established for external calls — the GENERATOR is still the layer that
declines to emit its helper, and the "target set but no helper" refusal (§10) is still what catches it, now
propagating through a REACHABLE caller too (`compute() => scaleUnsupported(2);`, where `scaleUnsupported`
has an optional parameter — `compute` itself refuses, since its own unresolvable internal dependency
prevents it from ever succeeding).

## 13. Schema — no change

Composition needed no new UIR field or node kind — `MethodCall.target`/`PropertyAccess.target`/
`Ref.target` already carried everything needed; the work was entirely in WHEN they get attached
(extraction) and HOW FAR reachability/emission look (generator). This mirrors ADR-0039 §12's own "no
eligibility flag, gate the target-attachment instead" pattern, extended from "attach or not" to "attach,
discover transitively, and emit with retry."

## 14. Selected Outcome: A2 — method↔getter and method↔method composition, no recursion

Both cross-kind directions (method→getter, method→method) ship, in both bare and explicit-`this` forms,
proven with a real fixture, real `tsc --strict`, and adversarial mutation testing. Recursion (direct or
mutual) is deliberately NOT supported — not because it was found unsafe, but because the fixed-point retry
loop's own natural termination already refuses it correctly, with no additional architecture needed or
built; a future milestone could add explicit recursion support (pre-reserving a helper's own name before
its body is confirmed to succeed) without revisiting anything this ADR establishes.

## 15. Future migration

Nothing here forecloses cross-receiver composition (a method calling another value's own method), getter↔
getter/method↔getter deferrals if any remain, mutual recursion, or a richer member dependency graph across
classes. This ADR's own reachability/emission fixed points, `self`-resolution, and eligibility-gate reuse
are additive and were not designed around same-self composition specifically — a richer composition subset
would reuse every piece of this ADR except the same-self restriction §4 names as the actual boundary.
