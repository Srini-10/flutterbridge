# M4-C — Assets, Material metadata, and the end of the architectural blockers

**Goal:** remove the last schema/catalog limitations so widget implementation becomes mechanical.

**Status: complete.** ADR-0023 is resolved and accepted, the asset pipeline runs end-to-end, Material's own
numbers live in the catalog, and eight widgets were implemented on top. **No schema change was required.**

CI green: 207 analyzer tests + `dart analyze` clean, 28 `bridge_uir`, 22/22 TS test tasks (276 runtime, 80
generator, 16 catalog-codegen, 126 compiler), 18/18 typecheck, `codegen:check` OK, `lint:stubs` OK.

---

## 1. ADR-0023, resolved

The investigation was run against **real analyzer output**, not against the code. A probe fixture put all
eight constructs through the analyzer. What came back:

| Construct | Extracted as | Verdict |
| --- | --- | --- |
| `Image.asset('images/logo.png')` | `props._positional0` | **broken** — ADR-0023 confirmed |
| `Image.network('https://…')` | `props._positional0` | **broken** |
| `Icon(Icons.star)` | `props._positional0` = `logic.Ref 'Icons.star'` | **broken, twice over** |
| `AssetImage('images/bg.png')` | `logic.New AssetImage`, library `package:flutter/` | **already correct** |
| `NetworkImage(...)` | `logic.New NetworkImage` | **already correct** |
| `ExactAssetImage(..., scale: 2.0)` | `logic.New` + `namedArgs` | **already correct** |
| `MemoryImage(bytes)` | `logic.New MemoryImage` | **already correct** |
| `IconData` | (see `Icon`) | **broken** |

So ADR-0023 was **right about the defect and wrong about its extent**. Four of the eight already worked —
M4-B's kit-provided lowering had handled the providers all along. What actually needed fixing was narrower
than the ADR claimed, and one thing it did *not* anticipate needed fixing too.

**Two corrections, both recorded in the ADR rather than quietly dropped:**

1. **`positionalProps` does not subsume `role: "text"`.** The proposal said it did. Reading
   `WidgetExtractor._element` shows `role: 'text'` dispatches to `_text(...)`, which emits a **`ui.Text` node
   rather than a `ui.Element`** — it decides what *kind of thing* a `Text` is, which is orthogonal to what its
   argument is called. `Text` now carries both fields.
2. **`Icons.star` needed a second mechanism.** It extracts as a `logic.Ref` named `Icons.star` whose *type* is
   `IconData` — so the prefix and the type name differ, and M4-B's static-const lowering (which requires them
   to match) could not fire. Lowering it by name would oblige every runtime kit to ship Flutter's ~2000-entry
   `Icons` table for the reference to resolve.

## 2. Schema and catalog changes

**UIR schema: unchanged.** No new node kind, no new field, no `UIR_SCHEMA_HASH` churn (INV-5). `ui.Element.props`
already held arbitrary named props; only the *key* was wrong.

**Catalog** (`catalog/widgets/material.json`), three additive fields:

- **`positionalProps`** — names a widget's positional arguments, **keyed by constructor**, because Flutter
  names them differently per constructor: `Image.asset(String name)` against `Image.network(String src)`. A
  single list per widget would have to pick one and be wrong for the other.
- **`constValues`** — types whose static consts are extracted **by value**, and which fields to read.
  `IconData: [codePoint, fontFamily, fontPackage]`. The analyzer evaluates the constant and emits the
  construction it denotes, so the codepoint travels rather than the name.
- **`material`** — Material's own numbers, for the runtime kits. **Every value cites the SDK file and line it
  came from**, because this is the one file that must not contain a number somebody remembered.

Two widget entries added (`Image`, `Icon` — both were absent entirely), and `Text` gained
`positionalProps: {"": ["data"]}`.

**Backward compatibility:** every field is optional, and a widget that declares none extracts exactly as
before. `_positional$i` remains the fallback key.

## 3. Material metadata — read, not recalled

The Flutter SDK is installed on this machine, so the values were **transcribed from `~/flutter` (3.44.0)**
rather than remembered:

| Value | Source |
| --- | --- |
| Elevation → surface-tint opacity: `0→0.0, 1→0.05, 3→0.08, 6→0.11, 8→0.12, 12→0.14` | `material/elevation_overlay.dart:172-177` |
| State layers: `hover 0.08, focus 0.1, press 0.1` | `material/elevated_button.dart:550-556` |
| Disabled: `container 0.12, content 0.38` | `material/elevated_button.dart:401-402` |
| Icon: `size 24, weight 400, opticalSize 48`, family `MaterialIcons` | `widgets/icon_theme_data.dart:51-59` |
| Card: `elevation 1.0, margin 4.0, radius 12.0, surfaceContainerLow` | `material/card.dart:_CardDefaultsM3` |
| Divider: `space 16, thickness 1.0, outlineVariant` | `material/divider.dart:_DividerDefaultsM3` |

**One negative result, and it changed the code.** M4-B declared a `dragged` state-layer opacity from the
Material 3 specification. Searching the SDK found that **no M3 defaults class assigns `WidgetState.dragged` an
opacity** — the state exists, the number does not. Rather than transcribe a value Flutter does not state,
`InteractionState` lost the member. A value the catalog cannot supply is one every component would have had to
invent.

The Divider defaults the SDK reports (`space 16`, `thickness 1.0`, `outlineVariant`) match exactly what M4-A/B
had chosen — so that widget was independently confirmed correct, and now reads the numbers from the catalog
instead of holding them.

## 4. Generated artifacts

A **third codegen target** was added, per ADR-18's "generated into every runtime that needs it":

```
catalog/widgets/material.json
  ├─→ dart/…/generated/material_catalog.dart              (analyzer: + positionalProps, constValues)
  ├─→ packages/adapters/…/generated/material_catalog.ts   (compiler: unchanged subset)
  └─→ packages/runtimes/react/src/internal/generated/material_metadata.ts   ← new
```

The kit takes no workspace dependency: generated source *inside* a package is source that package owns, as
`packages/uir/src/generated/` already is. `codegen-check` fails CI on drift in all three.

## 5. Algorithms

- **Positional naming.** `positionalProps[ctor][i]` names the *i*th positional argument. The index is now
  counted over *positional arguments*, not over `props.length` as before — the old key meant "the first
  positional" only when no named argument preceded it, which was a latent bug.
- **Const folding.** For a static-const reference whose type the catalog lists: evaluate the constant, read
  the listed fields, emit a `logic.New` whose `namedArgs` are `logic.Lit` nodes. Falls back to the ordinary
  reference on *any* irregularity — unlisted type, unresolvable constant, non-primitive field — so it can only
  add information, never lose it. (The first attempt emitted raw literals where the schema requires expression
  nodes; `BRG1204` caught it, which is the schema guard working.)
- **Asset collection.** One walk of the program, two shapes: a widget prop named by `WidgetMapping.assetProps`,
  and a `logic.New` of a type in `ASSET_PROVIDERS`. Neither is keyed on a widget name, so registering an
  asset-bearing widget is one line in the map. Keys are sorted and deduplicated.
- **Image resolution.** A pure function of provider + manifest. `MemoryImage` sniffs the container format from
  magic bytes, because a `data:` URL must declare a media type and the wrong one renders nothing.
- **Elevation.** Linear interpolation across the transcribed stops, clamped outside — Flutter's
  `_surfaceTintOpacityForElevation`, not an approximation of it.

## 6. Validation

The build proof runs **Flutter → Analyzer → Normalize (N1–N11) → Generator → tsc → Runtime** on
analyzer-produced UIR only. The fixture now carries assets, an icon, a seeded `ColorScheme`, and the new
family. Real emitted output:

```tsx
<Image fit={BoxFit.cover} name={'images/logo.png'} width={40} />
<Image src={'https://example.com/a.png'} />
<Image image={new AssetImage('images/bg.png')} />
<Icon icon={new IconData({ codePoint: 58873, fontFamily: 'MaterialIcons' })} semanticLabel={'favourite'} size={18} />
<Card elevation={2} child={<Text>{'card'}</Text>} />
<Container alignment={Alignment.center} padding={EdgeInsets.all(8)} width={120} child={…} />
```

with a manifest carrying `images/logo.png` and `images/bg.png` — and **not** the network URL, because a URL
ships no file.

**A third finding, from the same evidence.** A Dart enum member reaches the generator as `logic.Ref
BoxFit.cover`, **never** as `bind.Const 'cover'`. Every test that exercised `WIDGET_MAP`'s enum tables before
M4-C used hand-built UIR carrying a shape no analyzer has ever produced — the tables were dead on real input.
The fix is that the kit now exports each enum as a **value** as well as a type, so `BoxFit.cover` resolves and
the emitted code keeps reading like the Dart it came from. This is exactly the class of defect the M3-D
build-proof rewrite was meant to catch, found the same way.

## 7. Benchmark impact

| Measure | M4-B | M4-C |
| --- | --- | --- |
| `bridge normalize` (52 nodes) | 0.07–0.08 s | 0.07–0.08 s |
| Runtime kit bundle | 38,990 B | 51,292 B (+31%: assets, Image/Icon/Card/Container, generated metadata) |
| Runtime tests | 253 | 276 |
| Signal-graph bench | 104k hz cached read | 104k hz — unchanged |

Asset resolution is a `Map` lookup and a string concatenation; the generated metadata is frozen module-scope
data. Neither is on the signal-graph hot path, which the unchanged benchmark confirms.

## 8. Determinism proof

```
$ node packages/cli/bin/bridge.mjs normalize fixtures/uir/layout_proof.ndjson --out n{1,2,3}.ndjson
296daf2f6ac5ebb60f6960b630e99930cb6eff3fa0b83a0559e94a5a60a0ed54  n1.ndjson
296daf2f6ac5ebb60f6960b630e99930cb6eff3fa0b83a0559e94a5a60a0ed54  n2.ndjson
296daf2f6ac5ebb60f6960b630e99930cb6eff3fa0b83a0559e94a5a60a0ed54  n3.ndjson
```

Three independent runs, identical SHA-256. Preserved by construction: manifest keys are sorted, folded
`namedArgs` are sorted, generated metadata records are sorted by key, and no new code reads a clock or the
filesystem. The analyzer's own determinism is pinned by the golden drift-guard
(`60e4ae7c…` for `layout_proof.ndjson`) plus `determinism_test.dart`.

## 9. Incremental proof

**Fixed point** — `normalize(normalize(x)) == normalize(x)`:

```
296daf2f6ac5ebb60f6960b630e99930cb6eff3fa0b83a0559e94a5a60a0ed54  n1.ndjson
296daf2f6ac5ebb60f6960b630e99930cb6eff3fa0b83a0559e94a5a60a0ed54  nn.ndjson
```

**Incremental ≡ clean** is asserted in `generate.test.ts` (a second run over an unchanged program produces an
identical result) and by `incremental_test.dart` / `incremental_pipeline_test.dart`, all green. 6 golden nodes
→ 52 normalized, the 46 additions being N10's derived roles.

## 10. New diagnostics

| Code | Severity | Meaning |
| --- | --- | --- |
| `BRG3012` `UnresolvableAsset` | error | An asset key the generator cannot read as a constant. Refused rather than omitted: an asset missing from the manifest becomes a broken image, which looks like a slow network. |
| `BRG4010` `UnknownAsset` | runtime | An asset key the manifest does not carry, or bytes in no displayable format. |

## 11. Widgets implemented

`Container`, `Opacity`, `Card`, `Icon`, `Image` — plus `Align`, `AspectRatio`, `SafeArea` from M4-B. Each is
analyzer-verified, normalized, generated, typechecked against the real kit, runtime-tested, and exercised in
the build proof. `Card` and `Divider` now read every number they use from generated metadata; `Container`
merges its concerns onto **one** element rather than nesting a `<div>` per concern, because each extra box
would change what a percentage resolves against.

## 12. Remaining unsupported widget families

1. **Declared-asset validation.** The manifest is built from *references*, so a referenced asset that no file
   backs is a 404 rather than a build error. Flutter's own `AssetManifest.json` comes from `pubspec.yaml`'s
   `assets:` section, which `Pubspec.load` does not read (`name`, `dependencies`, SDK constraints only).
   Analyzer work, **no schema change** — but it needs somewhere in UIR to put the list, which is the next
   thing worth an ADR.
2. **Fonts.** `Icon` renders a codepoint in the family its `IconData` names; the font file is the
   application's to ship. Tagged `BRIDGE-STUB(M4)`. Nothing in a kit can supply a font binary.
3. **Shadows.** M3's elevation *is* the tint, which `Card` composes exactly. Flutter also casts a shadow, and
   its penumbra needs `shadow`-group tokens no compiler pass emits.
4. **Typography.** `ThemeSurface.typography` and the `TypographyToken` shape are in place; no pass emits
   `typography`-group tokens, so `TextStyle` is still unmapped.
5. **`Container.decoration` / `.transform`** — a value type carrying borders, gradients and shadows, and a
   `Matrix4`. Neither is forwarded, so a `Container` using one is reported rather than rendered flat.
6. **Unchanged from the M4-A triage, each needing its own ADR:** imperative overlays (SnackBar, BottomSheet,
   menus), controlled inputs and controllers (TextField, Form), the sliver protocol, `Hero`'s shared-element
   transition. **`SvgPicture.asset`** is a third-party package, so a second catalog under ADR-18.

## 13. Recommended next milestone — M4-D

**The infrastructure is done; M4-D should be the widget sweep it was built for.** Adding a widget is now:
one runtime component + one `WIDGET_MAP` entry, with the catalog answering every framework question and the
generator verifying the pairing (`BRG3010` roles, `BRG3011` alignments, `BRG3012` assets).

In order:

1. **Family A, mechanically** — `ColoredBox`, `DecoratedBox`, `ClipRRect`, `Transform`, `IndexedStack`,
   `SingleChildScrollView`, `FittedBox`, `ListBody`, `OverflowBar`. No new capability.
2. **Themed Material chrome** — `ListTile`, `Chip`, `CircleAvatar`, and the Material appearance of the three
   button types. Everything they need exists: roles resolve through `ThemeSurface`, opacities come from
   generated metadata. This is wiring, not architecture.
3. **Then** the declared-asset ADR (item 1 above), which is the only remaining item that is genuinely
   architectural rather than mechanical.

Do **not** start the sliver or controlled-input families before their ADRs. Both change what a UIR node
*means*, not what it maps to, and that is the distinction this milestone exists to have made visible.
