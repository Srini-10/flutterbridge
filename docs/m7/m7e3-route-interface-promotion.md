# M7-E3 — Route argument promotion across component interfaces

Implements the decision in `docs/adr/0011-amendment-route-argument-promotion.md`. N11
(`promote-cross-route-state`) now promotes state/actions crossing a **declarative** `app.Route`
boundary — the gap M7-D found — and, when it can prove every caller agrees, retires the destination
component's parameter and rewrites its internal read to consume the promoted store directly. Single-hop
only, exactly as scoped.

## Algorithm

`packages/compiler/src/internal/passes/n11_promote_cross_route_state.ts`.

1. **Classify every (boundary, argument) pair once**, up front — a boundary is now a `ComponentBoundary`
   (`nav_graph.ts`), the shared shape a declarative `app.Route` and an imperative `app.RouteTransition`
   are both projected into. `classify()` gained a fifth verdict, `forwarded`, for a binding that reads
   the *source* component's own constructor parameter (`bind.Param`, or an untargeted `logic.Ref` — a
   `ParamDecl` has no id, so nothing can `target` it). This is the multi-hop shape.
2. **Report unconditionally** for verdicts that never depend on any other boundary: `object` (`BRG2301`,
   unchanged), `unpromotable` (`BRG2303`, unchanged), `forwarded` (`BRG2305`, new).
3. **Promote without consensus** when the destination has no real `ui.Component` backing it (an
   unresolvable route, or a component id nothing declares) — there is no interface to protect, so this
   pass behaves exactly as it did before this milestone.
4. **Promote under consensus** otherwise: group `(component, argument name)` across every boundary
   `nav-graph` says reaches that component (§"Reaching-caller consensus"). Only when consensus holds
   *and* an outbound-safety check passes does the parameter get removed and the internal read rewritten
   (§"Interface rewrite"); otherwise the group is refused with a diagnostic and nothing is touched — not
   even the individually-promotable boundaries in it.

## Proof model

Every promotion in this pass has always required a `target` NodeId resolving to a declared `sig.Action`
or `sig.Signal` — never a name match. This milestone adds two further proof requirements before an
*interface* may change, both because a wrong param removal is worse than a missed one:

- **Consensus** (below) — every reaching caller must agree, provably, not just plausibly.
- **Outbound safety** (below) — removing a parameter must not orphan a reference nothing here can prove
  resolves elsewhere.

Nothing added by this milestone infers from names, spans, source proximity, or argument position. A
shape this pass cannot prove is refused with `BRG2305` or `BRG2306`, never guessed at.

## Reaching-caller consensus

For a component `C` and parameter name `p`, `p` may be removed only if **every** boundary
`graph.boundariesByComponent.get(C)` lists — argument-bearing or not — satisfies:

- it supplies an argument named `p` at all (a caller that omits it blocks removal — `graph.boundaries`
  deliberately includes argument-free routes/transitions for exactly this check, a fix made during this
  milestone's own test-writing: the first cut filtered them out, which silently made "a caller supplies
  nothing" invisible to consensus rather than blocking on it), and
- that argument classifies as `action` or `signal` (not primitive, object, unpromotable, or forwarded),
  and
- every such classification resolves to the **same** underlying declaration (the same signal id, or the
  same action id) — two callers promoting two *different* signals to a parameter of the same name both
  block removal, exactly like one caller supplying a primitive does.

Consensus is computed once per `(component, name)` group from `graph.boundariesByComponent`, never from
traversal order — the same classification run against the same reaching set always produces the same
verdict, which is what makes the fixed-point and determinism tests below hold.

**Outbound safety**, checked only after consensus holds: does `C` itself, as the *source* of some other
boundary, forward the same-named value onward through a `forwarded` (case 4) binding? If so, removing
`p` would not repair that forward — it would orphan it, since the forward's own resolution depends on
`p` still existing in `C`'s scope. This is the exact `LoginScreen → HomeScreen` shape from the ADR's
worked example, and it is why `hello_bridge` itself does not end up promoted — see below.

## Interface rewrite

Once both checks pass: `rewrite()` removes the `ParamDecl` named `p` from `ui.Component.params`, and
walks the component's `render` field (`rewriteParamReads`) replacing every `bind.Param{param: p}` with a
direct store read — `bind.Signal{signal}` for a promoted signal, or `bind.Expr{expr: logic.Ref{target}}`
reusing the *matched* reference's own `type`, for a promoted action. Nothing is invented: the replacement
target is always the id consensus already proved, never a fresh guess.

`ui.Component` is a **declaration** — its id is `nodeIdOfSymbol('comp:' + path + '#' + Name)`
(`dart/bridge_analyzer/lib/src/builder/id_allocator.dart`), never a function of `params` or `render`
(ADR-17 ISSUE-6). Rewriting either therefore never changes the component's own id. Every tree node
*inside* `render` that actually changed gets its content-hash id recomputed
(`nodeIdOfContent`, via the same stripped-content rule every other tree node in this compiler uses); a
node this rewrite does not touch is returned byte-identical, not merely equal — `rewriteParamReads`
short-circuits on no change at every level, so an untouched sibling subtree is the exact same object,
not a structurally-equal copy.

## Diagnostics

| Code | Severity | When |
| --- | --- | --- |
| `BRG2301` | error | unchanged — a live object crosses a boundary (ADR-11a) |
| `BRG2302` | info | unchanged — a signal/action is promoted into a store |
| `BRG2303` | error | unchanged — a callback closes over something unpromotable |
| `BRG2304` | info | **new** — a component's parameter is removed; every reaching caller promoted it to the same store |
| `BRG2305` | error | **new** — a binding forwards the source component's own parameter; this pass cannot prove what it resolves to (fires both at the forwarding boundary itself, and — separately — at a component blocked from removing a parameter because of one) |
| `BRG2306` | error | **new** — reaching callers disagree on whether/how to promote a parameter; it is kept, named which caller blocked it |

Added to the registry: `docs/spec/v2.1-amendments.md` §A6.

## Identity behavior

Verified in `packages/compiler/tests/n9_n10_n11.test.ts`, not merely asserted: a promoted, rewritten
component's id is `toBe()`-compared (reference/value equal, not structurally) against its pre-rewrite id
across the promotion. The one caveat the ADR flagged — an `sig.Action` **synthesized by N5** from an
anonymous closure is content-addressed, unlike a declared one — was investigated and found moot for this
milestone: N11 never rewrites an action's own fields (only a signal's `scope`/`store`), so no path in
this pass can perturb an N5-synthesized action's id. Recorded as a required test (`n9_n10_n11.test.ts`)
rather than left implicit, since a future change to N11 that *does* touch an action's fields would need
to re-check this.

## Fixed-point and determinism behavior

`packages/compiler/tests/n9_n10_n11.test.ts`'s `'is deterministic and a fixed point...'` test proves,
via `Program.toNdjson()` byte comparison (canonical serialization, not `JSON.stringify`): the same
program built with its boundaries in forward and reverse order normalizes to the same bytes, and running
the pass a second time over already-promoted output changes nothing — one store, not two; no repeated
`BRG2302`/`BRG2304`; an empty diagnostics array on the second pass.

## `hello_bridge` result

Regenerated from the real analyzer this session (`dart run bin/bridge_analyzer.dart` +
`bridge normalize`, both rebuilt with this milestone's changes) — **byte-identical** to the committed
`fixtures/uir/hello_bridge.normalized.ndjson`. Nothing in this repository's fixtures changed.

This is not a shortfall — it is the correct, single-hop-scoped outcome, confirmed by tracing the actual
data: `LoginScreen` receives `isDark`/`onToggleTheme` from exactly one boundary (the declarative root
route — consensus trivially holds, single caller). But `LoginScreen` never reads either value itself; it
only forwards both onward into `HomeScreen` via an inline push, through an untargeted `logic.Ref` (the
`forwarded` verdict). The outbound-safety check correctly blocks removal, `BRG2305` fires (once for the
forwarding boundary, once for `LoginScreen` being blocked from losing the parameter), and `BRG3013`
(the generator's "declarative route argument unreachable" diagnostic M7-D found live) continues to fire,
unchanged. `hello_bridge`'s own motivating case turns out to be entangled with exactly the multi-hop
shape this milestone was scoped to exclude — confirmed by running the real pipeline, not assumed from
the ADR's worked example alone.

## A generator gap found and fixed during this milestone (not part of the interface-rewrite decision)

Proving the rewrite's UIR was correct required running it through the real generator, which surfaced a
pre-existing, undocumented-until-now limitation: **a component cannot yet consume a signal or action
belonging to a store it was not already wired to** (`pipeline.ts:432-435`'s `rootScope.signalRead: () =>
undefined`, with a comment admitting as much). For a signal this already failed loudly (`BRG3006`). For
an action it did not — `declareLocalActions` declared a local closure for *any* referenced action
regardless of ownership, and lowered its body in a scope that could not resolve the store's own signal
either, silently emitting a bare, unimported identifier (`sigDark = true;`) that only `tsc`, far
downstream, would have caught.

Fixed minimally, with the user's explicit direction to add a safety diagnostic only, not full cross-store
consumption: `EmitScope` gained `isStoreOwned(id)` (implemented once, in `rootScope`, from the
already-built-but-previously-unused `storeMembers` map), and `declareLocalActions` now excludes a
store-owned action from the set it declares a closure for. The render tree's own reference to it then
falls through the same resolution chain a signal already does, reaching the same, already-correct
"not declared in this program" diagnostic. Both cases now refuse the same way. Pinned in
`packages/generators/react/tests/store_consumption.test.ts`. Full cross-store consumption — making a
promoted value actually render — remains unimplemented; this milestone only ensures its absence is loud.

## Negative cases (protecting existing semantics)

All in `packages/compiler/tests/n9_n10_n11.test.ts`, "N11 — component-interface promotion" describe
block, plus the pre-existing "N11 — promote cross-route state" block (126 original tests, unchanged,
still passing):

1. a primitive route argument is left alone (pre-existing test, unaffected)
2. a live object is refused (`BRG2301`) even with a real destination component in scope
3. an unpromotable callback is refused (`BRG2303`) even with a real destination component in scope
4. two callers promoting two *different* signals to the same param name block removal (`BRG2306`)
5. one caller supplying a plain primitive blocks removal — consensus, not first-caller-wins
6. a caller that omits the argument entirely blocks removal
7. a component that only forwards the value onward is not rewritten (the `LoginScreen`/`HomeScreen`
   shape, `BRG2305`)
8. a `bind.Param` argument binding is recognized as the same forwarded shape as an untargeted `logic.Ref`
9. an unrelated param on the same component survives untouched when only one of two is promoted
10. the component's own id is stable across the rewrite (ADR-17)
11. a second normalization is unchanged (fixed point); caller order does not affect the result
    (determinism)
12. a route/transition naming a component this program does not declare still promotes on its own
    evidence — no interface to protect, matching pre-milestone behavior exactly

## Remaining multi-hop limitation

Unchanged from the ADR: a forwarding reference (`bind.Param`, or an untargeted `logic.Ref`) carries no
provable link back to whatever declaration ultimately supplies it. Proving one would require either
extraction changes giving a component's own parameter reads a resolvable target, or a deliberate
whole-program provenance analysis — explicitly out of scope here, and explicitly not something this pass
should grow into incrementally. `BRG2305` names the boundary and says which subsystem would own it.

## Inline-`Navigator.push` finding

Documented separately, deliberately not folded in: `docs/m7/gap-inline-push-props.md`. A component
reached by an inline push gets zero prop-resolution attempts today, regardless of whether N11 promoted
anything — a generator gap in `pipeline.ts`'s `componentScreens`, orthogonal to parameter *removal*, and
confirmed by inspection to have neither the same root cause nor the same fix as anything in this
milestone.

## Remaining blockers

| Blocker | Layer | Blocks `hello_bridge`? |
| --- | --- | --- |
| Multi-hop forwarding cannot be promoted | compiler (schema/extraction) | Yes — the reason `LoginScreen`'s params survive |
| A push-reached component gets no prop resolution | generator (`pipeline.ts`) | Latent — never reached, since `hello_bridge` fails generation earlier on unrelated errors |
| Cross-store consumption from an arbitrary component is unimplemented (only its absence is now loud) | generator (`pipeline.ts`, `component.ts`) | No — `hello_bridge` never reaches a genuinely-promoted, rendered component |
| `hello_bridge` cannot reach `tsc` at all (unrelated: `mounted`, `Duration`/`Future` opaque classes, missing theme tokens, inline-push navigation `BRG3008`) | generator, several | Yes, independent of this milestone |

None of these are regressions introduced by M7-E3; all pre-date it and are documented here because
proving this milestone correct required tracing far enough to find them.
