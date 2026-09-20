# ADR-54 — Silent semantic loss: what an audit of the whole pipeline found, and what now happens instead

- **Status:** Accepted (M11). Every item was found by *running* a construct through `bridge generate` and reading the emitted
  code, not by reading the compiler. Each is now either **lowered exactly** (verified against real Dart or Flutter) or
  **refused by name**; none is left compiling to something else.
- **Date:** 2026-09-20

## Method

A probe app per construct, generated with the real CLI, the emitted TSX read against what Dart does. The criterion was narrow on
purpose: a build that *succeeds* (no `BRG` error, no `tsc` failure) and behaves differently. Loud refusals are the design and
were not counted. Three independent probes (a subagent's, the browser proof's, and an identifier-hygiene probe) found the items below; the second
found a defect in ADR-0052's own first implementation.

## Findings and dispositions

| # | Dart | What the build produced, silently | Now |
|---|---|---|---|
| 1 | `s.isEmpty`, `s.isNotEmpty`, `s.contains`, `padLeft/Right`, `s * n`, `n.isEven/isOdd/isNegative`, `d.isNaN/isFinite` | the Dart member name on a JS value: `undefined`, `TypeError`, `NaN`. A `validator`'s `s.isEmpty` never fired | **Lowered** by the receiver's resolved type to runtime helpers, 1 824 cases from real Dart (`str_cases.json`); every other `String` member and numeric getter is **refused by name** (`sdk_members.ts`) |
| 2 | `switch (x) { case 0: … }` | every case emitted as `case undefined:` — the analyzer read `SwitchCase.test`, and Dart 3 makes every `case X:` a `SwitchPatternCase`. A `switch` matched nothing | analyzer reads constant patterns; a non-constant pattern or a `when` guard is an opaque expression (refused); `default` and an empty (falling-through) case are emitted correctly |
| 3 | `a++ + ++b`, `if (++w > 4)`, `x = y = 3` | a signal write's value is `undefined`; `w = w + 1 > 4` assigned the *comparison*; postfix returned the *new* value | an assignment used as a value is wrapped to have Dart's value (`x++` the old one); statement position is unchanged |
| 4 | `f.call(3)` | `f.call(3)` — `Function.prototype.call`, which passes no argument | `f(3)` |
| 5 | `future.catchError(f)`, `.whenComplete(f)` | a method a `Promise` does not have | `.catch`, `.finally` |
| 6 | `a.b?.c`, `widget.x?.y` | the `?.` **silently dropped** for a receiver that was not a bare name (SDK members only) | field-read chains are guarded (`a.b != null ? a.b.c : null`); anything else is an opaque expression, refused |
| 7 | `const W({int x = 1}) : x = x * 2`, `W.named()`, `factory W.make()` | the initializer list, the named and the factory constructor absent from the component | **BRG1309**, an analyzer error |
| 8 | `final int base = 10;` on a widget | `useDefaults(…, { base: null })` (a regression of ADR-0053, found by the audit) | the initializer is the default |
| 9 | `deactivate()`, `activate()` bodies | discarded — never an effect | modelled as lifecycle effects and **refused** (BRG3013) |
| 10 | `enum Level { a(1); final int w; }`, `k.name`, `k.index`, `'$k'` | fields and methods `undefined`; `'$k'` printed `a`, Dart `Level.a`; `.name` `undefined` | reading a field or method an enum declares is **BRG1312** (declaring one, and using the enum by value, is fine); `.name` is the value; `'$k'` prints `Level.a`; `.index` is opaque (refused) |
| 11 | `Text(style:, textAlign:, maxLines:, overflow:)` | dropped, no diagnostic (other widgets got `BRG3001`) | `BRG3001` warning per dropped key |
| 12 | `TextButton`, `OutlinedButton`, `FilledButton` | all rendered as `ElevatedButton`, silently | warning naming the approximation |
| 13 | `SizedBox.expand()` | sized to its child (no argument, so nothing to drop) | refused by name |
| 14 | `-0.0`, `0.0 * -1`, `1e308 * 10` | N6 folded to JavaScript `-0`, which canonical JSON writes as `0`: `(-0.0).isNegative` false | N6 declines to fold a result canonical form cannot write |
| 15 | `useInitState` (ADR-0052) | run **twice** under development StrictMode — a `useState` initialiser is invoked twice — so `_n = _n + 41` gave 83 | guarded once per kept instance; caught by the browser proof, not the jsdom suite |
| 16 | an inline callback that writes and reads the same signals (`_a = _a + s; _a = _a + s; _b = _a * 2`) | the callback read the **render-time snapshot** (`_a$`), fixed at the render that created it, so the second statement saw the first's stale value: +1 where Dart adds 2, `_b` from the old `_a`. Only a callback that stays inline is affected (a lifted action reads `.get()`); found by the hygiene probe, invisible to every text-pinning test | an inline callback reads `.get()`, the value *now* |
| 17 | two different nodes with one id; a malformed document | `Program.of` kept the last of two colliding nodes; `bridge inspect` on a truncated file printed a Node stack trace | a collision is an `IdentityCollisionError`; a malformed document or an unknown kind is a `LoadError` (exit 3, a message) |

Also: the e2e harness reused a runtime tarball from weeks earlier ("built if it is not there"), so the browser suite could have
tested code that no longer existed; it now re-packs when the kit is newer.

## What the audit did not resolve (each is refused or a `tsc` error, never silent, unless noted)

- `List.from` / `List.of`, `Iterable.fold/reduce/expand/firstWhere`, spread, collection-`if`/`for` in a *non-widget* collection.
- A `late final x = _other` initializer; a project-class instance held as a `final` field (`BRG3006` — `hello_bridge`).
- The build-local nullable narrowing (`final b = m['k']; b == null ? … : b.join()`) — the inlined read loses its narrowing; `tsc` reports it.
- `setState(() {})` re-renders nothing and a State-field write re-renders without `setState` (ADR-0048).
- `Dart substring` and other range errors on `String` members not listed above are refused, not modelled.
- Not silent, but a large surface: freezed/part-file classes (`BRG1201` stops the analyzer), widget-returning helpers, spread/`for`
  in children, project class members, top-level declarations, go_router shapes, `InkWell`/`LayoutBuilder`/`showDialog`. Two real
  applications were analysed read-only (see the final audit report); neither compiles.

## Evidence

`fixtures/apps/sdk_semantics` — string members, number getters (including `-0.0`), a `switch` over an `int`, a `String` and an
`enum` (grouped cases, `default`, exhaustive), increments used as values, `.call`, `Future.whenComplete`, `?.` on a prop, and enum
`name`/interpolation — run by Flutter and as the generated component, compared per step. Seven mutations killed (`isEmpty` as a JS
property, `padLeft` as `padStart`, a test-less case as `case undefined`, no fallthrough, postfix returning the new value, an
unwrapped assignment value, `.call`). Analyzer tests for BRG1309/BRG1312, constructor defaults, positional names and switch cases;
an N6 test for `-0`/`Infinity`.
