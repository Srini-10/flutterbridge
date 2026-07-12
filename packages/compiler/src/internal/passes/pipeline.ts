// The normalization pipeline: N1–N11, in the order Spec §3.3 fixes.
//
//   N1  desugar-cascades
//   N2  desugar-collection-ctrl   ── ui.Cond      ┐
//   N3  expand-builders           ── ui.List      ├─ verification passes (M2-T6 ruling)
//   N4  normalize-async-ui        ── ui.Async     ┘
//   N5  lift-closures             ── named sig.Action        ─┐
//   N6  const-fold                                            │
//   N7  flatten-wrappers                                      │
//   N8  extract-slots                                         │
//   N9  key-inference                                         │
//   N10 theme-tokenize            ── derived Material roles   │
//   N11 promote-cross-route-state ── app.Store{origin:promoted} ←┘ requires N5, nav-graph
//
// The order is the specification's, and it is not configurable. The *numbering* is permanent: a pass
// that becomes redundant is not deleted, because deleting it would make the pipeline's shape depend on
// which frontend fed it — and a Flutter frontend, a SwiftUI frontend and a React frontend must all be
// normalized by the same pipeline or the IR is not universal.

import { N1DesugarCascades } from './n1_desugar_cascades.js';
import { N2DesugarCollectionCtrl } from './n2_desugar_collection_ctrl.js';
import { N3ExpandBuilders } from './n3_expand_builders.js';
import { N4NormalizeAsyncUi } from './n4_normalize_async_ui.js';
import { N5LiftClosures } from './n5_lift_closures.js';
import { N6ConstFold } from './n6_const_fold.js';
import { N7FlattenWrappers } from './n7_flatten_wrappers.js';
import { N8ExtractSlots } from './n8_extract_slots.js';
import { N9KeyInference } from './n9_key_inference.js';
import { N10ThemeTokenize } from './n10_theme_tokenize.js';
import { N11PromoteCrossRouteState } from './n11_promote_cross_route_state.js';
import type { Pass } from '../normalize/pass.js';

/** The eleven passes, in specification order. */
export function normalizationPipeline(): readonly Pass[] {
  return [
    new N1DesugarCascades(),
    new N2DesugarCollectionCtrl(),
    new N3ExpandBuilders(),
    new N4NormalizeAsyncUi(),
    new N5LiftClosures(),
    new N6ConstFold(),
    new N7FlattenWrappers(),
    new N8ExtractSlots(),
    new N9KeyInference(),
    new N10ThemeTokenize(),
    new N11PromoteCrossRouteState(),
  ];
}
