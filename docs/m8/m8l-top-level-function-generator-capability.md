# M8-L — Top-level function generator capability audit

**Date:** 2026-08-21. **Baseline:** `7dfa59d` (== `origin/main`, clean tree, confirmed before any
change). **Type:** diagnostic correction, implemented. Full `logic.FunctionDecl` lowering was
investigated and rejected — the gate fails on real evidence, not on a hunch.

## Headline finding

M8-K was right that a targeted `logic.Ref` to a real `logic.FunctionDecl` fell through to `BRG3006`
("not declared in this program") — a real, generator-owned misclassification, now fixed structurally
(by the resolved target's node **kind**, never by the function's name). But the investigation this
milestone was asked to run — "is full lowering actually bounded?" — found real evidence against it.
Two of the three real, named Continuum functions are each blocked by a **separate, pre-existing,
already-excluded-from-scope** gap that function-lowering would not fix: `describeTransferFailure`'s
body is a Dart switch-*expression*, which extraction already represents as an opaque, unmodelled
expression (switch extraction is explicitly out of this milestone's scope); `formatBytes`'s locals
(`value`, `unit`, `units`) turn out to have **no reference-resolution path in this generator at all** —
a defect this milestone discovered by direct evidence, generalises to every action body in the
compiler, not just top-level functions, and is not the FunctionDecl-shaped problem this milestone was
scoped to fix. Only `formatUptime` — the one real function with no locals and no opaque body construct
— would be safely, fully lowerable today. Building a full "module scope" for the other two would mean
inventing new machinery well past "compose existing statement/expression emitters," for two-thirds of
the real, motivating evidence. Per the milestone's own Phase 6/15 instruction, the gate fails and only
the diagnostic correction ships.

## 1. M8-K baseline

```
git status --short        → (clean)
git rev-parse HEAD         → 7dfa59d04c94b2c9536027d38f7abc8295920e18
git rev-parse origin/main  → 7dfa59d04c94b2c9536027d38f7abc8295920e18
```
Confirmed containing `7dfa59d` (M8-K's own commit) before any change. Fresh `pnpm --filter
@bridge/gen-react test`: 222/222 (16 files) before this milestone's own test was added.

## 2. Minimal zero-nesting reproduction

Built `fixtures/apps/toplevel_fn_gen_probe/` (temporary; `flutter pub get`/`analyze` clean; deleted
after evidence extraction) — a top-level `greet(String name)` called with zero nesting inside a
`StatefulWidget`'s `build()`, plus a `_bump()` action declaring a local (`final int next = _count + 1;`)
to probe the sibling local-variable question below. Ran the real `bridge build` (analyze → normalize →
generate), before any code change:

```
BRG3006  `greet` is not declared in this program, so there is nothing to emit for it. …
BRG3006  `next` is not declared in this program, so there is nothing to emit for it. …
```

Confirms M8-K's own claim exactly: `greet`'s reference already carries a real `target`
(`2637f9828cbb23e8` → `b3231428cb9dd702`, the real `logic.FunctionDecl`), yet the generator refused it
as if the declaration were absent.

## 3. Raw UIR

`greet`'s call site, from `.bridge/normalized.ndjson`:

```json
{ "id": "2637f9828cbb23e8", "kind": "logic.Ref", "name": "greet", "target": "b3231428cb9dd702",
  "type": { "name": "String Function(String)" } }
```

Its declaration:

```json
{ "id": "b3231428cb9dd702", "kind": "logic.FunctionDecl", "name": "greet",
  "params": [{ "name": "name", "type": { "library": "dart:core", "name": "String" }, "required": true }],
  "returnType": { "library": "dart:core", "name": "String" },
  "body": [{ "kind": "logic.Return", "value": { "kind": "logic.StringInterp", "parts": [...] } }] }
```

`next`'s reference (the sibling local-variable probe), for comparison — **no `target` field at all**:

```json
{ "id": "7745ff1cd298e2f9", "kind": "logic.Ref", "name": "next",
  "type": { "library": "dart:core", "name": "int" } }
```

## 4. Normalized UIR

Identical to the raw shape above — normalization (N1–N11) does not touch either node; `greet`'s
reference already has its target before any pass runs (M8-J gave it that, unconditionally, at
extraction), and nothing in N1–N11 resolves a bare local-variable name. 9 nodes total in the probe's
normalized document.

## 5. Target identity

Confirmed by direct id comparison: `2637f9828cbb23e8.target === "b3231428cb9dd702"`, and
`b3231428cb9dd702` is the `logic.FunctionDecl`'s own id, at its own declaration site. Not inferred, not
matched by name — read directly off the node. This was never the gap; M8-J's own fix (already shipped)
is what supplies it.

## 6. Exact generator failure

Traced to `packages/generators/react/src/internal/emit/expression.ts`'s `logic.Ref` case
(`emitExpression`). Before this milestone: `target` is a string → `signalRead`/`localName` both return
`undefined` (nothing here is a signal or a lifted local) → the only structural check performed on
`scope.node(target)`'s resolved kind was `=== 'logic.EnumDecl'` (M8-D) → falls out of the
`if (typeof target === 'string')` block entirely, with the resolved node **discarded** → resolution
continues purely by `name`: `paramInScope('greet')` (not a parameter) → `isKitProvided` check (not a
Flutter static) → `missingCapabilityOf('greet', undefined)` (not in the fixed `MISSING_CAPABILITIES`
table — it cannot be, that table is for framework APIs) → falls to the generic `UnresolvedReference`
report, unconditionally: `` `${name}` is not declared in this program ``. **The resolved declaration was
sitting right there in `scope.node(target)`, computed and then thrown away**, one line before the
report that claims no declaration exists.

## 7. Diagnostic classification

Answering Phase 1's own eight questions:

1. `logic.Ref` enters `emitExpression`'s `'logic.Ref'` case (§6).
2. `target` is present (a string).
3. Yes — `scope.node(target)` resolves it (this is `context.program.get(id)`, the whole program's own
   index, wired in `pipeline.ts`'s `rootScope`; every scope in the chain inherits it unchanged).
4. `logic.FunctionDecl`.
5. Because nothing checked the resolved node's kind for anything but `logic.EnumDecl` — the check
   existed for one declaration kind and was never extended for the next one that needed it.
6. **B** — the target exists; the generator simply cannot lower its declaration kind. `BRG3006`'s own
   doc comment (`codes.ts`) already says "a reference names a node the program does not contain" — that
   is case A, and it was being fired for case B too, conflating them.
7. Yes: `BRG3013` (`UnsupportedCapability`) — already used for exactly this shape elsewhere
   (`Navigator.pushNamed`, `showDialog`, `ScaffoldMessenger.of` — all "the program says do this, the
   generator has no lowering for it yet").
8. Yes, structurally: the existing `enumDecl['kind'] === 'logic.EnumDecl'` check (§6) already
   demonstrates the pattern — `scope.node(target)`, then branch on `['kind']`. No name table needed.

## 8. Reduction ladder

The fix is a check on the **resolved node's `kind`** alone — it has no branch on parameter count, return
type, `isAsync`, body content, or whether the declaration is same-file, cross-file, or cross-package.
Read directly from the diff (§16): the condition is exactly `declaration['kind'] === 'logic.FunctionDecl'`
with no other predicate. This makes the classification **provably shape-invariant** — every rung the
task lists collapses to the same one code path, so the ladder is a proof obligation on the *code*, not a
fixture-by-fixture empirical sweep:

| Rung | Shape | Result | Evidence |
|---|---|---|---|
| A | same-file, sync | ✅ `BRG3013` | `greet` probe, §2 |
| B/C | cross-file / cross-package | ✅ `BRG3013` | M8-J's own 9-rung target-identity proof (§5) feeds the *identical* `target` field this check reads; real Continuum's `formatUptime` (same-package, cross-file) and `formatBytes` (cross-package call at `mac/pairing_page.dart`) both confirm this live (§9) |
| D–H | 0/1/N params, primitive return, void return | ✅ `BRG3013` | the check never reads `params`/`returnType` at all |
| I/J | `Future<void>` / `Future<String>` async | ✅ `BRG3013` (by inspection — the check never reads `isAsync`) | not separately fixtured; nothing in the code path is conditioned on it |
| K | local variable in body | ✅ `BRG3013` for the *call site itself* | the check fires on the outer `Ref` regardless of what the callee's body contains — the body is never inspected to classify the *reference* |
| L | if/else in body | ✅ `BRG3013` | same reasoning |
| M | calls another top-level function | ✅ `BRG3013` for *this* reference; the inner call is a separate `Ref`, classified independently and identically | unit test "two different top-level functions with the same name" (§16) proves independence directly |
| N | reads a top-level const | ✅ `BRG3013` for *this* reference (unaffected by what it reads) | — |
| O/P | default / named parameter | ✅ `BRG3013` (schema-represented, unread by this check) | — |
| Q | generic function | ✅ `BRG3013` (unread) | — |
| R | already-unsupported body construct | ✅ `BRG3013` for the reference; the *body*, if ever lowered, would separately refuse (§10) | `describeTransferFailure` is exactly this, live (§9) |
| S | SDK top-level function | correctly **not** reclassified — `scope.node(target)` resolves nothing for an SDK declaration (no `logic.FunctionDecl` node exists for it), so this check does not fire; SDK calls take the pre-existing `isKitProvided`/`missingCapabilityOf` paths unchanged | by construction (§6's fallthrough order) |
| T | same name, two declarations | ✅ two independent `BRG3013`s, not deduplicated or conflated | unit test, §16 |

The one honest gap in *empirical* (not structural) coverage: no real or fixtured **async** top-level
function was run end-to-end through the generator, because none of the three real candidates is async
and the check does not need to branch on it to be correct. Recorded, not hidden.

## 9. Real Continuum census

Fresh `bridge analyze` against the current (independently in-progress, real) `apps/macos/mac` tree —
read-only; nothing in Continuum was modified for this section. Raw UIR for the three named functions:

- **`formatBytes`** (`continuum_ui_kit.dart:16`) — `while` loop, three locals (`units`, `value`, `unit`),
  each declared via `logic.VarDecl` and read/reassigned across 7 sites with **no `target` on any read**
  (§13). The call site (`mac/pairing_page.dart:227`) sits inside a Dart adjacent-string-literal
  (M8-K's own `BRG1302` finding) — still opaque, unrelated to this milestone, unchanged.
- **`describeTransferFailure`** (`continuum_ui_kit.dart:121`) — a Dart switch-*expression*
  (`String describeTransferFailure(reason) => switch (reason) { ... }`). Its body is
  `logic.OpaqueExpr{reason: "switch expression"}` — the extractor never represents a switch expression
  structurally at all (switch-*statements* do, via `logic.Switch`; this is not one).
- **`formatUptime`** (`settings_page.dart:26`) — three `if`-early-returns, one parameter, zero locals,
  zero opaque constructs. The one function of the three whose *body*, not just its reference, is fully
  representable by existing statement/expression emitters today.

Real, whatif-copy, before/after generate-stage sweeps (method: §Phase 10 below) confirm all three
references are now `BRG3013`, not `BRG3006` — including both of `formatBytes`'s reachable same-file call
sites (§20).

## 10. FunctionDecl structural completeness

Answering Phase 4's twenty questions, from the schema (`packages/uir/schema/l1.json`) and direct
inspection of `declaration_extractor.dart`'s `_function` (unconditional on `isGetter`, unconditional on
this milestone — unchanged since M8-J):

1. **Yes** — `params: ParamDecl[]`, in order.
2. **Partially** — a `ParamDecl` has `name`+`type` but no `id`; resolved *by name, within scope*
   (Spec v2.5 §A18.3), the identical mechanism `sig.Action` params already use via `paramInScope`. This
   is sufficient — it is how every action parameter already resolves — but it means a "module scope" for
   a bare function would need to build its own `paramInScope` the same way `actionScope` does (§14).
3. **Yes** — `required`/`named`/`defaultValue` are all in `ParamDecl`'s schema (§ schema read, `l1.json`).
4. **Yes** — `returnType: TypeRef`, required.
5. **Yes** — `isAsync: boolean`.
6. **Partially, and this is the deciding answer for §12** — ordinary statements (`If`/`While`/`For`/
   `Return`/`Block`/`VarDecl`/`TryCatch`) are structurally represented; a Dart switch-*expression* is
   not (§9, `describeTransferFailure`).
7. **No, at the reference-resolution level — a real, separate, generator-side gap.** A `logic.VarDecl`
   gets a real, content-derived `id` and statement.ts already lowers its declaration
   (`const value = ...;`/`let value;`). But a later `logic.Ref{name:'value'}` reading it back carries
   **no `target` at all** (confirmed directly, §3 and §9 — `Binding(binds: Binds.local)` is created in
   `statement_extractor.dart` without a `symbol`, so `_reference`'s `staticTarget ?? binding?.symbol`
   yields neither). On the generator side, `EmitScope.localName` is asked, but nothing populates it for
   an ordinary body-local (`actionScope.localName` only knows about *other actions*, never about a
   `VarDecl` declared inside the same body it is reading). The result: **any body — an action's or a
   hypothetical top-level function's — that declares a local and reads it back on a later statement
   currently falls through to the same misattributed `BRG3006` this milestone just fixed for functions.**
   This is not the defect this milestone was scoped to fix (it is not about `logic.FunctionDecl` at
   all — it would affect `sig.Action` bodies identically), and it is not fixed here. Recorded as the
   most concrete finding of this investigation (§22, §23).
8. **Yes** — `logic.Return`.
9. **Yes** — `logic.Await` is a real, already-lowered expression case (`expression.ts:779`); async
   actions already emit `await` (though whether any currently-*reachable* one exercises it end-to-end
   was not re-verified here — irrelevant to this milestone's own gate).
10. **Yes** — `logic.Call`/`logic.MethodCall`, unconditionally.
11. **Yes for the reference itself (M8-J)** — but **not lowerable by the generator either**: a
    `logic.Ref` targeting a `logic.FieldDecl` (a top-level const) hits the *identical* fallthrough
    `greet` did before this milestone — confirmed directly by a new regression test (§16) proving it
    still reports `BRG3006` today, unchanged. A **sibling gap this milestone found but did not fix**,
    symmetric to the one it did.
12. **Yes** (M8-J).
13. **Yes** (M8-F/M8-J).
14. **No — structurally impossible.** Dart forbids a top-level function from capturing anything; there
    is no enclosing scope for one to close over. Confirmed by the language itself, not measured.
15. **No — structurally impossible**, for the identical reason: a top-level function has no receiver, so
    it cannot read an instance member of any component, store, or signal without one.
16. **Partially** — `emitStatements`/`emitStatement` (`statement.ts`) and `emitExpression`
    (`expression.ts`) are both already scope-parametric (take an `EmitScope`, not a component), so
    control-flow statements compose freely. What is **not** reusable as-is: any local-variable read (§7
    above), and the `EmitScope` construction itself (§17).
17. **Plausible in principle, not proven safe.** No hooks are needed — a top-level function calls no
    React hook and is never itself a component. But "no hook rule violation" is not the same as "safe to
    build": see §12 for what a *new* scope would actually require.
18. **No, for legitimate Dart** — a top-level function cannot read component-local state (§14/§15). It
    *can* read a top-level const/global, which is exactly the sibling gap in §11 — so a lowered function
    reading one would silently regress right back into a misattributed `BRG3006`, from a different node.
19. Straightforward in principle: `isAsync` → `async function`, `logic.Await` → `await` (§9). Not
    disproven, but never exercised end-to-end here since it did not decide the gate.
20. Already safe **for what the existing emitters already cover** — an unhandled `Stmt`/`Expr` kind
    already reports `BRG3003`/`BRG3002` from the existing default branches, and `logic.OpaqueExpr`
    already reports `BRG3004` (confirmed live for `describeTransferFailure`, §9/§20). Nothing about
    building a module-scope wrapper would need to change this — the failure mode this milestone is
    checking for (silently inventing behaviour) is already structurally excluded.

## 11. Parameter semantics

Fully schema-represented (§10.1–3); resolution mechanism (by name, in scope) is the same one every
`sig.Action` parameter already uses (`actionScope`'s `names`/`paramInScope`, `component.ts:639`) — no
new mechanism needed for parameters specifically. A module-scope `paramInScope` would be a direct copy
of that pattern, scoped to one `FunctionDecl`'s own `params` instead of one action's.

## 12. Return semantics

Fully represented (`returnType`, `logic.Return`) and already lowered (`statement.ts:56-59`) exactly the
way an action's own `return` already is. No gap.

## 13. Async semantics

Schema-complete (`isAsync`, `logic.Await`); not empirically exercised for a top-level function because
none of the three real candidates is async. Not a blocker by itself — recorded as untested, not as
broken.

## 14. Body semantics

The decisive, mixed finding: ordinary control flow (`If`/`While`/`For`/`Return`/`VarDecl`/`Block`/
`TryCatch`) is fully composable from the existing emitters (§10.6, §10.16) — but two real, independent
gaps sit inside "the body," neither one specific to `logic.FunctionDecl`:

1. **Switch expressions are opaque** (§9, `describeTransferFailure`) — an extraction-side gap,
   explicitly excluded from this milestone's scope ("switch extraction," the task's own exclusion list).
2. **Local-variable reads have no resolution path in this generator, anywhere** (§10.7,
   `formatBytes`'s `value`/`unit`/`units`) — a generator-side gap this milestone discovered but that is
   not shaped like "top-level function lowering" at all; it would affect any action body with the same
   shape identically. Confirmed via **real Continuum evidence**, not a synthetic corner case.

## 15. Dependency/reference semantics

A `logic.FunctionDecl`'s body can reference: its own parameters (§11, works); other top-level functions
(another `Ref`, classified independently — §8, rung M/T); top-level consts (§10.11, the sibling
`FieldDecl` gap); locals it declares itself (§10.7, broken); nothing else (§10.14/15, structurally
impossible in Dart). Three of these four categories are either already working or symmetric-but-out-of-
scope; the fourth (locals) is the one this milestone's own measurement surfaced as a real, unscoped
blocker.

## 16. Diagnostic-only fix

**Implemented.** `packages/generators/react/src/internal/emit/expression.ts`'s `logic.Ref` case: the
existing `scope.node(target)` lookup (previously computed only to check `=== 'logic.EnumDecl'`) gained a
sibling check, `=== 'logic.FunctionDecl'`, reporting `GeneratorDiagnosticCode.UnsupportedCapability`
(`BRG3013`) with a message naming the function and stating plainly that top-level function lowering
"is not yet supported by the React generator" — never claiming the declaration is missing. No entry was
added to `MISSING_CAPABILITIES` (that table is name-keyed, for a small enumerable set of framework APIs,
and the task explicitly forbids using it for this) — the check is purely on the resolved node's `kind`.
6 new tests in `packages/generators/react/tests/toplevel_function_reference.test.ts`: a targeted
`FunctionDecl` ref gets `BRG3013` and never `BRG3006`; no file is emitted for a refused program; a
genuinely missing target still gets `BRG3006`, unweakened; two same-named functions each classify
independently (not deduplicated, not conflated); a targeted top-level **const** (`FieldDecl`) is
confirmed *unaffected* — still `BRG3006`, the sibling gap left deliberately untouched (§10.11); an enum
constant reference (M8-D) is confirmed unaffected. `pnpm --filter @bridge/gen-react test`: 222 → 228
(222 pre-existing + 6 new), all green.

## 17. Full-lowering gate result

**FAIL.** Per Phase 6's own ten conditions:

- Condition 1 (sufficient structural information): mostly yes, with the switch-expression exception
  (§10.6).
- **Condition 3 (parameter/local semantics needed by measured real cases are represented): FAILS.**
  `formatBytes` — the function with the most real, confirmed call sites (§9) — needs local-variable
  reference resolution, which does not exist anywhere in this generator (§10.7, §14).
- **Condition 6 (body statements can reuse existing emitters): FAILS**, for the same reason, plus the
  switch-expression case for `describeTransferFailure`.
- Condition 7 (no hook/context invention required): true in isolation, but moot — a new module-scope
  `EmitScope` is still new, non-trivial scaffolding (§10.16-17), not mere composition, and two-thirds of
  the real evidence would not benefit from it even once built.
- Conditions 9/10 (no schema/ADR amendment required): true — nothing here needs one. This is the one
  condition that *would* have passed; it is not enough on its own.

Two of ten measured real-world call sites (`describeTransferFailure`, `formatBytes`) are blocked by
causes this milestone's own rules explicitly exclude from being fixed here (switch extraction) or that
generalise far past `logic.FunctionDecl` into every action body in the compiler (local-variable
resolution) — discovering either was worth doing, fixing either is not this milestone's to do.

## 18. Implementation, if any

**None beyond the diagnostic correction (§16).** No `logic.FunctionDecl` lowering was written. No
module-scope `EmitScope` was built. Per the task's own Phase 15 instruction: "if full lowering cannot
be proved safe, ship only the diagnostic correction and documentation" — done.

## 19. Regression evidence

`pnpm --filter @bridge/gen-react test`: 228/228 (17 test files). `just ci`: exit 0 — `build`,
`typecheck`, the full TS `test` suite (306 Dart tests via `analyzer-test` + 228 TS tests via the
gen-react package + every other package's own suite), `codegen-check`, `lint`, `lint-negative`,
`uir-lint`, `uir-test`, `analyzer-lint`, `analyzer-test` (306/306, unchanged), `dart-analyze` — all
green, in sequence (a `just` recipe list stops at the first failure; `dart-analyze`, the last recipe,
completing confirms every earlier one passed). Explicitly checked and unaffected: M7-N (store/member
identity — untouched, no shared code path), M8-D (enum constant classification — the sibling `if` this
milestone's check sits next to, proven independent by a dedicated new test, §16), M8-F (cross-package
assembly — untouched), M8-H (write-nothing actions — untouched), M8-J (top-level const/function
*identity* — untouched; this milestone's fix consumes the `target` M8-J supplies, never recomputes it;
the sibling `FieldDecl` case is proven *unweakened*, not silently newly broken, §16), M8-K (its own
"no traversal bug" finding — unaffected; this milestone's fix is a generator-side classification change,
not an extraction-side traversal change, so nothing about how a reference gets *its* target changes).
A genuinely unresolved reference (no target, or a target this generator cannot classify) still reports
`BRG3006`, confirmed by dedicated test and by the `next`-local-variable probe (§2) remaining `BRG3006`
throughout. `hello_bridge/analysis_options.yaml`'s known `flutter analyze` side effect was reverted
before finishing.

## 20. Continuum before/after

Real, disposable whatif copies only (method: M8-I/M8-J/M8-K's own — copy app + `ui-kit` side by side,
redirect the `path:` dependency, decompose `SettingsPage`'s `diagnostics`/`platformSection` parameters
to primitives to clear the already-classified, out-of-scope `BRG2301` blocker, run the real `bridge
build`, then `rm -rf` both copies). Confirmed after cleanup: `git status --short` in Continuum shows
**exactly** what it did before any of this milestone's work — the same pre-existing, in-progress,
unrelated real changes (a macOS sandbox entitlement fix, CHANGELOG, etc.) this milestone found on
arrival and never touched. Nothing here modified Continuum application source.

**mac** (`apps/macos/_m8l_whatif_mac`, deleted after measurement):

| | before (stashed fix) | after (fix applied) |
|---|---:|---:|
| `BRG3006` | 28 | 24 |
| `BRG3013` | 4 | 8 |
| total errors | 48 | 48 |
| total warnings | 17 | 17 |
| files emitted | 0 | 0 |

**droid** (`apps/android/_m8l_whatif_droid`, deleted after measurement):

| | before (stashed fix) | after (fix applied) |
|---|---:|---:|
| `BRG3006` | 29 | 25 |
| `BRG3013` | 4 | 8 |
| total errors | 53 | 53 |
| total warnings | 19 | 19 |
| files emitted | 0 | 0 |

Exactly 4 sites reclassified in each app (`formatUptime`×1, `describeTransferFailure`×1, `formatBytes`×2
— both of its reachable same-file call sites), in both apps, independently confirmed. Total diagnostic
counts are **byte-identical** before and after — nothing was added, nothing was suppressed; this is a
pure reclassification. `droid`'s "before" `BRG3006`×29 matches M8-K's own reported droid census exactly
(§17 of that doc), a direct continuity check between the two milestones' independently-gathered numbers.
`BRG2301`/`BRG2303` were bypassed only inside the disposable whatif copies, per the task's own
instruction; the real apps were never touched and still refuse to build past them, unchanged.

## 21. CI/determinism/fixed-point

`just ci`: exit 0 (§19). `just determinism`: the `counter` app's own full 3-run pipeline (uir/
normalized/emitted-files byte comparison) completed and passed cleanly — "3 complete pipeline runs,
10 files each" — before the harness was killed by signal 15 partway into the next app, the identical
environmental/resource limitation recorded in the M8-F and M8-J sessions (not a correctness failure;
confirmed by process inspection at the time — a live `flutter run -d macos` from an unrelated,
independently-running Continuum session was consuming significant resources concurrently). Bounded
substitute, run to completion: `bridge validate` (build + determinism + normalization fixed point) on
`fixtures/apps/local_store` and `fixtures/apps/structured_build` — both `ok: true`, both checks
(`deterministic`, `fixed point`) passing on each. `fixtures/apps/cross_package_app` has no committed
`bridge.json` (validated instead via `just ci`'s own build-proof test, which exercises the real
analyzer→normalize→generate→`tsc` pipeline against it directly). No test is reported passing here that
did not actually run.

## 22. Remaining blockers

1. **Local-variable reference resolution** (§10.7, §14) — the most concrete, real, generator-wide
   finding of this milestone. Affects any body (action or, hypothetically, a lowered top-level function)
   that declares a local and reads it back on a later statement. Confirmed live in real Continuum's own
   `formatBytes`. Not shaped like a "function" problem — it would need its own measurement pass scoped
   to `sig.Action` bodies generally, not to `logic.FunctionDecl`.
2. **Top-level const/`FieldDecl` target classification** (§10.11) — the exact sibling of the defect this
   milestone fixed, deliberately left alone (single-declaration-kind scope) and proven, by dedicated
   test, still present and unweakened.
3. **Switch-expression extraction** (§9, `describeTransferFailure`) — pre-existing, opaque, explicitly
   out of this milestone's scope by its own exclusion list.
4. `BRG2301`/`BRG2303` (route-boundary object/override-system blockers, M8-I) — untouched, as instructed;
   both real apps still refuse to build past them unless bypassed in a disposable copy.
5. `BRG1302` adjacent-string-literals (M8-K) — untouched, still the sole cause of `formatBytes`'s one
   genuinely-absent (not merely unclassified) real site.

## 23. Exact recommendation for M8-M

**Local-variable reference resolution in the generator** (blocker 1 above) is the strongest next
candidate: it is real (confirmed in real Continuum source, not synthetic), it is not one of this
milestone's own excluded topics, it plausibly affects more than just top-level functions (any action
body with a "declare, then read" local), and it has the same shape of fix this and the last several
milestones have used successfully — find where the identity or classification is missing, measure its
real blast radius with a reduction ladder through the real analyzer, and decide bounded-or-not on
evidence. The top-level-const sibling gap (blocker 2) is a smaller, cleaner, more narrowly-scoped
alternative if the next milestone prefers to stay inside the generator's `logic.Ref` case specifically —
it is almost literally "do §16 again, for `logic.FieldDecl`, with the value-vs-reference question §10 of
M8-J already answered (Option A: preserve the reference, do not inline)." Recommend the local-variable
gap first, since it is the one this milestone found causing a *real*, currently-misattributed diagnostic
today, not a hypothetical one blocked behind a capability that does not exist yet.
