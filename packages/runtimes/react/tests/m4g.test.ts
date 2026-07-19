// @vitest-environment jsdom

import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import {
  AppBar,
  BottomNavigationBar,
  BottomNavigationBarItem,
  Drawer,
  FloatingActionButton,
  IconButton,
  IntrinsicHeight,
  IntrinsicWidth,
  MaterialBanner,
  NavigationBar,
  NavigationDestination,
  NavigationDrawer,
  NavigationDrawerDestination,
  NavigationRail,
  NavigationRailDestination,
  OverflowBox,
  PreferredSize,
  Scaffold,
  Size,
  ThemeProvider,
  componentDefault,
  type ThemeDescriptor,
} from '../src/index.js';

// M4-G's shell and navigation surfaces.
//
// Every dimension is read back from the generated catalog metadata rather than written here. A test that
// hard-coded `64` for an AppBar's height would pass a component that had drifted from the SDK — and 64 is
// exactly the number worth not hard-coding, because `kToolbarHeight` is 56 and is what everyone quotes.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<{ root: Root; container: HTMLElement }> = [];

function render(element: ReactElement): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  mounted.push({ root, container });
  return container;
}

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => entry.root.unmount());
    entry.container.remove();
  }
});

function only(container: HTMLElement): HTMLElement {
  const element = container.firstElementChild;
  if (!(element instanceof HTMLElement)) throw new Error('nothing rendered');
  return element;
}

const ROLES = [
  ['primary', '#FF6750A4'],
  ['secondary', '#FF625B71'],
  ['primaryContainer', '#FFEADDFF'],
  ['onPrimaryContainer', '#FF21005D'],
  ['secondaryContainer', '#FFE8DEF8'],
  ['onSecondaryContainer', '#FF1D192B'],
  ['surface', '#FFFEF7FF'],
  ['surfaceTint', '#FF6750A4'],
  ['surfaceContainer', '#FFF3EDF7'],
  ['surfaceContainerLow', '#FFF7F2FA'],
  ['onSurface', '#FF1D1B20'],
  ['onSurfaceVariant', '#FF49454F'],
  ['outlineVariant', '#FFCAC4D0'],
] as const;

const theme: ThemeDescriptor = {
  tokens: ROLES.map(([name, value]) => ({ name, group: 'color' as const, role: name, light: value })),
};

function themed(element: ReactElement, brightness: 'light' | 'dark' = 'light'): HTMLElement {
  // Brightness is a *provider* option, not a descriptor field: it is mutable state, and `theme.ts` keeps it
  // per mount for the same reason a store is (ADR-15).
  return render(createElement(ThemeProvider, { descriptor: theme, options: { brightness } }, element));
}

const size = (component: string, field: string): number => Number(componentDefault(component, field));

describe('Scaffold', () => {
  it('is a full-viewport column whose body takes the remaining height', () => {
    const frame = only(themed(createElement(Scaffold, { body: 'content' })));
    expect(frame.style.flexDirection).toBe('column');
    // `dvh`, not `vh`: on mobile browsers `vh` is the viewport with the URL bar hidden, so a `100vh`
    // scaffold puts its bottom navigation below the fold until the user scrolls.
    expect(frame.style.minHeight).toBe('100dvh');
  });

  it("the body is a `main`, and can shrink — which is what lets it scroll", () => {
    const body = only(themed(createElement(Scaffold, { body: 'content' }))).querySelector('main');
    expect(body).not.toBeNull();
    // A flex item's default `min-height: auto` refuses to shrink below its content, which is the single most
    // common reason a flex-column app layout pushes its bottom bar off-screen.
    expect((body as HTMLElement).style.minHeight).toBe('0px');
  });

  it('the floating action button is inset by Material’s own margin', () => {
    const frame = only(themed(createElement(Scaffold, { floatingActionButton: 'fab' })));
    const fab = frame.lastElementChild as HTMLElement;
    expect(fab.style.bottom).toBe(`${size('FloatingActionButton', 'margin')}px`);
  });

  it('a drawer is rendered off-canvas and hidden from assistive technology', () => {
    // The honest half of an un-openable drawer: its content is emitted rather than discarded, and it is not
    // announced as though a user could reach it.
    const frame = only(themed(createElement(Scaffold, { drawer: 'menu' })));
    const drawer = frame.lastElementChild as HTMLElement;
    expect(drawer.style.visibility).toBe('hidden');
    expect(drawer.style.transform).toBe('translateX(-100%)');
  });

  it('paints the theme’s surface, never a literal (INV-20)', () => {
    const frame = only(themed(createElement(Scaffold, { body: 'x' })));
    expect(frame.style.backgroundColor).not.toBe('');
  });
});

describe('AppBar', () => {
  it('is a banner landmark 64 tall — the M3 default, not kToolbarHeight’s 56', () => {
    const bar = only(themed(createElement(AppBar, { title: 'Title' })));
    expect(bar.tagName).toBe('HEADER');
    const toolbar = bar.firstElementChild as HTMLElement;
    expect(toolbar.style.minHeight).toBe(`${size('AppBar', 'toolbarHeight')}px`);
    expect(size('AppBar', 'toolbarHeight')).toBe(64);
  });

  it('gives the leading icon and the actions different colours, as M3 does', () => {
    const bar = only(themed(createElement(AppBar, { leading: 'L', title: 'T' }, 'A')));
    const toolbar = bar.firstElementChild as HTMLElement;
    const leading = toolbar.children[0] as HTMLElement;
    const actions = toolbar.children[2] as HTMLElement;
    // `onSurface` against `onSurfaceVariant` (app_bar.dart:2548-2557). A single "icon colour" would have
    // been wrong for one of the two on every screen.
    expect(leading.style.color).not.toBe(actions.style.color);
  });

  it('pushes its actions to the trailing edge', () => {
    const bar = only(themed(createElement(AppBar, { title: 'T' }, 'A')));
    const actions = (bar.firstElementChild as HTMLElement).lastElementChild as HTMLElement;
    expect(actions.style.marginInlineStart).toBe('auto');
  });
});

describe('PreferredSize', () => {
  it('applies the height and ignores the width, as both slots that take one do', () => {
    const sized = only(render(createElement(PreferredSize, { preferredSize: Size.fromHeight(32) }, )));
    expect(sized.style.height).toBe('32px');
    expect(sized.style.width).toBe('');
  });

  it('an infinite height degrades to 100%, not to `Infinitypx`', () => {
    const sized = only(render(createElement(PreferredSize, { preferredSize: Size.fromWidth(10) })));
    expect(sized.style.height).toBe('100%');
  });
});

describe('the intrinsic-sizing pair', () => {
  it('IntrinsicWidth is `max-content`, which is Flutter’s maximum intrinsic width', () => {
    // M4-D refused this as needing measurement. It does not: CSS's `max-content` and Flutter's
    // `computeMaxIntrinsicWidth` are the same definition — the size given unbounded space.
    expect(only(render(createElement(IntrinsicWidth, { child: 'x' }))).style.width).toBe('max-content');
  });

  it('IntrinsicHeight is `max-content` on the other axis', () => {
    expect(only(render(createElement(IntrinsicHeight, { child: 'x' }))).style.height).toBe('max-content');
  });

  it('OverflowBox takes its child out of the parent’s size calculation', () => {
    // That, not `overflow: visible`, is what `OverflowBox` actually means: the box is sized by its own
    // parent and the child does not contribute.
    const box = only(render(createElement(OverflowBox, { maxWidth: 400, child: 'x' })));
    expect(box.style.position).toBe('relative');
    const child = box.firstElementChild as HTMLElement;
    expect(child.style.position).toBe('absolute');
    expect(child.style.maxWidth).toBe('400px');
  });
});

describe('NavigationBar', () => {
  const bar = (props: Record<string, unknown>, ...items: ReactElement[]): HTMLElement =>
    only(themed(createElement(NavigationBar, props, ...items)));

  const destination = (key: string, label: string): ReactElement =>
    createElement(NavigationDestination, { key, label });

  it('is a navigation landmark at Material’s height', () => {
    const nav = bar({}, destination('a', 'Home'));
    expect(nav.tagName).toBe('NAV');
    expect(nav.style.height).toBe(`${size('NavigationBar', 'height')}px`);
  });

  it('marks the selected destination, and only it', () => {
    const nav = bar({ selectedIndex: 1 }, destination('a', 'Home'), destination('b', 'Saved'));
    const buttons = Array.from(nav.querySelectorAll('button'));
    expect(buttons[0]?.getAttribute('aria-current')).toBeNull();
    expect(buttons[1]?.getAttribute('aria-current')).toBe('page');
  });

  it('the selected destination gets the indicator pill and the unselected one does not', () => {
    const nav = bar({ selectedIndex: 0 }, destination('a', 'Home'), destination('b', 'Saved'));
    const pills = Array.from(nav.querySelectorAll('button > span:first-child')) as HTMLElement[];
    expect(pills[0]?.style.backgroundColor).not.toBe('');
    expect(pills[1]?.style.backgroundColor).toBe('');
  });

  it('reports the tapped destination’s index', () => {
    const seen: number[] = [];
    const nav = bar(
      { selectedIndex: 0, onDestinationSelected: (index: number) => seen.push(index) },
      destination('a', 'Home'),
      destination('b', 'Saved'),
    );
    const buttons = Array.from(nav.querySelectorAll('button'));
    act(() => buttons[1]?.click());
    expect(seen).toEqual([1]);
  });
});

describe('NavigationDrawer', () => {
  it('numbers destinations only — a header takes no index', () => {
    // Flutter counts only the `NavigationDrawerDestination`s. Numbering by child position would shift every
    // destination after a header by one: wrong on every drawer that has one, invisible on every drawer that
    // does not.
    const seen: number[] = [];
    const drawer = only(
      themed(
        createElement(
          NavigationDrawer,
          { selectedIndex: 0, onDestinationSelected: (index: number) => seen.push(index) },
          createElement('div', { key: 'h' }, 'A header, which is not a destination'),
          createElement(NavigationDrawerDestination, { key: 'a', label: 'Home' }),
          createElement(NavigationDrawerDestination, { key: 'b', label: 'Browse' }),
        ),
      ),
    );
    const buttons = Array.from(drawer.querySelectorAll('button'));
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.getAttribute('aria-current')).toBe('page');
    act(() => buttons[1]?.click());
    expect(seen).toEqual([1]);
  });

  it('a destination that states its own selection keeps it', () => {
    const drawer = only(
      themed(
        createElement(
          NavigationDrawer,
          { selectedIndex: 0 },
          createElement(NavigationDrawerDestination, { key: 'a', label: 'Home', selected: false }),
        ),
      ),
    );
    expect(drawer.querySelector('button')?.getAttribute('aria-current')).toBeNull();
  });
});

describe('NavigationRail', () => {
  it('widens from 80 to 256 when extended', () => {
    const collapsed = only(themed(createElement(NavigationRail, null)));
    expect(collapsed.style.width).toBe(`${size('NavigationRail', 'minWidth')}px`);
    const extended = only(themed(createElement(NavigationRail, { extended: true })));
    expect(extended.style.width).toBe(`${size('NavigationRail', 'minExtendedWidth')}px`);
  });

  it('passes `extended` down, so a destination lays its label beside the icon', () => {
    const rail = only(
      themed(
        createElement(
          NavigationRail,
          { extended: true, selectedIndex: 0 },
          createElement(NavigationRailDestination, { key: 'a', label: 'All' }),
        ),
      ),
    );
    expect((rail.querySelector('button') as HTMLElement).style.flexDirection).toBe('row');
  });

  it('a rail with no selection selects nothing', () => {
    // `selectedIndex` is nullable in Flutter and nullable here. `?? -1` would silently make "no selection"
    // into "index -1 is selected", which is the same thing right up until an index is negative.
    const rail = only(
      themed(
        createElement(
          NavigationRail,
          null,
          createElement(NavigationRailDestination, { key: 'a', label: 'All' }),
        ),
      ),
    );
    expect(rail.querySelector('button')?.getAttribute('aria-current')).toBeNull();
  });
});

describe('BottomNavigationBar', () => {
  const item = (key: string, label: string): ReactElement =>
    createElement(BottomNavigationBarItem, { key, label });

  it('is 56 tall — M2’s height, against NavigationBar’s 80', () => {
    const nav = only(themed(createElement(BottomNavigationBar, {}, item('a', 'One'))));
    expect(nav.style.height).toBe(`${size('BottomNavigationBar', 'height')}px`);
    expect(size('BottomNavigationBar', 'height')).toBeLessThan(size('NavigationBar', 'height'));
  });

  it('the selected colour differs between light and dark, as M2’s does', () => {
    // bottom_navigation_bar.dart:933-936 — `colorScheme.primary` in light, `colorScheme.secondary` in dark.
    // A real M2 behaviour, not a simplification: the same app genuinely highlights a different colour.
    const light = only(themed(createElement(BottomNavigationBar, { currentIndex: 0 }, item('a', 'One'))));
    const dark = only(themed(createElement(BottomNavigationBar, { currentIndex: 0 }, item('a', 'One')), 'dark'));
    const colourOf = (nav: HTMLElement): string => (nav.querySelector('button') as HTMLElement).style.color;
    expect(colourOf(light)).not.toBe(colourOf(dark));
  });
});

describe('the shell buttons', () => {
  it('an IconButton’s tooltip is its accessible name', () => {
    // An icon button's only text is its tooltip, so a converted app without it is a button a screen reader
    // announces as "button". Flutter's own IconButton wraps the icon in a Tooltip *and* a Semantics node.
    const button = only(themed(createElement(IconButton, { tooltip: 'Menu', onPressed: () => {} })));
    expect(button.getAttribute('aria-label')).toBe('Menu');
    expect(button.getAttribute('title')).toBe('Menu');
  });

  it('an omitted onPressed disables, as `null` does in Flutter', () => {
    expect((only(themed(createElement(IconButton, {}))) as HTMLButtonElement).disabled).toBe(true);
    expect((only(themed(createElement(FloatingActionButton, {}))) as HTMLButtonElement).disabled).toBe(true);
  });

  it('both are `type="button"`, so neither submits a form it sits inside', () => {
    expect(only(themed(createElement(IconButton, { onPressed: () => {} }))).getAttribute('type')).toBe('button');
    expect(only(themed(createElement(FloatingActionButton, { onPressed: () => {} }))).getAttribute('type')).toBe('button');
  });

  it('a FloatingActionButton is 56 square, 40 when mini, and a stadium when extended', () => {
    const regular = only(themed(createElement(FloatingActionButton, { onPressed: () => {} })));
    expect(regular.style.width).toBe(`${size('FloatingActionButton', 'size')}px`);
    const mini = only(themed(createElement(FloatingActionButton, { onPressed: () => {}, mini: true })));
    expect(mini.style.width).toBe(`${size('FloatingActionButton', 'smallSize')}px`);
    // `.extended` is a factory on the same class, so one component serves both: a `label` is what selects it.
    const extended = only(themed(createElement(FloatingActionButton, { onPressed: () => {}, label: 'Add' })));
    expect(extended.style.width).toBe('');
    expect(extended.style.height).toBe(`${size('FloatingActionButton', 'extendedHeight')}px`);
  });
});

describe('MaterialBanner', () => {
  it('is a live region — it is a message, and it is in the tree', () => {
    // The whole reason a MaterialBanner renders and a SnackBar does not: one is a widget an application puts
    // in its layout, the other an argument to a call.
    const banner = only(themed(createElement(MaterialBanner, { content: 'Two items need attention' })));
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.style.borderBottom).toContain(`${size('MaterialBanner', 'dividerThickness')}px`);
  });
});

describe('Drawer', () => {
  it('is 304 wide with a rounded end edge, and a navigation landmark', () => {
    const drawer = only(themed(createElement(Drawer, { child: 'menu' })));
    expect(drawer.tagName).toBe('NAV');
    expect(drawer.style.width).toBe(`${size('Drawer', 'width')}px`);
    expect(drawer.style.borderStartEndRadius).toBe(`${size('Drawer', 'endRadius')}px`);
  });

  it('an explicit width wins over Material’s', () => {
    expect(only(themed(createElement(Drawer, { width: 240 }))).style.width).toBe('240px');
  });
});
