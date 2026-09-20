# FlutterBridge — final production-compatibility audit

**Scope.** FlutterBridge only. Continuum (a separate application) was not touched, and nothing here requires it. The ADR-0048
build-local contract is preserved: read-only capture is inlined, mutation of a build-local is refused with `BRG1311` (unweakened),
nothing persistent was implemented. `fixtures/apps/hello_bridge/analysis_options.yaml` (an uncommitted change that predates this
work) was never staged or reverted. `rsc-split` was not touched.

**Starting point** `8cbc50e` (HEAD == origin/main). **Ending point** `git log` — six commits, `627f4f7` … the last one is named at the
foot of this file; none has been pushed.

**Evidence labels** used below: *[Flutter]* the generated component and a real Flutter widget were driven through the same script
and compared after every step; *[Dart]* thousands of results computed by `dart run`; *[browser]* Chromium against a `next build`;
*[mutation]* an edit that must make a test fail, made, observed failing, reverted; *[analyzer]* the real analyzer's UIR;
*[probe]* an observation from running something once.

---

## 1. The three decisions

| Decision | Architecture | Evidence | Where it differs from Flutter |
|---|---|---|---|
| **State-held collection mutation** — [ADR-0051](../adr/0051-state-held-collection-mutation.md) | Mutate **in place** (aliases, props, nesting all work). Every `Signal` registers the collection graph it holds in a `WeakMap`; each runtime mutator helper (`listAdd`, `listSort`, `mapSet`, …) announces to the owners of what it changed (`Signal.touch`, an explicit exception to ADR-20 R3); `useSignal` subscribes to a *version*. Not "always clone". The first design — wrap the call in `mutate(signal, …)` at compile time — was found wrong before it shipped (an alias, a prop and a nested list have no root the call site can name). | 361 real-Dart cases [Dart]; 15 scenarios, Flutter vs component, per step [Flutter]; a 32-case per-helper notify table; 8 mutations killed [mutation]; a browser proof [browser] | A mutation with no `setState` re-renders here (ADR-0048); out-of-range reads yield `undefined`; Dart's unstable `sort` is stable here |
| **Lifecycle lowering** — [ADR-0052](../adr/0052-state-lifecycle-lowering.md) | `initState`: a pure-assignment prefix runs before the first render (`useInitState`, once even under StrictMode), the rest after commit; `dispose` is the cleanup of the same effect (`useLifecycle`), so init/dispose pair; `didUpdateWidget` fires on a new `props` object (`useDidUpdateWidget`). `didChangeDependencies`, `deactivate`, `activate` and a store's `dispose` are **refused by name**. Schema: `ui.Component.effects`, `sig.Effect.method`, `sig.Effect.params` (the proven contradiction: an effect named no component). | 5 scenarios incl. a `mounted`-guarded async `_load()` started in `initState`, and the first frame via `renderToString` [Flutter]; 11 hook tests; 7 mutations killed; a browser proof incl. dev [browser] | Cross-component order (React runs child effects first, a parent's cleanup first — pinned by test); the effectful part of `initState` runs after the first commit; `didUpdateWidget` can fire more often (ADR-0048 re-renders) |
| **Dart integers** — [ADR-0050](../adr/0050-dart-integer-semantics.md) | The JavaScript safe-integer domain, **exact or loud**: checked helpers (`BRG4011/12/13`), `BigInt` for bit operations, exact constant folding, an out-of-domain constant is a build error; N6 no longer folds an inexact `int` result. | 3 477 real-Dart cases [Dart]; runtime-executed components [Flutter]; 9 mutations killed | An `int` beyond ±2⁵³−1 throws where Dart wraps at 64 bits |

## 2. Defects found and fixed beyond the three decisions

Found by *running* constructs, not by reading the compiler ([ADR-0054](../adr/0054-silent-semantic-loss-audit-fixes.md),
[ADR-0053](../adr/0053-widget-constructor-parameters.md)). Each was a build that **succeeded** and behaved differently:

- `String`/number members emitted as the Dart name on a JS value (`s.isEmpty` → `undefined`; a validator never fired) — lowered, 1 824
  real-Dart cases, the rest refused.
- **`switch` matched nothing**: Dart 3 makes every `case X:` a pattern case; the analyzer read only the legacy form, so every case had no
  test and was emitted as `case undefined:`.
- Increments and assignments used as values (`a++ + ++b`, `if (++w > 4)`): the new value for a postfix, `undefined` for a signal write,
  and `w = (w + 1 > 4)`.
- **An inline callback read the render-time snapshot** of a signal: `_a = _a + 1; _a = _a + 1` added 1, and `_b = _a * 2` used the old `_a`.
  Invisible to every text-pinning test; found by an identifier-hygiene probe.
- **`useInitState` ran twice under StrictMode** (`_n = _n + 41` → 83): found by the browser proof; the jsdom fixtures had only idempotent
  assignments.
- `f.call(x)` passed no argument; `Future.catchError/whenComplete` are not `Promise` methods; a null-aware `?.` on a non-variable receiver
  was silently dropped (SDK members).
- Widget constructors: defaults dropped and every optional parameter made required; positional arguments named `_positional0`; a field
  initializer resolved to `null`; initializer lists / named / factory constructors silently absent (now `BRG1309`).
- Enums: `k.name`, `'$k'` and members were `undefined`/wrong (members now `BRG1312`); `deactivate`/`activate` bodies discarded; `Text`
  style dropped with no diagnostic; `TextButton` silently an `ElevatedButton`; `SizedBox.expand()`.
- N6 folded `-0.0` to `0` (canonical JSON has no `-0`), so `(-0.0).isNegative` was false.
- Effect symbols keyed by timing: `didUpdateWidget` and `didChangeDependencies` collided and the second body was dropped.
- Widget props that were mutated in place became empty signals (`signal<number[]>(null)`); function-typed props were `unknown`, so a
  component that *called* a callback prop failed `tsc`; a recursive component imported itself.
- Harness: the e2e suite reused a runtime tarball weeks older than the code under test.
- Integrity: `Program.of` kept the last of two colliding nodes silently (now an `IdentityCollisionError`); a truncated or unknown-kind
  document printed a stack trace (now a `LoadError`, exit 3).

## 3. Compatibility corpus

61 fixture apps under `fixtures/apps/` and 62 committed raw analyzer documents under `fixtures/uir/`, covering the
language, widgets, state, lifecycle, routing and the runtime; every generator test starts from real analyzer output, not hand-built UIR.
Four were built in this milestone **with a Flutter oracle** (`fixtures/apps/*/test/`, run by `flutter test`, expected output committed and
checked current):

| Fixture | Scenarios | Covers |
|---|---|---|
| `collection_mutation` | 15 | every list/set/map mutator; final and non-final; nested; alias; prop shared with a child; captured callback; several mutations per `setState`; no-op mutations; mutation without `setState`; parent rebuild; a list rendered as widgets |
| `lifecycle_lowering` | 5 | init/update/dispose counts and order; first frame; `mounted`-guarded async; unmount-before-complete; StrictMode |
| `widget_param_defaults` | 1 (7 call shapes) | defaults, optional nullable, positional required, mixed |
| `sdk_semantics` | 8 | String/number members, `switch`, increments as values, `.call`, `Future.whenComplete`, `?.`, enum `name`/interpolation, stale reads |

## 4. Real-application validation — what is and is not true

- **Compiles, typechecks, `next build`, and runs in Chromium (production and development):** `examples/counter` and the fixture apps in
  `e2e/` — six generated applications, **66 Playwright tests**, hydration clean, console clean. The sixth (`state_semantics_e2e`) exercises
  everything above in a real browser.
- **`hello_bridge` (the repository's larger app) does not generate.** Blockers, by name: `BRG3006` `_repository` (a project-class instance
  held as a field), `BRG3007` a `FutureBuilder`, `BRG3013` a route boundary (`isDark` promotion), `BRG3016` `themeMode`.
  Lowering lifecycle *exposed* the first (it was previously hidden because the whole `initState` was refused unread).
- **Two real external applications were analysed read-only** (copied to a scratch directory; the originals untouched):
  - a 240-file consumer app: `pub get` resolves; the stock analyzer **refuses to write UIR** — 296 `BRG1201` errors, 279 of them inside
    55 committed `*.freezed.dart` files (freezed union variants declared in part files). With a private patched analyzer to get *any* UIR:
    65 components, 13 routes, 32 signals, 9 stores, 418 generator errors.
  - a 21-package monorepo (470 files): analysis took 4 min 6 s for the whole pub workspace; 816 components but **0 routes**; 3 729
    generator diagnostics.
  - Ranked blockers across both: freezed/part-file classes; widget-returning helpers and non-trivial `build` bodies; spread / `for` / `if`
    in widget children; members of project classes; project statics and top-level declarations; go_router shapes (`goNamed`, `pageBuilder`,
    shell routes); Dart expression syntax with no UIR form (`is`, tear-offs, `throw`, records, switch expressions); named arguments on
    calls; `InkWell`, `LayoutBuilder`, `showDialog`, `ListView.separated`, `Semantics`.
  - **Conclusion: no large production Flutter application compiles today.** This milestone made the subset that compiles *correct*; it did
    not make it *large*.

## 5. Differential testing inventory

| Against real | What | Volume |
|---|---|---|
| Dart (`dart run`) | integer arithmetic, bit operations, modulo | 3 477 cases |
| Dart | `List`/`Set`/`Map` helpers | 361 cases |
| Dart | `String` helpers (substring, padLeft/Right incl. multi-char, replaceAll/First with `$`, repeat, codeUnitAt) | 1 824 cases |
| Flutter (`flutter test`) | generated component vs the widget, per step | 29 scenarios |
| Chromium | the generated Next.js app | 66 tests |

## 6. Cross-cutting

- **Diagnostics quality.** A test runs the generator over all 62 raw analyzer documents and fails on `<unknown>`, `[object Object]`, `NaN`, or a
  bare `undefined`/`null` where a name belongs — none found. Each new refusal names the construct, what *is* lowered, and (where there is
  one) the workaround.
- **UIR / identity.** All 62 raw documents load under the new collision check. Identity is content-derived: identical closures share an id by
  design, and now two *different* nodes sharing one is an error rather than a silent last-wins.
- **Determinism.** `just determinism`: three complete runs (fresh `pub get`, analyze, normalize, generate) byte-identical for every
  e2e application, and analyze+generate == build.
- **Performance** (measured first; nothing was optimised — no bottleneck in the generated apps was measured). Counter app: analyze 7.7 s
  (dominated by starting the Dart analyzer), normalize 11 ms, generate 11 ms, `next build` 7.2 s; browser TTFB 2 ms, first paint 24 ms,
  interactive 13 ms, 800.7 KiB JS. The 240-file app analyses in ~16 s. Runtime micro-benchmarks: `listAdd` 31 ns unowned vs 16 ns for
  `push`, 115 ns when a signal owns the list; registering ownership on `signal.set` ~58 ns per element (O(size) per whole-collection
  replacement); `intAdd` 1 ns. A 20 000-node document normalizes in 0.18 s.
- **Adversarial.** Empty, truncated, garbage, unknown-kind and 20 000-deep documents → a message and exit 3; duplicate ids → collision
  error; identifier hygiene (fields and props named `signal`, `useSignal`, `listAdd`, `intAdd`, `undefined`, `NaN`, `arguments`, `eval`,
  `constructor`, `function`, `delete`, `typeof`, `React`, `props`) compile and run.

## 7. Master completion matrix

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | Collections decided, implemented, regression- and mutation-tested, compared to Dart | **Done** | ADR-0051 |
| 2 | Lifecycle lowered; nothing silently dropped; ADR | **Done** (3 lowered, 4 refused, deviations pinned) | ADR-0052 |
| 3 | Integers exact or loud; mutation-tested | **Done** | ADR-0050 |
| 4 | Systematic silent-loss audit | **Done for the probed surface**; 17 classes fixed; remaining gaps listed as refused or `tsc`-loud | ADR-0054 |
| 5 | Real compatibility corpus with real analyzer output | **Done** (61 apps / 62 raw documents; 4 with a Flutter oracle) | §3 |
| 6 | Real-application validation | **Partial, honestly**: the repository's small apps run in Chromium; `hello_bridge` and two external apps do **not** compile | §4 |
| 7 | Differential testing | **Done** for ints, collections, strings, the four oracle fixtures | §5 |
| 8 | Diagnostics quality | **Done** (hygiene test over 62 documents) | §6 |
| 9 | UIR / identity audit | **Done** (collision guard; loader hardening) | §6 |
| 10 | Determinism | **Done** | §6 |
| 11 | Runtime validation | **Done** (jsdom + real `react-dom`, StrictMode, SSR first frame, Chromium) | §5 |
| 12 | Performance | **Measured**, not optimised | §6 |
| 13 | Adversarial robustness | **Done** for documents and identifiers; **not** fuzzed at the Dart-source level | §6 |
| 14 | Docs | README, `language-support.md`, ADR-0050…0054, this report | — |

## 8. Limitations, stated once

- **No large production application compiles.** The blockers are in §4; several are *capability* (freezed, project-class members, go_router
  shapes), not correctness.
- **Not universally Flutter-compatible.** The claim is: the subset in `docs/guide/language-support.md` compiles exactly, or is refused by name.
- The generated app differs from Flutter in the ways each ADR lists: re-render without `setState`, `setState(() {})` re-renders nothing,
  cross-component lifecycle order, effectful `initState` after the first commit, `int` beyond ±2⁵³, out-of-range reads yield `undefined`.
- Unfixed and **silent**: none known. Unfixed and *loud*: `List.from`, spread, `fold`, project statics, a build-local nullable narrowing
  (`tsc`), widget-returning helpers, and everything in §4.
- Freezed/part-file classes make the analyzer refuse to write UIR at all (`BRG1201`) — the single largest blocker for real apps, untouched.
- Windows and Linux are validated only by CI on the same pipeline; nobody has used them by hand.
