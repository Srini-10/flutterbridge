# ADR-18 — Framework metadata is never duplicated across implementation languages

**Status:** Accepted (2026-07-13, at the M2-T10A gate)

## The rule

> **Framework metadata must never be duplicated across implementation languages.**
>
> Every framework catalog originates from a **single declarative source** and is **generated** into every
> runtime that needs it.

This covers Material, Cupertino, Flutter foundation, and every future frontend or adapter — SwiftUI,
React, Jetpack Compose, third-party widget kits.

## Why

Because we have now paid for the same mistake twice, in two different costumes.

**Once, on node identity.** Dart and TypeScript each hand-wrote a canonical encoder. They agreed on
everything except one thing: Dart wrote the double `100.0` as `100.0`, JavaScript wrote it as `100`. The
bug was invisible for four milestones — until the first pass that minted a node in TypeScript would have
given it a *different id* than Dart gave the same node. Fixed by generating one encoder from one source
(§A15, §A16).

**Twice, on the widget catalog.** The analyzer's extraction adapter (Dart) and the compiler's widget
registry (TypeScript) each hand-wrote what they knew about Flutter widgets. They disagreed:

| | Dart (drove extraction) | TypeScript (drove N7) |
| --- | --- | --- |
| slots | one flat `Set<String>` of 14 names, applied to **every widget** | per-widget |
| ordered children | **hardcoded** the literal string `children` | declarative `childrenProp` |

The consequence was not abstract. `AppBar(actions: [...])` and `CustomScrollView(slivers: [...])` — the
backbone of every scrolling Flutter screen — have their children under a name that is *not* `children`.
Extraction sent them into `props`, where the list was captured as an opaque expression. **The UI
structure was simply gone**: no normalization pass and no generator could see those were children.

And it could not be repaired downstream. Rebuilding elements from expressions loses the
`bind.Const` / `bind.Signal` / `bind.Param` classification, which needs the resolved scope — and the
scope exists only in the analyzer. A compiler-side "fix" would have produced elements where every prop
was a `bind.Expr`: nothing constant (so it re-renders forever), nothing reactive (so it never updates).
It would have *looked* like a fix.

## The architecture

```
catalog/widgets/material.json          ← the ONLY place this is authored
        │
        │  tools/catalog-codegen
        ├──▶ dart/bridge_analyzer/…/adapters/widget/generated/material_catalog.dart
        └──▶ packages/adapters/widgets-material/src/generated/material_catalog.ts
```

Each domain is generated **the subset it needs**, and that is not a compromise — it is the point. The
analyzer needs `componentBases`, `lifecycle`, `stateHolders`, `storeBases`, `stateBatchCalls`; the
compiler needs none of those, because the compiler never reads source. Both need slots, children and
transparency, and both get *the same* slots, children and transparency.

## The limit, stated plainly

A catalog covers a **framework**. It cannot cover the **application's own** widgets — `SeparatedRow` is
not in anybody's Material catalog.

So for a widget the catalog has never heard of, extraction falls back to the **type**: a named parameter
whose type is a *list of widgets* holds children. That is not a guess about a name; it is what the
element model says the parameter *is*. It applies only when there is exactly **one** such parameter —
`ui.Element` holds one ordered `children` list, and choosing between two candidates would be a guess, so
extraction leaves them visible in props rather than silently merging them.

## Consequences

- **No hand-written framework metadata remains in either language.** The Dart adapter is a lookup into
  generated data; the TypeScript adapter package is a re-export of it.
- Adding a widget means editing one JSON file.
- `just ci` regenerates and fails on drift, exactly as it does for the UIR schema.
