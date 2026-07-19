# ADR-0023: Naming positional widget arguments in the catalog

- **Status:** **Accepted** — implemented in M4-C
- **Date:** 2026-07-18 (raised), 2026-07-18 (accepted)
- **Raised by:** M4-B, while building the asset infrastructure
- **Amends:** ADR-18 (framework metadata is never duplicated) — additively, the catalog's `WidgetSpec` shape

## Resolution (M4-C)

Accepted and implemented. The proposal below stands, with **one correction** and one addition, both found by
running the real analyzer rather than by reading the code:

**Correction — `positionalProps` does *not* subsume `role: "text"`.** The proposal claimed it did. It does
not: `role: 'text'` selects a different **UIR node kind**. `WidgetExtractor._element` dispatches on
`recognition.isTextWidget` to `_text(...)`, which emits a `ui.Text` node rather than a `ui.Element` — so the
role decides *what kind of thing a `Text` is*, and naming its positional argument decides only what the
argument is called. They are orthogonal concerns and `Text` now carries both. The claim was wrong and is
retracted here rather than quietly dropped.

**Addition — a second catalog field was needed, for a different reason.** `Icon(Icons.star)` has two problems,
not one. Naming the positional argument fixes the first. The second is that `Icons.star` extracts as a
`logic.Ref` named `Icons.star` whose *type* is `IconData` — so lowering it by name would oblige every runtime
kit to carry Flutter's ~2000-entry `Icons` table for the reference to resolve to anything. `constValues` names
the types whose static consts are extracted **by value**: the analyzer evaluates the constant and emits the
construction it denotes, so `Icons.star` becomes `IconData(codePoint: 0xe5f9, fontFamily: 'MaterialIcons')`
and the codepoint — the icon's actual identity — travels instead of the name.

**What did not need changing.** `AssetImage`, `NetworkImage`, `ExactAssetImage` and `MemoryImage` already
extracted correctly: each is a `logic.New` of a `package:flutter/` type, which M4-B's kit-provided lowering
already handled. The impact table's claim that `WIDGET_MAP` must key on `constructorName` also proved
unnecessary — the kit's `Image` component accepts `name`, `src` and `image` and converges them onto one
`ImageSource`, so one mapping covers all three spellings.

Verified end-to-end in `fixtures/uir/layout_proof.ndjson`: Flutter → analyzer → N1–N11 → generator → `tsc`
against the real kit, with no `_positional0` anywhere and no schema change.

## The conflict

ADR-18 rules that extraction must decide what a widget's arguments *mean* from the catalog, and never from a
name baked into the extractor. The extractor does that for named arguments and for the `childrenProp`. It
cannot do it for **positional** arguments, because the catalog has no field that names one — and the extractor
says so itself, in `dart/bridge_analyzer/lib/src/session/extract/widget_extractor.dart:182-189`:

```dart
if (argument is! NamedArgument) {
  // A positional argument to a widget — `Text`'s data, `Icon`'s icon. Handled by the widgets
  // that have one; for the rest it is a prop with no name, and the schema has nowhere to put it.
  if (argument is Expression) {
    props['_positional${props.length}'] = RawChild(bindings.extract(argument, scope));
  }
```

So a positional argument reaches UIR under a **synthetic, meaningless key**. Verified against the real
analyzer (M4-B probe, `Image.asset('images/logo.png', width: 40)`):

```json
"component": { "name": "Image", "constructorName": "asset", "library": "package:flutter/src/widgets/image.dart" },
"props": {
  "_positional0": { "kind": "bind.Const", "value": "images/logo.png" },
  "width":        { "kind": "bind.Const", "value": 40 }
}
```

The asset path is present and correctly typed. Nothing downstream can tell it is an asset path rather than any
other first positional argument.

Two facts make this a contradiction rather than a gap:

1. **The catalog already claims this jurisdiction.** ADR-18: *"Every framework catalog originates from a single
   declarative source and is generated into every runtime that needs it."* Which argument of `Image.asset`
   carries the path is framework metadata by that definition. It currently lives nowhere.
2. **The extractor already special-cases the widgets it happens to need**, via `role: 'text' | 'async'` —
   `Text`'s positional data is handled because `Text` has a role, and `Icon`'s is not because `Icon` has none.
   That is a per-widget escape hatch standing in for the general mechanism, and ADR-18 exists to remove exactly
   those. M4-B's brief restates it: *"Never special-case widgets. Use the widget catalog whenever metadata is
   required."*

`Image` and `Icon` are also absent from `catalog/widgets/material.json` entirely (59 widgets, neither among
them), so both would need entries regardless.

## Why M4-B stopped here rather than proceeding

`CLAUDE.md` rule 4: *"Found a problem? File it as an implementation issue. Do not redesign the interface."*
Rule 1: an interface change *"requires an ADR documenting a proven contradiction in the spec — not a
preference."* The catalog's `WidgetSpec` (`tools/catalog-codegen/src/model.ts:7-17`) is such an interface, and
it is consumed by two generated files that are committed build inputs. This document is the required ADR; the
change is not made under it until it is accepted.

Every other part of M4-B was completed and validated. Assets are the only blocked item.

## Proposal

Add one optional field to a catalog widget entry:

```json
{ "name": "Image", "positionalProps": ["image"], "library": "package:flutter/src/widgets/image.dart" }
{ "name": "Icon",  "positionalProps": ["icon"] }
```

`positionalProps[i]` names the widget's *i*th positional argument. The extractor writes
`props[positionalProps[i]]` instead of `props['_positional$i']`; where no name is declared, behaviour is
unchanged, so this is additive and no existing extraction moves.

**This subsumes `role: 'text'`.** `Text`'s positional data becomes `positionalProps: ["data"]`, and the
extractor's text special case can be deleted rather than joined by an `Icon` one.

### Impact

| Layer | Change |
| --- | --- |
| **UIR schema** | **None.** `ui.Element.props` already holds arbitrary named props; only the key changes. No `UIR_SCHEMA_HASH` churn (INV-5). |
| **Catalog** | One optional field on a widget entry; `Image`/`Icon` entries added. |
| **Catalog codegen** | `WidgetSpec` in `model.ts`, plus `dart.ts` and `typescript.ts` emitters; both generated catalogs regenerate (`just codegen`, guarded by `codegen-check`). |
| **Analyzer** | `widget_extractor.dart` consults `registry.positionalPropsOf(name)`; the `role: 'text'` branch is removed. |
| **Compiler (N1–N11)** | **None.** |
| **Generator** | `WIDGET_MAP` must key on `name` + `constructorName` — `Image.asset` and `Image.network` are different components and today `mappingOf` ignores the constructor entirely (`widgets.ts:167`). |
| **Runtime kit** | New `Image`/`Icon` components. `objectFit` (`layout/constraints.ts`) is already in place for `BoxFit`. |

### What remains out of scope even under this ADR

- **Asset manifest and `pubspec.yaml` `assets:` parsing.** `dart/bridge_analyzer/lib/src/workspace/pubspec.dart`
  reads only `name`, `dependencies` and the SDK constraints; the `flutter: assets:` section is never read. New
  work, but not blocked on this ADR.
- **Copying asset bytes.** ADR-22 is binding: `generate` returns `EmittedFile[]` and may not touch the
  filesystem (`fs`/`fetch` are lint-banned in the plugin realm). An asset emitter can emit a *manifest and
  references*; moving bytes belongs to the host, and that is a separate decision.
- **`SvgPicture.asset`** (`flutter_svg`) — a third-party package, so a second catalog under ADR-18, not an
  entry in the Material one. The M0 corpus scan found 4 uses in `wonderous` and 1 in `compass_app`.

## Alternatives considered

**Special-case `Image` in the generator**, reading `_positional0` when the widget name is `Image`. Rejected:
it is the exact practice ADR-18 was written to end, and it puts framework metadata in a target-specific table
where a Vue generator would need its own copy.

**Add an asset node kind to the UIR schema** (`app.Asset`, or an `assetPath` field on `ui.Element`). Rejected
as disproportionate: the information is already present and correctly typed, and the schema is not missing a
*capability* — the catalog is missing a *name*. It would also churn `UIR_SCHEMA_HASH`, invalidating every
cached document (INV-5), which ADR-21 already declined to do for a smaller reason.

**Infer the name from the constructor.** Rejected: `Image.asset`'s first positional is a path, `Image.memory`'s
is bytes, `Icon`'s is an `IconData`. Inference here is a guess with a plausible-looking result, which is the
failure mode ADR-12 exists to catch.
