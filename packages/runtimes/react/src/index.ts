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
// 5. `internal/react/` — the state facade (ADR-4) and the theme surface hook. The only React in the package.
// 6. `internal/layout/` — Flutter's alignment vocabularies and box protocol, mapped to CSS once (M4-B).
// 7. `internal/widgets/` — the components, built on 3 and 6 and holding no CSS keywords of their own.
//
// BRIDGE-STUB(M4): the *measuring* half of Flutter's constraint model (Blueprint §3 M2-T12) — intrinsic
// sizing, `FittedBox` over arbitrary content, `Align`'s `widthFactor`/`heightFactor`, and the unbounded main
// axis where Flutter throws and a `MainAxisSize.max` flex degrades to shrink-wrap instead. `internal/layout/
// constraints.ts` maps everything CSS can express from props alone and its header names each divergence at
// the helper that causes it; what is left needs a child's *measured* size, which is a layout read rather than
// a style. A component sees its props and cannot see whether its ancestor is bounded, so solving that is a
// layer rather than a patch, and a kit that guessed would be wrong silently — the failure ADR-12 exists to
// catch.
// BRIDGE-STUB(M4): the Material *appearance* of the interactive components — ElevatedButton's container and
// its state layers. Everything they need now exists: colours resolve through `internal/theme/surface.ts` and
// the opacities come from `internal/generated/material_metadata.ts`, which the catalog generates from values
// transcribed out of the Flutter SDK. What is missing is the wiring, not the architecture.
// BRIDGE-STUB(M4): shadows. M3 renders elevation as a surface *tint*, which `ThemeSurface.elevation`
// composes exactly; Flutter also casts a shadow, and its penumbra needs `shadow`-group tokens no compiler
// pass emits. A guessed shadow differs from the reference in a way a pixel diff reports and nobody can
// explain, so `Card` paints the tint and no shadow.
// BRIDGE-STUB(M4): every widget outside `internal/widgets/` — the catalog lists 61.
// BRIDGE-STUB(M4): fonts. `Icon` renders a codepoint in the family its `IconData` names, and the font file
// itself is the application's to ship: the generator records it as a required font in the asset manifest and
// reports BRG3013 when the project declares none. Nothing in a kit can supply a font binary.
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
  cssColor,
  elevationOverlay,
  formatColor,
  parseColor,
  stateLayer,
  withOpacity,
  type Rgba,
} from './internal/theme/color.js';

// The theme-in-component surface: what a Material component is allowed to know about theming, and all of it.
// A component names a *role* and gets a CSS value; INV-20 holds by construction because there is no other way
// for a colour to reach a component.
export {
  createThemeSurface,
  type InteractionState,
  type ThemeSurface,
  type TypographyToken,
  typographyIfDefined,
} from './internal/theme/surface.js';

export { useThemeSurface } from './internal/react/theme.js';

// ── The layout model (M4-B) ───────────────────────────────────────────────────────────────────────
//
// Flutter's alignment vocabularies and its box protocol, each mapped to CSS exactly once. Widgets import
// from here rather than writing keywords, so `Row`, `Wrap`, `Align` and `Stack` cannot disagree about what
// `start` means, and `SizedBox` and `Container` cannot disagree about what `double.infinity` becomes.
export {
  Alignment,
  AlignmentDirectional,
  CrossAxisAlignment,
  Directionality,
  MainAxisAlignment,
  MainAxisSize,
  TextAlign,
  TextDirection,
  VerticalDirection,
  WrapAlignment,
  WrapCrossAlignment,
  alignItems,
  alignmentStyle,
  flexDirection,
  isRepresentableAlignment,
  justifyContent,
  mainAxisExtent,
  textAlign,
  wrapAlignItems,
  type AlignmentGeometry,
  type DirectionalityProps,
} from './internal/layout/alignment.js';

export {
  Border,
  BorderRadius,
  BorderSide,
  BoxDecoration,
  BoxShadow,
  BoxShape,
  Clip,
  LinearGradient,
  Offset,
  borderRadiusStyle,
  boxShapeStyle,
  clipStyle,
  decorationStyle,
  shadowStyle,
  type BorderRadiusGeometry,
  type BorderSideOptions,
  type BoxShadowOptions,
  type ColorToken,
  type LinearGradientOptions,
  type BoxDecorationOptions,
} from './internal/layout/decoration.js';

export {
  BoxConstraints,
  BoxFit,
  FILL,
  aspectRatioStyle,
  constraintStyle,
  edgeInsetsStyle,
  extent,
  fractionStyle,
  mergeStyles,
  objectFit,
  safeAreaStyle,
  sizeStyle,
  type BoxConstraintsOptions,
} from './internal/layout/constraints.js';

// M4-G. `intrinsicStyle` is the mapping that let `IntrinsicWidth`/`IntrinsicHeight` be implemented after
// M4-D refused them: CSS's `max-content` *is* Flutter's maximum intrinsic dimension, standardised twice.
export { intrinsicStyle, overflowBoxStyle } from './internal/layout/constraints.js';

// One name, both meanings, as `EdgeInsets` is: the size type *and* the constructors that build it, so the
// emitted `Size.fromHeight(48)` resolves.
export { Size } from './internal/layout/constraints.js';

// ── Assets (M4-C) ─────────────────────────────────────────────────────────────────────────────────
//
// Flutter names an image's bytes with an `ImageProvider`, and the two named constructors are sugar over one.
// `resolveImage` is a pure function of the provider and the generated manifest — no fetch, no cache, no
// `document` — which is what lets an `<img>` server-render to the markup it hydrates into.
export {
  AssetImage,
  EMPTY_ASSET_MANIFEST,
  ExactAssetImage,
  MemoryImage,
  NetworkImage,
  resolveImage,
  type AssetManifest,
  type ImageSource,
  type ResolvedImage,
} from './internal/assets/image_provider.js';

export { AssetProvider, useAssetManifest, type AssetProviderProps } from './internal/react/assets.js';

// Material's own constants, generated from the catalog (ADR-18). Exported so a host can read the same numbers
// the components do rather than restating them.
export {
  COMPONENT_DEFAULTS,
  DISABLED_OPACITY,
  ELEVATION_STOPS,
  ICON_DEFAULTS,
  STATE_LAYER_OPACITY,
  componentDefault,
  surfaceTintOpacity,
  type ElevationStop,
} from './internal/generated/material_metadata.js';

// ── Forms and input (M4-F) ────────────────────────────────────────────────────────────────────────
//
// A controller is a signal, a callback is a closure and disposal is an unmount effect — all three were
// already modelled before this milestone, which is why the input layer is components rather than machinery.
export {
  FocusNode,
  Form,
  InputDecoration,
  InputDecorator,
  TextCapitalization,
  TextEditingController,
  TextField,
  TextFormField,
  TextInputAction,
  TextInputType,
  controlStyle,
  type FormProps,
  type InputDecorationOptions,
  type InputDecoratorProps,
  type TextFieldProps,
  type TextFormFieldProps,
  ValueNotifier,
} from './internal/widgets/input.js';

export {
  Checkbox,
  Radio,
  Slider,
  Switch,
  type CheckboxProps,
  type RadioProps,
  type SliderProps,
  type SwitchProps,
} from './internal/widgets/selection.js';

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

// The consumer of that stack. Without it a `push` moved state nothing rendered — an application that
// compiled, ran, and did nothing visible when the button was pressed (M7-C).
export { RouterOutlet, type RouterOutletProps } from './internal/nav/outlet.js';

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
export { EdgeInsets } from './internal/layout/edge_insets.js';

export {
  Column,
  Expanded,
  Flexible,
  Row,
  Spacer,
  Wrap,
  type ColumnProps,
  type ExpandedProps,
  type FlexFit,
  type FlexibleProps,
  type RowProps,
  type SpacerProps,
  type WrapProps,
} from './internal/widgets/flex.js';

export {
  Positioned,
  Stack,
  type PositionedProps,
  type StackProps,
} from './internal/widgets/stack.js';

export {
  Align,
  AspectRatio,
  Center,
  ClipRRect,
  ClipRect,
  ColoredBox,
  ConstrainedBox,
  Container,
  DecoratedBox,
  FractionallySizedBox,
  IntrinsicHeight,
  IntrinsicWidth,
  Opacity,
  OverflowBox,
  Padding,
  SafeArea,
  SizedBox,
  type AlignProps,
  type AspectRatioProps,
  type CenterProps,
  type ClipRRectProps,
  type ClipRectProps,
  type ColoredBoxProps,
  type ConstrainedBoxProps,
  type ContainerProps,
  type DecoratedBoxProps,
  type FractionallySizedBoxProps,
  type IntrinsicHeightProps,
  type IntrinsicWidthProps,
  type OpacityProps,
  type OverflowBoxProps,
  type PaddingProps,
  type SafeAreaProps,
  type SizedBoxProps,
} from './internal/widgets/basic.js';

export {
  Icon,
  IconData,
  Image,
  type IconProps,
  type ImageProps,
} from './internal/widgets/image.js';

// ── Scrolling (M4-D) ──────────────────────────────────────────────────────────────────────────────
export {
  Axis,
  Flex,
  GridView,
  ListView,
  SingleChildScrollView,
  SliverGridDelegateWithFixedCrossAxisCount,
  type FlexProps,
  type GridViewProps,
  type ListViewProps,
  type SingleChildScrollViewProps,
  PageView,
  type PageViewProps,
} from './internal/widgets/scroll.js';

// ── Material components (M4-D) ────────────────────────────────────────────────────────────────────
//
// Every number these use comes from `internal/generated/material_metadata.ts`, which the catalog generates
// from values transcribed out of the Flutter SDK with a citation each.
export {
  Badge,
  Chip,
  CircleAvatar,
  CircularProgressIndicator,
  LinearProgressIndicator,
  ListTile,
  Tooltip,
  type BadgeProps,
  type ChipProps,
  type CircleAvatarProps,
  type CircularProgressIndicatorProps,
  type LinearProgressIndicatorProps,
  type ListTileProps,
  type TooltipProps,
} from './internal/widgets/material_components.js';

export {
  Card,
  Divider,
  Ink,
  Material,
  VerticalDivider,
  type CardProps,
  type DividerProps,
  type InkProps,
  type MaterialProps,
  type VerticalDividerProps,
} from './internal/widgets/material.js';

export {
  RichText,
  SelectableText,
  Text,
  TextSpan,
  type RichTextProps,
  type SelectableTextProps,
  type TextProps,
  type TextSpanOptions,
} from './internal/widgets/text.js';

export { ElevatedButton, type ElevatedButtonProps } from './internal/widgets/button.js';

// ── M4-I: the `gap` package ───────────────────────────────────────────────────────────────────────
//
// Not a framework widget. `Gap` is the most-used widget the compiler could not render — 115 uses in the M0
// corpus, more than `Container` — and it went unseen through six milestones because every triage list was a
// list of *Flutter* widgets. ADR-18's package-catalog path is what carries it.
export { Gap, MaxGap, type GapProps, type MaxGapProps } from './internal/widgets/gap.js';

// ── M4-I: expansion, tabs and the selectable chips ────────────────────────────────────────────────
//
// Each is a case where a native element already carries the semantics Flutter's widget carries — `<details>`
// owns disclosure, `role="tablist"` owns tab semantics, a button's pressed-ness is a prop — which is why
// they could be built while the gesture model still does not exist.
export {
  ActionChip,
  ChoiceChip,
  DefaultTabController,
  ExpansionTile,
  FilterChip,
  Tab,
  TabBar,
  TabBarView,
  type ActionChipProps,
  type ChoiceChipProps,
  type DefaultTabControllerProps,
  type ExpansionTileProps,
  type FilterChipProps,
  type TabBarProps,
  type TabBarViewProps,
  type TabProps,
} from './internal/widgets/selection_surfaces.js';

// ── M4-H: the implicit-animation family ───────────────────────────────────────────────────────────
//
// Deliberately *not* "the animation engine". Flutter's own `ImplicitlyAnimatedWidget` takes a target value
// and a duration and interpolates when the value changes — which is a CSS transition, with the browser as
// the ticker. The **explicit** family (`AnimationController`, `AnimatedBuilder`, `TweenAnimationBuilder`,
// the `*Transition` widgets) hands a value to Dart code every frame and is still deferred.
export {
  AnimatedAlign,
  AnimatedContainer,
  AnimatedOpacity,
  AnimatedPadding,
  Curve,
  Curves,
  Duration,
  transitionStyle,
  type AnimatedAlignProps,
  type AnimatedContainerProps,
  type AnimatedOpacityProps,
  type AnimatedPaddingProps,
  type DurationOptions,
} from './internal/widgets/animation.js';

// ── M4-G: the application shell ───────────────────────────────────────────────────────────────────
//
// There is deliberately no `MaterialApp`. Everything it carries has already been consumed by the time a
// generator runs — `home:`/`routes:` are `app.Route` nodes, `theme:` is the token set N10 expands — and the
// emitted App Router project's `layout.tsx`/`providers.tsx`/`page.tsx` *are* its lowering. A `MaterialApp`
// component would mount the application a second time.
export {
  AppBar,
  BottomAppBar,
  Drawer,
  DrawerHeader,
  FloatingActionButton,
  IconButton,
  MaterialBanner,
  PreferredSize,
  Scaffold,
  type AppBarProps,
  type BottomAppBarProps,
  type DrawerHeaderProps,
  type DrawerProps,
  type FloatingActionButtonProps,
  type IconButtonProps,
  type MaterialBannerProps,
  type PreferredSizeProps,
  type ScaffoldProps,
} from './internal/widgets/shell.js';

export {
  BottomNavigationBar,
  BottomNavigationBarItem,
  NavigationBar,
  NavigationDestination,
  NavigationDrawer,
  NavigationDrawerDestination,
  NavigationRail,
  NavigationRailDestination,
  type BottomNavigationBarItemProps,
  type BottomNavigationBarProps,
  type NavigationBarProps,
  type NavigationDestinationProps,
  type NavigationDrawerDestinationProps,
  type NavigationDrawerProps,
  type NavigationRailDestinationProps,
  type NavigationRailProps,
} from './internal/widgets/navigation.js';

// ── Diagnostics (ADR-20) ──────────────────────────────────────────────────────────────────────────
export { RuntimeDiagnosticCode, RuntimeError } from './internal/diagnostics/codes.js';
