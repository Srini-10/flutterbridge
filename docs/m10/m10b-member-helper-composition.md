# M10-B — Member Helper Composition

## 1. Baseline

Started from `019078a` (`origin/main` == `HEAD`), the M10-A closure commit. `git status --short` showed
only the pre-existing, deliberately-untouched `fixtures/apps/hello_bridge/analysis_options.yaml` drift.
M9 is closed; M10-A is closed. This is M10-B, not a continuation of either, and does not reopen them.

## 2. Mission

Determine whether one bounded executable project-class member (a getter or a method) can truthfully call
ANOTHER bounded executable member on the SAME receiver, while preserving declaration identity, receiver
semantics, dispatch safety, reachability, recursion behavior, and deterministic module emission — and, if
proven safe, ship it.

## 3. An unplanned event: an automatic safe-commit reached `origin/main`

Partway through this milestone's own implementation, an automatic "safe commit" (`9e41a5f`) was created
and pushed — outside this session's own `git add`/`git commit` calls — capturing the in-progress Dart/TS
composition code under a non-descriptive message. Verified directly: the code changes matched exactly what
was being built (`expression_extractor.dart`, `expression.ts`, `functions.ts`, `component.ts`, `store.ts`,
`pipeline.ts`), nothing lost or corrupted. It also swept in
`fixtures/apps/hello_bridge/analysis_options.yaml` — the file every milestone this session has explicitly,
repeatedly been told never to modify, stage, restore, delete, or commit, and whose own disposition CLAUDE.md
records as still an open question, not a decision this repo has made. Flagged to the user directly; per
their own choice, reverted with a new, targeted commit (`32eb146`) restoring the file to the content the
last legitimate commit had — preserving history (no amend, no force-push, no squash), consistent with this
repo's own git conventions. `flutter analyze` was later observed to regenerate the identical drift on its
own (`just dart-analyze` printed "Upgrading analysis_options.yaml to exclude build and platform
directories") — confirming the drift is a side effect of local Flutter tooling, not a manual edit, and will
keep reappearing locally regardless; it stays excluded from every commit in this milestone the same way it
already was in every prior one.

## 4. Fresh reproduction

Reproduced live, via the real analyzer: `int quadrupled() => doubled * 2;` (method→getter, bare) already
carried a `target` at the extraction layer BEFORE this milestone (M9-L's own bare-identifier dispatch
already resolves it), but the generator had no code path to consume it — `case 'logic.Ref':`'s own
field-rewrite only matched fields, and a target that matched no field simply fell through unresolved.
`int octupled() => multiply(8);` (method→method, bare) captured a materially different gap: no `target`
at all, because a bare instance method call has no `realTarget`, so it reached UIR as `logic.Call` with an
unresolvable `callee` — structurally identical to a call to a function this generator has no model for.

## 5. Architecture decision

Option A (semantic helper dependency edges, extending the existing member-helper architecture) — selected.
Full evaluation of B (generator-discovers-from-target, folded into A), C (normalize to ordinary function
call, rejected), D (inline body, rejected), E (no composition, not selected) is ADR-0040 §2.

## 6. What shipped

- **Dart extractor**: `_thisType`/`_receiverTypeFor` reconstruct an internal receiver's own type from the
  resolved member's declaring class; `_internalMemberTarget` routes internal getter reads through the
  identical eligibility-gated `_externalGetterTarget` an external read already uses (fields stay routed
  through the broader, M9-L-established `_instanceMemberTarget`, deliberately unchanged); `_invocation`
  synthesizes a `this`-receiver `logic.MethodCall` for a bare internal method call, and routes both bare
  and explicit-`this` method calls through `_externalMethodTarget` uniformly.
- **Generator**: `case 'logic.Ref':` now resolves a bare `this` reference to the current helper's own
  `self`, and a bare getter-of-getter reference through `getterHelpers`; `PropertyAccess`'s own getter
  lookup gained the identical "target set but no helper → refuse" defense `MethodCall` already had, gated
  on a new `projectClassGetterIds` set (mirroring `projectClassMethodIds`); `reachableGetters`/
  `reachableMethods` became a single fixed-point `reachableMembers` walk (mirroring `component.ts`'s own
  `referencedActions`); the two separate getter/method emission loops became one unified retry loop
  (mirroring `emitFunctionModules`'s own top-level-function retry loop).

## 7. Two real, pre-existing bugs found and fixed before composition could be built safely

Both fixed as standalone commits ahead of this milestone's own composition work, since building
composition on top of either would have inherited and widened them:

1. **`other.count` silently rewritten to `self.count`.** `target` is pure declaration provenance — an
   external value of the identical class produces the identical target a genuine self-read would. The
   member-`self`-rewrite matched on `target` alone; fixed with `isSelfReceiver`, requiring the receiver be
   provably `this`. (`c874ef8`)
2. **A private/static/late field, read internally, reached a generated helper with no eligibility check.**
   M9-L's own field identity resolution is deliberately eligibility-agnostic (a real, correct, pre-existing
   test: a `static` field read inside a `static` method still resolves); the generator's own field-rewrite
   had no independent re-check the way the class's own type-interface-building code already does. Fixed
   with `isEligibleStructuralField`, mirroring that existing filter exactly. (this milestone, §16 below)

## 8. A third bug, found live while building composition itself

The synthesized `this`-receiver's own TYPE was built from the whole `MethodInvocation` node's own
`staticType` (the CALL's own return type) rather than the receiver's — `_instanceRef`'s existing helper
derives type from `node.staticType`, correct only for a real `ThisExpression`/`SuperExpression` AST node,
never a synthesized one. A live probe caught it: the receiver's own `type.name` was silently `int`
(`multiply`'s own return type), not `Model`. Fixed with `_thisType`'s own reconstruction, used directly
rather than through `_instanceRef`.

## 9. A fourth bug, found live: scope population ordering

`projectClassGetterIds`/`projectClassMethodIds` are only threaded onto the shared root scope AFTER
`emitFunctionModules` fully returns (`pipeline.ts`) — correct for every external consumer, but a member
helper's OWN body, emitted from WITHIN that same function, needs these sets DURING its own execution.
Reading the not-yet-populated outer scope produced literal `undefined` text in generated source instead of
a real symbol — caught via a live probe showing `return (undefined * 2);` in otherwise-correct output.
Fixed by computing both sets locally and overriding them explicitly in each member helper's own
`helperScope`, never inherited via `...scope`.

## 10. Reduction ladder — what was proven, real fixtures unless noted

| # | Shape | Result |
|---|---|---|
| 1 | Method → getter, bare | Supported |
| 2 | Method → getter, explicit `this` | Supported, identical target as bare |
| 3 | Method → method, bare | Supported |
| 4 | Method → method, explicit `this` | Supported, identical target as bare |
| 5 | One method reading both a getter and a method dependency | Supported |
| 6 | Parameter shadowing a sibling getter/method name | Parameter wins, no dependency edge |
| 7 | Explicit `this.doubled` under an identically-named parameter | Explicit member wins despite shadow |
| 8 | A→B→C transitive chain, used only via A | All three (A, B, C) become reachable |
| 9 | The identical chain shape, used only via B | B, C reachable; A never emitted (directional) |
| 10 | A member declared BEFORE its own dependency | Supported — declaration order is not a dependency order |
| 11 | Direct self-recursion (`countdown() => countdown(n-1)`) | Refused, `BRG3013`, no hang — the retry loop's own natural non-convergence, no special-casing |
| 12 | A reachable method calling an unsupported sibling (optional param) | Refused, `BRG3013` — the unsupported dependency propagates |
| 13 | A generic method dependency (`identity<int>(3)`), called internally | Never reaches the `MethodCall`/`target` shape at all — mirrors the static-call precedent |
| 14 | An async method dependency, called internally | Still resolves a `target`; the generator refuses (`BRG3013`), as it already did externally |
| 15 | A bare call to an unrelated top-level function sharing a name with an instance member | Resolves to the function, `logic.Call`, unaffected |
| 16 | `other.count` (a same-typed parameter's own field, read internally) | Correctly reads `other.count`, never `self.count` (§7.1 fix) |
| 17 | A private/static/late field, read internally by a getter/method | Refused, `BRG3013` (§7.2 fix) |

Not required and not pursued (explicitly out of this milestone's own scope): getter→getter, getter→method,
mutual recursion, cross-receiver composition (`other.multiply(4)`, already correctly handled by the
UNCHANGED external-call architecture, never routed through same-self composition), nested field-held
project-object method calls, cascade/null-aware call variants.

## 11. Schema

No UIR schema change. ADR-0040 §13.

## 12. Tests added

- `dart/bridge_analyzer/test/extraction_test.dart`: new group, 9 tests (bare-call synthesis shape,
  receiver-type-reconstruction regression, bare/explicit method-call identity, bare/explicit getter-read
  identity, generic-dependency exclusion, async-dependency target-still-resolves, static-sibling
  unaffected, parameter-shadow, determinism).
- `packages/generators/react/tests/member_helper_composition_build.test.ts`: 12 tests (no BRG1310, no
  error, method→getter both forms, method→method both forms, combined, shadow, shadow-explicit, call-site
  shape, transitive chain, directional chain, declaration-order independence, real `tsc --strict`).
- `packages/generators/react/tests/method_call_refusal_build.test.ts`: 2 new tests (recursion refusal with
  a real termination bound, reachable-unsupported-dependency propagation).
- `packages/generators/react/tests/instance_method_execution_build.test.ts`: 1 new test for the
  `other.count` fix (§7.1), added as part of that standalone commit.

## 13. Real fixtures

- `fixtures/apps/member_helper_composition` (new) — the positive composition proof, the shadowing proof,
  the transitive/directional reachability proof, and the declaration-order-independence proof.
- `fixtures/apps/method_call_refusal` (updated) — two new classes, `RecursiveModel` and `DependentModel`,
  proving recursion and reachable-unsupported-dependency refusal.
- `fixtures/apps/instance_method_execution` (updated, in the standalone `c874ef8` commit) — `Model.combineWith`
  proving the `other.count` fix.

## 14. Adversarial mutations — mutate, confirm failure, revert, confirm clean

| Mutation | What it broke | Caught by |
|---|---|---|
| Force the emission retry loop to a single pass | A method declared BEFORE its own dependency (reversed declaration order) failed | Live probe, confirmed against a real fixture; kept as a permanent regression test |
| Revert the synthesized `this`-receiver's own type to `_instanceRef(node, 'this')` | The receiver's own type became `int` (the call's own return type) instead of `Model` | The dedicated Dart regression test written for this exact fact |
| (from the standalone `c874ef8` commit) Remove `isSelfReceiver` from the field-rewrite | `other.count` was rewritten to `self.count` | `instance_method_execution_build.test.ts`'s own `combineWith` test |

Every mutation reverted; `git diff --numstat` on each touched file matched its pre-mutation baseline
exactly after reverting.

Not run (would require re-deriving already-settled M9-Q/M10-A architecture, or exercising unmodified,
already-adversarially-proven shared machinery): helper-name-only identity (unmodified `ModuleBuilder.declare`,
already proven at the getter level, ADR-0038 §5), inline-body duplication (Option D was rejected outright,
§5).

## 15. Regressions

- Dart: 548/548 (was 539/539 before this milestone; +9 new).
- TypeScript (`@bridge/gen-react`): 464/464 (was 450/450 before this milestone, +1 from the standalone
  `other.count` fix; +12 net new for M10-B itself, +1 for the retry-loop regression).
- M9-Q getter execution, M10-A method execution, M9-N field reads, M9-O/P construction, M9-M type shapes —
  unaffected; every pre-existing test in every one of those suites still passes unchanged.
- `local_store_build.test.ts` (M7-N, store method/action calls) — unaffected; `projectClassMethodIds`'s own
  M10-A-era discrimination between this capability and `_storeMemberTarget` is untouched by this milestone.

## 16. Validation

`dart analyze --fatal-infos`, `dart test`, `pnpm --filter @bridge/gen-react exec tsc --noEmit`,
`pnpm --filter @bridge/gen-react test`, `just lint`, `just lint-negative`, `just codegen-check` (zero
schema drift), `just test`, `just determinism`, real `tsc --strict` on every new/changed fixture's
generated output.

## 17. FlutterBridge-only boundary and `hello_bridge` drift

No Continuum reference introduced by this milestone's own diff. `fixtures/apps/hello_bridge/analysis_options.yaml`'s
own drift addressed explicitly in §3, above — not silently left inconsistent with the standing instruction.

## 18. Outcome

**A2 — method↔getter and method↔method composition, both bare and explicit-`this`, no recursion.**
ADR-0040 written and reconciled with ADR-0038/ADR-0039. Recursion is refused by the retry loop's own
natural non-convergence, not by a deliberate design exclusion requiring its own future removal — a future
milestone could add it by pre-reserving a helper's own name before its body succeeds, without revisiting
anything this ADR establishes. M10-C was not started; the next M10 theme (getter→getter/getter→method,
cross-receiver composition, recursion, or a different M10 capability entirely) is an open backlog item, not
a decision made here.
