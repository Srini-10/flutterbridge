# M9-G — ScaffoldMessenger / SnackBar Presentation Architecture

Baseline: `HEAD == origin/main == ff86a80` (M9-F), verified before any work began.

## 1. The question

`ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Saved')))` is ordinary, common
Flutter code. Before this milestone it was refused outright (`BRG3013`), with a diagnostic
(`OVERLAY_MESSENGER` in `unsupported.ts`) that already stated why no earlier ADR closed it: *"a snack bar
is not in the widget tree and is not a route either; it is enqueued on the nearest `ScaffoldMessenger`,
which owns its queue, its lifetime and its dismissal. That is a different construct from a route overlay
and no ADR models it yet."* This milestone asks and answers: how should FlutterBridge represent and
execute transient, non-route UI presentation such as a snack bar, without pretending it is navigation or
dialog presentation?

## 2. Reading the existing architecture (before writing any code)

An investigation agent read, without modifying: `catalog/widgets/material.json` (the pre-existing
`SnackBar` catalog entry — `slots: [content, action]`, already anticipating widget-tree extraction, with
its own comment explaining it exists "so the extractor can refuse it *by name* with the reason"),
`dart/bridge_analyzer/lib/src/session/adapters/route/material_adapter.dart` (zero
`ScaffoldMessenger`/`SnackBar`/`Messenger` references anywhere — this is not a route/transition concept
at all), `dart/bridge_analyzer/lib/src/session/extract/widget_extractor.dart` and `expression_extractor.dart`
(confirming `WidgetExtractor` is only ever invoked from the top-level orchestrator and from
`TransitionExtractor`'s own inline-destination hook — never from ordinary expression extraction),
`packages/generators/react/src/internal/emit/unsupported.ts` (`SnackBar`, `ScaffoldMessenger`,
`ScaffoldMessenger.of`, `SnackBarAction`, `showSnackBar` all carry `OVERLAY_MESSENGER`, `owner: 'adr'`),
`packages/runtimes/react/src/internal/widgets/dialog.ts` and `shell.ts` (the latter's own header names the
boundary precisely: *"`SnackBar`, modal `BottomSheet`, dialogs and menus... are shown by an imperative call
rather than by being in the tree"* — no runtime component exists for any of them), `docs/adr/0025-the-navigation-model.md`
(a correction to my own assumption going in: this ADR does **not** already draw the route-overlay/messenger-overlay
distinction — that distinction exists only in `unsupported.ts`'s own comments and the M9-D/M9-E milestone
docs), and `dart/bridge_analyzer/lib/src/session/adapters/widget/generated/material_catalog.dart`
(`navigationOverlayOpeners = {showDialog, showModalBottomSheet, showGeneralDialog, showMenu}` — confirmed
`showSnackBar` is not, and never has been, a member).

## 3. Reproducing the current gap

A throwaway probe (a real, resolved, stand-in Flutter package, following `extraction_test.dart`'s own
harness pattern) confirmed ten facts, all later reconfirmed against the real fixture in §7:

1. `ScaffoldMessenger.of(context)` extracts as an ordinary, fully-resolved `logic.Call{callee:
   logic.Ref{name:"ScaffoldMessenger.of"}}` — zero diagnostics, zero opacity.
2. `.showSnackBar(...)` extracts as an ordinary `logic.MethodCall` — zero diagnostics.
3. `SnackBar(...)`, reached as a plain constructor-call argument, extracts as generic `logic.New` — never
   `ui.Element`, because `WidgetExtractor` is never invoked from this position.
4. The `SnackBar` catalog entry exists but is never consulted in this call shape.
5. Refusal is entirely generator-side, via `MISSING_CAPABILITIES`.
6. `missingCapabilityOf('ScaffoldMessenger.of', undefined)` is what actually fires — the refusal happens
   at the `logic.Ref` inside the inner `logic.Call`, before the outer `showSnackBar` call is ever reached.
7. The separate `showSnackBar` entry in `MISSING_CAPABILITIES` is therefore structurally unreachable as
   the *first* diagnostic on any real program: obtaining a messenger always precedes calling a method on
   it, and that acquisition is always refused first.
8. No runtime primitive for transient presentation exists anywhere in `packages/runtimes/react`.
9. `DialogHost` (M9-D) is architecturally inapplicable as-is: one host per `app.RouteTransition.inline`,
   imperative `show()`/`close()`, exactly one instance by construction — incompatible with a queue.
10. `ADR-0025-the-navigation-model.md` cannot be cited as prior art for the route/messenger split; that
    split is this milestone's own contribution.

## 4. Separating the three sub-gaps

- **Gap A — `ScaffoldMessenger.of(context)` recognition.** An ordinary, resolved `logic.Call`. Resolvable
  generator-side, by resolved type.
- **Gap B — `.showSnackBar`/`.hideCurrentSnackBar`/`.removeCurrentSnackBar`/`.clearSnackBars`
  semantics.** Ordinary `logic.MethodCall`s on a `ScaffoldMessengerState`-typed receiver. Resolvable
  generator-side, by resolved type, and — reduction-ladder rung G13 later proved this directly — the
  recognition survives one level of local-variable indirection.
- **Gap C — `SnackBar(...)`'s own content.** The one gap that is genuinely structural: `WidgetExtractor`
  is never invoked from this argument position, and rung G10 later proved this generalizes to the entire
  content subtree, however deep.

## 5. Flutter semantics investigation (real SDK, real `flutter_test`)

Recollection was not trusted; six widget tests were written and run against the SDK actually installed in
this environment (Flutter 3.47.0), all passing:

1. **One messenger under default config.** `ScaffoldMessenger.of(context)` returns `identical()` instances
   regardless of context depth — two `Builder`s at different nesting levels resolved to the same
   `ScaffoldMessengerState`. The same structural shortcut M9-E found for `Navigator`.
2. **Sequential calls genuinely queue, FIFO, one visible at a time.** At t+300ms only "first" is present;
   at t+5s "first" is gone and "second" has appeared. A real, load-bearing difference from dialogs, which
   stack rather than queue.
3. **An explicit nested `ScaffoldMessenger(child: ...)` creates an observably separate scope.**
   `.of(context)` from inside it resolves to a different `ScaffoldMessengerState` (confirmed via
   `GlobalKey` identity comparison) than the app-level one.
4. **`SnackBarAction.onPressed` fires and Flutter auto-dismisses afterward — no explicit dismiss call
   needed.** Simpler than M9-E's dialog-action problem, which needed a whole scoped-dismissal mechanism.
5. **Default duration is 4000ms**, overridable by `duration:` — confirmed by timing.
6. Ownership/queue/dismissal behavior for `hideCurrentSnackBar` (animate out, advance),
   `removeCurrentSnackBar` (immediate, advance), and `clearSnackBars` (drop current + whole queue) is
   documented Flutter behavior, consistent with the real SDK source read during this investigation.

## 6. G1–G18 reduction ladder (real analyzer, real probes)

Run against the real analyzer via a throwaway harness mirroring `extraction_test.dart`/`transition_test.dart`.
Diagnostics were empty across all 18 rungs — every shape extracts as generic, structurally correct,
semantically unrecognized logic nodes today. Findings, condensed:

| Rung | Shape | Finding |
|---|---|---|
| G1 | `showSnackBar(SnackBar(content: Text('Saved')))` | Clean `logic.MethodCall` → `logic.New{typeName:'SnackBar'}`, `content` generic |
| G2 | Variable content | Same shape, content is an ordinary resolved expression |
| G3 | `duration: Duration(seconds: 2)` | `dart:core#Duration`, the exact existing representation |
| G4 | `action: SnackBarAction(...)` | Callback body extracts as an ordinary, fully-resolved `logic.Lambda` |
| G5 | Two sequential calls | Two independent statements — no merging, no runtime-shape awareness needed at analysis time |
| G6 | Inside a `for` loop | Ordinary control flow; call-site multiplicity is not (and cannot be) counted statically |
| G7–G9 | `hideCurrentSnackBar`/`removeCurrentSnackBar`/`clearSnackBars` | Ordinary zero-arg `logic.MethodCall`s |
| G10 | Rich content (`Row`/`Icon`/`Text`) | The *whole* subtree stays generic `logic.New`/`logic.ListLit` — Gap C generalizes past the outer `SnackBar` node |
| G11 | Project-defined lookalike | Resolved type diverges (`package:app/...`) — a required, passing negative control |
| G12 | Project-defined unrelated `.of` | Same — never confused |
| G13 | One local-variable indirection | Receiver's resolved type survives the indirection perfectly; recognition does not depend on the chained-call shape |
| G14 | Nested `ScaffoldMessenger` widget | Extracts as an ordinary `ui.Element`; **no structural link** to the descendant's own call site — genuinely undetectable per-call-site |
| G15 | Unsupported `SnackBar` property | Tokenizes/extracts cleanly — the analyzer never refuses an unsupported property; that burden is the generator's |
| G16 | Unsupported `SnackBarAction` property | Same |
| G17 | Indirect `SnackBar` reference | No back-link from the `logic.Ref` to its own `VarDecl` initializer exists anywhere in this compiler — only the direct inline-literal shape is reachable |
| G18 | `SnackBar` unrelated to any messenger call | Ordinary `logic.New`, no special-casing leaks in from mere type presence |

Synthesis: G1, G2, G3, G5, G7, G8, G9, G13 are safe to support by resolved-type recognition alone. G4 is
safe for extraction; its lowering is a generator-design question (§10). G10 requires real widget-tree
extraction (this milestone's one analyzer-side change). G11/G12 are passing negative controls. G14 must be
refused (no per-call-site proof possible). G15/G16 require a generator-side allowlist. G17 must be refused
(no indirect-reference tracing exists). No rung was impossible to construct.

## 7. Architecture options considered

- **A — new presentation/effect statement modeling the queue in the schema.** Rejected: every rung that
  matters (G1–G9, G13) already extracts as fully-resolved, ordinary logic nodes with complete type
  information. There is no missing *fact*, only a missing *lowering*. The queue is a runtime-lifetime
  concern, not a structural program fact — modeling it in the schema would be new abstraction surface with
  no proven contradiction behind it (CLAUDE.md's own bar).
- **B — a general presentation node covering dialogs and snack bars alike.** Rejected on direct evidence
  (§5.2): a route overlay stacks, a messenger overlay queues. One representation for both either loses the
  queue or invents stack semantics no dialog has.
- **C — reuse `app.RouteTransition.inline`/`DialogHost`.** Rejected: `DialogHost` is one host per
  transition, imperative show/close, exactly one instance — structurally incompatible with a FIFO queue of
  possibly-several pending items.
- **D — a runtime service call, recognized generator-side by resolved type, no new schema statement.**
  **Selected for Gaps A/B.** Direct precedent: `Future.delayed(Duration(...))` (M7-L) is recognized
  entirely generator-side, by the node's resolved type, with no dedicated analyzer-side node at all — the
  M8-V numeric-method pattern is the same idea one level up. The reduction ladder proves the
  `ScaffoldMessenger`-family call is exactly this shape today.
- **E — generator special-case recognition by source name.** Rejected outright — precisely what "resolved
  identity, never name matching" forbids. Rungs G11/G12 exist to prove the distinction is needed and hold.
- **F — map to dialog/modal.** Rejected; re-proven wrong by §5 (no route, no stack, queue not stack, no
  scoped-dismissal problem — `SnackBarAction` auto-dismisses).

The one genuinely new piece of schema is Gap C's own content, handled minimally (§9) rather than via a new
top-level node kind.

## 8. Identity/recognition rules

Resolved identity only, matching every precedent this session has established:

- The receiver's own resolved static type must be Flutter's real `ScaffoldMessengerState` — checked by
  **type**, never by the spelling `ScaffoldMessenger`. Real SDK evidence (the fixture build, §12) corrected
  an assumption the investigation's own throwaway stand-in had made: the real type resolves to
  `package:flutter/src/material/scaffold.dart#ScaffoldMessengerState`, not the more guessable
  `package:flutter/widgets.dart` — so the check is a `package:flutter/` **prefix** plus an exact class
  **name**, the identical idiom `isKitProvided` (`runtime.ts`) already uses, robust to the SDK
  reorganizing its own internal file layout across versions.
- The constructed `SnackBar`'s own resolved type is checked the same way.
- A project-defined class of the same name, or an unrelated `.of(context)` method (G11/G12), never
  satisfies either check — proven directly (§13/§16), not assumed.
- No Dart-source parsing in TypeScript, no regex over source text, anywhere in this milestone's own code.

## 9. Schema changes (additive only)

One new optional field: `l1.json`'s `logic.New` gains `presentedContent`, `$ref: l2.json#/$defs/UiNode` —
an **embedded** widget subtree, present only on a `SnackBar`'s own `logic.New` node, and only when the
recognized-call shape (§8, direct inline literal) held. Embedded, not referenced, for the same reason
`app.RouteTransition.inline`/`ui.Cond.then`/`ui.List.template` already embed rather than reference: no
`NodeId` exists to reference by at the point extraction runs (ids are minted later, during
canonicalization), and widgets are not otherwise addressable by `NodeId` anywhere in this schema — only
declarations (`VarDecl`, `Action`, `Component`, `RouteTransition`) are.

This crosses a schema-file boundary that had not been crossed before this milestone: `l1.json` (logic) had
zero references into `l2.json` (ui); `l2.json` already references `l1.json` (`Expr`, `VarDecl`,
`ParamDecl`). The new `presentedContent` field makes this the first `l1 → l2` reference, creating a
mutual file-level `$ref` cycle. This was tested, not assumed safe: `just codegen` was run immediately after
the schema edit, and both `packages/uir/src/generated/uir.ts` and `dart/bridge_uir/lib/generated/uir.dart`
generated cleanly, with `presentedContent` typed as `UiNode`/`RawNode`-embedding on both sides.

`content:` is extracted **exactly once**: when the recognized shape holds, `content` is omitted from the
`SnackBar`'s own ordinary `namedArgs` and appears only under `presentedContent`; when it does not, `content`
stays an ordinary `namedArgs` entry, unchanged. `duration:`/`action:` need no schema change at all — G3/G4
already proved they extract cleanly via the existing, generic mechanism, and this milestone's own
`SnackBarAction` is deliberately **not** routed through `WidgetExtractor` (it is not a rendered tree child;
its `label`/`onPressed` become props on the host call, read directly off the ordinary `logic.New` node the
same way `Duration`'s own `namedArgs.seconds` already is).

## 10. Analyzer changes

A new, narrow recognition point inside `ExpressionExtractor` — **not** a reuse of `TransitionExtractor`,
for the same "avoid an unvalidated side effect on unrelated machinery" reason M9-F declined to route
widget-tree scope through `Scope.forBody`. `_recognizeSnackbarPresentation` runs once per `MethodInvocation`
(mirroring `TransitionExtractor.maybeExtract`'s own placement), checks the receiver's resolved type is
`ScaffoldMessengerState` (`package:flutter/`), the method is `showSnackBar`, and the sole argument is a
**direct** `InstanceCreationExpression` for `SnackBar` — if so, records that exact AST node (by identity,
never by shape) for `_construction` to consume.

`_construction` — the single, heavily-shared function that builds every `logic.New` node in the whole
compiler — checks by `identical()` whether *this* node is the one recognized, and if so:

1. Extracts `content:` through the real `WidgetExtractor` (a new `WidgetContentHook` typedef, a function
   field rather than a direct import, for the identical "cannot import the file that imports me" reason
   `TransitionHook`/`ConstructionHook` are already functions — `WidgetExtractor` already imports
   `ExpressionExtractor`), embeds the result as `presentedContent`.
2. Omits `content` from the ordinary `namedArgs` extraction (new `omit` parameter on `_arguments`).
3. Gives the node a unique `anchorSegment` (`'snackbar[$ordinal]'`, one counter per file, mirroring
   `TransitionExtractor._ordinal` exactly) — **without this, two structurally identical snack bars in one
   file collide on anchor (BRG1205)**, a defect the real fixture build (§12) caught directly, not a
   theoretical concern.

The recognized node identity is consumed (reset to null) the instant it is reached, so a `content:` key on
any *other* construction — including one nested inside the very subtree this one embeds — can never
accidentally match a stale recognition.

No new node kind, no changes to `WidgetExtractor` itself, no changes to `TransitionExtractor`.

## 11. Compiler (N1–N11) changes

None. `presentedContent` is an ordinary embedded `UiNode`; every existing pass that walks widget-tree
content already handles an arbitrary `ui.Element` generically. Proven, not assumed: the fixture's own
`bridge validate` run (§12) exercises the full N1–N11 pipeline unmodified.

## 12. Real fixture and build proof

`fixtures/apps/snackbar_presentation/` — a real, generic, permanent fixture (`bridge.json`, `pubspec.yaml`,
committed `pubspec.lock`, `lib/main.dart`) exercising: a direct call (G1), variable content (G2), duration
+ action together (G3+G4), one local-variable indirection (G13), and `hideCurrentSnackBar`/
`removeCurrentSnackBar`/`clearSnackBars` (G7–G9) — seven button handlers on one `HomeScreen`.

`bridge analyze` (real, real Flutter 3.47.0 SDK) → `fixtures/uir/snackbar_presentation.ndjson` (committed
golden) → `bridge validate`: **deterministic** (two runs agree) and **fixed point**
(`normalize(normalize(x)) == normalize(x)`) both hold.

Building this fixture surfaced two real defects, found and fixed before the fixture could pass, not
discovered later:

- **BRG1205 (duplicate anchor).** The first version extracted `content:` through `WidgetExtractor`
  *in addition to* the ordinary `namedArgs` extraction, and gave the recognized node no distinguishing
  anchor segment — two `SnackBar(content: Text('Saved'))` call sites collided. Fixed by §9/§10's own
  `omit`/`anchorSegment` design.
- **A dead, unused local.** The generator's first version read `scope.snackbarHostLocal` directly at every
  lowering site, bypassing whatever expression the receiver itself evaluated to. For the direct call this
  was harmless (the receiver's own `logic.Call` already lowered to `snackbarHost`), but for the
  local-variable-indirection case (G13) it produced `const messenger = snackbarHost; snackbarHost.show(...)`
  — a declared, never-read local. Fixed by lowering `ScaffoldMessenger.of` itself (a new `logic.Call` case,
  checked by resolved return type before the callee is ever emitted) to `snackbarHost` directly, and having
  the messenger-family call use **the receiver's own emitted text** rather than reaching for
  `scope.snackbarHostLocal` a second time — `const messenger = snackbarHost; messenger.show(...)`,
  correctly reading the local the source program actually declared.

A third real defect was found and fixed independent of the fixture, via direct inspection of a real
`.bridge/uir.ndjson`: the real SDK resolves `ScaffoldMessengerState`/`SnackBar` to
`package:flutter/src/material/scaffold.dart`/`.../snack_bar.dart`, not the `package:flutter/widgets.dart`
an earlier investigation pass's own hand-written stand-in had used — the generator's resolved-type check
was fixed to a `package:flutter/` prefix plus exact name (§8), matching `isKitProvided`'s own, already-robust
pattern, rather than a brittle full-path match.

The generated `home-screen.tsx` (real, from a real build):

```tsx
export function HomeScreen() {
  const snackbarHost = useSnackbarHost();
  ...
  const handle_018f9a6b = () => {
    snackbarHost.show(<Text>{'Item deleted'}</Text>, { action: { label: 'Undo', onPress: () => {
  _undoCount.set((_undoCount.get() + 1));
} }, duration: new Duration({ seconds: 2 }) });
  };
  const handle_77bd0834 = () => {
    snackbarHost.show(<Text>{signal_335ea397.get()}</Text>);
  };
  const handle_b4cbe168 = () => {
    const messenger = snackbarHost;
    messenger.show(<Text>{'Via a local reference'}</Text>);
  };
  ...
}
```

`app/providers.tsx` declares `<SnackbarHostProvider>` once, nested inside `<ThemeProvider>` (the presented
surface reads the theme) and outside nothing else — conditional on the program actually needing it
(`ScaffoldMessengerSurvey`, §14), matching the existing "declared only when needed" discipline
`DialogHost`/`useRouter`/`useMounted` already follow.

8 build-proof tests (`snackbar_presentation_build.test.ts`), including a real `tsc` typecheck against the
real, unmocked `@bridge/runtime-react` — all pass.

## 13. Negative controls

All proven directly, not assumed:

- **G11** — a project-defined `ScaffoldMessengerState`/`MyMessenger`, genuinely in scope: never gets
  `presentedContent` (Dart extraction test); the generator's own `isScaffoldMessengerCall` returns `false`
  against it, and a real analyzer-produced document reaches an ordinary, unrelated `BRG3006` refusal
  ("`MyMessenger.of` is not declared in this program") — a pre-existing, unrelated refusal for calling any
  arbitrary project-defined class's own static method (M3-B: no `logic.ClassDecl` is ever emitted),
  independent of ADR-0030 entirely; nothing about the refusal mentions `ScaffoldMessenger` or a messenger
  overlay.
- **G12** — an unrelated project `.of(context)` — never confused (reduction-ladder finding, reconfirmed).
- **G13** — one level of local-variable indirection — still recognized (Dart test + fixture).
- **G14** — nested `ScaffoldMessenger` — see §16 for why this is refused generator-side, and honestly, why
  it is currently unreachable in practice (a separate, pre-existing refusal fires first).
- **G15/G16** — unsupported `SnackBar`/`SnackBarAction` properties (`backgroundColor`, `textColor`) —
  refused explicitly (`BRG3013`) via a real analyzer-produced document, never silently dropped.
- **G17** — an indirect `SnackBar` reference (`final bar = SnackBar(...); ...showSnackBar(bar)`) — never
  recognized; `content` falls through to the ordinary, generic extraction (Dart test).
- **Two structurally identical snack bars** in one file never collide on anchor (regression guard for the
  BRG1205 defect §12 found).
- **Determinism** — the same source extracts to the same bytes on a second, independent run.
- **`hideCurrentSnackBar`/`removeCurrentSnackBar`/`clearSnackBars`** never mistaken for `showSnackBar`'s
  own content-bearing shape (each is its own zero-arg case in `lowerScaffoldMessengerCall`).
- **`Future.delayed`/other `logic.New`/`logic.Call` sites are completely unaffected** — `presentedContent`
  is absent on every node it is not deliberately set on; the full pre-existing regression suite (§17)
  reconfirms this directly rather than by argument.
- **Dialogs/`Navigator`/`DialogHost` are unaffected** — the M9-D/M9-E build-proof (`dialog_destinations_build.test.ts`)
  passes unmodified, 7/7.

## 14. Generator / runtime contract

- **Ownership: root-scoped, single instance, by construction** (§5.1's evidence). `SnackbarHostProvider`
  declares the queue's own React state; it is **not** a module-level singleton — ADR-15's own rule
  (`react/context.ts`'s header: *"provider-scoped, never a module singleton"*, with the real Next.js
  cross-request-leak incident that motivated it) is a hard, binding constraint this milestone respects, not
  a preference to weigh. A call site reaches it the same way `useRouter`/`useTheme`/`useStore` already do:
  a React Context, read through a hook the generator hoists to the top of whichever component's own render
  body reaches a recognized call (`declareSnackbarHost`, mirroring `declareRouter` exactly) — never read at
  the call site directly, which would be a rules-of-hooks violation, since the call is almost always inside
  a callback.
- **Declared only when needed.** `surveyScaffoldMessenger` walks the whole program once (not twice — the
  same walk answers both "does any component need the host" and "does the program construct a nested
  `ScaffoldMessenger` widget"), computed before any component is emitted; `providers.tsx` declares
  `<SnackbarHostProvider>` only when the program actually presents a snack bar somewhere.
- **Queue: real FIFO, one visible at a time** (§5.2's own semantics, reused as the contract, not
  reinvented). A plain array in the provider's own `useState`; `show()` enqueues and, if nothing is
  currently showing, presents immediately; on advance (timeout, `hide()`, `remove()`, an action tap) the
  host moves to the next queued item.
- **Duration reused, not reinvented.** `SnackBar.duration` stays `dart:core`'s `Duration`, read the same
  way `delay()` (M7-L) already does — `duration.inMilliseconds` off the kit's own `Duration` class. No new
  representation.
- **`hideCurrentSnackBar`/`removeCurrentSnackBar`** both advance the queue immediately. Real Flutter
  distinguishes them only by *animation* (eased exit vs. instant) — the same "structural capability, not
  pixel fidelity" boundary `dialog.ts`'s own `AlertDialog` states for M3 dialog styling; this milestone
  does not attempt either transition. Documented explicitly, not silently conflated.
- **`SnackBarAction` — supported, narrowly.** `label`/`onPressed` lower directly (G4: the callback body
  extracts as an ordinary, fully-resolved lambda, wired into the enclosing component's scope exactly like
  any other inline callback). No dismissal-scope machinery needed — Flutter auto-dismisses (§5.4). An
  explicit allowlist (`label`, `onPressed` only) refuses anything else (§15).
- **No nested-messenger semantics** (§16).
- **Visual/animation fidelity not attempted** — `SnackbarView` is deliberately plain (fixed, centered,
  `role="status"`, `inverseSurface`/`onInverseSurface`/`inversePrimary` — the correct M3 color roles, not
  cited by file:line the way `shell.ts`'s own INV-20-driven components are, matching `AlertDialog`'s own
  precedent for a first structural cut rather than inventing new catalog work out of this milestone's own
  scope).
- **The `showSnackBar` return value is deferred**, the same way M9-E deferred `showDialog`'s own return
  value. Fire-and-forget only.

## 15. SnackBarAction and unsupported-property refusal

The generator maintains an explicit allowlist over `SnackBar`'s own `namedArgs` keys (`content`, `action`,
`duration`) and `SnackBarAction`'s (`label`, `onPressed`) — refusing, not silently dropping, anything else
(`BRG3013`, naming the exact property). Necessary and sufficient: G15/G16 proved the analyzer captures
every named argument faithfully regardless of whether this generator supports it, so this check is the
only layer that can catch it. Two real, analyzer-produced negative-control tests
(`snackbar_presentation_refusals.test.ts`) confirm `SnackBar.backgroundColor` and `SnackBarAction.textColor`
are both refused explicitly.

## 16. Nested-messenger refusal, and an honest limitation

§6/G14 proved the analyzer has no structural way to link a `.of(context)` call site to enclosing
widget-tree ancestry — the nested widget and the descendant's call are structurally disconnected, and the
analyzer's own single-walk-per-file design (`extractor.dart`'s "one walk" invariant) rules out a
second, order-dependent AST pass to reconstruct one. The check is therefore generator-side: `surveyScaffoldMessenger`
also detects whether the whole program constructs a `ui.Element` whose `component` is `ScaffoldMessenger`
anywhere, and if so every recognized call refuses, with a diagnostic explaining why (whole-program, not
per-call-site, because per-call-site ownership is what is actually unprovable — a coarser, provably-safe
rule was chosen over an unsound precise-looking one).

**Honest limitation, verified directly rather than assumed**: today, this check is unreachable in
practice. A real probe (`ScaffoldMessenger` used as a widget in the tree, wrapping a `showSnackBar` call)
was refused, but by a **different, pre-existing** mechanism — `ScaffoldMessenger` itself has no
`WIDGET_MAP` entry and is refused as an un-renderable widget (`MISSING_CAPABILITIES['ScaffoldMessenger']`)
before the messenger-call recognition is ever reached. This milestone's own nested-messenger check remains
as a defensive, forward-looking safeguard — correct, cheap, and would become the only thing preventing an
unsound `showSnackBar` call from building if `ScaffoldMessenger`-as-widget ever gains rendering support in
a future milestone — but it is not, today, the observable cause of any refusal a real program hits.

## 17. Strict Mode / duplication audit (mandatory, per the milestone brief)

The design is effect-driven (`SnackbarHostProvider` uses a `useEffect`-armed `setTimeout` for
duration-driven auto-advance), so this section is required, not optional.

**Argument**: `show()` is called at the **call site** — inside whatever event handler a recognized call
lowers to (`onClick`/`onPressed`) — never inside a `useEffect` or a component's own render body. React 18
Strict Mode's intentional double-invocation applies to render functions and effects; it does not re-invoke
an event handler that already ran once in response to a real event. One triggering event therefore
produces exactly one enqueue, by construction, with no de-duplication logic needed to make this true.

**Verified, not merely argued**: three dedicated tests in `snackbar.test.ts`, all against a real
`react-dom/client` root wrapped in `<StrictMode>`:

1. One `show()` call produces exactly one `[role="status"]` element and exactly one occurrence of its text
   — not two.
2. Strict Mode's development-only mount/unmount/remount cycle, with `show()` never called, produces no
   phantom presentation — nothing in the host's own mount path enqueues anything; only `show()` does.
3. Two `show()` calls in sequence, under `<StrictMode>`, still produce exactly two presentations, in the
   correct order, neither merged nor dropped.

All three pass. Ten runtime tests total (`snackbar.test.ts`), covering display, real FIFO queueing,
duration-driven auto-advance with the *given* duration (not a hard-coded one — an adversarial mutation
target, §18), `hide`/`remove`/`clear`, the action button's auto-dismiss, and `useSnackbarHost()`'s own
`BRG4005` outside a provider.

## 18. Adversarial mutations

Six mutations, each applied, run against the relevant real test suite, confirmed caught, then reverted —
`git diff` confirmed clean (no net change) after every revert:

| # | Mutation | Result |
|---|---|---|
| A | Recognize `ScaffoldMessenger`-family calls by method name only, ignoring the receiver's resolved type | **Not caught by any existing test** — a genuine coverage gap, found and closed (see below), then re-run and caught |
| B | Drop queue semantics — `show()` replaces the current presentation immediately instead of enqueueing | Caught: 3 runtime tests fail |
| C | Extract `SnackBar.content` twice (restore the pre-fix duplicate-extraction defect) | Caught: the Dart "content is not duplicated into namedArgs" test fails |
| D | `useSnackbarHost()` falls back to a silent no-op instead of throwing outside a provider (a module-singleton-style fallback, which ADR-15 forbids) | Caught: the "throws BRG4005 outside a provider" runtime test fails |
| E | Ignore the explicit `duration:`, always use the 4000ms default | Caught: 3 runtime tests fail |
| F | Silently accept an unsupported `SnackBarAction` property instead of refusing | Caught: the G16 refusal test fails |

Mutation A's own gap was treated the way M9-F's own precedent requires — not shrugged off as "the mutation
just happens not to matter." A real, analyzer-produced fixture (a project-defined `MyMessengerState` whose
own `showSnackBar(String)` method shares only the name) was built and added as a permanent test
(`snackbar_presentation_refusals.test.ts`'s own G11 case), checking both `isScaffoldMessengerCall`
directly and the generator's own observable behavior against real analyzer output. Re-applying Mutation A
against the extended suite: caught. Reverted; the full suite (Dart 406, generators/react 367,
runtime-react 410) passes clean.

## 19. Regression matrix

Every prior capability this milestone could plausibly have touched, reconfirmed passing, unmodified:

| Capability | Suite | Result |
|---|---|---|
| M8-V numeric SDK methods | `numeric_sdk_build.test.ts`, `numeric_sdk_recognition.test.ts` | pass |
| M9-A/M9-B/M9-C declaration-tier identity | `extraction_test.dart` groups | pass |
| M9-D/M9-E dialog destinations & dismissal | `dialog_destinations_build.test.ts` (7 tests) | pass |
| M9-F widget-tree collection-for identity | `widget_collection_for_identity_build.test.ts` (7 tests) | pass |
| `Future.delayed`/`Duration` (M7-L) | `delay.test.ts` | pass |
| Navigation diagnostics (M6-E) | `navigation_diagnostics.test.ts` | pass |
| Store consumption, promotion, local stores | full corresponding suites | pass |
| The real corpus classification floor | `corpus.test.ts` | pass, unchanged |

## 20. Validation

- `just typecheck` — clean, all packages.
- `just lint` — dependency-cruiser (0 violations, 115 modules/321 dependencies), stub-tag discipline (15
  tagged stubs, all accounted for, none new), portability (207 TS files + Dart, clean) — all pass.
- `just codegen-check` — generated schema/catalog models match their sources.
- `just dart-analyze` — `hello_bridge` unaffected, clean.
- `dart analyze lib/` (bridge_analyzer) — no issues.
- `dart test` — 406/406 pass.
- `pnpm --filter @bridge/gen-react test` — 367/367 pass.
- `pnpm --filter @bridge/runtime-react test` — 410/410 pass.
- `bridge validate` on the new fixture — deterministic, fixed point, both hold.
- The broader E2E determinism harness (`just determinism`, a fixed 5-app list this fixture is not a member
  of) was attempted and killed by the environment (exit 137, an apparent resource constraint unrelated to
  this milestone's own changes) rather than completing; determinism/fixed-point were independently
  confirmed for this fixture directly via `bridge validate`, and the harness's own 5 apps are unaffected by
  anything this milestone touches structurally (confirmed by the full generators/react and runtime-react
  suites, which exercise the same shared files those apps build through, passing clean).

## 21. Silent-wrong-code audit

Each item named in the milestone brief, addressed directly:

- **Duplicate display** — real FIFO queue, one visible at a time (§14, §17 tests).
- **Missing snack bar** — build-proof asserts the exact generated call text for every rung the fixture
  exercises.
- **Wrong ordering** — the queue test asserts "first" then "second," in order, never merged.
- **Wrong ownership** — root-scoped, provider-based (ADR-15-compliant), never a module singleton (§14,
  Mutation D).
- **Wrong host** — a component's own `snackbarHostLocal` is hoisted only when that component reaches a
  recognized call; `childScope`/`actionScope` both forward it correctly to nested scopes (verified by the
  fixture's own nested-action-body generated output).
- **Persisting after unmount** — the host is declared once, at the application root; its own lifetime is
  not tied to any individual screen's mount/unmount, matching Flutter's own `ScaffoldMessengerState`
  lifetime.
- **Timer leaks** — `clearTimer()` runs before every new timer is armed and on every explicit
  hide/remove/clear; the effect's own cleanup function also clears it.
- **Dropped or double-executed action callback** — `onPress` fires exactly once per tap (real DOM
  `click`), verified directly (§17 test 6).
- **Ignored duration** — Mutation E, caught.
- **Double-evaluated content** — the anchor-collision defect (§12) *was* exactly this, found and fixed
  before the fixture could pass, with a permanent regression-guard test.
- **Misclassified lookalike** — G11/G12, both proven negative controls, both re-verified after Mutation A
  closed the one real gap.
- **Dialogs/navigation accidentally affected** — the full M9-D/M9-E build-proof passes unmodified (§19).
- **Incorrectly flattened nested host** — not applicable; no nesting is attempted (§16), and the
  single-instance case is the only one this milestone authorizes.

## 22. What this does not attempt

General Material API support beyond `ScaffoldMessenger`/`SnackBar`/`SnackBarAction`; route navigation
work; arbitrary overlay support; a general notification/toast framework; nested-`ScaffoldMessenger`
semantics; the `showSnackBar` return value; visual/animation fidelity (entry/exit transition, swipe
gesture, exact Material surface treatment); indirect `SnackBar`/`SnackBarAction` references; any property
beyond the stated allowlists.

## 23. FlutterBridge/Continuum boundary audit

Continuum was not read, modified, referenced, or used as a validation corpus, dev target, or fixture
source at any point in this milestone. Every fixture, probe, and negative control is generic and
FlutterBridge-owned. No naming, structure, or scoping decision in this milestone was driven by any
external application's own requirements.

## 24. Files changed

**Schema**: `packages/uir/schema/l1.json` (`logic.New.presentedContent`, additive), plus regenerated
`packages/uir/src/generated/uir.ts` and `dart/bridge_uir/lib/generated/uir.dart`.

**Analyzer**: `dart/bridge_analyzer/lib/src/session/extract/expression_extractor.dart` (recognition,
`_presentedSnackbarContent`, `_arguments`'s new `omit` parameter, `anchorSegment`, the new `logic.Call`
callee-type hooks), `dart/bridge_analyzer/lib/src/session/extract/extractor.dart` (wiring
`presentedContentOf`).

**Generator**: `packages/generators/react/src/internal/emit/expression.ts` (`isScaffoldMessengerCall`,
`surveyScaffoldMessenger`, `lowerScaffoldMessengerCall`, `lowerShowSnackBar`, the new `EmitScope` fields
`snackbarHostLocal`/`hasNestedScaffoldMessenger`/`renderWidget`), `component.ts` (`declareSnackbarHost`,
`childScope` forwarding, a real pre-existing scope-chaining bug fixed as a direct consequence — `withDialogs`'s
own fallback branch had silently dropped `snackbarHostLocal` from the chain), `project.ts`
(`needsSnackbarHost`, conditional `<SnackbarHostProvider>`), `pipeline.ts` (the one program-wide survey,
computed once).

**Runtime**: `packages/runtimes/react/src/internal/widgets/snackbar.ts` (new — `SnackbarHostProvider`,
`useSnackbarHost`, `SnackbarView`), `packages/runtimes/react/src/index.ts` (exports).

**Fixture**: `fixtures/apps/snackbar_presentation/` (new), `fixtures/uir/snackbar_presentation.ndjson` (new,
committed golden).

**Tests**: `dart/bridge_analyzer/test/extraction_test.dart` (new group, 6 tests),
`packages/generators/react/tests/support.ts` (`snackbarPresentationRaw`),
`packages/generators/react/tests/snackbar_presentation_build.test.ts` (new, 8 tests),
`packages/generators/react/tests/snackbar_presentation_refusals.test.ts` (new, 3 tests),
`packages/runtimes/react/tests/snackbar.test.ts` (new, 10 tests).

**Docs**: `docs/adr/0030-scaffold-messenger-snackbar-presentation.md` (new), this file.

## 25. Outcome

**Outcome A** — a bounded implementation, all gates passed. `ScaffoldMessenger.of(context).showSnackBar(SnackBar(...))`,
`hideCurrentSnackBar()`, `removeCurrentSnackBar()`, `clearSnackBars()` are supported for the root-messenger
case, with content/duration/action, real FIFO queueing, and a verified React 18 Strict Mode safety proof.
Every negative control the evidence identified is refused explicitly. Every adversarial mutation is caught.

FlutterBridge remains the sole development target. **M9-H has not been started.**
