# M4-D — A practical Material widget surface

**Goal:** widget coverage, not new architecture.

**Status: complete.** 22 widgets implemented across four families, every one through the full pipeline. The
build proof is now a realistic application rather than a synthetic probe. Unsupported widgets are classified
by missing capability and owning layer. **No architectural limitation was hit that could not be implemented
under the current design** — the two that came close are recorded below as classified capabilities with corpus
counts, not as blockers.

CI green: 207 analyzer tests + `dart analyze` clean, 28 `bridge_uir`, 22/22 TS test tasks (**306** runtime,
**86** generator, 126 compiler, 16 catalog-codegen), 18/18 typecheck, `codegen:check` OK, `lint:stubs` OK.

---

## 1. Supported widget matrix

Every row is analyzer-verified, normalized, generated, typechecked against the real kit, runtime-tested, and
exercised in the build proof.

| Family | Widgets | Notes |
| --- | --- | --- |
| **Layout** | `Align`, `Center`, `Padding`, `SizedBox`, `SafeArea`, `AspectRatio`, `FractionallySizedBox`, `ConstrainedBox` | M4-B's constraint model; nothing new needed |
| **Flex** | `Row`, `Column`, `Flex`, `Expanded`, `Flexible`, `Spacer`, `Wrap` | `Flex` new in M4-D — an axis that is a value |
| **Positioning** | `Stack`, `Positioned` | |
| **Clipping** | `ClipRect`, `ClipRRect` | New `BorderRadius` value type; exact — CSS clips after the radius |
| **Containers** | `Container` | Merges insets + constraints + alignment onto **one** element |
| **Scrolling** | `ListView`, `GridView`, `SingleChildScrollView` | New; `GridView` on CSS Grid, both delegate spellings |
| **Material** | `Card`, `Divider`, `VerticalDivider`, `ListTile`, `Chip`, `CircleAvatar`, `Badge`, `LinearProgressIndicator`, `CircularProgressIndicator`, `Tooltip`, `ElevatedButton` | Every number from the catalog |
| **Assets** | `Image` (3 spellings), `Icon` | M4-C |
| **Display** | `Text`, `RichText`, `SelectableText` | `RichText` renders a real span tree |

**41 `WIDGET_MAP` entries**, up from 26.

## 2. Unsupported widget matrix

§5's requirement — no generic message. `BRG3013` names the missing capability and the layer that owns it;
`BRG3001` is now reserved for a widget nothing in the system has heard of, with different advice. **32
capability entries**, ordered here by how often the real corpus uses them:

| Uses | Owner | Capability | Examples |
| --- | --- | --- | --- |
| 36 | runtime | the animation engine | `AnimatedOpacity`, `FadeTransition`, `AnimatedBuilder` |
| 33 | runtime | the `Matrix4` value type | `Transform.scale`, `Transform.translate` |
| 31 | runtime | the constraint model's measuring half | `LayoutBuilder`, `FittedBox`, `IntrinsicHeight` |
| 28 | adr | the sliver protocol | `CustomScrollView`, `SliverList`, `SliverAppBar` |
| 21 | runtime | the gesture model (± ink ripples) | `GestureDetector`, `InkWell`, `Dismissible` |
| 19 | **compiler** | colour-valued props resolved to design tokens (INV-20) | `ColoredBox`, `DecoratedBox` |
| 13 | adr | imperative overlays | `SnackBar`, `BottomSheet`, `PopupMenuButton` |
| 11 | generator | none — a compositing hint with no visual effect | `RepaintBoundary` |
| 11 | adr | a second catalog (ADR-18) | `SvgPicture`, `CachedNetworkImage`, `GoogleMap` |
| 8 | adr | shared-element transitions | `Hero` |
| 8 | adr | controlled inputs and controllers | `TextField`, `Form`, `Checkbox` |
| 6 | adr | arbitrary clip paths | `ClipPath` |
| 4 | analyzer | lowering an `itemBuilder` closure to `ui.List` | `ListView.builder`, `GridView.builder` |
| 2 | adr | a raster canvas | `CustomPaint` |

## 3. Corpus validation

Measured against the two real applications in `spikes/m0-compat-report/c1/out/` (wonderous, compass_app), by
`packages/generators/react/tests/corpus.test.ts` — which is a **regression floor**, not a transcription, so
the numbers cannot go stale:

```
distinct widget types: 351
total instantiations:  1933
  supported:           856 (44.3%)
  classified:          246 (12.7%)
  unknown:             831 (43.0%)
```

**The 43% "unknown" is mostly not a gap.** Its top entries are the applications' own widgets —
`IllustrationPiece` (35), `AppBtn.basic` (18), `AppHeader` (11) — which extract as `ui.Component` and need no
mapping at all. The largest genuine entry is `Gap` (115), a third-party package needing its own catalog under
ADR-18.

Top supported, by real usage: `Text` 122, `Container` 89, `SizedBox` 88, `Stack` 73, `Padding` 72, `Column`
54, `Center` 51, `Positioned.fill` 42, `Row` 38, `Expanded` 31, `Icon` 24, `Spacer` 19, `SafeArea` 18,
`Align` 15, `Image.asset` 15, `ClipRRect` 13.

## 4. Architecture changes

Deliberately few — this was a coverage milestone. Three additions, each shared rather than per-widget:

1. **`layout/decoration.ts`** — `BorderRadius`, `BoxDecoration`, `BoxShape`, `Clip`, and the clip/decoration
   style functions. Every clipping and decorating widget goes through it.
2. **`widgets/scroll.ts`** — one `viewportStyle` shared by all three scroll views, so they cannot disagree
   about which axis `overflow` goes on.
3. **`emit/unsupported.ts`** — the capability table (§5). Deliberately *not* in the catalog: the catalog says
   what a widget **is** (ADR-18); this says what **this target** cannot do with it, and a Vue generator will
   lack different things.

No schema change. No new ADR. Catalog gained 10 widget entries and 7 component-default blocks.

## 5. Four findings from reading the SDK rather than the spec

Every Material number was transcribed from `~/flutter` 3.44.0 with a file:line citation. Four things came out
differently than they would have from memory:

1. **Both progress indicators default to `year2023: true`**, which selects a *different* defaults class from
   the one Material 3 documents. `CircularProgressIndicator` is therefore **36** logical pixels, not 40, and
   `LinearProgressIndicator` has **no** default corner radius, not 2.0.
2. **A bare `Chip` has no background colour in the SDK.** `_ChipDefaultsM3.color` returns `null` with the
   comment *"Subclasses override this getter"*. So the kit's `Chip` paints an outline and no fill — inventing
   one would have been inventing.
3. **`Tooltip` is the one documented divergence.** Flutter 3.44 paints it with literal colours
   (`Colors.white`, `Colors.grey[700]`), which INV-20 forbids a kit component from holding. The catalog states
   M3's own `inverseSurface`/`onInverseSurface` roles and says so, with the SDK citation, at the entry.
4. **`SelectableText` was losing its identity.** The catalog gave it `role: 'text'`, which collapses a widget
   into a `ui.Text` node carrying no record of which widget produced it — so it rendered as a plain `Text` and
   the one thing distinguishing it was dropped. Corrected to an ordinary element with a catalog-named
   positional argument. *This also retroactively corrects ADR-0023's claim that `positionalProps` subsumes
   `role: 'text'`: the two are orthogonal, and `role` is the more dangerous of them.*

## 6. Build-proof evidence

The synthetic probe is gone. The fixture is now a realistic screen — a header with an avatar, a badge and
selectable text; both progress indicators; a card holding a list of tiles; wrapped chips; a grid of clipped
images; constrained, aligned and fractionally-sized content; and a rich-text paragraph. Real emitted output:

```tsx
<CircleAvatar radius={24} child={<Text>{'FB'}</Text>} />
<Badge child={<Icon icon={new IconData({ codePoint: 58873, fontFamily: 'MaterialIcons' })} size={20} />} label={…} />
<LinearProgressIndicator value={0.4} />
<Card elevation={2} child={<ListView shrinkWrap={true}>
    <ListTile leading={…} subtitle={…} title={…} trailing={…} />
<GridView crossAxisCount={2} crossAxisSpacing={8} mainAxisSpacing={8} shrinkWrap={true}>
  <ClipRRect borderRadius={BorderRadius.circular(12)} child={<Image image={new AssetImage('images/bg.png')} />} />
  <ClipRect child={<Image fit={BoxFit.cover} name={'images/logo.png'} />} />
<RichText maxLines={2} text={new TextSpan({ children: [new TextSpan({ fontWeight: 700, text: 'bold' })], text: 'a paragraph with ' })} />
```

Flutter → Analyzer → Normalize (N1–N11) → Generator → `tsc` against the unmocked kit. No handwritten UIR
anywhere. 23 build-proof assertions, all green.

## 7. Benchmark comparison

| Measure | M4-C | M4-D | Δ |
| --- | --- | --- | --- |
| Analyzer (build-proof extraction) | — | 2.00–2.11 s | first measured |
| `bridge normalize` (52 nodes) | 0.07–0.08 s | 0.08–0.09 s | +0.01 s |
| Generation + `tsc` (build proof) | — | within the 120 s budget, unchanged | — |
| Runtime kit bundle | 51,292 B | 69,549 B | +36% (22 widgets) |
| Emitted project | — | 14,244 B | — |
| Runtime tests | 276 | 306 | +30 |
| Signal-graph bench | 104k hz cached read | unchanged | — |

**No optimization was done, because no bottleneck was measured.** The +0.01 s on normalize is within run-to-run
noise on the same 52-node document; the widget work does not touch normalization at all. Bundle growth is
linear in widget count, which is the expected shape.

## 8. Determinism proof

```
$ node packages/cli/bin/bridge.mjs normalize fixtures/uir/layout_proof.ndjson --out n{1,2,3}.ndjson
3fac7702ca22e9781f277f32a7733e56486ba528da72052209131491df593d99  n1.ndjson
3fac7702ca22e9781f277f32a7733e56486ba528da72052209131491df593d99  n2.ndjson
3fac7702ca22e9781f277f32a7733e56486ba528da72052209131491df593d99  n3.ndjson
```

Three independent runs, identical SHA-256. Preserved by construction in the new code: grid cells are keyed by
index, span trees walk in source order, catalog metadata is emitted sorted, and no new code reads a clock or
the filesystem. The analyzer's own output is pinned by the golden drift-guard
(`8833be32…` for `layout_proof.ndjson`).

## 9. Incremental proof

**Fixed point** — `normalize(normalize(x)) == normalize(x)`:

```
3fac7702ca22e9781f277f32a7733e56486ba528da72052209131491df593d99  n1.ndjson
3fac7702ca22e9781f277f32a7733e56486ba528da72052209131491df593d99  nn.ndjson
```

**Incremental ≡ clean** is asserted in `generate.test.ts` and by `incremental_test.dart` /
`incremental_pipeline_test.dart`, all green.

## 10. Remaining blockers before M5

Ordered by corpus impact, which is now measurable rather than estimated:

1. **The animation engine (36 uses, runtime).** Already `BRIDGE-STUB(M5)` and the single largest classified
   gap. `AnimatedOpacity`/`AnimatedContainer` are the common shapes and are mostly interpolation over the
   props this kit already maps.
2. **`Matrix4` and `Transform` (33 uses, runtime).** Small and self-contained: CSS `transform` takes the same
   matrix. Probably the best effort-to-coverage ratio available.
3. **The constraint model's measuring half (31 uses, runtime).** `LayoutBuilder` and `FittedBox` need a
   child's measured size. A `ResizeObserver` would do it in the browser but not on the server, so this needs
   a decision about SSR-time layout before it can be built.
4. **The sliver protocol (28 uses, ADR).** Unchanged from the M4-A triage.
5. **Colour-valued props (19 uses, compiler).** The one *new* gap this milestone identified precisely: a
   `Color` written at a call site is not an `app.Token`, so `ColoredBox`/`DecoratedBox` have working runtime
   components the pipeline cannot supply a colour to. Needs a normalization pass that maps a colour expression
   to a token — and that is the smallest architectural item on this list.
6. **The gesture model (21 uses, runtime).** Everything interactive waits on it: `InkWell`, `ListTile.onTap`,
   `Chip.onDeleted`, and the state layers `ThemeSurface.stateLayer` already composes.

Three of the six are runtime-only work with no ADR needed. **M5 should take 1, 2 and 6** — the animation
engine, `Matrix4`, and the gesture model — which together cover 90 corpus uses and unlock the interactive
Material components whose colours and opacities are already in place.
