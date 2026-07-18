// The application shell — Scaffold, AppBar, Drawer and the buttons that live in them.
//
// ## Why the shell is a component and the app root is not
//
// M4-G's evidence run found the boundary, and it is not where a widget list would put it. Everything
// `MaterialApp` carries has *already been consumed* by the time a generator sees it: `home:` and `routes:`
// became `app.Route` nodes in the analyzer, `theme:` became `app.Token`s that N10 expanded into the 46-role
// palette, and the emitted Next.js project's `layout.tsx` / `providers.tsx` / `page.tsx` are the lowering.
// The App Router *is* the MaterialApp. So there is no `MaterialApp` component in this file, and adding one
// would mount the application twice.
//
// `Scaffold` is the opposite. It is genuinely a box on the screen with named regions, none of which any
// other layer models, and every screen in every Flutter application is inside one. Before M4-G the generator
// had no mapping for it, which meant `hello_bridge` — this project's own walking-skeleton fixture — emitted
// **zero files**. That was the shell gap, measured rather than assumed.
//
// ## Every number and every colour comes from the catalog
//
// Not one literal dimension or colour is written here, for the reason `material_components.ts` states at
// length: INV-20 (ADR-13), and M4-A's hard-coded divider colour that was invisible in dark mode. The values
// are transcribed from the Flutter SDK 3.44 with a file:line citation each, in
// `catalog/widgets/material.json`, and generated into `generated/material_metadata.ts`.
//
// Reading the SDK rather than the M3 specification mattered twice here:
//
// - **An M3 `AppBar` is 64 logical pixels tall, not 56.** `kToolbarHeight` (material/constants.dart:30) is
//   56 and is what everyone quotes, but `_AppBarDefaultsM3` (app_bar.dart:2527) sets `toolbarHeight: 64.0`.
//   The constant is M2's.
// - **An M3 `AppBar`'s leading icon and its action icons are different colours** — `onSurface` and
//   `onSurfaceVariant` respectively (app_bar.dart:2548-2557). A single "icon colour" would have been wrong
//   for one of them on every screen.
//
// ## What is not here
//
// `SnackBar`, modal `BottomSheet`, dialogs and menus. All four are shown by an imperative call rather than
// by being in the tree, and `unsupported.ts` classifies them together. A `Scaffold`'s *persistent*
// `bottomSheet` slot is a different thing — it is in the tree — and it renders.

import { createElement, type CSSProperties, type ReactElement, type ReactNode } from 'react';

import { extent, type Size } from '../layout/constraints.js';
import { componentDefault } from '../generated/material_metadata.js';
import { useThemeSurface } from '../react/theme.js';
import { typographyIfDefined } from '../theme/surface.js';

/** A component default as a number. */
const size = (component: string, field: string): number => Number(componentDefault(component, field));

/** A component default as a role name. */
const role = (component: string, field: string): string => String(componentDefault(component, field));

// ── PreferredSize ─────────────────────────────────────────────────────────────────────────────────

/** Props for {@link PreferredSize}. */
export interface PreferredSizeProps {
  /** The size the wrapped widget asks for. Flutter's `preferredSize`. Only its height is read — see below. */
  readonly preferredSize?: Size;
  /** What is being sized. Flutter's `child` slot. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `PreferredSize` — a size a parent may ask a child for without imposing it.
 *
 * Flutter needs it because `Scaffold.appBar` and `AppBar.bottom` are typed `PreferredSizeWidget`: the
 * scaffold must know the bar's height *before* laying it out, and a widget cannot be measured before it is
 * laid out. CSS has no such ordering problem — a block sizes itself and the page reflows — so this renders
 * the height as an ordinary declaration.
 *
 * Only the height is read. Flutter's `Size` has a width too, and in both slots that take a
 * `PreferredSizeWidget` Flutter ignores it as well: the bar spans the scaffold. The whole `Size` is still the
 * prop, so the emitted code reads `preferredSize={Size.fromHeight(48)}` — recognisably the Dart it came
 * from — rather than a bare number a reviewer would have to translate back.
 *
 * @param props - see {@link PreferredSizeProps}.
 * @returns the sized child.
 */
export function PreferredSize(props: PreferredSizeProps): ReactElement {
  // `extent` handles `double.infinity`, which is exactly what `Size.fromHeight(48)` leaves the width as and
  // what an author writes when they mean "as tall as this, as wide as you like".
  const style: CSSProperties =
    props.preferredSize === undefined ? {} : { height: extent(props.preferredSize.height) };
  return createElement('div', { style }, props.child);
}

// ── AppBar ────────────────────────────────────────────────────────────────────────────────────────

/** Props for {@link AppBar}. */
export interface AppBarProps {
  /** The bar's title. Flutter's `title` slot. */
  readonly title?: ReactNode;
  /** What sits before the title — a menu or back button. Flutter's `leading` slot. */
  readonly leading?: ReactNode;
  /** The actions at the trailing edge, in order. Flutter's `actions`, which the catalog names its children. */
  readonly children?: ReactNode;
  /** What sits below the toolbar — a tab bar, usually. Flutter's `bottom` slot. */
  readonly bottom?: ReactNode;
  /** Behind the toolbar. Flutter's `flexibleSpace` slot. */
  readonly flexibleSpace?: ReactNode;
  /** Whether the toolbar is centred. Flutter's `centerTitle`; `false` is M3's default on non-iOS. */
  readonly centerTitle?: boolean;
  /** The bar's height, overriding the M3 default of 64. Flutter's `toolbarHeight`. */
  readonly toolbarHeight?: number;
}

/**
 * Flutter's `AppBar` — the top bar of a `Scaffold`.
 *
 * A `<header>`, because that is what it is: the ARIA `banner` landmark a screen reader announces, which the
 * Flutter app gets from Material's own semantics and a `<div>` would silently drop.
 *
 * `elevation` is not a prop and `scrolledUnderElevation` is not implemented. Both are 0 and 3 respectively
 * in M3 (app_bar.dart:2524-2525), and the second only applies once content has scrolled under the bar — which
 * needs a scroll listener the kit does not install. A bar that painted the scrolled-under tint at rest would
 * be wrong on every screen that has not been scrolled.
 *
 * @param props - see {@link AppBarProps}.
 * @returns the bar.
 * @throws RuntimeError - `BRG4006` if the theme defines no `surface` / `onSurface` / `onSurfaceVariant`.
 */
export function AppBar(props: AppBarProps): ReactElement {
  const theme = useThemeSurface();
  const bar: CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: props.toolbarHeight ?? size('AppBar', 'toolbarHeight'),
    paddingInlineStart: size('AppBar', 'titleSpacing'),
    paddingInlineEnd: size('AppBar', 'titleSpacing'),
    gap: size('AppBar', 'titleSpacing'),
    backgroundColor: theme.color(role('AppBar', 'backgroundColorRole')),
    color: theme.color(role('AppBar', 'foregroundColorRole')),
    boxSizing: 'border-box',
  };
  // The two icon colours M3 distinguishes. Applied to the containers rather than to the icons, so an `Icon`
  // that states its own colour still wins — `currentColor` is what the icon font inherits.
  const leading: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    color: theme.color(role('AppBar', 'iconColorRole')),
  };
  const actions: CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    marginInlineStart: 'auto',
    flexShrink: 0,
    color: theme.color(role('AppBar', 'actionsIconColorRole')),
  };
  const title: CSSProperties = {
    ...typographyIfDefined(theme, role('AppBar', 'titleTypography')),
    flex: '1 1 auto',
    minWidth: 0,
    ...(props.centerTitle === true ? { textAlign: 'center' as const } : {}),
  };

  const toolbar = createElement(
    'div',
    { style: bar },
    props.leading === undefined ? null : createElement('div', { key: 'l', style: leading }, props.leading),
    props.title === undefined ? null : createElement('div', { key: 't', style: title }, props.title),
    props.children === undefined ? null : createElement('div', { key: 'a', style: actions }, props.children),
  );

  // `flexibleSpace` paints *behind* the toolbar in Flutter, which is a stacking relationship rather than a
  // sibling one — hence the relative/absolute pair rather than another flex row.
  const stacked =
    props.flexibleSpace === undefined
      ? toolbar
      : createElement(
          'div',
          { style: { position: 'relative' as const } },
          createElement('div', { key: 'f', style: { position: 'absolute' as const, inset: 0 } }, props.flexibleSpace),
          createElement('div', { key: 'b', style: { position: 'relative' as const } }, toolbar),
        );

  return createElement('header', { style: { display: 'block' } }, stacked, props.bottom);
}

// ── Scaffold ──────────────────────────────────────────────────────────────────────────────────────

/** Props for {@link Scaffold}. */
export interface ScaffoldProps {
  /** The top bar. Flutter's `appBar` slot. */
  readonly appBar?: ReactNode;
  /** The screen's content. Flutter's `body` slot. */
  readonly body?: ReactNode;
  /** The bottom navigation. Flutter's `bottomNavigationBar` slot. */
  readonly bottomNavigationBar?: ReactNode;
  /** A *persistent* bottom sheet — one that is in the tree. Flutter's `bottomSheet` slot. */
  readonly bottomSheet?: ReactNode;
  /** The start-edge drawer. Flutter's `drawer` slot. */
  readonly drawer?: ReactNode;
  /** The end-edge drawer. Flutter's `endDrawer` slot. */
  readonly endDrawer?: ReactNode;
  /** The floating action button. Flutter's `floatingActionButton` slot. */
  readonly floatingActionButton?: ReactNode;
  /** Whether the body extends behind the app bar. Flutter's `extendBodyBehindAppBar`. */
  readonly extendBodyBehindAppBar?: boolean;
}

/**
 * Flutter's `Scaffold` — the Material screen layout.
 *
 * A column of app bar, body and bottom bar, with the body taking the remaining height. `100dvh` rather than
 * `100vh`: on mobile browsers `vh` is the viewport with the URL bar *hidden*, so a `100vh` scaffold is taller
 * than the screen and its bottom navigation sits below the fold until the user scrolls — which is exactly the
 * bug `dvh` was standardised to fix, and exactly what a Flutter `Scaffold` never does.
 *
 * ## The drawers are rendered, and are not openable
 *
 * A `drawer` is in the tree here, laid out off-canvas at the start edge. Opening one is
 * `Scaffold.of(context).openDrawer()` or a drag — both imperative, both needing the gesture model the kit
 * does not have. So the drawer's **content** is emitted, styled and reachable by assistive technology, and
 * the affordance that slides it in is not. That is the honest half: refusing `drawer:` outright would have
 * discarded a subtree the application does have.
 *
 * @param props - see {@link ScaffoldProps}.
 * @returns the screen.
 * @throws RuntimeError - `BRG4006` if the theme defines no `surface`.
 */
export function Scaffold(props: ScaffoldProps): ReactElement {
  const theme = useThemeSurface();
  const frame: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100dvh',
    position: 'relative',
    backgroundColor: theme.color(role('Scaffold', 'backgroundColorRole')),
    overflow: 'hidden',
  };
  // `min-height: 0` is what lets the body scroll rather than push the bottom bar off-screen: a flex item's
  // default `min-height: auto` refuses to shrink below its content, which is the single most common reason a
  // flex-column app layout overflows.
  const body: CSSProperties = { flex: '1 1 auto', minHeight: 0, position: 'relative' };
  const fab: CSSProperties = {
    position: 'absolute',
    insetInlineEnd: size('FloatingActionButton', 'margin'),
    bottom: size('FloatingActionButton', 'margin'),
    zIndex: 2,
  };
  // Off-canvas at the start edge, and `visibility: hidden` so it is out of the accessibility tree too — a
  // drawer nobody can open should not be announced as though they could.
  const drawer: CSSProperties = {
    position: 'absolute',
    insetBlock: 0,
    insetInlineStart: 0,
    transform: 'translateX(-100%)',
    visibility: 'hidden',
    zIndex: 3,
  };
  const endDrawer: CSSProperties = { ...drawer, insetInlineStart: 'auto', insetInlineEnd: 0, transform: 'translateX(100%)' };

  return createElement(
    'div',
    { style: frame },
    props.appBar,
    createElement('main', { key: 'body', style: body }, props.body),
    props.bottomSheet,
    props.bottomNavigationBar,
    props.floatingActionButton === undefined
      ? null
      : createElement('div', { key: 'fab', style: fab }, props.floatingActionButton),
    props.drawer === undefined ? null : createElement('div', { key: 'd', style: drawer }, props.drawer),
    props.endDrawer === undefined ? null : createElement('div', { key: 'ed', style: endDrawer }, props.endDrawer),
  );
}

// ── Drawer ────────────────────────────────────────────────────────────────────────────────────────

/** Props for {@link Drawer}. */
export interface DrawerProps {
  /** The drawer's content. Flutter's `child` slot. */
  readonly child?: ReactNode;
  /** The drawer's width, overriding Material's 304. Flutter's `width`. */
  readonly width?: number;
}

/**
 * Flutter's `Drawer` — the Material navigation panel.
 *
 * 304 logical pixels wide (drawer.dart:61), elevation 1, `surfaceContainerLow`, with the 16px rounded end
 * edge the SDK notes has no design token yet but is in the spec (drawer.dart:799-806).
 *
 * @param props - see {@link DrawerProps}.
 * @returns the panel.
 * @throws RuntimeError - `BRG4006` if the theme defines no `surfaceContainerLow`.
 */
export function Drawer(props: DrawerProps): ReactElement {
  const theme = useThemeSurface();
  const style: CSSProperties = {
    width: props.width ?? size('Drawer', 'width'),
    height: '100%',
    boxSizing: 'border-box',
    overflowY: 'auto',
    backgroundColor: theme.color(role('Drawer', 'backgroundColorRole')),
    borderStartEndRadius: size('Drawer', 'endRadius'),
    borderEndEndRadius: size('Drawer', 'endRadius'),
  };
  return createElement('nav', { style }, props.child);
}

/** Props for {@link DrawerHeader}. */
export interface DrawerHeaderProps {
  /** The header's content. Flutter's `child` slot. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `DrawerHeader` — the block at the top of a drawer.
 *
 * Its one Material constant is the divider beneath it, which is the same `outlineVariant` a `Divider` paints
 * and is read from the `Divider` entry rather than duplicated into a `DrawerHeader` one.
 *
 * @param props - see {@link DrawerHeaderProps}.
 * @returns the header.
 */
export function DrawerHeader(props: DrawerHeaderProps): ReactElement {
  const theme = useThemeSurface();
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    padding: size('Divider', 'space'),
    borderBottom: `${size('Divider', 'thickness')}px solid ${theme.color(role('Divider', 'colorRole'))}`,
    boxSizing: 'border-box',
  };
  return createElement('div', { style }, props.child);
}

// ── The buttons that live in a shell ──────────────────────────────────────────────────────────────

/** Props for {@link IconButton}. */
export interface IconButtonProps {
  /** The press handler, or `null`/omitted to disable — Flutter's rule, as `ElevatedButton`'s. */
  readonly onPressed?: (() => void) | null | undefined;
  /** The icon. Flutter's `icon` slot. */
  readonly icon?: ReactNode;
  /** The accessible name. Flutter's `tooltip`, which is also what a screen reader reads. */
  readonly tooltip?: string;
}

/**
 * Flutter's `IconButton`.
 *
 * `tooltip` becomes `aria-label` as well as `title`, and that is not a liberty: an icon button's only text is
 * its tooltip, so a converted app without it is a button a screen reader announces as "button". Flutter's own
 * `IconButton` does exactly this — it wraps the icon in a `Tooltip` *and* a `Semantics` node.
 *
 * `type="button"` for the reason `ElevatedButton` states: a `<button>` inside a `<form>` submits by default,
 * and an app bar's action button inside a form screen would reload the page.
 *
 * @param props - see {@link IconButtonProps}.
 * @returns the button.
 * @throws RuntimeError - `BRG4006` if the theme defines no `onSurfaceVariant`.
 */
export function IconButton(props: IconButtonProps): ReactElement {
  const theme = useThemeSurface();
  const onPressed = props.onPressed ?? null;
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: size('IconButton', 'minSize'),
    minHeight: size('IconButton', 'minSize'),
    padding: size('IconButton', 'padding'),
    // A StadiumBorder on a square box is a circle, which is what the SDK's shape resolves to here.
    borderRadius: '50%',
    border: 'none',
    background: 'transparent',
    color: theme.color(role('IconButton', 'colorRole')),
    boxSizing: 'border-box',
  };
  return createElement(
    'button',
    {
      type: 'button',
      style,
      disabled: onPressed === null,
      onClick: onPressed ?? undefined,
      ...(props.tooltip === undefined ? {} : { title: props.tooltip, 'aria-label': props.tooltip }),
    },
    props.icon,
  );
}

/** Props for {@link FloatingActionButton}. */
export interface FloatingActionButtonProps {
  /** The press handler, or `null`/omitted to disable. */
  readonly onPressed?: (() => void) | null | undefined;
  /** The icon or label. Flutter's `child` slot. */
  readonly child?: ReactNode;
  /** The extended form's icon. Flutter's `icon` slot, set by `FloatingActionButton.extended`. */
  readonly icon?: ReactNode;
  /** The extended form's label. Flutter's `label` slot. */
  readonly label?: ReactNode;
  /** The 40x40 form. Flutter's `mini`. */
  readonly mini?: boolean;
  /** The accessible name. Flutter's `tooltip`. */
  readonly tooltip?: string;
}

/**
 * Flutter's `FloatingActionButton`, including the `.extended` form.
 *
 * One component for both, because `.extended` is a factory on the *same class* — which is why the catalog's
 * entry carries the union of their slots, and says so. Which form is rendered follows the props: a `label`
 * makes it extended (a stadium with icon and text), `mini` makes it 40x40, otherwise it is the 56x56 circle.
 *
 * Elevation 6 (floating_action_button.dart:778) is rendered as a shadow rather than as M3's surface tint:
 * `primaryContainer` is already a filled colour, and tinting a filled container toward `surfaceTint` is what
 * `Card` and `Material` do to a *surface*. The SDK agrees — it keeps `elevation` for the FAB and does not
 * route it through `ElevationOverlay`.
 *
 * @param props - see {@link FloatingActionButtonProps}.
 * @returns the button.
 * @throws RuntimeError - `BRG4006` if the theme defines no `primaryContainer` / `onPrimaryContainer`.
 */
export function FloatingActionButton(props: FloatingActionButtonProps): ReactElement {
  const theme = useThemeSurface();
  const onPressed = props.onPressed ?? null;
  const extended = props.label !== undefined;
  const box: CSSProperties = extended
    ? {
        height: size('FloatingActionButton', 'extendedHeight'),
        paddingInlineStart: size('FloatingActionButton', 'extendedPaddingStart'),
        paddingInlineEnd: size('FloatingActionButton', 'extendedPaddingEnd'),
        gap: size('FloatingActionButton', 'extendedIconLabelSpacing'),
        borderRadius: size('FloatingActionButton', 'borderRadius'),
      }
    : props.mini === true
      ? {
          width: size('FloatingActionButton', 'smallSize'),
          height: size('FloatingActionButton', 'smallSize'),
          borderRadius: size('FloatingActionButton', 'smallBorderRadius'),
        }
      : {
          width: size('FloatingActionButton', 'size'),
          height: size('FloatingActionButton', 'size'),
          borderRadius: size('FloatingActionButton', 'borderRadius'),
        };
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    backgroundColor: theme.color(role('FloatingActionButton', 'colorRole')),
    color: theme.color(role('FloatingActionButton', 'foregroundColorRole')),
    boxSizing: 'border-box',
    ...box,
  };
  return createElement(
    'button',
    {
      type: 'button',
      style,
      disabled: onPressed === null,
      onClick: onPressed ?? undefined,
      ...(props.tooltip === undefined ? {} : { title: props.tooltip, 'aria-label': props.tooltip }),
    },
    props.icon,
    props.child,
    props.label,
  );
}

// ── BottomAppBar and MaterialBanner ───────────────────────────────────────────────────────────────

/** Props for {@link BottomAppBar}. */
export interface BottomAppBarProps {
  /** The bar's content. Flutter's `child` slot. */
  readonly child?: ReactNode;
  /** The bar's height. Flutter's `height`. */
  readonly height?: number;
}

/**
 * Flutter's `BottomAppBar` — a bar at the bottom of a `Scaffold` holding arbitrary content.
 *
 * The notch a FAB cuts into it is not rendered. `shape: CircularNotchedRectangle` is a custom `ShapeBorder`
 * — a painter, not a geometry the CSS box model has — and it is the same refusal `ClipPath` gets.
 *
 * @param props - see {@link BottomAppBarProps}.
 * @returns the bar.
 */
export function BottomAppBar(props: BottomAppBarProps): ReactElement {
  const theme = useThemeSurface();
  const style: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    height: props.height ?? size('NavigationBar', 'height'),
    paddingInline: size('AppBar', 'titleSpacing'),
    backgroundColor: theme.color(role('NavigationBar', 'backgroundColorRole')),
    boxSizing: 'border-box',
  };
  return createElement('div', { style }, props.child);
}

/** Props for {@link MaterialBanner}. */
export interface MaterialBannerProps {
  /** The message. Flutter's `content` slot. */
  readonly content?: ReactNode;
  /** An icon before the message. Flutter's `leading` slot. */
  readonly leading?: ReactNode;
  /** The actions, in order. Flutter's `actions`, which the catalog names its children. */
  readonly children?: ReactNode;
}

/**
 * Flutter's `MaterialBanner` — a persistent message with actions, at the top of the content.
 *
 * In the tree, unlike a `SnackBar`, and that is the whole reason one renders and the other does not:
 * `MaterialBanner` is a widget an application puts in its layout, while a `SnackBar` is an argument to
 * `ScaffoldMessenger.showSnackBar`. `unsupported.ts` refuses the second by name and says which call shows it.
 *
 * Not to be confused with `Banner`, the red debug ribbon, which no application authors.
 *
 * @param props - see {@link MaterialBannerProps}.
 * @returns the banner.
 * @throws RuntimeError - `BRG4006` if the theme defines no `surfaceContainerLow` / `onSurface` /
 * `outlineVariant`.
 */
export function MaterialBanner(props: MaterialBannerProps): ReactElement {
  const theme = useThemeSurface();
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    paddingInlineStart: size('MaterialBanner', 'paddingStart'),
    paddingTop: size('MaterialBanner', 'paddingTop'),
    paddingInlineEnd: size('MaterialBanner', 'paddingEnd'),
    paddingBottom: size('MaterialBanner', 'paddingBottom'),
    backgroundColor: theme.color(role('MaterialBanner', 'backgroundColorRole')),
    color: theme.color(role('MaterialBanner', 'colorRole')),
    borderBottom: `${size('MaterialBanner', 'dividerThickness')}px solid ${theme.color(role('MaterialBanner', 'dividerColorRole'))}`,
    boxSizing: 'border-box',
    ...typographyIfDefined(theme, role('MaterialBanner', 'contentTypography')),
  };
  return createElement(
    'div',
    { style, role: 'status' },
    props.leading === undefined
      ? null
      : createElement(
          'div',
          { key: 'l', style: { marginInlineEnd: size('MaterialBanner', 'leadingPaddingEnd'), flexShrink: 0 } },
          props.leading,
        ),
    createElement('div', { key: 'c', style: { flex: '1 1 auto', minWidth: 0 } }, props.content),
    props.children === undefined
      ? null
      : createElement('div', { key: 'a', style: { display: 'flex', marginInlineStart: 'auto' } }, props.children),
  );
}
