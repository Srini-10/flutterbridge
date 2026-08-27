# ADR-0039 — Bounded Structural Instance Method Execution

## 1. Relationship to ADR-0038

ADR-0038 built the entire member-helper architecture — the structural runtime model, the explicit `self`
receiver, member identity, helper identity, module ownership, the dispatch-safe receiver-class gate
(`_dispatchSafeReceiverClass`), and the `memberSelf` field-rewrite mechanism — and applied it to getters
only, deferring methods (§14 there) for one reason alone: a getter has no arguments, so ADR-0038's own
investigation never had to prove method receiver-then-argument evaluation order or the interaction between
a method's own parameter and a field of the identical name. This ADR closes exactly that gap. Every other
piece of ADR-0038 is reused verbatim, not re-derived: the structural instance model (§1), the helper model
(§2, Option A), the explicit receiver (§3), member/helper identity (§4/§5), module ownership (§6),
external/constructed receiver coherence (§7), `target`-as-provenance (§9), the dispatch-safe subset (§10),
the field-rewrite mechanism (§12), determinism (§19), and the private/static/generic exclusions (§15) all
apply to a method exactly as written for a getter, with "getter" read as "member."

## 2. Architecture options re-evaluated for methods

- **A — extend the ADR-0038 member-helper architecture to methods with real parameters** (selected):
  `Model_multiply(self, factor)`. The only new work is threading the method's own parameters through the
  helper's signature, after `self`, and proving the identity/shadowing/evaluation-order facts a
  zero-parameter getter never exercised.
- **B — attach method values to object literals**: rejected for the identical reason ADR-0038 §2 already
  gives — two incompatible representations of "a `Model`" depending on how a value arrived.
- **C — a runtime TypeScript class**: rejected for the identical reason ADR-0038 §2 already gives.
- **D — inline the method body at each call site**: rejected for the identical reason ADR-0038 §2/§8
  already gives, now with a second hazard a getter never had — inlining would duplicate not only the
  receiver's own text but each argument expression's own text, once per field/parameter reference inside
  the body.
- **E — keep methods refused (Outcome B)**: not selected — this ADR's own investigation found no evidence
  that a bounded, required-positional-only method subset is unsound; see §5-§8 below for the evaluation-
  order and shadowing proof ADR-0038 §14 named as the actual, sole missing piece.

## 3. Method eligibility — `_externalMethodTarget`

A method is executable-eligible only when: `_dispatchSafeReceiverClass` admits the receiver's own type
(the identical, unmodified gate ADR-0038 §10 already established — a subclass-typed receiver can never
pass it, so the entire dynamic-dispatch exclusion is inherited without a new argument); the resolved
element is a real `MethodElement` (not a getter/setter, which the analyzer already resolves to distinct
element types) and not `isOperator` (Dart's `[]`/`[]=` reach this file through the identical
`logic.MethodCall` shape an ordinary call has — M4-H — so `isOperator` is checked directly rather than
trusted to already be excluded by call syntax); non-static, non-abstract (a real body), non-external,
non-private, carries no `@override` annotation; is declared directly on the receiver's own class (owner
consistency, identical to ADR-0038's field/getter checks); its own `typeParameters` are empty (a generic
*method*, `T identity<T>(T value) => value;`, on an otherwise-eligible non-generic class — found live as a
real gap: `_dispatchSafeReceiverClass`'s own generic check only ever inspects the RECEIVER's type
arguments, never the resolved member's own type parameters, so this exclusion is independent of it, and
`ClassDecl.methods`'s own `FunctionDecl` shape has no field to represent `T` faithfully in a helper
signature regardless); and every one of its own parameters is `isRequiredPositional` — no optional, named,
or default-valued parameter, mirroring the identical boundary ADR-0037 already drew for a constructor's own
field-formals.

Binary operators (`+`, `-`, …) never reach this gate at all — Dart's own binary-operator syntax extracts
to `logic.Binary`, never `logic.MethodCall` — proven directly, alongside the identical structural fact for
a static-qualified call (`Model.scale(3)`), which extracts to `logic.Call` with a qualified `callee`
reference, never a `MethodCall` with a receiver.

## 4. `target` is not exclusively this capability's own field

`MethodCall.target` was not new to this ADR: `_storeMemberTarget` (M7-N, ADR-27) already attaches a
`target` to a locally-owned store instance's own action call (`_left.add(5)`) for an entirely separate,
pre-existing reason — a store's own generated shape has a real, callable method, and the ordinary
`receiver.method(args)` lowering is already correct for it. A `MethodCall.target` string is therefore not,
by itself, proof that this capability owns the call. The generator distinguishes the two by an explicit
`projectClassMethodIds` set — every method declared on every `logic.ClassDecl` in the program, built once
alongside `methodHelpers` — and only ever treats `target` as an ADR-0039 method-helper reference when it is
a member of that set; any other `target` (a store action, or any future capability that reuses this same
field for its own provenance) falls through to its own, unrelated, unmodified lowering, exactly as it did
before this ADR existed. This was found, not assumed: the first working implementation, checked only
`typeof node['target'] === 'string'`, broke `fixtures/apps/local_store`'s own `_left.add(5)`/`_left.increment`
calls by routing them into this capability's own refusal path.

## 5. Refuse, never fall through, when `target` is eligible but no helper was emitted

`_externalMethodTarget`, like `_externalGetterTarget` before it, does not check `isAsync`. An `async`
method meeting every other gate still resolves a `target` at the extraction layer (proven directly — a
`Future<int>` async method still carries a non-null `target`); the TypeScript generator's own
`emitFunctionModules` loop separately declines to emit a helper for one (`method['isAsync'] === true`).
ADR-0038's own getter case treats this identically — `getterHelpers.get(target)` returning `undefined`
falls through, unconditionally, to the pre-existing M9-J refusal check, which is only reachable when
`node['target'] === undefined`; for a getter this is silently correct only because no getter has yet
existed with a set-but-un-helpered target in practice. A method has more ways to reach this state (an
`async` body, an unsupported block-body construct, a named/optional parameter that somehow reached this
far), so this ADR closes it explicitly rather than inheriting the getter's own latent shape: a
`MethodCall` whose own `target` is a member of `projectClassMethodIds` but absent from `methodHelpers`
reports `BRG3013` directly, and never reaches the naive `receiver.method(args)` lowering below it. Falling
through here would reopen, for this narrower gate, precisely the silent-wrong-code shape the M9-R closure
fix (`docs/m9/m9r-final-closure.md` §22) exists to prevent.

## 6. Parameter identity and shadowing — freshly proven, not assumed from ADR-0038

A method's own parameters are bound by `_methods()` via the identical `Scope.forBody(scope,
owner: symbol, body: member.body).child([Binding(name: parameter.name!.lexeme, binds: Binds.parameter)
...])` mechanism `_function` (a top-level function) already uses — proven directly (`extraction_test.dart`,
"bounded structural instance method execution provenance" group) rather than inferred from ADR-0038's own
getter-level conclusion, per the governing brief's own explicit instruction. A bare reference to a
parameter carries no `target` at all: `_instanceMemberTarget` requires `owner is InstanceElement`
(checking `element.enclosingElement`), and a parameter's own `enclosingElement` is the enclosing
executable, never the class — so a parameter reference falls straight through `memberSelf`'s own
field-rewrite check (which only fires when `target` resolves to an entry in the owning class's own
embedded `fields` array) to the pre-existing `scope.paramInScope` resolution, requiring **no new
generator-side mechanism** for shadowing to work correctly. Proven directly, in a real fixture
(`fixtures/apps/instance_method_execution`, `Box.combine`): a parameter named `value`, identical to the
field `value`, resolves a bare reference to the parameter and an explicit `this.value` to the field in the
same body; a sibling method (`Box.doubledViaLocal`) proves the identical fact for a LOCAL variable
shadowing a field, with no parameter of the same name at all — the identical Q59 shape ADR-0038 already
proved for a getter, reproven here for a method whose own body has no parameters to interact with it.

## 7. Method helper scope has no closure over any outer scope

A method helper's own `EmitScope` sets `paramInScope: (name) => paramNames.get(name)` — returning
`undefined`, never falling through to the enclosing `scope.paramInScope`, for any name that is not one of
this method's own parameters. This mirrors the getter helper's own `paramInScope: () => undefined` (ADR-0038):
a member helper is a plain, standalone, module-level function, so a name that coincidentally matches an
unrelated component prop or action parameter must fail to resolve inside it, never accidentally close over
a value that has no business being visible there.

## 8. Argument evaluation order and exactly-once evaluation

The receiver is emitted once, at the top of the `logic.MethodCall` case, exactly as ADR-0038 §8 already
established for a getter read; every argument is emitted once each, in the program's own left-to-right
`args` array order, by the same `emitArguments` helper the pre-existing, long-tested naive
`receiver.method(args)` lowering already used and still uses for every method call this capability does not
claim. This ADR changes *what* the call becomes (a helper invocation instead of a property call) but not
*how* the receiver or its arguments are individually emitted — each is still exactly one call to
`emitExpression`, textually inserted exactly once, in the identical order the source expression tree
already encodes. No new evaluation-order machinery was written or was needed; multiple-argument order and
exactly-once evaluation for both the receiver and every argument follow from reusing the identical,
already-proven expression-emission calls, not from any new bookkeeping this ADR introduces.

## 9. Supported method subset — Outcome A2

Public, instance, non-static, non-abstract, non-external, non-generic, non-operator, non-getter/setter
method, with uniformly required-positional parameters, declared directly on a public, non-generic,
direct-`Object`-superclass, non-component/State/store class (`_dispatchSafeReceiverClass`), whose own body
is either expression-bodied or block-bodied and reads only fields, its own parameters, and locals derived
from them — never another getter or method (§10). Both expression- and block-bodied methods are supported
(Outcome A2, not the narrower A1-expression-only): a method's own body reuses the identical
statement/expression-emission machinery (`emitStatements`) a getter's own block body already exercised in
ADR-0038, so restricting to expression bodies only would have withheld a capability already proven safe
elsewhere, for no additional evidence gained.

## 10. Member-body dependency rules — no cross-member matrix, extended unchanged

A method's own body is supported only insofar as it reads fields, its own parameters, and locals — a call
to another getter or method inside a method's own body is not specially recognized. This is not a new
scope decision: it is ADR-0038 §13's own "no cross-member matrix" boundary, extended to methods without
being reconsidered. Concretely, an internal call (`node.target == null || node.target is ThisExpression` at
extraction, meaning a bare or explicit-`this` receiver) is never passed to `_externalMethodTarget` at all —
only a genuinely external receiver expression is. Method-to-method and method-to-getter calls, and the
reachability/cycle-safety analysis they would need, remain out of this milestone's own scope; a body
containing one falls through to the ordinary, pre-existing refusal for an unresolved instance-member
reference.

## 11. M9-R closure fix — reconfirmed for the narrower ADR-0039 gate, not just inherited

The M9-R closure fix (`docs/m9/m9r-final-closure.md` §22) — `isKnownProjectClassReceiver`, ORed into the
M9-J refusal's receiver-shape check — governs precisely the case this ADR's own gate declines: a method
call whose `target` is `undefined` because `_externalMethodTarget` rejected it (an optional parameter, a
private method, an inherited one, and so on). Reconfirmed directly, in a real fixture
(`fixtures/apps/method_call_refusal`, kept from M9-R and updated so its own method now fails on an optional
parameter specifically): the call still refuses as `BRG3013`, naming the method and its owning class, with
zero files emitted — never the silent `{ count: 7 }.multiply(3, 2)` this fix exists to prevent.

## 12. Schema — no change

`ClassDecl.methods` already carried every fact this ADR needs on the identical `FunctionDecl` shape a
top-level function and a getter already share: `name`, `params`, `body`, `returnType`, `isAsync`,
`isStatic`, `isGetter`. No new UIR field, no new node kind, and no schema regeneration were needed —
eligibility is computed entirely at the read/call site (`_externalMethodTarget`'s own gate), the identical
"no eligibility flag, gate the target-attachment instead" pattern ADR-0038 already established for
getters.

## 13. Selected Outcome: A2 — bounded method execution, expression- and block-bodied

Both the ADR-0038 gap this ADR exists to close (method receiver-then-argument evaluation order, and
parameter/field shadowing) are proven directly, in real fixtures, with a real analyzer and a real `tsc
--strict` build. Outcome A2 (not the narrower A1) is selected because block-bodied methods introduced no
new architecture beyond what ADR-0038's own getter block-body support had already exercised.

## 14. Future migration

Nothing here forecloses a future method-to-method/method-to-getter reachability walk, optional/named
parameter support (would need the callee's own signature threaded to the call site, the identical gap
`refuseNamedArgs`'s own doc comment already names), generic methods, or operator lowering. This ADR's own
helper model, parameter threading, and shadowing mechanism are additive and were not designed around the
required-positional restriction specifically; a richer method subset would reuse every piece of this ADR
except the parameter-shape gate §3 names as the actual boundary.
