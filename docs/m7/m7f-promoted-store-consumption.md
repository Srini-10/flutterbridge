# M7-F — Promoted-store consumption in the React generator

Closes the execution gap M7-E3 exposed: N11 could correctly promote a route dependency into
`app.Store{origin: "promoted"}` and rewrite the destination component's interface, but nothing in the
React generator could yet turn a component's resulting `bind.Signal`/action reference into working code.
This milestone wires that consumption through the runtime kit's real, already-shipped `useStore`/
`useSignal` API — not a second state mechanism.

## Baseline failure (reproduced before any code changed)

Two distinct failure modes, both traced to `packages/generators/react/src/internal/pipeline.ts:432-437`'s
`rootScope`, whose `signalRead`/`localName` returned `undefined` unconditionally for anything not already
locally known to a component — the code's own comment admitted why: *"a store member read from outside
its store needs `useStore(...)` in scope, which the component emitter does not yet establish."*

- **A signal read** (`bind.Signal{signal}` naming a promoted signal): `emitBinding`'s `bind.Signal` case
  reports `BRG3006` ("not a signal in scope") and returns `'undefined'`. Loud, safe, blocks generation.
- **An action reference** (`logic.Ref{target}` naming a promoted action): `declareLocalActions` declared
  a local closure for *any* referenced action regardless of ownership, and lowered its body in a scope
  that could not resolve the store's own signal either — silently emitting a bare, unimported identifier
  (`const handle_act1 = () => { sigDark = true; };`). **No diagnostic fired.** Only `tsc`, far
  downstream, would have caught it. This was the more serious of the two: a plausible-looking miscompile
  with no signal anything was wrong.

Both reproduced directly (see `store_consumption.test.ts`'s git history for the exact synthetic UIR) and
confirmed via the real fixture: `fixtures/apps/promoted_counter`, run through the real analyzer and
`bridge normalize`, produced a `CounterScreen` whose interpolated `count` reference reached generation as
`BRG3006` before this milestone's generator changes landed.

## The runtime store contract (audited, not invented)

`packages/runtimes/react/src/internal/state/store.ts` and `.../react/context.ts` — read in full before
writing any generator code, per this milestone's own instruction.

- `defineStore(name, setup)` → a **definition** (name + setup function). Holds no state; safe at module
  scope (ADR-15/INV-19 — a module is shared across every request, so a definition, not an instance,
  belongs there).
- `instantiateStore(definition, options)` → a **live instance**, created inside `<StoreProvider>`, once
  per client root / per request. `StoreProvider` is already generated for *every* `app.Store` regardless
  of `origin` — `Providers` in `app/providers.tsx` already wraps the tree in one per store.
- `useStore(definition)` → reads the instance from context by **definition object identity**, returning
  what the setup function returned (signals, derived values, actions as plain properties).
- `useSignal(source: ReadableSignal<T>): T` → subscribes via `useSyncExternalStore`; accepts *any*
  `ReadableSignal`, which both a `signal()` and a `derived()` result satisfy identically. No
  signal/derived distinction exists at the consumption layer — confirmed directly from the hook's own
  type, not assumed.
- Multiple stores coexist via one `StoreRegistryContext` carrying a `definition → instance` map; nesting
  merges. Provider order does not matter for lookup, only for whichever provider is innermost for a given
  definition (irrelevant here — this milestone emits exactly one provider per store, at the root, as
  `Providers` already did before M7-F).

**Conclusion:** the runtime already had everything this milestone needed. Nothing in `store.ts` or
`context.ts` changed. The gap was entirely on the generator side — the component emitter never called
`useStore`.

## Store-member identity (traced, never inferred)

```text
promoted sig.Signal/sig.Action  →  owning app.Store  →  exported property name  →  component reference
```

`store.ts`'s `emitStore` already computes, once per store, exactly how each member is named on the
object the store's setup function returns (`nameOf`: anchor, else the name a reference uses, else a
content-hash fallback). Before this milestone that map was computed and then discarded — `emitStore`
returned only the store's own exported name.

**The fix reuses that computation rather than re-deriving it.** `emitStore` now returns
`{name, signals, derived, actions}` (`EmittedStore`, `store.ts`), and the stores loop in `pipeline.ts`
folds every member into one program-wide map, `EmitScope.storeMembers: ReadonlyMap<NodeId,
StoreMemberInfo>` (`expression.ts`) — keyed by the member's own `NodeId`, carrying which store owns it,
that store's module and exported name, and the member's own property name. This is the **same pattern**
`themeRoles` already established for program-wide, computed-once data on `EmitScope`.

Ownership is never inferred from a signal's or action's human name, a store-name coincidence, or
declaration order — it is a direct map lookup by id, built once from the one place names are actually
assigned. `store_consumption.test.ts`'s "two stores with an identically-named signal" test exists
specifically to prove this: two signals named `count` in source, in two different stores, each resolves
through its own store's own object.

## Generator algorithm

`packages/generators/react/src/internal/emit/component.ts`:

1. **`referencedStoreMembers(tree, scope)`** walks a component's `render` field, collecting every
   `bind.Signal{signal}` and every `logic.Ref{target}` whose id is in `scope.storeMembers` — the same
   `target`/id-derived discipline ADR-11's promotion already uses, extended to consumption.
2. **`declareStoreConsumption(component, module, scope)`** groups those ids by store (sorted by the
   store's own exported name — deterministic regardless of which member the walk found first), hoists
   exactly one `const local = useStore(StoreImport);` per distinct store actually needed, and returns two
   things:
   - `outer` — a handler-safe scope (`.get()` for a signal/derived read, a direct property for an
     action) — fed into `declareLocalSignals`/`declareLocalActions` and every action body, none of which
     may call a hook.
   - `subscriptions` — signal/derived ids already hoisted through `useSignal`, for render position only.
3. `emitComponent` calls it **before** `declareLocalSignals`/`declareLocalActions` — store consumption is
   declared first, exactly where `declareRouter` already ran first, for the same reason: everything after
   it may need to resolve a reference into it.
4. `childScope` (the render-position scope) gained a `storeSubscriptions` parameter, checked in
   `signalRead` before falling through to a component's own `useState`-then-subscribe signals — the same
   `subscribedName` shape, just fed a store-scoped local instead of a component-local one.

Only a component that actually references a store gets a `useStore` call — verified directly
(`store_consumption.test.ts`, and every pre-existing test in the suite, none of which reference a
store, emits none).

## Hook-hoisting strategy

Both `useStore` and `useSignal` are emitted **unconditionally, at the top of the component function,
before the tree that uses them is ever walked** — identical in spirit to how `declareLocalSignals`
already hoists a component's own signals, extended to a member this component does not itself own. A
member read only inside a `ui.Cond` branch or a `ui.List` template is still subscribed on every render.
Verified directly: `store_consumption.test.ts`'s `ui.Cond` test asserts the hook line appears once, above
`return`, never inside the conditional branch's own text.

No hook is ever declared inside `declareLocalActions`' or an action's own body — `outer`'s `signalRead`/
`localName` resolve store members by direct property access there, never by calling a hook, which is
also what makes those resolutions handler-safe in the first place.

## Signal (and derived-value) subscription semantics

Render position: `const local$ = useSignal(store.property);` — a real subscription, re-rendering the
component when the value changes. Handler/action-body position: `store.property.get()` — a snapshot,
read fresh each time the handler runs, never a stale closure over a render's value. This is the exact
`.get()`-vs-subscribed split `declareLocalSignals`/`childScope` already draw for a component's own
signals (documented there against the M5-D defect: `signal.get()` returning the right value once and
never subscribing); store members now draw the identical split, not a new one.

Tested directly, not merely asserted: `store_consumption.test.ts` covers a direct `bind.Signal`, a
`logic.StringInterp` part, and a `ui.Cond` test — all render-position, all subscribed. Derived values
(`sig.Derived`) are proven to need no special case at all: the runtime's `useSignal` accepts any
`ReadableSignal`, and `store.ts` already names a derived member the same way a signal is named
(`nameOf(node, id, 'computed', scope)`), so the same `objectOf`/`subscriptions` machinery covers both —
confirmed by a dedicated test, not assumed from the type signature alone.

## Action consumption

An action reference resolves to a **direct property reference** on the store object —
`onPressed={store.increment}` — never a reconstructed body, never wrapped, never wired back through a
component prop. `paramReplacement`'s action branch (N11) already produces this shape when rewriting an
interface; the generator's `outer.localName` produces the identical shape for any store-owned action a
component references directly, whether or not N11 ever touched that component's interface. Both call
sites sharing one action (an `ElevatedButton` and a `FloatingActionButton`, in the fixture) reference the
same store local — one `useStore` call, two property reads, proven in both the unit suite and the
browser proof (`promotion.spec.ts`, "two widgets, both bound to the promoted action, drive the same
store").

## Multiple-store behavior

A component using `StoreA.signal`, `StoreB.signal`, and `StoreA.action` gets exactly two `useStore`
calls (not three, not one per member), in deterministic order (sorted by the stores' own exported
names — `store_consumption.test.ts` asserts `alphaStoreStore` precedes `betaStoreStore` in emitted
source, independent of which member the tree-walk reached first). Ownership by identity, not name, is
proven with two distinctly-scoped stores that happen to share a human-readable member name — see the
previous section.

## Lifecycle

Nothing about *where* a store is instantiated changed. `Providers` (`app/providers.tsx`) already wraps
the whole client root in one `<StoreProvider>` per `app.Store`, regardless of `origin` — a promoted store
gets exactly the same one-instance-per-client-root/per-request lifecycle ADR-15 already guarantees every
other store. Verified in the browser, not merely inspected: `promotion.spec.ts`'s reload test increments
the promoted count, reloads, and asserts it returns to zero — proof the instance is provider-scoped
(a fresh client root) rather than a module singleton that would have leaked the previous value across the
reload. Had promoted stores been instantiated per-component instead, this milestone would have stopped
at Phase 8 rather than proceeding — they are not; `StoreProvider`'s existing placement already covers
this correctly, unmodified.

## Browser proof

`e2e/tests/promotion.spec.ts` (production) and `promotion.dev-only.spec.ts` (development, where a
hook-order violation is reported in full rather than stripped to a numbered URL) — both new, both
exercising `fixtures/apps/promoted_counter`, a fixture built for exactly this milestone
(`fixtures/apps/promoted_counter/lib/main.dart`). `e2e/src/build-fixtures.mjs`'s `APPS` and
`e2e/playwright.config.ts`'s projects/`webServer` entries were extended (ports 3313/3314) — a spec file
resolves to exactly one `baseURL`, so this fixture could not share `counter`'s.

Assertions: initial value renders server-side, increments on click (both bound widgets), state resets on
reload (proving provider-scoped lifecycle, not a leak), zero console output beyond React's own DevTools
banner in development, zero failed requests, and — the dev-only file's specific target — zero hook-order
warnings across repeated renders through both call sites.

*(This build was run in the background — the completion notification and its result are reported
separately from this document; the plan and the code that make the proof possible are recorded here
regardless of that run's outcome, since a browser failure would be an implementation defect to fix, not a
reason this section's design is wrong.)*

## `hello_bridge` — unchanged, as expected

Re-run through the real analyzer and `bridge normalize` this session: **byte-identical** to the
committed `fixtures/uir/hello_bridge.normalized.ndjson`. `LoginScreen`'s promotion is blocked by M7-E3's
outbound-safety check (it only forwards `isDark`/`onToggleTheme`, never reads them), exactly as recorded
in `docs/m7/m7e3-route-interface-promotion.md` — M7-F does not touch N11's promotion decision, only what
happens to UIR N11 already produced, so nothing about that outcome could change. `BRG3013` (declarative
route argument unreachable) and `BRG2305` (forwarded parameter, unprovable) both still fire, unchanged.
This was not attempted to be "fixed" here, per the milestone's own instruction not to change N11 to make
`hello_bridge`'s numbers improve.

## A defect this milestone's own tooling caught, not designed for

While regenerating `promoted_counter`'s golden through the real `parseUirNode` (strict schema parsing,
not the loose object construction `n9_n10_n11.test.ts`'s unit tests use), N11's own action-promotion
rewrite (`paramReplacement`, M7-E3) turned out to build a `logic.Ref` missing its required `id` field —
the *outer* `bind.Expr` got a content-hash id from its caller, but the *nested* `logic.Ref` inside it
never did. Every unit test using plain object construction and property assertions passed regardless,
because none of them serialize-then-strictly-reparse a promoted action's output. Fixed here
(`n11_promote_cross_route_state.ts`), and worth recording as the reason this milestone's real-analyzer,
real-parser build proof matters beyond its own stated purpose: it is also the thing that exercises N11's
own output against the schema's actual validation, which a hand-built-UIR unit test structurally cannot.

## Inline-`Navigator.push` — confirmed still separate, not touched

Per the explicit instruction not to implement `docs/m7/gap-inline-push-props.md` in this milestone:
`pipeline.ts`'s `componentScreens` loop (lines ~375-390) is unchanged by M7-F — still `reserve(componentId)`
only, no argument resolution, exactly as that gap document describes. Re-checked by direct inspection of
the current source rather than re-run from scratch, since the code path itself is untouched; the defect's
root cause and fix remain unrelated to promoted-store consumption, confirmed rather than assumed.

## Remaining limitations

- Multi-hop forwarding remains unpromotable (M7-E3's scope boundary, unaffected by M7-F).
- A push-reached component still gets zero prop resolution (`gap-inline-push-props.md`; **M7-G**
  candidate, per the milestone's own instruction).
- `hello_bridge` still cannot reach a clean `tsc` build — unrelated pre-existing errors (`mounted`,
  opaque `Duration`/`Future` classes, missing theme tokens, inline-push navigation `BRG3008`), all
  pre-dating this milestone and this session's work on it.
