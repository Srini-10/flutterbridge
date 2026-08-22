# M8-U — Narrow top-level function module emission

**Date:** 2026-08-22. **Baseline:** `a0931f5` (== `origin/main`, clean tree, confirmed before any change,
except the pre-existing, unrelated `fixtures/apps/hello_bridge/analysis_options.yaml` drift — confirmed
present, untouched throughout). **Type:** ADR + implementation, narrow scope. **Outcome: implemented.**
A reachable, self-contained project-defined top-level `logic.FunctionDecl` now gets a real, module-level
TypeScript lowering — proven end-to-end (real analyzer, real `bridge normalize`, real generator, real
`tsc`) for 11 distinct real-corpus-shaped rungs, including the two real Continuum call sites this
milestone confirmed have no independent blocker (`shout`/`withPrefix`-shaped cross-file calls,
same-file calls, same-name-different-file collisions). **One important correction to M8-T's own prior
finding, discovered by direct verification, not assumption**: Continuum's own real `formatUptime` and
`formatBytes` no longer produce `BRG3013` at the generator level, but neither fully typechecks — each has
its own, independent, pre-existing gap (a `Duration`-typed parameter, and `int.toDouble()`/
`double.toStringAsFixed()` respectively) unrelated to module-emission architecture itself, honestly
identified and explicitly left unfixed (ADR-29 §11).

## 1. Baseline — PROVEN

```
git status --short   → only fixtures/apps/hello_bridge/analysis_options.yaml (pre-existing, unrelated, untouched)
git rev-parse HEAD          → a0931f5e3445e0dcb383b2827ffc1140fce73ab8
git rev-parse origin/main   → a0931f5e3445e0dcb383b2827ffc1140fce73ab8
```
Fresh test baseline (not cited from M8-T): `pnpm --filter @bridge/gen-react test` → 263/263 (23 files).
`pnpm --filter @bridge/compiler test` → 153/153 — re-confirmed unchanged at the end of this milestone too,
since no compiler-package file was touched.

## 2. Real Continuum evidence — reproduced fresh, not cited from M8-T

Read-only, via a temporary `bridge.json` (`source` pointing at the real mac app, `work`/`out` redirected
outside both repos). `formatUptime`'s exact declaration: `package:continuum_ui_kit/src/settings_page.dart:26`.

```dart
/// `2h 14m`, or `47s` while still under a minute.
String formatUptime(Duration d) {
  if (d.inMinutes < 1) return '${d.inSeconds}s';
  if (d.inHours < 1) return '${d.inMinutes}m';
  return '${d.inHours}h ${d.inMinutes.remainder(60)}m';
}
```

Raw UIR: `logic.FunctionDecl{id: aee8850e123860e5, name: 'formatUptime', params: [{name:'d', type:
{library:'dart:core', name:'Duration'}}], returnType: {library:'dart:core', name:'String'}, body:
[logic.If, logic.If, logic.Return]}` — a 3-statement early-return chain, **zero** `logic.VarDecl`, **zero**
references to another top-level declaration. The call site's own `logic.Ref` (id `5360390be5cc5e3a`,
`package:continuum_ui_kit/src/settings_page.dart:232`) carries `target: aee8850e123860e5` — real,
declaration-tier identity, confirmed unchanged (M8-J). Normalize (N1–N11): byte-identical before and
after — confirmed fresh, this milestone (203 nodes in, 249 out; only N6/N10 touched the program, neither
of which is this node). Pre-fix diagnostic: `BRG3013`, exactly as M8-L/M8-T recorded — reproduced fresh,
not assumed.

**Comparison against `formatBytes`/`describeTransferFailure` (real UIR, not assumed):**

| | `formatUptime` | `formatBytes` | `describeTransferFailure` |
|---|---|---|---|
| Locals | none | `units` (const list), `value`/`unit` (mutable, reassigned in a loop) | none |
| Control flow | early-return chain (`if`, `if`, `return`) | `while` loop | switch **expression** |
| Own-declaration calls | none | none | none |
| Parameter type | `Duration` (dart:core, not a primitive) | `int` (primitive) | `TransferFailureReason` (project enum) |
| SDK calls in body | `Duration.inMinutes/.inHours/.inSeconds`, `int.remainder` | `int.toDouble`, `double.toStringAsFixed`, list indexing | none (matched exhaustively) |
| Independent blocker | `Duration` param type unrecognized (§10) | `.toDouble`/`.toStringAsFixed` unrecognized (§10) | switch-expression opacity (`logic.OpaqueExpr`, out of scope, unchanged) |

`formatUptime` is materially simpler in **shape** (no loop, no mutable state, no locals) — proven, not
assumed — but both it and `formatBytes` turn out to share a *different* kind of gap from
`describeTransferFailure`'s: not extraction opacity, but unrecognized SDK type/method surface, found only
by carrying each through to a real `tsc` check (§10).

## 3. Reduction ladder — real Dart, `fixtures/apps/module_emission` + `fixtures/packages/module_emission_utils`

Built and run through the real pipeline (analyzer → `bridge normalize` → generator → real `tsc`), mirroring
Continuum's own app + `continuum_ui_kit` architecture:

| Rung | Shape | Result |
|---|---|---|
| A | zero-parameter, literal return | ✅ supported |
| B | one primitive parameter | ✅ supported |
| C | two primitive parameters | ✅ supported |
| D/E | local `final`s, read in the return | ✅ supported (ADR-28 identity, `localBindingsIn`) |
| F/G | early-return chain (`formatUptime`'s own shape) | ✅ supported |
| H | arithmetic | ✅ supported |
| I/K | string interpolation + a method call on the function's own parameter (`.toUpperCase()`, a real JS method) | ✅ supported |
| L | same-file function-to-function call | ✅ supported, no import needed |
| N | cross-file, same-package call | ✅ supported, correct relative import |
| O | cross-package (the shared package is itself the "cross-package" dependency for every rung above) | ✅ supported — proven throughout, not a separate rung |
| P | two same-named functions in two different files | ✅ supported, collision-free (`ModuleBuilder.declare`'s own per-module scoping) at the declaration level, and a **newly-required** import-alias fix at the *consumer* level (§9) |
| Q | unreachable function | ✅ correctly excluded — no file entry, no diagnostic |
| R | two mutually-recursive functions, same file | ❌ **found limitation**, honestly refused — see ADR-29 §7 |
| S | async | ❌ refused by design (ADR-29 §11), synthetic test |
| T | depends on a top-level `FieldDecl` | ❌ refused (pre-existing `logic.FieldDecl` branch, unchanged), synthetic test |
| V | opaque expression inside the body | ❌ refused, synthetic test |
| W | try/catch | not separately fixtured this milestone — `statement.ts`'s own `TryCatch` case and M8-S's catch-clause identity are both already general-purpose, reused automatically; no evidence found that a function-body try/catch behaves differently from an action-body one |
| X | switch expression inside the body | ❌ refused — real Continuum's own `describeTransferFailure` *is* this rung, confirmed (§2) |
| Y | constructs and returns a project class instance | not separately fixtured — `logic.New`'s own pre-existing class-instantiation refusal (BRG3002) is unmodified and would fire the same way inside a function body as anywhere else |
| Z | mutates top-level `var` state | not separately fixtured — the mutation itself is on a `logic.FieldDecl`, whose own refusal (T) already covers reads; a *write* was not additionally proven, out of scope (no real Continuum site needs it) |
| — | **`Duration`-typed parameter, exact real `formatUptime`** | ❌ **found limitation**, independent of module emission — see §10 |
| — | **`int.toDouble()`/`double.toStringAsFixed()`, exact real `formatBytes`** | ❌ **found limitation**, independent of module emission — see §10 |

U (component/`sig.Signal` state) is **not applicable** — a top-level Dart function has no access to `this`
or any component instance; the language itself forbids the shape.

## 4. Identity — proven sufficient before any architecture work began

Every reference resolved by target throughout §3 and §2 — `logic.Ref.target` to the exact
`logic.FunctionDecl.id`, same-file, cross-file, cross-package, and same-name-different-file, with **no**
name-based fallback anywhere in the resolution path (`expression.ts`'s `logic.Ref` case, `functions.ts`'s
own reachability walk). M8-J's own identity work needed no extension — confirmed, not assumed.

## 5. Candidate architectures — compared

- **Option A (per-Dart-source-file generated module) — selected.** §6.
- **Option B (per-package aggregate module) — rejected.** Two files in the same package can each declare
  a same-named top-level function (Dart forbids the collision only *within* one file); a per-package
  module would need its own disambiguation scheme that per-file ownership avoids by construction.
- **Option C (single application declarations module) — rejected.** Same collision risk, amplified across
  the whole program; also defeats incremental/deterministic generation.
- **Option D (inline into each consumer) — rejected.** Breaks "emitted exactly once" the moment a function
  has more than one call site, and cannot represent a recursive function at all.
- **Option E (inline into component scope) — rejected.** Same problems as D, plus no representation for a
  function shared across more than one component.

## 6. ADR decision

`docs/adr/0029-top-level-function-module-emission.md`, written **before** any implementation, per the
task's own rule 19 and this project's own hard rule (CLAUDE.md: new abstractions need an ADR documenting a
proven contradiction, not a preference). Decides: module ownership (one generated module per Dart source
file, §3 of the ADR), module path derivation (from `span.file` alone, never from a declaration's own name,
§4), reachability (a generator-side, program-wide, cycle-safe fixed-point walk generalizing
`referencedActions`, §5), import generation (reusing `ModuleBuilder.use`, §6), cycle behaviour (a real,
found limitation — corrected mid-implementation, §7), function-body lowering (reusing
`emitStatements`/`emitExpression`, with a `localBindingsIn` wiring `store.ts`'s own action scope is
missing — a related, adjacent gap this milestone did not fix but did not repeat either, §8), the
`FieldDecl` relationship (architecture does not foreclose it, §9), and the `componentModules` relationship
(deliberately a *different*, more collision-safe naming convention, §10). No schema change anywhere in
this decision.

## 7. Module ownership, reachability, import model — as decided, verified working

**Ownership:** one file per Dart source file (`src/generated/dart/<package-or-app>/<relative-path>.ts`),
confirmed in the real build: `format-utils.ts`, `prefix-utils.ts`, `collide-a.ts`, `collide-b.ts` — four
files for four source files, never per-declaration, never per-package.

**Reachability:** `functions.ts`'s `reachableFunctions` — seeded from every `ui.Component`'s own render
tree and every `sig.Action`'s own body (a function has no access to `this`, so it can only ever call
*other* functions, never an action — confirmed by Dart's own language rules, not merely assumed), then a
fixed point over newly-discovered functions' own bodies, mirroring `referencedActions`'s (M8-O) discipline
generalized to a second declaration kind and a program-wide root set rather than one component's own tree.
`neverCalled()` (rung Q) is confirmed excluded — no file entry, no diagnostic, proven by a real Dart
fixture, not only a synthetic one.

**Imports:** `ModuleBuilder.use`, unchanged mechanism, reused exactly as every other cross-module reference
in this generator already does. `describeBoth` (same file as `classify`) needs none; `withPrefix` (a
different file) imports `shout` by its own generated specifier — both confirmed in the real build output.

## 8. Supported / refused subsets — precisely as §3's own table states

Supported: a reachable function that is not `async`, has a real body, has no named parameters, and whose
body's own emission (via the unmodified `emitStatements`/`emitExpression` machinery) produces zero
error-severity diagnostics. Refused: everything else, via the pre-existing `BRG3013` at the reference
site — never a new diagnostic code, never weakened, never converted into generated code for a genuinely
unresolved reference (`BRG3006` is untouched, confirmed by `function_module_emission_refusals.test.ts`'s
own coverage).

## 9. A genuine, necessary implementation fix found along the way: import aliasing

Building rung P (`collide_a.dart`/`collide_b.dart`, two files each declaring `sameName()`) surfaced a real
bug: `ModuleBuilder.use(from, name)` returned `name` unconditionally, with no collision check across
*different* `from` specifiers — two imports of the identical local name from two different modules would
have produced `import { sameName } from '...a'; import { sameName } from '...b';`, invalid TypeScript
(`tsc`'s own `TS2300: Duplicate identifier`). Fixed at the shared infrastructure level (`module.ts`):
`use` now detects the collision and assigns a numbered alias (`import { sameName as sameName2 } from
'...b';`), the identical strategy `ModuleBuilder.declare` already uses for module-scope declarations.
Proven directly in the real build proof (`module_emission_build.test.ts`'s own "two same-named functions"
test) and confirmed via the real `tsc` check. This is infrastructure every future cross-module reference
in this generator benefits from, not something scoped narrowly to functions — but it was `logic
.FunctionDecl` emission that first exercised the gap, since no prior emitter imported two different
same-named things into one file.

## 10. Two real, independent, honestly-identified limitations — found by direct verification

**Not module-emission's own fault, and not fixed this milestone (ADR-29 §11, and this project's own rule
18, "do not broaden into arbitrary Dart library transpilation"):**

1. **`Duration`-typed parameters.** `typeTextOf` (`types.ts`) maps an unrecognized Dart type to TypeScript
   `unknown` — a deliberate, documented choice ("`any` would let the emitted code do anything with a value
   whose type the program declined to state"). `Duration` is not in `typeTextOf`'s own primitive table, so
   `formatUptime`'s exact real parameter (`Duration d`) is emitted as `d: unknown`, and `unknown` correctly
   forbids property access without narrowing — `tsc` refuses `d.inMinutes` with `TS18046: 'd' is of type
   'unknown'`. Verified directly: a fixture rung reproducing `formatUptime`'s exact real shape (Duration
   parameter, the same three property reads, the same `.remainder` call) was built, generated cleanly at
   the generator level (no `BRG3013` — module emission itself works correctly on this shape), and then
   failed the real `tsc` build proof with exactly this error. This is a pre-existing gap in the generator's
   own type-mapping table — the runtime kit *does* have a `Duration` class (`animation.ts`, from M7-L's own
   `Future.delayed` work), but `typeTextOf`/`isKitProvided` do not currently recognize it for a *parameter
   type* position, only for construction. Fixing this would mean extending the kit-type-recognition table,
   a separate, small, but genuinely independent capability from module emission itself — not attempted.
2. **`int.toDouble()`/`double.toStringAsFixed()`.** `formatBytes`'s exact real body was similarly built and
   verified: the generator now processes it with zero `BRG3013` (the local-variable and while-loop
   machinery this milestone reuses works correctly — a genuine, if incidental, correction to M8-T's own
   guess that "local resolution" was `formatBytes`'s own remaining blocker), but `tsc` refuses the emitted
   `bytes.toDouble()` — JavaScript's `number` has no such method, and the generic `logic.MethodCall`
   emitter (`${receiver}.${method}(${args})`) has no special case for it, the same category of gap as (1).

**Both are the exact "unrelated blocker remains" scenario this milestone's own instructions explicitly
call an acceptable outcome (§10 of the task, restated): module emission's own architecture is proven
sound — 11 real-corpus-shaped rungs succeed end-to-end, real `tsc` included — while `formatUptime` and
`formatBytes` specifically carry one more, independent, honestly-identified gap each, neither smuggled
into this milestone's own implementation.**

## 11. FieldDecl relationship

Not implemented (ADR-29 §9). The architecture does not foreclose it: the identical per-source-file
ownership model and reachability generalization would apply; the one genuinely open question (module-
evaluation-time ordering for a field initializer that references another module-level declaration, versus
a function body's own call-time-deferred references, which need no ordering at all) is exactly why this
ADR does not extend itself to `FieldDecl` without its own, separate evidence and decision.

## 12. Cross-package relationship

Proven directly: `format-utils.ts`, `prefix-utils.ts`, `collide-a.ts`, `collide-b.ts` are all owned by
`module_emission_utils`, a sibling `path:` dependency of the app — the identical architecture Continuum's
own `continuum_ui_kit` plays, and the identical `PackageConfig`/analyzer-resolved `span.file` mechanism
(`package:<name>/<path>`) M8-F/M8-J already established. No new package-resolution system was built —
`modulePathFor` (ADR-29 §4) parses the *existing* span field, nothing else.

## 13. Diagnostics — before/after

Before: every reachable `logic.FunctionDecl` reference, supported or not, reported `BRG3013` at the
reference site. After: a supported one resolves silently (no diagnostic — it simply works); an unsupported
one still reports the identical `BRG3013`, at the identical site, with the identical message shape,
confirmed by `function_module_emission_refusals.test.ts`'s own six cases (async, `FieldDecl` dependency,
opaque expression, named parameter, mutual recursion, unreachable). `BRG3006` (a genuinely untargeted
reference) is untouched — no test in this suite or the pre-existing suite converts one into the other.

## 14. Real Continuum before/after

Read-only, both apps, fresh (not cited from M8-T).

| | mac before | mac after | droid before | droid after |
|---|---:|---:|---:|---:|
| `BRG3006` | 15 | 15 | 15 | 15 |
| `BRG3013` | 10 | **7** | 10 | **7** |
| `BRG3002`/`BRG3004`/`BRG3001`/`BRG3008` | unchanged | unchanged | unchanged | unchanged |
| files emitted | 0 | 0 | 0 | 0 |

The three `BRG3013` sites that dropped: `formatUptime`(1), `formatBytes`(2, both diagnostic emissions for
the one declaration). `describeTransferFailure` remains (switch-expression opacity, unrelated,
unchanged). `_log`(2), `Navigator.of`(1), `ScaffoldMessenger.of`(1), `showDialog`(1), the `SettingsPage`
push(1) all remain, unchanged, for their own already-catalogued reasons. **`files emitted` remains `0/0`
in both apps** — expected and explicitly not the success criterion this milestone was measured against
(§10 of the task): Continuum still carries other, independent, already-known blockers (`Theme.of`,
`spread`, the overlay trio, and so on, per M8-T's own census) that module emission was never scoped to
touch. The improvement is real and precisely attributable — three fewer misclassified-as-still-refused
diagnostics, from a capability now proven to work soundly on 11 other real-corpus-shaped rungs, with the
two real Continuum sites' own *additional*, independent gaps identified honestly rather than glossed over.

## 15. Regression proof

`M8-N` (local-variable identity): `local_variables_build.test.ts` unmodified, passing — confirmed via the
full 276-test suite. `M8-O` (transitive action discovery): `transitive_action_reference.test.ts`/
`transitive_actions_build.test.ts` unmodified, passing. `M8-P` (`FieldDecl` diagnostic classification):
`toplevel_field_reference.test.ts` — one fixture updated (§16), the rest unmodified, all passing. `M8-R`
(N11 route-boundary refusal): the compiler package was not touched at all this milestone; `pnpm --filter
@bridge/compiler test` 153/153, unchanged. `M8-S` (catch-clause identity): `catch_clause_build.test.ts`/
`catch_clause_reference.test.ts` unmodified, passing. `M7-N`/`M8-B`/`M8-D`/`M8-F`/`M8-H`/`M8-J`/`M8-L`: all
covered by the same full suite run, all passing — no unrelated browser suite was re-run, since none of this
milestone's own changes touch anything a browser-level test would newly exercise.

## 16. Two pre-existing test fixtures updated — a real finding, not a workaround

`toplevel_function_reference.test.ts` and `toplevel_field_reference.test.ts` each built a synthetic
`logic.FunctionDecl` with an empty `body: []` to test M8-L's own diagnostic-classification fix — a shape no
real Dart source could ever produce for a non-`void`-returning function (Dart itself requires a return on
every path). Module emission correctly treats an empty body as "supported" (nothing in it can fail), so
these two tests' own assumption — "this declaration stays unsupported no matter what" — broke, honestly,
not silently: `files.length` went from the expected `0` to a real, non-empty count. Fixed by marking both
synthetic declarations `isAsync: true`, preserving every existing assertion (same `BRG3013` code, same
message) while keeping them genuinely, honestly unsupported for a reason that will keep being true.

## 17. Silent-wrong-code audit

**None shipped.** Two were **found and prevented, not shipped**: (1) the import-collision bug (§9) —
would have produced invalid TypeScript, caught by this milestone's own real `tsc` build proof before it
was fixed, never released; (2) parameter types with no `tsc`-safe fallback (`Duration`, §10) — the generic
`typeTextOf`/`PropertyAccess`/`MethodCall` machinery does not silently guess; `unknown` correctly blocks
unsafe property access, so the failure mode is a loud, real `tsc` error, not a runtime `undefined` — proven
directly, not assumed, by carrying the exact real shape through to a real typecheck. No test asserts a
value or behavior this implementation cannot actually deliver.

## 18. Remaining blocker graph

1. `Duration`/`int.toDouble`/`double.toStringAsFixed` and — by extension — the broader class of "Dart
   numeric/SDK-value-type methods with no JS equivalent" (§10) — real, independent, found this milestone,
   not fixed.
2. `logic.FieldDecl` module emission (§11) — architecture-compatible, not implemented.
3. Cross-function/cross-file cycles (§7 of the ADR) — a real, found, honestly-refused limitation; no real
   Continuum evidence currently requires fixing it.
4. Everything M8-T's own remaining blocker graph already listed and this milestone did not touch:
   `Theme.of`'s `.textTheme`/`.dividerColor` half, the overlay/navigation trio, `spread`/`for-element`/
   `widget-returned-by-a-call`/`cascade`, `SwitchListTile`, parameter/N5/N11 identity work, `sig.Effect`
   lowering — all unchanged, all still open.

## 19. CI, determinism, fixed point

`just ci`: full green. `just determinism`: retried after one killed attempt (signal 15, the same
environmental/resource limitation recorded in every prior milestone this session — reported honestly, not
counted); the clean retry, run alone, completed byte-identical across all 5 fixture apps, 3 runs each,
exit 0. `bridge validate` on the new `fixtures/apps/module_emission` fixture: both checks pass
(`deterministic`, `fixed point`).

## 20. Recommendation for the next milestone

Two independent, real, evidence-backed candidates surfaced by this milestone's own investigation, neither
requiring an ADR to scope further:

1. **Dart numeric/SDK-value-type method recognition** (§10) — extend `typeTextOf`'s own kit-type table to
   recognize `Duration` as a parameter/property type (the runtime class already exists, from M7-L), and
   extend the generic `MethodCall`/`PropertyAccess` emitters to map a small, evidence-bounded set of
   `int`/`double` methods (`toDouble`, `toStringAsFixed`, `remainder`) the same way `[]` subscript already
   gets special-cased. Two real Continuum sites (`formatUptime`, `formatBytes`) would benefit immediately,
   with real, already-built evidence (this document, §10) to start from.
2. **`logic.FieldDecl` module emission** (§11) — the architecture ADR-29 establishes is already compatible;
   the one open question (module-evaluation-time ordering) needs its own small, focused investigation and
   decision before implementation, mirroring exactly the pattern M8-T → M8-U already followed for
   functions.

Recommend #1 first: smaller in scope, two concrete real-corpus payoffs already identified and verified, and
does not require deciding anything module emission itself left open.
