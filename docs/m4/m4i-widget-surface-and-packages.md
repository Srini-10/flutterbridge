# M4-I — Advanced widget surface, data display, and the first package catalog

**Status: complete.** Corpus coverage **48.4% → 56.5%**, the largest single-milestone increase in the
project — and almost none of it came from the families the brief named.

CI green: 207 analyzer tests + `dart analyze` clean, 28 `bridge_uir`, 22/22 TS test tasks (**378** runtime,
**117** generator, 126 compiler), 18/18 typecheck, `codegen:check` OK, `lint:stubs` OK.

---

## 1. The evidence, and the disagreement it produced

Goal: *"increase real Flutter application coverage."* The corpus was measured before any code was written,
and it contradicts the brief's priority list almost completely:

| Named in the brief | Corpus uses | | Not named anywhere | Corpus uses |
| --- | --- | --- | --- | --- |
| `TabBar` / `TabBarView` / `Tab` | **0** | | **`Gap`** | **115** |
| `DataTable` / `DataRow` / `DataCell` | **0** | | `ValueListenableBuilder` | **26** |
| `ExpansionTile` | **0** | | `LayoutBuilder` | 17 |
| `SegmentedButton` / `ToggleButtons` | **0** | | `ListenableBuilder` | 15 |
| `ChoiceChip` / `FilterChip` / `ActionChip` | **0** | | `Provider` | 15 |
| `FadeInImage`, `ReorderableListView`, `FittedBox`, `Baseline` | **0** | | | |

**`Gap` alone is 115 instantiations — more than `Container`, more than `SizedBox`, more than any widget the
compiler could not render.** It went unseen through six milestones for one reason: it is not a Flutter
widget, and every triage list this project has produced was a list of Flutter widgets.

So M4-I did both. The named families that fit the architecture were built; the corpus's actual top gaps were
built first, because that is what the primary goal asks for.

## 2. `Gap`, and the first test of ADR-18's package claim

ADR-18 made a specific, falsifiable promise, written in `AdapterRegistry.production()`'s own doc comment:

> Adding a package means adding a line here and a file beside it — and *nothing else*, anywhere.

M4-I is the first time that was tested. **It held exactly.** The whole change is:

- `catalog/widgets/gap.json` — the catalog;
- `session/adapters/widget/gap_adapter.dart` — the adapter;
- one line in `AdapterRegistry.production()`;
- one entry in the codegen's target list.

**No extractor changed. No pass changed. No emitter logic changed.** Nothing under `session/extract/` knows
the word `Gap`, which is the whole of ISSUE-16's rule. `Gap(16)` had already been extracting as a
`ui.Element` with `library: package:gap/gap.dart` — its only defect was `_positional0`, the ADR-0023 problem,
which the catalog's `positionalProps` fixed.

Two small generalisations were needed and both are corrections rather than concessions: the framework-only
catalog sections (`theme`, `navigation`, `semantics`, `lifecycle`, …) became **optional**, because a package
contributes widgets and nothing else, and requiring it to state empty ones would be requiring it to answer
questions about a framework it is not.

The kit's `Gap` is `flex-basis`, and it is *more* faithful than `SizedBox`: a `Gap` is a fixed extent along
the parent's **main axis**, and `flex-basis` is defined as exactly that, relative to whichever direction the
container runs. `SizedBox` has to be told an axis; `Gap` does not.

## 3. The rebuild-scoping builders are erased, not rendered

`ValueListenableBuilder` (26) and `ListenableBuilder` (15) are the corpus's second and third biggest gaps.
The analyzer's output is what decided their treatment: `valueListenable: _counter` extracts as a
**`bind.Signal`**, because a `ValueNotifier` is already in the catalog's `stateHolders`.

These widgets exist because Flutter's `setState` rebuilds a whole `State`: a program wanting a narrower
rebuild has to draw the boundary by hand. Under **ADR-4** and **ADR-20** a signal read *is* the subscription,
so that boundary is computed rather than declared — and **INV-22** is explicit about what follows:

> `setState`, `context.watch`, a `Consumer` wrapper, a hook's lifecycle helper — these are framework
> *machinery*, not program semantics. Their meaning is already carried by UIR constructs.

So extraction replaces the wrapper with its builder's body, binding the builder's `value` parameter to the
listenable's own binding — which for a `ValueNotifier` is the signal, so reading `value` yields exactly the
`bind.Signal` that reading the notifier would. `Builder` is the same case with nothing to bind: its only
purpose is a fresh `BuildContext`, which has no UIR meaning at all.

The build proof asserts the *absence*: the emitted file contains neither wrapper.

It declines to inline in three stated cases — a builder that is not a closure written at the call site, a
`child:` argument (whose whole point is a subtree the builder receives *without* rebuilding), and a
listenable that is not a plain name. Each falls through to ordinary extraction and is refused with a reason.

**BRG1205 caught a defect in this on its first run.** Two inlined bodies both claimed the anchor
`…/Column/Text`, because the body was extracted without the wrapper's position. The inlined node now takes
the wrapper's anchor — which is also the semantically right answer, since an override attached to that
position should still address it.

## 4. The named families that fit, and why they could be built now

`ExpansionTile`, tabs and the three selectable chips share one property: **a native element already carries
the semantics Flutter's widget carries.** That is why they were buildable while the gesture model still does
not exist.

- An `ExpansionTile` is `<details>`/`<summary>` — the browser owns the open state, the click and keyboard
  target, and the ARIA. Building it from a `<div>` and a boolean would need the gesture model for the click,
  a signal for the state, and hand-written ARIA — three things to get wrong in place of an element that has
  them. `initiallyExpanded` maps to `defaultOpen`, and that is exact: both mean *the initial state, not the
  current one*.
- A `TabBar` is `role="tablist"` with `aria-selected`, which is what makes a screen reader announce "tab 2 of
  4" as the Flutter app does.
- A chip is a `<button>` whose pressed-ness is a prop — `role="radio"` for a `ChoiceChip`, `role="checkbox"`
  for a `FilterChip`, because several filters can be on at once and that is the one behavioural difference.

**`DefaultTabController` renders its child and provides nothing**, and the generator refuses a `TabBar`
without an explicit `selectedIndex` (`BRG3017`). Wiring the two through kit context would work at runtime and
be invisible to every diagnostic — a `TabBar` and a `TabBarView` are two `ui.Element`s related only by
sitting under one controller, and nothing in UIR says two elements share a selection. That is the silent,
unverifiable coupling this project refuses. A `TabBar` given `selectedIndex` from the application's own state
works completely.

## 5. `DataTable` is a genuine structural refusal

The one place M4-I stopped at a schema limit. `DataTable.columns` is `List<DataColumn>` and `DataTable.rows`
is `List<DataRow>` — **two ordered widget-bearing collections on one element** — and a `ui.Element` holds
exactly one `children` list. That is not an oversight: N8 reports `BRG2113` for an element that ends up with
two, precisely because *which comes first is not recoverable, and child order is what the user sees*.

The catalog mechanism that carried `NavigationRail`'s non-widget destinations (M4-G) names **one** children
property, so it cannot help. And a `DataCell` sits a third level down, inside `DataRow.cells`.

Closing it needs either a second ordered collection on `ui.Element` or a `ui.Table` node — a schema
amendment. **No ADR is proposed, because there is no evidence to write one from: `DataTable` is used 0 times
in the corpus.** Naming the limit and its owner is the honest end of that analysis; proposing an amendment on
a sample of zero is what §A17.2 refused.

## 6. SDK findings

| Finding | Source |
| --- | --- |
| **A `ChoiceChip` is an 8px rounded rectangle, not a stadium** — which is what a bare `Chip` is. Two chips side by side genuinely have different corners in M3. | `material/choice_chip.dart:279` |
| **An `ExpansionTile`'s icon changes *role*, not just direction**: `primary` when expanded, `onSurfaceVariant` when collapsed. Its text stays `onSurface` in both. | `material/expansion_tile.dart:914-924` |
| **A tab is 46 tall, or 72 with both an icon and a label** — two constants, not one with padding. | `material/tabs.dart:30-31` |
| **`TabBar`'s divider is a `Divider`'s**, and the SDK says so in a comment: the M3 token for it was deprecated, so the value comes from `Divider`'s defaults. The catalog reuses the `Divider` entry rather than restating it. | `material/tabs.dart:2804-2810` |
| **`ToggleButtons` has no M3 defaults class at all** — M3 supersedes it with `SegmentedButton`. Recorded as a stated divergence (the `Tooltip` precedent) rather than an invented palette. | `material/toggle_buttons.dart:449` |

## 7. Corpus coverage

| | M4-G | M4-H | **M4-I** |
| --- | --- | --- | --- |
| Supported instantiations | 913 (47.2%) | 936 (48.4%) | **1092 (56.5%)** |
| Classified unsupported | 207 (10.7%) | 191 (9.9%) | **191 (9.9%)** |
| Unknown | 813 (42.1%) | 806 (41.7%) | **650 (33.6%)** |
| `WIDGET_MAP` entries | 72 | 77 | **87** |

The +8.1 points break down as: `Gap` 115, the erased builders 41, and the chip/tab/expansion families the
rest. Classified work now sits with **runtime 87**, **adr 61**, **schema 31**, **generator 12**.

The corpus test now counts widgets **erased in extraction** as supported, which is a correction rather than
a convenience: they never reach `WIDGET_MAP` because they never reach the generator, and counting them as
gaps would report a gap that is closed.

The remaining "unknown" is now dominated by the corpus applications' **own** widgets — `IllustrationPiece`
(35), `AppBtn.basic` (18), `AppHeader` (11), `CenteredBox` (10) — which extract as `ui.Component` and need no
mapping at all. The genuine third-party remainder is `Provider` (15) and `Animate` (10), each one package
catalog away now that the path is proven.

## 8. Build-proof expansion

The proof now carries a `Gap` from a real resolvable **package dependency**, an `ExpansionTile`, a `TabBar` /
`TabBarView` / `Tab`, all three chips, and both rebuild-scoping wrappers — the last of which it asserts are
*absent* from the output. Flutter → analyzer → N1–N11 → generator → `tsc` against the unmocked kit, **zero
diagnostics**, 11 files.

```tsx
<Gap mainAxisExtent={16} />
<ExpansionTile initiallyExpanded={true} subtitle={<Text>{'tap to open'}</Text>} title={<Text>{'Details'}</Text>}>
  <Text>{'the body'}</Text>
</ExpansionTile>
<TabBar><Tab text={'One'} /><Tab text={'Two'} /></TabBar>
<ChoiceChip selected={useSignal(_expanded)} label={<Text>{'choice'}</Text>} />
const [_ticks] = useState(() => signal(new ValueNotifier(0)));   // the notifier survives; the builder does not
<Text>{'ticks'}</Text>                                            // ← what the ValueListenableBuilder became
```

`tsc` caught one genuine gap while this was assembled: the kit exported no `ValueNotifier`. It is state
rather than machinery — the catalog lists it among `stateHolders`, so a field holding one becomes a signal —
and it is now the direct analogue of M4-F's `TextEditingController`, backed by a `WritableSignal` under
ADR-4's ruling that *a signal write **is** the notification*.

**Determinism** — three independent `normalize` runs, and the fixed point:

```
6dfab6878aa6db693024b8846adde658e808d43f952238e4c8d33a63772e0240   ×3, and normalize(normalize(x))
```

Analyzer golden `dbfd115b…`; 27 analyzer nodes → 79 normalized. **Incremental ≡ clean** holds via
`generate.test.ts` and the analyzer's incremental suites. No prior milestone regressed.

## 9. Remaining unsupported widget families

1. **The gesture model** (21 uses, runtime) — `InkWell`, `ListTile.onTap`, `ReorderableListView`'s drag.
   Still needs no ADR, and is now the largest reachable gap by a wide margin.
2. **The explicit-animation family** (36 uses, schema) — a per-frame value handed to Dart.
3. **`Matrix4` / `Transform`** (33 uses, runtime).
4. **Slivers** (27 uses, adr).
5. **Imperative navigation and overlays** (adr) — [ADR-0024](../adr/0024-performing-a-navigation.md).
6. **Measurement** (runtime) — `LayoutBuilder` (17), `FittedBox`, `Baseline`, `MediaQuery`.
7. **Semantics wrappers** (59 uses across `Semantics`, `ExcludeSemantics`, `MergeSemantics`) — new to this
   list, and cheap: the catalog already carries the semantics vocabulary and extraction already reads it.
8. **`Provider` / `Animate`** (25 uses) — one package catalog each, on a path now proven.
9. **`DataTable`** (schema) — §5.

## 10. Exact blockers for M5

1. **[ADR-0024](../adr/0024-performing-a-navigation.md).** Unchanged from M4-H and still the largest: a
   converted application cannot navigate, and the same decision unblocks all four overlay families. Every
   other layer is built and tested.
2. **The gesture model** (runtime). The largest widget-surface gap with no decision in front of it.
3. **A constant field of a component is dropped entirely** (analyzer). A `final` field nothing mutates emits
   no node, so the generator reports `BRG3006` for a name the program declares. Every screen with a static
   list or a config constant hits it.
4. **The generator emits no class declarations** (generator). A list of the application's own models cannot
   be constructed. Refused by name since M4-H, still refused.
5. **`notifyListeners`** (compiler or adapter). ADR-4 already rules that a signal write *is* the
   notification. Blocks every `ChangeNotifier` store.
6. **`mounted` and `widget`** (analyzer, INV-22) — framework primitives surviving extraction.

## 11. Production readiness

M4-G made application *shells* compile; M4-H made data-driven *content* compile; M4-I is the first milestone
where the number reflects real applications rather than the compiler's own fixtures — **56.5% of every widget
instantiation in two real, unmodified Flutter apps** now has a faithful lowering, and a third of what remains
is those apps' own components, which need no lowering at all.

The honest assessment is unchanged in shape and better in degree: **the compiler produces applications that
render correctly and cannot yet move between screens or respond to a tap.** Those are two capabilities —
ADR-0024 and the gesture model — and neither is a milestone of work. Everything else on the list is a long
tail that individual applications will or will not hit.

What M4-I adds to that assessment is a *distribution* result rather than a feature: the package-catalog path
is proven, so the third-party ecosystem — which the corpus says is where the remaining unknown volume
actually lives — is now incremental work with a known cost rather than an open question.
