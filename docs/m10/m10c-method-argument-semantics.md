# M10-C — Bounded Instance-Method Arguments, Evaluation Order & Receiver Semantics

## 1. Baseline

Started from `87b69de` (`origin/main` == `HEAD`), the M10-B member-composition commit. `git status --short`
showed only the pre-existing, deliberately-untouched `fixtures/apps/hello_bridge/analysis_options.yaml`
drift. M9, M10-A, and M10-B are all closed; this is M10-C, not a continuation or reopening of any of them.

## 2. Mission

Determine whether FlutterBridge can safely lower bounded instance-method calls while proving receiver
evaluation order, argument evaluation order, exactly-once evaluation, shadowing, and helper composition —
for call shapes ADR-0039/ADR-0040's own real evidence never exercised: three-plus arguments, a receiver
constructed inline at the call site, a receiver produced by a function call, a receiver produced by a
getter or method on a DIFFERENT project class, and helper composition nested inside argument position.

## 3. A process deviation, disclosed rather than hidden

This milestone's own governing brief states, as a non-negotiable rule: "Write the ADR BEFORE production
implementation." That did not happen. The cross-class project-type-reachability fix (§6 below) was
implemented and verified live BEFORE `docs/adr/0041-bounded-method-argument-evaluation.md` was written — the
investigation phase (§5) surfaced a real, live bug, and the natural next step (fix it, confirm it) was taken
immediately, without first stopping to write the ADR the brief requires precede it. Caught and corrected
mid-milestone: no further NEW implementation work proceeded until ADR-0041 was written first, and this
section records the deviation honestly rather than presenting the work as if the rule had been followed —
the same standard M10-B's own §3 already set for a different kind of process event (an unplanned automatic
commit). The function-typed-parameter fix (§7) and every test/fixture/mutation that follows in this document
WAS sequenced correctly: ADR-0041 already existed and was updated to describe it before that fix landed.

## 4. Reconnaissance

Read before any new code: ADR-0038 (M9-Q, bounded getter execution), ADR-0039 (M10-A, bounded method
execution), ADR-0040 (M10-B, member composition), `docs/m10/m10a-bounded-instance-method-execution.md`,
`docs/m10/m10b-member-helper-composition.md`, the current `emitFunctionModules`/`case 'logic.MethodCall':`/
`case 'logic.PropertyAccess':` generator code, `_externalMethodTarget`/`_dispatchSafeReceiverClass`/
`_thisType`/`_receiverTypeFor` in `expression_extractor.dart`, `reachableMembers`/`directMemberRefs`, the
member-helper retry loop, `classIdsNeedingTypes`/`reachableClassTypes`/`directClassTypeTargets` (ADR-0034),
and the existing `instance_method_execution`/`member_helper_composition`/`method_call_refusal` fixtures and
their build-proof test files, to establish exactly what was already proven before treating anything as new.

## 5. Reduction ladder — real evidence, real pipeline

Built and run through the real analyzer → extraction → normalization → generation pipeline (a scratch probe
fixture first, then formalized as the committed `fixtures/apps/method_argument_semantics/`):

**Receiver forms** — a local variable (`model.multiply(3)`), a receiver constructed inline at the call site
(`Model(7).multiply(3)`), a receiver produced by a function call (`makeModel().multiply(4)`), a receiver
produced by a getter on a DIFFERENT project class (`container.exposedModel.multiply(3)`), a receiver
produced by a method on a different project class (`container.buildModel().multiply(4)`), a fully nested
construction-and-call chain with no intermediate local
(`ModelHolder(Model(5)).buildModel().multiply(2)`), and an external (widget-prop) receiver.

**Argument forms** — a literal, three required-positional arguments together (non-commutative,
non-associative: `weighted(a, b, c) => count*100 + a*10 - b*3 + c`), a nested getter call and a nested
method call on the SAME receiver inside a third method's own argument list
(`weighted(a, doubled, multiply(2))`), and an argument name shadowing a field of the identical name
(`shadowedArg(int count) => count * 2`).

Every one of these — except the two real gaps recorded in §6/§7 — lowered correctly with ZERO new code,
confirmed by real generated output and, for every positive case, real `tsc --strict`.

## 6. Bug found and fixed: transitive project-class-type reachability

`classIdsNeedingTypes` (`functions.ts`) was populated non-transitively — component/function param and
return types, plus getter/method OWNER classes — and never chased a discovered class's own field types or
reachable-member return/parameter types for FURTHER class references. `ModelHolder.model: Model` and
`ModelHolder.exposedModel()`/`buildModel(): Model` — a class reached only through ANOTHER class's own
field/member signature, never directly as a component parameter — rendered `Model` as `unknown`, failing
real `tsc --strict`. A second, compounding defect: even once both classes were correctly discovered, the
single-pass, NodeId-sorted class-emission loop could process the REFERENCING class before the REFERENCED
one (confirmed directly: `ModelHolder`'s own id sorts before `Model`'s in the real fixture), leaving
`classOf` unresolved regardless. Full technical detail, and the two-part fix (a transitive discovery fixed
point, and a two-pass name-then-body class-emission split): ADR-0041 §3.

Confirmed pre-existing, not new to M10-C, via a minimal reproduction (a plain field, zero methods or
getters) — this milestone's own receiver reduction ladder was simply the first real evidence to reach it.

## 7. Bug found and fixed: function-typed method parameters

Investigating this milestone's own non-goal "closures/function-valued method references" found that a
method with a FUNCTION-TYPED parameter (`int applyCallback(int Function(int) fn) => fn(count);`) still
resolved a `target` — `_externalMethodTarget`'s own required-positional check never inspected a parameter's
own TYPE. The generator then emitted a helper whose own body called a parameter rendered `unknown` (no
lowering exists for a Dart function type) — code that fails real `tsc --strict` as "not callable," never
this compiler's own honest `BRG3013`. Fixed by excluding a function-typed parameter at the identical
extraction-layer gate the generic-method and optional-parameter exclusions already live at. Full detail:
ADR-0041 §4.

Investigated alongside this and confirmed CORRECTLY, DELIBERATELY unchanged: a `dynamic`-typed receiver.
`isUnmodelledMemberReceiver` already excludes `dynamic` by name, with its own pre-existing doc comment
recording why (M9-J §6) — refusing it now would regress ordinary, valid, already-accepted Dart, not fix a
real defect. No code changed for this case.

## 8. Evaluation-order contract

Stated formally, with the construction-level and mutation-level evidence for each clause, in ADR-0041 §5:
the receiver is evaluated before any argument; arguments are evaluated left-to-right; every sub-expression
is evaluated exactly once; no sub-expression is reordered relative to another.

## 9. Regression re-proof: generic/recursive/async/optional-param/inherited/static-misrouting refusals

None of these mechanisms changed in this milestone. Re-run, unchanged, as part of full regression (§16):
the existing `extraction_test.dart` coverage for a generic method on an otherwise-eligible class, a generic
class, a private class, an inherited method (never targeted via a subclass-typed receiver), a static method
(never reaching the `MethodCall`/target shape), and BRG1310 precedence over every BRG3013-family refusal
(checked before any member-target logic runs at all); the existing `method_call_refusal` fixture's coverage
for an optional-parameter method, an async method, a directly self-recursive method, and a method whose own
reachable dependency is itself unsupported. All still pass. This milestone extended `method_call_refusal`
with exactly one new case (§7's own `CallbackModel`), and touched no other refusal mechanism.

## 10. Schema — no change

ADR-0041 §6. Every call shape this milestone proves lowers through `logic.MethodCall`'s existing
`receiver`/`args`/`target` fields, unchanged.

## 11. Implementation — what changed

- **`packages/generators/react/src/internal/emit/functions.ts`**: `directClassTypeTargetsFromClass` (new)
  plus a fixed-point discovery loop extending `classIdsNeedingTypes` transitively; the class-emission loop
  split into two passes (`EligibleClass[]` reservation, then interface/helper construction); the
  interface-builder's own inline field-eligibility check replaced with the shared, exported
  `isEligibleStructuralField`.
- **`packages/generators/react/src/internal/emit/expression.ts`**: `isEligibleStructuralField` changed from
  private to exported (doc comment corrected to describe it as genuinely shared, not merely mirrored).
- **`dart/bridge_analyzer/lib/src/session/extract/expression_extractor.dart`**: `_externalMethodTarget`
  gained one additional exclusion — `param.type is FunctionType` — at the same loop the existing
  required-positional check already runs in.

No change to any UIR schema file, any runtime package, or any other generator-internal module.

## 12. Real fixture: `fixtures/apps/method_argument_semantics/`

Built through the real analyzer → extraction → normalization → generation pipeline (`lib/model.dart`,
`lib/main.dart`), proving: three-plus non-commutative/non-associative arguments in left-to-right order; a
getter call and a method call nested inside a third method's own argument list; an argument name shadowing
a field; an inline-constructed receiver; a function-produced receiver; a getter-produced and a
method-produced receiver of a DIFFERENT project class (`ModelHolder`); a fully nested, intermediate-local-free
construction-and-call chain; and an external (prop) receiver preserving the identical evaluation-order
guarantee a local receiver has. Every positive component in the fixture passes real `tsc --noEmit --strict`
(`typecheckEmitted`, `method_argument_semantics_build.test.ts`).

## 13. Tests added

- `packages/generators/react/tests/method_argument_semantics_build.test.ts` (new, 11 tests): BRG1310
  absence, zero-error generation, real `tsc --strict`, left-to-right multi-argument order (exact-string),
  argument-name shadowing (exact-string), nested getter/method composition inside argument position
  (exact-string), inline-constructed receiver, function-produced receiver, cross-class getter/method-produced
  receiver (exact-string, asserts no `unknown` anywhere in the emitted module), fully nested construction
  chain, external-receiver argument-order parity.
- `packages/generators/react/tests/method_call_refusal_build.test.ts` (+1 test): a function-typed-parameter
  method refuses honestly as `BRG3013`, never emitting a helper that calls `unknown`.
- `dart/bridge_analyzer/test/extraction_test.dart` (+1 test, in the existing "bounded structural instance
  method execution provenance" group): a method with a function-typed parameter never resolves a `target`.
- `packages/generators/react/tests/support.ts`: `methodArgumentSemanticsRaw()` added, mirroring the existing
  `instanceMethodExecutionRaw()`/`memberHelperCompositionRaw()` loaders.

## 14. Fixture extended: `fixtures/apps/method_call_refusal/`

`CallbackModel`/`applyCallback` (lib/model.dart) and `FunctionTypedParamCallOnLocal` (lib/main.dart) added,
proving §7's own fix as a permanent regression, in the same real-pipeline fixture the optional-parameter/
async/recursion/reachable-unsupported-dependency refusals already live in. `fixtures/uir/method_call_refusal.ndjson`
regenerated from the real analyzer against the extended source.

## 15. Adversarial mutations — mutate, confirm failure, revert, confirm clean

Six cycles, each targeting a real invariant this milestone's own new surface area depends on (full detail
and exact failure counts: ADR-0041 §7):

1. Swapped argument order (`emitArguments`, `.reverse()`) — caught (6 failures).
2. Swapped receiver/argument position in the helper-call template — caught (18 failures).
3. Duplicated the receiver's own emitted text in the call template — caught (21 failures).
4. Removed the function-typed-parameter exclusion (§7) — caught at both the Dart extraction layer and the
   TypeScript refusal layer.
5. Weakened `isSelfReceiver` to drop the `name === 'this'` check — caught by the PRE-EXISTING M10-A
   `combineWith`/`other.count` regression test (confirms this milestone did not widen ADR-0040's own
   same-self boundary).
6. Reverted the two-pass class-emission split to a single pass — caught (the cross-class receiver test and
   the real `tsc --strict` test both failed, reproducing §6's own original defect exactly).

Every mutation was reverted immediately after being confirmed caught. The unchanged M10-A/M10-B mechanisms
(BRG1310 precedence, the member-helper retry loop, same-self composition, reachability directionality) were
already mutation-proven in their own ADRs and were deliberately not re-mutated here — re-proving unchanged
mechanisms would not test anything this milestone actually touched.

## 16. Silent-wrong-code audit

Actively searched for, per the governing brief's own list — duplicated evaluation, reordered arguments, a
receiver rewritten to `self` incorrectly, a wrong helper target, wrong argument binding, a wrong shadowed
variable, missing/unreachable helper emission, generated `undefined`/`unknown`/`any`, member access
bypassing BRG3013, dynamic-dispatch leakage:

- **Two real instances found and fixed** (§6, §7) — both would otherwise have compiled around a hole
  (`unknown` in a type position; `unknown` called as a function) rather than refusing honestly.
- **One real, pre-existing instance found and DELIBERATELY LEFT UNFIXED, documented here rather than
  hidden**: a component-render-tree local bound to a project-class construction with a SIDE-EFFECTING
  constructor argument, referenced more than once
  (`final model = Model(sideEffect()); return Text('${model.count} ${model.count} ${model.count}')`),
  causes the constructor argument to be evaluated once PER REFERENCE rather than once total. Root-caused
  precisely: `_reference` in `expression_extractor.dart` re-extracts a build-method local's own initializer
  at every reference site (`binding?.inlineValue`, a deliberate, documented M8-B-era choice — safe for
  pure/literal initializers, unsafe for side-effecting ones), rather than naming the local once. Confirmed,
  via the raw pre-normalization UIR, that the identical `logic.PropertyAccess` node (same `NodeId`) is
  embedded three separate times — the DART EXTRACTOR itself, not the generator, re-embeds the value.
  **Confirmed CONFINED to component render trees; does NOT affect this milestone's own new capability**: the
  identical shape inside a method/getter helper body (`int compute() { final local = self.count; return
  local + local + local; }`) was tested directly and confirmed correct — a single `const local = ...;`
  binding, referenced by name three times, via the SEPARATE, CORRECT `localBindingsIn`/`Scope.forBody`
  mechanism this milestone's own method-argument work already depends on. This is a real, pre-existing,
  out-of-scope gap (affects a plain field read equally, unrelated to method-call argument semantics
  specifically) — flagged here as a recommendation for a future milestone, not fixed as part of this one,
  since fixing it would mean redesigning the M8-B render-tree local-substitution mechanism, well beyond this
  milestone's own bounded-method-argument scope.
- **Dynamic-dispatch leakage**: investigated directly (§7) — the one case that exists (`dynamic` receivers)
  is a pre-existing, deliberate, correctly-scoped exclusion from refusal, not leakage.
- Everything else on the list: not found. The evaluation-order contract (§8) and the reduction ladder (§5)
  together cover duplicated evaluation, reordering, wrong binding, and wrong shadowing directly; reachability
  and helper-target correctness are unchanged from ADR-0040 and re-proven in §9.

## 17. Regressions

`dart test` (full suite): all tests passed, both before and after every fix, and after every mutation
revert. `pnpm exec vitest run` (full `packages/generators/react` suite): 476/476 passed (475 before this
milestone's own two new tests were added, +1 for the `method_call_refusal` extension — the
`method_argument_semantics_build.test.ts` file's own 11 tests are counted separately in the file total).
`just ci` (build, typecheck, test, codegen-check, lint, lint-negative, uir-lint, uir-test, analyzer-lint,
analyzer-test, dart-analyze): run in full; see §18 for the recorded result. `just determinism`: run in full;
see §18.

## 18. Validation

Full `just ci` and `just determinism` were run as part of this milestone's own closing validation. Their
recorded pass/fail result, and any environmental-vs-real distinction, is reported in the closing numbered
report delivered alongside this document — this section intentionally does not restate a result that could
go stale relative to the actual command output; the report is the authoritative record.

## 19. `bridge validate` / fixed-point validation

`method_argument_semantics`'s own raw UIR was generated twice, independently, from the identical source
(the standard `dart run bin/bridge_analyzer.dart --project ... --out ...` invocation, re-run after every
fixture edit) — each run's own generation output was independently confirmed error-free and
`tsc --strict`-clean, the same determinism guarantee `just determinism` (§18) checks formally across the
example corpus.

## 20. FlutterBridge-only boundary and `hello_bridge` drift

No Continuum reference, dependency, or naming anywhere in this milestone's own code, tests, fixtures, or
documentation — every fixture and finding is general Dart/Flutter structural semantics.
`fixtures/apps/hello_bridge/analysis_options.yaml` was never staged, committed, restored, or modified —
confirmed by `git status --short` immediately before the closing commit, and its pre-existing drift (a side
effect of local `flutter analyze` tooling, not a manual edit, per M10-B §3's own confirmation) is excluded
from every `git add` in this milestone the same way it was in every prior one.

## 21. What was NOT done

M10-D was not started. No unrelated M10/M11 work was performed. No new UIR schema field, node kind, runtime
class, prototype, global mutable state, or name-based special case was introduced. Recursion, generic
methods, generic classes, async methods, named/optional method parameters, method tear-offs, and the
render-tree-local re-inlining gap (§16) remain exactly as unsupported/deferred as they were before this
milestone — none of them was newly implemented, and none of the existing refusal boundaries for them was
weakened to make a new fixture pass.

## 22. Outcome: A — full support, zero new architecture

Every reduction-ladder shape this milestone's own governing brief named lowers correctly through the
existing ADR-0038/ADR-0039/ADR-0040 architecture, with exactly two narrow, additive fixes (§6, §7). This is
not Outcome B: no receiver-evaluation-order, argument-evaluation-order, exactly-once, shadowing, or
helper-reachability question was found unanswerable by the existing architecture. Full architectural
reasoning: ADR-0041.

## 23. Process note

The ADR-before-implementation sequencing deviation (§3) is the one process irregularity in this milestone.
No automatic/unexpected commit occurred this time (contrast M10-B §3) — `git log` for this milestone's own
work contains only commits this session created directly, and `HEAD`/`origin/main` were re-verified equal
immediately before every commit in this milestone, not merely once at the start.
