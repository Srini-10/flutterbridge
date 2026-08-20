# M7-L — Async/Duration/Future reality audit & minimal lowering

## Summary

`hello_bridge`'s `9` post-M7-K generation errors were never nine instances of one gap. Measured precisely:
three traced to `Duration`/`Future.delayed` (one node each, `Duration` firing two diagnostics on itself),
one to `FavoritesStore` (an unrelated user class, not Duration/Future at all), one to `ui.Async`
(`FutureBuilder`), two to multi-hop cross-route forwarding (`BRG3013`, protected), one to `themeMode`
(`BRG3016`, protected), and one roll-up. Only the first three were this milestone's to close.

The root cause was not a missing capability so much as a missing *connection*: the runtime kit already
carried a `Duration` class (mirrored for M4-H's implicit animations two milestones ago), and the generator
already lowered `await` mechanically (`logic.Await` → `await`, since M7-H). What was missing was three
small things — the generator recognizing `dart:core#Duration` as kit-provided at all (it only ever checked
for `package:flutter/`), a `delay(Duration): Promise<void>` primitive for `Future.delayed` to lower to, and
a latent defect the fix exposed: a component-scoped async action handler was never actually declared
`async` in emitted code, because the one await this whole M7 navigation arc has ever proven — a terminal
`await Navigator.push(...)` — has its `await` keyword dropped by M7-H's own terminal-navigate rule, so no
fixture before this one ever had a *surviving* await to catch it.

`hello_bridge`: **9 generation errors → 6.** Every `Duration`/`Future.delayed` diagnostic is gone; nothing
else changed. `ui.Async`, `FavoritesStore`, multi-hop, and `themeMode` remain exactly as they were —
protected, not chased. `async_push_guard` — M7-H/M7-J's own build-and-browser-proof fixture — now carries a
*real* `await Future.delayed(Duration(milliseconds: 30))` ahead of its `mounted` guard, the exact shape M7-J
explicitly deferred, and passes a real `tsc` build and 11 real Playwright tests (production and
development, including a Strict Mode replay) with a real, observable async boundary in the middle.

## Phase 1 — the remaining 9, precisely (not by category label)

| Node | Code(s) | Source | Concept | Owner |
|---|---|---|---|---|
| `8cc9be9067791166` (`logic.New`, `Duration`) | `BRG3002` ×2 (named-arg refusal + "own class" refusal — same node, two diagnostics) | `login_screen.dart:45:32` | Duration | generator (fixed) |
| `3baa0353ebf2ce8e` (`logic.New`, `Future.delayed`) | `BRG3002` ×1 | `login_screen.dart:45:11` | Future.delayed | generator (fixed) |
| `25442f46c7dbc1cd` (`logic.New`, `FavoritesStore`) | `BRG3002` ×1 | `home_screen.dart:32:37` | user class construction — **not Duration/Future** | generator (out of scope) |
| `e76fd47767744557` (`ui.Async`) | `BRG3007` ×1 | `home_screen.dart:65:13` | FutureBuilder loading/error branches | normalizer (Category D, out of scope) |
| `c05fd5c37c3f2f23`, `a064d4118e1cd9a8` | `BRG3013` ×2 | route `/` and the push at `login_screen.dart:55` | `isDark`/`onToggleTheme` multi-hop | N11 (protected) |
| — | `BRG3016` ×1 | `MaterialApp.themeMode` | theme mode switching | runtime kit (protected) |
| — | `BRG3005` ×1 | roll-up | "nothing emitted from a program with errors" | — |

So: **3 of 9 were Duration/Future** (one `Duration` node, one `Future.delayed` node, two diagnostics on the
Duration node). **1 of 9 was `FavoritesStore`** — a real user class construction, sharing `BRG3002`'s text
only because the generator's fallback message ("this application's own classes") does not distinguish an
unrecognized SDK type from a genuine user class; it is not Duration/Future and was not touched. **1 of 9 was
`ui.Async`.** **4 of 9 were explicitly protected** (multi-hop ×2, `themeMode`, roll-up). This is the
evidence the task's own instruction anticipated: nine diagnostics were never nine capabilities.

## Phase 2/4 — probes and existing architecture

Every Duration/Future shape probed came from real, already-committed fixtures — no hand-authored UIR:

- `Duration(milliseconds: 400)` — a `logic.New{type: {library: 'dart:core', name: 'Duration'}, namedArgs:
  {milliseconds: 400}}`. Fully, faithfully represented; nothing lost at extraction.
- `Future<void>.delayed(Duration(...))` — a `logic.New{type: {library: 'dart:async', name: 'Future<void>'},
  constructorName: 'delayed', args: [<the Duration node>]}`. Same: complete, faithful, resolved.
- `await <expr>` — `logic.Await{operand: <expr>}`, unconditionally lowered to `await <expr>` by the
  generator since before this milestone (`expression.ts`'s `logic.Await` case is one line and untouched).
- `_submit()`'s whole body — `sig.Action{isAsync: true, body: [logic.If, Assign, Assign, Await, If(mounted),
  Assign, Navigate]}` — every statement present, correctly ordered, `logic.Navigate` terminal. **Nothing
  downstream of the two Duration/Future nodes needed to change**; `mounted`, `Navigate`, promoted
  props/actions were already correct (M7-F/G/H/J). This is what made the fix small: the analyzer had never
  lost the information, and the schema had never lacked the vocabulary. The gap was entirely in the
  generator's recognition of two specific resolved types, plus a runtime primitive for one of them.

`isKitProvided` (`packages/generators/react/src/internal/emit/runtime.ts`) is the exact mechanism: "is this
constructed type's library one the kit mirrors." It checked only `library.startsWith('package:flutter/')` —
which is why `EdgeInsets`, `BoxConstraints`, `Alignment` all work, and why `dart:core#Duration` and
`dart:async#Future` both fell straight through to the generic "own class" refusal, indistinguishable from a
genuine unmapped user type.

**A load-bearing finding, not a design choice**: the kit's `Duration` class (`widgets/animation.ts`, M4-H)
already had exactly the shape needed (`Duration(milliseconds: 400)` → `new Duration({ milliseconds: 400
})`). Its own build-proof (`dart/bridge_analyzer/test/build_proof_test.dart`) passed `isKitProvided`
undetected — not because the check recognized `dart:core`, but because that test's *stub* Flutter package
declares its own fake `class Duration` under a synthetic `package:flutter/widgets.dart` namespace
(`build_proof_test.dart:228`). M4-H's animation proof was never actually exercised against the real Dart
SDK's `Duration`; `hello_bridge`, analyzed by the real Flutter SDK, is what first exposed that `isKitProvided`
never recognized the real thing.

## Phase 3 — three concepts, three answers

- **Duration**: adequate UIR representation, no extraction loss, generator lowering missing (`isKitProvided`
  recognition only), runtime support **already existed** (M4-H). Fix: recognition only.
- **Future**: adequate UIR representation for the measured subset (`Future.delayed(Duration)`, single-arg,
  awaited), no extraction loss, generator lowering missing, runtime support needed **one new function**
  (`delay`). Fix: recognition + one primitive.
- **ui.Async**: adequate UIR representation for *presence*, but the FutureBuilder's builder body — including
  its own loading/error `if`-checks — reaches normalization as **one opaque blob**
  (`{"kind":"ui.Opaque","reason":"builder body with statements"}`), not as separate structured branches.
  `BRG3007` is correctly refusing to invent a rendering for information the pipeline does not structurally
  have. This is Category D (STOP CONDITION 3) — decomposing arbitrary if/return-early control flow inside a
  builder into loading/data/error branches is a normalization-pass-sized capability, not a "smallest fix."
  **Not touched.**

## Phase 5 — Duration ownership

Real corpus uses of `Duration` this milestone had access to (`continuum`/`unichat` were not available in
this environment — see Phase 25): exactly one, `hello_bridge`'s own `Future.delayed(Duration(milliseconds:
400))` — a `Future.delayed` argument, not an animation duration, a debounce, or a timer. `async_push_guard`
now carries a second, identical-shape use (`milliseconds: 30`), added by this milestone as its own fixture.
Both classify as "Future.delayed argument." No other Duration use-form is evidenced, so no other use-form is
claimed supported. `Duration` remains the kit's existing class (M4-H) — carried, not reduced to a raw
millisecond number, so `Future.delayed(Duration(milliseconds: 400))` and the emitted `delay(new Duration({
milliseconds: 400 }))` read as the same statement side-by-side (the override-review principle
`widgets/animation.ts`'s own `Duration` docstring already states).

## Phase 6/7 — Future ownership, and `Future.delayed`

No `Future` compatibility class was created. The measured subset — `await Future<void>.delayed(const
Duration(...))`, no computation callback, awaited in statement position — maps exactly to `await
delay(Duration): Promise<void>`, a single new runtime function. Investigated and deliberately **not**
supported in this milestone:

- **`Future.delayed(duration, computation)`** — the two-argument, callback-bearing overload. `delay` is
  `Promise<void>`; there is nothing in it to resolve a callback's result into. Refused by a dedicated
  diagnostic (`BRG3002`, naming the missing capability precisely) rather than silently dropping the
  callback — tested (`generate.test.ts`, "a computation-bearing Future.delayed is refused by name").
- **`Future.value(...)`, `Future.error(...)`, `.then()`/`.catchError()` chaining** — no measured use in
  either fixture; not probed, not implemented, still an ordinary unmapped-construction refusal. Tested
  explicitly (`generate.test.ts`, "Future.value(...) — a different constructor — is not mistaken for the
  delayed(...) shape") to prove the recognition is `typeName === 'Future' && library === 'dart:async' &&
  constructorName === 'delayed'` together, not `typeName === 'Future'` alone.
- **Error propagation**: not tested against a real fixture, because no measured `Future`/`await` in either
  corpus this milestone had contains a `try`/`catch`. `logic.Await`'s lowering is a bare `await <expr>`, and
  a native `await` in emitted TypeScript already rethrows synchronously into whatever `try`/`catch` (or lack
  of one) surrounds it in the *emitted* code — which is exactly what surrounds it in the *source*, since
  statement structure (including `try`/`catch`) is preserved unconditionally by the existing statement
  emitter. Nothing in this milestone's change touches that path, so nothing needed proving that M7-H's own
  `logic.Await` lowering did not already establish. No `try`/`catch` around `await Future.delayed(...)`
  exists in either fixture to demonstrate it against, so this is stated as an architectural consequence
  rather than as something browser-proven this milestone.

## Phase 8/9 — recognition, and no schema change

Recognition is entirely by resolved type/library/constructor-name, in the generator, reusing the exact
pattern `isKitProvided` already established for `package:flutter/` types — never a textual match on
`'Future.delayed'`. `SDK_VALUE_TYPES` (`runtime.ts`) is a small, explicit, documented set —
`dart:core#Duration` is its only member — deliberately not a blanket `dart:core`/`dart:async` rule, because
those namespaces carry far more than the kit mirrors (`String`, `List`, `RegExp`, `StackTrace`...). No
schema amendment, no ADR: `logic.New`, `logic.Await`, and the existing `TypeRef.library` already carried
every fact the fix needed. Confirmed by re-reading the extracted `Duration`/`Future.delayed` nodes above —
zero information loss at extraction, before this milestone began.

## Phase 10/11 — `ui.Async` audit, left alone

Traced the one real `ui.Async` node (`home_screen.dart:65`, `FutureBuilder<List<Item>>`). It carries
`source: bind.Signal` (the `_itemsFuture` field) and `dataParam: 'snapshot'`, but its `data` is a single
`ui.Opaque{reason: "builder body with statements"}` — the entire builder body, including its own
`connectionState == waiting`/`hasError` checks, as one blob of Dart source text. The analyzer/normalizer do
not currently decompose that control flow into loading/data/error UI branches. `BRG3007` refuses to invent
one. Mapping `ui.Async` to React Suspense was considered and rejected outright — Suspense's semantics
(throwing a promise, a boundary catching it) share nothing with `FutureBuilder`'s (a builder called on every
`AsyncSnapshot` state) beyond the word "async," and choosing it because of that word would be exactly the
architectural guessing the task instructions warn against. Left untouched.

## Phase 12/13 — error semantics, return values

`Future<void>` is the only awaited-type this milestone measured (`_submit()`'s own return type, and
`Future.delayed`'s). No `Future<bool>`/`Future<int>` await-and-use-the-result shape exists in either
fixture, so none is claimed supported — this milestone's capability is narrower than general `await`
return-value handling: it is specifically "a statement-position `await Future.delayed(Duration(...))`,
whose value (`void`) nothing reads." `logic.Await`'s own lowering (`await <expr>`, an *expression*, not
special-cased to statement position) means `const result = await someFuture` would already lower correctly
for any `someFuture` the generator can otherwise construct — but no fixture measures that shape for a
`Future` the generator *can* build (only `Future.delayed` is supported, and its own value is `void`), so it
is not claimed proven.

## Phase 14 — the real async fixture

`async_push_guard` (M7-H/M7-J's own fixture) was extended, not duplicated: `home_screen.dart`'s `_submit()`
gained `await Future<void>.delayed(const Duration(milliseconds: 30));` immediately before its `mounted`
check — the exact shape M7-J's own doc comment explained away as blocked. 30ms: enough for a real,
non-flaky window for Playwright to observe (button disabled, then not), short enough that no test waits on
it meaningfully. Regenerated from the real analyzer (`dart run bin/bridge_analyzer.dart`), normalized with
the real `bridge normalize`, and the committed goldens (`fixtures/uir/async_push_guard.{ndjson,
normalized.ndjson}`) updated to match — no hand-authored UIR anywhere in this milestone's proof chain.

A real, previously-latent defect surfaced immediately: `tsc` refused the emitted handler with `TS1308:
'await' expressions are only allowed within async functions`. `declareLocalActions`
(`packages/generators/react/src/internal/emit/component.ts`) unconditionally emitted `(...) => {` for every
component-scoped action handler, never checking `sig.Action.isAsync` — because M7-H's terminal-navigate rule
drops the `await` off a trailing `Navigator.push` (nothing follows it to sequence with), so the *one* await
every prior fixture had never actually survived into the emitted body, and nothing had ever exercised a
handler with a real, surviving `await`. Fixed to check `isAsync`, matching the pattern `store.ts` already
used for store-owned actions.

## Phase 15/16 — the browser proof

**Positive** (Phase 16): both Playwright specs for `async-push-guard` — production
(`e2e/tests/async-push-guard.spec.ts`) and development (`...dev-only.spec.ts`, including Strict Mode's
mount→cleanup→remount replay) — pass in full against the real generated app, real `tsc`, real `next build`.
The existing "button disables while submitting" test was strengthened: it now asserts the button is
*observably* disabled during the real 30ms window (`await expect(button).toBeDisabled()`), which was not
reachable before this milestone — the handler had nothing to await, so the disabled state and the
destination screen could appear within the same microtask flush. 11/11 tests pass, both builds, with no
console errors, no hydration mismatch, no hook-order violation, and the promoted-signal/destination-props
chain (M7-F/G) still crossing the push boundary correctly.

**Negative (unmount-during-real-await)** (Phase 15): proven at the runtime unit level, against the *exact*
artefact this milestone adds — not a stand-in. `packages/runtimes/react/tests/react.test.ts` gained a test
that starts a handler awaiting the real `delay(new Duration({ milliseconds: 30 }))`, unmounts the component
while the (fake-timer-controlled) delay is still pending, then lets the timer fire — `mounted.current` reads
`false` throughout, and the code after the await observably sees `false`. This is the same race M7-J's own
snapshot-bug proof established, run against M7-L's real primitive instead of a hand-resolved `Promise`.

**Not attempted**: a literal browser-level unmount-during-await proof for `async_push_guard`, and here is
the honest reason rather than a convenient stop. `HomeScreen` is this fixture's *root* route — there is no
second entry point and no "back" affordance reachable *before* signing in, so nothing a real user can click
unmounts `HomeScreen` while its own `_submit()` is suspended. A `page.reload()`/`page.goto()` mid-flight
would destroy the whole JS execution context outright (the pending `setTimeout` never fires at all), which
would prove nothing about `useMounted()`'s guard — that outcome is identical whether the guard exists or
not, so it would be a test that always passes regardless of what it is testing, not a proof. Contriving a
second route or affordance solely to manufacture a real-browser unmount would be adding fixture surface area
this milestone does not need to establish the semantic guarantee, which the runtime-level proof above
already establishes rigorously and against the real primitive. This is recorded here rather than silently
narrowed, per the task's own instruction not to overclaim coverage.

## Phase 17 — timing

30ms, chosen for `async_push_guard`'s Duration. Long enough that a real `setTimeout` genuinely yields to the
event loop (proven at the unit level: "a zero duration still resolves asynchronously, not synchronously" in
`delay.test.ts`) and that Playwright's `toBeDisabled()` assertion has time to observe the pre-navigation
state; short enough that no test in either spec file waits on it explicitly — every assertion is an
`expect(...).toBeVisible()`/`toBeDisabled()` poll, not a fixed sleep.

## Phase 18 — `hello_bridge`, before/after

| | Before (M7-K baseline) | After |
|---|---|---|
| Total `bridge generate` errors | 9 | **6** |
| Duration/Future (`BRG3002`, 2 nodes) | 3 diagnostics | **0** |
| `FavoritesStore` (`BRG3002`, unrelated) | 1 | 1 (unchanged) |
| `ui.Async` (`BRG3007`) | 1 | 1 (unchanged) |
| Multi-hop (`BRG3013`) | 2 | 2 (unchanged) |
| `themeMode` (`BRG3016`) | 1 | 1 (unchanged) |
| Roll-up (`BRG3005`) | 1 | 1 (unchanged) |
| Files emitted | 0 | 0 (still refused — 5 unrelated errors remain) |

`hello_bridge` was not modified to improve this count. `fixtures/uir/hello_bridge.{ndjson,normalized.ndjson}`
are byte-identical to their M7-K committed state — this milestone's fix is entirely in the generator/runtime,
not the analyzer, and the analyzer's own extraction of `Duration`/`Future` was already complete and correct.

## Phase 19/20 — protected boundaries, untouched

`BRG3013` (multi-hop) and `BRG3016` (`themeMode`) fire identically before and after, same messages, same
count, same node ids. No forwarded-parameter provenance was inferred by name; no component interface was
rewritten; no theme-mode switching was implemented. `N11`/`ADR-11`'s multi-hop refusal and the runtime kit's
single-brightness-per-tree design are both exactly as M7-E3/ADR-13 left them.

## Phase 21/22/23/24 — regression

- **M7-K** (material theme tokens): `BRG3010` count for `hello_bridge` remains `0`. `material3Baseline`,
  its 46 light + 46 dark roles, and explicit-theme precedence are all unmodified — N10 was not touched this
  milestone either.
- **M7-J** (mounted lifecycle): `componentMounted`/`contextMounted`/`useMounted()` behavior unchanged;
  Strict Mode replay, Rules of Hooks, and two-instance isolation all still pass (`react.test.ts`, full suite
  green, 395/395). The new real-Dart-await browser proof (Phase 15/16 above) exercises this exact machinery
  against a real await for the first time and it holds.
- **M7-H** (terminal awaited navigation): the rule that drops `await` off a trailing `Navigator.push` is
  unchanged and is in fact what *exposed* the `declareLocalActions` async-declaration defect this milestone
  fixed — general `await` support did not broaden it; the terminal-navigate special case was not touched.
- **M7-F/G** (promoted store consumption, inline destination props): `async_push_guard`'s own
  `count`/`onIncrement` promotion and `DetailScreen`'s destination props are asserted unchanged in
  `async_push_guard_build.test.ts` and proven live in the browser suite (Phase 16). `counter`,
  `promoted_counter`, `inline_push_props` — none of which contain `isAsync` actions or Duration/Future
  constructions — are byte-identical (`git diff --stat fixtures/uir/` touches only `async_push_guard.*`).

Full suite counts: `dart test` 262/262 (unchanged — no Dart code was touched this milestone), `@bridge/gen-
react` 199/199 (was 194 at the M7-K baseline; +5 new: 4 M7-L unit tests + 1 async-handler test), `@bridge/
runtime-react` 395/395 (was 391 at baseline; +4 new: 3 `delay` tests + 1 real-primitive snapshot-bug proof).

## Phase 25 — corpus measurement

`continuum` and `unichat` were not available in this environment. Corpus measurement is stated as
unavailable rather than assumed: `Duration`/`Future`/`ui.Async` support claims in this document are scoped
to what `hello_bridge` and `async_push_guard` actually measure — one `Future.delayed(Duration)` shape, one
`ui.Async`/`FutureBuilder` shape — and no broader compatibility is claimed.

## Phase 26 — diagnostics

The new `Future.delayed` computation-callback refusal names the missing capability precisely ("an
asynchronous computation, not just a wait. Owner: the runtime kit") rather than falling back to a generic
"unsupported" message. No existing diagnostic was weakened: `BRG3010`'s widget-role refusal, `BRG3007`'s
`ui.Async` refusal, `BRG3013`'s multi-hop refusal, and the plain "own class" `BRG3002` for a genuine
unmapped type (`FavoritesStore`, `Future.value`, any other unrecognized `dart:async`/`dart:core`
construction) all fire exactly as before, tested explicitly for the `Future.value` case.

## Phase 27/28 — determinism and fixed point

`fixtures/uir/async_push_guard.{ndjson,normalized.ndjson}` were regenerated from the real analyzer and real
`bridge normalize`; both diffs are minimal (8 lines each, entirely inside the one `sig.Action` node's own
content — record *count* is unchanged, since the action's body is a nested tree within one NDJSON line).
`hello_bridge`'s own analyzer output is confirmed byte-identical to its M7-K committed state. `just
determinism` (byte-identical UIR/normalized/generated output across repeated clean runs, for `counter`,
`promoted-counter`, `inline-push-props`, `async-push-guard`) and the normalization fixed point were run as
part of the full validation gate — see the commit's CI record for the exact run.

## Phase 29 — full validation

`just ci`: green. `dart/bridge_analyzer` 262/262. `@bridge/gen-react` 199/199 (build-proof included, real
`tsc` against real `@bridge/runtime-react`). `@bridge/runtime-react` 395/395. `pnpm run codegen:check`: not
re-run for schema/catalog (neither changed this milestone) but exercised as part of `just ci`. Playwright:
`async-push-guard-production` and `async-push-guard-development` — 11/11, both green, real `next build`
against the repacked `@bridge/runtime-react` tarball. `just determinism`: green.

## Remaining blocker categories (Phase 35)

- **`ui.Async`/`FutureBuilder`** — Category D, needs a normalization-pass-sized capability (structured
  loading/data/error decomposition from arbitrary if/return-early control flow) this milestone did not
  attempt to build.
- **User class construction** (`FavoritesStore`, and generally) — `logic.ClassDecl` lowering to a TypeScript
  class. Not Duration/Future; a distinct, larger, pre-existing generator gap.
- **Multi-hop cross-route forwarding** (`BRG3013`) and **`themeMode`** (`BRG3016`) — both explicitly
  protected by this milestone's instructions, unchanged.
- **`Future.delayed`'s computation-callback overload**, **`Future.value`/`.then()`/error chaining** — no
  measured need in either fixture; diagnosed precisely, not implemented.
- **Corpus-wide Duration/Future/ui.Async coverage** — unmeasured; `continuum`/`unichat` unavailable.

## Recommendation for M7-M

The `Duration`/`Future.delayed` gap is closed for the measured subset. The next highest-value, evidenced gap
in `hello_bridge`'s own remaining diagnostics is `FavoritesStore` — a real, plain user class the generator
refuses to construct because M3-B never emits `logic.ClassDecl`. Unlike `ui.Async` (which needs new
normalization-pass capability) and unlike multi-hop/`themeMode` (both explicitly out of scope by design),
user-class-construction lowering is a single, well-bounded generator capability whose absence is a `BRG3002`
this milestone's own audit surfaced as `hello_bridge`'s only remaining non-protected, non-`ui.Async` blocker.
It is not started here, per this milestone's own scope.
