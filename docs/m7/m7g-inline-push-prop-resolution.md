# M7-G — Inline `Navigator.push` destination prop resolution

Closes `docs/m7/gap-inline-push-props.md`: a component reached only by an inline
`Navigator.push(context, MaterialPageRoute(builder: (_) => X(args...)))` was rendered bare —
`pageOf`'s `componentScreens` loop imported and named the destination component but never read
`app.RouteTransition.arguments`, the way `rendered()` already did for declarative `app.Route`
destinations. Fixed by extracting the one resolution algorithm both destination kinds now share,
rather than writing a second one.

## Baseline failure (reproduced before any code changed)

`fixtures/apps/inline_push_props` was built for this milestone specifically because neither existing
tsc-checked fixture exercises the shape: `promoted_counter`'s destination is reached by a declarative
route, and `hello_bridge`'s own inline push never becomes a `logic.Navigate` at all (an unrelated
async/`await`/`mounted` extraction gap traced to `login_screen.dart:45-62` — see "`hello_bridge`
before/after" below), so it never reaches the code path this milestone touches.

`HomeScreen` pushes the same `DetailScreen` from two buttons, each supplying different constants
(`title`, `enabled`) alongside a shared component-scoped signal (`count`) and action (`onIncrement`).
Run through the real analyzer, real `bridge normalize`, and the pre-M7-G generator:

```tsx
// app/page.tsx
function DetailScreenRoute() { ... }  // never generated — componentScreens never called screenFor
...
<RouterOutlet
  routes={{ "root": HomeScreen }}
  components={{ "c662720fb936e71b": DetailScreen }}
/>
```

One entry, not two — `componentScreens`'s `const seen = new Set<string>()` was keyed by the bare
component id, so the second transition to reach an already-seen component was silently dropped. The
single surviving entry rendered `<DetailScreen />` with **zero props** — `title`/`count`/`enabled`
all required, all missing, and no diagnostic fired anywhere before `tsc`. This is the first-caller-wins
collapse Phase 9/10 of this milestone's task named as the thing that must not happen, reproduced
directly rather than assumed.

## Actual UIR shape

Confirmed by real analyzer output (`fixtures/uir/inline_push_props.ndjson`) — an `app.RouteTransition`
per push, `component` naming the destination (not `target` — §A17.6, no route to point at), each
carrying its own `arguments` in the *same* `RouteArgument` shape (`{name, binding, transport}`)
`app.Route.arguments` already used:

```json
{"kind":"app.RouteTransition","id":"d190325ab845bd16","component":"c662720fb936e71b",
 "source":"4581b99b467142ff",
 "arguments":[
   {"name":"title","binding":{"kind":"bind.Const","value":"Details"},"transport":"primitive"},
   {"name":"count","binding":{"kind":"bind.Signal","signal":"c60d511d76b26c01"},"transport":"primitive"},
   {"name":"enabled","binding":{"kind":"bind.Const","value":true},"transport":"primitive"},
   {"name":"onIncrement","binding":{"kind":"bind.Expr","expr":{"kind":"logic.Ref","target":"a32ee728c6a88b2e"}},"transport":"primitive"}
 ]}
```

Nothing about the UIR was wrong or incomplete, matching what the gap document already suspected: the
analyzer records every argument correctly; the generator simply never read `arguments` for this one
destination kind.

## Shared resolver (`screenFor`, `pipeline.ts`)

`rendered()`'s per-argument resolution loop — probe-then-emit each `RouteArgument`'s binding, collect
unreachable ones into one `UnsupportedCapability` diagnostic, build a wrapper component only when there
is at least one prop to bind — is now a standalone closure, `screenFor(args, emitted, boundaryId,
describeBoundary)`, called identically by:

- `rendered()`, for every `app.Route`, keyed by the route's own id (unchanged behavior).
- the new `componentScreens` loop, for every `app.RouteTransition`, keyed by `screenKeyFor` (below).

One implementation, one diagnostic wording (generalized to say "the push at `<file>:<line>`" or "the
route `<path>`" depending on which construction it is describing), used by both destination kinds — the
task's explicit constraint against a second argument-resolution algorithm. `reportUnsatisfiableRouteComponents`
(BRG3018-class, required-parameter check) was renamed `reportUnsatisfiableConstructions` and generalized
the same way, so a push to a component missing a required argument is refused exactly like a route is.

## Destination identity (`screenKeyFor`, `routes.ts`)

The mechanism that makes "no first-caller-wins" true rather than merely tested:

```ts
export function screenKeyFor(componentId: string, transition: Node, scope: EmitScope): string {
  const destination = scope.node(componentId) as unknown as Node | undefined;
  const params = Array.isArray(destination?.['params']) ? (destination['params'] as unknown[]) : [];
  if (params.length === 0) return componentId;
  return idOf(transition) ?? componentId;
}
```

A component with no declared parameters renders identically regardless of which transition reached
it (`<X />` is `<X />`), so its bare id is correct and sharing one entry across every push to it is not
a shortcut — it is the accurate answer. A component with any parameter is keyed by *the reaching
transition's own id* instead: the one identity the analyzer already mints per push (M7-B), never a
component name, a source span, argument names, or traversal order. `pipeline.ts`'s `componentScreens`
(building the `RouterOutlet`'s `components` map) and `statement.ts`'s `destinationOf` (building the
`router.push({...})` call at the call site) both call this same function, so the key a push looks
itself up under and the key the page registers a screen under are provably the same value — computed
once, not agreed on by two independent implementations.

## Constants, the promoted signal, and the promoted action

`inline_push_build.test.ts` (real analyzer → real `bridge normalize` → real generator → real `tsc`) and
`inline-push.spec.ts`/`inline-push.dev-only.spec.ts` (real browser, production and development) both
confirm the mixed-argument case resolves correctly in one pass:

```tsx
function DetailScreenRoute() {
  return <DetailScreen title={'Other'} enabled={false} />;
}
function DetailScreenRoute2() {
  return <DetailScreen title={'Details'} enabled={true} />;
}
...
<RouterOutlet
  ...
  components={{ "55f69e3a09632183": DetailScreenRoute, "d190325ab845bd16": DetailScreenRoute2 }}
/>
```

```tsx
export function DetailScreen(props: DetailScreenProps) {  // props: { title, enabled } — count/onIncrement promoted away
  const promotedStore = useStore(promotedStoreStore);
  const promotedStore__count$ = useSignal(promotedStore._count);
  ...
  <ElevatedButton onPressed={promotedStore._increment} .../>
```

- **Constants** (`title`, `enabled`) remain ordinary per-push props — two different values, two
  different wrappers, neither wrapper carries the other's values.
- **The signal** (`count`) is consumed via M7-F's store mechanism (`useStore` + a subscribed
  `useSignal`), not passed as a prop — N11's existing multi-caller consensus already promotes it once
  both transitions agree the destination reads it itself, and this milestone made no compiler-side
  change to that decision.
- **The action** (`onIncrement`) is a direct reference to the promoted store's action
  (`promotedStore._increment`), never a reconstructed closure — the M7-F baseline defect class (a
  plausible-looking miscompile with no diagnostic) remains impossible here because the same
  `declareStoreConsumption`/`storeMembers` path M7-F built is what resolves it.
- Mixed together (`title`+`count`+`enabled`+`onIncrement` on one push), no promoted argument's removal
  disturbs an unrelated primitive prop — confirmed by the generated `DetailScreenProps` carrying exactly
  `{title, enabled}`, nothing more and nothing less.

## Same-component, multiple pushes — the load-bearing case

Both wrapper functions above are generated from the **same** `DetailScreen`, reached by **two**
`app.RouteTransition`s. Verified at three levels:

1. **Unit/build-proof**: `inline_push_build.test.ts` asserts two distinct wrapper functions, two
   distinct keys in the `components` map, and that each push's own constants land on its own wrapper.
   A mutation check (temporarily forcing `screenKeyFor`'s per-transition branch back to always return
   the bare `componentId`, reproducing the pre-fix collapse) fails 3 of the 8 tests, including the `tsc`
   check — the fixture genuinely detects the regression it exists to prevent, not just the shape of it.
2. **Order independence**: generating from the node array in both forward and reversed order produces
   byte-identical output (the program is already canonically sorted, per `pipeline.ts`'s own
   determinism discipline). Separately, the two buttons in `home_screen.dart` were physically swapped
   and the whole pipeline re-run from the real analyzer — the transition ids stayed the same (content-
   derived, not position-derived) and each push's constants followed it to whichever line it now lived
   at, with no collision.
3. **Browser**: `inline-push.spec.ts`'s "the two destinations remain distinct across repeated
   navigation, in either order" pushes and pops both destinations, interleaved, and asserts each still
   shows its own title/`enabled` value every time.

## M7-F integration

No change to N11, `declareStoreConsumption`, or `store.ts` — this milestone consumes M7-F's mechanism
rather than bypassing it. `store_consumption.test.ts` and `promotion_build.test.ts` (M7-F's own suites)
pass unchanged in the same `pnpm --filter @bridge/gen-react test` run as this milestone's new tests (181
tests, 11 files, all green). `promotion.spec.ts`/`promotion.dev-only.spec.ts` (M7-F's browser suite) pass
unchanged in the same `playwright test` run as this milestone's new browser tests (36 tests, all green).

## Declarative-route regression

`build.test.ts` (the pre-existing tsc-checked declarative-route suite, `examples/counter` and
`layout_proof.ndjson`) and `generate.test.ts`'s route-argument tests pass unchanged in the same test
run. Two `generate.test.ts` assertions needed updating — not because behavior regressed, but because
`reportUnsatisfiableConstructions`'s message wording was deliberately generalized to describe either
construction kind (it no longer says "`app.Route.arguments`" specifically, since the same message now
also serves an inline push); the assertions were checking for that literal substring and now check the
still-accurate, boundary-generic wording instead. Diagnostic codes, severities, and triggering
conditions are unchanged.

## Browser proof

`e2e/tests/inline-push.spec.ts` (production) and `inline-push.dev-only.spec.ts` (development), against
`fixtures/apps/inline_push_props` built through the real pipeline (`bridge build` → `npm install` →
`next build`/`next dev`) — 15 new tests, all passing:

- Server-rendered home screen, hydrates cleanly.
- Each push renders its own destination with its own constants (`title` shown in the `<header>`,
  `enabled` shown as text).
- Repeated push/pop in reversed order keeps the two destinations distinct.
- Incrementing on the destination updates the promoted store, visible on the home screen after popping
  back (cross-boundary signal reactivity, end to end).
- `Navigator.pop(context)` (added to `DetailScreen` for this proof — the original fixture had no way
  back) pops correctly and leaves the router usable for a subsequent push.
- Zero console output on every path, including the development build's unminified hook-order/
  rules-of-hooks diagnostics, exercised specifically by alternating which destination mounts next.

## `hello_bridge` before/after

Measured by generating from `fixtures/uir/hello_bridge.normalized.ndjson` (untouched by this milestone)
through the pre- and post-M7-G generator, back to back, in the same session:

| | before | after |
|---|---|---|
| total diagnostics | 29 (all `error`) | 30 (all `error`) |
| `BRG3013` (`UnsupportedCapability`) | 2 | 3 |
| every other code | unchanged | unchanged |
| files emitted | 0 | 0 |

The new `BRG3013` is `componentScreens`/`screenFor` now resolving the inline push at
`lib/screens/login_screen.dart:55` (`LoginScreen` → `HomeScreen`, carrying `isDark`/`onToggleTheme`)
the same way it already resolves the declarative route's own copy of the same problem: both are
multi-hop-forwarded (`LoginScreen` never reads either value, only forwards them), which M7-E3 scoped
single-hop promotion to correctly decline, so both report the same "state declared outside any
component the project emits" diagnostic. **This is the intended outcome, not a regression** — before
this milestone, that push was invisible to the generator (bare `reserve(componentId)`, no argument
read at all); now it gets the same scrutiny the declarative route already got. It does not change
whether `hello_bridge` builds: `BRG3008` (`login_screen.dart`'s own push is never `performed` — no
`logic.Navigate`, an unrelated async/`await`/`mounted` extraction gap) and the other 27 pre-existing,
unrelated causes (`mounted` unresolved, `Duration`/`Future` treated as opaque application classes,
missing Material theme tokens, `MaterialApp.themeMode`) are all untouched by this milestone and still
block file emission.

## Navigation-form regression

`pop` and `push`/`replace` (`pushReplacement`) both lower through the same `logic.Navigate` case in
`statement.ts`, which calls `destinationOf` → `screenKeyFor` for a component-kind destination — the one
place this milestone's identity change reaches navigation emission. `maybePop`, `showDialog`, and
`showModalBottomSheet` are refused with their existing named-capability diagnostics in
`unsupported.ts`/`expression.ts`, neither of which this milestone touched. Not broadened to
`pushNamed`/`pushReplacementNamed`/`popUntil`/`popAndPushNamed`/`showMenu` — all remain `BRG3013`,
unchanged, exactly as `docs/m7/m7d-reality-audit.md` measured them.

## Determinism and the fixed point

- `just determinism` (3 complete `analyze → normalize → generate` runs, `counter` + `promoted-counter` +
  `inline-push-props`): byte-identical UIR, normalized UIR, and emitted files across every run, all
  three applications.
- `bridge normalize` on `inline_push_props.normalized.ndjson` a second time: 60 nodes in, 60 out, **no
  pass reports a change**, byte-identical output — the fixed point holds.
- No N1–N11 pass needed a change for this milestone; the fixed point holding with zero reported changes
  confirms this was generator-only work, as expected going in.

## CI

`just ci` — build, typecheck, every package's test suite (181 tests in `@bridge/gen-react`, all
packages green), `codegen-check`, `lint`/`lint:deps`, `lint-negative`, `uir-lint`, `uir-test`,
`analyzer-lint`, `analyzer-test`, `dart-analyze` — exits 0.

## Remaining limitations

- `hello_bridge` still cannot reach a clean `tsc` build. The one change specific to this milestone
  (its inline push now gets full argument scrutiny instead of none) does not remove any of the other 27
  pre-existing blockers, and was not attempted to be "fixed" here, per the standing instruction not to
  modify `hello_bridge` or weaken a refusal to make its numbers improve.
- Multi-hop forwarding remains unpromotable (M7-E3's scope boundary; `hello_bridge`'s own
  `LoginScreen`/`HomeScreen` pair is exactly this shape, for both its route and its push).
- `pushNamed`/`pushReplacementNamed`/`popUntil`/`popAndPushNamed`/`showMenu`/`maybePop`/`showDialog`/
  `showModalBottomSheet` are all unchanged — named-route/path-based destination identity and overlay
  routes remain out of scope, per this milestone's own stop conditions.
- Destination identity is keyed by the reaching transition's id, which is sound for `Navigator.push`'s
  known shape (source lexical scope named by span, destination named by an id the analyzer mints once
  per call site). It has not been exercised against a destination reached by more than two transitions,
  or against `push`/`replace` targeting the same component from the same call site in a loop — no
  evidence such a shape exists in either fixture corpus, so it was not investigated further than the
  two-caller case this milestone's own task named as load-bearing.

## Recommendation for the next milestone

The one concrete, measured gap this milestone's own investigation surfaced and did not touch: the
analyzer's inability to lower a `Navigator.push` entangled with `async`/`await`/`mounted` into a
`logic.Navigate` (`login_screen.dart:45-62`, `hello_bridge`'s own real-world push — the motivating case
for this entire M7 navigation arc). Fixing it would let `hello_bridge` finally *perform* its own inline
push (clearing `BRG3008` for it) and is analyzer work, not generator work, so it does not reopen
anything this milestone or M7-F built. `hello_bridge` would still not reach a clean `tsc` build on its
own afterward — the theme-token and opaque-class (`Duration`/`Future`) gaps are separate, larger pieces
of work — but it is the smallest next step that measurably advances the fixture this whole arc has been
measuring itself against.
