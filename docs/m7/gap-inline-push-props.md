# Gap — a component reached by an inline `Navigator.push` gets no prop resolution at all

**Status:** resolved by M7-G (`docs/m7/m7g-inline-push-prop-resolution.md`). Found during M7-D
(`docs/m7/m7d-reality-audit.md` §3), restated as an open question in the M7-E2 ADR amendment
(`docs/adr/0011-amendment-route-argument-promotion.md`), confirmed still current during M7-E3
implementation (not part of M7-E3's scope — see "Why this is distinct" below), and implemented in
M7-G by extracting `rendered()`'s per-argument resolution loop into a shared `screenFor` closure and
adding `screenKeyFor` for per-transition destination identity, rather than writing a second resolver.
The rest of this document is kept as the original problem statement; it is no longer current behavior.

**Correction to this document's original framing (found during M7-G's Phase 2 reproduction):** `BRG3008`
was not, and never has been, a blanket refusal of every inline-push `component` destination — it fires
only for a transition no `logic.Navigate` performs (i.e., one the analyzer failed to lower the call
site for at all). `hello_bridge`'s own push hits it for exactly that reason (an unrelated
async/`await`/`mounted` extraction gap, `login_screen.dart:45-62`), which is why it looked, from
`hello_bridge` alone, as though inline pushes were categorically blocked. `inline_push_props`'s two
pushes are both `performed` (lowered to real `logic.Navigate` nodes) and were never refused by
`BRG3008` at any point — `componentScreens` rendering them bare was a **separate**, silent defect in
the generator's own argument resolution, unrelated to routability.

## Reproducer

```dart
// login_screen.dart
class LoginScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: () => Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => HomeScreen(title: 'Welcome')),
      ),
      icon: const Icon(Icons.login),
    );
  }
}

// home_screen.dart
class HomeScreen extends StatelessWidget {
  const HomeScreen({required this.title});
  final String title;

  @override
  Widget build(BuildContext context) => Text(title);
}
```

`HomeScreen` declares a required constructor parameter and is reached only by an inline push (no
declarative route names it).

## Current UIR shape

The analyzer emits an `app.RouteTransition` for the push, carrying the destination as `component`
(not `target` — Spec v2.4 §A17.6, since there is no named route to point at):

```json
{"kind":"app.RouteTransition","source":"<LoginScreen id>","component":"<HomeScreen id>",
 "arguments":[{"name":"title","binding":{"kind":"bind.Const","value":"Welcome"},"transport":"primitive"}]}
```

`HomeScreen`'s `ui.Component.params` correctly declares `title` as `required: true`. Nothing about the
UIR itself is wrong or incomplete — the argument is present, resolved, and primitive.

## Current generated output

`packages/generators/react/src/internal/pipeline.ts:348-360` (`componentScreens`, built inside
`pageOf`):

```ts
// An inline destination is reached by a push, not by a route, so it has no `app.Route` and no arguments
// to construct it with — §A17.6 says a push carries no path, and `app.RouteTransition.arguments` is
// N11's business rather than the page's. It renders as its bare component.
const componentScreens: PageScreen[] = [];
const seen = new Set<string>();
for (const transition of transitions) {
  const componentId = transition['component'];
  if (typeof componentId !== 'string' || seen.has(componentId)) continue;
  const emitted = reserve(componentId);
  if (emitted === undefined) continue;
  seen.add(componentId);
  componentScreens.push({ key: componentId, name: emitted.name });
}
```

`reserve(componentId)` only imports and names the component — it never reads `transition.arguments`.
Compare `rendered()` (`pipeline.ts:264-339`), the function declarative `app.Route` destinations go
through: it walks every argument, resolves each binding, and reports `BRG3013` for one it cannot reach.
`componentScreens` calls neither `rendered()` nor anything equivalent. The router table therefore maps
`"compHome"` straight to the bare component:

```ts
<RouterOutlet routes={{ root: LoginScreen }} components={{ compHome: HomeScreen }} />
```

`HomeScreen` is rendered by the runtime kit's stack consumer with **zero props** whenever it is on top
of the stack — regardless of whether its declared interface requires any. No diagnostic fires. `tsc`
would refuse this (`HomeScreen` requires `title`), but nothing before `tsc` says so, and nothing in this
repository's test suite currently drives a push-reached, required-param component through `tsc` to
discover it — `build.test.ts`'s tsc-checked fixtures (`layout_proof.ndjson`, `counter`) do not contain
this shape, and `hello_bridge` never reaches file emission at all (blocked by unrelated errors, per
`docs/m7/m7d-reality-audit.md`).

## Owning layer

Generator (`packages/generators/react/src/internal/pipeline.ts`), specifically `pageOf`'s
`componentScreens` construction. Not the analyzer (the UIR is complete and correct) and not N11 (there
is nothing to promote — `title` is a plain primitive).

## Why this is distinct from M7-E3

M7-E3 is about **whether N11 may remove a component's declared parameter** once its value is promoted
into store state. This gap is the opposite shape: the parameter is *not* promoted, the argument *is*
supplied, and the destination component's interface is *correct as declared* — the generator simply
never attempts to bind the supplied argument to it for this one destination shape (an inline push).
Fixing M7-E3's interface-rewrite path does not touch `componentScreens` at all, and fixing
`componentScreens` would not change anything about parameter *removal*. The root cause and the fix are
both unrelated to M7-E3's — confirmed by inspection, not assumed, per the standing instruction to fold
this in only if the same fix would resolve both.

## Proposed next investigation

- Extend `pageOf` so `componentScreens` resolves arguments the same way `rendered()` already does for
  declarative routes — likely by extracting `rendered()`'s per-argument resolution into a function both
  call, rather than duplicating it.
- Decide whether an inline-pushed component's wrapper needs the same generated-wrapper-function
  treatment `rendered()` gives declarative routes (`pipeline.ts:330-339`), since a component with
  argument-bound props can no longer be passed as a bare reference into `RouterOutlet`'s `components`
  map the way it is today.
- Add a `hello_bridge`-independent fixture to `build.test.ts`'s tsc-checked set that exercises exactly
  this shape (a push-reached, required-param component), since this is the concrete defect that would
  have caught the gap and nothing in the current corpus does.
