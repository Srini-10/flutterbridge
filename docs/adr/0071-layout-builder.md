# ADR-71 — `LayoutBuilder` and the constraints a browser can state

- **Status:** Accepted (M13). `LayoutBuilder` was refused ("the constraint model's measuring half"): 51 sites in a real consumer app.
- **Date:** 2026-09-21

## Decisions

**D1 — A builder closure that returns a widget is extracted as code that yields UI.** A closure written at the call site whose result is a widget
(`builder: (context, constraints) { if (…) return Row(…); return Column(…); }`) is extracted with widget values on: each returned widget is a
`logic.WidgetExpr` holding its `ui.*` tree (ADR-0062), so the closure keeps its own control flow. The generator emits it as a render prop.
**D2 — The runtime measures.** `LayoutBuilder` renders a wrapper that fills its parent, measures in a layout effect and re-measures with a `ResizeObserver` on the wrapper and its ancestors;
the builder runs with `LayoutConstraints { maxWidth, maxHeight, hasBoundedWidth, hasBoundedHeight }`. **`maxWidth`** is the width of the nearest ancestor whose width does not depend on its
content (measured by hiding what is inside it), less the padding/border of the shrink-wrapped ancestors between — Flutter passes its incoming maximum down, a shrink-wrapped `Column` does not narrow it.
**`maxHeight`** is read structurally from computed style, as Flutter's is: a scroll container and a column's main axis (unless `Expanded`) give `Infinity`, an explicit height bounds it, otherwise
the parent's bound is inherited (percentage heights are not trusted: the kit's own scroller is `height: 100%`). The Chromium suite found both defects of the first design (a 400 px reading in a 1000 px window; a bound reported inside a scroll view).
**D3 — What a browser cannot state is refused.** A laid-out box does not remember whether its parent *forced* a size or merely allowed one, so `minWidth`,
`minHeight`, `hasTightWidth`, `hasTightHeight`, `isTight` (and the rest of `BoxConstraints`) are refused by name (`BRG3013`) rather than answered with a guess.
**D4 — Numeric methods the new code needs** (`round` — half away from zero — `floor`, `ceil`, `truncate`, `toInt`, `abs`, `clamp`) are lowered to helpers checked against
real Dart (`dart_round_cases.json`); each throws for NaN/infinity as Dart does.

## Documented differences

- The builder does not run on the server (constraints do not exist before layout): the server-rendered HTML holds the empty wrapper, the content appears in the first layout effect, before the first paint.
- The wrapper is an element that fills its parent; a parent that sizes a child by its content gives the builder the width on offer, not the width its content would take.

## Evidence

`fixtures/apps/layout` compared with `flutter test`: builder reads `maxWidth`/`maxHeight`, rebuilt when a button resizes the box, responsive branches, nested builders (padding
between), unbounded height reported as infinity. jsdom does no layout, so that suite installs a small shim (`execute.ts`); the Chromium suite resizes a container and the
viewport for real, in production and development.
