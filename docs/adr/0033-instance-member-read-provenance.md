# ADR-0033 — Instance Member-Read Provenance

## 1. Semantic meaning of member `target`

**Declaration provenance, never a dispatch instruction.** Audited directly, exhaustively, across every
existing producer and consumer of `target` on a `PropertyAccess`/`MethodCall`/`Ref`
(`_storeMemberTarget`, `_topLevelTarget`, `_enumConstantTarget`/`_enumValuesTarget`; the generator's own
`logic.PropertyAccess`/`logic.MethodCall` emission): in every case, `target` is consulted only to decide
*how to lower the property/method spelling* — never to skip evaluating the receiver expression. The
generator's own fallthrough for an untargeted `PropertyAccess`/`MethodCall` (`` `${receiver}.${property}` ``)
and its targeted one (e.g. a store's own `.get()`/hoisted-subscription lowering) both still emit the
receiver. `target` states a fact the analyzer already proved — "this identifier resolves to declaration
X" — and nothing downstream currently treats it, or is changed by this ADR to treat it, as "invoke X
directly, bypassing whatever the receiver's own runtime value is." This ADR's own new mechanism
(`_instanceMemberTarget`) adds no new consumer at all — no generator file changes — so this contract is
inherited unchanged, not redefined.

## 2. Provenance vs. dispatch — the decision

**Strategy A (provenance, allowed even for virtual accesses).** Proven safe by direct evidence, not
assumed: `Base.readImplicit`'s own `value` read resolves — both live, via a real probe — to `Base.value`'s
own declaration (`27ac198b2824cb93`), the analyzer's own static resolution, identical to what `dart analyze`
itself would report for the same identifier. A real Dart runtime probe (`dart run`) independently confirmed
`Child().readImplicit == 2` — Dart *does* dispatch this virtually at runtime, to `Child.value`, not
`Base.value`. These two facts do not contradict: the `target` states what the analyzer's own static
resolution found (`Base.value`), a fact that remains true regardless of the receiver's actual runtime type,
precisely because nothing reads this `target` as an execution instruction (§1). Strategy B (restricting
targeting to a provably non-overridable subset) was evaluated and rejected as unnecessary: it would solve a
problem provenance-only targeting does not have, at the cost of real complexity (a general
override/subtype-safety analysis this compiler does not have anywhere today) for no correctness benefit.

## 3. Representation of `this`

**Kept as the existing `_instanceRef(node, 'this')` shim (`logic.Ref{name:'this', type: <static type>}`),
unmodified.** No new UIR node was introduced (Option A rejected: a schema change is not needed to answer
"what does this read refer to" — the resolved *Element* already answers it, and `this`'s own receiver text
is never itself the provenance carrier). Option B (a synthetic declaration/binding for "the current
instance") was rejected: no such binding is created or needed, because provenance is derived directly from
`Element.enclosingElement`, never from resolving `this` itself to anything. Option D (a dedicated
`InstanceMemberRead` node distinct from `PropertyAccess`) was rejected: it would require a real schema
addition for a distinction (`implicitReceiver: true`) this ADR's own evidence shows is unnecessary — see §4.

## 4. Implicit vs. explicit canonicalization

**Not unified into one UIR shape — deliberately.** Implicit `count` remains a bare `logic.Ref`; explicit
`this.count` remains a `logic.PropertyAccess` with an explicit `this`-receiver. What *is* unified is the
**target they resolve to**: proven directly, live, that `implicitRead`'s `count` and `explicitRead`'s
`this.count` both carry the identical `target` (the field's own declaration id). "One truthful semantic
model" (the governing brief's own phrase) is satisfied at the level that matters — the declaration a read
provably refers to — not by forcing two structurally different Dart spellings into one artificial UIR shape,
which would have obscured rather than clarified the real distinction (an explicit `this.x` genuinely does
carry an explicit receiver expression in the source; an implicit read genuinely does not).

## 5. Field-backed accessor canonical identity

**The field's own declaration** (`logic.FieldDecl`'s own M9-K symbol), never a separate "getter" identity —
proven directly: `GetterElement.isOriginVariable` (the implicit accessor Dart synthesizes for a plain
field) resolves through `Symbols.variableIn`, the identical scheme (and, for a same-file member, the
identical *symbol string*) the field's own declaration already carries. No duplicate identity was created.

## 6. Explicit getter identity

An ordinary `Symbols.functionIn`-derived symbol (the M9-K `logic.FunctionDecl` scheme), keyed by
`GetterElement.isOriginDeclaration`. Proven: repeated reads of the same getter (`quadrupled`'s own two uses
across the ladder, and `quadrupledExplicit`'s independent, explicit read) resolve to the identical target;
`Alpha3.value`/`Beta3.value` (identical textual bodies, unrelated classes) resolve to distinct targets.

## 7. Lexical shadowing precedence

**Resolved entirely by the analyzer's own `Element` resolution — never reproduced, guessed, or
name-matched.** `_instanceMemberTarget` is keyed on `element.enclosingElement is InstanceElement`; a local
or parameter that shadows a field's own name resolves `node.element` to the *local's/parameter's own*
element (Dart's own name resolution, not this compiler's), which is never an `InstanceElement` member — so
`_instanceMemberTarget` correctly, structurally, never fires for a shadowed read, with no "if name matches a
field, assume `this.field`" logic anywhere. Proven live: `shadowed()`'s own local `count` targets its own
`VarDecl` (`22707a9866ae5371`), never the field (`5db6d3f3b1e04671`); `paramShadow(int count)`'s own
parameter read carries no target at all (parameter identity remains M8-N's own, separately-deferred gap —
not invented here); `shadowedExplicit`/`paramShadowExplicit`'s own **explicit** `this.count`, inside the
identical shadowed bodies, still correctly targets the field, proving shadowing is receiver-sensitive, not a
blanket per-body rule.

## 8. Dynamic-dispatch preservation

Nothing generates code from these targets (§9 — this ADR ships zero generator changes), so there is nothing
that could statically bind a virtual call. The risk the governing brief's own §13 describes — a future
mechanism naively treating `target` as "call this directly" — remains a real risk *for that future work*,
not for this one; §2's own decision (provenance, not dispatch) is the standing constraint any future
consumer of these targets must respect.

## 9. Inheritance boundary

Not bounded out, because it did not need to be: an inherited (not overridden) member's own `target` is
exactly as truthful, and exactly as inert (no generator consumes it), as a same-class member's. Proven
live: `Base2.readImplicit`'s own `value` targets `Base2.value`, never `Child2.value` — the analyzer's own
static answer, correctly never conflated with a runtime one.

## 10. Future generator contract

None written here — this ADR ships zero generator changes (§9 of the governing brief permits this
explicitly: "M9-L may legitimately make ZERO generator behavior changes"). A future milestone that wires
these targets into generated code must itself decide, and must itself prove, whether the specific consuming
mechanism it builds preserves virtual dispatch — this ADR's own contract (§1/§2) is necessary but not
sufficient for that; it establishes what the data *means*, not that every possible future use of it is safe.

## 11. M9-J refusal interaction

**Untouched, and — after a real regression this ADR's own development caught and fixed — provably
untouched.** `_instanceMemberTarget` is invoked from exactly two extraction sites (a bare `SimpleIdentifier`,
and a `PropertyAccess` whose receiver is structurally `ThisExpression`) — never for an arbitrary external
receiver (`model.count` from outside the class). A first implementation attempt, before this exclusion was
fully correct, gave a *component's own field* (which backs a constructor parameter, e.g. `W`'s own `base`)
a target via this same mechanism when `base` was read implicitly inside `W.build()` — which made
`isParameterReceiver` (M9-J) stop recognizing `base` as a bare, untargeted parameter, silently re-enabling
the exact `unknown`-receiver passthrough M9-J exists to refuse. Found via the project's own full Dart test
suite (66 failures, triaged to one root cause), not assumed safe. Fixed by explicitly excluding component
(`isComponentBase`), `State` (`isStateBase`), and store (`isStoreBase`) classes from
`_instanceMemberTarget` — three new/reused type-based adapter checks, added specifically so this exclusion
does not need an `AdapterContext`. Reconfirmed live, post-fix: the full Dart suite (420/420) and a dedicated
external-read fixture both pass; `model.count`-shaped external reads on every excluded class kind remain
correctly, unconditionally refused.

## 12. Class-emission prerequisite

Unaffected — no `logic.ClassDecl` reachability or emission code was touched (confirmed: `functions.ts`'s
`reachableFunctions` still cannot resolve a target pointing at an embedded class member, since such members
are never top-level document records — the identical structural fact M9-K's own research already
established). This ADR's own targets remain invisible to that walk, so class emission is not, and cannot be,
accidentally activated by this work.

## 13. Diagnostics

None added. A genuine symbol mismatch (same risk `Symbols.declare` already guards, per ADR-0032) would
surface as the pre-existing `BRG1202`; none was observed in any of this ADR's own probes or the full
regression suite.

## 14. Determinism

Confirmed directly: the same source, analyzed independently twice, produces byte-identical raw UIR
including every new `target` field — `IdAllocator`/`Symbols` are pure functions of `(path, owner, name)`,
unchanged in kind from every other symbol this compiler already mints deterministically.

## 15. Closure/N5 safety — investigated, no change needed

A real, structural risk was investigated directly rather than assumed away: N5 (lift-closures) treats any
targeted `Ref` as globally reachable and safe to lift *unconditionally*, with only `logic.VarDecl` carved
out (ADR-28's own local-variable exception). Had this ADR's own instance-member targets been reachable
inside a `bind.Expr(logic.Lambda)` — N5's own trigger shape — this would have been a real hazard: a closure
capturing `this.count`, lifted out from under its own receiver, with no receiver-threading mechanism to
carry `this` along. **Proven, live, that this is not reachable**: `bind.Expr` wrapping is applied
exclusively by `component_extractor.dart`'s own widget-tree/callback-prop extraction; a plain class's own
method body (`_methods`, where this ADR's targets are minted) never produces one — confirmed directly, a
getter returning a bare `logic.Lambda` (`int Function() get reader => () => count;`) extracts with the
lambda as a plain `Return.value`, never `bind.Expr`-wrapped. Since this ADR also excludes every class kind
that *does* build a widget tree (components, `State`, stores — §11), no instance-member target this ADR
produces can ever reach a position N5 processes. N5 itself was not modified.
