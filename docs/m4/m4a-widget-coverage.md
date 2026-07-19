# M4-A — Flutter Widget Coverage: report

**Date:** 2026-07-18. **Scope:** expand supported widget coverage without redesigning anything, touching
N1–N11, or extending the schema. **No schema change was required.** The catalog stayed the single source of
framework metadata; no widget is special-cased anywhere.

## Headline

Eight widgets are implemented end-to-end and fully validated — extract → normalize → generate → `tsc` →
render — deterministic, incremental, CI green:

| Family | Widgets |
|---|---|
| Flex children | `Expanded`, `Flexible`, `Spacer` |
| Material rules | `Divider`, `VerticalDivider` |
| Overflow | `Wrap` |
| Positioning | `Stack`, `Positioned` |

This is a **coherent, validated slice of Phase 1's layout surface**, chosen because it fits the existing
architecture with no new capability. The rest of the M4-A list is triaged below: what is feasible next by
the same pattern, and what genuinely needs new capability (and so was **stopped and documented**, not
faked, per the brief).

## What "adding a widget" turned out to require

The validation in M3-D fixed B1 by making the **catalog** decide slots. A consequence, verified here: a
Flutter widget whose `child:`/`children:` are ordinary widget slots is **already extracted correctly with no
catalog change** — the `isWidget` fallback routes a widget-valued named parameter to `slots`, and a sole
`List<Widget>` parameter to `children`. So for every widget in the implemented set, the work was exactly two
things, and never a third:

1. a **`WIDGET_MAP` entry** in the generator (`component`, `props`, `slots`, `enums`) — target-specific, one
   package, per ADR-18's line between shared metadata and per-target rendering; and
2. a **runtime component** in `@bridge/runtime-react` — faithful CSS with documented degradations, in the
   style `flex.ts` set.

No `catalog/widgets/material.json` edit, no codegen re-run, no schema touch. That the catalog needed nothing
is the strongest evidence the B1 fix was the right one.

## Compatibility matrix (implemented)

Every row: real Flutter source (build-proof fixture) → analyzer → compiler → generator → `tsc` against the
real kit → jsdom render test.

| Widget | Extract | Normalize | Generate | tsc | Render (CSS) | Notes |
|---|---|---|---|---|---|---|
| `Expanded` | ✅ slot `child`, prop `flex` | ✅ | `<Expanded flex={n} child={…}/>` | ✅ | `flex: n 1 0%`, `min-*: 0` | tight fill; `min:0` so it may shrink below content |
| `Flexible` | ✅ | ✅ | `<Flexible fit=… child={…}/>` | ✅ | `flex: n 1 auto\|0%` | `FlexFit` enum → basis |
| `Spacer` | ✅ | ✅ | `<Spacer/>` | ✅ | `flex: n 1 0%` | empty flex child |
| `Divider` | ✅ props | ✅ | `<Divider height={…} thickness={…}/>` | ✅ | box + centred bottom-border line | `color` not forwarded (token system, ADR-21) |
| `VerticalDivider` | ✅ | ✅ | `<VerticalDivider …/>` | ✅ | box + right-border line | as above |
| `Wrap` | ✅ children, enum `alignment` | ✅ | `<Wrap spacing=… alignment=…/>` | ✅ | `flex-wrap`, `column/row-gap` | vertical direction, `runAlignment` degraded |
| `Stack` | ✅ children | ✅ | `<Stack>…</Stack>` | ✅ | `position: relative` | non-default `alignment`/`fit` degraded |
| `Positioned` | ✅ slot `child`, props | ✅ | `<Positioned top=… left=… child={…}/>` | ✅ | `position: absolute`, offsets | only set offsets written |

**Partially supported (degradations, documented in the component, not hidden):** `Divider`/`VerticalDivider`
colour (defaults to Material light-theme `dividerColor` until token-valued props are mapped); `Wrap` vertical
direction + `runAlignment`/`crossAxisAlignment`; `Stack` non-default `alignment` and multiple overlapping
non-positioned children. Each is the honest limit of props-to-style mapping without the constraint model
(the M3 stub tag `flex.ts` and `stack.ts` name), and each is a *default*, never a silent wrong value.

## Performance impact

Negligible and bounded. Adding a widget is: one `WIDGET_MAP` object (an O(1) lookup the emitter already
does), one runtime component (tree-shaken — an app that never uses `Stack` ships none of it), and no new
pass. Extraction, normalization and generation are unchanged in shape; the analyzer test suite runs in the
same ~20s, the generator's build-proof `tsc` in the same budget. Determinism was re-verified: two generator
runs over the build-proof golden produce identical bytes; the analyzer's ids are unchanged for every node
these widgets do not touch (content/symbol addressing).

## New diagnostics

**None added, and that is correct.** The existing `BRG3001` (unmapped widget) and `BRG3004` (opaque reached
the generator) already name exactly what an un-implemented widget produces — a mapped widget simply stops
producing them. Adding a diagnostic per widget would be knowledge duplicated outside the catalog, which the
brief forbids.

## Architectural observations

1. **The catalog held.** Not one of the eight needed a catalog edit. The B1 fix (slots decided by the
   catalog) is what makes coverage expansion a two-file change instead of a three-language one.
2. **`flex.ts`'s degradation discipline generalises.** Every faithful CSS mapping has a place it stops
   (`Stack` sizing, `Wrap` direction, `Divider` colour) — the same limit `flex.ts` documented for
   `MainAxisSize.max`. Stating the limit in the component, as a default rather than a guess, is the pattern,
   and it scales to every widget.
3. **The real ceiling is the constraint model and the theme, not the catalog.** The widgets that resisted
   are not resisting the *mapping* — they are resisting because CSS cannot see an ancestor's definite size
   (the constraint model, deferred since M3) or because Material chrome needs the live theme in the
   component (deferred since M3-A). Those two, named below, gate most of the remaining list.

## Real-application results

There is still **no committed corpus app inside the supported surface** — `hello_bridge` builds on
`Scaffold`/`MaterialApp`/`ChangeNotifier`, none of which M4-A implemented, so it still refuses (`BRG3001`,
correctly). The **build-proof fixture** (`fixtures/uir/layout_proof.ndjson`) is the real-application
validation for this pass: a real screen built from the supported surface, run through the whole pipeline to
`tsc` on every commit. It now exercises all eight widgets. A real third-party app cannot be run end-to-end
until Family C (below) lands.

## Triage of the remaining M4-A list — stopped and documented

Grouped by the capability each needs, most-feasible first. "Owner" is where the work lives; "impact" is
across the five layers the brief asks for. **None of these were faked or stubbed.**

### Family A — more pure layout/box (feasible next, same two-file pattern)

`Align`, `SafeArea`, `AspectRatio`, `FittedBox`, `FractionallySizedBox`, `IndexedStack`, `ColoredBox`,
`DecoratedBox`, `Container`, `Opacity`, `ClipRRect`, `Transform`.

- **Why not this pass:** budget; they extend exactly the pattern above. `Align` (and `Stack`'s `alignment`)
  additionally need an **`Alignment` value type** in the kit (like `EdgeInsets` — the D2 import machinery
  already handles a kit-provided value type, so this is bounded).
- **Owner:** generator (`WIDGET_MAP`) + runtime (components; one value type). **Schema:** none. **Analyzer:**
  none. **Compiler:** none. **Runtime:** additive. **Recommended:** M4-A continuation, no ADR.

### Family B — presentational Material chrome (needs theme-in-component + assets)

`Card`, `ListTile`, `Icon`, `Image`, `CircleAvatar`, `Chip`.

- **Why stopped:** these paint Material — elevation shadows, surface/`on-surface` colours, shapes — from the
  **live theme**, which the kit's components do not yet receive (the descriptor system resolves *tokens*,
  ADR-19/21, but the Material chrome defaults are not threaded into components; this is the same limit
  `Divider`'s colour hit). `Icon` needs an **icon-font or codepoint mapping**; `Image` needs the **asset
  emitter**, which is `BRIDGE-STUB(M4)` in the generator.
- **Owner:** runtime (theme-aware components) + generator (asset/icon mapping). **Schema:** none.
  **Analyzer:** none (icons/assets already extract as constants). **Compiler:** none. **Runtime:** needs a
  theme-context read in components. **Recommended:** M4-A once theme-in-component + the asset emitter land;
  no schema ADR, but an **implementation note on threading the theme into kit components**.

### Family C — app scaffolding & navigation (Material chrome + interaction + imperative)

`Scaffold`, `AppBar`, `PreferredSize`, `Drawer`, `BottomNavigationBar`, `NavigationBar`, `NavigationRail`,
`BottomSheet`, `FloatingActionButton`, `SnackBar`. (`MaterialApp` routes already extract; it is not a
rendered component.)

- **Why stopped:** two different hard things. `Scaffold`/`AppBar`/`Drawer`/nav bars are **Material chrome +
  interaction state** (a drawer opens and closes; a nav bar tracks a selected index) — feasible but large,
  and gated on Family B's theme work. `BottomSheet`/`SnackBar` are **imperative**: they are not widgets in
  the tree but calls on `ScaffoldMessenger`/`showModalBottomSheet`, shown into an overlay. The UIR models a
  *widget tree*, not an imperative overlay API, so representing them faithfully is a genuine modelling
  question, not a mapping.
- **Owner:** runtime + generator (chrome); **and an ADR** for imperative overlays. **Schema:** likely **yes**
  for the imperative-overlay case (a way to represent "show this into an overlay" that N-passes and the
  generator agree on) — this is the one place M4 may hit the "unavoidable real-world limitation" clause.
  **Analyzer:** must recognise the imperative calls (like it recognises navigation, §A17). **Compiler:**
  possibly a normalization for overlay lifetime. **Recommended:** **ADR — "Imperative overlays (SnackBar,
  BottomSheet)"** before implementing; chrome widgets after Family B.

### Family D — input & interactivity (controlled state, gestures, forms, overlays)

`TextField`, `Form`, `FormField`, `Checkbox`, `Radio`, `Switch`, `Slider`, `DropdownButton`,
`PopupMenuButton`, `IconButton`, `GestureDetector`, `InkWell`.

- **Why stopped:** these need **controlled state** the current model does not carry end to end. `TextField`
  binds a `TextEditingController`/`onChanged` to a value; `Form`/`FormField` run a **validation state
  machine**; `DropdownButton`/`PopupMenuButton` open **overlays** (Family C's problem). The analyzer already
  extracts signals and callbacks, and the runtime has signal state — but the *binding* of a controller to an
  input, and form validation, are new modelling. `GestureDetector`/`InkWell`/`IconButton` are the most
  tractable (a wrapper with an `onTap` → an `onClick` div/button) and could come first.
- **Owner:** analyzer (controller/onChanged extraction) + runtime (controlled inputs, form context) +
  generator. **Schema:** possibly for form-field state; assess per widget. **Compiler:** possibly a pass to
  wire controllers to signals. **Recommended:** start with `GestureDetector`/`InkWell`/`IconButton` (no new
  capability); **ADR — "Controlled inputs and controllers"** before `TextField`/`Form`.

### Family E — scrolling & slivers (a second layout protocol)

`ListView`, `GridView`, `SingleChildScrollView`, `CustomScrollView`, `PageView`, `SliverList`, `SliverGrid`,
`SliverAppBar`, `NestedScrollView`.

- **Why stopped:** `SingleChildScrollView` is trivial (`overflow: auto`) and could ship immediately.
  `ListView.builder`/`GridView.builder` are **dynamic lists** — the analyzer already desugars these toward
  `ui.List` (N3), so they are feasible with a list-rendering runtime component. But `CustomScrollView` +
  `Sliver*` + `NestedScrollView` are the **sliver protocol**, a *second layout model* Flutter runs alongside
  the box model — genuinely new capability, not a mapping. `PageView` is a snapping carousel (interaction).
- **Owner:** runtime + generator; **ADR** for slivers. **Schema:** none for `SingleChildScrollView`/simple
  lists; the sliver protocol needs assessment. **Analyzer:** none new for lists (N3 covers them); slivers TBD.
  **Recommended:** `SingleChildScrollView` + builder lists in M4-A; **ADR — "The sliver protocol"** before
  `CustomScrollView`/`Sliver*`.

### Family F — feedback (animation, overlays, cross-route transition)

`CircularProgressIndicator`, `LinearProgressIndicator`, `RefreshIndicator`, `Tooltip`, `Hero`.

- **Why stopped:** the two progress indicators are **CSS animation** and could ship next (feasible).
  `Tooltip` is an on-hover **overlay** (Family C). `RefreshIndicator` is a **pull gesture + async** (Family
  D + async). `Hero` is a **shared-element transition across a route boundary** — it needs the nav/transition
  system to animate a widget from one route to another, which is new capability layered on the route
  transitions M3-C added.
- **Owner:** runtime (animation) + generator; `Hero` needs the transition system. **Schema:** none for the
  indicators; `Hero` needs assessment against the route-transition model. **Recommended:** progress
  indicators in M4-A; `Hero` is its own milestone.

## Remaining work for M4-B

1. **M4-A continuation (no new capability):** Family A layout (+ `Alignment` value type), `SingleChildScrollView`,
   builder `ListView`/`GridView` (N3 already desugars them), the two progress indicators,
   `GestureDetector`/`InkWell`/`IconButton`. Each is the two-file pattern proven here.
2. **Theme-in-component** (implementation note): thread the resolved theme into kit components so Material
   chrome (`Card`, `Divider` colour, surfaces) is faithful. Unblocks Family B.
3. **Three ADRs, before the widgets that need them:** *Imperative overlays* (SnackBar/BottomSheet/menus),
   *Controlled inputs and controllers* (TextField/Form), *The sliver protocol* (CustomScrollView/Sliver\*).
   These are the "unavoidable real-world limitations" the brief anticipated; each is a modelling decision,
   not a mapping, and must be ruled on before implementation, not during.
4. **A real corpus app inside the growing surface**, added to the golden build-proof as coverage widens — the
   pattern this pass established (`layout_proof.ndjson`), so the build-proof grows with the surface and no
   hand-built UIR ever creeps back in.

## Files changed this pass

- Runtime: `flex.ts` (+Expanded/Flexible/Spacer/Wrap), `material.ts` (new: Divider/VerticalDivider),
  `stack.ts` (new: Stack/Positioned), `index.ts` (exports), `tests/widgets.test.ts` (+14 render tests).
- Generator: `emit/widgets.ts` (+8 `WIDGET_MAP` rows, `FLEX_FIT`), `tests/generate.test.ts` (+2 emission tests).
- Analyzer: `test/support/temp_project.dart` (+8 stub widgets), `test/build_proof_test.dart` +
  `fixtures/uir/layout_proof.ndjson` (fixture now exercises all eight, `tsc`-proven).
- No change to the schema, the catalog, N1–N11, or any compiler architecture.
