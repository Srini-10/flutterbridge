# M7-J — Mounted lifecycle intrinsic, runtime lowering & end-to-end validation

Implements ADR-0026: `docs/adr/0026-mounted-lifecycle-intrinsics.md`. Closes
`docs/m6/GAP-mounted.md` and `docs/m7/m7i-mounted-lifecycle-lowering.md` — both stopped, correctly, on
finding that a schema amendment was required rather than improvising a generator heuristic. This
milestone writes and decides that amendment, then implements the whole chain it authorizes: analyzer
recognition, the schema node, the runtime primitive, and generator lowering — closing the one diagnostic
that stood between `async_push_guard`/`hello_bridge`'s guarded push and a running application.

## The ADR, and why implementation followed immediately

`docs/adr/0026-mounted-lifecycle-intrinsics.md` reconfirms `GAP-mounted.md`'s corpus-evidenced proposal
(`logic.Intrinsic`, a two-member vocabulary — `componentMounted`/`contextMounted`) without revision, and
decides the one thing that document left open: the runtime contract (a ref-based `useMounted()`,
matching this kit's own existing `useUpdateEffect` idiom). Verified against frozen architecture (STOP
GATE A) before writing any code: additive and optional, like every prior schema amendment; recognition
stays in the analyzer/adapter layer (ADR-18); no module-global state (ADR-15/INV-19). No conflict found,
so — per this milestone's own explicit authorization — implementation proceeded in the same milestone
rather than stopping a second time.

## Schema amendment (Phase 3)

`packages/uir/schema/l1.json` gains `Intrinsic` (joins the `Expr` union) and `IntrinsicKind`
(`componentMounted`/`contextMounted` — dots are not valid identifiers in both target languages, so the
schema-codegen tool required camelCase; the ADR's own prose keeps the dotted spelling for readability,
noted explicitly where the two diverge). `packages/uir/schema/shared.json`'s `x-uir-version`: **1.5.0 →
1.6.0** (minor — additive, optional, matching the exact precedent `logic.Navigate`'s own 1.4.0→1.5.0
bump set). Regenerated through `pnpm run codegen` — `packages/uir/src/generated/uir.ts` and
`dart/bridge_uir/lib/generated/uir.dart` — never hand-edited. `pnpm run codegen:check` passes.

Schema hash: `9b5c1183b869601f` → `388886b7e06ac0bb`.

## Fresh UIR evidence (Phase 1, reconfirmed)

Bare `mounted`, before this milestone:

```json
{"kind":"logic.Ref","name":"mounted","type":{"library":"dart:core","name":"bool"}}
```

After:

```json
{"kind":"logic.Intrinsic","intrinsic":"componentMounted","type":{"library":"dart:core","name":"bool"}}
```

`context.mounted`, before:

```json
{"kind":"logic.PropertyAccess","property":"mounted","receiver":{"kind":"logic.Ref","name":"context"}}
```

After:

```json
{"kind":"logic.Intrinsic","intrinsic":"contextMounted",
 "operand":{"kind":"logic.Ref","name":"context","type":{"library":"...framework.dart","name":"BuildContext"}}}
```

Both verified against a **fresh** analyzer run this session — not assumed from M7-I's own report — and
against a hand-written probe fixture (`/tmp/ctxtest`, not committed) built specifically to exercise
`context.mounted` through the real pipeline, since `async_push_guard` itself only uses bare `mounted`.

## Analyzer recognition (Phase 4) — by resolved element, never by spelling

`catalog/widgets/material.json` gains `mountedGetter: {name: "mounted", contextClass: "BuildContext"}`
— the single declarative source (ADR-18), generated into `MaterialCatalog.mountedGetter`/
`mountedContextClass` (Dart only; this fact never needs to reach the TypeScript side, since the React
generator only ever sees the framework-neutral `logic.Intrinsic`, never a raw Flutter getter name).

`FlutterWidgetAdapter.mountedIntrinsicOf(Expression)` (new `WidgetAdapter` interface method,
`AdapterRegistry.mountedIntrinsicOf` dispatching to it) recognizes exactly two shapes:

- Bare `mounted` (or `this.mounted`): a `SimpleIdentifier` whose resolved element's enclosing class is
  `MaterialCatalog.stateBase` (`'State'`), in a `package:flutter/` library. Returns
  `MountedKind.componentMounted`.
- `<value>.mounted`: a `PropertyAccess`/`PrefixedIdentifier` whose resolved element's enclosing class is
  `MaterialCatalog.mountedContextClass` (`'BuildContext'`), in a `package:flutter/` library. Returns
  `MountedKind.contextMounted`.

Everything else returns `null` and reaches the document exactly as before — an ordinary
`logic.Ref`/`logic.PropertyAccess`, refused by the existing `BRG3006` if nothing else resolves it. The
element check is the same "resolved, not named" shape `isComponentPropsGetter` (`widget`) and
`isChangeNotification` (`notifyListeners`) already use — no new recognition idiom.

### Negative recognition (Phase 4/STOP condition 1) — proven, not assumed

`dart/bridge_analyzer/test/transition_test.dart`'s `'ADR-0026 — mounted lifecycle intrinsics'` group, 8
tests, all against real Dart source through the real analyzer:

- A local variable named `mounted` inside the handler (shadowing the outer `State.mounted`) — resolves
  to itself; **no** `logic.Intrinsic`.
- `<value>.mounted` on an application-declared class unrelated to `BuildContext` — **no** intrinsic.
- An application-declared class named neither `State` nor `BuildContext`, with its own `mounted`
  getter — **no** intrinsic, even though the read-site spelling (`fake.mounted`) is identical to the
  real one.

This directly closes STOP condition 1 ("resolved-element identity cannot reliably distinguish Flutter's
mounted APIs") — it can, and does, proven against three deliberately adversarial spellings.

### Compound expressions, multiple reads (Phase 5)

All against real Dart, real analyzer, all passing: `if (!mounted) return;`; `if (!context.mounted)
return;`; `if (result == null || !mounted) return;`; `if (!context.mounted || cancelled) return;`; two
separate `if (!mounted) return;` guards in one function produce **two** distinct `logic.Intrinsic` nodes
(never one cached/reused). No `MountedGuard` statement exists anywhere — every case composes as an
ordinary expression operand, exactly as the task required.

## Runtime primitive (Phase 6)

`packages/runtimes/react/src/internal/react/lifecycle.ts` — `useMounted(): RefObject<boolean>`, beside
`useMountEffect`/`useUnmountEffect`/`useUpdateEffect`:

```ts
export function useMounted(): RefObject<boolean> {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}
```

Exported from `@bridge/runtime-react`'s public surface (`src/index.ts`).

### Why a ref beat a boolean snapshot and tied with a getter (Phase 7/STOP condition 6/7)

`react.test.ts`'s **load-bearing** test proves the snapshot is wrong, not by assertion alone but by
racing a real `Promise`: mount → click (handler suspends on an unresolved promise) → **unmount** →
resolve the promise → assert `mounted.current === false` at the point the handler resumes. A closure
that had captured a plain `boolean` at render time could never see the unmount; a live ref does, because
it is read *at call time*. Mutation-checked: reverting `useMounted` to `{ current: true }` (a permanent
snapshot) fails exactly this test and three others (isolation, Strict Mode) — confirmed by running the
mutation and observing the failures, then restoring.

A getter function (`isMounted()`) would have been equally correct — both read live state at call time.
The ref won because it is this codebase's own established idiom: `useUpdateEffect`'s internal `mounted`
ref (a different fact, tracked the identical way) already existed before this milestone, so `useMounted`
is not a new pattern, only a new fact using one.

### Strict Mode (Phase 6/14/STOP condition 7) — the detail that makes it correct

`react.test.ts`: `render(createElement(StrictMode, null, createElement(Screen)))`, asserting
`ref.current === true` **after** the mount→cleanup→remount replay settles. This is why `true` is
re-set *inside* the effect body rather than relied on only at `useRef(true)`'s initial value — a design
that skipped that line would leave the ref `false` after Strict Mode's development-only replay, for a
component that is genuinely still mounted. Proven by a passing test that specifically exercises the
replay, not inferred from reading React's docs.

### Two-instance isolation (Phase 6/13/STOP condition 8)

`react.test.ts`: two `Screen` instances rendered side by side, each holding its own ref (`refs[0] !==
refs[1]`); unmounting one leaves the other's `.current === true`. `useRef` is per-instance hook state by
construction — no module-global mutable state anywhere in the implementation, closing STOP condition 8
by design rather than by discipline.

### No spurious rerenders

`react.test.ts`: a component calling `useMounted()` renders exactly once on mount — writing a ref is not
a `useState` call and schedules nothing.

## Generator lowering (Phase 8)

`packages/generators/react/src/internal/emit/expression.ts`'s `logic.Intrinsic` case reads only the
framework-neutral fact:

```ts
case 'logic.Intrinsic': {
  const local = scope.mountedLocal;
  if (local === undefined) { /* BRG3006, "no lifecycle ref in scope" — mirrors the router's own case */ }
  return `${local}.current`;
}
```

No `if (name === 'mounted')`, no string matching on the Flutter spelling anywhere in `gen-react` — the
generator never learns the word `mounted` exists; it only ever sees `intrinsic: 'componentMounted' |
'contextMounted'`, both of which it lowers identically today (a target decision the schema deliberately
does not force — see the ADR's own "Consequences").

**`operand` is never evaluated.** The first implementation did (to surface a diagnostic for an
unsupported construct inside it, on an INV-4 instinct) — and a real-fixture probe (`/tmp/ctxtest`, a
genuinely valid `context.mounted` read) caught it immediately: `context` in a Flutter build method is an
implicit parameter never bound in `Scope` (Spec v2.5 §A18.3's parameter-by-name resolution does not
cover it), so evaluating it as a value produced a spurious `BRG3006` for completely ordinary code. Fixed
by dropping the evaluation — the operand carries no information this lowering needs, so there is nothing
to protect against silently losing. This is recorded here because it is exactly the kind of thing that
looks correct in review and is wrong in a real fixture, which is the whole reason this project's own
discipline insists on running real source rather than trusting hand-built UIR.

### Hook predeclaration (Phase 9)

`component.ts`'s `declareMounted` mirrors `declareRouter` precisely: `useMounted()` is hoisted to the
component's own top level, called unconditionally, before the tree that reads it is ever walked —
detected via `componentReaches` (a new, small generalization of `navigatesSomewhere`'s "walk the render
tree, then walk every referenced action" logic, shared between the router's check and this one, since
only the predicate differs). Never emitted inside a handler, inside `ui.Cond`, inside a `ui.List`
template, or conditionally — `componentReaches`'s generic tree walk finds a `logic.Intrinsic` at any
depth, so there is no nesting shape it could miss by construction.

**A real regression found and fixed mid-implementation**: `childScope` (the scope a component's render
tree — as opposed to an action body — resolves through) rebuilds its `EmitScope` object field-by-field
rather than spreading the parent, and `mountedLocal` was missing from that list. `routerLocal` was
already handled the same way, correctly, which is precisely why this was easy to miss and important to
catch: a unit test with the intrinsic written *directly in JSX* (not inside a referenced action) failed
with the exact "no lifecycle ref in scope" refusal until this was fixed. `actionScope` was unaffected —
it spreads `...parent` in full — which is why the referenced-action test passed on the first attempt and
masked the render-tree gap until a second, differently-shaped test exposed it.

### Zero-cost when unused, one instance for many reads (Phase 10/11)

`generate.test.ts`, `'M7-J — logic.Intrinsic lowers to useMounted()'`: a component with no intrinsic
emits no `useMounted` import at all; ten separate reads across one action body declare **exactly one**
`const mounted = useMounted();` and read `mounted.current` ten times — never a second instance, never a
value threaded from one read to reuse at another (each read is its own live call).

## Generated code (Phase 16)

`async_push_guard`'s real, generator-produced `home.tsx` (`_submit`'s handler):

```ts
const mounted = useMounted();
...
const handle_39d4e31f = () => {
  _isSubmitting.set(true);
  if ((!mounted.current)) {
    return;
  }
  _isSubmitting.set(false);
  router.push({ kind: 'component', component: "d190325ab845bd16" });
};
```

`mounted.current` is read *inside* the handler, at the point corresponding to the source's own guard —
never a value captured once and reused (`const wasMounted = mounted.current` before the async boundary,
the shape this milestone's own brief named as wrong). Statement order matches the source exactly:
`_isSubmitting.set(true)` → guard → `_isSubmitting.set(false)` → `router.push(...)`.

## `async_push_guard` — now a clean `tsc` build (Phase 15/19)

`async_push_guard_build.test.ts`, 8 tests, real analyzer → real `bridge normalize` → real generator →
**real `tsc --noEmit`**, all passing — the hard acceptance criterion this milestone's brief set, met
without a schema blocker. Confirms, in order: the transition carries all three arguments before N11; the
destination declares all three params; the push is `performed`, naming the exact transition; `mounted`
is `logic.Intrinsic{intrinsic: 'componentMounted'}`, not a bare reference; N11 promotes the signal and
action, leaving the constant; the generator reports zero errors and declares `useMounted()` exactly
once; the emitted project typechecks.

The fixture also gained a "Go back" button (`Navigator.pop`) on `DetailScreen`, needed for the browser
proof's pop scenario — its own `logic.Navigate{action: 'pop'}` (no `transition`, §A17.3) is asserted
separately.

## Browser proof (Phase 17)

`e2e/tests/async-push-guard.spec.ts` (production) and `.dev-only.spec.ts` (development), against
`fixtures/apps/async_push_guard` built through the real pipeline. Required a release-tarball repack
(`node tools/pack-release.mjs`) mid-milestone: the e2e suite installs `@bridge/runtime-react` from a
packed artifact rather than a workspace link (by design — the closest honest approximation of what a
user installs), and the tarball built before this milestone's runtime changes did not carry
`useMounted`; `next build` failed with `Module has no exported member 'useMounted'` until it was
repacked, which is exactly the kind of drift the packed-artifact discipline exists to catch rather than
hide.

Positive scenario, production: server-rendered home screen; "Sign in" navigates (mounted guard passes,
awaited push executes); the destination renders its own constant (`title: 'Authenticated'`); the
promoted signal/action cross the push boundary (increment on the destination, visible on the home screen
after popping back); pop returns home and the router remains usable afterward; the submit button's
disabled state is driven correctly by the same handler the guard sits in; zero console output on every
path.

Development: hydrates without a mismatch; **navigates correctly after Strict Mode's development replay**
— the direct browser-level analogue of `react.test.ts`'s unit-level Strict Mode proof, now exercised
against the real generated component rather than a synthetic one; no hook-order/rules-of-hooks
violations across repeated sign-in/back; no state-update-after-unmount warning; silent console
otherwise.

### The negative (unmount-during-await) scenario — not attempted, and why

Phase 18 asked for a browser scenario where the source component unmounts *while* the async handler is
suspended, proving the guarded navigation does not then occur. `async_push_guard`'s own `_submit` has no
real `await` with an actual suspension window — deliberately: the only Dart constructs that would
produce one are `Future.delayed(Duration(...))` (opaque `Duration`/`Future` classes, `hello_bridge`'s
own separate, pre-existing `BRG3002` gap) or a call to an arbitrary helper function/method the generator
cannot resolve at all (the same "does not emit references to arbitrary declarations" limit that broke
an early `_authenticate()` stand-in during M7-H). Both routes require exactly the capability this
milestone's own brief lists as out of scope — "general Future emulation" (STOP condition 12) — so
neither was built merely to manufacture a delay window.

What exists instead is the strongest proof available without that capability:
`react.test.ts`'s `'is load-bearing'` test races a **real** `Promise`, in a **real** mounted React tree,
against a **real** unmount, using the **real**, unmodified `useMounted()` export — the same function the
generated code calls, exercised the same way, with the only difference being that the async operation is
a controllable `Promise` rather than a Dart-sourced `Future.delayed`. This is not a browser test, and it
is not represented as one; it is the honest ceiling of what this milestone's scope permits without
solving a separate, larger, explicitly out-of-scope problem.

## `hello_bridge` (Phase 19)

Re-measured fresh (not assumed from a prior run), against the real analyzer and generator, no source
edited:

| | before M7-J | after M7-J |
|---|---|---|
| total generator diagnostics | 28 | **27** |
| `BRG3006` (`mounted` unresolved) | 1 | **0** |
| `BRG3013` (multi-hop forwarding, unrelated) | 2 | 2, unchanged |
| everything else (opaque classes, theme tokens, `ui.Async`, `themeMode`) | unchanged | unchanged |
| files emitted | 0 | 0 |
| `logic.Navigate` for `login_screen.dart`'s push | present, transition-matched | unchanged |

`mounted`'s own refusal — the exact gap this milestone targeted — is gone, and nothing else moved.
`hello_bridge` still does not emit files: 27 diagnostics remain, all pre-existing and unrelated (opaque
`Duration`/`Future` classes with named constructor arguments, 18 missing Material theme-token roles, an
unmodelled `ui.Async`, `MaterialApp.themeMode`, and the two multi-hop-forwarding refusals M7-E3
correctly declines to promote). Each is a distinct, separately-owned capability — not a single blocker,
and not weakened by anything in this milestone.

## Regression (Phase 20-22)

- **M7-F** (promoted-store consumption): `store_consumption.test.ts`, `promotion_build.test.ts`, and the
  production/dev-only promotion browser suites all pass unchanged in the same runs as this milestone's
  new tests.
- **M7-G** (inline destination props): `inline_push_build.test.ts` and `generate.test.ts`'s route-
  argument tests pass unchanged; `inline_push_props`'s raw analyzer output is byte-identical to before
  this milestone (confirmed by a fresh re-run and diff — it contains no `mounted` usage, so nothing about
  it could legitimately change).
- **M7-H** (awaited-navigation extraction): the full `m7hAsyncNavigation` group (transition_test.dart)
  passes unchanged except the two assertions that checked `mounted`'s *old* shape (`logic.Ref`/
  `logic.PropertyAccess`) — updated to check the new, correct shape (`logic.Intrinsic`), since the old
  shape is exactly what this milestone replaced; every other assertion (ordering, transition identity,
  the terminal-await rule, the "code still follows" refusal) is untouched. The terminal-await rule itself
  was not broadened — no new case was added to `_isLastStatementOfFunctionBody` or its callers.
- `counter`, `promoted_counter` raw analyzer output: byte-identical (neither uses `mounted`).

## Schema compatibility (Phase 23)

Verified directly, not assumed: running the old-schema-built CLI (`packages/cli`, unbuilt after the
schema edit) against a document produced by the new analyzer failed exactly as the loader's own design
intends —

```text
this document was built against UIR schema 388886b7e06ac0bb (v1.6.0), and this compiler reads
9b5c1183b869601f (v1.5.0). It is not readable, and it is not unreadable either — it would deserialize,
with fields the reader does not know, and the compiler would carry on and be quietly wrong.
```

— a real refusal, hit in the course of ordinary work (before `pnpm run build` had propagated the new
schema to `packages/cli`'s own `dist/`), not staged as a demonstration. After rebuilding, `bridge
normalize`/`bridge diagnostics`/`bridge build` all read the new-schema documents correctly.

## Golden audit (Phase 24)

Regenerated, with cause: `async_push_guard` (contains `mounted` — content changed) and `hello_bridge`
(contains `mounted` — content changed), both re-run fresh from the real analyzer, one node's content
differing in each (the action body containing the guard), diffed and confirmed before accepting.
**Every fixture's manifest** (`counter`, `promoted_counter`, `inline_push_props`, `hello_bridge`,
`async_push_guard`) was refreshed regardless of content drift — `schemaHash`/`uirVersion` are stamped by
the analyzer per run and legitimately move with the schema version bump even when the document's own
bytes do not change; confirmed for `counter`/`promoted_counter`/`inline_push_props` that their raw and
*normalized* `.ndjson` are otherwise byte-identical to the pre-M7-J committed goldens.

## Determinism and the fixed point (Phase 25/26)

`async_push_guard`: the real analyzer run three times into fresh output, byte-identical raw and
normalized UIR. `bridge normalize` on the committed normalized golden a second time: 61 nodes in, 61
out, zero passes report a change. No random ids or traversal-order dependence were introduced — the
intrinsic's `NodeId` is content-addressed exactly like every other node (ADR-17), computed from its own
`kind`/`intrinsic`/`operand`/`type` fields alone.

## CI (Phase 27)

`pnpm --filter @bridge/gen-react test`: 194 tests, 12 files, green. `pnpm --filter @bridge/runtime-react
test`: 391 tests, 15 files, green (30 in `react.test.ts`, +6 for `useMounted`). `dart test`
(`bridge_analyzer`): 256 tests, green (+8 for ADR-0026's recognition group). `just ci`: exits 0 (build,
typecheck, every package's test suite, `codegen-check`, `lint`/`lint:deps`, `lint-negative`, `uir-lint`,
`uir-test`, `analyzer-lint`, `analyzer-test`, `dart-analyze`). Playwright, both configurations, all four
generated applications: **47/47 passed** — 36 pre-existing (`counter`, `promoted_counter`,
`inline_push_props`, unaffected) plus 11 new for `async_push_guard` (6 production, 5 development —
including the Strict Mode replay proof; see "Browser proof" above). `just determinism`'s result is in
the final report.

## Remaining blockers

- `hello_bridge`'s other 27 diagnostics — all pre-existing, unrelated, individually owned (opaque
  SDK-class emission, missing theme tokens, `ui.Async`, `themeMode`, multi-hop forwarding).
- No browser proof exists (or is claimed) for the unmount-during-a-real-Dart-await scenario; the closest
  faithful proof (`react.test.ts`) is unit-level, using a controllable `Promise` rather than a
  Dart-sourced delay, for the reasons given above.
- `IntrinsicKind`'s vocabulary is `mounted` only — a future framework intrinsic (if evidenced) is a
  separate, additive amendment to the same enum, per the ADR's own "Consequences".

## Recommendation for the next milestone

Two independent, smaller candidates, neither blocking the other:

1. **Opaque `Duration`/`Future` class emission** — the one remaining thing that would let a fixture like
   `async_push_guard` exercise a *real* Dart-sourced async delay, which in turn would finally make the
   unmount-during-await browser scenario buildable rather than argued for at the unit level. Also the
   single largest remaining category in `hello_bridge`'s own diagnostic set after theme tokens.
2. **Missing Material theme-token roles** (`BRG3010` ×18 in `hello_bridge`) — the largest remaining
   category outright, and unrelated to navigation entirely; closing it does more to move `hello_bridge`
   toward a clean build than anything left in the navigation arc this M7-A through M7-J sequence has been
   pursuing.

Given this sequence's own throughline (getting `hello_bridge`'s real push to actually run), (1) is the
more direct continuation; (2) is the larger, faster win toward the fixture actually building. Either is
a legitimate M7-K; this report does not choose between them.
