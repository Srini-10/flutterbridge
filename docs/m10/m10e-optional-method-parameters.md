# M10-E — Bounded Optional Positional Method Parameters

## 1. Baseline

Started from `decbf57` (`origin/main` == `HEAD`), the M10-D return-value-chaining commit. `git status
--short` showed only the pre-existing, deliberately-untouched `fixtures/apps/hello_bridge/analysis_options.yaml`
drift. M9 and M10-A through M10-D are all closed; this is M10-E, not a continuation or reopening of any of
them.

## 2. Mission

Identify and implement the smallest genuinely useful NEXT bounded executable-member capability, chosen by
evidence rather than assumption, and ship it narrowly.

## 3. Investigation — what the evidence converges on

Read ADR-0038 through ADR-0042 and their milestone docs (M10-A through M10-D), specifically their own
"future migration"/"what was not done" sections. Across all five documents, named/optional method
parameters is the ONE capability named repeatedly, independently, as the next concrete step — and the ONLY
one of the deferred areas (setters, static members, inheritance, generics, async, recursion, constructors)
tied to a STATED prerequisite: ADR-0039 §14's own "would need the callee's own signature threaded to the
call site." Every other deferred area (setters, statics, inheritance) is not merely unimplemented — it is
structurally unreached by the current architecture, with zero fixtures, zero eligibility scaffolding
(no `_externalSetterTarget`; a static reference never becomes a `PropertyAccess`/`MethodCall` at all; a
subclass-typed receiver is excluded by design, not merely unattempted), and none of them is named as a
"next" candidate anywhere in the ADRs, milestone docs, or `docs/spec/` amendments.

Investigating the stated prerequisite found it already substantially exists: `FormalParameterElement`
(analyzer 14.0.0) exposes `isPositional`/`isOptionalPositional`/`hasDefaultValue` — the callee's own full
signature is already available at the point `_externalMethodTarget` resolves a `target`. The UIR schema
already has `ParamDecl.required`/`defaultValue` fields, already populated for `sig.Action` parameters
(`signal_extractor.dart`) — only `declaration_extractor.dart`'s own class-method/top-level-function
parameter builder had never captured `defaultValue`, and the generator's own shared `paramListOf` had never
finished rendering it. Selected: bounded optional POSITIONAL method parameters carrying an explicit default
value — the smallest capability directly unlocked by evidence already in hand, requiring no new
architecture, no whole-program inference, and no runtime class.

## 4. Rejected alternatives

- **Named parameters, in the same milestone.** No positional call-site equivalent without an options-object
  rewrite or call-site-name-threading — materially larger scope, genuinely deferred (ADR-0043 §7/§14).
- **Optional-without-default positional parameters.** Would introduce `undefined` as a new absent-value
  representation in a codebase that has consistently mapped Dart's single absent value to `null`
  everywhere else — a distinct question this milestone does not answer (ADR-0043 §7/§14).
- **Setters / mutable fields.** Structurally unreached; would require reconsidering whether a project-class
  value is immutable at all — a materially larger, unrelated architectural question, never named as a
  "next" candidate by any prior milestone.
- **Static member access.** Structurally unreached — a static reference never becomes a receiver-bearing
  node at all; would need a new extraction path, not an eligibility-gate extension.
- **Inheritance / subclass dispatch.** Explicitly, repeatedly named a dynamic-dispatch safety concern in
  every prior ADR (ADR-0038 §10 onward) — premature by every prior milestone's own stated reasoning.
- **Generic methods/classes, async, recursion.** Explicitly, repeatedly named non-goals across every prior
  M10 milestone — no new evidence in this investigation changes that.

## 5. A real, pre-existing, unrelated bug found while investigating the stated prerequisite

`paramListOf` (`types.ts`) already inspected a `defaultValue` UIR field but never emitted its text. A real,
live probe reproduced the exact latent failure: a `ChangeNotifier`-based store action with an optional
positional default (`void add([int n = 5])`), invoked with the argument omitted (`store.add()`, a real,
valid, already-supported call shape per ADR-27), generated a REQUIRED parameter with no default clause —
real `tsc --strict` failure ("Expected 1 arguments, but got 0"). Predates this milestone, unrelated to
project-class instance methods, never previously exercised by any fixture. Fixing the ONE shared
`paramListOf` function this milestone's own capability requires repairs this bug as a direct, unavoidable
consequence — recorded here for honesty, not claimed as this milestone's own primary goal. Full detail:
ADR-0043 §3.

## 6. ADR written before implementation

`docs/adr/0043-bounded-optional-positional-method-parameters.md` was written and committed to the working
tree BEFORE any production code changed, correcting the sequencing deviation this session's own M10-C and
M10-D milestones each had to disclose after the fact.

## 7. Implementation — what changed

- **`dart/bridge_analyzer/lib/src/session/extract/declaration_extractor.dart`**: `_params` (shared by class
  methods and top-level functions) now captures `defaultValue`, mirroring `signal_extractor.dart`'s own
  identical pattern; its two call sites (`_methods`, `_function`) now pass the ENCLOSING `scope`, never the
  parameter-bound `inner`, for extracting a default's own expression — a default is a constant expression
  and cannot see the parameters it sits among.
- **`dart/bridge_analyzer/lib/src/session/extract/expression_extractor.dart`**: `_externalMethodTarget`'s
  own parameter loop now requires `param.isPositional` (excluding named parameters) and, for an optional
  positional parameter, `param.hasDefaultValue` (excluding `[int? bonus]`) — replacing the single, narrower
  `param.isRequiredPositional` check ADR-0039 originally shipped.
- **`packages/generators/react/src/internal/emit/types.ts`**: `paramListOf` gained one new optional
  callback, `defaultValueOf`, and now renders a genuine TypeScript default clause (`bonus: number = 10`)
  when a parameter's own `defaultValue` is present — mirroring its existing `use`/`classOf` callback
  pattern exactly.
- **`packages/generators/react/src/internal/emit/functions.ts`**: both `paramListOf` call sites (method
  helpers, top-level functions) now supply `defaultValueOf`, each using its own attempt-scoped
  `emitExpression`/scope — the SAME scope whose `report` callback already routes a failure through this
  attempt's own `hadError` flag, so a default value that fails to emit correctly discards and retries the
  whole attempt, never embedding broken text into a signature.
- **`packages/generators/react/src/internal/emit/store.ts`**: its own `paramListOf` call site now supplies
  `defaultValueOf` too, using the ENCLOSING scope (`inner`, never `actionScope(inner, params)`) — this is
  the ONE line that, combined with the shared `paramListOf` fix, repairs the pre-existing store/action bug
  (§5).

No change to any UIR schema field — `required`/`defaultValue` already existed.

## 8. Eligibility boundary

A method parameter is eligible when: positional (never named); either required, or optional with an
explicit default value (never optional-without-default); non-function-typed (M10-C, unchanged). Every
other ADR-0039/0040/0041/0042 eligibility fact continues to apply unchanged. Full detail: ADR-0043 §7.

## 9. Generated TypeScript shape

`function Model_multiply(self: Model, factor: number, bonus: number = 10): number` — TypeScript's own
native default-parameter mechanism, the truthful representation of Dart's own identical rule. The call
site needs no new logic: `emitArguments` already emits however many argument expressions the source wrote;
omitting a trailing optional one already produces a shorter argument list, exactly what a TypeScript
default parameter already expects.

## 10. Evaluation-order / recursion / cross-file implications

Unaffected. A default value cannot reference the method's own parameters or `self` (Dart's own rule,
confirmed via the analyzer's own scoping and mirrored exactly on both the extraction and generation sides —
ADR-0043 §5/§9/§10/§11) and, being a compile-time constant, cannot itself contain a member call that would
introduce a new reachability edge. A default value referencing a cross-file top-level `const`/`final`
variable was investigated and found to hit a real, pre-existing, DOCUMENTED (M8-P) capability boundary —
lowering a top-level variable declaration is out of scope everywhere in this codebase, not specific to
default values — confirmed to refuse cleanly (`BRG3013`, zero files emitted), never corrupting output
(§13).

## 11. Real fixture: `fixtures/apps/optional_method_parameters/`

Built through the real pipeline (`lib/model.dart`, `lib/main.dart`), proving: a single trailing optional
parameter, omitted and supplied; multiple trailing optional parameters; an optional-parameter method
composed with another bounded member on the same receiver (M10-B, unaffected); an external (prop) receiver.
A cross-file default-value case was deliberately NOT included in the fixture's own positive proof — it
reaches the pre-existing M8-P boundary above, unrelated to this milestone (§10). Every component passes
real `tsc --noEmit --strict`.

## 12. Tests added

- `packages/generators/react/tests/optional_method_parameters_build.test.ts` (new, 7 tests): BRG1310
  absence, zero-error generation, real `tsc --strict`, a single default clause (exact-string, confirms no
  stray `?`), multiple default clauses, composition with M10-B, external-receiver parity.
- `packages/generators/react/tests/local_store_build.test.ts` (+1 test): the pre-existing store/action
  default-value bug (§5) stays fixed — a real, permanent regression test using the extended `local_store`
  fixture (`CounterStore.bump([int n = 5])`).
- `packages/generators/react/tests/method_call_refusal_build.test.ts` (+2 tests, +1 existing test updated,
  see §14): a named-parameter method refuses via TWO independent paths (named-argument syntax, and —
  found by mutation testing, see §14 — the method-eligibility path alone, when the named parameter is
  simply omitted from a particular call).
- `dart/bridge_analyzer/test/extraction_test.dart` (+2 new tests, +1 existing test moved to positive):
  optional-with-default now resolves a target; optional-without-default still does not; the pre-existing
  named-parameter exclusion test is unchanged and still passes.

## 13. Fixtures updated (not merely extended)

- `fixtures/apps/method_call_refusal/`: `Model.multiply`'s own second parameter moved from
  `[int bonus = 0]` (the OLD excluded shape, now eligible under ADR-0043) to `[int? bonus]` (optional
  WITHOUT a default, the one optional-parameter shape still excluded) — preserving this test's ORIGINAL
  intent (a positional call refusing via the method's own eligibility gate) rather than leaving it silently
  stale. `DependentModel.scaleUnsupported` received the identical fix for the identical reason. A new
  `NamedParamModel` class (named parameter) and its own two demos (called with and without named-argument
  syntax) were added.
- `fixtures/apps/local_store/`: `CounterStore` gained `bump([int n = 5])`, and `main.dart` gained two call
  sites (omitted, explicit) — a targeted regression fixture for the pre-existing bug §5 found and fixed.

## 14. Adversarial mutations — mutate, confirm failure, revert, confirm clean

Six cycles, one of which — genuinely, honestly — exposed a real gap in this session's OWN first attempt at
a test, closed before finalizing, per the governing brief's own explicit instruction:

1. **Reverted the full parameter-eligibility relaxation** to ADR-0039's original, narrower
   `isRequiredPositional`-only rule — caught: 1 Dart test failure, 6 TypeScript test failures.
2. **Removed only the "optional needs a default" check** — caught: 1 Dart test failure, 2 TypeScript test
   failures.
3. **Removed only the "named parameters excluded" check** — caught by the Dart-layer test
   ("a method with a named parameter is never targeted"), but **NOT** by the TypeScript fixture suite as it
   existed at the time: `NamedParamModel.scale`'s own existing demo calls it WITH named-argument syntax
   (`scale(3, bonus: 2)`), so the separate, pre-existing `refuseNamedArgs` mechanism masked the mutation
   entirely, independent of whether the method's own eligibility gate was doing its job. **A genuine
   test-coverage gap, closed before finalizing**: added `NamedParamOmittedCallOnLocal` (the identical
   method, called WITHOUT ever using named-argument syntax — `scale(3)`, the named parameter simply
   omitted) plus a new test asserting the refusal by name (`NamedParamModel`, not the bare substring
   `'scale'` — an EARLIER draft of this very test had its own false-positive bug, coincidentally matching
   `AsyncModel.scale`'s own unrelated, pre-existing refusal message elsewhere in the same fixture document;
   caught by re-running the mutation against the corrected assertion, which now genuinely fails under it).
   Re-verified: the corrected test fails under the mutation and passes once reverted.
4. **Reverted `paramListOf`'s own default-clause emission** to its pre-M10-E behavior (no `= value` text at
   all) — caught: 6 test failures across `optional_method_parameters_build.test.ts` and
   `local_store_build.test.ts` (the store/action regression).
5. **Duplicated the default-value emission** (`defaultValueOf` called twice, concatenated) — caught: 4 test
   failures, each showing a visibly wrong, duplicated default value (`bonus: number = 1010` instead of
   `= 10`) — syntactically valid TypeScript, semantically wrong, caught only by exact-string assertion.
6. **Routed the method-helper's own default-value emission through a scope that bypasses this attempt's
   own `hadError` flag** (`scope.report` instead of `helperScope.report`) — tested against a REAL failing
   default value (the cross-file top-level-constant case, §10), confirmed **PROTECTED BY REDUNDANT
   ARCHITECTURE, not a specific test**: the generator's own unconditional, unrelated "any error anywhere →
   zero files emitted" policy (`BRG3005`) independently guarantees no corrupted output ever reaches a
   caller, regardless of which scope's `report` callback a failure is routed through. The `hadError`/retry-
   specific routing remains the correct engineering discipline (consistent with every other attempt-scoped
   emission already in this codebase, and meaningful for a hypothetical future default-value shape that
   COULD legitimately need a retry) but is not independently, solely load-bearing for this specific,
   currently-possible failure mode — documented honestly, per the governing brief's own explicit
   instruction, rather than manufacturing an artificial test to force a false sense of coverage.

Every mutation was reverted immediately after being evaluated; `git diff`/`git status --short` at the end
of this milestone's own work show zero residue from any of the six cycles.

## 15. Silent-wrong-code audit

Actively searched for, per the governing brief's own list — nothing else found beyond what §5/§14 already
record:

- **Generated `unknown` that should have been refused**: not applicable to this milestone's own new
  surface (return-type eligibility is M10-D's own concern, unchanged here).
- **Incorrect member binding**: investigated directly — a named parameter's own binding was the one real
  gap found (§14, mutation 3), closed before finalizing.
- **Duplicated evaluation**: investigated directly (mutation 5) — real, caught.
- **Name-based identity heuristics**: none introduced — `param.isPositional`/`isOptionalPositional`/
  `hasDefaultValue` are all real `FormalParameterElement` semantic booleans, never a type-name or
  parameter-name string comparison.
- **Accidental runtime-class assumptions**: none — every helper remains a plain, standalone module-level
  function; no prototype or runtime class was introduced for a defaulted parameter.
- **Cycles that can hang instead of refusing**: unaffected — a default value cannot reference a method,
  so no new reachability edge, and therefore no new cycle risk, was introduced.
- **Reachable helpers omitted / unreachable helpers emitted**: unaffected — reachability discovery itself
  was not touched by this milestone.

## 16. Regressions

`dart test` (full suite): all tests passed, both before and after every fix, and after every mutation
revert. `pnpm exec vitest run` (full `packages/generators/react` suite): 501/501 passed. `just ci` and
`just determinism`: run in full as part of this milestone's own closing validation; results recorded in the
closing numbered report delivered alongside this document.

## 17. FlutterBridge-only boundary and `hello_bridge` drift

No Continuum reference, dependency, or naming anywhere in this milestone's own code, tests, fixtures, or
documentation. `fixtures/apps/hello_bridge/analysis_options.yaml` was never staged, committed, restored, or
modified — confirmed by `git status --short` immediately before the closing commit.

## 18. What was NOT done

M10-F was not started. No unrelated M10/M11 work was performed. No new UIR schema field, node kind, runtime
class, prototype, global mutable state, or name-based special case was introduced. Named parameters,
optional-without-default positional parameters, setters/mutable fields, static members, inheritance-based
dispatch, generic methods, generic classes, async methods, and recursive methods remain exactly as
unsupported/deferred as they were before this milestone — none of them was newly implemented, and no
existing refusal boundary for any of them was weakened.

## 19. Outcome: A — full support for the bounded subset, zero new architecture

Bounded optional positional method parameters with an explicit default value lower correctly through the
existing ADR-0038/0039/0040/0041/0042 architecture, plus a narrow extension to the parameter-eligibility
gate and one previously-unfinished generator-side rendering path. This is not Outcome B: no
representation, identity, evaluation-order, or recursion question was found unanswerable — the analyzer,
the schema, and the generator's own existing conventions already supported the bounded subset; only a
well-precedented extension, and a fix to a latent, unrelated bug it exposed, were needed. Full architectural
reasoning: ADR-0043.

## 20. Recommendation for M10-F

No further M10 capability is currently supported by the same strength of evidence this investigation
required. The next most-referenced deferred items (generic methods, recursion, async methods) are each
explicitly named NON-GOALS across every prior milestone, not "next" candidates — extending any of them
would need its own dedicated investigation into why the existing non-goal reasoning no longer holds, not
an extrapolation from this milestone's own findings. Setters, static members, and inheritance-based
dispatch remain structurally unreached, each requiring materially new extraction machinery (a mutable
structural representation; a receiver-less static-access node; a subclass-safe dispatch model) rather than
a narrow gate extension — none is "the smallest next capability" by this milestone's own selection
criteria. If a future milestone pursues one of these, it should begin with the identical discipline this
one did: a fresh reduction ladder, real analyzer/generator evidence before any implementation, and an ADR
written first.
