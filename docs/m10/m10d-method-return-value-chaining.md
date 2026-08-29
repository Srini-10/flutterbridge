# M10-D — Instance Method Return Values, Chaining & Result Semantics

## 1. Baseline

Started from `1141d07` (`origin/main` == `HEAD`), the M10-C method-argument-semantics commit. `git status
--short` showed only the pre-existing, deliberately-untouched `fixtures/apps/hello_bridge/analysis_options.yaml`
drift. M9, M10-A, M10-B, and M10-C are all closed; this is M10-D, not a continuation or reopening of any of
them.

## 2. Mission

Extend the bounded instance-method architecture (ADR-0038/0039/0040/0041) so that an eligible method's own
RETURN VALUE — a primitive or an eligible project class — may be safely consumed by a further expression, a
further property read, a further eligible getter, or a further eligible method call, whether on the SAME
class or a DIFFERENT one, and whether in the SAME file or a DIFFERENT one, while proving the existing
evaluation-order contract and recursion boundary both hold unchanged under chaining.

## 3. Reconnaissance

Read before any new code: ADR-0038/0039/0040/0041 and their milestone docs
(`docs/m10/m10a-bounded-instance-method-execution.md`, `docs/m10/m10b-member-helper-composition.md`,
`docs/m10/m10c-method-argument-semantics.md`), the current `_externalMethodTarget`/`_dispatchSafeReceiverClass`
in `expression_extractor.dart`, `emitFunctionModules`'s own class-emission and member-helper-retry code in
`functions.ts`, and `case 'logic.MethodCall':`/`case 'logic.PropertyAccess':` in `expression.ts`, to
establish exactly what already existed before treating anything as new.

## 4. Reduction ladder — real evidence, real pipeline, before any implementation

Built and run through the real analyzer → extraction → normalization → generation pipeline (a scratch probe
fixture first, then formalized as the committed `fixtures/apps/method_return_semantics/`). Every one of the
following worked correctly with **ZERO new code**, confirmed by real generated output and real
`tsc --strict`:

- A primitive result, standalone, in arithmetic, or combined from multiple calls left-to-right.
- A field read or a getter call on a method's own result (same class).
- **Method-after-method chaining — the critical case** (`model.getNext().multiply(4)`) — already composed
  to `Model_multiply(Model_getNext(self), 4)`, never a runtime-prototype-method call, for the SAME-CLASS
  case.
- A project-class return produced by a fresh construction inside the method's own body, not merely a
  forwarded field.
- A project-class return declared in a SEPARATE Dart file, including a further getter call chained off the
  cross-file result.
- An external (widget-prop) receiver preserving every one of the above identically to a local receiver.

Two real gaps were found, both closed narrowly and additively (§5, §6) — neither required by the reduction
ladder's own "same-class" positive cases, both found by extending the ladder one step further (a method's
own return TYPE eligibility; a CROSS-CLASS chaining case).

## 5. Bug found and fixed: return-type eligibility was unchecked

`_externalMethodTarget` checked a method's own parameters (arity-kind since M10-A, function-typed-ness
since M10-C) but never its own RETURN type. A method returning `dynamic` or a generic instantiation
(`List<int>`) still resolved a `target` and reached a real, un-refused helper whose own signature rendered
the return type `unknown` — safe only by accident in a template-literal interpolation, and a real
`tsc --strict` failure the moment a caller chained a further member off the result. Fixed with
`_isEligibleMethodReturnType` — `dart:core` value types via `DartType.isDartCoreInt`/`isDartCoreDouble`/
`isDartCoreNum`/`isDartCoreBool`/`isDartCoreString` (real analyzer semantic identity, never a type-name
string), or a project class via the IDENTICAL `_dispatchSafeReceiverClass` gate a RECEIVER's own type
already must pass — reused verbatim, not re-derived. Deliberately EXEMPTED for an `async` method
(`element.firstFragment.isAsynchronous`), preserving ADR-0039 §5's own established, separately-tested split
that keeps the async exclusion at the generator layer. Full detail: ADR-0042 §3/§4.

## 6. Bug found and fixed: cross-class method-helper emission was not a global fixed point

ADR-0040's own member-helper retry loop (`memberAttempts`/`remainingMembers`/`memberProgressed`) was scoped
PER CLASS — sufficient for one member depending on another member of the SAME class, but a real,
live-probed bug emerged the moment one class's own method could depend on a DIFFERENT class's method
(return-value chaining, this milestone's own new capability): if the DEPENDENT class's id happened to sort
before the DEPENDENCY class's id in the canonical, non-dependency-ordered class-emission loop, the
dependent class's own per-class retry loop exhausted itself before the dependency ever existed, and was
never revisited — a real, ACYCLIC, fully-supportable cross-class chain (`Bravo.chain() => toAlpha().terminal();`)
refused `BRG3013` PERMANENTLY, purely as an artifact of class processing order. This is the third
recurrence of "declaration/class order is not a dependency order" (ADR-0040 §10 for same-class members,
ADR-0041 §3 for class TYPES, now for cross-class method-helper BODIES). Fixed by collecting every eligible
class's own getters/methods into ONE GLOBAL retry pool, attempted to a fixed point ACROSS every class, not
within one — confirmed directly: the exact bad-sort-order probe that previously refused now lowers
correctly, and a genuine two-class mutual cycle (no base case) still refuses cleanly and terminates quickly
(no hang). Full detail: ADR-0042 §5.

## 7. Evaluation order — re-proven under chaining, unchanged

ADR-0041 §5's own contract (receiver before arguments, left-to-right, exactly once, never reordered) holds
unchanged for a chained call — a structural fact of `emitExpression`'s own recursive, single-pass
evaluation, not a new guarantee this milestone had to add. Re-proven by exact-string assertion in the real
fixture and by mutation testing (§9).

## 8. Recursion — re-proven under return-value chaining

M10-B's own fixed-point non-convergence protection generalizes for free to a cross-class cycle reached only
through return-value chaining: a genuine, real, two-class mutual cycle
(`MutualA.cycle() => toB().cycle2();` / `MutualB.cycle2() => toA().cycle();`, no base case) was built and
run through the real pipeline, BEFORE and AFTER the global-retry-loop fix (§6) — both times it refused
cleanly (`BRG3013`, "has no supported lowering... even though its own declaration is otherwise eligible")
and terminated quickly (no hang, confirmed by a real test run completing in well under a second). No
ad-hoc recursion-detection code was added or is needed — the identical, unmodified "target set but no
helper" refusal already established in ADR-0040 §10 handles a cross-class cycle exactly as it already
handled a same-class self-recursive method.

## 9. Schema — no change

ADR-0042 §7. Return-value chaining needed no new UIR field or node kind — a chained call is simply one
`logic.MethodCall` (or `logic.PropertyAccess`) nested as another `logic.MethodCall`'s own `receiver`, a
shape the schema already permitted and the generator already recursed into. The two real gaps this
milestone closes (§5, §6) are both generator/extractor-internal.

## 10. Implementation — what changed

- **`dart/bridge_analyzer/lib/src/session/extract/expression_extractor.dart`**: `_isEligibleMethodReturnType`
  (new) plus one new check inside `_externalMethodTarget`, exempted for `async` methods.
- **`packages/generators/react/src/internal/emit/functions.ts`**: the per-class member-attempt collection
  and its fixed-point retry loop were split — collection stays per-class (alongside the unconditional field
  interface, unchanged from ADR-0041 §3's own two-pass structure), but the retry loop itself now runs ONCE,
  globally, over every eligible class's own getters/methods combined.

No change to any UIR schema file, `expression.ts`, any runtime package, or any other generator-internal
module.

## 11. Real fixture: `fixtures/apps/method_return_semantics/`

Built through the real pipeline (`lib/model.dart`, `lib/other_model.dart`, `lib/main.dart`), proving: a
primitive result standalone/in arithmetic/combined from multiple calls; a getter call and a field read on a
method's own result; method-after-method chaining on the SAME class AND across TWO DIFFERENT classes
(`Leader`/`Follower` — `Leader`'s own id confirmed, by real generation, to sort BEFORE `Follower`'s, making
this a genuine, permanent regression proof for §6's own fix, not a same-order coincidence); a fully inline
constructed-receiver-then-method-result chain; an external (prop) receiver; a cross-file project-class
return, both independently reachable as a getter owner (`OtherModel`) and reachable EXCLUSIVELY through the
transitive class-type-reachability walk (`Wrapped`, which has no getter or method of its own at all). Every
component passes real `tsc --noEmit --strict`.

## 12. Tests added

- `packages/generators/react/tests/method_return_semantics_build.test.ts` (new, 12 tests): BRG1310
  absence, zero-error generation, real `tsc --strict`, primitive/arithmetic/multiple-results (exact-string),
  getter-after-method (exact-string), field-after-method (exact-string), same-class method-after-method
  (exact-string), cross-class method-after-method (exact-string, the §6 regression proof), inline
  constructed-receiver chain, external-receiver chain, cross-file return (asserts no `unknown` anywhere),
  and the field-only transitive-reachability case (`Wrapped`).
- `packages/generators/react/tests/method_call_refusal_build.test.ts` (+3 tests): a `dynamic`-returning
  method, a generic-instantiation-returning method, and a subclass-returning method (with a further field
  read attributing the refusal to the unsupported TYPE, not the method call itself) all refuse honestly as
  `BRG3013`.
- `dart/bridge_analyzer/test/extraction_test.dart` (+4 tests, in the existing "bounded structural instance
  method execution provenance" group): the three return-type exclusions above never resolve a `target`, and
  an async method's return type is confirmed still exempt from the new gate.
- `packages/generators/react/tests/support.ts`: `methodReturnSemanticsRaw()` added.

## 13. Fixture extended: `fixtures/apps/method_call_refusal/`

`DynamicReturnModel`/`GenericReturnModel`/`Base`+`Derived`+`SubclassReturnModel` (lib/model.dart) and three
corresponding demo widgets (lib/main.dart) added, proving §5's own fix as a permanent regression, in the
same real-pipeline fixture the optional-parameter/async/recursion/function-typed-parameter refusals already
live in. `fixtures/uir/method_call_refusal.ndjson` regenerated from the real analyzer against the extended
source.

## 14. Adversarial mutations — mutate, confirm failure, revert, confirm clean

Seven cycles (the six the governing brief names as a minimum, plus one targeting the cross-class fix
directly, since it is this milestone's own single most important change):

1. **Removed the return-type eligibility gate** (§5) — caught: 3 Dart test failures (the three new return-
   type-exclusion tests) plus 2 TypeScript refusal-test failures.
2. **Replaced helper composition with raw `receiver.property`/`receiver.method(...)` access** — caught: 30
   failures across four build-proof suites (every chaining/composition test asserts real helper-call text).
3. **Duplicated the returned helper expression** in the call template — caught: 9 failures.
4. **Reordered nested return-value evaluation** (swapped receiver/argument position in the call template) —
   caught: 5 failures.
5. **Disabled the transitive class-type-reachability walk** (ADR-0041 §3) — NOT caught by the fixture as
   originally built (`OtherModel` is also independently reachable as a getter owner, entering
   `classIdsNeedingTypes` regardless of the transitive walk). Treated as a genuine coverage gap per the
   governing brief's own instruction: added `Wrapped`, a class with NO getter or method of its own,
   reachable EXCLUSIVELY through `Model.wrap()`'s return type — re-ran the mutation, now caught (3
   failures), reverted, confirmed clean.
6. **Replaced resolved return-type classification with name-only matching**
   (`type.getDisplayString() == 'int'` etc., instead of `DartType.isDartCoreInt` etc.) — NOT caught by any
   test in this corpus: no project in the real fixture corpus defines a class that shadows a `dart:core`
   value-type name, so name-based and resolved-type-based classification agree on every case actually
   exercised. A concrete Dart program shadowing `dart:core String` via `import 'dart:core' hide String;`
   was attempted live to construct a discriminating test, but interacted awkwardly with Flutter's own
   implicit `Text`/`String` usage in a MaterialApp shell and was not pursued further, per the governing
   brief's own explicit instruction not to manufacture a test solely to claim mutation coverage. This
   mutation's own risk is closed by CONSTRUCTION, not by a runtime-observable test: `_isEligibleMethodReturnType`
   is verified, by direct code inspection, to use `DartType.isDartCoreInt`/`isDartCoreDouble`/`isDartCoreNum`/
   `isDartCoreBool`/`isDartCoreString` — real analyzer semantic identity — satisfying the governing brief's
   own explicit Phase 4 requirement ("the eligibility decision must use real analyzer semantic information,"
   "do NOT classify support using raw Dart type-name strings") directly, not merely by absence of a failing
   test.
7. **Reverted the global cross-class retry loop to per-class isolation** (§6) — caught: 11 of 12 failures
   in the real, committed `method_return_semantics_build.test.ts` (the `Leader`/`Follower` cross-class
   chain refuses `BRG3013`, cascading to the document's own all-or-nothing `BRG3005` and failing every
   other assertion in the same file) — a genuine, permanent regression proof, not merely a scratch probe.

Every mutation was reverted immediately after being evaluated; `git diff`/`git status --short` at the end
of this milestone's own work show zero residue from any of the seven cycles.

## 15. Silent-wrong-code audit

Actively searched for, per the governing brief's own list:

- **Wrong or missing return `TypeRef`; a return value reaching the generator as `unknown`**: two real
  instances found and fixed (§5 — `dynamic`/generic returns; §6's own OWN failure mode was a refusal, not
  a wrong type, so this specific symptom applied only to §5).
- **Duplicated method-result evaluation; reordered evaluation**: investigated directly (mutations 3/4, §14)
  — not present in the shipped code; both mutations needed to be manufactured to prove the guard exists.
- **Raw receiver access leaking through; dispatch leakage**: investigated directly (mutation 2, §14) — the
  existing helper-composition path is exclusive; no code path falls through to `receiver.method(...)` for
  an eligible chained call.
- **Cross-file type omission**: investigated directly (§11's own `Wrapped` case) — not present; the
  transitive class-type-reachability fixed point (ADR-0041 §3) already extends to a method's own return
  type regardless of which file declares it.
- **Accidental runtime-class assumptions**: not present — every project-class value remains a plain
  structural object literal throughout (ADR-0042 §8's own rejected-alternative analysis records why this
  was never considered viable).
- **Recursion bypass**: investigated directly (§8) — the existing fixed-point non-convergence protection
  generalizes for free to a cross-class cycle; no bypass exists or was introduced.
- **Stale unknown-based capability checks**: none found — the new return-type gate (§5) checks real
  resolved `DartType` identity, never inspecting the generated TypeScript's own `unknown` fallback text.

No pre-existing, out-of-scope gap was newly discovered by this milestone (unlike M10-C's own render-tree-
local re-inlining finding) — every issue found here was newly introduced by this milestone's own reduction
ladder reaching further than any prior milestone had, and both were fixed within scope.

## 16. Regressions

`dart test` (full suite): all tests passed, both before and after every fix, and after every mutation
revert. `pnpm exec vitest run` (full `packages/generators/react` suite): 491/491 passed. `just ci` and
`just determinism`: run in full as part of this milestone's own closing validation; results recorded in the
closing numbered report delivered alongside this document, which is the authoritative record (this section
intentionally does not restate a result that could go stale relative to the actual command output).

## 17. `bridge validate` / fixed-point validation

`method_return_semantics`'s own raw UIR was generated from the real analyzer, and `bridge validate` was run
against the fixture directly (real analyze → normalize → generate → typecheck stages), confirming both
determinism (two independent runs agree byte-for-byte) and the normalization fixed point
(`normalize(normalize(x)) == normalize(x)`).

## 18. FlutterBridge-only boundary and `hello_bridge` drift

No Continuum reference, dependency, or naming anywhere in this milestone's own code, tests, fixtures, or
documentation. `fixtures/apps/hello_bridge/analysis_options.yaml` was never staged, committed, restored, or
modified — confirmed by `git status --short` immediately before the closing commit; its pre-existing drift
(a side effect of local `flutter analyze` tooling, per M10-B §3's own confirmation) is excluded from every
`git add` in this milestone the same way it was in every prior one.

## 19. What was NOT done

M10-E was not started. No unrelated M10/M11 work was performed. No new UIR schema field, node kind, runtime
class, prototype, global mutable state, or name-based special case was introduced. Constructors as
first-class runtime values, async/Future-returning method support, nullable project-class returns, generic
methods, and generic classes remain exactly as unsupported/deferred as they were before this milestone —
none of them was newly implemented, and no existing refusal boundary for any of them was weakened.

## 20. Outcome: A — full support for the bounded subset, zero new architecture

Every consumption shape this milestone's own governing brief named — arithmetic, assignment, a further
property read, a further eligible getter, a further eligible method call, same class or a different one,
same file or a different one — lowers correctly through the existing ADR-0038/0039/0040/0041 architecture,
with exactly two narrow, additive fixes (§5, §6). This is not Outcome B: no chaining, evaluation-order,
return-type-identity, or recursion question was found unanswerable by the existing architecture. Full
architectural reasoning: ADR-0042.
