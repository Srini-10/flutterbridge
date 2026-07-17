// @bridge/runtime-react — Runtime compatibility kit: theme, nav and state engines.
//
// ## What this package is
//
// The execution environment generated applications target (ADR-6). Generators emit code *against* it; they
// do not inline its behaviour. A kit upgrade fixes every converted application without regenerating any of
// them, and generated code stays small enough to review — which is what makes the override workflow viable.
//
// ## What it consumes
//
// **Descriptors, not UIR** (ADR-19). Structure — a store's shape, a token set, a route table — is plain data
// the generator emits. Behaviour — action bodies, derivations, effects — is real TypeScript closures the
// generator lowers. The kit never parses `logic.*`, because interpreting it would mean shipping Dart's
// evaluation semantics to the browser and re-implementing them in every future kit.
//
// It follows that everything here is hand-writable, and M3-A's tests hand-write all of it: the kit was built
// and validated before its generator exists, which was the point of building it first.
//
// ## Dependencies
//
// None from the workspace. `.dependency-cruiser.cjs` permits `@bridge/uir` ("types (tokens) and nothing
// else"); ADR-19 §"Why not even uir" explains why the kit declines it — `packages/uir` opens with a
// top-level `import { createHash } from 'node:crypto'`, and ADR-6 requires kits to version independently of
// the compiler's schema hash. React is a peer, pinned to the major Next 15.5.x carries (ADR-16).
//
// ## The layers, bottom-up
//
// 1. `internal/state/graph.ts` — the signal graph, under ADR-20's semantics. Zero dependencies, no React.
// 2. `internal/state/store.ts` — `app.Store`, scoped per ADR-15.
// 3. `internal/theme/` — token resolution and the composition half of ADR-13.
// 4. `internal/nav/` — routing state, under Spec v2.4 §A17.
// 5. `internal/react/` — the state facade (ADR-4). The only React in the package.
// 6. `internal/widgets/` — seven widgets on flexbox, and ADR-6's own example among them.
//
// BRIDGE-STUB(M3): Flutter's constraint model (Blueprint §3 M2-T12) — intrinsic sizing, and the unbounded
// main axis where Flutter throws and `internal/widgets/` degrades to shrink-wrap instead (flex.ts documents
// each divergence at the prop that causes it). The widgets here map props to style; a component sees its
// props and cannot see whether its ancestor is bounded, so solving that is a layer rather than a patch, and
// a kit that guessed would be wrong silently — the failure ADR-12 exists to catch.
// BRIDGE-STUB(M3): every widget outside `internal/widgets/`'s seven — the catalog lists ~50 — and the
// Material *appearance* of the one that has any: ElevatedButton's container, elevation and state layers are
// roles the theme resolves (INV-20, ADR-13) at opacities that are framework metadata, and ADR-18 puts those
// in catalog/ or nowhere. `internal/theme/color.ts` already composes them and takes the opacities as
// arguments, waiting on the catalog to carry them.
// BRIDGE-STUB(M3): the /layout, /theme, /nav, /state sub-path entrypoints. Everything is reachable from
// this barrel; the sub-paths are a packaging decision, not a missing capability.
// BRIDGE-STUB(M3): the next/navigation shim over the router (ADR-16), deferred to the M3-T6 Next version
// freeze rather than pinning a Next surface before the decision that sequences it.
// BRIDGE-STUB(M5): the animation engine, post-MVP per this package's description and Spec v2.0 §5.

// ── The signal graph (ADR-4, ADR-20) ──────────────────────────────────────────────────────────────
export {
  batch,
  derived,
  effect,
  signal,
  subscribe,
  untracked,
  type Dispose,
  type ReadableSignal,
  type WritableSignal,
} from './internal/state/graph.js';

// ── Stores (ADR-4, scoped per ADR-15) ─────────────────────────────────────────────────────────────
export {
  defineStore,
  instantiateStore,
  type StoreContext,
  type StoreDefinition,
  type StoreInstance,
  type StoreOptions,
} from './internal/state/store.js';

// ── Theme (ADR-13) ────────────────────────────────────────────────────────────────────────────────
export {
  createTheme,
  type Brightness,
  type ThemeDescriptor,
  type ThemeInstance,
  type ThemeOptions,
  type TokenDescriptor,
  type TokenGroup,
} from './internal/theme/theme.js';

export {
  alphaBlend,
  elevationOverlay,
  formatColor,
  parseColor,
  stateLayer,
  withOpacity,
  type Rgba,
} from './internal/theme/color.js';

// ── Navigation (Spec v2.4 §A17) ───────────────────────────────────────────────────────────────────
export {
  createRouter,
  type Destination,
  type RouteDescriptor,
  type RouteEntry,
  type RouteParams,
  type RouterDescriptor,
  type RouterInstance,
} from './internal/nav/router.js';

// ── The state facade (ADR-4) ──────────────────────────────────────────────────────────────────────
export { useDerived, useSignal, useSignalEffect } from './internal/react/hooks.js';

export {
  RouterProvider,
  StoreProvider,
  ThemeProvider,
  useRouter,
  useStore,
  useTheme,
  type RouterProviderProps,
  type StoreProviderProps,
  type ThemeProviderProps,
} from './internal/react/context.js';

export { useMountEffect, useUnmountEffect, useUpdateEffect } from './internal/react/lifecycle.js';

// ── Widgets (ADR-6) ───────────────────────────────────────────────────────────────────────────────
//
// `Row(mainAxisAlignment: spaceBetween)` becomes `<Row mainAxisAlignment="spaceBetween">` imported from
// here, and not a bespoke flexbox div at every call site. That is ADR-6's opening sentence, and these are
// it: the alignment tables live in one file, so a kit release fixes every converted application.
// One name, both meanings: `EdgeInsets` is the inset type *and* the named constructors that build it, which
// is the shape Dart has and the shape the emitted `EdgeInsets.all(16)` needs.
export { EdgeInsets } from './internal/widgets/edge_insets.js';

export {
  Column,
  Row,
  type ColumnProps,
  type CrossAxisAlignment,
  type MainAxisAlignment,
  type MainAxisSize,
  type RowProps,
} from './internal/widgets/flex.js';

export {
  Center,
  Padding,
  SizedBox,
  type CenterProps,
  type PaddingProps,
  type SizedBoxProps,
} from './internal/widgets/basic.js';

export { Text, type TextProps } from './internal/widgets/text.js';

export { ElevatedButton, type ElevatedButtonProps } from './internal/widgets/button.js';

// ── Diagnostics (ADR-20) ──────────────────────────────────────────────────────────────────────────
export { RuntimeDiagnosticCode, RuntimeError } from './internal/diagnostics/codes.js';
