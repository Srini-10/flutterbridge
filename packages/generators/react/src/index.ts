// @bridge/gen-react — Target #1 — Next.js generator.
//
// ## What this package is
//
// Normalized UIR in, React source out. It is a **plugin** (ADR-8, ADR-22): the compiler never imports it, the
// host loads it by specifier, and `.dependency-cruiser.cjs` enforces that it can reach only `@bridge/uir` and
// `@bridge/plugin-sdk`. It cannot see the compiler, and it cannot see `@bridge/core`'s VFS — so it does not
// write files. It returns them, and the host decides where bytes land (ADR-22).
//
// ## What it emits against
//
// `@bridge/runtime-react`, and only its public entrypoint (INV-12/INV-13, declared as `runtimeRange` below).
// ADR-6 fixes the shape: `Row(mainAxisAlignment: spaceBetween)` becomes `<Row mainAxisAlignment="spaceBetween">`
// imported from the kit, never a bespoke flexbox `<div>` inlined here. The layout edge cases are fixed once,
// in the kit, not re-litigated in ten thousand generated files.
//
// ADR-19 fixes the division: **structure is data, behaviour is closures.** A store's shape is an object
// literal; its action bodies are real TypeScript, lowered by `internal/emit/expression.ts` and
// `statement.ts`. The kit never interprets `logic.*`, so Dart's semantics are resolved here, at compile time
// — which is why the expression emitter is the file to read first.
//
// ## What it does not do
//
// It never invents. A widget with no mapping, an operator with no faithful lowering, a `ui.Opaque`, an inline
// route destination — each is a `BRG3xxx` diagnostic and an absence in the output, not a plausible guess.
// `docs/architecture/compiler.md`: *"**error** — the program is not fit to generate from. Something would
// have to be invented."*
//
// BRIDGE-STUB(M3): the supported surface is M3-B's minimal one — Text, Column, Row, Center, Padding,
// SizedBox, ElevatedButton; ui.Element/Text/Cond/List; bind.*; app.Store/Token/Route. ui.Async, ui.SlotRef,
// ui.OverrideRef, logic.ClassDecl emission and the remaining widgets are later M3 tasks, and are diagnosed
// rather than guessed at.
// BRIDGE-STUB(M3): rsc-split. Every emitted component carries "use client" until the rsc-safety analysis
// (Spec §3.3, ADR-15) exists to say which subtree may be server-rendered; erring client-side costs bundle
// size, erring server-side is ADR-15's privacy defect.
// BRIDGE-STUB(M4): the asset emitter and source maps. No fixture in the corpus references an asset, and a
// source map from Dart to TSX needs the anchor plumbing the override system introduces.

import type { BridgePlugin, GeneratorContext, GeneratorOutput, TargetGenerator } from '@bridge/plugin-sdk';

import { generateProject } from './internal/pipeline.js';

export { GeneratorDiagnosticCode } from './internal/diagnostics/codes.js';
export { WIDGET_MAP, mappingOf, type WidgetMapping } from './internal/emit/widgets.js';

/**
 * The React/Next.js generator.
 *
 * Pure and synchronous, as the SPI requires: a function from a program to files, with no clock, no
 * filesystem and no randomness. That is what makes determinism testable by calling it twice (ADR-22).
 */
export const reactGenerator: TargetGenerator = {
  target: 'react',

  /**
   * The kit this generator's output is written against (INV-12/INV-13, ADR-6).
   *
   * `0.0.x` because the kit is unpublished and pre-1.0; it becomes a real range when the kit ships. ADR-16
   * pins the *Next* version in the scaffolder separately, and re-decides it at the M3-T6 freeze.
   */
  runtimeRange: '0.0.x',

  generate(context: GeneratorContext): GeneratorOutput {
    return generateProject(context);
  },
};

/**
 * The plugin the compiler's host loads at runtime.
 *
 * Shaped exactly like `@bridge/widgets-material`'s: a default export with `name` and `version`, which is what
 * `PluginHost.load`'s duck-type gate accepts. It describes no widgets and generates one target; the adapter
 * does the reverse. One plugin kind, one loading path (ADR-22).
 */
export const reactPlugin: BridgePlugin = {
  name: '@bridge/gen-react',
  version: '0.0.0',
  generator: reactGenerator,
};

export default reactPlugin;
