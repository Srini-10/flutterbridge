# ADR-0036 — Bounded Structural Project-Class Construction

## 1. Why object-literal construction is semantically valid for the selected subset

The selected subset (§9/§10) restricts to a class that is, in every observable respect this compiler
already models, an immutable record: every instance field is public, `final`, non-`late`, non-`static`,
uninitialized at declaration, and initialized by exactly one required-positional field-formal parameter
of a single, empty-bodied, non-`const`/non-`factory`/non-redirecting unnamed constructor. For exactly this
shape, Dart's own construction semantics reduce to "evaluate each argument, left to right, and bind each
resulting value to its own named field" — no side effect, no super-chain, no computed initializer, no
canonicalization. A plain object literal built from the identical arguments, in the identical order,
performs the identical operation. Nothing in this ADR claims that Dart construction *in general* is
object-literal-equivalent — only that this one, exhaustively bounded shape is.

## 2. Structural instance contract

Reused, unmodified, from ADR-0034/ADR-0035: a `Model`-typed value is a plain JS object satisfying the
generated field shape — the identical contract whether the value arrives as an external prop or is built
by this ADR's own lowering. This ADR does not introduce a second, competing representation (§8 of the
governing brief's own explicit demand): a constructed `Model` and a received `Model` are, by construction,
indistinguishable JS objects with the identical shape.

## 3. Relationship to M9-M type-only emission

Unaffected. `declaresClass` stays `() => false` — this ADR does not flip it, and does not need to:
`declaresClass` answers "can a runtime class be constructed," a question this ADR's own object-literal
lowering never asks. `Model`'s own generated interface (ADR-0034/ADR-0035) is reused as-is; construction
adds no new type declaration.

## 4. Relationship to M9-N readonly field shape

Direct dependency, enforced structurally, not merely by convention: the eligible-class gate (§9) requires
**every** instance field to be individually M9-N-eligible (`final`, non-`late`, non-`static`, public) —
not merely the ones a given constructor happens to initialize. This is what makes the generated object
literal's own key set *exactly* equal to `Model`'s own generated `readonly` shape, with no field silently
excluded from either side.

## 5. Runtime class non-emission

No `class` keyword, no constructor function, no prototype — confirmed by construction: the lowering is a
single object-literal expression, structurally incapable of emitting a class declaration. Reconfirmed live
(build-proof test, §implementation).

## 6. Constructor identity/provenance

**No new declaration-tier identity was introduced.** Per the governing brief's own §23 Option A: extraction
validates the invoked constructor immediately, from the resolved `ConstructorElement`/`ConstructorDeclaration`
AST, and stores only the *result* of that validation — an ordered field-formal-to-`FieldDecl` mapping. No
`ConstructorDecl` schema node, no constructor symbol scheme, no `ClassDecl.constructors` array. A future
milestone needing constructor identity for its own reasons is not foreclosed by this choice (a
`ConstructorDecl` node could still be added later); this ADR simply found no evidence that the one bounded
shape it supports needs one.

**Where the result is stored moved once, mid-design, on evidence.** The first draft of this ADR planned to
compute this mapping at the *construction site* and store it on `logic.New` itself (`fieldTargets`, §7 as
originally written). That required resolving the invoked constructor's own `ConstructorDeclaration` AST from
`InstanceCreationExpression.constructorName.element` — which, for a cross-file construction, names a
`ConstructorElement` with no same-file AST in hand. No Element→AST reverse-navigation API exists in this
analyzer version for that need (`getElementDeclaration`-style lookups were searched for and not found), and
`extractor.dart`'s own "one walk" invariant — each compilation unit is visited once, nothing walks the tree
twice — rules out a two-pass, cross-file pre-scan to work around it. The eligibility computation was moved
instead into `_class` (`declaration_extractor.dart`), which already has full same-file AST access to the
class's own `ClassDeclaration.body.members`, including its constructor. The *result* is stored on
`logic.ClassDecl` itself (§7); the generator — which already has whole-program `scope.node()` access, the
identical shape M9-M's own type-reachability resolution already relies on — resolves it at generation time.
This is the one substantive correction this document makes to its own original draft; nothing else in this
ADR's reasoning depended on where the result was stored.

## 7. Field-formal mapping

`logic.ClassDecl` gains one new, optional field: `constructibleFieldOrder: NodeId[]` — an ordered list, one
entry per this class's own unnamed constructor's required-positional field-formal parameters, in **that
constructor's own parameter order**, each entry the exact `FieldDecl` id (M9-K/ADR-0032's own
owner-qualified identity, unchanged) that parameter initializes. Present only when the whole class satisfies
§9/§10's own eligibility (computed once, at class-declaration extraction time — never re-derived at each
construction site). Derived exclusively from `FieldFormalParameterElement.field` (the analyzer's own
resolved link from a field-formal parameter back to its field) — never from parameter-name or field-name
text equality, satisfying the governing brief's own repeated, explicit demand (§6/§24). A `logic.New`
construction is resolved against it at generation time via the class's own `type.target` — already,
unconditionally, attached to every expression's resolved type since ADR-0034 — so `logic.New` itself needed
no new field at all.

## 8. Constructor eligibility

Exactly one unnamed generative constructor, resolved via `InstanceCreationExpression.constructorName.element`
(never by name text): `!isFactory`, `!isConst`, `redirectedConstructor == null`, `name == 'new'`
(Dart's own internal name for the unnamed constructor), declaration body `is EmptyFunctionBody` (real AST
type check, never source-string trimming), `initializers.isEmpty` (rejects any assignment-list entry,
`assert(...)`, or super-constructor call), every parameter a required-positional `FieldFormalParameterElement`
(no optional-positional, no named, no default value, no plain non-field-formal parameter, no
super-parameter).

## 9. Class eligibility

A project-local, public, concrete, non-generic class with no explicit superclass (`Object` only) and not
a component/`State`/store base — checked **independently** of `_classTypeTarget`'s own (ADR-0034)
deliberately more permissive class-level target attachment, for the identical reason ADR-0035 §7/§21
already established: this ADR's own eligibility signal (`constructibleFieldOrder`'s presence) sits on the
*first*, independent conjunct of the generator's refusal condition and would bypass it outright if wrongly
computed, so it cannot be inferred from a check built for a different, safer consequence.

## 10. Field eligibility

Every instance field on the class — not merely the ones a specific constructor touches — must satisfy
M9-N's own field-eligibility gate (`final`, non-`static`, non-`late`, public) **and** carry no
declaration-level initializer at all. The declaration-initializer exclusion is new to this ADR, adopted as
the simplest defensible rule (governing brief §12): a field with `final int extra = 1;` and no
field-formal never has its initializer evaluated by this compiler anywhere, so allowing it to silently
participate (uninitialized by the object literal, defaulting to whatever a consuming reader assumes) would
misrepresent the class; excluding the whole class from construction when this occurs is simplest and
safest.

## 11. Argument evaluation order

Preserved exactly, by construction, not by a reordering step: `constructibleFieldOrder[i]` always
corresponds to `args[i]` (the construction's own positional argument at the same index — the class's own
constructor already fixes this correspondence at extraction time), and the object literal is emitted by
iterating that pairing directly, in index order — never by iterating the class's own field-declaration
order. Proven with a dedicated test where field-declaration order and constructor-parameter order
deliberately differ (`Model(this.second, this.first)`), asserting the emitted object literal's own property
order (and therefore its evaluation order) matches the **invocation's** own argument order, not the field's
own declaration order.

## 12. Property ordering

ECMAScript itself evaluates object-literal property values in the literal's own **written** order,
independent of property name — so emitting properties in `args`/`constructibleFieldOrder` index order is
both correct and sufficient; no additional ordering machinery (e.g. sorting field-target ids) was needed or
added.

## 13. Local result type provenance

**No new type-propagation code was needed.** `logic.New.type` was already populated via the same
unconditional `out.typeRef(node.staticType, ...)` call used everywhere else (confirmed by direct code
reading, not assumption) — meaning a bounded project-class construction's own result type already carried
a `target` before this ADR, exactly like every other expression's type. `logic.VarDecl.type` and a later
`logic.Ref`'s own `type` are, likewise, already independently computed the identical way at their own
sites. This ADR adds no analyzer-side type propagation at all.

## 14. Direct-local receiver boundary

**No new generator-side receiver recognition was needed — proven empirically, not assumed.** The original
draft of this ADR planned a new `isConstructedLocalReceiver` recognizer, on the theory that a field read on
a construction-holding local (`final model = Model(7, 'A'); model.count`) would need it to avoid the
pre-existing `BRG3013` refusal. A live probe, run *before* any construction-lowering code existed, falsified
that theory: `model.count`'s own `PropertyAccess.target` was already populated, unconditionally, by
`_externalFieldTarget` (ADR-0035/M9-N) — a mechanism keyed purely on the receiver's resolved static type and
field element, indifferent to whether the receiver expression is a parameter, a local, or (as this
generator's own component build-method desugaring turns out to do, see §31) an inlined expression. Since
`PropertyAccess.target`'s mere presence is the *first*, independent disjunct of M9-J's overall refusal
condition, it bypasses that condition regardless of receiver shape — a field read on a freshly constructed
value was already reachable before this ADR's own object-literal lowering was written. This ADR therefore
adds nothing at all to `expression.ts`'s receiver classification; `isParameterReceiver`/`isUnmodelledMemberReceiver`
are unchanged, confirmed by inspection.

## 15. Alias/value-flow boundary

**Unaffected, for the same reason §14 needed no new mechanism.** `final alias = model; alias.count` reaches
the identical `_externalFieldTarget` check the direct case does, and that check has never depended on
`alias`'s own initializer expression — only on the resolved type and field of whatever `alias.count`'s
receiver evaluates to. This ADR neither creates, worsens, nor closes the separate, already-documented
"local variable receiver hole" M9-J's own milestone named (the case where a receiver's resolved type itself
cannot be determined) — that gap is orthogonal to construction and untouched by this work.

## 16. Cross-file construction

Reuses M9-M's own type-reachability/import machinery unmodified: a cross-file `Model(7, 'A')` still
resolves `Model`'s own type-only import (when a type annotation is ever needed — see §17) through the
identical `classOf`/`ModuleBuilder.use(..., {typeOnly: true})` path already proven for parameters and
fields. No new cross-file mechanism was written.

## 17. Type-only import

**No import of `Model` is required in the constructing module at all**, confirmed by design: this
generator's own established convention never annotates a local's own declared type (`const model = ...`,
relying on `tsc`'s own inference from the initializer — confirmed by reading `statement.ts`, unchanged by
this ADR). An object literal's own inferred anonymous shape (`{count: number; name: string}`) is
structurally identical to `Model`'s own generated interface, so it satisfies `Model` wherever one is later
expected, by TypeScript's own structural typing — with no annotation, and therefore no import, needed for
this reason. If a future consumer *did* need an explicit annotation, the identical type-only import
mechanism (§16) would apply.

## 18. Constructor body exclusion

`body is EmptyFunctionBody`, checked via the real AST node type (never source-text trimming) — a
constructor with any executable statement is excluded from the eligible-constructor gate entirely,
falling through to the pre-existing `BRG3002` refusal, unchanged.

## 19. Initializer-list exclusion

`initializers.isEmpty`, checked directly on `ConstructorDeclaration.initializers` — rejects any assignment
entry (`: count = 1`), `assert(...)`, or `super(...)` call. A field-formal parameter (`this.count`) is
never itself an entry in `.initializers` (it lives on `.parameters`), so this check does not
accidentally reject the one shape this ADR supports.

## 20. Factory exclusion

`!ctor.isFactory`, checked directly — a factory constructor may return a cached instance, a subtype, or
execute arbitrary code; none of that is object-literal-equivalent. Falls through to `BRG3002`, unchanged.

## 21. Named/redirect exclusion

Only the unnamed constructor (`ctor.name == 'new'`) is eligible; a named constructor
(`Model.named(...)`) is never lowered by this ADR, regardless of its own shape — kept out of the first
subset deliberately, per the governing brief's own "narrowest proven subset" instruction, not because a
field-formal-only named constructor is inherently unsafe. `ctor.redirectedConstructor == null` excludes
redirecting constructors independently, for the reason §8 already states (they require a *different*
constructor's own semantics, unresolved by this ADR).

## 22. Const exclusion

`!ctor.isConst` on the constructor **and** `!node.isConst` on the invocation are both checked. Dart's
`const` construction may canonicalize (two `const Model(1, 'A')` expressions may be `identical`); a plain
repeated object literal never canonicalizes. Required negative control, tested directly.

## 23. Inheritance exclusion

A class with any explicit superclass (`ownerClass.supertype?.element.name != 'Object'`) is excluded from
the class-eligibility gate (§9) — identical reasoning to ADR-0035 §21: this ADR's own eligibility check is
independent of, and stricter than, `_classTypeTarget`'s own permissive class-level target attachment, for
the identical bypass-hazard reason.

## 24. Mutable/late/private/static exclusion

Enforced at the field level (§10): a class with **any** mutable, `late`, private, or `static` instance
field is excluded from construction entirely — not merely that one field silently omitted. This is
stricter than M9-N's own per-field read eligibility (which tolerates a class with *some* ineligible
fields, refusing only reads of those specific fields) precisely because construction needs a **complete**,
unambiguous object, and a partially-initialized object silently missing a field the type shape doesn't
expose would misrepresent the class rather than merely under-serve one read.

## 25. Getters/methods exclusion

**Not required to be absent.** An unrelated explicit getter or method on an otherwise-eligible class does
not disqualify construction — mirroring M9-N's own field-level (not whole-class) capability policy
(ADR-0035 §10), reused here for the identical reason: nothing this ADR emits ever claims to support
calling `doubled`, and any attempt to do so remains independently, unconditionally refused by the
unmodified M9-J/M9-N member-access boundary. A dedicated test constructs `Model(7)` for a class that also
declares `int get doubled => count * 2;`, confirming construction succeeds while `model.doubled` remains
`BRG3013`.

## 26. M9-J fallback

Unmodified in shape. The existing `!kitProvided && !scope.declaresClass(typeName)` refusal
(`BRG3002`) gains exactly one new, earlier-checked exemption: an unnamed, non-`const` construction whose
resolved class carries `constructibleFieldOrder` is lowered to an object literal *before* this refusal is
ever reached, mirroring the identical "target present → this generic refusal doesn't apply" pattern
ADR-0033/ADR-0035 already established for member reads. Every construction this ADR's own gate does not
prove safe still reaches the identical, unchanged refusal it always did.

## 27. M9-L provenance

Unaffected — this ADR's own `constructibleFieldOrder` reuses `FieldDecl` identity (M9-K) directly; it does
not read or modify `_instanceMemberTarget`/`_externalFieldTarget` at all. A field's own `target`, wherever
it appears (a member read, a field-formal mapping), continues to mean identity/provenance, never dispatch.

## 28. M9-N field capability

**Unmodified, not merely "extended."** §14 already establishes that no new receiver recognition was
needed: `isParameterReceiver`/`isUnmodelledMemberReceiver` and the field-target mechanism on
`PropertyAccess` (ADR-0035) do all of the capability-decision work this ADR relies on, exactly as they did
before it, for a receiver of any shape — parameter, local, or inlined expression alike.

## 29. Future migration to richer constructor/class semantics

This ADR's own field-formal-to-`FieldDecl` mapping (§7) is the one piece a future milestone supporting
named constructors, optional/default parameters, or nested project-class construction would need
identically — reusable, not thrown away. That future work must independently re-derive its own eligibility
gate for whatever it newly supports; nothing here grants a wider constructor shape safety in advance.

## 30. Determinism

No new non-deterministic input. `constructibleFieldOrder` is a pure function of the resolved
`FieldFormalParameterElement.field` chain (already-deterministic `FieldDecl` ids, M9-K), computed once at
class-declaration extraction time; the generated object-literal's own property order is a pure function of
`args`/`constructibleFieldOrder`'s own array order, itself a pure function of the source's own argument
list. Reconfirmed live via a dedicated same-source, two-run extraction test, and via `just determinism`.

## 31. A pre-existing, out-of-scope limitation this milestone surfaced but did not introduce

Inside a `StatelessWidget`'s `build()` method, a local variable's initializer (unlike a top-level
function's, which goes through `statement_extractor.dart`'s own `VarDecl`/`Scope` mechanism) is inlined at
each read site by this generator's own component build-method desugaring, rather than shared through one
`logic.VarDecl` and a `Ref`. Confirmed via a live probe: `final model = Model(7, 'A'); return
Column(children: [Text('${model.count}'), Text(model.name)]);` produced **two separate embeddings of the
identical `logic.New` node** (the same node id, independently duplicated), one under each `Text`'s own
receiver, rather than one shared reference. Consequently, this ADR's own object-literal lowering runs twice
for that one source construction — harmless when every argument is a pure literal (as it necessarily is in
this milestone's own real fixture, `fixtures/apps/structural_class_construction`, and as this ADR's own
"exactly-once evaluation" claim (§11) is scoped to mean: exactly one `emitExpression` call *per argument, per
lowering*, not exactly one lowering per source construction), but would re-run any side-effecting argument
expression were one ever admitted here. This is the identical shape of gap already accepted and documented
for the "local variable receiver hole" (§15) and the Duration-prop-type gap — a pre-existing limitation in
component build-method extraction, orthogonal to and not created by this ADR, left open rather than fixed,
per this repository's own established practice of naming a real gap honestly rather than expanding a
milestone's scope to absorb an unrelated fix.
