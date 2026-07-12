// @bridge/compiler — Loader/linker, pass manager, normalization + analysis passes, legalization,
// orchestrator, manifest.
//
// ## What this package owns, and why it is not in Dart
//
// ADR-2 draws the line: `bridge_analyzer` **extracts**, `bridge_uir` **defines the model**, and this
// package **normalizes**. The analyzer never normalizes and never generates — not as a matter of taste,
// but because normalization must be shared by every frontend. A SwiftUI frontend and a React frontend
// will feed this same pipeline, and a normalization pass that lived inside the Flutter analyzer could
// only ever normalize Flutter.
//
// ## The pipeline
//
// Spec §3.3 fixes eleven passes, their order, and their dependencies. The numbering is permanent: a
// pass that a *particular frontend* makes redundant is not deleted, because deleting it would make the
// pipeline's shape depend on which frontend fed it.
//
// Every pass has one contract with two halves — **normalize if necessary, otherwise verify the
// invariant.** N2/N3/N4 are, today, the second half: the Flutter frontend already emits `ui.Cond`,
// `ui.List` and `ui.Async`, so those passes assert that it did rather than redo it. A less canonical
// frontend will find them doing the work.
//
// **All eleven passes are implemented.** The manager still refuses to run a pipeline containing an
// unimplemented pass — that guard is not for us, it is for whoever adds the twelfth: a program that
// claims to be normalized and is not is more dangerous than one that is honestly unfinished.

export { load, LoadError, type Manifest } from './internal/loader.js';
export { Program, parseNdjson, referencesOf } from './internal/program.js';
export {
  PassManager,
  PipelineError,
  type NormalizationManifest,
  type NormalizeResult,
  type PassRecord,
} from './internal/normalize/pass_manager.js';
export {
  walk,
  walkNode,
  type Analysis,
  type Diagnostic,
  type Pass,
  type PassContext,
} from './internal/normalize/pass.js';
export { normalizationPipeline } from './internal/passes/pipeline.js';
export { PluginHost, PluginError } from './internal/plugins/host.js';
export { WidgetRegistry, type WidgetRef } from './internal/plugins/widget_registry.js';
export { N5LiftClosures } from './internal/passes/n5_lift_closures.js';
export { N6ConstFold } from './internal/passes/n6_const_fold.js';
export { N7FlattenWrappers } from './internal/passes/n7_flatten_wrappers.js';
export { N8ExtractSlots } from './internal/passes/n8_extract_slots.js';
export { N9KeyInference } from './internal/passes/n9_key_inference.js';
export { N10ThemeTokenize } from './internal/passes/n10_theme_tokenize.js';
export { N11PromoteCrossRouteState } from './internal/passes/n11_promote_cross_route_state.js';
export { navGraph, type NavGraph } from './internal/analysis/nav_graph.js';
