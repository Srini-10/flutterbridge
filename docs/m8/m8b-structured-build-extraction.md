# M8-B — Structured build-method extraction

**Date:** 2026-08-20. **Baseline:** `c60486bd6a627985845f3b78010d3dcb6a87d0f3` (== `origin/main`, clean
tree, confirmed via `git status --short` / `git rev-parse HEAD origin/main` / `git log -5 --oneline`
before any change). Current analyzer tests (269/269) confirmed green before editing.

M8-A found a single dominant blocker preventing both audited real applications (Continuum's macOS and
Android apps) from reaching generated output: a `build()`-shaped method whose body is not a single
`return <expr>` was extracted wholesale as `ui.Opaque`, even for a plain `if`/local-variable shape
carrying no side effect at all. This milestone teaches extraction the narrow, real-evidence-scoped
subset of that shape — nothing more.

## 1. Baseline

HEAD and origin/main both `c60486b`, clean tree, 269/269 Dart analyzer tests green before any edit.

## 2. Real Continuum build-shape census

Re-ran both audited apps' analyzers and traced every `ui.Opaque{reason:"build body with statements"}`
node in the fresh normalized UIR back to its Dart source (via `dartSource`, and via each node id cross-
referenced against the generator's own diagnostics for the failing `bridge generate` run):

| Site | File:line | Statements | Shape | Locals | if/else | Early return | switch | Loop | Side effect before return |
|---|---|---|---|---|---|---|---|---|---|
| `PairingPage.build` (droid) | `pairing_page.dart:527` | 2 | `if (cond) { return A; } return B;` | 0 | if, no else | yes (1) | no | no | no |
| `PairingPage.build` (mac) | `pairing_page.dart:509` | 2 | same shape | 0 | if, no else | yes (1) | no | no | no |
| `_ConnectedView.build`-shaped (droid) | `pairing_page.dart:699` | 2 | `final clip = stagedClip; return Column(...);` — `clip` read twice (a null-check and `.preview()`) inside a `collection-if` in `children:` | 1 | no (collection-if is expression-level, inside the returned tree) | no | no | no | no |
| `_ConnectedView.build`-shaped (mac) | `pairing_page.dart:633` | 2 | same shape | 1 | no | no | no | no | no |
| `NotificationFilterSection.build` (droid) | `notification_filter_section.dart:53` | 3 | `final theme = ...; final packages = {...}.toList()..sort(); return Column(...);` | 2 (one initializer contains a cascade) | no (a `collection-if`, `if (_loading) ...`, inside the returned tree) | no | no | no | no |
| `_CameraRationale.build`-shaped (droid) | `pairing_page.dart:640` | 2 | `final theme = Theme.of(context); return Center(...);` | 1 | no | no | no | no | no |

`_Stage`'s own `switch` (the `_buildBody` helper both apps use to pick a screen state) **never itself
reaches extraction as a `ui.Opaque` build-body node** — it is a separate method, called from within
`PairingPage.build`'s own `return Scaffold(..., body: _buildBody(context))`, and a widget-returning
method *call* was already, independently, its own opaque case (`"widget returned by a call"`,
`widget_extractor.dart:125-129`) before this milestone — unaffected by, and out of scope for, this fix.

| Shape | Sites | Current (pre-M8-B) result | Existing UIR sufficient? |
|---|---:|---|---|
| local var + return | 3 | `ui.Opaque` | **Yes** — `ui.Component.render` has no statement slot, but re-extracting the local's own initializer at each reference does not need one |
| if + return, fallback return | 2 | `ui.Opaque` | **Yes** — `ui.Cond{test,then,otherwise}` already exists (used today for `cond ? A : B`) |
| if/else + return | 0 in this corpus, tested via the reduction ladder | `ui.Opaque` (and, for a body that is *only* one such statement, a crash — see §4) | **Yes** — identical shape to the above |
| early-return chain | 0 in this corpus (2+ sequential `if (x) return`), tested via the ladder | `ui.Opaque` | **Yes** — nested `ui.Cond` |
| switch + return | 0 directly reachable (embedded in an un-inlined method call) | N/A | **Unknown — see §10, out of scope** |
| side effect + return | 0 in this corpus, tested via negative cases | `ui.Opaque` | N/A — must stay opaque |

## 3. Reduction ladder

Every rung was run through the **real analyzer** (`test/extraction_test.dart`'s `extract()` helper — a
real, resolved, on-disk Flutter project, not a mock) before any expected output was written down.

| Rung | Shape | Result before M8-B | Result after M8-B |
|---|---|---|---|
| A | `return Text('A');` | `ui.Text` | unchanged |
| B | `final child = Text('A'); return child;` | `ui.Opaque{reason:"widget held in a variable"}` | `ui.Text` |
| C | `if (flag) { return A; } return B;` | `ui.Opaque{reason:"build body with statements"}` | `ui.Cond{test:bind.Param, then:A, otherwise:B}` |
| D | `if (a) return A; if (b) return B; return C;` | `ui.Opaque` | nested `ui.Cond` — outer tests `a`, `otherwise` is a further `ui.Cond` testing `b` |
| E | `final child = flag ? A : B; return child;` | `ui.Opaque{reason:"widget held in a variable"}` | `ui.Cond` (via the pre-existing `ConditionalExpression` case, now reached through substitution) |
| F (Continuum shape) | a local referenced twice inside the returned tree | `ui.Opaque` | both sites correctly substituted, independently |
| G | `if (flag) { return A; } else { return B; }` | **crash** — see §4 | `ui.Cond`, identical shape to C |

Plus the exact Continuum-derived compound shape (local, then an early return on a signal, then a final
return using the local) — the fixture in §12.

## 4. Root cause

`packages/dart/bridge_analyzer/lib/src/session/extract/component_extractor.dart`'s `_returnedWidget`
decided structured-vs-opaque for a `build` method, and handled exactly two shapes: an
`ExpressionFunctionBody` (`build(...) => X;`), and a `BlockFunctionBody` with **exactly one** statement
that is a `ReturnStatement`. Anything else fell through to `out.opaqueUi(build.body, 'build body with
statements')` — the whole method, unconditionally, regardless of how small or safe the extra structure
was.

Tracing the path (extraction → `component_extractor.dart` → `widget_extractor.dart` /
`expression_extractor.dart` → builder) found the fix belongs at the *earliest* layer that loses
structure — `_returnedWidget`'s own decision — not at `ui.Opaque` emission, which was already doing
exactly its documented job (preserve verbatim, report honestly, INV-4).

A second root cause, present but latent, was found by rung G: the single-statement case cast its one
statement with `body.block.statements.single as ReturnStatement?` — an **unsafe cast** that throws
(`type 'IfStatementImpl' is not a subtype of type 'ReturnStatement?'`) rather than returning `null` when
that one statement is an `if`, not a `return`. No prior fixture exercised a `build()` body that was a
*lone* `if`/`else` statement, so this had never been caught. Fixed alongside the main change, with a safe
pattern match, since it sits exactly on the code path this milestone was tracing.

## 5. Existing UIR expressiveness

No schema change was made. `ui.Cond{test, then, otherwise}` already existed and already handled
`cond ? A : B`; extending its use to `if (cond) { return A; } return B;` and to nested early-return
chains needed no new field. Local variables needed no `ui.Let`/statement-sequence node: `ui.Component
.render` is typed to hold only `l2.json`'s `UiNode` union (`ui.*`, never `logic.*`), so a build-method
local's value is carried by **re-extracting its own initializer expression at each reference** — a
Dart-analyzer-side (not schema-side) mechanism, detailed in §6.

## 6. Implementation

All changes are in `dart/bridge_analyzer` (extraction layer). No generator/runtime code implements
statement decomposition — see §9 for the one, unrelated generator defect this work *found* (not
implemented) and fixed.

- **`scope.dart`**: `Binding` gained one new, optional field, `inlineValue: Expression?` — "a build-method
  local's own initializer, substituted at every reference instead of named." `null` for every other
  binding kind.
- **`component_extractor.dart`**: `_structuredBody(FunctionBody, Scope)` — consumes zero or more leading
  `final x = expr;` statements (each becomes a `Binds.local` binding whose `inlineValue` is the original
  initializer `Expression`), then recognizes the return-shaped tail via `_tail` (a bare return; an
  `if (c) return A;` with no `else`, recursing for the fallback; or a terminal `if`/`else` where both
  branches return). Returns `null` — unrecognised, caller falls back to the pre-existing opaque path —
  for anything else. A `_UsageFinder` (`RecursiveAstVisitor`, matching the codebase's existing
  `_ReadFinder`/`_WriteFinder` pattern) proves every declared local is read somewhere in the method, **by
  resolved `Element`, never by name** (Phase 5's own instruction) — an unread local aborts the whole
  transform rather than silently vanishing along with whatever its initializer did.
- **`expression_extractor.dart`**: `_reference` — the one place a name becomes `logic.Ref` — checks
  `binding?.inlineValue` first and, if present, recursively `extract()`s the initializer instead of
  emitting a bare reference.
- **`widget_extractor.dart`**: the existing `SimpleIdentifier` widget-position case (previously always
  `"widget held in a variable"`) gained a preceding case for exactly this: an identifier whose binding
  carries `inlineValue` re-extracts that initializer as the widget, in place.

## 7. Supported build-method statement shapes

- Zero or more `final x = expr;` (single-variable) declarations, each read at least once later in the
  method, in any expression position (a widget itself, or nested inside another widget's props/children).
- A bare `return <widget-expr>;` as the final statement.
- `if (cond) { return A; }` (or `if (cond) return A;`, no braces) with **no `else`**, followed by more of
  this same grammar (recursively) — an early-return chain of any depth.
- A terminal `if (cond) { return A; } else { return B; }` where **both** branches are bare returns —
  must be the method's last statement.
- Any composition of the above in that order: locals, then the return-shaped tail. (Locals interleaved
  *after* an `if`/early-return are **not** supported — see §8; no real Continuum site needs it.)

## 8. Explicitly unsupported statement subset (refuses honestly, still `ui.Opaque`)

- Any bare expression statement with no assignment (`logSomething();`) — real corpus doesn't have this
  inside a build body, but it is the textbook side-effect case and is refused by construction (not in the
  admitted grammar).
- Mutation of any kind as its own statement (`x++;`, `x = y;`).
- An `if` whose branch does anything other than a single bare return (e.g. a mutation, or nothing at all).
- Statements after a terminal `if`/`else` that both return (dead code, but not silently discarded — still
  reported opaque, not pretended away).
- A multi-variable declaration statement (`final a = 1, b = 2;`).
- A local variable declared without an initializer.
- **Locals declared after an early return** (`if (c) return A; final x = ...; return B(x);`) — the
  leading-locals loop only consumes statements *before* the first non-`VariableDeclarationStatement`;
  nothing in this corpus needed the interleaved form, and extending the grammar to it was left
  unattempted rather than guessed at.
- Loops, `try`/`catch`, `switch` (see §10) — none reachable through this method at all; the grammar
  simply doesn't recognise them, so they always fall through to the pre-existing opaque path.

## 9. Side-effect safety (Phase 7)

Negative tests (mirroring the task's own examples, plus one for the unused-local case) confirm the
grammar itself is the side-effect boundary — no bespoke purity analysis was written, because none of the
admitted shapes can express a statement-level side effect:

| Case | Result |
|---|---|
| `logSomething(); return Text('A');` | stays `ui.Opaque`, source preserved verbatim (INV-4) |
| `var x = 0; x++; return Text('$x');` | stays `ui.Opaque` — `x++;` is not a `VariableDeclarationStatement` |
| `if (flag) { mutate(); } return Text('A');` | stays `ui.Opaque` — the `if`'s branch is not a bare return |
| `final unused = sideEffecting(); return Text('A');` | stays `ui.Opaque` — an unread local would otherwise drop its initializer silently |
| statements after a terminal `if`/`else` | stays `ui.Opaque` |
| `final a = 1, b = 2; return Text('$a$b');` | stays `ui.Opaque` — multi-variable declarations are refused |

Re-extracting a local's initializer at more than one use site (rather than declaring it once) relies on
one documented, named assumption, not an invented one: **Flutter's own contract already requires
`build()` (and anything it structurally delegates to) to be free of externally observable side effects**,
since the framework may call it arbitrarily often. Nothing here duplicates a *statement*; only
already-embedded, already-supported *expressions* are ever re-extracted, and never more than the source
itself already wrote.

## 10. `switch` — stop boundary

Probed, not implemented, per the milestone's explicit instruction.

`statement_extractor.dart` already lowers a `SwitchStatement` to `logic.Switch{subject, cases:[{test,
body}]}` for **action bodies** (already-imperative contexts). Reusing that shape for a **render**
position would require synthesizing an equality-comparison `Binding` per case (`bind.Expr{expr:
logic.Binary{operator:'==', left:subject, right:caseValue}}`) that does not exist in the source — a
generator-visible invention, which the extractor's own stated policy explicitly refuses to do
("It also does not guess... never a plausible-looking node with invented children").

Beyond that, real Continuum evidence itself rules out a mechanical if/else-chain lowering:

- **Exhaustiveness is lost.** Both apps' `_buildBody` switches on `_Stage`, an enum — Dart's own analyzer
  enforces exhaustiveness for an enum switch with no `default`. A chain of binary `ui.Cond`s has no such
  guarantee; a case Dart proved unreachable-to-omit becomes, in the lowered form, a silently-missing
  final `else`.
- **Fallthrough is a real, present pattern, not a hypothetical.** `case _Stage.loading: case
  _Stage.onboarding: return const CircularProgressIndicator();` (macOS `pairing_page.dart:544-546`) — an
  *empty* case sharing the next case's body. A binary equality chain has no native way to express "these
  two values share one branch" without inventing a disjunction the source didn't write as one.
- **General `switch` in current Dart supports pattern matching** (destructuring, guards) beyond simple
  enum-constant equality — a faithful lowering for the general case is a distinct semantic problem, not
  a variation on the enum case.

**Conclusion: switch requires an independently-scoped architecture milestone** — at minimum an ADR
decision on whether exhaustive/fallthrough branching gets its own UI-tree node (e.g. a `ui.Switch`) or a
different representation, which this milestone does not decide. M8-B continues with the proven
if/local subset only, exactly as instructed.

## 11. Analyzer tests

15 new tests, `dart/bridge_analyzer/test/extraction_test.dart`, group `'structured build-method
extraction (M8-B)'`:

- Ladder rungs A, B, C, D, E, F, G, each asserting **structure** (exact `ui.Cond` count, `test`'s
  `param`/binding, `then`/`otherwise` content, nesting order, no `ui.Opaque`) — not merely its absence.
- A dedicated two-distinct-locals test, asserting `first`/`second` resolve to the *reference actually
  written*, not declaration order.
- The G-shaped crash regression (§4).
- 6 negative tests (§9), each asserting the method stays `ui.Opaque` with its dart source preserved.

**Mutation-check results**, as required by Phase 10 — each check below is a property the test suite
would have caught if broken:

- Reversing the early-return chain's condition order (rung D asserts the *first* source condition is the
  *outermost* `ui.Cond`) — a swap changes which branch a true `a` takes, and the assertion on `outer`'s
  `test.param == 'a'` fails.
- Resolving the wrong local (the two-distinct-locals test asserts `second` — declared *after* `first` —
  appears *first* in the output, matching the reference actually written, not declaration order).
- Dropping a branch (every `ui.Cond` assertion checks both `then` and `otherwise` explicitly; an
  implementation that only wired one would fail half the ladder immediately).
- Silently evaluating an unread local (the dedicated unused-local negative test).

Full suite: **284/284** Dart analyzer tests pass (269 pre-existing + 15 new), `dart analyze
--fatal-infos` clean.

## 12. Real fixture proof

`fixtures/apps/structured_build/` — a new fixture, `flutter pub get` + `flutter analyze` clean, whose
`GreetingScreen.build()` is exactly: a local (`final greeting = _greeted ? 'Hello again!' : 'Welcome';`,
ternary-valued, driven by a signal), then an early return on a **different**, signal-driven condition
(`if (_loading) { return Scaffold(...); }`), then the final `return Scaffold(...)` using `greeting`
inside a nested `Column`. This combines every shape §11 tested individually, through the **real**
pipeline: real `bridge analyze` → real `bridge normalize` (N1–N11) → real `@bridge/gen-react` → real
`tsc` against the real, unmocked `@bridge/runtime-react` (`packages/generators/react/tests/
structured_build_build.test.ts`, 5 tests, all passing) — no hand-authored UIR anywhere.
`fixtures/uir/structured_build.{ndjson,normalized.ndjson,manifest.json}` are the committed goldens
(`bridge validate` on the fixture: deterministic **and** fixed-point, both green — §17).

**This proof is what found §13's P0 generator defect** — a hand-authored fixture would have agreed with
whatever the emitter happened to do, exactly the failure mode M3-D's build proof exists to catch, and
exactly what happened here.

## 13. A P0 generator defect found and fixed

`packages/generators/react/src/internal/emit/component.ts`'s `ui.Cond` case read
`node['condition']` — a field that **does not exist** in the schema (`l2.json`'s `UiCond` field is
`test`). `emitBinding(undefined, scope)` therefore emitted the literal string `undefined` as the
ternary's own condition. The first real, tsc-proven fixture with a `ui.Cond` at a component's render
root (§12) produced:

```tsx
return undefined ? <Scaffold .../> : <Scaffold .../>;
```

**Valid TypeScript, silently, always wrong** — the `otherwise` branch renders unconditionally, regardless
of the signal's real value. `tsc` alone could never have caught this (`undefined ? A : B` typechecks
cleanly). This is the exact defect class §16/Phase 12 exists to hunt for, and it was never caught before
because `ui.Cond` had never been reached by real analyzer output through a build that went on to
typecheck and run — the same gap `ui.List`'s own field-name bug (documented immediately above this case
in the same file, `component.ts:856-867`) fell through, for the identical reason.

**Fixed**: `node['test']`, matching the schema. Regression-tested directly in
`structured_build_build.test.ts` (`expect(source).not.toContain('undefined ?')` and asserts the real
`_loading$ ?` conditional). All 209 pre-existing generator tests (`vitest run`, `@bridge/gen-react`) still
pass — nothing depended on the old, wrong behavior, confirming the code path was genuinely unexercised
before.

## 14. Continuum before/after

**droid (Android):**

| Metric | M8-A | M8-B | Change |
|---|---:|---:|---:|
| Analyzer diagnostics | 33 | 38 | +5 — newly visible, previously-swallowed constructs |
| Normalize diagnostics | 2 | 7 | +5 |
| Generator diagnostics (unique error lines) | 5 | 19 | +14 — see §15 |
| `ui.Opaque` nodes | 4 (all `"build body with statements"`) | 4 (none `"build body with statements"` — now `"widget returned by a call"` ×1, `"spread"` ×2, `"unrecognised widget expression"` ×1) | same count, **entirely different, more precise causes** |
| Structured `ui.Element` nodes | ~1 (`MaterialApp` only) | 41 | +40 |
| `ui.Cond` nodes | 0 | 6 | +6 |
| `ui.Component`s with real render structure | 1 of 5 | 5 of 5 | all five now structurally visible |
| Files emitted | 0 | 0 | unchanged — still doesn't fully build (§15) |

**mac (macOS):**

| Metric | M8-A | M8-B | Change |
|---|---:|---:|---:|
| Analyzer diagnostics | 9 | 9 | unchanged |
| Generator diagnostics (unique error lines) | 3 | 16 | +13 |
| `ui.Opaque` nodes | 2 (all `"build body with statements"`) | 3 (none `"build body with statements"` — `"widget returned by a call"` ×1, `"spread"` ×2) | different causes |
| Structured `ui.Element` nodes | ~1 | 31 | +30 |
| `ui.Cond` nodes | 0 | 5 | +5 |
| `ui.Component`s with real render structure | 1 of 3 | 3 of 3 | all three now structurally visible |
| Files emitted | 0 | 0 | unchanged |

Neither app fully builds — M8-B does not require that (Success Criteria). What changed is *visibility*:
every screen's real structure is now reachable and diagnosable, where before one opaque node per screen
hid everything inside it, including constructs that have nothing to do with this milestone.

## 15. Recalculated widget coverage

M8-A's 100% figure was explicitly meaningless — only `MaterialApp` and one root component ever survived
extraction. This is the first coverage measurement against current `HEAD` with real widget trees to
count.

Denominator: `ui.Element` instantiations whose `component.library` is `package:flutter/...` (the
population a `WIDGET_MAP`/catalog entry is *for*). A separate bucket — non-SDK `ui.Element`s, i.e. the
app's own cross-workspace-package components (`OnboardingPage`, `MessageLogView`,
`PeerBatteryIndicator`, all from `continuum_ui_kit`, analyzed as a *separate* package from either app
root) and one genuine third-party plugin widget (`DropTarget`, from `desktop_drop`) — is reported
alongside, not folded in: neither is resolvable within either app's own single-project analysis scope
today, regardless of this milestone's fix, and conflating them with SDK coverage would overstate it.

| Scope | SDK instantiations | Unique SDK types | Fully supported (unique) | Partial (unique) | Refused (unique) | Occurrence-weighted coverage |
|---|---:|---:|---:|---:|---:|---:|
| droid | 38 | 18 | 16 | 1 (`ListTile` — supported, `.dense` prop dropped) | 1 (`SwitchListTile`) | 37/38 = 97.4% |
| mac | 26 | 17 | 17 | 0 | 0 | 26/26 = 100% |
| **Combined** | **64** | **22** | **20** | **1** | **1** | **63/64 = 98.4%** |

Every unique SDK widget type both apps use, by name: `SizedBox`, `Icon`, `Padding`, `Column`, `Row`,
`Expanded`, `FilledButton`, `Center`, `Scaffold`, `AppBar`, `IconButton`, `TextField`, `OutlinedButton`,
`MaterialApp`, `ListTile`, `CircularProgressIndicator`, `TextButton`, `DecoratedBox`, `Stack`,
`Positioned`, `ColoredBox` (all catalog-supported), and `SwitchListTile` (not in the catalog).

Non-SDK `ui.Element`s outside either denominator: droid 3 (`OnboardingPage`, `MessageLogView`,
`PairingPage` — the last is the app's own root, referenced by `MaterialApp.home`, not a gap), mac 5
(`PeerBatteryIndicator`, `OnboardingPage`, `DropTarget`, `MessageLogView`, `PairingPage`).

**Do not compare 98.4% to M5-A's/M4-I's 56.5%/56.8%** — the earlier figure was never a Continuum
measurement (M8-A §13/§14) and was occurrence-weighted against a completely different, synthetic corpus
(`wonderous`/`compass_app`). This is the first real, occurrence-weighted Continuum number that exists.

## 16. Newly exposed blockers, classified

19 (droid) / 16 (mac) unique generator error lines, all newly visible because the surrounding tree is no
longer one opaque blob. Classified per Phase 14's A/B split — **none are Category A** (a defect this
milestone introduced); every one is Category B (a pre-existing, now-visible gap), and none is fixed here:

| Diagnostic | What it names | Category |
|---|---|---|
| `BRG3001` (`SwitchListTile`, `PeerBatteryIndicator`, `OnboardingPage`, `MessageLogView`, `DropTarget`) | a widget with no catalog mapping | B — coverage gap, pre-existing |
| `BRG3002` (Dart named-argument call passthrough; `SettingsPage` — "does not emit class declarations") | argument-passing / cross-package component construction | B — pre-existing, narrower restatement of M8-A §5's `BRG1304` finding, now at generate time |
| `BRG3004` (`<unknown>` opaque source: `"spread"`, `"unrecognised widget expression"`) | collection-spread inside a children list; a `null`-valued widget expression | B — pre-existing, different constructs than this milestone's own opaque reason |
| `BRG3006` (`_Stage.loading`/`.idle`/`.onboarding`/`.connected`, `env`, `states`) | unresolved references — the enum-constant-reference gap M7-O's audit independently found (a field initializer referencing `EnumType.value` gets no `target`), plus two more unresolved names now reachable | B — pre-existing, root cause already understood (not this milestone's) |
| `BRG3013` (`Navigator.of` imperative call) | an imperative navigation form the generator doesn't lower | B — pre-existing, unrelated to build-method structure |

Every one of these constructs was **already present in the source before M8-B** — M8-B's fix is what let
extraction see far enough into each screen to reach them and report each honestly, rather than folding
them into one unexplained opaque blob per screen.

## 17. tsc / Next build / browser status

Both apps: generation still fails (§14, §16) — 0 files emitted for either. `tsc`, `next build`, and
browser validation are **NOT REACHED**, for the same reason M8-A found: nothing downstream of a failed
generate has anything to run against. This is not a regression from M8-A (both were already NOT REACHED
there) — see §18 for `just ci`/determinism, which *is* green, and §12 for the one fixture this milestone
did carry all the way through real `tsc`.

## 18. CI / determinism / fixed point / incremental

- `just ci`: **green**, exit 0 (284/284 Dart tests, all TS package builds/lints,
  `verify:depcruise-negative`, `dart analyze --fatal-infos` clean on both Dart packages, `flutter
  analyze` clean on every fixture touched). The routine `analysis_options.yaml` side-effect from `flutter
  analyze` was reverted via `git checkout --` before commit, as established practice.
- `codegen-check`: part of `just ci`'s `codegen-check` step — green (no schema/catalog change was made,
  so nothing to regenerate).
- `just determinism`: **green**, exit 0 — all 5 e2e fixtures (`counter`, `promoted-counter`,
  `inline-push-props`, `async-push-guard`, `local-store`) byte-identical across 3 runs.
- **Fixed point**: `bridge validate` on the new `structured_build` fixture reports both properties
  explicitly green: `deterministic — two runs over the same input agree` and `fixed point —
  normalize(normalize(x)) == normalize(x)`.
- **Incremental**: no incremental-build test harness for extraction was found in this repository
  (`dart/bridge_analyzer/test/` has no incremental/watch-mode suite) — stated rather than claimed. This
  milestone's own changes are purely a per-file, per-method extraction decision with no cross-file or
  cross-build state, so nothing about them is incremental-specific, but that is not the same claim as a
  verified incremental-build pass.

## 19. Recommendation for M8-C

The newly-exposed blockers in §16 are not one problem — they span an unresolved-enum-reference gap
(`BRG3006`), a widget-catalog coverage gap (`BRG3001`), a cross-package component-construction gap
(`BRG3002`), an imperative-navigation gap (`BRG3013`), and two narrower opaque-expression gaps
(collection-spread, a `null`-valued widget). None of them share a root cause the way M8-A's dominant
blocker did, and picking one to fix next needs the same evidence-first discipline this milestone and
M8-A both used — not a guess from this list's length.

**M8-C should be a measurement milestone, not an implementation one**: re-run the same census this
milestone ran (§16) as its own dedicated phase-0, rank the newly-visible blockers by the same
impact model M8-A's Phase 14 used (occurrence × pipeline severity × applications affected), and recommend
exactly one. Two candidates already look disproportionately load-bearing from this pass alone —
`BRG3006`'s unresolved-enum-constant-reference gap (affects both apps' own field initializers, not just
one construct) and the `SettingsPage`/`BRG3002` cross-package component gap (affects both apps'
settings navigation) — but neither has been measured with M8-A's rigor yet, and this milestone's own
instruction not to mix measurement and implementation applies here exactly as it did before: name the
next target from evidence, in its own phase, not from this list.
