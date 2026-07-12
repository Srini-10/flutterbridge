# C1 — Validation of the compatibility analyzer against real-world Flutter code

**Date:** 2026-07-12 · **Gate:** Conditional Gate C1 (from the M0-T7 review)
**Verdict: C1 NOT COMPLETE — blocking report below (§7).**
**No critical architectural flaw was found (§5). The gap is catalog breadth, not architecture.**

---

## 1. What ran, and what did not

| App | Origin | Result |
| --- | --- | --- |
| **compass_app** (`09335b0`) | flutter/samples — Google's reference business architecture | ✅ analyzed, 111 files |
| **wonderous** (`ce37ddf`) | gskinnerTeam — shipped, design-led production app | ✅ analyzed, 189 files |
| Flutter Gallery (`d12640d4`) | flutter/gallery | ❌ **excluded with cause** — archived; depends on the `flutter_gen` synthetic package, which current Flutter removed. `flutter analyze` fails on the app itself. Modifying it was forbidden, and would have invalidated the "run it as a user would" premise. |
| smooth-app (Open Food Facts) | production, 682 files | ❌ **excluded with cause** — requires Dart ≥ 3.11.5 (Flutter 3.44). Our toolchain is pinned at 3.11.3 (ADR-14). Upgrading Flutter mid-gate would change the pinned toolchain under the evidence. |
| **Internal Pharmacy Management ERP** | Phase 2 | ❌ **NOT EXECUTED — no Flutter project exists on this machine.** I did not simulate one. |

The analyzer was run **unmodified**, exactly as a future user would (`dart run bin/compat_report.dart
--project <app>`), with one exception documented in §6.

---

## 2. Automation coverage — and the metric problem

M0-T5 taught us that a single number invites self-deception. The same trap is here: **"automation
coverage" has at least three defensible definitions, and they differ by 47 points.**

| Metric | Definition | compass_app | wonderous |
| --- | --- | --- | --- |
| **A1 — MVP coverage today** | supported ÷ framework widget instantiations, against the frozen 28-widget catalog | **62.6 %** | **51.8 %** |
| **A2 — Recognised** | (supported + partial) ÷ framework instantiations | **80.6 %** | **66.0 %** |
| **A3 — Automation ceiling** | 1 − (genuinely unsupported ÷ framework instantiations) | **98.5 %** | **98.9 %** |
| — Genuinely unsupported | | 1.5 % | 1.1 % |
| — Blast radius | files containing ≥1 unsupported construct | 3.6 % (4/111) | 7.9 % (15/189) |

An app's **own components are excluded** from the denominator: they are what the compiler *generates*,
not what it must map.

**Against the Blueprint's "≥70 % automatable":** A3 clears it comfortably (98 %+). A2 clears it for
compass_app (80.6 %) and misses for wonderous (66.0 %). **A1 misses for both.** Reporting only A3 would
be counting unbuilt catalog work as success; reporting only A1 would be pretending the 28-widget MVP
catalog is the ceiling. **Neither number may be quoted alone** (proposed amendment **A9**, §8).

---

## 3. The catalogs

### Unknown — triaged (this is the core evidence)

| | wonderous (384 inst.) | compass_app (61 inst.) |
| --- | --- | --- |
| **U1 — user-defined widget, misclassified** (tool defect) | 18 (4.7 %) | 0 |
| **U2 — ordinary framework widget missing from our catalog** | **188 (49.0 %)** | **32 (52.5 %)** |
| **U3 — third-party package widget, adapter needed** | **178 (46.4 %)** | **29 (47.5 %)** |
| **U4 — genuinely unconvertible** | **0** | **0** |

**Not one unknown construct in either app was genuinely unconvertible.**

**U2 — framework widgets we are missing** (by frequency): `Semantics`×25, `ExcludeSemantics`×18,
`MergeSemantics`×16, `ColoredBox`×11, `RepaintBoundary`×11, `FractionalTranslation`×10, `OverflowBox`×9,
`SliverToBoxAdapter`×11, `ClipRect`×9, `CustomScrollView`×7, `ClipPath`×6, `AnimatedSwitcher`×6,
`TweenAnimationBuilder`×6, `IgnorePointer`×6, `FocusTraversalGroup`×6, `SnackBarAction`×5,
`DefaultTextStyle`×5, `PopScope`×4, `Focus`×4, `Listener`×4, `SliverList`×3, `Flex`×3, `SliverAppBar`×2,
`SliverPadding`×3, `SliverGrid`, `RichText`, `Visibility`, `Dismissible`, `InkResponse`, `IndexedStack`,
`MouseRegion`, `MediaQuery`, `Theme`, `NotificationListener`, `InteractiveViewer`, `CheckboxListTile`,
`MaterialButton`, `Autocomplete`, … (55 distinct types across the two apps).

**U3 — third-party widgets we are missing** (by frequency): `Gap`×115 (**one trivial adapter, 115
instantiations**), `Provider`/`MultiProvider`/`ChangeNotifierProvider`×23, `BottomCenter`/`TopCenter`/
`CenterLeft`/… ×25 (`extra_alignments`), `Animate`×10 (`flutter_animate`), `SeparatedColumn`/`SeparatedRow`
×11 (`flextras`), `CachedNetworkImage`×6, `SvgPicture.asset`×4, `WebViewWidget`, `GoogleMap`,
`YoutubePlayer`, `SmoothPageIndicator`, `ParticleField`, `DropCapText`, `SliverMasonryGrid`.

### Unsupported — small, and shallow

wonderous: `AnimationController`, `TickerProvider` mixin, `CustomPaint` + `CustomPainter`, `Hero`,
`FadeTransition`, `BackdropFilter`, `import dart:io`.
compass_app: `BackdropFilter`, `RotationTransition`, `ShaderMask`, `import dart:io`.

**Caveat — instantiation weighting understates qualitative impact.** Wonderous's unsupported constructs
are 1.1 % of instantiations but they *are the product*: the app's identity is its animation and custom
painting. A conversion that reproduces 98.9 % of its widgets and none of its motion has not converted
Wonderous. Blast radius (7.9 % of files) is the better proxy, and even that flatters. **Automation
percentages measure widget usage, never product value.**

---

## 4. Analyzer defects found (all in the spike tool, none in the architecture)

| ID | Defect | Evidence | Owner |
| --- | --- | --- | --- |
| **FN-1** | **`go_router` navigation is invisible.** compass_app reports `navigation: []` — yet it is *entirely* go_router-driven (`context.go`, `GoRoute`). We detect only `Navigator.*`. | compass_app; **both** apps depend on `go_router` | analyzer (M1-T10) |
| **FN-2** | **Network calls via an injected/constructed client are invisible.** compass_app reports `network: []` while using `HttpClient`. Detection keys off the *spelling* `http.get`. | compass_app | analyzer |
| **FN-3** | **`provider` DI is invisible.** `Provider`/`MultiProvider`/`ChangeNotifierProvider` fall into *Unknown*; the DI graph is not modelled at all. Both apps use provider; wonderous also uses `get_it`. | both | analyzer + package adapter |
| **FP-1** | **User widgets extending anything other than `StatelessWidget`/`StatefulWidget` are reported as Unknown** — e.g. `HzGradient extends GradientContainer` (a user base class), `MeasurableWidget extends SingleChildRenderObjectWidget`. | wonderous, 18 instantiations | analyzer |
| **FP-2** | **Verdict bands overstate severity.** compass_app is "Low Compatibility" solely because of one `dart:io` import in 4 of 111 files. A band that ignores blast radius tells a developer nothing actionable. | compass_app | policy (amend A7) |

**FN-1 is the most consequential finding of C1.** N11 (`promote-cross-route-state`, ADR-11) *requires*
the `nav-graph` analysis. If go_router routes are invisible, `nav-graph` is empty, and **N11 silently
does nothing** on the majority of modern Flutter apps — a pass that appears to work because it never
fires. That is exactly the class of silent failure this project keeps trying to design out.

---

## 5. Architectural assessment — no critical flaw

- **UIR: unaffected.** Every construct seen in 30 k lines of unfamiliar Flutter is expressible in the
  frozen vocabulary. No schema change is indicated. This is now the *second* independent confirmation
  (M0-T7 was the first).
- **Passes: unaffected in shape.** N1–N11 remain correct; slivers and `Semantics` need *mappings*, not
  new stages.
- **The limiter is catalog breadth, not architecture.** U4 = 0 in both applications.
- **Encouraging:** `Semantics`/`ExcludeSemantics`/`MergeSemantics` are used 59 times in wonderous —
  real apps *do* carry semantics, which is good news for the semantics-tree verifier (Spec §8).

---

## 6. Deviation from "run it unmodified"

One change was made to the spike tool during C1, and it is not a classification change:

**The `package_config.json` guard now walks up to the workspace root.** compass_app is a **Dart pub
workspace** (Dart 3.6+): `package_config.json` lives at the *workspace root*, not in the package
directory. The guard rejected a perfectly analyzable project — a false negative that would have cost us
the app entirely. This is itself an M1 requirement: `bridge_analyzer` must honour pub workspaces.

Also recorded: **Flutter Gallery needed `flutter gen-l10n` before its element model resolved.** Real
apps depend on **code generation** (l10n, `build_runner`, `freezed`, `json_serializable` — compass_app
uses `freezed_annotation` and `json_annotation`). **`bridge_analyzer` must require the project's codegen
step to have run, and fail loudly (exit 3) when it has not.** The M0-T3 F6 guard already does this; C1
confirms it fires on real code, for a real reason.

---

## 7. Decision — C1 is NOT COMPLETE (blocking report)

Two independent reasons; either alone is sufficient.

**1. Phase 2 never ran.** There is no internal Flutter application on this machine. C1 was defined as
validation against *real-world code we did not write*, in **two** flavours — external open-source and
internal production. Half the gate is unexecuted. The `compass_app` proxy is a reference architecture
sample, not your ERP: no legacy, no accreted patterns, 9 k LOC, written to be exemplary.

**2. The "≥70 %" bar is not met under the metric that describes today.** A1 (MVP coverage, the catalog
that actually exists) is **62.6 %** and **51.8 %** — both below 70. It is met only under A3 (the
ceiling, 98 %+), which counts catalog work we have not done as though it were done. Quoting A3 alone
would be precisely the "0.25 %" mistake of M0-T5, and I am not going to make it twice.

**What must change before M1-T8 (the widget catalog task):**

| # | Required | Evidence |
| --- | --- | --- |
| **B1** | **Adopt the coverage metric (amendment A9).** A1/A2/A3 + blast radius must always be reported together; no single number may be quoted. | §2 |
| **B2** | **Expand the M1-T8 catalog from 28 widgets to cover the 55 framework types observed**, prioritised by frequency (slivers, `Semantics`*, `ColoredBox`, `RepaintBoundary`, clips, focus, `CustomScrollView`). | §3 |
| **B3** | **Add `go_router` to navigation extraction (M1-T10).** Without it `nav-graph` is empty and **N11 silently no-ops.** | FN-1 |
| **B4** | **Add `provider` to state/DI extraction** (detect at minimum; adapter ideally). Dominant in both apps. | FN-3 |
| **B5** | **Fix FP-1** — classify user widgets by *resolved supertype + declaring library*, not by a literal `extends StatelessWidget`. | FP-1 |
| **B6** | **Fix FN-2** — resolve elements, not spellings. (M0-T6 predicted this; C1 proves it.) | FN-2 |
| **B7** | **Seed the package-adapter registry**, ordered by observed frequency: `gap`, `provider`, `flutter_svg`, `cached_network_image`, `extra_alignments`, `flextras`, `flutter_animate`. `Gap` alone is 115 instantiations behind one trivial adapter. | §3 |
| **B8** | **Amend A7** so compatibility bands weight **blast radius**, not mere presence of a platform gap. | FP-2 |
| **B9** | **`bridge_analyzer` must honour pub workspaces and require the project's codegen step.** | §6 |
| **B10** | **Run Phase 2** against the internal Pharmacy ERP (or any internal production Flutter app). **This is the one item I cannot do without you.** | §1 |

**Recommendation.** B1–B9 are *inputs to M1-T8*, not blockers to M1 starting: **M1-T1…T7 (schema,
codegen, canonical form, IDs, NDJSON, validators, analyzer bootstrap) remain unblocked** — none depend
on catalog breadth. My recommendation is to **proceed with M1-T1 now**, fold B1–B9 into the M1-T8 scope,
and keep C1 open until B10 is discharged.

---

## 8. Proposed amendment A9 — the automation-coverage metric

*(Proposed, not adopted — adoption is your call, as with all spec amendments.)*

> **A9 — Automation coverage.** Coverage is reported as **three** numbers plus a blast radius, never
> one: **A1** MVP coverage today, **A2** recognised (MVP + partial), **A3** automation ceiling
> (1 − genuinely unsupported), each weighted by framework-widget instantiation with the app's own
> components excluded from the denominator; plus **blast radius** = % of files containing at least one
> unsupported construct.
>
> A gate that cites a single coverage figure is invalid. **Instantiation-weighted coverage measures
> widget usage, not product value** — an app whose identity is its animation may be 98 % convertible by
> widget count and 0 % convertible in the ways its users would notice.
