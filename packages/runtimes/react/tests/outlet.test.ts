// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { RouterOutlet, RouterProvider, useRouter, type RouterDescriptor } from '../src/index.js';

// The outlet — the consumer the navigation stack never had (M7-C).
//
// `createRouter` has maintained a reactive stack since M3-A and nothing rendered it. That is why
// `BRG3008` could not simply be lowered: a `router.push` would have moved state nothing displayed, and
// the emitted application would have compiled, run, and done **nothing visible** when the button was
// pressed. These tests are about that specific failure — every one of them asserts on what is on screen
// after a navigation, never on the router's internal state, because the router's state was already
// correct while the screen stayed blank.

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<{ root: Root; container: HTMLElement }> = [];

function render(element: ReactElement): { container: HTMLElement } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  mounted.push({ root, container });
  return { container };
}

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => entry.root.unmount());
    entry.container.remove();
  }
});

const routes: RouterDescriptor = {
  routes: [
    { name: 'home', path: '/' },
    { name: 'settings', path: '/settings' },
  ],
  initial: 'home',
};

const Home = (): ReactElement => createElement('span', null, 'HOME');
const Settings = (): ReactElement => createElement('span', null, 'SETTINGS');
const Detail = (): ReactElement => createElement('span', null, 'DETAIL');

/** Mounts an outlet, plus a button that performs `navigate` on the live router. */
function app(
  navigate: (router: ReturnType<typeof useRouter>) => void,
  props: Partial<Parameters<typeof RouterOutlet>[0]> = {},
): { container: HTMLElement } {
  const Go = (): ReactElement => {
    const router = useRouter();
    return createElement('button', { onClick: () => navigate(router) }, 'go');
  };
  const Shell = (): ReactElement =>
    createElement(
      'div',
      null,
      createElement(RouterOutlet, { routes: { home: Home, settings: Settings }, ...props }),
      createElement(Go),
    );
  return render(createElement(RouterProvider, { descriptor: routes }, createElement(Shell)));
}

function click(container: HTMLElement): void {
  const button = container.querySelector('button');
  act(() => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('the outlet renders the top of the stack', () => {
  it('starts on the initial route', () => {
    const { container } = app(() => {});
    expect(container.textContent).toContain('HOME');
  });

  it('shows the pushed route after a push — the assertion the stack alone could not make', () => {
    const { container } = app((router) => router.push({ kind: 'route', route: 'settings' }));
    expect(container.textContent).toContain('HOME');

    click(container);

    expect(container.textContent).toContain('SETTINGS');
    expect(container.textContent).not.toContain('HOME');
  });

  it('renders an inline destination, which has no path and needs none (§A17.6)', () => {
    // The case `BRG3008` refuses. Its stated blocker was the missing URL; the kit never wanted one —
    // what was missing was this.
    const { container } = app(
      (router) => router.push({ kind: 'component', component: 'detail-id' }),
      { components: { 'detail-id': Detail } },
    );

    click(container);

    expect(container.textContent).toContain('DETAIL');
  });

  it('goes back on pop', () => {
    const { container } = app((router) => {
      if (router.canPop.get()) {
        router.pop();
      } else {
        router.push({ kind: 'route', route: 'settings' });
      }
    });

    click(container);
    expect(container.textContent).toContain('SETTINGS');

    click(container);
    expect(container.textContent).toContain('HOME');
  });

  it('replace swaps the top without growing the stack', () => {
    const { container } = app((router) => router.replace({ kind: 'route', route: 'settings' }));

    click(container);

    expect(container.textContent).toContain('SETTINGS');
  });
});

describe('a destination it cannot render', () => {
  it('renders the fallback rather than throwing', () => {
    // A missing entry means the generated project is inconsistent with itself. Throwing would replace a
    // blank region with a crashed application — the same information, delivered by destroying the rest
    // of the screen.
    const { container } = app((router) => router.push({ kind: 'component', component: 'unregistered' }), {
      fallback: createElement('span', null, 'MISSING'),
    });

    click(container);

    expect(container.textContent).toContain('MISSING');
  });

  it('renders nothing when no fallback is given, and does not throw', () => {
    const { container } = app((router) => router.push({ kind: 'component', component: 'unregistered' }));

    expect(() => click(container)).not.toThrow();
    expect(container.textContent).not.toContain('HOME');
  });

  it('keeps route names and component ids in separate namespaces', () => {
    // Merging the two maps would make a route called `detail` and a component whose identity is `detail`
    // the same key. The collision would be silent — the wrong screen, not an error.
    const { container } = app((router) => router.push({ kind: 'component', component: 'settings' }), {
      components: { settings: Detail },
    });

    click(container);

    // `settings` as a *component* identity must resolve to Detail, not to the route's Settings.
    expect(container.textContent).toContain('DETAIL');
    expect(container.textContent).not.toContain('SETTINGS');
  });
});
