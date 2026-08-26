# M9-O — Bounded Structural Project-Class Construction

## 1. Baseline

Started clean at `58d9ed5` (`HEAD == origin/main`), the M9-N commit. Only the pre-existing,
already-known `fixtures/apps/hello_bridge/analysis_options.yaml` drift was present in the working tree;
left untouched throughout.

## 2. M9-K/M9-L/M9-M/M9-N prerequisites, reconfirmed

- M9-K: owner-qualified `FieldDecl`/method declaration identity — reused unmodified as the identity every
  new id in this milestone (`constructibleFieldOrder`'s own entries) points at.
- M9-L: instance member read provenance (`target` on a member read) — unmodified; this milestone adds no
  new member-read recognition.
- M9-M (ADR-0034): `TypeRef.target`, attached unconditionally to every expression's resolved type,
  including `logic.New.type` — this is the one existing mechanism that lets the generator resolve *which*
  class a construction names, with zero new schema on `logic.New` itself.
- M9-N (ADR-0035): bounded, per-field, `readonly` read eligibility — this milestone's own class-eligibility
  gate is strictly *stricter* than M9-N's (§10 below): every instance field, not just the ones a read
  happens to touch, must be individually M9-N-eligible.

## 3. Fresh reproduction of the refusal

`Model(7, 'A')` for `class Model { final int count; final String name; Model(this.count, this.name); }`
reproduced, before any change, as the pre-existing `BRG3002` ("this generator does not emit class
declarations") — the identical refusal path M9-J's own milestone established for any project-class
construction, unconditionally.

## 4. Constructor identity investigation

`InstanceCreationExpression.constructorName.element` resolves the invoked `ConstructorElement` — never
previously consulted by extraction. `ConstructorElement` exposes `isFactory`, `isConst`, `isGenerative`,
`redirectedConstructor`, `superConstructor`, `name` (`'new'` for the unnamed constructor). No dedicated
declaration-tier schema node for a constructor was found to be necessary (§9 below).

## 5. Field-formal parameter semantics

`FieldFormalParameterElement.field` is the analyzer's own resolved link from a field-formal parameter
(`this.count`) directly back to the exact `FieldElement` it initializes — proven, not assumed, by reading
the analyzer source and confirming via a live probe. This is the one API this whole milestone's safety rests
on: every field-formal-to-field mapping in `constructibleFieldOrder` (§9) is derived from it, never from
parameter-name or field-name text equality.

## 6. The architectural pivot — no Element→AST reverse-navigation exists

The first design computed the field-formal mapping at the *construction site*, requiring the extractor to
resolve the constructor's own `ConstructorDeclaration` AST — possibly in a different file than the one being
visited — from the resolved `ConstructorElement`. No API for this exists in analyzer 14.0.0
(`getElementDeclaration`-style lookups were searched for and not found), and `extractor.dart`'s own "one
walk" invariant — each unit visited once, nothing walks the tree twice — rules out a two-pass cross-file
pre-scan to work around it. The eligibility computation was moved instead into `_class`
(`declaration_extractor.dart`), which already has full same-file AST access to the class's own constructor,
and the *result* — an ordered field-id list — is stored on `logic.ClassDecl` itself
(`constructibleFieldOrder`). The generator, with its own whole-program `scope.node()` view (the identical
shape M9-M's type-reachability resolution already relies on), resolves it at generation time. See ADR-0036
§6 for the full narration, including the abandoned `logic.New.fieldTargets` design this superseded.

## 7. Object-literal vs. alternative candidates

- **Runtime class**: rejected — introduces a constructor function/prototype this compiler has never emitted
  and was explicitly out of scope.
- **Factory helper function**: rejected — adds an indirection with no semantic benefit over an inline
  literal for a shape this bounded, and a second thing to name/import.
- **IIFE**: rejected — no statement sequencing is ever needed for this subset (empty body, no
  initializers), so there is nothing an IIFE would buy.
- **Plain object literal (selected)**: the bounded subset's own semantics — evaluate each argument, bind
  each to its own field, no side effect, no super-chain — are exactly a plain object literal's semantics.
- **Keep refused**: rejected as the fallback only after the object-literal candidate was proven safe and
  bounded; this remains the outcome for every construction this milestone's own gate does not cover.

## 8. Exact first constructor subset — established by evidence

Exactly one unnamed, non-`const`, non-`factory`, non-redirecting generative constructor
(`ctor.name == 'new'`), `body is EmptyFunctionBody` (real AST type check), `initializers.isEmpty`, every
parameter a required-positional `FieldFormalParameterElement` (no optional-positional, no named, no
default, no plain non-field-formal parameter). Named constructors, factory constructors, and any
non-trivial body/initializer list all fall through to the pre-existing, unchanged `BRG3002` refusal.

## 9. Class eligibility

A project-local, public, concrete, non-generic class with no explicit superclass, no `implements`, no
`with`, and not abstract — checked **independently** of `_classTypeTarget`'s own (ADR-0034) deliberately
more permissive class-level target attachment, for the identical bypass-hazard reason ADR-0035 §7/§21
already established: this gate's own eligibility signal sits on the *first*, independent conjunct of the
generator's refusal condition and would bypass it outright if wrongly computed.

## 10. Field eligibility — the whole-set gate

**Every** instance field on the class — not merely the ones the constructor's own field-formals touch —
must be `final`, non-`static`, non-`late`, public. A field-formal-to-field bijection is then required: every
eligible instance field must be targeted by exactly one field-formal parameter, no gaps, no duplicates. This
single bijection check elegantly also excludes a field with a declaration-level initializer and no
field-formal (such a field would simply never appear in the field-formal target set) — without needing a
separate initializer-presence check. This is strictly *stricter* than M9-N's own per-field read policy
(which tolerates a class with some ineligible fields, refusing only reads of those), because construction
needs a complete, unambiguous object.

## 11. Argument evaluation order — the mandatory proof

Dart evaluates constructor arguments left to right; the emitted object literal's own property order must
follow **constructor-parameter/call-argument order**, never field-declaration order, when the two differ.
Proven directly: `class Model { final int first; final int second; Model(this.second, this.first); }`,
constructed as `Model(1, 2)`, emits `{ second: 1, first: 2 }` — never `{ first: 2, second: 1 }`, which is
what a naive field-declaration-order implementation would produce. ECMAScript's own written-order property
evaluation makes this free: iterating `constructibleFieldOrder[i]`/`args[i]` in lockstep is both correct and
sufficient.

## 12. Named arguments / default parameters — deferred

Every field-formal parameter must be required-positional; a named or optional/default-valued field-formal
disqualifies the whole class from construction (tested directly). Not investigated further — genuinely out
of scope for the narrowest proven subset.

## 13. Local-receiver-gap relevance — resolved without new code

A live probe, run *before* any construction-lowering code existed, showed `model.count`/`model.name`
already carried a real `PropertyAccess.target` — via the pre-existing, unconditional M9-N
`_externalFieldTarget` mechanism, indifferent to receiver shape (parameter, local, or inlined expression
alike). Since `target`'s mere presence is the first, independent disjunct of M9-J's refusal condition, field
reads on a constructed local were already reachable before this milestone touched anything. The
originally-planned `isConstructedLocalReceiver` generator-side recognizer (ADR-0036's first draft, §14) was
therefore never implemented — confirmed unnecessary by evidence, not by assumption. See ADR-0036 §14/§15/§28
for the full correction.

## 14. Construction result type — no new propagation

`logic.New.type` already carries `target` unconditionally (the same `out.typeRef(node.staticType, ...)`
call every expression gets, since M9-M). No new analyzer-side type-propagation code was needed for a
construction's own result type.

## 15. `logic.New` architecture audit

Evaluated four options for representing the eligibility fact: (A) extend `logic.New` directly; (B) a new
node kind; (C) normalize to an existing object-literal-shaped node; (D) keep raw provenance on `logic.New`,
let the generator decide. None of A–D were ultimately needed on `logic.New` at all — see §6: the fact lives
on `logic.ClassDecl`, and `logic.New` needed no schema change whatsoever, since its existing `type.target`
already sufficed to resolve the class.

## 16. Schema decision

One schema addition, on `logic.ClassDecl`: `constructibleFieldOrder: NodeId[]`, optional, present only when
the whole class satisfies §9/§10. `shared.json`'s `x-uir-version`: `1.9.0` → `1.10.0` (a `logic.New.fieldTargets`
field, added and later found unnecessary and removed, §17) → `1.11.0` (`ClassDecl.constructibleFieldOrder`
added) → `1.12.0` (`logic.New.fieldTargets` removed as dead schema surface once the final architecture was
confirmed). Final state: `1.12.0`, `logic.New` unchanged from M9-N, `ClassDecl.constructibleFieldOrder` the
only new field.

## 17. A design correction made honestly, not silently

The first implementation attempt added `logic.New.fieldTargets` (computed at the construction site) and
generated/codegen'd it at schema version `1.10.0`. Mid-implementation, the architectural pivot in §6 made
this field's *computation site* wrong (construction-site resolution cannot reach a cross-file constructor's
AST). Rather than retrofit the abandoned field, it was removed from `l1.json` entirely and regenerated —
confirmed absent from both `packages/uir/src/generated/uir.ts` and `dart/bridge_uir/lib/generated/uir.dart`
via `grep`, and confirmed the removal is the *only* diff `just codegen` produces (`git diff --numstat`: 7
insertions/4 deletions in `uir.ts`, 14 insertions/4 deletions in `uir.dart` — both purely mechanical,
matching the version bump and the field's removal, nothing else touched). ADR-0036 itself narrates this
correction directly (§6) rather than presenting the final design as though it were the only one considered.

## 18. Validator invariants

None added — `constructibleFieldOrder` is an ordinary optional array-of-`NodeId` field; the schema's own
existing `$ref` validation covers it. No new cross-field invariant was needed (the bijection/bounding
guarantees are enforced once, at extraction time, in Dart — the schema only carries the *result*).

## 19. Implementation gate — passed

All of §8/§9/§10/§11 confirmed via `dart analyze` (clean) and a dedicated Dart test group (27 tests,
§21 below) before any generator-side code was written.

## 20. Selected Outcome

**A2 — bounded structural construction.** Outcome A3 (bounded direct-local read) was investigated and found
unnecessary (§13): the read side already worked without new code. Outcome A1 (identity+mapping only, no
lowering) and Outcome B (architecture-only, no implementation) were both superseded by A2's own success.

## 21. Analyzer changes

`dart/bridge_analyzer/lib/src/session/extract/declaration_extractor.dart`:
- New import: `package:analyzer/dart/element/element.dart`.
- `_class` now computes `constructibleFieldOrder` (via a new `_constructibleFieldOrder` function) and emits
  it on `logic.ClassDecl` when non-null.
- `_constructibleFieldOrder`: implements §9/§10/§11's own eligibility ladder in full — class shape, the
  whole-instance-field-set gate, constructor-shape gate, field-formal bijection — returning `null` for any
  disqualifying condition, `const <RawValue>[]` for the implicit-default-constructor-on-empty-class case,
  or the ordered field-id list otherwise.

## 22. Compiler/N-pass changes

None. `constructibleFieldOrder` passes through N1–N11 unmodified, exactly as `TypeRef.target`/`isLate` did
for M9-M/M9-N.

## 23. Generator changes

`packages/generators/react/src/internal/emit/expression.ts`, inside `case 'logic.New':`: a new block,
checked before the named-args/kit-provided/`BRG3002` paths, and only for a non-`const`, unnamed
construction. Resolves the constructed class via `node.type.target`, looks up its `ClassDecl` via
`scope.node()`, reads `constructibleFieldOrder`, and — if present and length-matched to the construction's
own `args` — resolves each field's name by scanning the `ClassDecl`'s own embedded `fields` array (never via
`scope.node()`, since `FieldDecl` is embedded-only, the identical structural fact M9-M/M9-N already
established) and emits `{ field: value, ... }` in `constructibleFieldOrder`/`args`' shared index order.
Falls through to the pre-existing refusal path, unchanged, for every other shape.

## 24. Runtime changes

None. The emitted value is a plain JS object; `@bridge/runtime-react` needed no new export.

## 25. Adversarial mutations

Dart-side, mutate → run targeted test → confirm failure → revert → confirm `git diff --stat` matches the
pre-mutation baseline exactly:

1. **The landmine — drop `body is! EmptyFunctionBody`.** Caught: the "non-empty constructor body
   disqualifies" test failed (wrongly returned a field order for a side-effecting constructor).
2. **Drop the bijection check (`targeted.length != instanceFields.length`) alone.** **Not caught** on first
   attempt — a genuine coverage gap, since no test exercised "an eligible field with no field-formal of its
   own" (the shape the bijection check exists to reject). A new test was added — a field with a
   declaration-level initializer, uncovered by any field-formal — and the mutation was re-run and
   confirmed caught. This is the one adversarial mutation in this milestone that found and fixed a real
   test-coverage gap rather than confirming existing coverage.
3. **Drop the instance-field `final`/`late`/`private` property checks alone.** **Not caught** — redundantly
   protected by the field-formal loop's own, independent `isFinal`/`isStatic`/`isLate`/`isPrivate` check on
   each targeted field (the identical "defense in depth" shape M9-N found for its own field checks).
4. **Drop both the instance-field property checks and the field-formal-side check together (the true
   landmine).** Caught for the mutable- and private-field tests. The late-field test was *not* caught on
   the first pass, because its own source used a non-field-formal constructor body assignment
   (`Model(int value) { count = value; }`), which is independently disqualified by the (unmutated)
   empty-body/field-formal-shape checks regardless of `isLate` — a test-quality gap, not an eligibility
   gap. Rewritten to use `Model(this.count);` against a `late final` field, directly exercising the
   field-formal-side `isLate` check; re-run and confirmed caught.
5. **TS-side — drop the `node['isConst'] !== true` guard.** Caught: the const-construction negative
   control wrongly succeeded (returned an object literal for a `const Model(...)` invocation).
6. **TS-side — drop the `constructorName` guard.** Caught: the named-constructor negative control wrongly
   succeeded (treated `Model.origin(...)` as if it were the unnamed constructor).

Every mutation was reverted; `git diff --stat` after each revert matched the pre-mutation baseline exactly
(89 insertions for `declaration_extractor.dart`, 43 for `expression.ts`, both confirmed twice).

## 26. Reduction-ladder classification

Landed at roughly rung **O33** in the governing brief's own 60-item ladder: bounded structural construction
with argument-order proof and field-formal bijection, without named constructors, without const
canonicalization, without inheritance, without a direct-local-receiver extension (found unnecessary), and
without any new `logic.New` schema.

## 27. Real fixture

`fixtures/apps/structural_class_construction/` — `lib/model.dart` (`class Model { final int count; final
String name; Model(this.name, this.count); }` — constructor parameter order deliberately reversed from
field-declaration order) and `lib/main.dart` (`Model('A', 7)`, read twice via `model.count`/`model.name`, on
a bare, unrouted `Home` component — the same "bare component, real analyzer, never wired into the route
table" convention `class_type_emission`/`immutable_field_reads` both already use). `.dart_tool/`,
`pubspec.lock` scaffolded from `immutable_field_reads`' own layout, package name references corrected.
`fixtures/uir/structural_class_construction.ndjson` committed as the raw analyzer golden (manifest sidecar
deliberately not committed, matching every other fixture's own convention).

## 28. Real build proof

`packages/generators/react/tests/structural_class_construction_build.test.ts` (4 tests): generator reports
no error; `Model('A', 7)` lowers to `{ name: 'A', count: 7 }` (constructor order, not field-declaration
order) with no `new Model`/`class Model`/`any`; no runtime import of `Model` is emitted for the unannotated
local (ADR-0036 §17); real `tsc --strict` against the real, unmocked `@bridge/runtime-react`
(`typecheckEmitted`).

## 29. Unit-level construction coverage

`packages/generators/react/tests/structural_class_construction.test.ts` (8 tests, hand-authored UIR):
basic object-literal emission; constructor-order-vs-declaration-order preservation; each argument occupying
exactly one property (distinguishable-literal proof, isolating this milestone's own lowering from the
build-method-inlining limitation §31 of ADR-0036 necessarily also exercises); the empty-class/empty-object
case; const construction still refused; named-constructor construction still refused; a class with no
`constructibleFieldOrder` still refused; an argument-count mismatch falling back to refusal rather than
emitting a malformed literal.

## 30. Analyzer/UIR test group

`dart/bridge_analyzer/test/extraction_test.dart`, `'bounded structural project-class construction
(ADR-0036, M9-O)'` (27 tests): implicit default constructor; no-explicit-constructor-with-fields; single/
multiple field-formals; reordered field-formal vs. declaration order (asserting `constructibleFieldOrder`'s
own array content directly, both orders); unrelated getter/method (does not disqualify); mutable/private/
late/static field; const/factory/named-alone constructor; non-empty body; non-empty initializer list;
declaration-initializer-with-no-field-formal (added during mutation testing, §25); inherited/generic/
private class; optional-positional/named/plain-non-field-formal parameter; duplicate field-formal target
(itself invalid Dart, BRG1310); cross-class field-identity distinctness (ADR-0032 regression); BRG1310
precedence over M9-O eligibility; determinism (same source, two runs, identical `constructibleFieldOrder`).

## 31. Regression matrix

- M9-J (`BRG3002` for an unmodelled construction): unaffected — every construction this milestone's gate
  does not prove safe reaches the identical, unchanged refusal.
- M9-K (owner-qualified declaration identity): unaffected — `constructibleFieldOrder` reuses existing
  `FieldDecl` ids directly.
- M9-L (instance member read provenance): unaffected — no read-path code touched.
- M9-M (ADR-0034 type emission/reachability): unaffected — `declaresClass` unchanged, no new type
  declaration emitted for construction.
- M9-N (ADR-0035 field shape/reads): unaffected and directly reused — the whole-field-set gate (§10) calls
  the identical per-field eligibility facts M9-N established.
- The M9-J "local variable receiver hole": untouched, confirmed orthogonal (§13/ADR-0036 §15).

## 32. Validation

- `dart analyze` (`declaration_extractor.dart`, `test/extraction_test.dart`): clean.
- `dart test` (`dart/bridge_analyzer`, full suite): 479/479 passing (452 pre-M9-O + 27 new).
- `pnpm --filter @bridge/gen-react test` (full suite): 406/406 passing (394 pre-M9-O + 12 new).
- `just typecheck`: 19/19 tasks clean.
- `just lint`: dependency rules, stub-tag census, portability — all clean.
- `just codegen-check`: schema/generated-code parity confirmed clean after both the `constructibleFieldOrder`
  addition and the `fieldTargets` removal.
- `just build`, `just test` (full monorepo): all tasks green.
- `just ci` (the full local gate — build, typecheck, test, codegen-check, lint, lint-negative, uir-lint,
  uir-test, analyzer-lint, analyzer-test, dart-analyze): exit code 0, end to end.
- `just determinism`: run and confirmed clean.
- Real fixture build-proof: `bridge normalize` (N1–N11, unmodified) → generator → real `tsc --strict`
  against `@bridge/runtime-react`, passing.

## 33. Silent-wrong-code audit

- Argument-count mismatch between `constructibleFieldOrder` and `args` (should never occur from a correct
  extraction) falls through to the pre-existing refusal rather than emitting a partial/malformed object
  literal — tested directly (§29).
- A field id in `constructibleFieldOrder` that fails to resolve against the class's own embedded `fields`
  array (should never occur) likewise falls through to refusal, never a `undefined`-keyed property.
- Every disqualifying condition in `_constructibleFieldOrder` returns `null` (absent field), never a
  partial or best-effort array — construction is all-or-nothing per class.

## 34. FlutterBridge-only boundary

No reference to Continuum, or to any application beyond this repository's own fixtures, in any file touched
by this milestone (ADR-0036, the milestone doc, the Dart/TS implementation, the new fixture, or the new
tests) — confirmed by review of every new/changed file's own content.

## 35. `hello_bridge` drift

`fixtures/apps/hello_bridge/analysis_options.yaml`'s pre-existing, already-known drift remains untouched,
unstaged, and uncommitted throughout this milestone.

## 36. M9-P — explicitly not started

No file under this milestone's own scope anticipates or begins any future milestone's work (named
constructors, optional/default parameters, inheritance construction, or any other richer constructor
semantics). ADR-0036 §29 records what a future milestone could reuse (the field-formal-to-`FieldDecl`
mapping shape) without granting any of that wider scope safety in advance.

## 37. Recommended next milestone

A natural next step is named-constructor construction (`Model.named(...)`) reusing the identical bounded
eligibility ladder, since §21 (ADR-0036) deliberately excluded it only to keep this milestone's first
subset narrowest, not because a field-formal-only named constructor is inherently unsafe. Alternatively,
extending M9-N's read boundary to a *nested* constructed value (a field itself holding a project-class
type) would directly build on both M9-N and this milestone without requiring new constructor semantics.
