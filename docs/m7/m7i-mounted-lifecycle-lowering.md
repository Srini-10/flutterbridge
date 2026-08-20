# M7-I — Mounted lifecycle lowering & guarded-navigation browser proof

**Status: blocked on a schema decision. Not implemented. Documented and stopped, per the M6 rule
`docs/m6/GAP-mounted.md` already established — reconfirmed here against the current, post-M7-H
analyzer, with new evidence from the real Flutter SDK and this repository's own runtime kit.**

M7-H closed the extraction gap for an *awaited* navigation; the one diagnostic it left standing on
`async_push_guard` and on `hello_bridge` is `mounted` itself reaching the generator unresolved. This
milestone was scoped to close that. It did not: the investigation below reaches the same conclusion
`docs/m6/GAP-mounted.md` reached before M7-D even started — a schema amendment is required — and adds
nothing that changes that answer, only evidence that sharpens it.

## Fresh UIR evidence (Phase 1) — reconfirmed against the current analyzer

Re-run from scratch, not assumed from M7-H's own report. `dart run bin/bridge_analyzer.dart` over
`fixtures/apps/async_push_guard` produces, byte-identical to the committed golden:

```json
{"id":"2f043158aeecb41b","kind":"logic.Ref","name":"mounted",
 "type":{"library":"dart:core","name":"bool"}}
```

No `target`. `dart/bridge_analyzer/test/transition_test.dart`'s `m7hAsyncNavigation` group (M7-H)
independently confirms `context.mounted`'s shape the same way:

```json
{"kind":"logic.PropertyAccess","property":"mounted",
 "receiver":{"kind":"logic.Ref","name":"context"}}
```

Both are exactly what `GAP-mounted.md` recorded during M6. Nothing about M7-H's own change — extending
`statement_extractor.dart`'s `ExpressionStatement()` case to unwrap an `AwaitExpression` before offering
a call to `navigateOf` — touches `_reference()` (the function that builds every `logic.Ref`, `mounted`
included) at all. There was no reason to expect drift, and there is none.

## The semantic contract (Phase 2) — verified against the installed Flutter SDK, not assumed

Read directly from `packages/flutter/lib/src/widgets/framework.dart` (Flutter 3.47.0, the SDK this
machine builds against):

```dart
// State<T>, line 973
bool get mounted => _element != null;

// Element (which BuildContext.mounted resolves to), line 3670
bool get mounted => _widget != null;
```

`state._element` is set in `StatefulElement`'s constructor (before `initState` runs) and cleared in
`StatefulElement.unmount()`:

```dart
@override
void unmount() {
  super.unmount();   // Element.unmount(): _widget = null — clears context.mounted FIRST
  state.dispose();
  ...
  state._element = null;  // clears State.mounted — AFTER dispose() runs
  _state = null;
}
```

**A genuine, previously-unmeasured semantic difference**: within one `unmount()` call, `context.mounted`
transitions to `false` *before* `state.dispose()` runs, and `State.mounted` transitions to `false`
*after* it. A read of `context.mounted` from inside `dispose()` itself would already see `false`, while
`this.mounted` (via `State.mounted`) in the same `dispose()` call still reads `true`. This does not
change this milestone's conclusion — neither `async_push_guard` nor any measured corpus use reads either
flag from inside `dispose()` — but it is worth recording precisely, because a design that assumed the
two transition atomically together would be wrong, and `docs/m6/GAP-mounted.md`'s two-member vocabulary
proposal already keeps them as two distinct facts for an unrelated (and more load-bearing) reason:

> `mounted` is resolved from the lexical scope; `context.mounted` is resolved from a value that was
> passed in, and in 9 of 11 [measured] cases it crossed a function boundary to get there.

Both flags share the properties that matter for this milestone's use case (checking liveness after an
`await`):

- `true` from construction (State) / from the element existing (BuildContext) until unmount completes.
- `false` forever after unmount — `Element.mounted`'s own doc comment states it: *"Once unmounted, a
  given `BuildContext` will never become mounted again."* The same holds for `State`: a widget's `State`
  object is never reused across a remount — `StatefulElement`'s constructor (`framework.dart`) asserts
  `state._element == null` before assigning it, which only holds for a freshly created `State`; a new one
  is created for a new mount.

## The difficult case (Phase 3) — why a boolean snapshot is categorically wrong

Flutter's own `BuildContext.mounted` doc comment states the exact use case this milestone (and
`hello_bridge`'s real `_submit`) exercises:

```dart
onPressed: () async {
  await Future<void>.delayed(const Duration(seconds: 1));
  if (context.mounted) {
    Navigator.of(context).pop();
  }
}
```

The check happens *after* the `await` — the whole reason the guard exists is that the component may have
unmounted *during* the suspension. Translated naively:

```ts
const mounted = useMounted();      // a plain boolean, read once, at render time
await operation();
if (!mounted) return;              // ALWAYS the render-time value — never updates
```

This is wrong in exactly the way Phase 3 anticipated: a JavaScript closure captures the *value* of
`mounted` at the moment the async callback was created (render time), not a live read. If the component
unmounts during `operation()`, this `mounted` never changes — the check is permanently whatever it was
at render, making the guard a no-op. **Any correct design must expose something read *at call time*, not
captured at render time** — a live getter or a mutable cell, never a primitive `boolean`.

## Runtime contract comparison (Phase 4) — documented, not implemented

| | Shape | Post-await liveness | Idiom match |
|---|---|---|---|
| A — boolean snapshot | `const mounted = useMounted()` | **wrong** — proven above | n/a, disqualified |
| B — live getter | `const isMounted = useMounted(); isMounted()` | correct | a function call at every guard site |
| C — stable ref | `const mounted = useMounted(); mounted.current` | correct | `packages/runtimes/react/src/internal/react/lifecycle.ts`'s own established idiom |

B and C are functionally equivalent — both read a mutable cell at call time rather than a captured
value. **C is preferred**: `lifecycle.ts`'s `useUpdateEffect` (already shipped, M4-era) tracks "has the
first render happened" with exactly this shape —

```ts
const mounted = useRef(false);
useEffect(() => {
  if (!mounted.current) {
    mounted.current = true;
    return undefined;
  }
  return bodyRef.current();
}, dependencies);
```

— so a `useMounted()` primitive following the same pattern is not a new idiom in this codebase, it is
the existing one, reused for a new fact. The **critical detail**, confirmed by walking through React's
Strict Mode replay explicitly (Phase 17's own demand) rather than assuming it: the ref must be set to
`true` *inside* the effect body, not only at `useRef(true)`'s initial value.

```text
mount → effect runs (sets ref.current = true) → [dev-only] cleanup runs (sets ref.current = false)
      → effect runs again (sets ref.current = true) → component stays mounted, ref.current === true
```

A design that only relied on `useRef(true)`'s initial value and never re-set it inside the effect would
be left `false` after Strict Mode's synchronous mount→cleanup→remount replay in development — a bug this
codebase's own `useUpdateEffect` already avoids by the same means. The hypothetical, would-be shape:

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

Per-instance by construction (`useRef` is component-instance-scoped hook state — no module-global
mutable state, satisfying ADR-15/INV-19 without anything extra), and two mounted instances of the same
component are isolated automatically because React allocates a distinct ref per instance. Both of Phase
5's other requirements — "does not trigger state updates" and "does not cause unnecessary rerenders" —
hold for the same reason: writing `ref.current` is not a `useState` call and schedules no render.

**None of this is implemented.** It is a design, verified against the codebase's own existing pattern
and against React's documented Strict Mode behavior, ready to be built the moment Phase 6-8's blocker
(below) is resolved — and it exists here so that whichever milestone lands the schema amendment does not
have to re-derive it.

## Recognition ownership and the schema blocker (Phase 6-8) — reconfirmed, not newly discovered

`docs/m6/GAP-mounted.md` already proved, with 348 measured real-corpus occurrences across `continuum`
(2,489 lines) and `unichat` (47,796 lines), that:

- `mounted` reaches extraction as a reference to a framework property with **no declaration in the
  program** — it fits neither of UIR's two ways to spell a reference (a `target` pointing at a program
  declaration, or a bare `name` for a lexically enclosing parameter).
- The document the generator receives — `{"kind":"logic.Ref","name":"mounted","type":{...}}` — is
  **byte-identical in shape** to what a genuine unresolved reference (a typo, an undeclared name)
  produces. `_reference()` (`expression_extractor.dart:615`) builds this record from `scope.lookup(name)`
  alone; it does not consult `node.element` (the analyzer's own resolved-element information, which
  *does* exist at this point in the walk — the same resolved-element check `_isStaticQualifier` a few
  lines above already uses, and the same kind of check `registry.navigationActionOf`/`ADR-18`'s adapter
  pattern already relies on elsewhere).
- So the *analyzer* could, in principle, distinguish "this identifier resolves to `State.mounted` from
  `package:flutter/`" from "this identifier resolves to nothing" — the resolved element is available.
  What it lacks is **somewhere in the schema to put that fact**. Every existing `logic.*` node models
  something the *program* contains; none models a value the *host framework* provides. Teaching the
  generator to special-case the string `"mounted"` on the current shape would be recognition by name —
  the mistake C1/ISSUE-18 already named wrong once, and it would silently mishandle an application's own
  field genuinely called `mounted` (not a hypothetical: nothing in UIR distinguishes that case from
  Flutter's own).

This directly triggers the task's own STOP CONDITIONS:

1. **"generator cannot prove a `logic.Ref("mounted")` is Flutter `State.mounted`"** — true, by
   construction: the fact the proof would need (the resolved element) is discarded before the document
   leaves the analyzer.
2. **"generator cannot prove `context.mounted` is Flutter BuildContext lifecycle state"** — true, for
   the same reason, one layer down (`logic.PropertyAccess{property: 'mounted'}` carries no more identity
   than the `logic.Ref` case).
4. **"current UIR has erased required semantic identity"** — true; the resolved element existed during
   extraction and is not carried into the document.
5. **"a schema amendment is required"** — the conclusion, confirmed independently by this milestone's
   own investigation and matching `GAP-mounted.md`'s prior one exactly.

Condition 6 (do `State.mounted`/`BuildContext.mounted` differ enough that one primitive cannot preserve
both?) is answered above: they differ in **scope** (lexical `this` vs. a passed `BuildContext` value,
9-of-11 measured `context.mounted` uses crossing a function boundary with no enclosing component at all)
— which is exactly why `GAP-mounted.md`'s proposal already uses **two** vocabulary members
(`component.mounted`, nullary; `context.mounted`, takes the context value as an operand), not one. The
one-microsecond ordering difference found in Phase 2 above does not add a third member or change the
two-member shape.

## The amendment (unchanged from `GAP-mounted.md`, reconfirmed)

```json
"Intrinsic": {
  "description": "A value the host framework provides, which the program does not declare.",
  "x-uir-kind": "logic.Intrinsic",
  "properties": {
    "kind":      { "const": "logic.Intrinsic" },
    "intrinsic": { "enum": ["component.mounted", "context.mounted"] },
    "type":      { "$ref": "shared.json#/$defs/TypeRef" }
  }
}
```

Expression-level (not a statement-level `MountedGuard`) — `GAP-mounted.md`'s own corpus measurement
found 58 of 348 real occurrences are `mounted` as one boolean operand inside a larger expression
(`if (result == null || !mounted) return;`), which only an expression-level node can represent; this
milestone's own Phase 9 would have required the same thing had implementation been reached. Additive and
optional, so no existing document is invalidated.

## Compound expressions, multiple reads (Phase 9/10) — would already work, once the node exists

Not testable without the amendment, but worth recording *why* both would already hold, by construction,
once `logic.Intrinsic` exists: it is an ordinary expression node, so it composes inside `logic.Binary`/
`logic.Unary` exactly as `logic.Ref`/`logic.PropertyAccess` already do — no special-cased "guard emitter"
is needed, matching the task's own instruction not to build one. Two separate reads in one function
(`if (!mounted) return; ...; if (!mounted) return;`) are two separate `logic.Intrinsic` nodes, each
independently lowered to `mounted.current` (or `isMounted()`) — a fresh read at each call site, never a
value threaded from the first read to the second, so staleness cannot creep in from the UIR side either.

## `async_push_guard` and `hello_bridge` — unchanged, as expected

No code changed in this milestone — the conclusion is a re-confirmation, not an implementation — so
neither fixture's measured state moves:

- `async_push_guard`: still exactly one substantive diagnostic, `BRG3006` ("`mounted` is not declared in
  this program"), `files: []`. Re-verified fresh in this session; byte-identical to M7-H's own
  measurement.
- `hello_bridge`: still 28 generator diagnostics, `files: []`. `mounted`'s own `BRG3006` is 1 of the 28,
  unaffected; `BRG2305` (multi-hop, unrelated) still 4; every other pre-existing diagnostic unchanged.
  Not re-measured with fresh counts here beyond confirming no code path that could affect them changed —
  `git diff` for this milestone is empty (documentation only), so re-running the pipeline would only
  reproduce M7-H's own numbers exactly.

## M7-F/M7-G/M7-H regression

Not applicable in the sense of "re-tested" — no source file changed, so the full `pnpm --filter
@bridge/gen-react test` (187 tests) and `dart test` (248 tests) suites were not re-run for this
milestone; there is nothing a documentation-only change could have regressed. (They were last confirmed
green at the end of M7-H, commit `34465a6`.)

## CI / determinism / fixed point

Not run for this milestone. `just ci`/`just determinism` validate generated artifacts and compiled
output; with no source change, there is nothing new for them to certify, and running them would burn
real time reproducing M7-H's own already-recorded green result. `git status --short` is clean except for
this milestone's two documentation files.

## Remaining blockers

- The schema amendment itself (`logic.Intrinsic`, two-member vocabulary) — unimplemented, per the M6/M7-I
  rule.
- The runtime primitive (`useMounted()`, ref-based, Strict-Mode-safe as designed above) — unimplemented,
  blocked on the same thing.
- Generator-side lowering for `logic.Intrinsic{intrinsic: 'component.mounted' | 'context.mounted'}` —
  unimplemented, blocked on the same thing.
- `hello_bridge` and `async_push_guard` both remain unable to reach a clean `tsc` build for this one,
  now precisely isolated reason (plus `hello_bridge`'s other 27 pre-existing, unrelated gaps).
- Phase 20's browser proof (positive and negative/unmount scenarios) could not be attempted: there is no
  buildable application to load in a browser until the schema/runtime/generator chain above exists.

## Recommendation for the next milestone

Write the ADR. `docs/m6/GAP-mounted.md` and this document together already contain everything an ADR
needs: the corpus evidence (348 real occurrences, two-member vocabulary justified by scope difference),
the schema shape (`logic.Intrinsic`), the runtime contract (`useMounted()`, ref-based, with the
Strict-Mode-correct shape derived from this codebase's own `useUpdateEffect`), and the generator-side
recognition boundary (an adapter-registry check on resolved element, following the same
`navigationActionOf`/ADR-18 pattern already used for every other framework-intrinsic recognition in this
compiler). The next milestone's job is to turn that into an actual ADR document, get it decided, and
then implement schema + runtime + generator together — since, per `GAP-mounted.md`'s own note, the kit
API addition "belongs in the same ADR" as the schema change. This is the single remaining thing standing
between `async_push_guard`/`hello_bridge` and a clean build, and it is the last item M7-D through M7-I's
own investigations have left open.
