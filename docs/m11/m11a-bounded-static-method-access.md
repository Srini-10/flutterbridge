# M11-A — Architectural Frontier Investigation & Bounded Static Method Access

## 1. Baseline

Started from `4af0a08` (`origin/main` == `HEAD`), the M10-F safe-navigation commit. `git status --short`
showed only the pre-existing, deliberately-untouched `fixtures/apps/hello_bridge/analysis_options.yaml`
drift. M9 and M10-A through M10-F are all closed; M10-F itself explicitly concluded that no further bounded
capability could be added without a genuinely new architectural primitive. This is M11-A — the first
milestone to identify and validate which primitive to build first, not another M10-style gate extension.

## 2. Mission

Conduct a fresh architectural-frontier investigation across seven candidate primitives (synthesized
temporaries, mutable instance state, static member namespace, explicit dispatch, generic substitution,
async computation, recursive-declaration reservation), select the ONE candidate best supported by real
evidence, and — only if a bounded subset is genuinely defensible — implement it narrowly.

## 3. Capability inventory — already supported

Re-confirmed via direct source reading, unchanged by this milestone: bounded project-class type emission
(ADR-0034), immutable field reads (ADR-0035), bounded structural construction (ADR-0036/0037), bounded
getters/methods (ADR-0038/0039), member helper composition (ADR-0040), method argument evaluation
(ADR-0041), return-value chaining (ADR-0042), optional positional defaults (ADR-0043), bounded safe
navigation (ADR-0044), cross-file type reachability, deterministic/fixed-point helper generation.

## 4. Investigation — seven candidates, two independent evidence trails

A research agent read every M9/M10 doc and every ADR (0001-0044) for DOCUMENTARY evidence — explicit
"non-goal"/"structurally unreached"/"would need new machinery" statements, and any place a future
mechanism was already sketched. In parallel, direct source reading of the CURRENT extraction/generation
code traced CODE-level evidence — which schema fields, target-resolution patterns, and lowering nodes
already exist but sit unused. The two trails converged differently:

- **Documentary ranking** (most existing groundwork discussed): (1) **G — recursive-declaration
  reservation** — TWO independently-shipped ADRs (ADR-0029 §7, ADR-0040 §14) already sketch the exact fix
  ("recognize a strongly-connected component... admit every member of it as a unit," "pre-reserve a
  helper's own name before its body is confirmed to succeed"); (2) **A — synthesized temporaries** — named
  as an explicit, not-ruled-out follow-on in ADR-0044 §19/M10-F §21, with a concrete trigger case already
  fixture-tested; (3) **D — explicit dispatch** — the most cumulative safety scaffolding
  (`_dispatchSafeReceiverClass`, reused across four ADRs) but zero sketch of an actual dispatch mechanism.
- **Code-level ranking** (most existing machinery already reusable): (1) **C — static member namespace** —
  `isStatic` already captured on every `logic.FieldDecl`/`logic.FunctionDecl` (declaration_extractor.dart),
  used ONLY as an exclusion; `_topLevelTarget`'s own doc comment names the exact missing piece
  ("a static-member fix needs a declaration-side change too... left refused, same as before"); an
  established target-resolution PATTERN (`_instanceMemberTarget`, `Symbols.functionIn(..., owner: ...)`)
  needs only a static-inclusive entry point. (2) **F — async via explicit `await`** — `isAsync` already
  captured identically; `logic.Await` already unconditionally lowers to `await ${operand}`; async
  lambda/action bodies (event handlers, store actions) ALREADY emit real `async`/`await` correctly — the
  ENTIRE Promise/await lowering mechanism ships today, just never wired into the method-helper path.

Both rankings are real; they measure different things (how much is *written down* vs. how much is *already
executable*). Given the REQUIRED gate's own emphasis — "majority of required machinery already exists,
only small clearly-justified extension needed" — the code-level trail is the more direct evidence for
`STRONG PREFERENCE`, so candidates C and F were investigated deepest, with G as the third reduction-ladder
candidate for its own strong documentary backing.

## 5. Fresh analyzer evidence

A scratch probe (real Flutter fixture → real `bridge_analyzer` → real generator → `bridge validate`,
never hand-authored UIR) confirmed, for the CURRENT (`4af0a08`) codebase:

- **Static methods/fields** (`Model.compute`, `Model.staticFieldMarker`): `declaration_extractor.dart`'s
  `_fields`/`_methods` ALREADY extract a static member's full declaration (`isStatic: true`, real
  `body`/`params`/`returnType`, an owner-qualified symbol identical to an instance member's own). At a
  CALL/READ SITE, every static reference extracts as an UNTARGETED, dotted-name `logic.Ref`/
  `logic.Call.callee` — `bridge validate` refuses honestly (`BRG3006`, zero files emitted) for every one.
- **Async methods called via `await`** (`Future<int> scale(int x) async => ...`, awaited inside an async
  event handler): the extraction layer already resolves `target` for it (unaffected by `isAsync`); the
  GENERATOR'S method-helper loop unconditionally excludes any `isAsync === true` member.
- **Self-recursion** (`int countdown(int n) => n <= 0 ? count : countdown(n - 1)`): the extraction layer
  ALREADY resolves a real, self-referencing `target` (confirmed directly in the raw UIR dump — `countdown`'s
  own recursive call carries `target` pointing at itself); the refusal is PURELY a generator-side retry-loop
  artifact (a member can never be "first" if its only dependency is itself), not an extraction gap.

## 6. Reduction ladders — three strongest candidates

**C — static method access** (selected, §8): R0 baseline (an ordinary top-level function, already fully
supported) → R1 `Model.compute(3)`, no receiver, currently `BRG3006` → R2 multiple calls → R3 composition
(static-to-static, static-to-instance) → R4 cross-file → R6 identity (two classes, same method name) → R7
dangerous boundary (private static, static const field) — all traced live via the probe (§5) and, after
implementation, via the real fixture (§12).

**F — async via explicit `await`** (rejected for THIS milestone, §7): R0 async ALREADY fully working for
store actions/event handlers → R1 `await model.scale(3)` inside an async event handler, currently `BRG3013`
→ R4 an async method calling another async method (composition) → R7 an UN-awaited call must stay refused
(a real Dart program CAN write `'${model.scale(3)}'` without `await`, interpolating a `Future`'s own
`toString()` — semantically valid but never what a caller means; the extraction-side gate would need to
require the call sit as the direct operand of `AwaitExpression`, mirroring ADR-0044's own `isNullAware`
receiver-qualifies pattern). Reduction ladder built and reasoned through; not implemented this milestone
(§9).

**G — self-recursion via declaration reservation** (rejected for THIS milestone, §7): R0 an ordinary,
non-recursive member helper (fully supported) → R1 `countdown`'s own bare self-call, target ALREADY
resolves at extraction (§5), refused only by the generator's retry loop → R7 the dangerous boundary is the
COMMIT discipline itself: a tentatively-reserved helper name must never leak into `methodHelpers`/
`getterHelpers` if the body's own attempt ultimately fails for an unrelated reason, requiring a real change
to a currently write-once-on-success map. Reduction ladder built and reasoned through; not implemented
(§9).

## 7. Silent-wrong-code investigation

Actively searched, per the governing brief's own list — one real finding, fixed within scope (§10); no
others found for the SELECTED capability:

- **Static/instance confusion**: none — `_staticMemberTarget` is reached ONLY from the bare-`logic.Call`
  branch, after the bare-instance-method special case (`_externalMethodTarget`) has already had first
  chance; a genuine instance method is never admitted through the static path (confirmed adversarially,
  mutation 1, §11 — the one scenario where this actually matters, a bare call from a subclass to its own
  newly-declared, non-override method, is a real dynamic-dispatch-safety case, not a hypothetical).
- **Type/value namespace confusion**: none — a static reference is recognized structurally
  (`_isStaticQualifier`, pre-existing, unmodified), never re-derived from name text.
- **Generated `unknown` / return-type collapse**: a REAL bug, found and fixed (§10) — `_staticMemberTarget`'s
  first cut never checked return-type eligibility at all, reproducing the exact `unknown`-return shape
  ADR-0042 already closed once for instance methods. This was the milestone's own genuine "silent-wrong-code
  in the wild" moment — reproduced live via `bridge validate`, not merely reasoned about.
- **Reachability**: confirmed a real gap existed (a static call reaches `logic.Call`, not `logic.MethodCall`,
  and its `callee`'s `target` is never top-level-indexed) — fixed via a dedicated extension to
  `directMemberRefs` (§13), verified both by presence (the fixture's positive cases) and absence (mutations
  4/6, §11).
- **Cross-file / identity collision**: verified directly — `Model.compute`/`OtherModel.compute` (same name,
  different owner, different file) resolve to two distinct targets, never conflated (§12).
- **Bypassed refusal boundaries**: verified directly — private statics, static consts (the separate M8-P
  boundary), and ineligible-shape statics (dynamic return, named parameter) all still refuse honestly,
  unaffected by this milestone (§12/§14).

## 8. Selected primitive: C — bounded static method access

Selected against the REQUIRED/PREFERRED gate (full reasoning: ADR-0045): truthful UIR representation (zero
schema change — reuses `logic.Call`/`logic.Ref`/`logic.FunctionDecl` verbatim); no dynamic-dispatch risk (a
static reference has no receiver to be unsafe about); no invented runtime behavior (a plain, standalone
module-level function, no runtime class); a bounded eligibility predicate entirely on resolved analyzer
semantics (`MethodElement.isStatic`, `enclosingElement`, the shared `_isEligibleMethodShape`); honest
`BRG3013`/`BRG3006` refusal outside the subset; evaluation order trivially preserved (no receiver to
duplicate/reorder — arguments alone, already-proven machinery); testable end-to-end through the real
pipeline; no existing refusal boundary weakened; no `any`/`unknown` escape; no Continuum dependency; no
whole-program inference. STRONG PREFERENCE satisfied: reuses `_instanceMemberTarget`'s own symbol
reconstruction verbatim, reuses the pre-existing `isStatic` declaration-side capture verbatim, and mirrors
the already-shipped top-level-function emission shape (no `self` parameter) rather than inventing one.

## 9. Rejected primitives (this milestone)

- **F — async via explicit `await`**: NOT rejected on merit — the reduction ladder (§6) and evidence (§5)
  are both strong, arguably comparable to C's own. Deferred because it requires TWO coordinated changes (an
  extraction-side "await-required" context gate, mirroring ADR-0044's own pattern but genuinely new for
  this construct, PLUS a generator-side `Promise<T>`-wrapping return-type change) versus C's single-layer,
  smaller diff — and because implementing two primitives in one milestone would violate "implement only one
  bounded capability... keep the first M11 implementation independently understandable." A strong candidate
  for M11-B (§21).
- **G — self-recursion via declaration reservation**: NOT rejected on merit either — has the strongest
  DOCUMENTARY backing of all seven. Deferred because its own safety property (§6 R7) requires a genuine
  change to the write-once-on-success discipline `methodHelpers`/`getterHelpers` have had since ADR-0038,
  a materially riskier engineering change to get right in the SAME milestone as a first, unrelated
  primitive — better isolated in its own dedicated milestone with its own dedicated mutation-testing focus.
- **A — synthesized temporaries**: investigated at the documentary level (§4) but not built out into a full
  reduction ladder — every named trigger case (a safe-navigated call/construction receiver) is itself a
  DEFERRED, not urgent, capability; building temporaries FOR a deferred trigger is solving a problem no
  current fixture demonstrates real value from yet.
- **B — mutable instance state**: confirmed, via direct source reading, to require a materially new runtime
  abstraction — plain structural objects have no notify-on-write mechanism, and every ADR since ADR-0035
  treats project-class immutability as foundational, not incidental. Not reduced further.
- **D — explicit dispatch / E — generic substitution**: re-confirmed as requiring either a corpus-wide
  subclass search (whole-program inference, an explicit stop condition) or a genuine type-parameter/
  substitution model the schema has never carried — neither cleared even the investigation bar for a
  reduction ladder this milestone.

## 10. A real bug found and fixed within scope

`_staticMemberTarget`'s own first implementation reused `_instanceMemberTarget`'s symbol reconstruction but
never reused `_externalMethodTarget`'s own return-type/parameter-shape eligibility gate — reproduced live
(a static method returning `dynamic`/`List<int>` resolved a target and emitted `export function
Model_getDynamic(): unknown`, real, un-refused, silently-wrong output) before this milestone's own commit.
Fixed by extracting the shared gate into `_isEligibleMethodShape` (M11-A), consumed by both
`_externalMethodTarget` (unchanged behavior, confirmed via the full regression suite) and
`_staticMemberTarget`. Two permanent Dart regression tests and one TS regression test added (§16).

## 11. Adversarial mutations — mutate, confirm failure, revert, confirm clean

Six cycles; every mutation was reverted immediately after evaluation (one accidental `git checkout` during
mutation 3 discarded the file entirely — caught immediately via `git status`/a missing-symbol grep,
reconstructed from this conversation's own record, re-verified byte-identical via `git diff --stat` against
the pre-incident diff size before continuing):

1. **Removed the `isStatic` requirement** — NOT caught by any existing test on the first attempt (a genuine
   test-coverage gap, closed before finalizing, per §11a below).
   - **11a. Coverage gap found and closed**: no test constructed the one scenario where `_staticMemberTarget`
     is reachable for a genuinely non-static method — a bare call, from within a subclass, to a method that
     subclass itself newly declares (rejected by `_externalMethodTarget`'s own dispatch-safety check on the
     OWNER class, not by privacy/override/abstract-ness). Added as a permanent regression test; re-ran the
     mutation against it — caught (1 test failure).
2. **Removed the private-member exclusion** — caught: 1 Dart test failure ("a private static method never
   resolves a target").
3. **Replaced owner-qualified symbol reconstruction with a hardcoded owner string** — caught: 3 Dart test
   failures (the smallest-positive and cross-file-identity tests, whose own targets now collided/diverged).
4. **Bypassed the `directMemberRefs` reachability extension** (`logic.Call` check disabled) — caught: 7/8 TS
   test failures (every reachable static method silently stopped being discovered).
5. **Omitted the self-less signature branch** (always threaded `self`) — caught: 6/8 TS test failures,
   including a visibly wrong exact-string mismatch (`Model_compute(self: Model, x: number)` where no
   receiver exists) — caught only by exact-string assertion, not a loose "contains a function" check.
6. **Swapped `methodOwnerOf`/`getterOwnerOf`** in the new reachability check — caught: 7/8 TS test failures
   (identical effect to mutation 4, confirmed independently).

## 12. Real fixture: `fixtures/apps/static_method_access/`

Built through the real pipeline (`lib/model.dart`, `lib/other_model.dart`, `lib/main.dart`), proving: R1
smallest positive (`Model.compute(3)`, no receiver); R2 multiple calls including an M10-C/M10-E
optional-default argument, supplied and omitted; R3a static-to-static composition (`doubleCompute` calling
`compute` twice, unqualified); R3b static-to-instance composition (calling an instance getter on a
parameter, M9-L/M10-A/B, unaffected); R4/R6 cross-file AND identity (`OtherModel.compute` shares a name
with `Model.compute`, different owner, resolves independently). Every component passes real `tsc
--strict`. `bridge validate`: `deterministic = true`, `fixed point = true`.

Negative controls live in the EXTENDED `fixtures/apps/method_call_refusal/`: a private static method (whose
caller, otherwise eligible, must itself refuse — the reachable-unsupported-dependency propagation M10-B/D
already established, reproduced for static methods); a static const field (the separate, pre-existing M8-P
boundary, unaffected); a static method with a `dynamic` return type (the real bug, §10, now a permanent
regression proof).

## 13. Architecture — what changed

- **`dart/bridge_analyzer/lib/src/session/extract/expression_extractor.dart`**: new `_staticMemberTarget`
  (mirrors `_instanceMemberTarget`'s symbol reconstruction, requires `isStatic`, excludes
  private/abstract/external/override/operator/generic, requires the shared `_isEligibleMethodShape`);
  `_externalMethodTarget` refactored to consume the SAME shared `_isEligibleMethodShape` (behavior
  unchanged, confirmed by the full regression suite); the bare-`logic.Call` branch's `staticTarget`
  fallback chain gains one entry. Zero UIR schema change.
- **`packages/generators/react/src/internal/emit/functions.ts`**: `directMemberRefs` gains one new check
  (a `logic.Call` whose `callee` is a targeted `logic.Ref` naming a member in `methodOwnerOf`); the
  existing member-helper emission loop branches its own signature construction (`isStatic` ⇒ no `self`
  parameter, mirroring a top-level function) and its own doc-comment capability label; `MethodHelperInfo`
  gains one new optional field (`isStatic`).
- **`packages/generators/react/src/internal/emit/expression.ts`**: the `logic.Ref` call-site lowering
  gains one new branch (checked alongside the pre-existing getter-helper branch, resolving
  `scope.projectClassMethodIds`/`scope.methodHelpers` — no NEW `EmitScope` fields; both were already
  populated for instance methods, and a static method's own id is present in the identical, unfiltered
  population loop).

No new UIR node kind, no new schema field, no new `EmitScope` field, no new runtime abstraction.

## 14. Supported subset / refused subset

**Supported**: a call to a project-defined class's own public, non-abstract, non-external, non-generic,
non-`@override` static method, with a uniformly-positional parameter list (optional parameters requiring an
explicit default, M10-E) and an eligible return type (`dart:core` value type or a dispatch-safe project
class, M10-D) — reused verbatim from the instance-method gate. **Refused, unchanged**: static fields/consts
(the pre-existing M8-P `FieldDecl`-lowering boundary), static getters (a natural, narrower follow-on not
built this milestone), private/abstract/external/`@override`/generic statics, and every M9/M10 refusal
boundary for every other construct.

## 15. Identity / provenance / evaluation-order / reachability / cross-file / dispatch / recursion

**Identity**: owner-qualified (`Symbols.functionIn(library, name, owner: className, ...)`), resolved by the
analyzer's own `Element` identity, never source text — confirmed via the cross-file, same-name identity
probe (§12). **Evaluation order**: trivial — no receiver exists; arguments evaluate through the unchanged
ADR-0041 machinery. **Reachability**: a dedicated, narrow extension to the existing fixed-point walk
(§13), safe by the identical non-convergence argument recursion already relies on (ADR-0040 §10) — a
self- or mutually-recursive static chain still refuses, unaffected. **Cross-file**: the ordinary
`module.use(...)` mechanism, unchanged. **Dispatch**: not applicable — Dart has no virtual statics; the one
adjacent risk (a bare call to a non-static, dispatch-unsafe method) is explicitly excluded and
adversarially tested (mutation 1a, §11). **Recursion**: a static method composing with itself or another
static method participates in the SAME fixed-point retry loop as any other member; unaffected.

## 16. Tests added

- `dart/bridge_analyzer/test/extraction_test.dart` (+7 tests, new group `bounded static method access
  provenance (ADR-0045, M11-A)`): target resolution for the smallest case, cross-file/same-name identity,
  private-method exclusion, static-field non-resolution, the subclass-dispatch-safety edge case (§11a), and
  the return-type/named-parameter eligibility regression (§10). One PRE-EXISTING M10-A test's own assertion
  reversed (§17), matching the identical, established M10-E precedent for a capability that flips a prior
  negative control to positive.
- `packages/generators/react/tests/static_method_access_build.test.ts` (new, 8 tests): BRG1310 absence,
  zero-error generation, real `tsc --strict`, and one exact-string test per reduction-ladder rung.
- `packages/generators/react/tests/method_call_refusal_build.test.ts` (+3 tests): the three negative
  controls (§12), each asserting the exact diagnostic and `files === []`.
- `packages/generators/react/tests/support.ts` (+1 helper): `staticMethodAccessRaw()`.

## 17. A pre-existing test's own assertion reversed

`extraction_test.dart`'s own M10-A group had a test named "a static method call never reaches the
MethodCall/target shape at all," asserting `callee.containsKey('target')` was `isFalse` — true before this
milestone, now correctly `isTrue`. Renamed and its assertion flipped, with a comment explaining the
reversal and confirming the SHAPE claim in its own name (never `logic.MethodCall`, always `logic.Call`)
remains true — matching the identical precedent M10-E's own "optional positional parameter WITH a default
value IS targeted" test already established for a different capability.

## 18. Regressions

`dart test` (full suite): 566 tests, all passed, both before and after every fix, and after every mutation
revert. `pnpm exec vitest run` (full `packages/generators/react` suite): 524/524 passed across 56 files.
`just ci`/`just determinism`: run in full as part of this milestone's own closing validation; results
recorded in the closing numbered report.

## 19. FlutterBridge-only boundary and `hello_bridge` drift

No Continuum reference, dependency, or naming anywhere in this milestone's own code, tests, fixtures, ADR,
or this document. `fixtures/apps/hello_bridge/analysis_options.yaml` was never staged, committed, restored,
or modified by this milestone's own work.

## 20. What was NOT done

Async method calls via `await`, self-/mutually-recursive helper support, synthesized temporaries, mutable
instance state, static fields/consts, static getters, inheritance-based dispatch, generic classes/methods —
none of these was implemented, and no existing refusal boundary for any of them was weakened. No new
runtime abstraction, UIR schema field, node kind, or `EmitScope` field beyond the one optional
`MethodHelperInfo.isStatic` flag was introduced.

## 21. Outcome and recommendation for M11-B

Outcome A for the selected primitive (static method access): fully supported for its bounded subset, zero
new architecture beyond one narrow, well-precedented extraction/reachability/emission extension. Not
Outcome B — no representation, identity, evaluation-order, or reachability question was found unanswerable.

**The next milestone should implement async method calls via explicit `await` (Primitive F), because the
Promise/await lowering machinery has now been proven — not merely argued — to already exist and work
correctly** (`logic.Await`'s unconditional lowering, async action/event-handler bodies) **and is
sufficiently specified**: an extraction-side "await-required" context gate mirroring ADR-0044's own
`isNullAware`-receiver-qualifies pattern (require the method call be the direct operand of an
`AwaitExpression`), plus a generator-side `Promise<T>` return-type wrap for an async method helper. Self-
recursion via declaration reservation (Primitive G) remains the strongest ALTERNATIVE candidate, with the
richest documentary precedent, but its own safety property needs a dedicated milestone's own focused
mutation-testing attention on the write-once-on-success discipline it must relax.
