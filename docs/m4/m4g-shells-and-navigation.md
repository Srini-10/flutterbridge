# M4-G — Navigation, shells, and application structure

**Goal:** close the application-shell gap so substantially more real Flutter applications generate and
typecheck.

**Status: complete.** `MaterialApp`, `Scaffold`, `AppBar`, four navigation surfaces, the drawer family and the
intrinsic-sizing pair work end to end. **No schema change and no new ADR** — and one planned change turned out
to be unnecessary, which is the milestone's most useful finding.

CI green: 207 analyzer tests + `dart analyze` clean, 28 `bridge_uir`, 22/22 TS test tasks (**365** runtime,
**106** generator, 126 compiler), 18/18 typecheck, `codegen:check` OK, `lint:stubs` OK.

---

## 1. What was measured before anything was built

Two runs of the real pipeline, before a line of code:

**`hello_bridge` — this project's own walking-skeleton — emitted zero files.**

```
error BRG3001 :: `MaterialApp` is not a Flutter widget this generator has a mapping for…
error BRG3001 :: `Scaffold` is not a Flutter widget this generator has a mapping for…   (×2)
error BRG3005 :: generation reported 5 error(s), so no files are emitted.
```

That is the shell gap stated exactly: not a widget missing from a long tail, but the two widgets **every**
Flutter application is built out of. A screen inside a `Scaffold` could not be compiled at all.

**A purpose-built shell app** (app root with routes and a theme, `Scaffold` with every slot, `AppBar` with
actions and a `PreferredSize` bottom, `Drawer`, `NavigationBar`, `NavigationRail`, `BottomNavigationBar`,
imperative navigation, a `SnackBar`, the measuring-layout helpers) then located the rest:

| Observed | True owner |
| --- | --- |
| `MaterialApp` and `Scaffold` unmapped | **generator** — but not the way it looked; see §2 |
| `NavigationRail.destinations` → `BRG2110` at N8 | **catalog** — the diagnostic blamed the frontend; see §3 |
| `onDestinationSelected: _select` → `BRG3006` | **analyzer** — see §4 |
| `Navigator.pushNamed(...)` → `BRG3006` | **schema** — see §7 |
| `IntrinsicHeight` / `IntrinsicWidth` / `OverflowBox` refused | **the classification was wrong**; see §5 |

The analyzer itself produced **zero diagnostics** on the shell app. Extraction was never the gap.

## 2. The app root is consumed, not rendered

The obvious move was a `MaterialApp` component in the kit. The evidence says that would have been a bug.

Everything a `MaterialApp` carries has **already been consumed** by the time the generator runs:

| Written in Dart | Where it has already gone |
| --- | --- |
| `home: HomeScreen()` | an `app.Route` at `/` |
| `routes: {'/browse': …}` | one `app.Route` each |
| `theme:` / `darkTheme:` | `app.Token`s, which N10 expands into the 46-role palette |

And the emitted project *is* the rest of it: `providers.tsx` supplies theme, router and assets; `layout.tsx` is
the document; `page.tsx` renders the route at `/`. **The App Router is the MaterialApp.** A component for it
would mount the application a second time, inside itself.

So a `ui.Component` whose render root is an app root emits **no file** — `app_root.ts`, wired into the
pipeline. The build proof asserts that no emitted file so much as contains the string `MaterialApp`.

What genuinely has nowhere to go is reported by name rather than dropped (`BRG3016`): `builder:`,
`onGenerateRoute:`, `navigatorObservers:`, `themeMode:`, localisation. Each names its capability and its owner.
`hello_bridge` trips exactly one — `themeMode`, because it toggles brightness at runtime.

## 3. `BRG2110` blamed the wrong layer, and the fix was two catalog lines

`NavigationRailDestination` and `BottomNavigationBarItem` are **not Flutter `Widget`s**. So a whole
`destinations:` list landed in `props` as an expression, and N8 reported:

> `NavigationRail.destinations` holds a list of widgets inside `props`… **The frontend must emit them as
> children.**

The planned work was a new *structural element* concept in the catalog, a new adapter predicate, and a change
to extraction's widget test. **None of it was needed.** Extraction asks the catalog for a widget's children
property *first*, and only falls back to inferring one from the argument's type. The fallback correctly
declined — the type genuinely is not a widget list. The catalog simply had no entry for `NavigationRail`.

```json
{ "name": "NavigationRail", "slots": ["leading", "trailing"], "childrenProp": "destinations" }
```

That is the entire fix, and `BottomNavigationBar` took one more line. Verified by running the analyzer again
before building anything on top of it: the destinations came out as `ui.Element` children with `icon` and
`label` slots, and `BRG2110` was gone.

The diagnostic's message is now wrong about the owner in a case it will meet again, and §10 records that.

## 4. A method tear-off reached the generator unresolvable — an analyzer defect

`onDestinationSelected: _select` is how every real navigation surface is written. `_select` writes state, so
it becomes a `sig.Action` — but the `logic.Ref` at the tear-off carried **no `target`**, and the generator
reported `BRG3006`: *"`_select` is not declared in this program."* True of the document, false of the program:
the action was right there, unreachable.

The cause is an ordering bug. The class scope was built from the signals pass and frozen **before** the
methods pass ran, so no method name was ever in it. The fix is a naming pass between the two: actions are
minted and bound before any body is extracted, using the same write test the emitting loop applies, so a name
bound can never point at a node the document lacks.

It survived this long because **no earlier fixture passed a method tear-off as a callback** — every callback
in the build proof was an inline lambda, and `hello_bridge`'s one tear-off is a *parameter*, which resolves by
a different path. This is the same shape as M4-F's three latent generator defects: real, pervasive, and
invisible until a fixture wrote the natural thing.

## 5. M4-D's "measuring half" grouped two different problems

M4-D refused `IntrinsicWidth`, `IntrinsicHeight`, `OverflowBox` and `FittedBox` under one sentence — *"the
constraint model's measuring half"*. Three of the four were misclassified:

- **Intrinsic sizing is not missing from CSS.** `max-content` is defined as the size a subtree takes given
  unbounded space, which is Flutter's `computeMaxIntrinsicWidth` verbatim. Two standards, one concept.
- **`OverflowBox` never needed measurement.** Its defining behaviour is that the child does not contribute to
  the parent's size — which is what `position: absolute` means.
- **`FittedBox` genuinely does.** It needs the measured size as a *number*, to divide by and produce a scale
  factor, and CSS has no expression that reads a layout result back into a value. It stays refused, with a
  reason that now says that instead of a phrase it shared with three widgets it had nothing in common with.

`Baseline` joins `FittedBox`: CSS aligns *to* a baseline (`align-items: baseline`) but cannot offset by one.

The divergence that remains is stated at `intrinsicStyle`: `IntrinsicHeight`'s commonest use is equalising a
`Row`'s children, and `height: max-content` sizes the *box* — the children stretch only if the row says
`CrossAxisAlignment.stretch`.

## 6. SDK findings

Every number is transcribed into `catalog/widgets/material.json` with a file:line citation, from Flutter
**3.44.0**, and generated into the kit. Reading the SDK rather than the M3 specification changed four things:

| Finding | Source |
| --- | --- |
| **An M3 `AppBar` is 64 tall, not 56.** `kToolbarHeight` is 56 and is what everyone quotes; it is M2's. | `material/constants.dart:30` vs `material/app_bar.dart:2527` |
| **An `AppBar`'s leading icon and its action icons are different colours** — `onSurface` and `onSurfaceVariant`. A single "icon colour" would be wrong for one of them on every screen. | `material/app_bar.dart:2548-2557` |
| **`BottomNavigationBar`'s selected colour is brightness-dependent** — `primary` in light, `secondary` in dark. A real M2 behaviour, not a simplification. | `material/bottom_navigation_bar.dart:933-936` |
| **Its unselected colour is a literal** — `themeData.unselectedWidgetColor` resolves to `Colors.black54` / `Colors.white70`. A kit component may hold no literal (INV-20), so the catalog names `onSurfaceVariant`, the role those literals stand in for, and says so at the entry — the precedent `Tooltip` set in M4-C. | `material/theme_data.dart:484` |

Also transcribed: `Drawer` 304 wide with a 16px end radius (`drawer.dart:61`, `:799-806`), `NavigationBar` 80
tall with a 64×32 indicator (`navigation_bar.dart:1430`, `:29-30`), `NavigationRail` 80/256
(`navigation_rail.dart:1240-1241`), FAB 56/40/96 at elevation 6 (`floating_action_button.dart:775-799`) inset
by 16 (`floating_action_button_location.dart:25`), `MaterialBanner` (`banner.dart:501-519`, `:350-357`),
`BottomSheet` (`bottom_sheet.dart:1483-1505`), `Scaffold`'s background = `surface` (`theme_data.dart:453`).

## 7. What is refused, and precisely why

| Construct | Missing capability | Owner |
| --- | --- | --- |
| `Navigator.push` / `pushNamed` / `pop` | a link from an `app.RouteTransition` to the **call expression** that performs it | schema |
| `SnackBar`, modal `BottomSheet`, dialogs, `ScaffoldMessenger.of` | imperative overlays — shown by a call, not by being in the tree | adr |
| `FittedBox`, `Baseline` | reading a measured size back as a number | runtime |
| `TabBar` / `TabBarView` | a shared `TabController`, plus the page transition it animates | runtime |
| `IntrinsicWidth.stepWidth`, `AppBar.elevation`, `Scaffold.resizeToAvoidBottomInset` | per-parameter (`BRG3017`) — the widget renders, this parameter does not | runtime |

The navigation one is worth stating exactly, because most of it is already built: the analyzer *does* see the
call and emits an `app.RouteTransition`; the generator *does* emit a route table; the kit's `useRouter().push`
is ready and tested. What is missing is the link between the edge and the call site. `app.RouteTransition` has
`source`, `target` and `arguments` and is `additionalProperties: false`. **Matching the two by source span
would work, and is exactly the generator heuristic this project refuses.** So the honest fix is a schema
field, which is an ADR — and M4-G stops there rather than inventing one.

Two diagnostic-quality fixes came out of this. `Navigator.pushNamed` previously reported *"not declared in
this program"*, blaming the program for a compiler gap; it now names the capability and the owner. And a
refused callee no longer reports one diagnostic per argument — `Navigator.pushNamed(context, '/x')` produced
three, two of them naming `context`, a framework primitive nobody can act on.

## 8. A bug the build proof structurally cannot catch

Every shell component read typography tokens (`labelMedium`, `titleLarge`). The build proof passed — `tsc` does
not render. The new runtime tests failed immediately with `BRG4006`, on a theme built from
`ColorScheme.fromSeed`, which is what the build proof itself uses.

**N10 derives colours and nothing else.** ADR-13 puts palette derivation in the compiler; Material's *type
scale* has no equivalent pass, so no program that does not state a `TextTheme` has a `labelMedium`. Making it
required would have refused every application in the corpus, including this project's own build proof, for a
token the compiler never produces.

So typography is applied when the theme states it and inherited when it does not (`typographyIfDefined`) —
omitting a declaration, not inventing a value. A Material type scale in the catalog would close it, and is a
milestone of its own.

## 9. A golden that had drifted silently

`fixtures/uir/hello_bridge.normalized.ndjson` had **33** nodes; the real analyzer produces **38**. The five
are all `app.Token`s — M4-E's colour hoisting, which the golden predated by a whole milestone. Nothing else
differed, and `_submit` and `Icon._positional0` "defects" seen during triage were staleness, not code.

`layout_proof.ndjson` has a drift guard (`build_proof_test.dart`); this one does not, because minting it needs
the real Flutter SDK and the Dart suite runs against stubs. It is regenerated here, and the gap is recorded
rather than papered over — a golden with no guard is a golden that will drift again.

## 10. Corpus impact and coverage

| | M4-E | M4-F | **M4-G** |
| --- | --- | --- | --- |
| Supported instantiations | 879 (45.5%) | 885 (45.8%) | **913 (47.2%)** |
| Classified unsupported | 227 (11.7%) | 221 (11.4%) | **207 (10.7%)** |
| `WIDGET_MAP` entries | — | 52 | **72** |

The numeric delta understates this milestone more than any before it. The corpus is two apps — a museum guide
and a travel browser — and **neither uses `Drawer`, `NavigationBar`, `NavigationRail`, `BottomNavigationBar`,
`IconButton` or `FloatingActionButton` at all**; `AppBar` appears once. The instantiation count moves on
`Scaffold` (11), `OverflowBox` (9), `IntrinsicHeight` (4) and `MaterialApp` (1).

The real result is categorical: **before this milestone no Flutter application could generate, because every
screen is inside a `Scaffold`.** `hello_bridge` now reports **zero `BRG3001`** — not one unmapped widget
remains in it. What still blocks it is six other subsystems, each named:

```
BRG3010 ×14  its theme states `primaryColor:`, not a ColorScheme, so N10 derives no roles (INV-20 working)
BRG3016 ×1   MaterialApp.themeMode — switching brightness after mount
BRG3013 ×1   Navigator.push — the call-site link (§7)
BRG3008 ×1   an inline destination with no path (§A17.6)
BRG3007 ×1   a FutureBuilder whose branches are inside the builder (BRG2104 upstream)
BRG3006 ×3   notifyListeners, mounted, widget — framework primitives INV-22 should have erased
BRG3002 ×1   a call with Dart named arguments whose callee signature the program does not carry
```

That list is now a test (`generate.test.ts`), so re-introducing an unmapped widget fails CI.

## 11. Validation

**The build proof is a realistic application shell.** Flutter → analyzer → N1–N11 → generator → `tsc` against
the unmocked kit, with no hand-built node anywhere. It exercises `MaterialApp` (consumed), two routes, a theme,
`Scaffold` with seven slots, `AppBar` with leading/actions/`PreferredSize` bottom, `Drawer` + `NavigationDrawer`,
`NavigationBar`, `NavigationRail` + `BottomNavigationBar` on a second screen, `IntrinsicHeight`/`IntrinsicWidth`/
`OverflowBox`, `MaterialBanner`, a method tear-off, plus every M4-A…M4-F family. **Zero diagnostics, 11 files.**

**Determinism** — three independent `normalize` runs:

```
ed4c27e73ff163118f6d8009c46b405c1f8ce5e95ace105024f80223da12355b
ed4c27e73ff163118f6d8009c46b405c1f8ce5e95ace105024f80223da12355b
ed4c27e73ff163118f6d8009c46b405c1f8ce5e95ace105024f80223da12355b
```

**Fixed point** — `normalize(normalize(x)) == normalize(x)`: same hash. Analyzer golden pinned at
`53a7a8d5…`; 24 analyzer nodes → 76 normalized. **Incremental ≡ clean** holds via `generate.test.ts` and the
analyzer's incremental suites.

**No regression.** Every prior milestone's assertions still pass. Three tests changed, each because M4-G made
its claim false: two asserted `hello_bridge`'s `MaterialApp`/`Scaffold` were unmapped, and one used `Scaffold`
as its example of a widget the generator has never heard of.

## 12. Benchmarks

| Measure | M4-F | M4-G | Δ |
| --- | --- | --- | --- |
| Analyzer (build proof, warm) | 2.14–2.23 s | 2.22–2.35 s | +0.1 s — the fixture gained a whole app shell |
| `bridge normalize` | 0.08 s | 0.13 s | +0.05 s on a fixture that grew 24→76 nodes |
| Runtime tests | 334 | 365 | +31 |
| Generator tests | 97 | 106 | +9 |

Kit bundle, measured with `esbuild --bundle --format=esm --minify` and React external: **58,190 B** minified,
112,743 B raw. M4-F's 88,695 B was measured with a different command and is **not** comparable; this is a fresh
baseline with the command stated so the next milestone can compare.

No optimisation was done, because no bottleneck was measured. Both deltas track fixture size.

## 13. Remaining unsupported widget families

1. **The animation engine** (36 uses, runtime) — still the largest gap; M5.
2. **The gesture model** (21 uses, runtime) — `InkWell`, `ListTile.onTap`, `Chip.onDeleted`, and the state
   layers `ThemeSurface.stateLayer` already composes. Needs no ADR.
3. **`Matrix4` / `Transform`** (33 uses, runtime) — still the best effort-to-coverage ratio available.
4. **The sliver protocol** (28 uses, adr).
5. **Imperative overlays** (adr) — snack bars, dialogs, menus, modal sheets. One decision unblocks all four.
6. **Measurement** (runtime) — `LayoutBuilder`, `FittedBox`, `Baseline`, `MediaQuery`.
7. **A Material type scale** (adr/compiler) — new this milestone; see §8.

## 14. Release-readiness

The step this milestone represents is the difference between a compiler that handles *widgets* and one that
handles *applications*. Before it, no Flutter app could produce a project, because the shell was unmapped.
Now an application whose screens are scaffolds with app bars, drawers and bottom navigation compiles, provided
it states a `ColorScheme` and does not navigate imperatively.

Those two provisos are the honest limit, and both are narrow: the first is a one-line source change the
diagnostic tells the author to make, the second is §7's schema question.

## 15. Exact blockers for M4-H

1. **The navigation call site (schema, then generator).** `app.RouteTransition` records the edge and not the
   call. A `site: NodeId` field on it — or a `logic.Navigate` node — is the decision; both are ADR-level. Until
   then no converted application can navigate, which is the single largest functional hole left.
2. **`notifyListeners` (compiler or adapter).** ADR-4 already rules that *a signal write **is** the
   notification*, so the call is redundant — but "redundant" is a judgement about `ChangeNotifier`'s
   semantics, which belongs to the layer that models them. It blocks every `ChangeNotifier` store, and
   `hello_bridge` is one.
3. **`mounted` and `widget` (analyzer, INV-22).** Framework primitives that survived extraction. INV-22 says
   they must not; the adapter is where they are erased.
4. **`ui.Async` branches (compiler, N4).** `BRG2104` already names it upstream: a `FutureBuilder` that tests
   `snapshot.connectionState` inside its builder leaves normalization work undone.
5. **The gesture model (runtime).** The largest reachable widget-surface gap, and it needs no ADR.

**Recommendation:** take **the navigation call site** next. It is the only remaining blocker that makes
generated applications non-functional rather than merely incomplete, every other layer for it is already
built, and the decision it needs is small and well-posed.
