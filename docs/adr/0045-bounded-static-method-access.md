# ADR-0045 — Bounded Static Method Access on Project-Defined Classes

## 1. Semantic problem

Dart's static members (`Model.compute(3)`) are a plain, extremely common construct with no receiver at
all — the reference resolves through the TYPE namespace, not a value. FlutterBridge currently has no
extraction-side resolution for a project-defined class's own static member: a static-qualified reference
(`Model.compute`) is recognized structurally (it is never mistaken for an instance property read — see
§3), but nothing downstream ever attaches a `target` to it, so it reaches the generator as an untargeted,
dotted-name `logic.Ref`/`logic.Call.callee` and refuses honestly via `BRG3006` ("not declared in this
program"). This ADR gives static METHOD CALLS a real, truthful lowering; static fields and static getters
remain explicitly out of scope (§20).

## 2. Current limitation — confirmed live, not assumed

A real probe (`Model.compute(3)`, `Model._hidden(3)`, `Model.staticFieldMarker`, `Model.composeWithInstance
(model)`, a cross-file `Other.compute(3)` sharing the name `compute` with `Model.compute` — all run through
the real analyzer → extraction → normalization → generation pipeline) confirms:

- Every static reference extracts as an UNTARGETED `logic.Ref` (a field/getter read) or `logic.Call` whose
  `callee` is an untargeted `logic.Ref` (a method call) — `name` carries the literal dotted source text
  (`"Model.compute"`), but no `target` field is ever present.
- `bridge validate` on this probe fails HONESTLY: `error [BRG3006] 'Model.compute' is not declared in this
  program, so there is nothing to emit for it` for every static reference, `BRG3005` backstop (zero files
  emitted). No silent-wrong-code risk exists today — the gap is a missing capability, not a live bug.
- `dart/bridge_analyzer/lib/src/session/extract/expression_extractor.dart`'s own `_topLevelTarget` doc
  comment states this explicitly: "A class's own static member is deliberately **not** handled here...
  Left refused, same as before" — a pre-existing, named, deliberate gap, not an oversight this ADR
  discovers.

## 3. Analyzer evidence — traced live, not inferred from syntax

- A static-qualified reference (`Model.compute`, `Model.staticFieldMarker`) reaches the extractor's AST
  as a `PrefixedIdentifier`/`PropertyAccess`/`MethodInvocation` whose PREFIX/TARGET is a type name, not a
  value expression — already recognized by the pre-existing `_isStaticQualifier(Expression node)` check
  (`node.element is InterfaceElement`, or an import prefix), routing it away from the ordinary
  `PropertyAccess`/`MethodInvocation` receiver-based extraction path entirely (confirmed: this routing
  predates this ADR and is unchanged by it).
- The resolved `Element` behind `Model.compute` is a `MethodElement` with `isStatic == true`,
  `enclosingElement` an `InterfaceElement` (`Model`) — traced directly via a live probe's raw UIR dump:
  `declaration_extractor.dart`'s own `_methods` ALREADY extracts a static method's full declaration
  (`isStatic: true`, real `body`/`params`/`returnType`) — structurally identical to an instance method's
  own `logic.FunctionDecl`, minus a receiver. Confirmed: `isStatic` is captured on every class method
  and field already (`declaration_extractor.dart:322,383`), used TODAY only as an EXCLUSION check at the
  generator layer (`expression.ts:456`, `functions.ts:574`) — never as a positive capability.
- `_fields`/`_methods` ALREADY assign an owner-qualified symbol to every member, static or not
  (`out.symbols.variable(name, owner: owner)` / `out.symbols.function(name, owner: owner)`) — the IDENTICAL
  scheme instance members use. `_instanceMemberTarget` (the existing reverse-lookup: resolved `Element` →
  symbol, used by `_externalFieldTarget`/`_externalGetterTarget`/`_externalMethodTarget`) reconstructs this
  exact symbol via `Symbols.functionIn(library, name, owner: ownerName, ...)` / `Symbols.variableIn(...)` —
  and does not itself inspect `isStatic` at all; every call site that reaches it explicitly EXCLUDES
  `element.isStatic` first. The reconstruction machinery this ADR needs already exists in full; only the
  static-inclusive entry point does not.
- A DIRECT self-recursive OR mutually-composed static call already resolves a `target` at the extraction
  layer once wired — confirmed by the identical `_instanceMemberTarget` code path already resolving
  `target` correctly for a self-recursive INSTANCE method in the same live probe (`countdown`'s own
  recursive call already carries `target` pointing at itself) — extraction-side target resolution has
  never depended on emission-side convergence.

## 4. UIR requirements

None beyond what exists. A static method call is `logic.Call { callee: logic.Ref { name, target, type },
args, type }` — every field already required by the existing schema. No new node kind, no new field.

## 5. Identity requirements

The symbol is owner-qualified (`Symbols.functionIn(library, name, owner: className, ...)`) — the SAME
scheme `_methods` already assigns when declaring the member, and the SAME scheme `_instanceMemberTarget`
already reconstructs for an instance member. Resolved by the analyzer's own `Element` identity (owner
class + declared name), never by matching source text — confirmed via the cross-file identity probe:
`Model.compute` and `Other.compute` (two different classes, same method name, same file's own import
scope) resolve to two distinct targets, never conflated.

## 6. Evaluation-order requirements

Trivial by construction: a static access has NO receiver expression to evaluate at all (§3) — there is
nothing to duplicate, reorder, or evaluate-once-vs-twice. Arguments to a static method call are extracted
by the ordinary, already-existing argument-evaluation path (ADR-0041), unchanged.

## 7. Reachability requirements

A static method call is `logic.Call { callee: logic.Ref { target } }` — NOT `logic.MethodCall`, and NOT a
top-level-indexed declaration (`scope.node()` only indexes top-level-emitted nodes; a static method's own
`logic.FunctionDecl` is embedded on `ClassDecl.methods`, exactly like an instance method's — confirmed by
reading `directFunctionRefs`/`scope.node()`'s own doc comment: "the program's own top-level index"). Neither
of the two existing reachability walks (`reachableFunctions`'s `directFunctionRefs`, which never checks
`logic.Call.callee`; `reachableMembers`'s `directMemberRefs`, which checks `logic.MethodCall`/bare
`logic.Ref` against `getterOwnerOf`/`methodOwnerOf` but never a `logic.Call.callee`) currently discovers
one. `methodOwnerOf`/`memberById` (`functions.ts`) are already built from EVERY class method regardless of
`isStatic` (confirmed by reading the population loop directly — no static filter exists there today), so
a static method is already present in these maps; only `directMemberRefs` needs a narrow extension: when a
`logic.Call`'s own `callee` is a `logic.Ref` with a `target` present in `methodOwnerOf`, add it to
`foundMethods` — reusing the identical fixed-point/`Set<NodeId>` machinery, self- and mutual-recursion-safe
for the same reason the existing walk already is (ADR-0040 §10).

## 8. Generator requirements

A dedicated emission sub-pass, structurally parallel to the existing instance-member-helper loop
(`functions.ts`, ADR-0038/0039/0040), but:

- No `self` parameter — a static method has no receiver to thread. The generated helper signature is
  `export function ${ClassName}_${methodName}(${params}): ${ReturnType}` — no synthesized receiver
  argument, mirroring a plain top-level function's own signature exactly (ADR-0029), scoped only by name.
- No dispatch-safety receiver check (`_dispatchSafeReceiverClass`) — there is no receiver type to be unsafe
  about.
- Call-site lowering: the existing `logic.Ref` case (`expression.ts`) gains one new branch, checked
  alongside the existing `projectClassGetterIds`/`getterHelpers` branch, resolving a new
  `projectClassStaticMethodIds`/`staticMethodHelpers` pair — returning the bare helper name (never
  appending a receiver argument the way the getter-helper branch appends `(self)`). `logic.Call`'s own
  lowering (unchanged) then appends `(${args})`, exactly as it already does for a plain top-level function
  call.

## 9. Runtime requirements

None. The lowered form is a plain, standalone, module-level exported function — no runtime class, no
prototype, no static-namespace object. `Model.compute` compiles to a plain function `Model_compute`, never
a real TypeScript `class Model { static compute() {} }` — consistent with every prior M10 milestone's own
"never a prototype method; there is no runtime `Model` class" discipline.

## 10. Cross-file requirements

A static method declared in one file and called from another resolves through the SAME cross-module
`module.use(...)` mechanism a top-level function or an instance-method helper already uses — confirmed via
a live cross-file probe (`Other.compute`, declared in `other.dart`, called from `main.dart`). No new
cross-file machinery.

## 11. Determinism requirements

Unaffected — the fixed-point reachability/emission walk is the identical, already-deterministic mechanism
every prior M10 milestone relies on (sorted `NodeId` sets, content-addressed ids). No new source of
nondeterminism is introduced.

## 12. Fixed-point behavior

A static method's own body may call ANOTHER static method (same or different class) or an instance member
on a parameter (§3's `composeWithInstance` probe, confirmed live) — both already participate in the SAME
member/function fixed-point retry loops this ADR extends, not a new one. A self- or mutually-recursive
static call is refused for free, by the identical non-convergence argument ADR-0040 §10 already
established — no special-case recursion handling is added or needed.

## 13. Supported subset

A call to a project-defined class's own static METHOD (`isStatic == true`, a `MethodElement`, public,
non-abstract, non-external, no `@override`, non-generic — the identical eligibility facts
`_externalMethodTarget` already checks for an instance method, applied here with no receiver-type gate
since there is no receiver) resolves a real `target` and lowers to a real, callable, module-level
TypeScript function. Composes with: M10-A/B instance-member execution (a static method's body may call an
instance member on one of its own parameters), M10-C argument evaluation, M10-D return-value chaining
(calling a static method whose return type is itself an eligible project class), M10-E optional-default
parameters, cross-file class declarations.

## 14. Refused subset

- A static FIELD or static GETTER reference (`Model.staticFieldMarker`, a hypothetical `static int get x`)
  — deliberately excluded (§20): a static field hits the SEPARATE, pre-existing, DOCUMENTED M8-P boundary
  ("this generator does not yet lower a `logic.FieldDecl` to a module-level TypeScript declaration") —
  confirmed live: wiring a static field's `target` alone would not fix its refusal, since the FieldDecl
  lowering itself, not merely its targeting, is the missing capability, and M8-P found no site that would
  benefit from building it. Extending THIS ADR to also solve FieldDecl lowering would materially enlarge
  its own scope into an unrelated primitive.
- A PRIVATE static method (`Model._hidden`) — refused, confirmed live (§17 negative control).
- A static method that is abstract, external, generic, marked `@override`, or otherwise fails the same
  eligibility facts an instance method already must pass — refused via the identical, unmodified
  `BRG3013` path.
- Every existing M9/M10 refusal boundary (unsupported constructors, inheritance, generics, async,
  setters/mutable state, named parameters, etc.) is completely unaffected.

## 15. Failure diagnostics

An ineligible static method reaches the pre-existing "target set but no helper" `BRG3013` refusal — the
identical mechanism ADR-0039 already established, no new diagnostic code. A static field/getter reference
continues to reach the pre-existing `BRG3006`/M8-P `UnsupportedCapability` refusal, completely unchanged —
this ADR touches no code path a static field/getter reference goes through.

## 16. Alternatives rejected

- **Also solving static field/const access in this same ADR.** Rejected: hits the separate, pre-existing,
  documented M8-P `FieldDecl`-lowering gap (§14) — a materially different primitive (declaration emission,
  not member targeting) that M8-P itself found no motivating site to build. Bundling it here would violate
  "implement only one bounded capability... do not implement the entire feature family."
- **Also solving static getters in this same ADR.** Rejected: while a static getter's LOWERING would reuse
  the same function-shaped machinery this ADR builds (no `FieldDecl` gap, since a getter compiles to a real
  function), it is a second, independently-understandable call-site SHAPE (a value read, never a call) this
  milestone did not need to touch to deliver real value — deferred as a natural, narrow follow-on.
- **Treating a static method exactly like a top-level function (reuse `reachableFunctions`/`functionModules`
  unchanged).** Rejected: `scope.node()` is the program's own TOP-LEVEL index; a static method's own
  `logic.FunctionDecl` is embedded on `ClassDecl.methods`, never top-level-emitted, so it is structurally
  invisible to that walk — confirmed directly by reading `directFunctionRefs`'s own doc comment. A
  dedicated (but structurally parallel) reachability/emission pass, mirroring the EXISTING instance-member
  one, is the only reuse-respecting/schema/faithful option.
- **A name-based static-member table (an enumerable list of "known" static members).** Rejected: this
  ADR must generalize to any project-defined class's own static method, not a small enumerable framework
  surface (the pattern `MISSING_CAPABILITIES` deliberately uses for the SDK) — resolved entirely through
  the resolved `Element`'s own `isStatic`/`enclosingElement`/`name`, never a string table.

## 17. Mutation-testing strategy

At minimum: remove the `isStatic` requirement from `_staticMemberTarget` (would incorrectly admit an
instance member reached via a static-looking qualifier — structurally impossible in valid Dart, but tested
as a defense-in-depth check); remove the private-member exclusion; replace the owner-qualified symbol
reconstruction with a name-only one (would collide `Model.compute`/`Other.compute`); bypass the
reachability extension (would leave a real static call refusing `BRG3013` despite eligibility); omit the
`self`-less signature branch (would silently thread `self` into a static helper's own signature, a real
`tsc` failure); swap which map (`getterOwnerOf` vs `methodOwnerOf`) the new `logic.Call.callee` reachability
check consults.

## 18. Explicit non-goals

Static fields/consts, static getters, static setters, non-static (instance) dispatch changes, generics,
async static methods (excluded via the same pre-existing `isAsync` gate, unchanged), inheritance-based
static resolution (Dart does not have virtual statics; not applicable), any Continuum reference. None of
these is implemented, and no existing refusal boundary for any of them is weakened.
