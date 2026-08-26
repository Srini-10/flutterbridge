# ADR-0035 — Bounded Project-Class Field Shape and Receiver-Based Reads

## 1. Project-class runtime boundary

Unchanged, restated: no Dart runtime class exists in generated output. `declaresClass` stays
`() => false`. `logic.New` on a project class stays refused. This ADR authorizes exactly one new
runtime operation — a receiver-based, read-only property lookup on an already-supported parameter — and
nothing else.

## 2. Structural incoming-instance contract

**Accepted, explicitly, as an interop boundary — not Dart/JS binary interoperability.** A `Model`-typed
parameter's runtime value, wherever it comes from (an external caller, a parent component forwarding a
value untouched), is a plain JavaScript object satisfying the emitted field shape structurally — the
identical contract M9-M already established for the *type* (§13 of the governing brief, ADR-0034 §13).
This ADR does not change what can *produce* such a value (§15); it only makes reading one of its
already-declared-shape properties truthful instead of refused.

## 3. Field eligibility

A field is read-eligible only when **all** of the following hold, checked via real analyzer semantic
APIs (`analyzer` 14.0.0), never by name text or AST syntax:

- resolved through a field-backed synthetic getter (`GetterElement.isOriginVariable`, never
  `isOriginDeclaration` — §16);
- `variable.isFinal` (real `VariableElement.isFinal`, not the field declaration's own AST modifier check
  — §4);
- `!variable.isStatic` (§20);
- `!variable.isLate` (§14);
- `!variable.isPrivate` (real `Element.isPrivate`, never a `_`-prefix text check — §19);
- the field's own owner (`variable.enclosingElement`) is identical to the receiver's own resolved class
  element (§7 — owner consistency, never property-name equality).

## 4. Final/read-only semantics

`final` is read as **compile-time, shape-level immutability only** — Dart's own guarantee that the field
is never reassigned after construction, not a claim that the referenced value is deep-frozen. The
generated TypeScript field is `readonly`, which is the identical compile-time-only guarantee: it prevents
`model.count = 3` from typechecking, and says nothing about whatever `count`'s own referenced value can or
cannot do. `Object.freeze` is not called anywhere; runtime mutation outside the emitted read path remains
outside this compiler's contract, exactly as it already is for every other generated interface.

## 5. Field-backed `GetterElement` canonicalization

Reused, unmodified: `isOriginVariable` (the field's own synthetic accessor) resolves through
`Symbols.variableIn` — the **identical** symbol scheme the field's own `FieldDecl` declaration already
carries (M9-K/ADR-0032). One field, one canonical declaration provenance, confirmed by construction, not
reproven: `count`, `this.count` (ADR-0033), and (new, this ADR) external `model.count` all resolve through
the same `Symbols.variableIn`/`variable` call, so they necessarily produce the identical target id when
they name the same declared field.

## 6. Member target provenance

**External field-read targeting reuses `_instanceMemberTarget` directly, unmodified** —
`dart/bridge_analyzer/lib/src/session/extract/expression_extractor.dart`'s own existing, already-proven
field-backed resolution (M9-L). This ADR adds a new, independent, strictly narrower **eligibility gate**
in front of it (`_externalFieldTarget`, §3 above) — never a second, competing symbol-computation path. No
new provenance mechanism exists; only a new caller of the existing one, restricted to a receiver that was
previously never allowed to reach it (a non-`this` receiver).

## 7. Owner consistency

Enforced explicitly, not assumed: `_externalFieldTarget` checks `variable.enclosingElement == ownerClass`
(the receiver's own resolved class element) before ever computing a target — never property-name equality.
Dart's own analyzer resolution makes this check structurally redundant in the common case (the resolved
`GetterElement`'s own owner *is* the receiver's class, by construction, for a direct, non-inherited access)
but it is asserted directly rather than trusted implicitly, matching the governing brief's own explicit
demand (§8) and this compiler's established "prove it, don't assume it" discipline.

## 8. Receiver-based runtime lookup

**No new emission code was written for the read itself.** `expression.ts`'s existing `logic.PropertyAccess`
fallthrough (`const receiver = emitExpression(...); return `${receiver}.${identifierOf(property)}`;`) already
produces exactly `props.model.count` for any `PropertyAccess` the M9-J refusal does not intercept — proven
by direct code reading before implementation began (this is the load-bearing discovery that made Outcome
A2 cheap: the read mechanism was already correct and generic; only the *refusal boundary* needed to move).
No helper function, no static dispatch, no declaration-body invocation — the target is consulted only for
the capability decision (§9), never for what to emit.

## 9. Provenance vs. dispatch

Identical contract to ADR-0033/ADR-0034: `PropertyAccess.target` (this ADR's own new use of it, for an
external receiver) states a resolved fact — "this identifier names field X of class Y" — never an
execution instruction. The class this compiler cannot yet represent polymorphically (§21, inheritance
stays excluded) never reaches this target-attachment path at all, because `_externalFieldTarget`'s own
superclass check (§3) refuses it before a target is ever computed — the dispatch hazard is bounded out
structurally, not merely disclaimed in prose.

## 10. Emitted type shape

**Outcome A2 — field shape plus bounded receiver-based reads.** `Model`'s generated interface gains one
`readonly` line per eligible field:

```ts
export interface Model {
  readonly count: number;
}
```

Ineligible fields (mutable, static, private, late, or explicit-getter-shaped) are simply **absent** from
the interface — never emitted with a wrong or approximate type, never emitted at all.

## 11. `readonly` semantics

See §4. Restated for the schema record: `readonly` is TypeScript's own compile-time assignment guard,
reused unmodified from the language — no custom enforcement was written, none was needed.

## 12. Field type grammar

Reused `typeTextOf` (M9-M) unmodified, called on `FieldDecl.type` exactly as it is already called on a
parameter's own `type`. Supported for this landing: `int`/`double`/`num`/`bool`/`String` (via
`PRIMITIVES`), their nullable forms, `Duration` (the existing SDK kit-type path), and a project-class field
type that is *itself* M9-M-emittable (reusing `classOf`, §13). **Not** attempted: `List<T>`/`Map<K,V>` (no
existing lowering for either — `typeTextOf` has no collection-type branch at all, so these already,
correctly, fall back to `unknown`, unchanged) and `dynamic`/`Object` fields (representable, but excluded
from the field-eligibility gate is not required — `typeTextOf` already maps both to `unknown`
truthfully, and a field of either type is still shape-eligible if `final`/public/non-static; no schema
change or parser was written for either).

## 13. Type reachability

Reused, extended by one level: `reachableClassTypes` (M9-M) already produces the set of emittable classes;
this ADR adds one further pass — for each class actually gaining a field-shape body, that field's own
`type.target` (if any) is added to the same `Set<NodeId>`, before the interface-body lines are written, so
a project-class-typed field (`final Address address;`) makes `Address` type-reachable through its own,
now-standard M9-M path. This is a **type** edge, structurally identical in kind to every other type edge
this walk already follows — it does not, and structurally cannot, mark `Address`'s own fields, methods, or
constructor as value-reachable (ADR-0034 §16's own invariant, unchanged).

## 14. Field initializer non-execution

Never read, never emitted. `FieldDecl.initializer` (when present) is not consulted anywhere in this ADR's
own code path — the interface-body emission reads only `field['name']`/`field['type']`/`field['isFinal']`/
`field['isStatic']`, never `field['initializer']`. A field initialized by a side-effecting call
(`final int count = expensiveFunction();`) still gains a `readonly count: number;` shape line — and the
call itself never appears in any generated output, confirmed directly (§ tests).

## 15. Constructor exclusion

Unchanged from M9-M. A class's own field-formal constructor (`Model(this.count);`) is never parsed or
consulted for field-shape purposes — `FieldDecl` (the declaration itself) remains the sole, authoritative
source of field shape, exactly as the governing brief requires (§12). `logic.New` on `Model` remains
refused, reconfirmed live.

## 16. Explicit getter exclusion

The single most load-bearing negative control in this ADR. `isOriginDeclaration` (an explicit
`int get doubled => ...`) is categorically excluded from `_externalFieldTarget` (§3's very first
condition) — never eligible, never emitted into the interface, regardless of how simple or field-like its
body looks. TypeScript's own ability to express a getter as an ordinary interface property is deliberately
not exploited here: doing so would erase the real semantic distinction (an explicit getter can compute,
throw, or eventually dispatch virtually; a field cannot) this whole session's own architecture has
protected since M9-I.

## 17. Method exclusion

Unaffected — this ADR touches only the `logic.PropertyAccess` extraction/refusal path.
`logic.MethodCall`'s own M9-J refusal (`isUnmodelledMemberReceiver` at its own call site) is untouched;
`model.compute()` remains BRG3013, reconfirmed live.

## 18. Mutable field exclusion

`variable.isFinal` is checked directly (§3) — a mutable field (`int count;`, no `final`) never gets a
target, never gains an interface line, stays BRG3013. Read-only access to a field this compiler cannot
prove is never reassigned elsewhere would be a real, if narrow, semantic risk (the generated read could
observe a value Dart's own aliasing/mutation model says should have changed) — this ADR does not need to
resolve that risk, because it excludes the case entirely rather than reasoning about its safety.

## 19. Private field boundary

Checked twice, independently, both via real analyzer semantic APIs (never text): the field's own
`variable.isPrivate`, and the owning class's own `ownerClass.isPrivate` (a private field on an otherwise
public class, and any field on a private class, are both excluded). Dart's own privacy is library-scoped;
this compiler does not attempt to model library-scoped visibility for a generated public interface — the
simplest, most honest rule (public-only) is adopted, matching M9-M's own private-*class* precedent.

## 20. Static field boundary

`!variable.isStatic` (§3). `Model.count`-shaped static access is untouched by this ADR — it was never
routed through `_externalFieldTarget` in the first place, since a static member read reaches a
structurally different AST shape (`PrefixedIdentifier`/a type-qualified `PropertyAccess`, already handled
by the pre-existing `_isStaticQualifier`/`_topLevelTarget` path, never this one).

## 21. Inheritance boundary

Excluded, checked explicitly by `_externalFieldTarget` (§3, via `ownerClass.supertype`) — **independently**
of M9-M's own, deliberately looser `_classTypeTarget` (which still attaches a class-level `target` to an
inherited class's own `TypeRef`, by design, ADR-0034 §11). This ADR's own field-target gate cannot rely on
that class-level check, because a field-level `target` sits on a *different* AND-gate in M9-J's refusal
condition (`node['target'] === undefined`) that **bypasses** `isUnmodelledMemberReceiver` entirely when
present — so an inherited receiver must be independently, exhaustively excluded here, not inferred from
the class-level target's own (intentionally permissive) behavior. This duplication (superclass check
appears in two places, with two different consequences) is deliberate and documented, not an oversight.

## 22. Generic boundary

Excluded via the receiver's own `InterfaceType.typeArguments.isNotEmpty` check (§3), mirroring
`_classTypeTarget`'s identical, already-proven generic exclusion (ADR-0034 §12) — reused in spirit, not in
code (this ADR's own check is independent, per §21's own reasoning).

## 23. Direct-receiver boundary

The initial, and only, supported receiver shape: a bare, untargeted `logic.Ref` resolving through
`scope.paramInScope` — the identical `isParameterReceiver` shape M9-J already restricts refusal to. A
local alias (`final alias = model; alias.count`) is **not** supported by this ADR — its own receiver `Ref`
would carry a `target` (ADR-28's own local-variable identity), failing `isParameterReceiver`'s own
`receiver['target'] === undefined` check, so it falls through to the *existing*, unchanged M9-J refusal
path (`isUnmodelledMemberReceiver` still returns true off the class-level target) — refused, not silently
absorbed, and not a regression this ADR introduces (the identical local-variable-receiver gap M9-J's own
milestone doc already named as a known, separate limitation).

## 24. M9-J refusal migration

`expression.ts`'s three-conjunct condition (`node['target'] === undefined && isParameterReceiver(...) &&
isUnmodelledMemberReceiver(...)`) is **unchanged in its own shape**. What changes is upstream: a
`model.count`-shaped `PropertyAccess` node, for the first time, can carry a `target` (§6), which makes the
first conjunct false, and the whole condition false, letting the read fall through to the existing generic
`receiver.property` lowering (§8) — precisely the mechanism M9-J's own refusal was already built to defer
to (a resolved `target`, e.g. a store member, was always exempted; this ADR adds a second, field-shaped
kind of resolved target to that same exemption, at the extraction layer, not by loosening the refusal
check itself). `model.doubled`/`model.compute()`/`model.mutableField`/`model.privateField` all continue
reaching the unchanged refusal, because none of them are ever given a target by `_externalFieldTarget`'s
own exhaustive gate.

## 25. M9-L target interaction

Unaffected in mechanism, extended in reach: `_instanceMemberTarget` itself is not modified — only a new
caller (`_externalFieldTarget`, gated far more strictly) is added. Internal reads (`count`, `this.count`)
and this ADR's own external read (`model.count`) now provably converge on the identical target id for the
same declared field (§5, §26).

## 26. M9-M type-only import interaction

Unaffected: a field-shape line's own type (when it references another project class) reuses M9-M's
existing `classOf`/`ModuleBuilder.use(..., {typeOnly: true})` machinery unmodified — no new import
mechanism, no runtime import introduced for a type-only field-type dependency.

## 27. Diagnostics

No new diagnostic code. `BRG3013` (`UnsupportedCapability`) remains the refusal for every excluded shape
(explicit getter, method, mutable/private/static field, inherited/generic class) — unchanged in wording
and ownership from M9-J.

## 28. Future constructor/getter/method migration

This ADR's own field-eligibility gate (`_externalFieldTarget`) and its own type-reachability extension
(§13) are the two pieces a future milestone implementing bounded getter execution or constructor support
would need identically — reusable, not thrown away. That future work must independently define and prove
its own execution-safety contract (memoization semantics for a getter, dispatch-safety for an override,
initialization-ordering for a constructor) before building on top of this ADR's own read-only, side-effect-free
guarantee; nothing here grants that proof in advance.

## 29. Determinism

Reused, unmodified mechanisms throughout (`Symbols.variableIn`, `nodeIdOfSymbol`, `ModuleBuilder.use`'s
own deterministic aliasing) — no new non-deterministic input introduced. Reconfirmed live via
`just determinism`, not assumed from the mechanism's own prior track record alone.
