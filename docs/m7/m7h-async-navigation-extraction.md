# M7-H — Async navigation & mounted control-flow extraction

Makes the real `hello_bridge` inline `Navigator.push` reach the already-working M7-G navigation/
generator path. Closes the gap left open by every prior M7 navigation milestone: `login_screen.dart`'s
own push is inside an `async` method, behind an `await`, guarded by `mounted`, and the push call itself
is awaited — a shape nothing before this milestone extracted correctly.

## Baseline failure, traced to its exact point (Phase 1)

`hello_bridge`'s `_submit` (`login_screen.dart:31-64`) does:

```dart
Future<void> _submit() async {
  // ...validation, setState...
  await Future<void>.delayed(const Duration(milliseconds: 400));
  if (!mounted) return;
  // ...setState...
  await Navigator.push<void>(context, MaterialPageRoute<void>(
    builder: (BuildContext context) => HomeScreen(isDark: widget.isDark, onToggleTheme: widget.onToggleTheme),
  ));
}
```

Traced through the real pipeline: the analyzer extracted `_submit`'s entire body faithfully — every
statement, in order, including a `logic.Await` for the delay, a `logic.If{test: logic.Unary(!, logic.Ref
('mounted'))}` for the guard, and an `app.RouteTransition` for the push (transition **recognition**
already worked, via the ordinary expression walk). What was missing: the push statement itself never
became `logic.Navigate`. It reached the document as a bare `logic.ExprStmt` wrapping the `logic.Await`,
and the generator refused it with `BRG3008` ("nothing performs this transition") — the same symptom
`docs/m7/gap-inline-push-props.md` originally recorded, and the reason M7-G's own `inline_push_props`
fixture had to avoid `hello_bridge`'s push entirely.

## Reduction ladder (Phase 2)

A throwaway fixture (`/tmp/ladder`, not committed) with six buttons, run through the real analyzer:

| Probe | Shape | `logic.Navigate` before this milestone |
|---|---|---|
| A | synchronous push | yes |
| B | async callback, push not awaited | yes |
| C | async + await, push not awaited | yes |
| D | await + `mounted` guard, push not awaited | yes |
| E | await + `context.mounted` guard, push not awaited | yes |
| F | await + `mounted` guard, **push itself awaited** | **no** |

Five of six already worked. Async, `await`, and both spellings of `mounted` were already faithfully
represented and already reachable to the navigation recognizer — the smallest failing delta is exactly
one thing: **the push call itself is the operand of an `AwaitExpression`**, not a bare
`ExpressionStatement.expression`. This directly answers Phase 12's own question: the blocker genuinely
is what the milestone's hypothesis said, just narrower than "async/mounted" — it is specifically
*an awaited navigation call*.

## Root cause (Phase 4/5)

`statement_extractor.dart`'s `ExpressionStatement()` case checked `expression is MethodInvocation`
directly before offering the call to `navigateOf` (the function that turns a recognized navigation into
`logic.Navigate`). That check is `false` when `expression` is an `AwaitExpression` wrapping the call —
so an awaited push fell through to the generic `logic.ExprStmt` branch, and the departure stayed
unperformed even though the edge (`app.RouteTransition`) existed. A pure traversal hole, exactly the
shape M7-A found once before (block-form vs. arrow-form lambdas) — not a recognition problem, and not a
schema gap. No frozen-schema change was needed anywhere in this milestone.

**What the schema already represented, confirmed by the reduction ladder rather than assumed (Phase 4):**

1. An async `sig.Action` — `isAsync: true`.
2. `await expression` — `logic.Await{operand}`, already lowered by the generator (`` `await
   ${emitExpression(operand)}` ``).
3. Statement ordering across `await` — preserved; probes D/E/F's bodies extract in source order with
   nothing reordered.
4. `return` inside a guard — `logic.If{test, then: logic.Block[logic.Return]}`, ordinary and already
   correct.
5. `if (!mounted) return` — extracts and (after this milestone) still lowers the navigation that follows
   it.
6. `mounted` vs. `context.mounted` — genuinely distinguished at the expression level: `mounted` is
   `logic.Ref{name: 'mounted'}`; `context.mounted` is `logic.PropertyAccess{property: 'mounted',
   receiver: logic.Ref{name: 'context'}}`. Neither is a special construct — both compose freely inside
   `logic.Unary`/`logic.Binary`, so a compound guard (`if (result == null || !mounted) return;`) needs no
   new vocabulary either.
7. Navigation after an `await` remains structurally reachable — the transition was always minted; only
   the statement-level lowering was missing.

## The fix (Phase 8) — a traversal fix, not a second navigation representation

`statement_extractor.dart`'s `ExpressionStatement()` case gained one more branch: when `expression` is
an `AwaitExpression` wrapping a `MethodInvocation`, and that statement is the **last statement of its
own function's top-level body** (`_isLastStatementOfFunctionBody`), it is offered to the same
`navigateOf` the un-awaited path already uses — no second algorithm, no new node kind.

**Why the last-statement condition, and why not more:** the runtime kit's `push`/`replace` are
synchronous (`RouterInstance.push(destination): void`) — there is no way to await the eventual pop, so
dropping the `await` is unobservable exactly when nothing in the function runs after it. Dropping it when
something *does* follow would silently start that continuation immediately instead of waiting for the
user to navigate back — precisely the reordering Phase 6 forbids. So the unsafe shape (an awaited push
with code after it) is left exactly as it was: a generic `logic.ExprStmt`, refused by the same `BRG3013`
as before, never silently lowered. This is deliberately narrow — a statement last in a *nested*
`if`/`while`/`try` block is not covered, on the same "no evidence, no broadening" discipline the
milestone's own brief states; `hello_bridge`'s real shape, and every committed fixture, is the simple
case (last statement of the function's own body).

## A second, generator-side gap this milestone's own evidence surfaced (Phase 14)

Re-measuring `hello_bridge` after the analyzer fix found a *new* diagnostic: `BRG3006`, "a navigation is
lowered outside a component, so there is no router in scope for it." `component.ts`'s `declareRouter`
decided whether to call `useRouter()` by walking `component['render']` for a `logic.Navigate` —
`containsNavigate(component)`. `_submit` is a **named** `sig.Action`, referenced from the render tree
only by id (`onPressed: _isSubmitting ? null : _submit`), not embedded in the render tree's own JSON
structure — so `containsNavigate` never saw its `logic.Navigate`, `useRouter()` was never declared, and
the now-correctly-lowered navigation had nowhere to read `router` from.

This is squarely on the path this milestone's own mandate names ("make the real `hello_bridge` inline
`Navigator.push` reach the already-working M7-G navigation/generator path") — not multi-hop promotion,
not named-route navigation, not overlays, not general async-language support — so it was fixed here
rather than left as a second, adjacent gap. `declareRouter` (renamed check: `navigatesSomewhere`) now
also walks every `sig.Action` the render tree references (`referencedActions`, the same list
`declareLocalActions` already resolves) for a `logic.Navigate`. One new parameter (`scope`, already
available at the call site), no new mechanism.

## Transition identity (Phase 9)

Proven by equality, not presence, in both the Dart-side reduction-ladder tests and the TypeScript
build-proof: `logic.Navigate.transition === app.RouteTransition.id` for the awaited-push shape, exactly
as M7-B/M7-G already required for every other navigation form.

## Destination arguments (Phase 10/11) — M7-G is fed, not bypassed

`fixtures/apps/async_push_guard` (Phase 16's dedicated fixture) pushes a `DetailScreen(title:
'Authenticated', count: _count, onIncrement: _increment)` from the awaited, mounted-guarded push.
Verified through the real pipeline:

- Before N11: the transition carries all three arguments; `DetailScreen` declares all three params.
- After N11: `count`/`onIncrement` are promoted into `app.Store{origin: 'promoted'}` (one signal, one
  action) — N11's existing single-hop consensus, unmodified by this milestone; `title` remains an
  ordinary route argument.
- The generator's diagnostics confirm every M7-H-relevant check clears: no `BRG3008`, no "needs
  lowering" refusal, no "no router in scope," no unreachable-argument refusal for this push. `BRG2305`
  (multi-hop forwarding) is untouched — measured identical, before and after, on `hello_bridge` itself
  (still `×4`), so this milestone did not weaken it.

## Negative control and no-silent-guard-loss (Phase 12/13)

Both proven directly in `dart/bridge_analyzer/test/transition_test.dart`'s `m7hAsyncNavigation` group:

- An application's own `myNavigator.push(...)`, awaited, produces no `app.RouteTransition` and no
  `logic.Navigate` — recognition still gates on the resolved element (`registry.navigationActionOf`),
  never on the spelling `push`.
- An awaited push with code still to run after it (`await Navigator.push(...); await doSomething();`)
  produces an `app.RouteTransition` (recognition is unconditional) but **no** `logic.Navigate` — it stays
  refused by the generator's existing `BRG3013`, never silently lowered with the wrong timing. A
  mutation check (temporarily removing the last-statement condition in `packages/generators/react`'s
  `component.ts` equivalent and in the analyzer) confirmed the committed tests fail without the fix.

## M7-F/M7-G regression (Phase 15)

`store_consumption.test.ts`, `promotion_build.test.ts` (M7-F) and `inline_push_build.test.ts`,
`generate.test.ts`'s route-argument tests (M7-G) all pass unchanged in the same
`pnpm --filter @bridge/gen-react test` run as this milestone's new tests (187 tests, 12 files, all
green). `inline_push_props`'s generated output (both `home-screen.tsx` and `page.tsx`) is byte-identical
to its pre-M7-H bytes — the `containsNavigate`/`navigatesSomewhere` change only adds a check, it does not
change behavior for a component whose navigation is already inline.

## `hello_bridge` before/after (Phase 14/16)

Measured by generating from a **freshly re-run** `hello_bridge.ndjson`/`.normalized.ndjson` (not the
committed goldens — this milestone is analyzer-side, so they legitimately changed; see "Golden
discipline" below) through the pre- and post-M7-H generator, back to back, in the same session:

| | M7-G baseline | after the analyzer fix alone | after both fixes (final) |
|---|---|---|---|
| total diagnostics | 30 | 29 | **28** |
| `BRG3008` (unroutable) | 1 | 0 | **0** |
| `BRG3013`, "needs lowering an imperative navigation call" | 1 | 0 | **0** |
| `BRG3013`, multi-hop forwarding unreachable (route `/` + this push, `screenFor`'s own check) | 2 | 2 | **2**, unchanged |
| `BRG3006`, "no router in scope" | 0 | 1 | **0** |
| `BRG3006`, `mounted` unresolved | 1 | 1 | **1**, unchanged |
| `BRG2305` (compiler/N5, multi-hop forwarding, unrelated) | 4 | 4 | **4**, unchanged |
| everything else (theme tokens, opaque classes, `ui.Async`, `themeMode`) | unchanged | unchanged | **unchanged** |
| files emitted | 0 | 0 | **0** |

(`BRG3013` covers two unrelated situations here, both correctly unaffected by this milestone except
the first: a generic "this call needs lowering" refusal — gone, since the push now lowers — and a
per-boundary "this argument's value is unreachable" refusal `screenFor` (M7-G) reports for *both* the
route and the push, because `LoginScreen` only forwards `isDark`/`onToggleTheme` without reading them —
exactly the multi-hop shape M7-E3 correctly declines to promote. `BRG2305` is the same underlying fact,
reported at the compiler layer instead of the generator's.)

`login_screen.dart`'s push is now `performed` (`logic.Navigate` names the exact
`app.RouteTransition`), its router is correctly declared, and its destination arguments resolve through
M7-G exactly as `HomeScreen`'s route-table entry already did — reported via the same `BRG3013`
(unreachable-state, multi-hop) the declarative route already carried, not a new failure mode.
`hello_bridge` still does not emit files: 27 diagnostics remain, all pre-existing and unrelated
(`mounted`'s own generator/runtime resolution, `Duration`/`Future` treated as opaque application classes
with named constructor arguments, 18 missing Material theme-token roles, an unmodelled `ui.Async`, and
`MaterialApp.themeMode`) — none touched by this milestone, none weakened.

## Golden discipline (Phase 15)

`fixtures/uir/hello_bridge.ndjson`/`.normalized.ndjson` are **not** regenerated by this milestone. This
is analyzer-side work, so re-running the analyzer over the unmodified `hello_bridge` source legitimately
changes its raw UIR (the push now extracts to `logic.Navigate`, not a bare `logic.ExprStmt`) — but the
existing goldens are the input `build.test.ts`'s own suite and several other tests assert specific
diagnostic counts and shapes against, and `hello_bridge` still cannot reach a clean build regardless of
which golden is committed. Regenerating them is a separate, deliberate act with its own diff to review,
not a byproduct of this milestone; left for whichever future milestone actually closes one of
`hello_bridge`'s remaining, unrelated gaps and needs the refreshed measurement.

## Dedicated fixture (Phase 16) — `fixtures/apps/async_push_guard`

`HomeScreen`'s `_submit` (named async method, tear-off-referenced, `mounted`-guarded, awaited push)
pushes `DetailScreen(title, count, onIncrement)`. Proven through the real analyzer → real `bridge
normalize` → real generator (`async_push_guard_build.test.ts`):

- The awaited push is performed, with correct transition identity.
- `count`/`onIncrement` promote via N11; `title` does not.
- Every M7-H-relevant diagnostic (`BRG3008`, the "needs lowering" `BRG3013`, the "no router in scope"
  `BRG3006`, and an unreachable-argument refusal for this push) is **absent**.

**Does not assert a clean `tsc` build**, and says so in the test file's own comment: the one diagnostic
that remains is `mounted` itself reaching the generator with no lowering — React has no built-in
analogue of `State.mounted`, and `@bridge/runtime-react` has no hook that tracks it yet. That is
generator/runtime work, not extraction, and is this milestone's own recommended next step (below), not
smuggled in here. `pipeline.ts`'s own architecture (`generateProject`) forces `files: []` whenever any
error is reported, so there is no partial output to typecheck regardless.

## Browser proof (Phase 17) — explicitly skipped, with the reason named

No fixture in this milestone reaches `next build`: `mounted` has no runtime lowering, so no
async/mounted-guarded-push application can be built to load in a browser at all — this is the same
condition Phase 17 itself names as license to skip rather than fake ("if the runtime cannot model
unmount timing faithfully, do not fake this test"). `inline_push_props`'s existing browser suite
(M7-G's, unaffected by this milestone — its generated bytes are unchanged) remains the browser-level
regression proof for destination-argument resolution; a guard-inclusive browser scenario is left to
whichever future milestone implements `mounted`'s runtime lowering.

## Determinism and the fixed point (Phase 18/19)

- The real analyzer, run three times over `async_push_guard`: byte-identical raw UIR and normalized UIR.
- `bridge normalize` on `async_push_guard.normalized.ndjson` a second time: 61 nodes in, 61 out, **no
  pass reports a change**, byte-identical output.
- `just determinism` (the standard 3-app e2e suite — `counter`, `promoted-counter`,
  `inline-push-props`; `async_push_guard` is excluded from it for the same reason `hello_bridge` is —
  `docs/adr` non-buildable fixtures do not belong in a suite that runs `next build`): byte-identical
  across 3 complete pipeline runs, all three applications, confirming the `component.ts` change does not
  disturb any app whose navigation was already inline.

## CI (Phase 20)

`just ci` — build, typecheck, every package's test suite (187 tests in `@bridge/gen-react`, 248 in
`bridge_analyzer`, all packages green), `codegen-check`, `lint`/`lint:deps`, `lint-negative`,
`uir-lint`, `uir-test`, `analyzer-lint`, `analyzer-test`, `dart-analyze` — exits 0.

## Remaining blockers

- `mounted`'s own generator/runtime lowering does not exist. The analyzer represents it faithfully
  (proven exhaustively); nothing downstream can yet turn `logic.Ref{name: 'mounted'}` into working code,
  because the runtime kit has no equivalent primitive to lower it to.
- `hello_bridge` still cannot reach a clean `tsc` build: 27 pre-existing, unrelated diagnostics remain
  (multi-hop forwarding, missing theme tokens, opaque `Duration`/`Future` classes, an unmodelled
  `ui.Async`, `MaterialApp.themeMode`), none touched by this milestone.
- The last-statement safety condition is deliberately narrow (a function's own top-level body only); an
  awaited push last in a nested block is left refused, on no-evidence-no-broadening grounds.
- `pushNamed`/`pushReplacementNamed`/`popUntil`/`popAndPushNamed`/`showMenu`/`maybePop`/`showDialog`/
  `showModalBottomSheet` are unchanged — out of this milestone's scope, exactly as stated going in.

## Recommendation for the next milestone

`mounted`'s generator/runtime lowering: a `useMounted()`-shaped primitive in `@bridge/runtime-react` (a
ref that flips false on unmount, read synchronously) and a generator-side binding for
`logic.Ref{name: 'mounted'}` / `logic.PropertyAccess{property: 'mounted', receiver: context}` to read it.
This is the single remaining thing standing between `async_push_guard` (and `hello_bridge`'s own
`_submit`) and a clean `tsc` build and a real browser proof of the guarded-navigation scenario Phase 17
of this milestone had to skip. It is a bounded, evidenced, generator/runtime task — not extraction, not
multi-hop promotion, not named-route navigation — and it is the most direct way to finish what this
milestone's own fixture already isolates as the sole remaining gap.
