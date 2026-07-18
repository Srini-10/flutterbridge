// M4-I — expansion, tabs, and the selectable chips.
//
// ## What these have in common, and why they are together
//
// Each one holds **selection or disclosure state**, and each one is the case where a native HTML element
// already carries the semantics Flutter's widget carries. That is the whole reason they could be built now,
// when the gesture model still does not exist:
//
// - an `ExpansionTile` is `<details>`/`<summary>` — the browser owns the open/closed state, the click target
//   and the ARIA;
// - a `TabBar` is `role="tablist"` with `aria-selected`, driven by ordinary buttons;
// - a chip is a button whose pressed-ness is a prop.
//
// None of them needs a ripple, a drag or a measured position. A `ReorderableListView` does, and is refused.
//
// ## Every number and colour is the catalog's
//
// INV-20 (ADR-13), as everywhere. Reading the SDK rather than the M3 specification mattered twice here:
//
// - **An `ExpansionTile`'s icon changes role, not just direction**: `primary` when expanded and
//   `onSurfaceVariant` when collapsed (`expansion_tile.dart:914-924`). Its *text* stays `onSurface` in both.
// - **A `ChoiceChip` is an 8px rounded rectangle, not a stadium** (`choice_chip.dart:279`), which is what a
//   bare `Chip` is. Two chips side by side genuinely have different corners.

import { Children, createElement, type CSSProperties, type ReactElement, type ReactNode } from 'react';

import { componentDefault } from '../generated/material_metadata.js';
import { useThemeSurface } from '../react/theme.js';
import { typographyIfDefined } from '../theme/surface.js';

const size = (component: string, field: string): number => Number(componentDefault(component, field));
const role = (component: string, field: string): string => String(componentDefault(component, field));

// ── ExpansionTile ─────────────────────────────────────────────────────────────────────────────────

/** Props for {@link ExpansionTile}. */
export interface ExpansionTileProps {
  /** The header's primary line. Flutter's `title` slot. */
  readonly title?: ReactNode;
  /** The header's secondary line. Flutter's `subtitle` slot. */
  readonly subtitle?: ReactNode;
  /** Before the title. Flutter's `leading` slot. */
  readonly leading?: ReactNode;
  /** After the title, replacing the disclosure arrow. Flutter's `trailing` slot. */
  readonly trailing?: ReactNode;
  /** The body, revealed when open. Flutter's `children`. */
  readonly children?: ReactNode;
  /** Whether it starts open. Flutter's `initiallyExpanded`. */
  readonly initiallyExpanded?: boolean;
  /** Invoked with the new state when the user opens or closes it. Flutter's `onExpansionChanged`. */
  readonly onExpansionChanged?: ((expanded: boolean) => void) | undefined;
}

/**
 * Flutter's `ExpansionTile` — a list tile that reveals a body.
 *
 * A `<details>` element, which is not a convenience: the browser owns the open/closed state, makes the
 * `<summary>` a click and keyboard target, and exposes the disclosure to assistive technology. Building it
 * from a `<div>` and a boolean would need the gesture model for the click, a signal for the state, and
 * hand-written ARIA for the semantics — three things to get wrong in place of an element that has them.
 *
 * `initiallyExpanded` maps to `defaultOpen`, and the distinction is exact: both mean *the initial state, not
 * the current one*. Passing `open` instead would freeze the tile, because a controlled `<details>` needs the
 * state written back on every toggle and there is nothing here to write it to.
 *
 * The animation is the browser's disclosure, not Flutter's height tween — Flutter animates the body's height
 * over 200ms and `<details>` reveals it. That is a real difference and it is the smaller one available: the
 * alternative was a measured height, which is the constraint model's measuring half.
 *
 * @param props - see {@link ExpansionTileProps}.
 * @returns the tile.
 * @throws RuntimeError - `BRG4006` if the theme defines no `onSurface` / `onSurfaceVariant` / `primary`.
 */
export function ExpansionTile(props: ExpansionTileProps): ReactElement {
  const theme = useThemeSurface();
  const header: CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: size('ListTile', 'horizontalTitleGap'),
    minHeight: size('ListTile', 'heightOneLine'),
    paddingInlineStart: size('ListTile', 'paddingStart'),
    paddingInlineEnd: size('ListTile', 'paddingEnd'),
    color: theme.color(role('ExpansionTile', 'colorRole')),
    cursor: 'pointer',
    listStyle: 'none',
    boxSizing: 'border-box',
  };
  const text: CSSProperties = { display: 'flex', flexDirection: 'column', flex: '1 1 auto', minWidth: 0 };
  const subtitle: CSSProperties = { color: theme.color(role('ListTile', 'subtitleColorRole')) };
  const marker: CSSProperties = {
    // `onSurfaceVariant` collapsed. Flutter swaps it to `primary` when expanded, and CSS cannot select on
    // the parent's `open` from here without a stylesheet — so the collapsed role is what is painted, and the
    // divergence is one colour on an expanded tile rather than a wrong colour on every tile.
    color: theme.color(role('ExpansionTile', 'iconColorRole')),
    flexShrink: 0,
  };

  return createElement(
    'details',
    {
      ...(props.initiallyExpanded === true ? { open: true } : {}),
      onToggle:
        props.onExpansionChanged === undefined
          ? undefined
          : (event: { readonly currentTarget: { readonly open: boolean } }) =>
              props.onExpansionChanged?.(event.currentTarget.open),
    },
    createElement(
      'summary',
      { key: 's', style: header },
      props.leading,
      createElement('div', { key: 't', style: text }, props.title, props.subtitle === undefined ? null : createElement('div', { style: subtitle }, props.subtitle)),
      createElement('div', { key: 'm', style: marker }, props.trailing),
    ),
    createElement('div', { key: 'b' }, props.children),
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────────────────────────

/** Props for {@link Tab}. */
export interface TabProps {
  /** The label. Flutter's `text`. */
  readonly text?: string;
  /** An icon above the label. Flutter's `icon` slot. */
  readonly icon?: ReactNode;
  /** Arbitrary content, instead of `text`. Flutter's `child` slot. */
  readonly child?: ReactNode;
  /** Whether this tab is selected. Set by the parent {@link TabBar}. */
  readonly selected?: boolean;
  /** Invoked on click. Set by the parent {@link TabBar}. */
  readonly onSelected?: (() => void) | undefined;
}

/**
 * Flutter's `Tab` — one label in a {@link TabBar}.
 *
 * 46 logical pixels tall, or 72 when it carries both an icon and a label (`tabs.dart:30-31`).
 *
 * @param props - see {@link TabProps}.
 * @returns the tab.
 * @throws RuntimeError - `BRG4006` if the theme lacks `primary` / `onSurfaceVariant`.
 */
export function Tab(props: TabProps): ReactElement {
  const theme = useThemeSurface();
  const selected = props.selected === true;
  const both = props.icon !== undefined && (props.text !== undefined || props.child !== undefined);
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    flex: '1 1 0%',
    minHeight: both ? size('TabBar', 'textAndIconHeight') : size('TabBar', 'height'),
    border: 'none',
    background: 'transparent',
    color: theme.color(role('TabBar', selected ? 'selectedColorRole' : 'colorRole')),
    borderBottom: selected
      ? `${size('TabBar', 'indicatorHeight')}px solid ${theme.color(role('TabBar', 'indicatorColorRole'))}`
      : `${size('TabBar', 'indicatorHeight')}px solid transparent`,
    boxSizing: 'border-box',
    ...typographyIfDefined(theme, role('TabBar', 'labelTypography')),
  };
  return createElement(
    'button',
    { type: 'button', role: 'tab', style, onClick: props.onSelected, 'aria-selected': selected },
    props.icon,
    props.text === undefined ? null : createElement('span', { key: 'l' }, props.text),
    props.child,
  );
}

/** Props for {@link TabBar}. */
export interface TabBarProps {
  /** The tabs, in order. Flutter's `tabs`, which the catalog names its children. */
  readonly children?: ReactNode;
  /** Which tab is selected. Supplied by a {@link DefaultTabController} when there is one. */
  readonly selectedIndex?: number;
  /** Invoked with the tapped tab's index. */
  readonly onTabSelected?: ((index: number) => void) | undefined;
  /** Whether the bar scrolls rather than dividing the width evenly. Flutter's `isScrollable`. */
  readonly isScrollable?: boolean;
}

/**
 * Flutter's `TabBar`.
 *
 * `role="tablist"`, which is what makes a screen reader announce "tab 2 of 4" as the Flutter app does.
 *
 * @param props - see {@link TabBarProps}.
 * @returns the bar.
 * @throws RuntimeError - `BRG4006` if the theme lacks the roles it paints.
 */
export function TabBar(props: TabBarProps): ReactElement {
  const theme = useThemeSurface();
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    borderBottom: `${size('TabBar', 'dividerHeight')}px solid ${theme.color(role('TabBar', 'dividerColorRole'))}`,
    ...(props.isScrollable === true ? { overflowX: 'auto' as const } : {}),
  };
  return createElement('div', { role: 'tablist', style }, selectTabs(props.children, props.selectedIndex ?? 0, props.onTabSelected));
}

/** Props for {@link TabBarView}. */
export interface TabBarViewProps {
  /** The pages, in order. Flutter's `children`. */
  readonly children?: ReactNode;
  /** Which page is shown. Supplied by a {@link DefaultTabController} when there is one. */
  readonly selectedIndex?: number;
}

/**
 * Flutter's `TabBarView` — the page for the selected tab.
 *
 * **Only the selected page is rendered**, which is Flutter's behaviour for a page that has never been
 * visited and is *not* its behaviour for one that has: Flutter keeps a visited page alive so its scroll
 * position and state survive. Doing that here needs the pages mounted and hidden, and a hidden mounted page
 * is one an assistive technology can still reach. Rendering one page is the smaller error, and it is stated.
 *
 * The swipe between pages is the gesture model, and the slide is the animation engine. Neither is here.
 *
 * @param props - see {@link TabBarViewProps}.
 * @returns the visible page.
 */
export function TabBarView(props: TabBarViewProps): ReactElement {
  const pages = Children.toArray(props.children);
  const index = props.selectedIndex ?? 0;
  return createElement('div', { role: 'tabpanel', style: { flex: '1 1 auto', minHeight: 0 } }, pages[index] ?? null);
}

/** Props for {@link DefaultTabController}. */
export interface DefaultTabControllerProps {
  /** How many tabs. Flutter's `length`. */
  readonly length?: number;
  /** The subtree the controller scopes. Flutter's `child` slot. */
  readonly child?: ReactNode;
  /** Which tab starts selected. Flutter's `initialIndex`. */
  readonly initialIndex?: number;
}

/**
 * Flutter's `DefaultTabController` — the shared selection a `TabBar` and a `TabBarView` agree on.
 *
 * ## What is honestly missing, and why it is refused rather than approximated
 *
 * In Flutter this is an `InheritedWidget`: a `TabBar` anywhere below it finds the controller by type and
 * writes to it, and a `TabBarView` anywhere below reads it. Reproducing that needs a React context holding a
 * signal, scoped per provider — the shape `Form` uses, and no obstacle.
 *
 * What is *not* reproducible is the wiring the generator would have to do. A `TabBar` and a `TabBarView` are
 * two separate `ui.Element`s that are only related by being under the same controller, and nothing in UIR
 * says so: there is no node for "these two share a selection". Making the kit connect them by context would
 * work at runtime and be invisible to every diagnostic — which is exactly the silent, unverifiable coupling
 * this project refuses.
 *
 * So this renders its child and provides nothing, and the generator refuses a `TabBar` that has no explicit
 * `selectedIndex` (`BRG3017`), naming the controller as the missing capability. A `TabBar` given a
 * `selectedIndex` from the application's own state — which is how a converted app should express it — works
 * completely.
 *
 * @param props - see {@link DefaultTabControllerProps}.
 * @returns the child.
 */
export function DefaultTabController(props: DefaultTabControllerProps): ReactElement {
  return createElement('div', { style: { display: 'contents' } }, props.child);
}

// ── the selectable chips ──────────────────────────────────────────────────────────────────────────

/** Props shared by the chips whose pressed-ness is a value. */
interface SelectableChipProps {
  /** The chip's text. Flutter's `label` slot. */
  readonly label?: ReactNode;
  /** An icon before the label. Flutter's `avatar` slot. */
  readonly avatar?: ReactNode;
  /** Whether it is selected. Flutter's `selected`. */
  readonly selected?: boolean;
  /** Invoked with the new state. Flutter's `onSelected`; `undefined` disables, as `null` does in Flutter. */
  readonly onSelected?: ((selected: boolean) => void) | undefined;
}

/** Props for {@link ChoiceChip}. */
export type ChoiceChipProps = SelectableChipProps;
/** Props for {@link FilterChip}. */
export type FilterChipProps = SelectableChipProps;

/** Props for {@link ActionChip}. */
export interface ActionChipProps {
  /** The chip's text. Flutter's `label` slot. */
  readonly label?: ReactNode;
  /** An icon before the label. Flutter's `avatar` slot. */
  readonly avatar?: ReactNode;
  /** Invoked on press. Flutter's `onPressed`; `undefined` disables. */
  readonly onPressed?: (() => void) | undefined;
}

function chipStyle(theme: ReturnType<typeof useThemeSurface>, selected: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: size('Chip', 'labelPaddingStart'),
    height: size('Chip', 'height'),
    paddingInline: size('Chip', 'paddingStart'),
    // 8px, not a stadium — a `ChoiceChip` and a bare `Chip` genuinely have different corners in M3.
    borderRadius: size('ChoiceChip', 'borderRadius'),
    border: selected ? 'none' : `1px solid ${theme.color(role('Chip', 'outlineColorRole'))}`,
    background: selected ? theme.color(role('ChoiceChip', 'selectedContainerColorRole')) : 'transparent',
    color: theme.color(role('ChoiceChip', selected ? 'selectedColorRole' : 'colorRole')),
    boxSizing: 'border-box',
    ...typographyIfDefined(theme, role('ChoiceChip', 'labelTypography')),
  };
}

/**
 * Flutter's `ChoiceChip` — one selection from a set.
 *
 * `role="radio"`, because that is what a choice chip is: exactly one of a group. The grouping itself is the
 * application's, as it is in Flutter — a `ChoiceChip` does not know its siblings.
 *
 * @param props - see {@link ChoiceChipProps}.
 * @returns the chip.
 * @throws RuntimeError - `BRG4006` if the theme lacks the roles a chip paints.
 */
export function ChoiceChip(props: ChoiceChipProps): ReactElement {
  const theme = useThemeSurface();
  const selected = props.selected === true;
  return createElement(
    'button',
    {
      type: 'button',
      role: 'radio',
      'aria-checked': selected,
      disabled: props.onSelected === undefined,
      onClick: props.onSelected === undefined ? undefined : () => props.onSelected?.(!selected),
      style: chipStyle(theme, selected),
    },
    props.avatar,
    props.label,
  );
}

/**
 * Flutter's `FilterChip` — an independent on/off filter.
 *
 * `role="checkbox"` rather than `radio`: several filters can be on at once, which is the one behavioural
 * difference from a {@link ChoiceChip} and the one thing a screen reader needs told.
 *
 * @param props - see {@link FilterChipProps}.
 * @returns the chip.
 */
export function FilterChip(props: FilterChipProps): ReactElement {
  const theme = useThemeSurface();
  const selected = props.selected === true;
  return createElement(
    'button',
    {
      type: 'button',
      role: 'checkbox',
      'aria-checked': selected,
      disabled: props.onSelected === undefined,
      onClick: props.onSelected === undefined ? undefined : () => props.onSelected?.(!selected),
      style: chipStyle(theme, selected),
    },
    props.avatar,
    props.label,
  );
}

/**
 * Flutter's `ActionChip` — a chip that does something rather than holding a state.
 *
 * An ordinary button: it has no selected state to announce, which is why it takes `onPressed` and not
 * `onSelected`.
 *
 * @param props - see {@link ActionChipProps}.
 * @returns the chip.
 */
export function ActionChip(props: ActionChipProps): ReactElement {
  const theme = useThemeSurface();
  return createElement(
    'button',
    {
      type: 'button',
      disabled: props.onPressed === undefined,
      onClick: props.onPressed,
      style: chipStyle(theme, false),
    },
    props.avatar,
    props.label,
  );
}

/** The tabs a {@link TabBar} numbers. Identity, not name — the same rule `navigation.ts` applies. */
const TABS: ReadonlySet<unknown> = new Set<unknown>([Tab]);

/** Clones each `Tab` with its selection and click handler. */
function selectTabs(
  children: ReactNode,
  selectedIndex: number,
  onSelected: ((index: number) => void) | undefined,
): ReactNode {
  let index = -1;
  return Children.map(children, (child) => {
    if (!isTab(child)) return child;
    index += 1;
    const position = index;
    return cloneTab(child, {
      selected: position === selectedIndex,
      ...(onSelected === undefined ? {} : { onSelected: () => onSelected(position) }),
    });
  });
}

function isTab(child: unknown): child is ReactElement {
  return (
    typeof child === 'object' &&
    child !== null &&
    'type' in child &&
    TABS.has((child as { readonly type: unknown }).type)
  );
}

function cloneTab(child: ReactElement, extra: Record<string, unknown>): ReactElement {
  return createElement(Tab, { ...(child.props as TabProps), ...extra });
}
