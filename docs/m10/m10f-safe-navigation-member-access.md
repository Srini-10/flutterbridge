# M10-F — Bounded Safe-Navigation (`?.`) Member Access

## 1. Baseline

Started from `861bdbf` (`origin/main` == `HEAD`), the M10-E optional-positional-parameter commit.
`git status --short` showed only the pre-existing, deliberately-untouched `fixtures/apps/hello_bridge/
analysis_options.yaml` drift. M9 and M10-A through M10-E are all closed; this is M10-F, not a reopening of
any of them. Per the governing brief, no predefined next capability was assumed — the investigation began
fresh.

## 2. Mission

Conduct a fresh, evidence-driven capability inventory across the full list of currently-unsupported Dart
constructs, select exactly one bounded capability that clears a strict required/preferred bar (or,
honestly, select none), and — only if a candidate clears the bar — implement it narrowly.

## 3. Investigation — fresh capability inventory

Re-read M9-R and M10-A through M10-E and ADR-0039 through ADR-0043, revalidating their assumptions against
the CURRENT code rather than trusting their own "future migration" sections. Systematically probed the
candidate list the governing brief names: named parameters, optional-without-default parameters, generic
methods, generic project classes, async/Future, recursive methods, static members, setters, mutable fields,
inherited members, overridden members, unsupported constructors, factory/redirecting constructors,
collection-typed fields, function-typed parameters/members, nullable project-class values, top-level
variables/constants. Every one of these remains either an explicitly-named non-goal (generics, async,
recursion — repeated verbatim across every M10 ADR) or structurally unreached (setters, statics, inheritance
— no extraction path exists at all, not merely an unimplemented gate), matching M10-E's own §4 findings
exactly; nothing in this fresh pass overturned that.

The fresh evidence came from a DIFFERENT angle: a live probe of a nullable project-class VALUE — the
non-goal ADR-0042 §11 explicitly named as "a real, separate, currently-open gap" — specifically the
safe-navigation operator (`?.`) applied to it. This is not a new eligibility question about WHICH members
can be called (M10-A through M10-E's own concern); it is a question of whether an EXISTING, already-eligible
member access is represented TRUTHFULLY when the receiver may be `null`. The probe (real Flutter fixture →
real analyzer → real generator → real `tsc --strict`) found a genuine, severe, currently-shipped bug: `?.`
is silently dropped by the extractor at every position (field read, getter read, method call) — `model?.
count` extracts BYTE-IDENTICAL to unconditional `model.count`, with nothing anywhere in the UIR recording
that `?.` was used. Full detail and reduction ladder: ADR-0044 §2–§4.

## 4. Rejected alternatives

- **Named parameters, optional-without-default parameters, generics, async, recursion, setters, statics,
  inheritance.** Re-confirmed as either explicit non-goals or structurally unreached — identical reasoning
  to M10-E §4, no new evidence changes it.
- **Nullable method parameters/return types as plain values, broadly.** ADR-0042 §11's own non-goal is
  broader than what this milestone needed: the actual, reachable, currently-broken gap is specifically the
  safe-navigation RECEIVER-dispatch-safety question, not every possible use of a nullable value. Narrowing
  to that specific question is what kept this bounded (ADR-0044 §20).
- **Also fixing the unguarded-nullable-receiver case.** Investigated and found NOT reachable: Dart's own
  sound null safety already makes `model.count` (unguarded, `model: Model?`) a compile error, caught by the
  pre-existing `BRG1310` analyzer-error gate before extraction ever runs — there is no valid Dart program
  this milestone would additionally need to guard against (ADR-0044 §19).

## 5. Selected capability: bounded safe-navigation (`?.`) member access

A null-aware property/method access (`model?.count`, `model?.doubled`, `model?.multiply(3)`) on a **bare
reference receiver** — a parameter, a local variable, or a field-backed getter (component prop or `self`'s
own field) — lowers to a real, single-evaluation conditional matching Dart's own short-circuit semantics.
Clears every REQUIRED gate (ADR-0044 §5–§18): truthful UIR representation, no unsafe dynamic-dispatch
inference (nullability is orthogonal to the existing subclass-exclusion check), no invented runtime
behavior, a bounded eligibility predicate on resolved analyzer semantics (`isNullAware` +
`isOriginVariable`/parameter-or-local), preserved evaluation order, honest `BRG3013` refusal outside the
subset, no `any`/`unknown` escape, no Continuum dependency, no speculative whole-program inference. Also
clears the STRONG PREFERENCE: the entire fix reuses three pre-existing, already-implemented UIR node kinds
(`logic.Conditional`, `logic.Binary`, `logic.Lit`) and one pre-existing eligibility distinction
(`GetterElement.isOriginVariable`, ADR-0033) — zero schema change, zero generator change.

## 6. Two adjacent forms confirmed already correct, zero gap

The same reduction ladder confirmed null-assertion (`model!.count`) and flow-promoted access (`final m =
model; if (m != null) { m.count; }`) both already lower correctly today, with zero changes needed — the
analyzer's own type promotion and TypeScript's own control-flow narrowing already handle them. Full detail:
ADR-0044 §2.

## 7. ADR written before implementation

`docs/adr/0044-bounded-safe-navigation-member-access.md` was written and committed to the working tree
BEFORE any production code changed.

## 8. Implementation — what changed

Entirely inside `dart/bridge_analyzer/lib/src/session/extract/expression_extractor.dart` — zero UIR schema
change, zero generator change (`packages/generators/react` production code untouched):

- New `_isSafeToDuplicateNullAwareReceiver(Expression target)`: true only for a `SimpleIdentifier` resolving
  to a `FormalParameterElement`/`LocalVariableElement`, or a `GetterElement` with `isOriginVariable == true`.
- New `_nullLiteral`/`_nullAwareGuard` helpers synthesizing a `logic.Lit` (`null`) and a `logic.Binary`
  (`!=`) guard, each using a hand-built minimal `TypeRef` (`{'name': 'Null'}`, `{'name': 'bool', 'library':
  'dart:core'}`) — an already-established pattern for synthesized nodes with no real AST node to ask.
- `_propertyAccessOn`/`_methodCallOn`: factor out the ORIGINAL (pre-M10-F) node-building logic unchanged,
  now gated by a `suppressTarget` flag (via Dart 3's `case ... when` pattern-guard syntax, since `&&` cannot
  combine with a bare `case` sub-expression).
- The `PropertyAccess`/`MethodInvocation` extraction sites: when `isNullAware` is true and the receiver
  qualifies (§5), synthesize `logic.Conditional { test: <guard>, then: <the ordinary access>, otherwise:
  <null>, type: <the node's own nullable static type> }`; when the receiver does NOT qualify, the access is
  still extracted (so name/argument shapes stay visible to tooling) but `target` is withheld — routing
  through the pre-existing M9-J `BRG3013` refusal, no new diagnostic code.
- `dart analyze --fatal-infos` clean throughout, including after every mutation revert.

## 9. Eligibility boundary

A null-aware receiver is eligible when it is a bare `SimpleIdentifier` resolving to a true parameter/local,
or a field-backed getter (`isOriginVariable`) — never a genuine (computed) getter, a method call, or a
constructed value, even though every getter in this bounded model is provably side-effect-free. This
deliberately honors the project's pre-existing "receiver evaluated exactly once, no exceptions" discipline
rather than carving out a convenience exception. Full reasoning: ADR-0044 §5/§19.

## 10. Generated TypeScript shape

`((props.model !== null) ? props.model.count : null)`, `((props.model !== null) ? Model_doubled(props.model)
: null)`, `((props.model !== null) ? Model_multiply(props.model, 3) : null)` — a plain TypeScript ternary
over the SAME helper calls/field reads the non-null-aware path already produces.

## 11. Evaluation-order / reachability / cross-file / dynamic-dispatch / recursion implications

**Evaluation order**: the receiver is evaluated in the guard before the access or its arguments; arguments
are extracted INSIDE the `then` branch, so they are correctly never evaluated when the receiver is null —
Dart's own short-circuit semantic, achieved by nesting, no special-casing. **Reachability**: unaffected — the
wrapped access participates in the identical fixed-point discovery/emission as an unconditional one.
**Cross-file**: unaffected — ADR-0041 §3's transitive class-type-reachability fixed point already covers a
nullable field/return type identically to a non-nullable one; confirmed via the fixture's own `OtherModel?`
case, no `unknown` anywhere. **Dynamic dispatch**: unaffected — `_dispatchSafeReceiverClass`'s subclass
exclusion is orthogonal to nullability (Dart encodes nullability as a suffix on the same `InterfaceType`,
not a distinct type). **Recursion**: unaffected — a null-aware access through a self-/mutually-recursive
chain still refuses via the identical, unmodified "target set but no helper" path. Full detail: ADR-0044
§9–§17.

## 12. Real fixture: `fixtures/apps/safe_navigation_member_access/`

Built through the real pipeline (`lib/model.dart`, `lib/other_model.dart`, `lib/main.dart`), proving seven
reduction-ladder rungs: R1 smallest positive case (single field read); R2 multiple independently-guarded
accesses (field, getter, method call with/without an M10-E optional-default argument) in one expression; R3
safe navigation on a local bound to a nullable prop; R4 composition with M10-B's internal member-composition
mechanism (`quadrupled` calling `doubled` internally, unaffected by how `quadrupled` itself is reached); R5
a nullable cross-file-typed receiver; R6 composition with `??`; R7 shadowing — `Model.describe`'s own
parameter is named identically to the class's own `doubled` getter, safe-navigated INSIDE a method helper's
own body, proving the guard reads the shadowing parameter, never re-targets the getter of the identical
name. Every component passes real `tsc --noEmit --strict`. `.manifest.json` deliberately not committed,
matching the M10-C/D/E fixture convention.

Negative controls and refusal cases live in the EXTENDED `fixtures/apps/method_call_refusal/`: a safe-
navigated CONSTRUCTED/CALLED receiver (`maybeNavModel()?.count`) and a safe-navigated bare reference
resolving to a GENUINE (non-field-backed) getter (`NavModel.describeBuilder`'s own `builder?.doubled`) —
both refuse honestly as `BRG3013`.

## 13. Tests added

- `dart/bridge_analyzer/test/extraction_test.dart` (+5 tests, new group `bounded safe-navigation member
  access provenance (ADR-0044, M10-F)`): field-read and method-call safe navigation on a bare parameter both
  lower to `logic.Conditional` with the correct `test`/`then`/`otherwise` shapes; a constructed/called
  receiver never resolves a `target` and is never synthesized as a conditional; a bare reference to a
  genuine getter never resolves a `target`; a local bound to a nullable parameter also lowers correctly.
- `packages/generators/react/tests/safe_navigation_member_access_build.test.ts` (new, 10 tests): BRG1310
  absence, zero-error generation, real `tsc --strict`, and one exact-string test per reduction-ladder rung
  (R1–R7).
- `packages/generators/react/tests/method_call_refusal_build.test.ts` (+2 tests): the two refusal cases in
  §12, each asserting the exact `BRG3013` diagnostic and `files === []`.
- `packages/generators/react/tests/support.ts` (+1 helper): `safeNavigationMemberAccessRaw()`, mirroring the
  existing per-fixture raw-document helper pattern.

## 14. Adversarial mutations — mutate, confirm failure, revert, confirm clean

Six cycles; every mutation was reverted immediately after evaluation, `git diff`/`git status --short`
confirm zero residue:

1. **Removed the "safe to duplicate" eligibility check entirely** (admit any receiver, including a
   call/construction) — caught: Dart-layer test failure (constructed-receiver test now wrongly resolves a
   `target`) and a TypeScript-layer regression (`method_call_refusal_build.test.ts`'s constructed-receiver
   refusal test failed — the call was silently duplicated instead of refusing).
2. **Replaced the `isOriginVariable`-based field/getter distinction with a name-based one**
   (`target.name.startsWith('_')`) — first attempt (`target.name != 'builder'`) coincidentally still
   excluded the fixture's own getter (named `builder`), producing a false "not caught" result; revised to
   `!target.name.startsWith('_')`, which correctly admitted the getter and WAS then genuinely caught (1 Dart
   test failure: the genuine-getter test now wrongly resolves a `target`).
3. **Removed `isNullAware` detection entirely** (regress to the pre-ADR bug) — caught: all 5 new Dart tests
   failed (no `logic.Conditional` synthesized anywhere), plus multiple `safe_navigation_member_access_build
   .test.ts` exact-string failures.
4. **Duplicated the receiver a third time** in the synthesized node (extracted `target` a third,
   unused time) — confirmed harmless by construction: the extra extraction produces an unused, orphaned
   `RawNode` with its own deterministic NodeId, never referenced by any field of the emitted `logic.
   Conditional`, so it is never reachable and never emitted — not caught by any test (nothing observable
   changes), documented honestly here rather than manufacturing a test for it.
5. **Swapped `test`/`then` order** (guard checks `== null` and returns the access, else `null` — inverted
   ternary) — caught: every exact-string assertion in `safe_navigation_member_access_build.test.ts` failed
   (`(props.model === null) ? props.model.count : null` — semantically inverted, a real bug a loose
   `.toContain('Conditional')`-style test would have missed).
6. **Routed the null-aware guard's own receiver extraction through a scope that bypasses the enclosing
   method-helper attempt's `hadError` flag** (`scope.report` instead of the attempt-scoped one) — tested
   against the genuine-getter refusal case (§12): confirmed **PROTECTED BY REDUNDANT ARCHITECTURE, not a
   specific test** — the generator's own unconditional "any error anywhere → zero files emitted" policy
   (BRG3005) independently guarantees no corrupted output ships, regardless of which scope's `report`
   callback a failure routes through. Documented honestly per the governing brief's own instruction rather
   than manufacturing an artificial test.

No mutation exposed a genuine test-coverage gap requiring a new test to be added (mutation 2's initial false
result was a flawed MUTATION, not a flawed test — corrected before re-running, not treated as a coverage
gap).

## 15. Silent-wrong-code audit

Actively searched, per the governing brief's own list:

- **`?.` silently dropped, reaching `tsc` with zero diagnostic**: this IS the bug this milestone fixes
  (§3/ADR-0044 §2) — confirmed closed by the fixture's own real `tsc --strict` pass (§12) and the negative
  controls' honest `BRG3013` refusal (§12).
- **Unexpected `unknown`**: none — confirmed directly in the cross-file test (R5,
  `not.toContain('unknown')`).
- **Duplicated/reordered evaluation**: investigated directly (mutations 4/5, §14) — the harmless
  third-duplicate case is documented, not silently ignored; the order-inversion case is real and caught.
- **Mis-bound receiver / shadowing**: investigated directly (R7, §12) — the guard correctly reads the
  shadowing parameter, never the getter of the identical name.
- **Bypassed refusal boundary**: investigated directly (§12 negative controls, mutations 1/2) — a
  constructed/called receiver and a genuine-getter receiver both refuse honestly; no eligibility gate from
  M10-A through M10-E was broadened.
- **Dangling documentation reference**: found during this audit — a comment in
  `safe_navigation_member_access_build.test.ts` cited a `safe_navigation_regression.test.ts` file for
  "before/after proof" that was never actually created (the before/after evidence lives in ADR-0044 §2's
  live-probe record instead). Fixed: the comment now points to ADR-0044 §2 directly rather than a
  nonexistent file. A documentation-only defect, not a code-correctness one, but left uncorrected it would
  have misled a future reader searching for evidence that does not exist on disk.
- **Reachable helpers omitted / unreachable helpers emitted**: unaffected — reachability discovery itself
  was not touched.

## 16. Regressions

`dart test` (full suite): all tests passed, both before and after every fix, and after every mutation
revert. `pnpm exec vitest run` (full `packages/generators/react` suite, 55 test files / 513 tests before
this milestone's own two new/extended files, 56 files after): all passed. `just ci`: full local gate,
exit 0 — build, typecheck, test (559 Dart tests + full TS suite including the new
`safe_navigation_member_access_build.test.ts` and extended `method_call_refusal_build.test.ts`),
codegen-check, lint, lint-negative, uir-lint, uir-test, analyzer-lint, analyzer-test, dart-analyze (including
`hello_bridge`, clean, untouched). `just determinism`: run as part of this milestone's own closing
validation; result recorded in the closing numbered report.

## 17. `bridge validate` — fixed-point/determinism proof

Run against the real generator build (`pnpm --filter @bridge/gen-react run build` first, to avoid a stale
`dist/`) from within `fixtures/apps/safe_navigation_member_access/`: `deterministic = true` (two runs over
the same input agree), `fixed point = true` (`normalize(normalize(x)) == normalize(x)`).

## 18. FlutterBridge-only boundary and `hello_bridge` drift

No Continuum reference, dependency, or naming anywhere in this milestone's own code, tests, fixtures, ADR,
or this document. `fixtures/apps/hello_bridge/analysis_options.yaml` was never staged, committed, restored,
or modified by this milestone's own work — confirmed by `git status --short` immediately before the closing
commit; it is excluded from staging explicitly.

## 19. What was NOT done

No new UIR schema field, node kind, runtime class, prototype, global mutable state, or name-based special
case was introduced. Chained safe navigation whose inner link is not a bare reference
(`model?.next()?.count`), a safe-navigated call/construction receiver, a safe-navigated genuine-getter
receiver, collection-typed fields, function-valued fields, setters, named parameters, generic methods/
classes, async/recursion all remain exactly as unsupported/refused as before this milestone — none newly
implemented, no existing refusal boundary weakened. No M10-A through M10-E eligibility gate was broadened.

## 20. Outcome: A — full support for the bounded subset, zero new architecture

Bounded safe-navigation member access on a bare reference receiver lowers correctly through the existing
UIR node kinds with a narrow, well-precedented extraction-layer extension. Not Outcome B: no representation,
identity, evaluation-order, dynamic-dispatch, or recursion question was found unanswerable — the analyzer's
own already-resolved `isNullAware` facts and the schema's own pre-existing `logic.Conditional`/`logic.
Binary`/`logic.Lit` node kinds already supported the bounded subset; only the extraction-side synthesis, and
the reuse of an existing eligibility distinction (`isOriginVariable`), were needed. Full architectural
reasoning: ADR-0044.

## 21. Recommendation for M11

No further capability in the M10-F investigation's own candidate list clears the same strength of evidence
this milestone required. The remaining named-but-deferred items — chained safe navigation past a non-bare
inner link, a safe-navigated call/construction receiver via a synthesized temporary, setters/mutable fields,
static members, inheritance-based dispatch, generic methods/classes, async, recursion — each requires either
a materially larger lowering mechanism (a synthesized temporary/IIFE, never used anywhere in this codebase)
or new extraction machinery this codebase structurally lacks (a mutable representation, a receiver-less
static-access node, a subclass-safe dispatch model), not a narrow gate extension. If a future milestone
pursues one of these, it should begin with the identical discipline this one did: a fresh reduction ladder,
real analyzer/generator evidence before any implementation, and an ADR written first.
