# FlutterBridge — production compatibility audit (phase 2)

Baseline `ded8c3c`; head `8ade08d` plus this audit. 13 commits, ADR-0055…0067. Real applications were analysed **read-only, in disposable
copies**; nothing in either was edited, and no fix names an application, a package's private class or a file. Each fix is a general
Dart/Flutter semantic with a Flutter-oracle fixture and mutants.

## Burn-down (real applications)

| Application | Baseline | Now |
| --- | --- | --- |
| 240-file consumer app — analyzer errors | **296 `BRG1201`** (part files) | **0** |
| 240-file app — generator errors | 639 | 599, with far more code reachable (a class model, statics, mixins, freezed shape now lower instead of being refused first) |
| 240-file app — opaque expressions | ~700 (function refs 76, throw 67, extension 61, mixin 59, `?.` 34, spread 27, switch 20, tear-offs 18 …) | 61 (`extension`), 9 widget-by-call, 7 unrecognised widget, 4 record |
| 21-package monorepo — analyzer errors | 45 (`BRG1201`/`1309`/`1313`, then `1202`, `1204`) | **0** |
| Monorepo — routes | **0** | **127**, 0 unresolved pages, 0 dangling navigations |
| Monorepo — generator errors | (blocked before generation) | 4 675 over 816 components: `ref` 464 / Riverpod, design-system theme extensions (`context.palette`, `BRG3010` 293), `BRG3013` top-level variables built from those |

Neither application compiles end to end, and neither can: both are built on Riverpod, one on `dio` and native audio plugins, one on
`supabase` and a theme-extension design system. Those are package APIs with no model here. What the real code exposed that is *general*
is fixed and proven; the rest is refused by name (see the contract in `docs/guide/language-support.md`).

## What was built (each with an ADR, a fixture compared with real Flutter, and mutants)

| ADR | Capability | Found by |
| --- | --- | --- |
| 0055 | General class model: constructors, inheritance, abstract, statics, operators, `is`, object mutation notifications | 240-app: classes were refused |
| 0056 | Enhanced enums as classes | 18 `BRG1312` |
| 0057 | SDK statics (`identical`, `Object.hash`, `unawaited`, `double.infinity`), package constants as identity tokens | 549 `BRG3006` |
| 0058 | throw/rethrow expressions, tear-offs, cascades, whole-chain null-shorting, collection spread/if/for, checked `as` | 350 opaque expressions |
| 0059 | Mixins; classes that others inherit are classes | 59 mixins |
| 0060 | List/Set/Map surface, collection constructors, enum statics | fold/firstWhere/List.from; monorepo `BRG1201` ×35 |
| 0061 | Exception classes, typed `catch`; **`try/finally` no longer swallows the exception** (silent loss since M3) | oracle |
| 0062 | Widget-returning helpers inlined; statement-bodied `build` (prelude); widgets as values; `ui.Nodes` | 17 helpers, `BRG1313` |
| 0063 | Widget constructors: initializer-list constants, named constructors, factories | monorepo design system |
| 0064 | go_router page wrappers, `StatefulShellRoute`, duplicate paths; `id`/`kind` named arguments no longer mistaken for nodes | monorepo: 0 routes, `BRG1204` |
| 0065 | Dart 3 patterns: switch expressions and pattern cases | 67 opaque switches |
| 0066 | `DateTime`, `Timer`, `Future` factories, parsing, async and named-parameter functions | 144 named-arg refusals |
| 0067 | freezed's generated shape: callable copy objects, generics, type guards, `runtimeType` | freezed part files |

Earlier in the phase (before the ADR series above): part-file symbols (`704f114`, the 296 `BRG1201` — one root cause), project statics (`382e9ec`).

## Silent losses found and fixed in this phase

`try { } finally { }` swallowed the exception; `?.` on a subscript dropped the `?`; `a?.b.c` guarded only `a?.b`; `json['id'] as int` was
an unchecked assertion; a typed `catch` caught everything; a `final` field holding a mutable object was not state when the mutable field
was inherited; a `Timer`/signal receiver was read twice; a named argument called `kind` broke the builder's validators.

## Not done (honestly)

Riverpod and the package boundary above; a **large production app running in Chromium** — not achieved.
No claim of universal Flutter support is made. (Extensions, records, gestures, `LayoutBuilder` and route names, listed here as not done in phase 2, were built in phase 3 below.)

## Gates on the final tree

`just ci` exit 0; `just release-check` exit 0; `just e2e` 66 tests in Chromium (production and development) pass; `just determinism` byte-identical across every run (an earlier attempt failed only on a `pub.dev` socket error and was re-run). `git diff --check` clean. `fixtures/apps/hello_bridge/analysis_options.yaml` (the user's change) is untouched and unstaged.

---

# Phase 3 — final gap closure (baseline `3490e6b`)

Commits `e5ca29a`, `d9180d9`, `a81da3d`, `31ed986`, `3b1d892`, `4ac2eae` and this report; ADR-0068…0073. Real applications again analysed **read-only, in disposable copies**; no
fix names an application, a package's private class or a file.

## Final real-application report

| | Application A (240-file consumer app) | Application B (21-package monorepo, 127 routes) |
| --- | --- | --- |
| Analyzer errors | 0 (baseline 0) | 0 (baseline 0) |
| Generator errors, baseline `3490e6b` → now | **599 → 523** | **4 675 → 4 444** |
| TypeScript typecheck of the output | not reached (generation refuses, so nothing is emitted) | not reached |
| Next dev / production build | not reached | not reached |
| Browser (Chromium) | **not run — no production app compiles; not claimed** | **not run — not claimed** |

**Exact blockers, by root cause** (histograms taken from the generator's own diagnostics, `hist.py` over `bridge generate` output):

| Root cause | A | B | Status |
| --- | --- | --- | --- |
| Riverpod: `ref` (`BRG3006`), provider top-level `final`s (`BRG3013`), notifier classes, `ConsumerWidget` | ~19 + ~19 (+ `_repository` 16, `state` 22) | 482 + 478 (+ the classes and initializers built on them) | **not implemented yet** — named per use (`BRG3020` summary: 272 typed references in A) |
| Package calls with named arguments (`dio`, Supabase `.order(ascending:)`, `withValues(alpha:)`) — "needs the callee's signature" | 77 | 457 | package boundary; refused |
| `dio` (`DioException` members, `Dio` calls) | 30 + 8 | — | **not implemented yet** (→ `fetch`) |
| Audio playback/recording, file picking | ~40 | — | **not implemented yet** (→ HTMLAudioElement / MediaRecorder / `<input type=file>`) |
| Design-system theme extension (`context.colors`, `context.palette`; `BRG3010` material roles from a theme built by a helper) | 36 + 31 | 221 + 310 | **not built**; `context` is refused as a `BuildContext` |
| Top-level `final` whose initializer builds a package object | 19 | 478 | the initializer's diagnostic + package named |
| Project top-level functions/classes reached through the above | 13 + 29 | 248 + 233 | follows the causes above |
| Everything else (catch clauses on types not testable at runtime, static fields, `debugPrint` — now lowered) | ≤ 50 | ≤ 900 | individually listed by the diagnostics |

Nothing was silently dropped between runs: every refusal is a diagnostic (`0` errors from the analyzer; each generator error names its construct), the generator still writes **nothing** on error,
and the count changes only where a construct was lowered (extensions, records, patterns, gestures, `LayoutBuilder`, route names, collection printing, `debugPrint`, numeric methods) or its
message was made specific. **Level 1** (analysis + honest refusal of the rest) is the state of both applications; Level 2/3 are not claimed.

## What phase 3 built (each with an ADR, a fixture compared with real Flutter/Dart, and mutants)

| ADR | Capability | Evidence |
| --- | --- | --- |
| 0068 | Extension members (methods, getters, setters, generic/nullable receivers); **incremental analyzer no longer serves a stale class when another file starts inheriting it** | oracle fixture; incremental regression + mutant |
| 0069 | Records; list/map/record patterns in declarations, `if`-case, `for`-in, switches | oracle fixture; 9 mutants |
| 0070 | `GestureDetector`/`InkWell`: tap, double tap, long press, tap down/up/cancel, hover, focus, Enter/Space, disabled — timings measured in `flutter test` | 11 oracle scenarios; Chromium (real mouse/keyboard); 17 mutants (11 in jsdom, 6 in Chromium); refusal fixture (pan/drag/scale/force-press by name) |
| 0071 | `LayoutBuilder` (constraints measured, structural height, rebuilt on resize/nesting); widget-returning builder closures; `num.round/floor/ceil/truncate/toInt/abs/clamp` | 7 oracle scenarios; Chromium resize of a container **and** the viewport; found two real defects the jsdom suite could not (shrink-wrapped parents, bound inside a scroller); 12 mutants |
| 0072 | `goNamed`/`pushNamed`/`pushReplacementNamed` by declared name; **a departure to any route is now lowered** (`logic.Navigate.route`) — none was before | analyzer tests + mutants; Chromium suite on a go_router app |
| 0073 | Package boundaries named (3 states), per-package summary, `BuildContext` refusal, top-level variable causes, collections in interpolation (18 vectors from Dart + oracle), `debugPrint` | unit tests + mutants |

## Silent defects found and fixed in this phase

An incremental run served a stale class after a cross-file inheritance change; hoisted callbacks typed a `TapDownDetails` parameter `unknown`; no navigation to a route was ever lowered
(only inline destinations); a collection in string interpolation was refused wholesale although Dart's text for `String`/`int`/`bool`/`double` elements is exactly reproducible; an app root's `routerConfig:` pulled a
`GoRouter` initializer into the module emitter (`BRG3013`); a refusal blamed "mutable state shared across requests" for a `final` whose initializer was a Riverpod provider.

## Performance (analyze + generate, real applications, this machine)

| | baseline `3490e6b` | now |
| --- | --- | --- |
| A — analyze (interleaved ×3) | 24.5 / 25.2 / 30.3 s | 25.7 / 32.5 / 27.7 s |
| A — generate | 0.6–0.7 s | 0.8–1.0 s |
| B — analyze (×3) | 79.0 / 74.0 / 78.3 s | 87.7 / 83.7 / 87.5 s |
| B — generate | 2.1–2.6 s | 2.1–2.5 s |

Roughly +5–10 % on analysis, inside this machine's run-to-run spread (±5 s on A); the analyzer now extracts more (extension functions, patterns, widget values), which is real work, not overhead.

## Not done (honestly)

Riverpod, `dio`, audio/recording/file-picker/Supabase adapters, the theme-extension model (`context.colors`), `go`'s replace-the-stack semantics and URL synchronisation, `pathParameters` on
named navigation, drag/pan/scale gestures, `BoxConstraints` minimum sizes; a large production app compiling and running in Chromium — **not achieved, not claimed**. FlutterBridge remains a
compiler for a stated subset that refuses the rest; it is not universally Flutter-compatible.

## Gates on the final tree

`just ci` exit 0 (1 663 TypeScript tests, 652 Dart tests, lint, codegen drift, dependency rules); `just release-check` exit 0; `just e2e` **90 tests** in Chromium (66 before this phase + 24 new: interaction
17, named routes 6 — production and development) all pass; `just determinism` byte-identical across every run. `git diff --check` clean. `fixtures/apps/hello_bridge/analysis_options.yaml` (the user's change)
is untouched and unstaged.


---

# Phase 4 — final generator burn-down (baseline `6767464`)

Commits `b713a96`, `80d3152`, `fa8b325` and this report; ADR-0074…0076; taxonomy in `docs/m14/`.

## A correction to phase 3's numbers

Phase 3 counted `bridge generate` errors. `bridge generate` ignores the normalizer's errors; `bridge build` does not, and **never reached the generator on either application** (A: 1 normalizer error, B: 58). Both are counted now
(`tools/taxonomy`). The phase-3 conclusion (Level 1) stands; its figures understated the distance.

## Real applications (read-only copies), `bridge build`

| | A (240 files) | B (21 packages, 127 routes) |
| --- | --- | --- |
| Analyzer errors | 0 | 0 |
| Normalizer errors, start of phase → now | 1 → **0** (`BRG2110`) | 58 → **23** (`BRG2110` ×35 fixed; `BRG2305` ×22, `BRG2301` ×1 remain) |
| Generator errors, start of phase → now | 523 → **536** | 4 444 → **5 451** (past the normalizer's 23) |
| `tsc` / `next build` / Chromium | not reached (a program with a generator error emits nothing) | not reached |

The generator counts **rose**, and that is a correction, not a regression: a project widget silently dropped every widget and list of widgets it was given (`Bar(actions: […])` emitted `<Bar />`), so the code inside was never reached; it is reached now and its
own refusals are counted. 20 / 26 unique root causes (`docs/m14/taxonomy-*.md`): Riverpod (A ~110, B ~1 570 + a cascade), the theme built by a helper (A ~90, B ~770), package calls with named arguments (A 64, B ~450), 57 same-named widgets in B, route-parameter forwarding (B 22).

## What phase 4 built and fixed

| ADR | Change | Evidence |
| --- | --- | --- |
| 0074 | **Widgets and widget lists passed to a project widget were silently dropped** — fixed; `BRG2110` no longer fires on lists of values; widget lists render as keyed children (the oracle harness now fails a scenario that logs a React key warning); `TextInputFormatter`s (were dropped with a warning); `TextFormField` forwards every parameter it has | 2 oracle fixtures, Chromium (dev, no key warning), 8 mutants |
| 0074 | **State shapes**: `setState(() => x = 1);` followed by statements ran none of them; a State field named like the widget's parameter read the parameter; `final`/`late final` State fields were unresolved; `async` closures lost `async`; `Future<T>`; `dynamic[…]`, `dynamic.toString()`; a generator crash on `map.toString()` | oracle fixture `state_shapes` + 3 analyzer tests + 4 mutants |
| 0075 | **`package:dio` on `fetch`** — the first library adapter; 17 outcomes checked against real dio talking to a real server; a repository over Dio compared in Flutter and the generated component; Chromium against real network routes (200, 201, 404, 500, refused connection) | 19 runtime tests, oracle, 6 E2E, 13 mutants |
| 0076 | Constant colours derived by alpha (`withValues(alpha:)`, `withOpacity`, `withAlpha`) are tokens; a class overriding `toString`/`==`/… is a class (`'$box'` printed `[object Object]`); identifiers named like `Object.prototype` members (a table lookup crashed the generator); `constructor` members refused by name | oracle fixture, robustness test, 5 mutants |
| — | Incremental analyzer matrix: 16 cross-file mutations (mixin, extension, inheritance in/out, generic bound, constant, enum, re-export, widget constructor / kind, part file, route tables, imports) — incremental ≡ clean for every one (no stale result found); the matrix fails when dependency fingerprints are ignored | `incremental_matrix_test.dart` |

## Not done (honestly, and why: `docs/m14/README.md`)

Riverpod; the theme-extension model and interprocedural theme extraction; audio, recording, file-picking, Supabase adapters; route parameters; same-named widgets across packages; drag/pan/scale gestures; `BoxConstraints` minimum sizes. **No real application reaches `tsc`, `next build` or Chromium.**
Level 1. FlutterBridge remains a compiler for a stated subset that refuses the rest; it is not universally Flutter-compatible.

## Gates on the final tree

`just ci` exit 0 (1 694 TypeScript tests, 676 Dart tests, lint, codegen drift, dependency rules); `just release-check` exit 0; `just e2e` **98 tests** in Chromium (production and development) pass; `just determinism` byte-identical across every run.
`fixtures/apps/hello_bridge/analysis_options.yaml` (the user's change) is untouched and unstaged.
