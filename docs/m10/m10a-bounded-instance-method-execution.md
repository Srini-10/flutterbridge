# M10-A — Bounded Instance Method Execution

## 1. Baseline

Started from `56c3454` (`origin/main` == `HEAD`), the M9-R closure commit. `git status --short` showed
only the pre-existing, deliberately-untouched `fixtures/apps/hello_bridge/analysis_options.yaml` drift.
M9 is closed (`docs/m9/m9r-final-closure.md`); this is the first M10 milestone, not a continuation of M9,
and does not reopen it.

## 2. Mission

Generalize ADR-0038's bounded getter-execution architecture from zero-argument getters to instance
methods carrying real, required-positional arguments — `model.multiply(3)` lowering to
`Model_multiply(model, 3)`, never a runtime class, prototype, or method property on the emitted
structural object.

## 3. Fresh reproduction

Reproduced live, via the real analyzer, the pre-M10-A refusal for `fixtures/apps/method_call_refusal`'s
own method call: the extractor never attached a `MethodCall.target` for any method (`_externalMethodTarget`
did not exist), so the call always fell through to the M9-J/M9-R refusal, reporting `BRG3013` and emitting
zero files. Captured the receiver's own `logic.New` construction shape, the method's own
`ClassDecl.methods` entry, and the call site's own `receiver`/`method`/`args` fields before writing any
new code.

## 4. Architecture decision

Option A (extend the ADR-0038 member-helper architecture) — selected. Full evaluation, including why B
(attach functions to objects), C (runtime class), D (inline at call site), and E (keep refused) were
rejected, is ADR-0039 §2, which extends ADR-0038 §2's own evaluation rather than repeating it.

## 5. What shipped

- **Dart extractor** (`expression_extractor.dart`): `_externalMethodTarget` — the method-execution sibling
  of `_externalGetterTarget`, reusing `_dispatchSafeReceiverClass` verbatim, adding `isOperator`/
  required-positional-only checks. Wired into `_invocation`'s own `MethodInvocation` handling as a second
  disjunct after the pre-existing `_storeMemberTarget`, explicitly excluded for an implicit- or
  explicit-`this` receiver (method-to-method calls are out of scope — ADR-0039 §10).
- **Generator** (`functions.ts`): `methodOwnerOf`/`directMethodRefs`/`reachableMethods` (mirroring the
  getter-execution siblings), a method-helper emission loop alongside the existing getter-helper loop
  (same per-class, per-file module), and `projectClassMethodIds` — the full, unconditional set of every
  `ClassDecl`-declared method id, needed because `MethodCall.target` is not this capability's own
  exclusive field (§6 below).
- **Generator** (`expression.ts`): `EmitScope.methodHelpers`/`projectClassMethodIds` fields; the
  `logic.MethodCall` case now checks `target` against `projectClassMethodIds` first, then resolves through
  `methodHelpers` — a resolved helper lowers to a real function call; an eligible-but-un-helpered target
  (an `async` method) refuses (`BRG3013`), never falling through to the naive `receiver.method(args)`
  lowering.

## 6. A real regression found and fixed before this ever reached a build

The first working implementation checked only `typeof node['target'] === 'string'`, with no capability
discrimination. This broke `fixtures/apps/local_store`'s own `_left.add(5)`/`_left.increment` — a store
instance's own action call, whose `target` is attached by the pre-existing `_storeMemberTarget` (M7-N,
ADR-27) for entirely unrelated reasons. `local_store_build.test.ts` caught this immediately: `add`/
`increment` started reporting `BRG3013` instead of lowering to their own, already-correct, real method
call. Fixed by adding `projectClassMethodIds` (§5) so only a `target` naming an actual `ClassDecl`-declared
method is ever treated as an ADR-0039 reference; every other `target` falls through completely unchanged.
Full rationale: ADR-0039 §4.

## 7. Parameter identity and shadowing — freshly proven

`extraction_test.dart`'s own new group (13 tests) proves method identity, owner-qualification, and every
negative control directly against `_externalMethodTarget`, not inferred from ADR-0038's getter-level
conclusion. `fixtures/apps/instance_method_execution`'s own `Box.combine`/`Box.doubledViaLocal` prove
parameter-shadows-field, explicit-this-under-shadowing, and local-shadows-field empirically, through the
real pipeline, with the exact generated helper bodies asserted
(`instance_method_shadowing_build.test.ts`). Full mechanism: ADR-0039 §6.

## 8. Evaluation order and exactly-once evaluation

Not new machinery: the receiver is emitted once (as ADR-0038 §8 already established), and every argument
is emitted once, in source order, by the same `emitArguments` the pre-existing naive lowering already used
and still uses for every method call this capability does not claim. ADR-0039 §8.

## 9. Supported method subset — Outcome A2

Public, instance, concrete, non-static, non-abstract, non-external, non-generic, non-operator method,
uniformly required-positional parameters, declared directly on a public, non-generic,
direct-`Object`-superclass, non-component/State/store class; body either expression- or block-bodied,
reading only fields, its own parameters, and locals derived from them. Full statement of the gate: ADR-0039
§3/§9.

## 10. Reduction ladder — what was proven, real fixtures unless noted

| # | Shape | Result |
|---|---|---|
| 1 | Expression-bodied method, one required-positional param | Supported (`instance_method_execution`) |
| 2 | Zero-parameter method (not a getter) | Supported (`Box.doubledViaLocal`) |
| 3 | Parameter shadows a field of the same name | Supported, resolves to parameter (`Box.combine`) |
| 4 | Explicit `this.field` under a shadowing parameter | Supported, resolves to field (`Box.combine`) |
| 5 | Local variable shadows a field, no parameter of the same name | Supported (`Box.doubledViaLocal`) |
| 6 | Optional positional parameter (`[int bonus = 0]`) | Refused, `BRG3013` (`method_call_refusal`) |
| 7 | Named parameter | Refused, `BRG3013` at extraction (Dart test only) |
| 8 | Private method | Refused, `BRG3013` at extraction |
| 9 | Abstract method (no body) | Refused, `BRG3013` at extraction |
| 10 | Static method | Never reaches `MethodCall` shape at all (`logic.Call`) |
| 11 | Operator method (`[]`) | Refused, `BRG3013` at extraction |
| 12 | Binary operator (`+`) | Never reaches `MethodCall` shape at all (`logic.Binary`) |
| 13 | Inherited method (subclass-typed receiver) | Refused, excluded via the superclass gate |
| 14 | Overriding method (`@override`) | Refused, excluded independently of the superclass gate (via `implements`) |
| 15 | Method on a generic class | Refused, `BRG3013` at extraction |
| 16 | Method on a private class | Refused, `BRG3013` at extraction |
| 17 | Async method | Extraction attaches a `target`; generator refuses, `BRG3013` (`method_call_refusal`, `AsyncModel`) |
| 18 | Method-to-method / method-to-getter call inside a body | Out of scope — deliberately never reaches `_externalMethodTarget` |
| 19 | External (parameter) receiver vs. locally-constructed receiver | Identical helper semantics, both real-fixture proven |
| 20 | Store instance method call (`_left.add(5)`) | Unaffected — resolved via the pre-existing, unrelated store mechanism (§6) |
| 21 | Generic METHOD (`T identity<T>(T value)`) on a non-generic class | Refused, `BRG3013` at extraction — real gap found and fixed (§18) |
| 22 | External (prop) receiver, real fixture | Supported, identical helper as a constructed receiver (§18, `ExternalReceiverDemo`) |
| 23 | Getter + method on one class, real fixture | Supported, both coexist (§18, `Model.doubled`/`Model.multiply`) |
| 24 | Two-argument, non-commutative method | Supported, left-to-right order preserved (§18, `Model.subtract`) |
| 25 | Eligible but unreachable sibling method | Never emitted (§18, `Model.unusedMultiplier`) |
| 26 | Invalid Dart inside an otherwise-eligible method body | `BRG1310`, never `BRG3013` (§18) |

Not independently fixture-verified (reasoned from code plus the shared, already-tested `_dispatchSafeReceiverClass`/
`emitArguments`/`ModuleBuilder.declare` mechanisms): named-parameter refusal at the generator layer specifically
(the Dart-layer test already proves `target` never attaches), helper-name collision safety for two methods whose
preferred names collide across classes (identical, unmodified mechanism ADR-0038 §5 already proved for getters).

## 11. Schema

No UIR schema change. `ClassDecl.methods` already carried every needed fact on the existing `FunctionDecl`
shape. ADR-0039 §12.

## 12. Tests added

- `dart/bridge_analyzer/test/extraction_test.dart`: new group, 13 tests (positive identity, owner-qualified
  identity, 9 negative controls, determinism).
- `packages/generators/react/tests/instance_method_execution_build.test.ts`: 5 tests (no BRG1310, no
  error, bounded helper shape, call-site shape, real `tsc --strict`).
- `packages/generators/react/tests/instance_method_shadowing_build.test.ts`: 3 tests (parameter-shadow,
  local-shadow, call-site shape).
- `packages/generators/react/tests/method_call_refusal_build.test.ts`: updated for the optional-parameter
  refusal, plus one new test for the async-method refusal.
- No change needed to `unmodelled_class_member_refusal.test.ts` — its own hand-authored `MethodCall`
  refusal cases are untouched by this milestone (`target` stays `undefined` for every case it constructs).

## 13. Real fixtures

- `fixtures/apps/instance_method_execution` (new) — the positive case, plus the shadowing proof.
- `fixtures/apps/method_call_refusal` (updated, kept from M9-R) — its own method's second parameter is
  now deliberately optional, so it continues proving the identical refusal for a method that stays
  genuinely unsupported after M10-A; a second class, `AsyncModel`, added for the async-refusal proof.

## 14. Adversarial mutations — mutate, confirm failure, revert, confirm clean

| Mutation | What it broke | Caught by |
|---|---|---|
| B — drop the explicit `self` receiver at the call site | `Model_multiply(3)` instead of `Model_multiply({...}, 3)` | `instance_method_execution_build.test.ts` (2 tests: call-site shape, `tsc`) |
| C/D — rewrite the field-rewrite match from id-based to name-based | A parameter named like a field, and a local named like a field, both incorrectly rewritten to `self.<name>` | `instance_method_shadowing_build.test.ts` (2 tests) |
| F — remove `hasOverride`/owner-consistency checks from `_externalMethodTarget` | An `@override` method reachable via `implements` (no superclass gate to independently block it) incorrectly targeted | `extraction_test.dart`'s own "independently load-bearing... via `implements`" test |
| H — add every declared method to the structural interface | `Model`'s own interface gained a bogus `multiply(): unknown;` member | `instance_method_execution_build.test.ts` (2 tests: interface shape, `tsc`) |
| G — remove the `helper === undefined` `BRG3013` fallback, fall through to naive `receiver.method(args)` | The async `AsyncModel.scale` call stopped refusing | `method_call_refusal_build.test.ts` ("refuses an async method call as BRG3013" — `expected false to be true`) |

Every mutation reverted; `git diff --numstat` on each touched file matched its pre-mutation baseline
exactly after reverting.

One mutation (removing `enclosingElement != ownerClass` alone, independent of `hasOverride`) was **not**
independently caught by either existing negative control — both already fail earlier, via the superclass
gate (a subclass always has an explicit non-`Object` supertype). This mirrors ADR-0038 §15's own identical,
already-documented finding for getters: a defense-in-depth check whose own removal is not independently
exercised by the current test suite, because every constructible counter-example already fails a different
check first. Recorded here rather than silently left unnoticed, consistent with that section's own
disclosure.

Not run (would require Option D or reopening M9-Q's own settled architecture; judged lower value than the
five run): A (helper-name-only identity — unmodified, already-proven ADR-0038 §5 mechanism, over a shared
`ModuleBuilder.declare` this milestone added no new identity scheme for), E (inline body causing
duplication — Option D was rejected outright in §2, so exercising it would require reintroducing an
architecture this ADR already discards, not merely toggling a flag in the shipped one).

## 15. Regressions

- Dart: 537/537 (was 520/520 before this milestone; +17 new).
- TypeScript (`@bridge/gen-react`): 444/444 (was 435/435 before this milestone; +9 new).
- `local_store_build.test.ts` (M7-N, store method/action calls) — regression found and fixed (§6),
  reconfirmed passing.
- `unmodelled_class_member_refusal.test.ts` (M9-J/M9-R) — unaffected, all 9 tests still pass.
- M9-Q getter execution, M9-N field reads, M9-O/P construction, M9-M type shapes — unaffected; the new
  `instance_method_execution` fixture's own `Model`/`Box` interfaces still carry only bounded field shapes,
  and construction remains a plain object literal even though method calls on the same receiver now
  execute (proven directly, same fixture).

## 16. Validation

`dart analyze --fatal-infos`, `dart test`, `pnpm --filter @bridge/gen-react exec tsc --noEmit`,
`pnpm --filter @bridge/gen-react test`, real `tsc --strict` on every new fixture's generated output. `just
ci`/`just lint`/`just typecheck`/`just codegen-check`/`just determinism` run before commit (§18).

## 17. FlutterBridge-only boundary and `hello_bridge` drift

No Continuum reference introduced by this milestone's own diff (verified via `git diff` on every touched
file) — pre-existing, untouched provenance comments citing Continuum remain in a few files this milestone
also edited elsewhere (`expression.ts`, `component.ts`, `extraction_test.dart`), unchanged from before.
`fixtures/apps/hello_bridge/analysis_options.yaml`'s own pre-existing drift left untouched, unstaged.

## 18. Second audit pass — one real fix, and evidence the first pass left thin

A second, independent read of the governing brief (fuller than the platform-truncated copy §1-17 were
written against) surfaced one genuine correctness gap and several places where the first pass's own
evidence was thinner than the brief asked for. Addressed before treating M10-A as closed:

- **Real fix — a generic METHOD on a non-generic class was not excluded.** `_dispatchSafeReceiverClass`'s
  own generic check inspects the RECEIVER's type arguments only; `_externalMethodTarget` never separately
  checked the resolved member's own `typeParameters`. Live probe confirmed `T identity<T>(T value) =>
  value;` on an otherwise-fully-eligible, non-generic `Model` got a `target` attached — `ClassDecl.methods`
  has no field to represent `T` in a helper signature, so this would have reached the generator's own
  method-helper loop with nowhere correct to go. Fixed by adding `element.typeParameters.isNotEmpty` to
  `_externalMethodTarget` (ADR-0039 §3), with a permanent regression test
  (`extraction_test.dart`, "a generic METHOD on an otherwise-eligible non-generic class is never
  targeted").
- **External-receiver positive control, real fixture.** The first pass proved external-vs-constructed
  coherence only at the Dart extraction layer. `instance_method_execution`'s own `ExternalReceiverDemo`
  now takes `Model` as a real widget constructor parameter and calls the identical `multiply`/`subtract`/
  `doubled` members; the generated call is `Model_multiply(props.model, 3)` — the identical helper the
  locally-constructed receiver's own `Model_multiply({ count: 7 }, 3)` uses.
- **Getter + method on one class, real fixture.** `Model` now also declares `doubled` (a getter) alongside
  `multiply`/`subtract`; both helper kinds coexist in the same generated module, sharing the identical
  structural receiver.
- **Multi-argument, non-commutative evaluation-order proof.** Added `Model.subtract(int a, int b) => count
  - a - b`; swapping `a`/`b` changes the result, so the passing assertion (`Model_subtract({ count: 7 }, 5,
  2)`) cannot be an accident of commutativity the way a single-argument or commutative example could be.
- **The brief's own exact single-expression shadowing form.** Added `Box.exactCombine(int value) =>
  this.value + value;` — the literal form §13/§58 name, not only the two-local block-bodied `combine`
  the first pass already had.
- **Reachability negative control, real fixture.** Added `Model.unusedMultiplier`, called nowhere in the
  program; asserted absent from the generated module, proving reachability stays selective.
- **BRG1310 precedence, explicit test.** An analyzer-invalid method body (`missingIdentifier + factor`)
  still reports `BRG1310`, never reaching this milestone's own capability logic — true by construction
  (ADR-0031's own gate runs first), now asserted directly rather than only relied upon.
- **Mutation G, run for real.** The first pass substituted a real regression fixture (the `AsyncModel`
  refusal test) for this mutation, reasoning it was equivalent. Run directly this time: removing the
  `helper === undefined` refusal branch and reverting to the naive lowering caused the async-method test
  to fail exactly as predicted (`expected false to be true` on the `BRG3013` assertion) — confirmed, then
  reverted; `git diff --numstat` matched the pre-mutation baseline exactly.

Not additionally strengthened this pass, with reasoning: mutation A (helper-name-only identity) and
helper-name collision safety remain proven only by inheritance from ADR-0038 §5's own adversarial getter
proof over the shared, unmodified `ModuleBuilder.declare` mechanism — this milestone added no new identity
scheme for `declare` to exercise differently. Method-to-method/getter reachability, recursion, broader
return/parameter type coverage beyond `int`/getter/field types, and a project-class-typed method parameter
remain investigated only at the level §30-§35 of the brief itself calls optional — deferred, not silently
skipped.

Regression counts after this pass: Dart 539/539 (+2 over §15's own 537), TypeScript 449/449 (+5 over §15's
own 444).

## 19. Outcome

**A2 — bounded method execution, expression- and block-bodied.** ADR-0039 written and reconciled with
ADR-0038. M10-B was not started; the next M10 theme (method-to-method/getter reachability,
optional/named-parameter support, or a different M10 capability entirely) is an open backlog item, not a
decision made here.
