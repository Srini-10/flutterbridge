# M11-B — Bounded Async Method Calls via Explicit `await`

## 1. Baseline

Started from `6f9d0ac` (`origin/main` == `HEAD`), the M11-A static-method-access commit. `git status
--short` showed only the pre-existing, deliberately-untouched `fixtures/apps/hello_bridge/
analysis_options.yaml` drift. M9, M10-A through M10-F, and M11-A are all closed; M11-A's own final report
explicitly recommended this exact capability next, with the exact evidence this milestone confirms.

## 2. Mission

Implement the smallest, evidence-backed async method-call capability M11-A identified: support a bounded
project-defined `async` instance/static method call when the Dart call is explicitly awaited, reusing the
already-proven Promise/`await` machinery — never a general async milestone.

## 3. Analyzer evidence

Confirmed live (a scratch probe, real analyzer → extraction → generation → `bridge validate`, never
hand-authored UIR):

- The extraction layer never checked `isAsync` when resolving a method call's own `target` (pre-existing,
  unchanged fact, ADR-0039 §5) — an async method call resolves a target identically whether or not the
  Dart source ever awaits it. The generator unconditionally excludes any `isAsync === true` member from
  ever being lowered to a callable helper — the ONE actual gap this milestone closes.
- `AwaitExpression.expression` (analyzer 14.0.0) is a plain `Expression`, no narrower static type — the
  extractor pattern-matches its runtime shape (`is MethodInvocation`, after unwrapping parentheses) rather
  than trusting a type.
- `DartType.isDartAsyncFuture` (analyzer 14.0.0) is a real, already-shipped semantic predicate, identical
  in shape to `isDartCoreInt`/`isDartCoreBool` this codebase already uses throughout
  `_isEligibleMethodReturnType`.
- `TypeRef` (`shared.json`) has no `typeArguments` field — `Future<int>`'s own `TypeRef.name` is literally
  the opaque display string `"Future<int>"`; `typeTextOf` (the generator) has zero generic-instantiation
  parsing, confirmed by reading its full body — such a name falls through to the literal string
  `'unknown'`. The real `T` is recovered from the analyzer's own `InterfaceType.typeArguments` at
  extraction time instead.
- Async store actions and component event handlers already emit real `async (...) => {...}` with real,
  working `await` (`store.ts`, `component.ts`) — but NEITHER ever writes an explicit return-type
  annotation (TypeScript infers it); the method-helper path (`functions.ts`), by contrast, ALWAYS writes
  one — the one asymmetry this milestone resolves by computing a real `Promise<T>` annotation.

## 4. Semantic primitive: explicit await-required call context

Not `method.isAsync == true` alone. The primitive is: **an async method call reached as the direct operand
of Dart's own `AwaitExpression`**. Never inferred from the callee's own return type — a `Future`-returning
method may legitimately be referenced without immediately awaiting it, a different, unsupported shape this
milestone does not promote into the supported one.

## 5. Why the primitive is safe

The extraction-side gate (`_externalMethodTarget`/`_staticMemberTarget`, both gaining an `awaited`
parameter defaulting to `false`) means a non-async method's own eligibility is completely unaffected
either way — zero regression risk to any prior M10/M11 capability, confirmed by the full, unmodified
regression suite passing throughout. An async method's target resolves ONLY when the specific call site is
genuinely awaited; a bare, un-awaited reference to the identical method — even a genuinely eligible one —
still refuses, proven directly (§12, §16).

## 6. Supported subset

A call to an already-eligible instance or static method (ADR-0039/ADR-0045's own full shape gate — public,
non-abstract, non-external, non-generic, non-`@override`, uniformly-positional parameters) whose own
declared return type is `Future<T>` for a `T` that independently passes the identical
`_isEligibleMethodReturnType` gate a synchronous method's own return type already must — AND whose call
site is the direct operand of an `AwaitExpression`. Composes with M10-B internal composition, M10-D
return-value chaining, M10-E optional defaults, M11-A static method access, cross-file declarations.

## 7. Refused subset

A bare, un-awaited call to an async method (unchanged, pre-existing refusal); `Future<dynamic>`,
`Future<List<int>>`, `Future<SubclassType>`, or any other `T` the synchronous return-type gate would
already reject; a private, abstract, external, generic, `@override`, or named-parameter-bearing async
method; async recursion; an inherited async method reached through a subclass-typed receiver where the
subclass ITSELF is the dispatch-unsafe owner (the inherited-but-not-overridden shape, by contrast, already
composes correctly — §14); async getters/setters/fields/constructors; top-level async functions (the
existing, separate exclusion site deliberately left untouched, §11).

## 8. Explicit-await evidence

Proven directly, in the SAME fixture, so no test can pass by accident on either shape alone
(`extraction_test.dart`'s own ADR-0046 group): `model.scale(3).toString()` (no `await`) resolves no
target; `await model.scale(3)`, in a sibling method, resolves a real one. The identical pair is proven for
a static method call (§14) and for an internal (bare, implicit-`this`) composition call.

## 9. Promise/await lowering behavior

`logic.Await`'s own lowering changed from `` `await ${operand}` `` to `` paren(`await ${operand}`) `` —
self-parenthesizing, the identical discipline `logic.Binary`/`logic.Unary`/`logic.Conditional`/
`logic.NullCheck` already apply to themselves (`expression.ts`'s own established `paren(...)` helper,
unchanged). A REAL bug was found and fixed via this exact composition (§15). Once a callee resolves to a
real, `async`-keyword, `Promise`-returning helper, `logic.Await`'s own unconditional lowering composes
correctly for free — no call-site-specific logic was added anywhere.

## 10. UIR/schema impact

None. `logic.Await` (`operand`, `type`, both already required) is completely unchanged. No new node kind,
no new schema field. The extracted `returnType` TypeRef for an async method now describes `T` directly
(never `Future<T>`), exactly as a synchronous method's own returnType already does — recovered from the
real analyzer `DartType` at extraction time, never from a schema-level generic-argument representation
(which does not exist and was not added).

## 11. Extraction changes

- `_invocation` gains an `awaited` parameter (default `false`), threaded through the bare-instance-call
  path, the bare/static-qualified path, and `_methodCallOn` (the explicit-receiver path, including its
  safe-navigation, ADR-0044, sibling branches).
- `_externalMethodTarget`/`_staticMemberTarget` each gain the identical `awaited` parameter: an `async`
  element with `awaited == false` never resolves a target.
- The `AwaitExpression()` case unwraps parentheses and, only when the (unwrapped) operand is directly a
  `MethodInvocation`, routes it through `_invocation(..., awaited: true)` instead of the generic `extract`
  dispatcher — every other awaited expression shape is unaffected.
- `_isEligibleMethodShape` (shared by both target-resolution functions, M11-A) no longer exempts an async
  method's return type from checking — it unwraps `Future<T>` via `DartType.isDartAsyncFuture`/
  `typeArguments`, then checks `T` against the unchanged `_isEligibleMethodReturnType` gate.
- `declaration_extractor.dart`'s `_methods` (class methods only — top-level async functions deliberately
  untouched, §17) computes its own `returnType` field from the unwrapped Future type argument for an async
  method, via a new `_valueReturnTypeOf` helper.

## 12. Normalization changes

None. No normalization pass was touched; the fixture's own `bridge validate` run confirms `deterministic =
true`/`fixed point = true` unaffected (§19).

## 13. Reachability changes

None needed. `directMemberRefs` (M11-A's own extension for `logic.Call`) already recurses generically
through every child field of every node — a `logic.MethodCall`/`logic.Call` nested inside a
`logic.Await.operand` is discovered by the identical, unmodified walk. Confirmed live, not assumed
(mutation 5, §18).

## 14. Static async method behavior / cross-file behavior

Composes through the exact same M11-A static-method machinery: no `self` parameter, owner-qualified
identity. Proven directly (`Model.loadStatic`, awaited). Cross-file: proven via `OtherModel` (a different
file) as an awaited method's own return-value-chained type (§16). Inheritance: an inherited (non-
overridden) async method called bare from a subclass CONTEXT resolves correctly — the bare-call path's own
receiver type is reconstructed from the method's OWN declaring class, never the calling context's,
confirmed via a live probe — while a subclass's OWN newly-declared (non-override) async method, called
bare from within itself, correctly refuses (the identical dynamic-dispatch-safety exclusion M11-A's own
mutation testing already established for the synchronous case, ADR-0045 mutation 1a) — both proven,
`method_call_refusal`'s own `AsyncSubclass`.

## 15. A real bug found and fixed within scope

Building the fixture's own R7a rung (an awaited `Future<ProjectClass>`, its own further member read)
exposed a genuine, pre-existing, GENERAL operator-precedence gap: `logic.PropertyAccess`'s receiver
rendering naively concatenates `${receiver}.${property}` with no parenthesization check — before this
milestone, `logic.Await` was the ONE low-precedence node that did NOT self-wrap, so `(await
model.createOther()).count` emitted as `await Model_createOther(self).count` — reading `.count` off the
`Promise` itself, not the awaited value (caught by real `tsc --strict` as a type error in this specific
shape, but a genuine silent-wrong-code risk in general). Fixed by making `logic.Await` self-parenthesize,
matching the established `paren(...)` convention every OTHER low-precedence node already follows (§9).
Two permanent regression tests added: an exact-string proof of the correct parenthesization
(`async_method_await_build.test.ts`), and an updated pre-existing regex (`async_push_guard_build.test.ts`,
whose own `await delay(...)` STATEMENT now carries one harmless, additional outer paren pair).

## 16. A real, pre-existing, unrelated bug found — documented, not fixed

While building this milestone's own fixture, a genuine, pre-existing, UNRELATED bug was found and
root-caused: a local variable declared inside a `sig.Action` (store action) body and read by a LATER
statement in the same body fails with `BRG3006` ("not declared in this program") — reproduced with ZERO
async/await involvement (`final r = 5; result = r;`). Root cause: `store.ts`'s own `actionScope` helper
overrides only `paramInScope`, never `localName` — unlike `functions.ts`'s member-helper loop and
`expression.ts`'s own inline-`logic.Lambda` case, both of which correctly compute `localBindingsIn(body)`
and wire it into `localName`. A structurally similar symptom was also reproduced for a `StatefulWidget`'s
own inline `onPressed: () async {...}` handler with a nested `setState(() {...})` closure; extraction and
normalization were directly confirmed innocent for it (the affected reference's own `target` field matches
its declaration's id both before and after normalization), but its own precise root cause was not further
isolated within this milestone's own scope. NOT fixed here: it affects synchronous local variables
identically, unrelated to `async`/`await` specifically, and this milestone's own fixture was deliberately
designed around it (every action assigns DIRECTLY from an awaited call, or constructs its own receiver
fresh inline, never through an intermediate local or a store's own instance field) rather than needing to
solve it. Recorded as a real candidate for a dedicated future investigation (§21).

## 17. What was NOT done

Un-awaited async calls (stay refused, unchanged); arbitrary `Future`/`Promise` manipulation; async
constructors, getters, setters, fields; generic async methods; async recursion; implicit await insertion;
stream/async-generator support; top-level async functions (the existing, separate exclusion site was
deliberately left untouched — no evidence gathered showed it "falls out naturally," since a reachable
top-level function still resolves through `scope.node()`'s own top-level index, a structurally different
reachability path this milestone did not need to touch); the pre-existing local-variable/store-action-field
scoping bug (§16). No existing refusal boundary for any of these was weakened.

## 18. Silent-wrong-code audit

Per the governing brief's own explicit list:

- **A. Async method emitted synchronously**: impossible by construction — `isMemberAsync` drives the
  `async` keyword unconditionally wherever the return type is `Promise`-wrapped.
- **B. Explicit await dropped**: `logic.Await`'s own lowering is unconditional, unchanged in behavior
  beyond the parenthesization fix.
- **C. Implicit await inserted**: never — the `awaited` flag flows ONLY from a genuine `AwaitExpression`
  encountered during extraction, never inferred from a callee's return type (proven, §8).
- **D. Promise return type lost**: proven false directly — `Model_load`'s own signature carries
  `Promise<number>` (§ fixture inspection); a return-type-omitting mutation was caught (mutation 2, §19).
- **E. Promise double-wrapped**: checked directly — `Model_useSelf`'s own body (`(await Model_load(self))
  + 1`) composes correctly, no nested `Promise<Promise<...>>` anywhere in the fixture's own output.
- **F/G. Unsupported `Future<T>` becomes `unknown`/`any`**: neither — `Future<dynamic>`/generic/named-
  parameter async methods refuse honestly (`method_call_refusal`'s own extended negative controls, §7);
  zero `any`/`unknown` in the diff, confirmed by direct grep.
- **H/I. Async call bypasses method/static eligibility**: checked directly (mutations 3/4, §19) — both
  caught.
- **J/K. Await changes receiver/argument evaluation**: no new evaluation-order machinery was added at
  all — arguments and the receiver flow through the completely unchanged ADR-0041 mechanism; `await` only
  wraps the RESULT of an otherwise-ordinary call.
- **L. Unreachable async method emitted**: reachability is unaffected (§13); an unreachable async sibling
  in the fixture (none constructed, since every declared async method is reachable via the fixture's own
  design) was not a concern this milestone needed to separately fixture, given `directMemberRefs`'s own
  reachability discipline is completely unmodified.
- **M. Cross-file async identity collision**: unaffected — the identical, unmodified owner-qualified
  symbol scheme.
- **N. Generic async method passes through**: refused (§7, `AsyncRefusalModel.identity<T>`).
- **O. Inherited/overridden async method receives unsafe dispatch**: investigated directly and proven
  correct on BOTH sides of the boundary (§14).
- **P. Async recursion creates non-convergent emission**: refused via the identical, unmodified fixed-point
  non-convergence argument (§7, `AsyncRefusalModel.countdownAsync`) — the retry loop terminates, proven by
  the full test suite's own real timeout.

## 19. Mutation testing — mutate, confirm failure, revert, confirm clean

Six cycles, one of which exposed a genuine, real test-coverage gap, closed before finalizing:

1. **Removed the extraction-side `awaited` gate** from `_externalMethodTarget` — caught: 3 Dart test
   failures.
2. **Removed the generator-side `Promise<...>` wrapping** — caught: 7/9 TS test failures.
3. **Bypassed the async return-type re-validation** in `_isEligibleMethodShape` (reverted to the OLD,
   pre-M11-B unconditional exemption) — caught: 1 Dart test failure.
4. **Removed the static-async eligibility gate** from `_staticMemberTarget` specifically — NOT caught by
   the M11-B extraction group, NOR by the full Dart suite, NOR by the full TS suite. **A genuine
   test-coverage gap**: no existing test proved a bare, un-awaited call to a STATIC async method refuses —
   the sibling instance-method test only proved the AWAITED shape resolves. Added
   `'a bare, un-awaited call to a static async method never resolves a target'` as a permanent regression
   test; re-ran the mutation against it — caught (1 test failure). Reverted, re-confirmed clean.
5. **Corrupted reachability discovery** for an awaited static call (swapped `methodOwnerOf` for
   `getterOwnerOf` in the `logic.Call` check M11-A added) — caught: 15/17 TS test failures across both the
   async and static suites.
6. **Removed the `async` keyword from the emitted signature while keeping `Promise<...>`** — caught: 7/9 TS
   test failures via exact-string assertion (would also be a real `tsc --strict` failure independently).

Every mutation was reverted immediately after evaluation; `git diff --stat` on the production code
returned to its exact pre-mutation size (127 insertions / 27 deletions) after every cycle.

## 20. Fixture path

`fixtures/apps/async_method_await/` (positive proof), extending `fixtures/apps/method_call_refusal/`
(negative controls: generic async, `Future<dynamic>` async, private async, self-recursive async, a
subclass's own new async method called bare — all confirmed refusing honestly, `AsyncModel`/
`AsyncMethodCallOnLocal` from the M9/M10 era left completely unchanged in intent, its own diagnostic
MESSAGE shape updated to match the new, more precise refusal path, §22).

## 21. Test additions

- `dart/bridge_analyzer/test/extraction_test.dart` (+6 tests, new group `bounded async method call
  provenance (ADR-0046, M11-B)`): awaited instance/static target resolution with return-type unwrapping,
  un-awaited instance/static refusal, ineligible-return-type refusal, parenthesized-await equivalence. 3
  PRE-EXISTING M10-A/M10-B tests' own assertions reversed (§22), matching the identical, established
  M10-E/M11-A precedent for a capability that flips a prior negative control to positive.
- `packages/generators/react/tests/async_method_await_build.test.ts` (new, 9 tests): BRG1310 absence,
  zero-error generation, real `tsc --strict`, and one exact-string test per reduction-ladder rung,
  including the R7a parenthesization regression proof.
- `packages/generators/react/tests/method_call_refusal_build.test.ts` (+6 tests, +1 existing test's own
  assertion updated): the five new negative controls, plus the pre-existing `AsyncModel.scale` test's own
  message updated to match its new, more precise refusal path.
- `packages/generators/react/tests/async_push_guard_build.test.ts` (+0 new tests, 1 existing regex
  updated): the R15 parenthesization side effect on a pre-existing, unrelated `Future.delayed` fixture.
- `packages/generators/react/tests/support.ts` (+1 helper): `asyncMethodAwaitRaw()`.

## 22. Three pre-existing tests' own assertions reversed

`extraction_test.dart`'s own M10-A group had two near-duplicate tests ("an async method's return type is
exempt from the M10-D return-type gate," "an async method still resolves a target at this layer") both
asserting a BARE, un-awaited `model.scale(3).toString()` resolved a target — true before this milestone,
now correctly false; both updated to prove the awaited/un-awaited PAIR together, in one test each, so
neither can pass by accident on either shape alone. `extraction_test.dart`'s own M10-B group had one
similar test ("an async method dependency still resolves a target internally too") for the internal-
composition case, updated identically. `method_call_refusal_build.test.ts`'s own `AsyncModel.scale` test
had its assertion updated to match the new, more precise refusal message (§8). All four follow the
identical, established M10-E "optional positional parameter WITH a default value IS targeted" precedent.

## 23. Regressions

`dart test` (full suite): 572 tests, all passed, before and after every fix, and after every mutation
revert. `pnpm exec vitest run` (full `packages/generators/react` suite): 538/538 passed across 57 files.

## 24. FlutterBridge-only boundary and `hello_bridge` drift

No Continuum reference, dependency, or naming anywhere in this milestone's own code, tests, fixtures, ADR,
or this document. `fixtures/apps/hello_bridge/analysis_options.yaml` was never staged, committed, restored,
or modified by this milestone's own work.

## 25. `just ci`/`just determinism`/`bridge validate`/`tsc --strict`/`git diff --check`

Recorded in the closing numbered report, run against this exact, fully-reverted-and-clean state.

## 26. Outcome and recommendation for M11-C

Outcome A: fully supported for the bounded subset, with one real bug found and fixed within scope (§15)
and one real, pre-existing, unrelated bug found and honestly documented, not fixed (§16). Not Outcome B —
no representation, identity, evaluation-order, or reachability question was found unanswerable; the
Promise/await machinery was proven, not merely argued, to already exist and compose correctly.

**No predefined next capability is assumed.** The one concrete, evidence-backed candidate this milestone's
own investigation surfaced — worth a dedicated future milestone's OWN fresh investigation, not an automatic
next step — is the local-variable/store-action-field scoping gap found in §16: `store.ts`'s own
`actionScope` (and, less precisely isolated, a `StatefulWidget`'s own nested-closure event handlers) does
not yet wire `localName` for a local declared inside an action/handler body. It is unrelated to async, would
likely affect a broad range of real Flutter event-handler patterns, and has a precise, cited fix location
(`store.ts`'s own `actionScope`, mirroring `functions.ts`'s and `expression.ts`'s own already-correct
`localBindingsIn` wiring) — but per this milestone's own explicit discipline, selecting it as M11-C's own
mission is a decision for that milestone's own fresh investigation, not this one's to make.
