# M4-H — Advanced navigation, overlays, lazy UI and animation foundations

**Status: complete, with one goal deliberately stopped at a frozen-schema limit and documented instead.**

Delivered: lazy lists (`ListView.builder`, `GridView.builder`), the **implicit**-animation family, paged
scrolling, and the extraction primitive that unblocked the first of those. Navigation and overlays are
**one** blocker, not two, and it is a schema amendment — [ADR-0024](../adr/0024-performing-a-navigation.md).

CI green: 207 analyzer tests + `dart analyze` clean, 28 `bridge_uir`, 22/22 TS test tasks (**378** runtime,
**113** generator, 126 compiler), 18/18 typecheck, `codegen:check` OK, `lint:stubs` OK.

---

## 1. Corpus evidence, taken before any code was written

Goal 5 says *increase real-world corpus coverage, not synthetic widget count*. The corpus disagrees sharply
with the brief's priority order, and saying so is part of the deliverable:

| Named in the brief | Corpus uses | | Not named | Corpus uses |
| --- | --- | --- | --- | --- |
| `ListView.builder` | **0** | | `Gap` | **115** |
| `GridView.builder` | **0** | | `ValueListenableBuilder` | **26** |
| `AlertDialog` / `Dialog` / `showDialog` | **0** | | `LayoutBuilder` | **17** |
| `PopupMenuButton` | **0** | | `ListenableBuilder` | **15** |
| `showModalBottomSheet` | **0** | | `Provider` | **15** |
| `Navigator.*` | **0** | | `AnimatedBuilder` | **14** |

Both corpus applications route with `go_router` and use no dialogs at all. So the overlay and navigation work
cannot move the corpus number — it is what makes a converted application *function*, which that metric does
not measure. The families that *do* move it are animation (39 uses across the implicit and explicit halves)
and slivers (27).

This steered depth: the implicit-animation family got a full implementation, and the overlay family got an
ADR rather than a speculative one.

## 2. The root cause behind the whole scrolling goal

`ListView.builder` was recorded as `owner: analyzer`, with the reason *"the analyzer cannot see an iterable
to map over"*. N3's own header said the same:

> What it *cannot* do is recover a template from `ListView.builder(itemCount: n, itemBuilder: (c, i) =>
> W(items[i]))`, **because the collection is not named there — only indexed.**

**The collection was named** — it is the receiver of the subscript. Extraction was discarding it, because
`IndexExpression` had no lowering and reached UIR as `logic.OpaqueExpr(reason: 'index')`.

The fix needed no schema construct. **Dart defines `a[b]` as `a.operator[](b)`**, the analyzer resolves it to
that operator's element, and `logic.MethodCall` models a call on a receiver exactly. So a subscript is
extracted as the method call it is. An assignment *to* a subscript is `operator []=` — a different operator
with a different arity — and stays refused rather than being silently mis-modelled.

That one change removed every `BRG1302` from the probe **and** from `hello_bridge`, and made the builder
expansion possible.

## 3. Where the builder expansion belongs, and why it is a proof

N3 still cannot do it, and the reason is the one N8 already states: the template is a *widget subtree*, and
building one from an expression means redoing the const/signal/param classification of every prop, which
needs the resolved scope — and the resolved scope exists only in the frontend. That is `BRG2110`'s argument
verbatim. So extraction expands builders, and N3 keeps verifying (it reports any that still arrive
un-expanded).

**It is a proof, not a pattern match.** Three conditions, all required:

1. the builder is a closure taking `(BuildContext, int)`;
2. every use of its index parameter is `C[i]`, for exactly **one** collection `C`;
3. the count is `C.length`, for the same `C`.

Only then is the builder a for-each over `C` — visiting every element once, in order, which is what `ui.List`
means. The probe demonstrated the conservatism working: `PageView.builder(itemCount: 3, itemBuilder: (c, i)
=> Text('page'))` indexes nothing, so it was **not** expanded and stayed an ordinary element. A builder over
a range is real, common, and not a list; inventing a collection for it would emit a loop over nothing.

`ListView.separated` and `PageView.builder` are now classified `owner: schema` with that reason, replacing a
note that blamed the analyzer.

## 4. Four defects in one dead code path

`ui.List` **had never been generated from real analyzer output.** No generator test constructs one, the build
proof's fixture had no `for`-element and no `.map().toList()`, and `hello_bridge`'s only repeat was a
`ListView.builder`, which arrived opaque. The path was dead, and it had rotted:

1. **The field names were wrong.** The emitter read `items`, `itemName`, `itemBuilder`; `ui.List` has
   `source`, `itemParam`, `template`, and always has. Every real list would have emitted
   `undefined.map(...)`.
2. **`<Fragment>` was emitted and never imported.** `tsc` would have failed.
3. **The template's scope bound neither the item nor the index**, so a template that read either reported
   `BRG3006` for a name the very next line of output declares.
4. **The key was emitted in the wrong scope.** This one could only appear once N9 *actually lifted a key*,
   which no fixture had ever made it do.

A hand-built fixture agreeing with a hand-written emitter is exactly the class of defect M3-D's build proof
exists to catch; this path sat in the gap in its coverage. The build proof now carries a keyed lazy list, so
all four are covered.

Two more were found the same way and fixed:

- **A `ValueKey` was constructed rather than unwrapped.** React compares keys with `===`; `new ValueKey(x)`
  is a fresh object every render — a key that never matches itself, which is worse than no key because it
  remounts every row. Flutter's `ValueKey` **is** its value, so it lowers to the value.
- **A construction of the application's own class emitted with no diagnostic at all.** M3-B lowers no
  `logic.ClassDecl`, so `const Wonder('Petra')` emitted `new Wonder('Petra')` naming a class the project does
  not contain — it reached `tsc` as `TS2552`. It is now refused by name, which is what the severity rule
  requires.

## 5. The animation finding: two problems under one phrase

Every widget with `Animated` in its name was classified *"the animation engine, owner: runtime"*. That
grouped two unrelated capabilities, exactly as M4-G found `IntrinsicWidth` and `FittedBox` had been grouped.

**Flutter draws the line itself.** `ImplicitlyAnimatedWidget` — the base class of `AnimatedOpacity`,
`AnimatedContainer`, `AnimatedAlign` and `AnimatedPadding` — takes a **target value** and a **duration** and
interpolates whenever the value it is handed changes. No controller, no ticker exposed to the program,
nothing to drive. The widget is a pure function of its props.

That is a CSS transition, with the browser as the ticker. The analyzer's output settled it:
`AnimatedContainer(width: _width)` extracts as an ordinary `ui.Element` whose `width` is a **`bind.Signal`** —
the same binding a plain `Container` gets.

The **explicit** family stays refused and its owner is corrected from `runtime` to `schema`:
`AnimationController`, `AnimatedBuilder`, `TweenAnimationBuilder` and the `*Transition` widgets hand a value
to arbitrary Dart *on every frame*, and no UIR construct models a per-frame value. A `sig.Signal` written 60
times a second is not what a `Tween` is.

`AnimatedSwitcher` is separated out with its own reason: it needs an **exit transition**, because Flutter
keeps the outgoing child mounted and cross-fades it while React unmounts a replaced child before anything can
animate it. That is a runtime capability, not a schema one.

## 6. SDK findings

| Finding | Source |
| --- | --- |
| **Flutter's curves are literally CSS's.** `Curves.easeInOut` is `Cubic(0.42, 0.0, 0.58, 1.0)`; CSS's `cubic-bezier(x1,y1,x2,y2)` is the same four control points of the same unit cubic Bezier. 33 of them are transcribed into the catalog with a line each. This is a correspondence, not an approximation — it is why the implicit family needs no engine. | `animation/curves.dart:1486-1864` |
| **Not every curve is a cubic**, and the ones that are not are refused by name rather than substituted: `decelerate` (`_DecelerateCurve`), the two `ThreePointCubic`s — two joined cubics, which one `cubic-bezier()` cannot express — and the bounce and elastic families (piecewise and spring). | `curves.dart:1477`, `:1500`, `:1772`, `:1869-1884` |
| **All three overlay entry points push a `Route`.** This is what makes overlays and navigation one blocker rather than two. | `dialog.dart:1652`, `bottom_sheet.dart:1317`, `popup_menu.dart:1205` |

## 7. Where M4-H stopped, and why

The brief: *"If you encounter a frozen-schema limitation, stop implementation at that point, produce corpus
evidence, identify the owning subsystem, and document the smallest possible amendment instead of inventing
behaviour."*

**Navigation and overlays are that limitation.** Every layer is built except one construct:

| Layer | State |
| --- | --- |
| Analyzer | emits `app.RouteTransition` for every push, including inline destinations — complete |
| Compiler | N11 consumes the nav graph — complete |
| Generator | emits the `RouterDescriptor` from `app.Route` — complete |
| Kit | `useRouter().push({ kind: 'route', route })` — implemented and tested |
| **UIR** | **nothing says "perform this transition here"** |

`app.RouteTransition` is a declarative edge (its schema says so: "the input to N11"). It records `source`,
`target`/`component` and `arguments`, is `additionalProperties: false`, and does not record the call site. So
the call survives extraction as an unresolvable `logic.Ref('Navigator.pushNamed')` — which is *also* a live
**INV-22 violation**: a framework runtime primitive surviving extraction.

Four options were considered and two rejected on principle — pointing `logic.Ref.target` at a transition
(legal by the letter; `logic.Ref` means "a declared name", and an edge is not one) and matching by source
span (a generator heuristic). [ADR-0024](../adr/0024-performing-a-navigation.md) documents both viable
amendments and recommends the smaller-in-consequence one.

**Slivers were also stopped, deliberately.** `SliverList(delegate: SliverChildListDelegate([...]))` buries
its children two levels deep — inside a constructor argument of a non-widget delegate — which is the
`BRG2110` family one level below where M4-G's catalog mechanism can reach. The brief says *never emulate
slivers with fake widgets*, and rendering `SliverToBoxAdapter` and `SliverPadding` alone (the two that *do*
extract cleanly) would be exactly that: a `CustomScrollView` that silently drops its lists.

## 8. Corpus coverage

| | M4-F | M4-G | **M4-H** |
| --- | --- | --- | --- |
| Supported instantiations | 885 (45.8%) | 913 (47.2%) | **936 (48.4%)** |
| Classified unsupported | 221 (11.4%) | 207 (10.7%) | **191 (9.9%)** |
| `WIDGET_MAP` entries | 52 | 72 | **77** |

Classified *fell*, and the corpus test's old `cls > 200` floor failed for the best possible reason — five
families moved from classified to supported. The assertion now guards `supported + classified`, which is the
property that actually matters: nothing may leave the table without either becoming supported or staying
named.

Classified work now sits with: **runtime 87**, **adr 61**, **schema 31**, **generator 12**.

## 9. Build-proof expansion

The proof now carries a keyed lazy list, the four implicit-animation widgets and a `PageView`, on top of
M4-G's full application shell. Flutter → analyzer → N1–N11 → generator → `tsc` against the unmocked kit,
**zero diagnostics**, 11 files. Real emitted output:

```tsx
{useSignal(_wonders).map((item, index) => (
  <Fragment key={_wonders.get()[index]}>
    <ListTile title={<Text>{_wonders.get()[index]}</Text>} />
  </Fragment>
))}
<AnimatedOpacity curve={Curves.easeInOut} duration={new Duration({ milliseconds: 300 })}
                 opacity={(_expanded.get() ? 1 : 0.25)} child={<Text>{'fades'}</Text>} />
<AnimatedContainer color={'colorFFFFFFFF'} curve={Curves.fastOutSlowIn}
                   duration={new Duration({ milliseconds: 200 })} width={(_expanded.get() ? 240 : 120)} … />
```

Two things the fixture deliberately does **not** do, each a gap M4-H found and neither smuggled in:

- its list holds `String`, not the application's own model type — the generator emits no class declarations;
- its list field is **mutable**, because a `final` field nothing mutates is a *constant* and extraction emits
  **nothing at all** for one — no `logic.FieldDecl`, no signal — so the generator reports `BRG3006` for a
  name the program does declare.

Both are M4-I blockers. This is the same rule M4-B applied when it kept a store out of this fixture.

**Determinism** — three independent `normalize` runs, and the fixed point:

```
db76b94a3c0506517a7cfdf30cf7f8d3a40feae9c3f16d100f425e543afc6c16   ×3, and normalize(normalize(x))
```

Analyzer golden `a0036716…`; 26 analyzer nodes → 78 normalized. **Incremental ≡ clean** holds via
`generate.test.ts` and the analyzer's incremental suites. No prior milestone regressed; three assertions
changed, each because M4-H made its claim false.

## 10. Remaining unsupported widget families

1. **The explicit-animation family** (36 uses, **schema**) — a per-frame value handed to Dart. Reclassified
   this milestone from `runtime`.
2. **The gesture model** (21 uses, runtime) — still needs no ADR, still the largest reachable gap.
3. **`Matrix4` / `Transform`** (33 uses, runtime).
4. **Slivers** (27 uses, adr) — see §7.
5. **Imperative overlays and navigation** (adr) — [ADR-0024](../adr/0024-performing-a-navigation.md).
6. **Measurement** (runtime) — `LayoutBuilder` (17 uses), `FittedBox`, `Baseline`, `MediaQuery`.
7. **A Material type scale** (adr/compiler) — from M4-G §8.

## 11. Exact blockers for M4-I

1. **ADR-0024.** Unblocks navigation *and* all four overlay families at once. Nothing else in the project
   unblocks as much per decision, and every other layer for it is already built and tested.
2. **A constant field of a component is dropped entirely** (analyzer). A `final` field nothing mutates emits
   no node, so the generator reports `BRG3006` for a name the program declares. Every screen with a static
   list or a config constant hits it.
3. **The generator emits no class declarations** (generator). A list of the application's own models — the
   shape of every real list-backed screen — cannot be constructed. Now refused by name rather than broken at
   `tsc`, but still refused.
4. **`notifyListeners`** (compiler or adapter). ADR-4 already rules that a signal write *is* the
   notification; the judgement belongs to the layer that models `ChangeNotifier`. Blocks every store.
5. **`mounted` and `widget`** (analyzer, INV-22) — framework primitives surviving extraction, as
   `Navigator.*` does.
6. **The sliver delegate** (analyzer/catalog) — widget lists two levels inside a non-widget value type.

## 12. Release-readiness

M4-G made application *shells* compile. M4-H makes their *content* compile: a list built from data — the
single most common screen in any real application — now generates, and screens that fade, resize and page
generate with their motion intact rather than being refused.

What a converted application still cannot do is **navigate**. That is one decision away, not one milestone
away, and it is the honest headline: the compiler now produces applications that render correctly and cannot
yet move between screens.
