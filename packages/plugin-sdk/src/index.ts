// @bridge/plugin-sdk — every extension interface (SPI) the compiler discovers at runtime.
//
// ## The rule this package exists to make possible
//
// **The compiler never imports an adapter.** `.dependency-cruiser.cjs` enforces it: nothing under
// `packages/compiler/src` may reach `packages/adapters/**`. The compiler imports *this* — the shape of
// what an adapter is — and a plugin host loads the adapters themselves by name, at runtime.
//
// That is not ceremony. A normalization pass that could `import { Container } from '@bridge/widgets-material'`
// is a normalization pass that knows what Flutter is, and the moment one does, the pipeline stops being
// universal: a SwiftUI frontend and a React frontend can no longer share it. This package is the wall.
//
// ## Declarative metadata, never behaviour
//
// An adapter describes widgets. It does not transform them, and it is given no way to. There is no
// `flatten(node)` here, no `emit(node)`, no callback the compiler invokes — only facts:
//
//   * which named parameters are *slots* rather than props;
//   * when a widget is a transparent wrapper;
//   * what it contributes to layout.
//
// The compiler decides what to *do* with those facts. An adapter that could act would be a place a
// framework's assumptions could reach into a target-neutral IR — and there is no limit to how many
// frameworks that is.

/** One widget an adapter knows about. */
export interface WidgetSpec {
  /** The widget's name, as the frontend named it: `Container`, `Scaffold`. */
  readonly name: string;

  /**
   * The library it comes from, e.g. `package:flutter/`.
   *
   * Matched as a prefix. Two frameworks may both call something `Card`, and the library is what tells
   * them apart — the same reason the Dart-side adapters match on the resolved library and never on the
   * name (ISSUE-18).
   */
  readonly library?: string;

  /**
   * Named parameters that hold a **single child** rather than a prop value.
   *
   * `Scaffold`'s `body` is where the page goes; `appBar` is a different place on the screen. A generator
   * depends on the distinction, and flattening both into props would leave it to rediscover which props
   * happen to contain widgets.
   */
  readonly slots?: readonly string[];

  /**
   * The parameter that holds an **ordered list** of children, if the widget has one.
   *
   * `Column`'s is `children`. Order is semantic: it is the order they appear on screen.
   */
  readonly childrenProp?: string;

  /**
   * The widget is a **transparent wrapper** — a pass-through that renders its child and nothing else —
   * when *none* of these props is set.
   *
   * `Container` with no decoration, colour, padding, margin, size, constraints, alignment or transform
   * is a `Container` that does nothing at all: it exists because a developer needed somewhere to put a
   * child. A generator that emits it produces a `<div>` for nothing, and a tree of them produces the
   * div-soup that makes generated code obviously generated.
   *
   * **Absent means never transparent**, and that is the safe default. `Center` has no entry here, because
   * a `Center` with no props still centres — its identity *is* its behaviour. Guessing that a
   * prop-less widget must be a pass-through is how a compiler silently deletes a layout.
   */
  readonly transparentWithoutProps?: readonly string[];
}

/** A catalog of widgets: everything one adapter knows. */
export interface WidgetCatalog {
  /** The catalog's name, e.g. `material`. Unique, and used to break ties deterministically. */
  readonly name: string;

  /**
   * Lower wins. A ties is broken by [name], so the merged catalog is a *total* order and never depends
   * on the order plugins happened to be loaded in.
   */
  readonly priority: number;

  /** The widgets it describes. */
  readonly widgets: readonly WidgetSpec[];
}

/** A plugin the compiler loads at runtime. */
export interface BridgePlugin {
  /** The plugin's name. */
  readonly name: string;

  /** Its version. */
  readonly version: string;

  /** The widgets it describes, if it describes any. */
  readonly widgets?: WidgetCatalog;
}
