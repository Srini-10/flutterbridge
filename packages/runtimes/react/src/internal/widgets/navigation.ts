// The navigation surfaces — NavigationBar, NavigationRail, NavigationDrawer, and M2's BottomNavigationBar.
//
// ## The catalog finding these are built on
//
// `NavigationRailDestination` and `BottomNavigationBarItem` are **not Flutter `Widget`s**. They are ordinary
// classes that happen to hold widgets, and before M4-G the analyzer put a whole `destinations:` list into
// `props` as an expression, where N8 reported `BRG2110` — a diagnostic whose message blames the frontend:
// *"The frontend must emit them as children."*
//
// The message was wrong about the owner. The analyzer asks the catalog for a widget's children property
// first and only falls back to inferring one from the argument's type; the fallback correctly declined,
// because the type genuinely is not a widget list. **The catalog simply had no entry for `NavigationRail`.**
// Adding one — `"childrenProp": "destinations"` — puts the items in the UI tree with no analyzer change at
// all, and the same two lines fix `BottomNavigationBar`. Evidence changed the design here: the planned work
// was a new "structural element" concept in the catalog, a new adapter predicate and a change to extraction's
// widget test, and none of it was needed.
//
// So `NavigationRailDestination` and `BottomNavigationBarItem` are components in this file, and they render
// as `ui.Element`s like any other node.
//
// ## Selection is a value, not a state layer
//
// Every component here takes `selectedIndex` and paints the selected destination differently. It does *not*
// take a hover or pressed treatment, because those are the gesture model — `unsupported.ts` owns that gap.
// What is here is the part that is a pure function of props, which is the part that is honest to render.
//
// `onDestinationSelected` is wired: it is an ordinary callback prop, and M4-F proved the whole callback path
// end to end. Clicking a destination calls it. What does not happen is the ripple.

import {
  Children,
  cloneElement,
  createElement,
  isValidElement,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';

import { componentDefault } from '../generated/material_metadata.js';
import { useThemeSurface } from '../react/theme.js';
import { typographyIfDefined } from '../theme/surface.js';

const size = (component: string, field: string): number => Number(componentDefault(component, field));
const role = (component: string, field: string): string => String(componentDefault(component, field));

/** The shape every destination shares: what it renders, and how it behaves when selected. */
interface DestinationProps {
  /** The icon. Flutter's `icon` slot. */
  readonly icon?: ReactNode;
  /** The icon to show when selected, if it differs. Flutter's `selectedIcon` / `activeIcon` slot. */
  readonly selectedIcon?: ReactNode;
}

// ── NavigationBar (M3) ────────────────────────────────────────────────────────────────────────────

/** Props for {@link NavigationDestination}. */
export interface NavigationDestinationProps extends DestinationProps {
  /** The destination's text. Flutter's `label`, which is a `String` here — not a slot. */
  readonly label?: string;
  /**
   * Whether this destination is the selected one.
   *
   * Set by the parent {@link NavigationBar} from its `selectedIndex`, not by the generator: Flutter's
   * destinations do not know their own index, and neither do these. A destination rendered outside a bar
   * therefore reads as unselected, which is what Flutter's does.
   */
  readonly selected?: boolean;
  /** Invoked on click. Set by the parent bar from its `onDestinationSelected`. */
  readonly onSelected?: (() => void) | undefined;
}

/**
 * Flutter's `NavigationDestination` — one item in a {@link NavigationBar}.
 *
 * The selected item gets the `secondaryContainer` pill Material calls an *indicator*, sized 64x32
 * (navigation_bar.dart:29-30), and its icon and label move from `onSurfaceVariant` to
 * `onSecondaryContainer` (navigation_bar.dart:1449-1478).
 *
 * @param props - see {@link NavigationDestinationProps}.
 * @returns the destination.
 * @throws RuntimeError - `BRG4006` if the theme lacks the roles a navigation bar paints.
 */
export function NavigationDestination(props: NavigationDestinationProps): ReactElement {
  const theme = useThemeSurface();
  const selected = props.selected === true;
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    flex: '1 1 0%',
    border: 'none',
    background: 'transparent',
    color: theme.color(role('NavigationBar', selected ? 'selectedColorRole' : 'colorRole')),
    ...typographyIfDefined(theme, role('NavigationBar', 'labelTypography')),
  };
  const indicator: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: size('NavigationBar', 'indicatorWidth'),
    height: size('NavigationBar', 'indicatorHeight'),
    // A StadiumBorder is a full pill: half the height, on every corner.
    borderRadius: size('NavigationBar', 'indicatorHeight') / 2,
    fontSize: size('NavigationBar', 'iconSize'),
    ...(selected ? { backgroundColor: theme.color(role('NavigationBar', 'indicatorColorRole')) } : {}),
  };
  return createElement(
    'button',
    {
      type: 'button',
      style,
      onClick: props.onSelected,
      'aria-current': selected ? 'page' : undefined,
    },
    createElement('span', { key: 'i', style: indicator }, (selected ? props.selectedIcon : undefined) ?? props.icon),
    props.label === undefined ? null : createElement('span', { key: 'l' }, props.label),
  );
}

/** Props for {@link NavigationBar}. */
export interface NavigationBarProps {
  /** The destinations, in order. Flutter's `destinations`, which the catalog names its children. */
  readonly children?: ReactNode;
  /** Which destination is selected. Flutter's `selectedIndex`; defaults to `0`, as Flutter's does. */
  readonly selectedIndex?: number;
  /** Invoked with the tapped destination's index. Flutter's `onDestinationSelected`. */
  readonly onDestinationSelected?: ((index: number) => void) | undefined;
  /** The bar's height, overriding Material's 80. Flutter's `height`. */
  readonly height?: number;
}

/**
 * Flutter's `NavigationBar` — M3's bottom navigation.
 *
 * 80 logical pixels tall on `surfaceContainer` (navigation_bar.dart:1430, :1440). A `<nav>`, which is the
 * ARIA `navigation` landmark; a `<div>` would render identically and be invisible to a screen reader's
 * landmark list, which is a regression against the Flutter app rather than a neutral choice.
 *
 * @param props - see {@link NavigationBarProps}.
 * @returns the bar.
 * @throws RuntimeError - `BRG4006` if the theme lacks the roles it paints.
 */
export function NavigationBar(props: NavigationBarProps): ReactElement {
  const theme = useThemeSurface();
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    height: props.height ?? size('NavigationBar', 'height'),
    backgroundColor: theme.color(role('NavigationBar', 'backgroundColorRole')),
    boxSizing: 'border-box',
  };
  return createElement('nav', { style }, selectable(props.children, props.selectedIndex ?? 0, props.onDestinationSelected));
}

// ── NavigationRail (M3) ───────────────────────────────────────────────────────────────────────────

/** Props for {@link NavigationRailDestination}. */
export interface NavigationRailDestinationProps extends DestinationProps {
  /** The destination's text. Flutter's `label`, which is a **Widget** here — a slot, unlike the bar's. */
  readonly label?: ReactNode;
  /** Whether this destination is selected. Set by the parent {@link NavigationRail}. */
  readonly selected?: boolean;
  /** Invoked on click. Set by the parent rail. */
  readonly onSelected?: (() => void) | undefined;
  /** Whether the rail is extended, so the label sits beside the icon rather than under it. */
  readonly extended?: boolean;
}

/**
 * Flutter's `NavigationRailDestination` — one item in a {@link NavigationRail}.
 *
 * **Not a Flutter `Widget`**, and a component here anyway. See this file's header: the catalog is what puts
 * it in the UI tree, and the fact that Dart's type system does not call it a widget turned out to be a fact
 * about Dart rather than about the UI.
 *
 * Its `label` is a `Widget` where {@link NavigationDestination}'s is a `String`. That asymmetry is Flutter's,
 * and the catalog records it — one is a slot, the other a prop.
 *
 * @param props - see {@link NavigationRailDestinationProps}.
 * @returns the destination.
 * @throws RuntimeError - `BRG4006` if the theme lacks the roles a rail paints.
 */
export function NavigationRailDestination(props: NavigationRailDestinationProps): ReactElement {
  const theme = useThemeSurface();
  const selected = props.selected === true;
  const extended = props.extended === true;
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: extended ? 'row' : 'column',
    alignItems: 'center',
    justifyContent: extended ? 'flex-start' : 'center',
    gap: 4,
    width: '100%',
    border: 'none',
    background: 'transparent',
    color: theme.color(role('NavigationRail', 'labelColorRole')),
    ...typographyIfDefined(theme, role('NavigationRail', 'labelTypography')),
  };
  const indicator: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: size('NavigationRail', 'indicatorWidth'),
    height: size('NavigationRail', 'indicatorHeight'),
    borderRadius: size('NavigationRail', 'indicatorHeight') / 2,
    fontSize: size('NavigationRail', 'iconSize'),
    flexShrink: 0,
    color: theme.color(role('NavigationRail', selected ? 'selectedColorRole' : 'colorRole')),
    ...(selected ? { backgroundColor: theme.color(role('NavigationRail', 'indicatorColorRole')) } : {}),
  };
  return createElement(
    'button',
    { type: 'button', style, onClick: props.onSelected, 'aria-current': selected ? 'page' : undefined },
    createElement('span', { key: 'i', style: indicator }, (selected ? props.selectedIcon : undefined) ?? props.icon),
    props.label === undefined ? null : createElement('span', { key: 'l' }, props.label),
  );
}

/** Props for {@link NavigationRail}. */
export interface NavigationRailProps {
  /** The destinations, in order. Flutter's `destinations`, which the catalog names its children. */
  readonly children?: ReactNode;
  /** Which destination is selected, or `null`/omitted for none. Flutter's `selectedIndex`. */
  readonly selectedIndex?: number | null | undefined;
  /** Invoked with the tapped destination's index. Flutter's `onDestinationSelected`. */
  readonly onDestinationSelected?: ((index: number) => void) | undefined;
  /** Whether labels sit beside the icons and the rail widens to 256. Flutter's `extended`. */
  readonly extended?: boolean;
  /** Above the destinations. Flutter's `leading` slot. */
  readonly leading?: ReactNode;
  /** Below the destinations. Flutter's `trailing` slot. */
  readonly trailing?: ReactNode;
}

/**
 * Flutter's `NavigationRail` — the vertical navigation surface for wide layouts.
 *
 * 80 logical pixels wide, or 256 when extended (navigation_rail.dart:1240-1241), on `surface`.
 *
 * `selectedIndex` is nullable in Flutter and nullable here: a rail with no selection is a real state, and
 * `?? -1` would silently make it "index -1 is selected", which is the same thing until an index is negative.
 *
 * @param props - see {@link NavigationRailProps}.
 * @returns the rail.
 * @throws RuntimeError - `BRG4006` if the theme lacks the roles it paints.
 */
export function NavigationRail(props: NavigationRailProps): ReactElement {
  const theme = useThemeSurface();
  const extended = props.extended === true;
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    width: extended ? size('NavigationRail', 'minExtendedWidth') : size('NavigationRail', 'minWidth'),
    height: '100%',
    backgroundColor: theme.color(role('NavigationRail', 'backgroundColorRole')),
    boxSizing: 'border-box',
  };
  return createElement(
    'nav',
    { style },
    props.leading,
    selectable(props.children, props.selectedIndex ?? undefined, props.onDestinationSelected, { extended }),
    props.trailing,
  );
}

// ── NavigationDrawer (M3) ─────────────────────────────────────────────────────────────────────────

/** Props for {@link NavigationDrawerDestination}. */
export interface NavigationDrawerDestinationProps extends DestinationProps {
  /** The destination's text. Flutter's `label` slot — a `Widget`. */
  readonly label?: ReactNode;
  /** Whether this destination is selected. Set by the parent {@link NavigationDrawer}. */
  readonly selected?: boolean;
  /** Invoked on click. Set by the parent drawer. */
  readonly onSelected?: (() => void) | undefined;
}

/**
 * Flutter's `NavigationDrawerDestination` — one row in a {@link NavigationDrawer}.
 *
 * A 56-tall stadium 336 wide (navigation_drawer.dart:730-731), `secondaryContainer` when selected.
 *
 * @param props - see {@link NavigationDrawerDestinationProps}.
 * @returns the destination.
 * @throws RuntimeError - `BRG4006` if the theme lacks the roles a navigation drawer paints.
 */
export function NavigationDrawerDestination(props: NavigationDrawerDestinationProps): ReactElement {
  const theme = useThemeSurface();
  const selected = props.selected === true;
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: size('NavigationDrawer', 'tileHeight'),
    maxWidth: size('NavigationDrawer', 'indicatorWidth'),
    paddingInline: 16,
    border: 'none',
    background: 'transparent',
    borderRadius: size('NavigationDrawer', 'tileHeight') / 2,
    color: theme.color(role('NavigationDrawer', selected ? 'selectedColorRole' : 'colorRole')),
    boxSizing: 'border-box',
    ...typographyIfDefined(theme, role('NavigationDrawer', 'labelTypography')),
    ...(selected ? { backgroundColor: theme.color(role('NavigationDrawer', 'indicatorColorRole')) } : {}),
  };
  return createElement(
    'button',
    { type: 'button', style, onClick: props.onSelected, 'aria-current': selected ? 'page' : undefined },
    createElement('span', { key: 'i', style: { fontSize: size('NavigationDrawer', 'iconSize'), flexShrink: 0 } }, (selected ? props.selectedIcon : undefined) ?? props.icon),
    props.label,
  );
}

/** Props for {@link NavigationDrawer}. */
export interface NavigationDrawerProps {
  /** The header and destinations, in order. Flutter's `children`. */
  readonly children?: ReactNode;
  /** Which destination is selected. Flutter's `selectedIndex`. */
  readonly selectedIndex?: number | null | undefined;
  /** Invoked with the tapped destination's index. Flutter's `onDestinationSelected`. */
  readonly onDestinationSelected?: ((index: number) => void) | undefined;
}

/**
 * Flutter's `NavigationDrawer` — M3's drawer content.
 *
 * ## The index its callback reports is the destination's, not the child's
 *
 * Flutter counts only the `NavigationDrawerDestination`s when it numbers them: a `DrawerHeader` or a
 * `Divider` among the children does not consume an index. `_selectable` therefore numbers by *position among
 * selectable children*, which is why a header sitting first does not push every destination's index up by
 * one — a defect that would be invisible on a drawer with no header and wrong on every drawer with one.
 *
 * @param props - see {@link NavigationDrawerProps}.
 * @returns the drawer content.
 * @throws RuntimeError - `BRG4006` if the theme lacks the roles it paints.
 */
export function NavigationDrawer(props: NavigationDrawerProps): ReactElement {
  const theme = useThemeSurface();
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: 12,
    height: '100%',
    backgroundColor: theme.color(role('NavigationDrawer', 'backgroundColorRole')),
    boxSizing: 'border-box',
  };
  return createElement('div', { style }, selectable(props.children, props.selectedIndex ?? undefined, props.onDestinationSelected));
}

// ── BottomNavigationBar (M2) ──────────────────────────────────────────────────────────────────────

/** Props for {@link BottomNavigationBarItem}. */
export interface BottomNavigationBarItemProps extends DestinationProps {
  /** The item's text. Flutter's `label`, a `String`. */
  readonly label?: string;
  /** Whether this item is selected. Set by the parent {@link BottomNavigationBar}. */
  readonly selected?: boolean;
  /** Invoked on click. Set by the parent bar. */
  readonly onSelected?: (() => void) | undefined;
}

/**
 * Flutter's `BottomNavigationBarItem` — one item in M2's bottom bar.
 *
 * **Not a Flutter `Widget`**, and rendered as one here for the reason this file's header gives.
 *
 * Its selected colour is **brightness-dependent** — `primary` in light, `secondary` in dark
 * (bottom_navigation_bar.dart:933-936) — which is why it reads `theme.brightness` rather than a single role.
 * That is a real M2 behaviour, not a simplification: the same app in dark mode genuinely highlights a
 * different colour.
 *
 * @param props - see {@link BottomNavigationBarItemProps}.
 * @returns the item.
 * @throws RuntimeError - `BRG4006` if the theme lacks `primary` / `secondary` / `onSurfaceVariant`.
 */
export function BottomNavigationBarItem(props: BottomNavigationBarItemProps): ReactElement {
  const theme = useThemeSurface();
  const selected = props.selected === true;
  const selectedRole =
    theme.brightness === 'dark'
      ? role('BottomNavigationBar', 'selectedColorRoleDark')
      : role('BottomNavigationBar', 'selectedColorRole');
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    flex: '1 1 0%',
    border: 'none',
    background: 'transparent',
    color: theme.color(selected ? selectedRole : role('BottomNavigationBar', 'colorRole')),
    ...typographyIfDefined(theme, role('BottomNavigationBar', 'labelTypography')),
  };
  return createElement(
    'button',
    { type: 'button', style, onClick: props.onSelected, 'aria-current': selected ? 'page' : undefined },
    createElement('span', { key: 'i', style: { fontSize: size('BottomNavigationBar', 'iconSize') } }, (selected ? props.selectedIcon : undefined) ?? props.icon),
    props.label === undefined ? null : createElement('span', { key: 'l' }, props.label),
  );
}

/** Props for {@link BottomNavigationBar}. */
export interface BottomNavigationBarProps {
  /** The items, in order. Flutter's `items`, which the catalog names its children. */
  readonly children?: ReactNode;
  /** Which item is selected. Flutter's `currentIndex`, which defaults to `0`. */
  readonly currentIndex?: number;
  /** Invoked with the tapped item's index. Flutter's `onTap`. */
  readonly onTap?: ((index: number) => void) | undefined;
}

/**
 * Flutter's `BottomNavigationBar` — M2's bottom navigation, superseded by {@link NavigationBar}.
 *
 * 56 logical pixels tall (material/constants.dart:33), against M3's 80.
 *
 * @param props - see {@link BottomNavigationBarProps}.
 * @returns the bar.
 * @throws RuntimeError - `BRG4006` if the theme lacks the roles it paints.
 */
export function BottomNavigationBar(props: BottomNavigationBarProps): ReactElement {
  const theme = useThemeSurface();
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    height: size('BottomNavigationBar', 'height'),
    backgroundColor: theme.color(role('BottomNavigationBar', 'backgroundColorRole')),
    boxSizing: 'border-box',
  };
  return createElement('nav', { style }, selectable(props.children, props.currentIndex ?? 0, props.onTap));
}

// ── the one place selection is assigned ───────────────────────────────────────────────────────────

/**
 * Clones each selectable child with its selection state and click handler.
 *
 * Every navigation surface here needs the same three facts pushed down — am I selected, what do I call, and
 * (for the rail) am I extended — and doing it once is what keeps `NavigationBar` and `NavigationRail` from
 * disagreeing about how an index is counted.
 *
 * **Indices count selectable children only.** A `DrawerHeader` or a `Divider` among a `NavigationDrawer`'s
 * children takes no index in Flutter, and taking one here would shift every destination after it.
 *
 * A child that already sets `selected` keeps it: a destination rendered with an explicit selection is stating
 * something the parent's index does not know, and overwriting it would make the explicit prop inert.
 */
function selectable(
  children: ReactNode,
  selectedIndex: number | undefined,
  onSelected: ((index: number) => void) | undefined,
  extra?: { readonly extended: boolean },
): ReactNode {
  let index = -1;
  return Children.map(children, (child) => {
    // Not every child is a destination, and only destinations are numbered. Checked by component identity
    // rather than by "is it a React element", because a `DrawerHeader` is a perfectly valid element and
    // counting it would shift every destination after it by one — wrong on every drawer that has a header
    // and invisible on every drawer that does not.
    if (!isValidElement(child) || !DESTINATIONS.has(child.type)) return child;
    index += 1;
    const position = index;
    const props = child.props as { readonly selected?: unknown };
    return cloneElement(child as ReactElement<Record<string, unknown>>, {
      // A destination that states its own `selected` keeps it: an explicit prop is the caller saying
      // something the parent's index does not know, and overwriting it would make the prop inert.
      ...(props.selected === undefined && selectedIndex !== undefined
        ? { selected: position === selectedIndex }
        : {}),
      ...(onSelected === undefined ? {} : { onSelected: () => onSelected(position) }),
      ...(extra ?? {}),
    });
  });
}

/**
 * The components {@link selectable} numbers.
 *
 * A `Set` of the functions themselves, so the check is identity rather than a name comparison — a user
 * component that happened to be called `NavigationDestination` is not one of these, which is the same
 * distinction the analyzer draws by resolving supertypes rather than reading names.
 */
const DESTINATIONS: ReadonlySet<unknown> = new Set<unknown>([
  NavigationDestination,
  NavigationRailDestination,
  NavigationDrawerDestination,
  BottomNavigationBarItem,
]);
