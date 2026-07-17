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

import type { AnyUirNode, NodeId } from '@bridge/uir';

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

  /**
   * The target it generates, if it generates one.
   *
   * Optional and additive: `@bridge/widgets-material` describes widgets and generates nothing; `gen-react`
   * generates and describes nothing. One plugin kind, one loading path, one sort order — the host does not
   * learn a second way to find things (ADR-22).
   */
  readonly generator?: TargetGenerator;
}

// ── Generation (ADR-22) ───────────────────────────────────────────────────────────────────────────
//
// ## Why there is behaviour in a package whose header says there is none
//
// The rule above — "declarative metadata, never behaviour" — is about **adapters**, and its reason is stated
// with it: an adapter that could act would be a place a framework's assumptions could reach into a
// target-neutral IR. That is a constraint on the *input* side, on what may influence normalization.
//
// A generator sits on the *output* side. It is handed a finished program and returns text, and by
// construction cannot influence how anything was compiled. And this package still carries no behaviour: what
// follows is interfaces, exactly as `BridgePlugin` is an interface the host `import()`s an implementation of.
// ADR-8 already presumed all of this ("the host hands each plugin narrow interfaces ... and nothing else");
// it was never written down.

/**
 * A finding a generator reports.
 *
 * Structurally identical to the compiler's own `Diagnostic`, which lives in `packages/compiler/src/internal/`
 * and is therefore unreachable from the plugin realm. The duplication is deliberate, temporary and recorded
 * in ADR-22: TypeScript makes the two mutually assignable, so drift is a compile error rather than a silent
 * disagreement, and unifying them belongs at the M3-T6 SPI freeze rather than in a milestone forbidden from
 * touching the compiler.
 *
 * Codes are ranged (`docs/architecture/compiler.md`): `BRG0xxx` environment, `BRG1xxx` extraction, `BRG2xxx`
 * normalization, **`BRG3xxx` generation**, `BRG4xxx` verification.
 */
export interface Diagnostic {
  /** The code, e.g. `BRG3001`. */
  readonly code: string;

  /**
   * How bad it is.
   *
   * - **error** — the program is not fit to generate from. Something would have to be invented.
   * - **warning** — generation can proceed, but had to work around something the frontend should have stated.
   * - **info** — the generator did something worth knowing about.
   */
  readonly severity: 'error' | 'warning' | 'info';

  /** What is wrong, and what it means for the output. */
  readonly message: string;

  /** The node it is about, when there is one. */
  readonly nodeId?: string;
}

/**
 * A read-only view of a normalized program — the query half of the compiler's `Program`.
 *
 * It exists because the plugin realm cannot import `@bridge/compiler` (`.dependency-cruiser.cjs`, and
 * `tsPreCompilationDeps` means even `import type` is a violation), while `plugin-sdk` may depend only on
 * `@bridge/uir`. The compiler's `Program` satisfies this structurally, with no change to the compiler.
 *
 * **`with()` and `toNdjson()` are deliberately absent.** A generator that could rewrite the program would be
 * a normalization pass in the wrong package, and ADR-1 exists because normalization is shared and
 * target-neutral. A generator reads.
 */
export interface ProgramView {
  /** Every node, in canonical order (kind, then id). */
  readonly nodes: readonly AnyUirNode[];

  /** The node with this id, or `undefined`. */
  get(id: NodeId): AnyUirNode | undefined;

  /** Whether the program contains this id. */
  has(id: NodeId): boolean;

  /** Every node of one kind, in canonical order. */
  ofKind<K extends AnyUirNode['kind']>(kind: K): readonly Extract<AnyUirNode, { kind: K }>[];
}

/** One file a generator produced. */
export interface EmittedFile {
  /**
   * Where it goes, relative to the output root, `/`-separated and never absolute or `..`-relative.
   *
   * The generator names the file; the host decides what the root is. That split is what lets the same output
   * be written to disk, diffed against an existing project, or previewed without ever touching a filesystem.
   */
  readonly path: string;

  /** Its complete contents. */
  readonly contents: string;
}

/** What a generator is given. */
export interface GeneratorContext {
  /** The normalized program. */
  readonly program: ProgramView;

  /**
   * Facts about widgets, merged from every adapter the build loaded.
   *
   * The same catalog the compiler used, so a generator never re-derives which prop is a slot — and never
   * disagrees with normalization about it (ADR-18).
   */
  readonly widgets: WidgetCatalog;

  /**
   * Diagnostics the pipeline already produced, so a generator can refuse a program that is not fit to
   * generate from rather than discovering it one node at a time.
   */
  readonly diagnostics: readonly Diagnostic[];

  /** Records a finding. A generator reports; it does not throw for anything the input did. */
  report(diagnostic: Diagnostic): void;
}

/** What a generator produced. */
export interface GeneratorOutput {
  /**
   * The complete project, as files.
   *
   * Ordered deterministically by path, so two runs over one program produce not just the same files but the
   * same array.
   */
  readonly files: readonly EmittedFile[];
}

/**
 * A target a plugin can generate.
 *
 * **Pure, and synchronous.** `generate` is a function from a program to files: it must not read the clock,
 * the filesystem, the network, or a random source, and ADR-8 lint-bans `fs` and `fetch` inside plugin
 * packages besides. That is what makes determinism testable by calling it twice — no temp directory, no
 * cleanup — and it is why the generator returns files rather than writing them (ADR-22). The host decides
 * where bytes land, because only the host knows whether this is a build, a dry run, a diff or a preview.
 */
export interface TargetGenerator {
  /** The target's name, e.g. `react`. Unique across loaded plugins. */
  readonly target: string;

  /**
   * The semver range of the runtime kit the emitted code is written against — INV-12/INV-13, required by
   * ADR-6 ("generated code may only use public kit entrypoints within the generator's declared
   * `runtimeRange`") and, until now, declared nowhere.
   *
   * Checking emitted imports against it is the verifier's job (M4). Stating it is the generator's.
   */
  readonly runtimeRange: string;

  /**
   * Emits the project.
   *
   * @param context - the program, the widget catalog, and a diagnostic sink.
   * @returns every file of the generated project.
   */
  generate(context: GeneratorContext): GeneratorOutput;
}
