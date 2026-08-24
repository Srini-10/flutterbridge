# M9-D — Dialog destination architecture & bounded `showDialog` support

**Baseline:** `3503537` (M9-C, "fix: preserve growing scope in declaration lists") ==
`350353768f57e09e9d126167d2f890e902b16763` == `origin/main`, verified fresh from `git rev-parse`, not
assumed. Pre-existing, unrelated drift confirmed present and left untouched, never staged:
`fixtures/apps/hello_bridge/analysis_options.yaml`.

**Scope, as instructed:** dialog destination architecture, specifically the bounded `showDialog(...)` case
M8-W/M8-X already identified. The other five items in M9-C's own remaining-blocker graph (`BridgeAnalyzer`
gating on analyzer errors, the widget-tree collection-for's own `itemParam` identity, private/derived
getters, `ScaffoldMessenger.of`, class-declaration module emission) were not touched.

**Outcome: implemented.** `showDialog(context: context, builder: (_) => AlertDialog(title: ..., content:
...))` — a push whose destination is a framework widget the project does not declare, previously refused
outright — now compiles end to end: a new, additive `app.RouteTransition.inline` schema field (ADR-0025
amendment), reusing the existing `WidgetExtractor` unchanged, a real `DialogHost`/`AlertDialog` runtime
pair (native `<dialog>`, no portal/focus-trap library), and a generator lowering that shows the dialog via
an imperative ref rather than a router push. `AlertDialog.actions` is deliberately out of scope (§9) and
refused with a real diagnostic rather than silently mis-rendered.

## 1. Exact premise

M8-X found `showDialog(builder: (_) => AlertDialog(...))` refused: the adapter (`MaterialRouteAdapter`)
already recognized the call as a navigation and its destination as `AlertDialog`, but
`TransitionExtractor._destination()` required a widget destination to resolve to a project-declared
`ui.Component` — which `AlertDialog`, a framework widget, never does — and returned `null`, reported
(`BRG1201`-adjacent), dropping the edge. M9-C's own remaining-blocker graph carried this forward verbatim
as "dialog destinations," attributed to M8-W/M8-X.

## 2. Fresh verification — the adapter half needs no changes

Re-read directly, not assumed: `MaterialRouteAdapter.claimsTransition`/`navigationActionOf`/
`transitionOf` (`dart/bridge_analyzer/lib/src/session/adapters/route/material_adapter.dart:306-394`)
already, since M6-E, recognize every `MaterialCatalog.navigationOverlayOpeners` member (`showDialog`,
`showModalBottomSheet`, `showMenu`, `showGeneralDialog`, `showBottomSheet`) as a `push`-action navigation
and already read the destination off the call's own `builder:` argument, the identical mechanism a page
route's own destination uses. Confirmed by direct code reading and by the existing, unmodified test group
`'a route overlay is a navigation to an inline destination'` (`test/transition_test.dart`) staying green
throughout. The gap is squarely in `_destination()`'s own resolution requirement, one call downstream.

## 3. Architecture decision — embedded subtree, not an invented reference

Two ways to represent "the destination is a widget the project doesn't declare":

- Invent a synthetic component reference for it. Rejected: `_destination()`'s own existing comment for the
  `component` branch already states the reason — a `RawRef` names a real declaration or it is a dangling
  reference (`BRG1201`), and `AlertDialog` has no declaration in this program.
- Embed the widget tree directly, the same way `ui.Cond.then` and `ui.List.template` already embed a
  subtree rather than referencing one. Chosen: no new NodeId concept, no invented symbol, and the
  extraction mechanism already exists — `WidgetExtractor.extract()`, the identical function every ordinary
  `build()` render tree already goes through.

## 4. Schema decision — additive, ADR-0025 amendment

`docs/adr/0025-amendment-inline-overlay-destinations.md` (new) records the decision. `l3.json`'s
`RouteTransition` gains a third, mutually exclusive field:

```json
"inline": { "$ref": "l2.json#/$defs/UiNode", "description": "..." }
```

`target`/`component`/`inline` — exactly one present, enforced by `_checkTransitionDestinations`
(`dart/bridge_analyzer/lib/src/emit/validation.dart`), changed from a 2-way `(target == null) ==
(component == null)` check to a 3-way count-based one; `Codes.malformedTransition` (BRG1307)'s own
explanation text updated to name all three. Purely additive: no existing field changed shape, no NodeId
derivation changed, no runtime schema-version bump beyond the ordinary generated-code regeneration
(`just build`) every schema edit already requires.

## 5. Catalog decision

`catalog/widgets/material.json` gains an `AlertDialog` entry: `slots: ["title", "content"]`, no
`childrenProp`. `title`/`content` are the only slots this milestone's own evidence (M8-X's cited shape)
covers; `actions` is deliberately not catalogued (§9).

## 6. Extraction implementation

`dart/bridge_analyzer/lib/src/session/extract/transition_extractor.dart`:

- `TransitionExtractor` gains `late final WidgetExtractor widgets;`, wired after construction
  (`extractor.dart`: `transitions.widgets = widgets;`), the identical DI-ordering idiom
  `expressions.transitions` already uses.
- `_destination()` — previously `return null;` when a widget destination did not resolve to a project
  component — now falls back to `(field: 'inline', value: RawChild(widgets.extract(widget, scope)))`.
  Nothing else about the method changed: a path destination and a resolved-component destination are
  unaffected.
- `maybeExtract()`'s own `arguments` population is gated `if (destination.field != 'inline')`: an inline
  destination has no separate route boundary for N11 (ADR-11) to promote a value across, so recording
  `arguments` for it would offer a promotion with no corresponding prop interface anywhere. Found by
  direct inspection of real extracted UIR, not assumed correct by construction (§13, Errors).

## 7. A genuine bug found and fixed during fixture-building — anchor collision (BRG1205)

Building the permanent two-dialog fixture (`fixtures/apps/dialog_destinations`) surfaced a real defect via
the real `bridge analyze` CLI (not caught by the narrower Dart unit-test harness, §13): two independent
`showDialog` calls in one file, each building a structurally identical `AlertDialog(title: Text(...), ...)`
shape, both claimed the anchor `lib/main.dart#AlertDialog/title:Text` — `BRG1205`, "two nodes claim the
anchor."

**Root cause** (`dart/bridge_analyzer/lib/src/builder/node_factory.dart:50-73,123-140`): an anchor is
purely structural (widget type + slot/index), never positional. Before this milestone, the only record
kind that ever embedded a `ui.*` subtree was `ui.Component`, and it has always supplied
`anchorSegment: name` (the class name) precisely to give each render tree its own private anchor
namespace (`component_extractor.dart:169`; see also the explicit comment at
`declaration_extractor.dart:137-139`). `app.RouteTransition` is the first record kind to embed a
`RawChild` UI subtree (`inline`) without an analogous anchor-owning segment — so every inline destination
in a file started a *fresh, empty* anchor path, and two structurally identical dialogs collided regardless
of their source location. This was newly possible, not a latent pre-existing bug: no prior construct ever
produced more than one independent extraction root within a single enclosing scope.

**Fix**: `RawNode(kind: 'app.RouteTransition', ...)` now supplies `anchorSegment: destination.field ==
'inline' ? 'transition[$ordinal]' : null` — `$ordinal` is the same per-file navigation counter already
minted for the transition's own symbol (`_ordinal`, captured once per call rather than incremented twice).
`target`/`component` destinations embed no subtree and get no anchor segment, matching their pre-existing
behavior exactly. Verified: the two-dialog fixture now analyzes with zero diagnostics, each dialog's own
subtree anchored under its own `transition[0]`/`transition[1]` namespace.

## 8. Runtime kit — `DialogHost` / `AlertDialog` (`packages/runtimes/react`)

The kit had zero dialog/modal/overlay primitives before this milestone (confirmed by exhaustive search).
New file `src/internal/widgets/dialog.ts`:

- `DialogHost` — a `forwardRef` component wrapping a native `<dialog>` element behind an imperative
  `{ show(): void }` handle (`DialogHostHandle`). `showModal()` — the real `HTMLDialogElement` method —
  gives modal behavior, a `::backdrop` scrim, and focus-trapping for free; no portal, no z-index
  bookkeeping, no focus-trap library. Typed structurally (`interface DialogElement { showModal(): void }`)
  rather than as `HTMLDialogElement`, because this package's `lib` is `ES2023` with no DOM — the same
  discipline `input.ts`'s own `Focusable` already established, kept for the same reason (provably
  server-renderable).
- `AlertDialog` — an ordinary `WIDGET_MAP` entry rendering `title`/`content` in order. No `close()` method
  and no `actions` prop: nothing generated calls either yet (§9).

Exported from `packages/runtimes/react/src/index.ts`.

## 9. Deliberate scope limit — `AlertDialog.actions`

Removing the catalog's `childrenProp` did **not** prevent `actions:` from being extracted — a separate,
catalog-independent fallback inside `WidgetExtractor` still extracts an unrecognized widget-list argument
as `children` regardless. The catalog-only mitigation was proven insufficient by direct testing before
being abandoned.

The real reason `actions` is out of scope: an action button's `onPressed` commonly calls
`Navigator.pop(context)` to dismiss the dialog, and this milestone's own generator lowers every `pop` as a
page-router pop (unchanged, §11) — correct for a real page, silently wrong for a dialog with no page to
pop. Representing "dismiss the dialog I'm inside" is a genuine, unresolved architectural question, not a
recognition gap, so it is refused rather than guessed at:

`component.ts`'s `checkCapabilities()` gains a guard: `widgetName === 'AlertDialog' &&
asArray(node['children']).length > 0` reports `GeneratorDiagnosticCode.UnsupportedCapability` (`BRG3013`)
with a message naming the exact ambiguity, rather than letting the shape reach `tsc` as a cryptic unknown-
JSX-prop error. Verified the simplest evidenced fixture (title/content only) has no `children` key at all
in its extracted UIR — the guard does not fire for the shape this milestone actually supports.

## 10. Generator implementation — showing the dialog (`packages/generators/react`)

**`expression.ts`** — `EmitScope` gains `dialogRefFor?(id: NodeId): string | undefined;`, a lookup by
transition id (not a bare local like `routerLocal`) since a component may reach more than one inline
destination and each needs its own ref.

**`component.ts`**:

- `emitComponent()` calls a new `declareDialogHosts(component, module, scope)` after `withMounted` (before
  the render-tree walk, for the same rules-of-hooks reason `routerLocal`/`mountedLocal` are declared
  early): one `useRef<DialogHostHandle>` per distinct inline destination the component reaches
  (`dialogRef` when there is exactly one, `dialogRef0`/`dialogRef1`/… otherwise), and one `<DialogHost>`
  per ref, rendered as a sibling of the component's own tree inside a `Fragment` — never inside it, the
  same shape `ui.List`'s own key-per-item expansion already uses, so a dialog exists whether or not it is
  shown.
- New helpers `inlineTransitionsOf`/`collectNodes`/`collectInto` — the collecting sibling of the existing
  `componentReaches`/`containsNode` (boolean, short-circuit): every `logic.Navigate` reachable from the
  component's own render tree *or* a `sig.Action` it references (M8-O's own reachability, reused), that
  names a transition with an `inline` destination, deduplicated by transition id.
- `dialogRefFor` is forwarded through `childScope` (which reconstructs every `EmitScope` field explicitly,
  so it needed an explicit forwarding line, mirroring `routerLocal`/`mountedLocal`) but **not**
  `actionScope` (which spreads `...parent` and only overrides specific fields, so the new field already
  flows through for free — checked directly by reading `actionScope`'s own body before assuming a fix was
  needed).
- `needsRouter(node, scope)` (new): a `logic.Navigate` needs `router` in scope unless it is a `push`/
  `replace` whose transition names an `inline` destination — that shape lowers to `dialogRef.current?.
  show()` and never touches `router` at all. `navigatesSomewhere` (which gates whether `declareRouter`
  emits `const router = useRouter();` at all) now checks this instead of "any `logic.Navigate`." Without
  it, a component whose only navigation opens a dialog still declared an unused `router` local — a real,
  if harmless, dead hook call this milestone's own new destination shape introduced; caught by direct
  inspection of the generated fixture output, not assumed clean.

**`statement.ts`** — the `logic.Navigate` `push`/`replace` case now checks, *before* requiring `router` in
scope, whether the named transition has an `inline` destination and `scope.dialogRefFor?.(transitionId)`
resolves; if so it returns `[\`${dialogRef}.current?.show();\`]` and never reaches the router-required
check at all. Ordering matters: `needsRouter` (§ above) means a dialog-only component declares no
`router`, so requiring one unconditionally, as the pre-M9-D code did, would have refused every inline push
with `BRG3006` — caught immediately by re-running the fixture after the `needsRouter` change, before either
change was considered done (§13).

**`widgets.ts`** — `AlertDialog` added to `WIDGET_MAP` (`component: 'AlertDialog', slots: { title:
'title', content: 'content' }`).

**`unsupported.ts`** — `AlertDialog` removed from `MISSING_CAPABILITIES` (it is a real mapping now);
`showDialog`/`showModalBottomSheet`/`showMenu`/`showGeneralDialog`/`showBottomSheet`/`PopupMenuButton`/
`SnackBarAction` entries unchanged, still the correct fallback messages for shapes this milestone does not
cover (a builder that returns something other than a widget, `showModalBottomSheet`'s own content, a
messenger overlay).

## 11. What did not change

`Navigator.pop`/`context.pop` still lower to `router.pop()`, unconditionally — a dialog opened by this
milestone's own mechanism is dismissed today only by the native `<dialog>`'s own Escape-key/backdrop-click
behavior, never by a generated pop. This is the direct consequence of §9's own scope limit and is not
silently wrong: nothing generated attempts to pop a dialog, because `actions:` (the only shape that would)
is refused before it reaches this code.

## 12. N5 interaction — zero changes, confirmed by mechanism, not assumed

`packages/compiler/src/internal/passes/n5_lift_closures.ts` locates closures via `walk(program)`/
`walkNode(lambda)` (`packages/compiler/src/internal/normalize/pass.ts`), which is fully structural —
`Object.values(record)` recursion with no per-kind registration anywhere, and no `ui.Component`/"enclosing
component" concept in N5 at all. A new `app.RouteTransition.inline` field embedding a `UiNode` subtree is
therefore walked automatically, identically to `ui.Cond.then`/`ui.List.template`, with no new code. The
evidenced shape (`title`/`content: Text(...)`, no callbacks) contains no closures for N5 to act on regardless.
Confirmed by the full compiler suite (`packages/compiler`, 159/159) passing unmodified, and by the real
`dialog_destinations` fixture running cleanly through `bridge normalize` (N1–N11 unmodified) as part of its
own build-proof.

## 13. Tests

- `dart/bridge_analyzer/test/transition_test.dart` — new group `'inline overlay destinations — a route
  overlay renders a framework widget directly (M9-D)'`, 7 tests: title/content slots embed correctly,
  `actions` still carries as an ordered `children` list at the extraction level (proving extraction
  fidelity independent of the generator's own later refusal, §9), `arguments` absent for an inline
  destination, two unrelated `showDialog` calls never collide (the anchor-collision regression test,
  §7), an ordinary `Navigator.push` to a non-declared widget also renders inline (proving the mechanism is
  general, not special-cased to `showDialog`), a builder that does more than return a widget stays
  refused (negative control, unchanged), determinism. One existing test in the `'inline MaterialPageRoute'`
  group, previously asserting the refusal this milestone replaces, rewritten to assert the new inline
  behavior instead.
- `dart/bridge_analyzer/test/transition_test.dart` — a stand-in `class AlertDialog` added to the shared
  `navFlutter` fixture's `widgets.dart` override.
- `packages/generators/react/tests/dialog_destinations_build.test.ts` (new) — the real build-proof: real
  analyzer output (committed golden, `fixtures/uir/dialog_destinations.ndjson`) → real `bridge normalize`
  → real generator → real `tsc` against the real, unmocked `@bridge/runtime-react`. 6 tests: no error / no
  `BRG3013`, one ref + one `DialogHost` per inline destination (two dialogs, `dialogRef0`/`dialogRef1`),
  each push shows its own dialog rather than calling a router, a dialog-only component declares no
  `router` at all, each `AlertDialog`'s title/content render in their own slots, and the full
  Flutter→analyzer→compiler→generator→`tsc` chain.
- `packages/generators/react/tests/generate.test.ts` — new group `'M9-D — AlertDialog.actions is refused
  rather than silently dropped'`, 2 tests: a hand-built `AlertDialog` node with `children` is refused
  (`BRG3013`, message names `AlertDialog.actions`, zero files emitted); one with no children is not.
- `packages/generators/react/tests/navigation_diagnostics.test.ts` — the existing `'a route overlay and a
  messenger overlay are not the same capability'` test updated: `AlertDialog` removed from the expected-
  present-in-`MISSING_CAPABILITIES` list, since it is a real `WIDGET_MAP` entry now, not a registry entry.
- `fixtures/apps/dialog_destinations/` (new, permanent) + `fixtures/uir/dialog_destinations.ndjson` (new,
  committed golden) — two independent `showDialog` calls in one `HomeScreen`, verified deterministic and
  at a normalization fixed point (`bridge validate --json`) before being committed.

## 14. Mutation / adversarial checks

Each mutation applied, confirmed to break the intended test(s), then reverted with a clean re-check:

1. **Anchor segment removed** (`transition_extractor.dart`: `anchorSegment: null` unconditionally) —
   reproduced the exact §7 collision. Caught by the Dart-level `'two unrelated showDialog calls never
   collide'` test (`Diagnostic:error[BRG1205]`) and by re-running `bridge analyze` on the real fixture
   (`BRG1205`). Both clean after revert.
2. **Dialog-ref lookup disabled** (`statement.ts`: `dialogRef` forced to `undefined`) — the inline push
   fell through to the router-required path. Caught by 5 of the 6 build-proof tests (`BRG3006` ×2,
   `BRG3005`, missing `<AlertDialog>` output). Clean after revert.
3. **`needsRouter` forced to always return `true`** (`component.ts`) — the dialog-only fixture emitted an
   unused `const router = useRouter();`. Caught by the build-proof's own "declares no router" test. Clean
   after revert.
4. **`checkCapabilities`'s `AlertDialog` guard disabled** (`component.ts`: `if (false && widgetName ===
   'AlertDialog' ...)`) — an `actions`-bearing `AlertDialog` stopped being refused. Caught by the new
   `generate.test.ts` refusal test (`BRG3013` expected `true`, got `false`). Clean after revert.

All four mutations reverted, `npx tsc --noEmit` and the full suites re-confirmed clean, before final
validation (§15) and commit.

## 15. CI / determinism / fixed-point

- `just ci`: exit 0. Dart `bridge_analyzer` 373/373 ("All tests passed"), `dart analyze --fatal-infos`
  clean (including the new test file, after fixing 6 lint findings introduced while writing it — quote
  style and an adjacent-string-literal boundary, §16). TS `@bridge/compiler` 159/159, `@bridge/gen-react`
  34 files / 347 tests, all green. `codegen:check`, `lint:deps`, `lint:stubs`, `lint:portability`,
  `verify:depcruise-negative`, `dart_uir` tests, and `flutter analyze` on `hello_bridge` all clean.
- `bridge validate --json` on `fixtures/apps/dialog_destinations`: `{"ok": true, "checks":
  [{"deterministic": true}, {"fixed point": true}]}`.
- `git diff --check`: clean.
- The full browser-based `just determinism` (three complete `analyze → normalize → generate → next build`
  runs, byte-compared) was not run this pass — the compiler-level determinism/fixed-point guarantee above
  was verified directly instead. Recorded honestly rather than presented as equivalent.

## 16. Errors found and fixed during this milestone (self-discovered, not user-reported)

- The anchor collision, §7 — a real defect, found by building the required permanent fixture rather than
  trusting the implementation was correct by construction, fixed with a scoped, minimal `anchorSegment`.
- The redundant `arguments` field for an inline destination (§6) — found by direct inspection of raw
  extracted UIR, fixed by gating on `destination.field != 'inline'`.
- The `catalog` `childrenProp`-removal approach to blocking `actions:` extraction, proven insufficient by
  direct testing before being replaced with the generator-level `checkCapabilities` guard (§9).
- `statement.ts`'s router-required check ran unconditionally before the inline-destination check, which
  would have refused every inline push once `needsRouter` stopped declaring `router` for dialog-only
  components — caught immediately by re-running the fixture, fixed by reordering the checks (§10).
- 6 `dart analyze --fatal-infos` lint findings in the new Dart test file (unnecessary double quotes,
  unnecessary parentheses, a missing-whitespace-between-adjacent-strings warning caused by an unrelated
  string-literal split) — fixed before `just ci` was considered green.

## 17. Regressions

The full Dart suite (373/373, `dart analyze --fatal-infos` clean), the full TS compiler suite (159/159),
and the full TS generator suite (347/347, including every M7/M8/M9-A/M9-B/M9-C build-proof and diagnostic
test) all re-run fresh after every mutation revert, all green. `hello_bridge`'s own `flutter analyze` stays
clean. No prior milestone's own tests needed modification, except the one deliberate, documented
`navigation_diagnostics.test.ts` update (§13) reflecting `AlertDialog`'s move from "missing capability" to
"real mapping" — a direct, intended consequence of this milestone, not a regression.

## 18. Silent-wrong-code audit

- An inline destination's own subtree is extracted by the identical, unmodified `WidgetExtractor` every
  ordinary render tree uses — no parallel, divergent extraction path to drift.
- `arguments` is never populated for an inline destination (§6) — nothing offers N11 a promotion that
  would silently do nothing at generation time.
- `AlertDialog.actions` is refused with a named diagnostic (§9) rather than rendered without them (which
  would silently drop a real part of the UI the source declares) or crash `tsc` with an opaque unknown-
  prop error.
- A dialog-only component declares no unused `router` (§10) — not silent-wrong, but dead code this
  milestone's own new shape would otherwise have introduced into every generated project that uses it.
- The router-required-check ordering bug (§16) would have manifested as a hard refusal (`BRG3006`), not
  silently wrong output — still caught before commit, but a correctness-visible rather than silent-wrong
  failure mode by construction.

## 19. Remaining FlutterBridge-only blocker graph

Unchanged from M9-C except this milestone's own item resolved (bounded):

- `BridgeAnalyzer` does not gate on the resolved unit's own analyzer errors — unchanged, not investigated
  this milestone (explicitly out of scope).
- The widget-tree collection-for's own `itemParam` identity — unchanged.
- Private/derived getters — unchanged.
- `ScaffoldMessenger.of` — unchanged; a `SnackBar` overlay remains a materially different problem
  (enqueued on a messenger, not a route push — §10's own `unsupported.ts` audit reconfirmed this
  distinction still holds).
- Class-declaration module emission — unchanged.
- **New, narrower, and explicitly scoped out by this milestone's own decision (§9)**: `AlertDialog.actions`
  — representing "dismiss the dialog I'm inside" as distinct from "pop the page router" is a genuine,
  unresolved architectural question, not a recognition gap, and needs its own design before
  implementation.

## 20. Recommended M9-E

Not preselected. Two concrete, evidence-backed candidates, carried forward or newly surfaced by this
milestone:

1. **`AlertDialog.actions` / in-dialog dismissal** (§9, §19) — needs a real architectural decision (a new
   `logic.Navigate` action kind? a `DialogHostHandle.close()` reachable from an action body? something
   else?) before any implementation, following the same investigate-first discipline this milestone used.
2. **Whether `BridgeAnalyzer` should gate on the resolved unit's own analyzer errors** — carried over from
   M9-C's own recommendation, still not investigated.

**M9-D complete. FlutterBridge remains the sole development target. M9-E has not been started.**
