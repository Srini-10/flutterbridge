// @vitest-environment jsdom

import { act, createElement, StrictMode, useRef, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  defineStore,
  RouterProvider,
  signal,
  StoreProvider,
  ThemeProvider,
  useDerived,
  useMountEffect,
  useRouter,
  useSignal,
  useSignalEffect,
  useStore,
  useTheme,
  useUnmountEffect,
  useUpdateEffect,
  type ThemeDescriptor,
} from '../src/index.js';

// The state facade (M3-A) — the graph on React, per ADR-4.
//
// ADR-4: "React is, ironically, the least signal-native target. The mismatch is absorbed by the state facade
// in `@bridge/runtime-react` ... over `useSyncExternalStore`, not by the IR." These tests are about that
// absorption: that a component re-renders when — and only when — the value it read changed, that a store's
// lifetime is its provider's (ADR-15), and that the Flutter lifecycle callbacks land where the catalog says.
//
// The environment is jsdom, opted into per-file rather than through a `vitest.config.ts`, so the other four
// suites keep running in Node with no DOM at all — which is also the evidence that the graph, stores, theme
// and router genuinely do not depend on React.
//
// No @testing-library: `react-dom/client` plus React's own `act` is the whole harness, and it keeps the
// package's dependency surface to react, react-dom and jsdom.

declare global {
  // React reads this to decide whether `act` is required. `var` is what `declare global` requires.
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<{ root: Root; container: HTMLElement }> = [];

/** Mounts `element` and returns its container plus an unmount. Torn down after every test. */
function render(element: ReactElement): { container: HTMLElement; unmount: () => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  const entry = { root, container };
  mounted.push(entry);
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      const index = mounted.indexOf(entry);
      if (index >= 0) mounted.splice(index, 1);
      container.remove();
    },
  };
}

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => entry.root.unmount());
    entry.container.remove();
  }
});

/** Counts renders of the component it is called in, without causing any. */
function useRenderCount(): number {
  const count = useRef(0);
  count.current += 1;
  return count.current;
}

const cartStore = defineStore('cart', ({ signal: state, derived, action }) => {
  const items = signal<readonly string[]>([]);
  const count = derived(() => items.get().length, 'count');
  const add = action((sku: string) => items.update((current) => [...current, sku]), 'add');
  // `state` is unused here; the store's own signal factory is exercised in store.test.ts.
  void state;
  return { items, count, add };
});

const theme: ThemeDescriptor = {
  tokens: [{ name: 'primary', group: 'color', light: '#6750A4', dark: '#D0BCFF' }],
};

describe('useSignal subscribes a component to a signal', () => {
  it('renders the current value and re-renders when it changes', () => {
    const count = signal(0);
    function Counter(): ReactElement {
      return createElement('span', null, String(useSignal(count)));
    }
    const { container } = render(createElement(Counter));
    expect(container.textContent).toBe('0');

    act(() => count.set(1));
    expect(container.textContent).toBe('1');
  });

  it('does not re-render for an equal write', () => {
    const count = signal(0);
    const renders = vi.fn();
    function Counter(): ReactElement {
      renders();
      return createElement('span', null, String(useSignal(count)));
    }
    render(createElement(Counter));
    renders.mockClear();

    act(() => count.set(0));

    // ADR-20 R3 reaching all the way to React: an equal write is not a change, so it is not a render.
    expect(renders).not.toHaveBeenCalled();
  });

  it('renders once for many writes in a batch', () => {
    const count = signal(0);
    const renders = vi.fn();
    function Counter(): ReactElement {
      renders();
      return createElement('span', null, String(useSignal(count)));
    }
    render(createElement(Counter));
    renders.mockClear();

    act(() => {
      count.set(1);
      count.set(2);
      count.set(3);
    });

    expect(renders).toHaveBeenCalledTimes(1);
    expect(renders.mock.calls).toHaveLength(1);
  });

  it('unsubscribes on unmount', () => {
    const count = signal(0);
    const renders = vi.fn();
    function Counter(): ReactElement {
      renders();
      return createElement('span', null, String(useSignal(count)));
    }
    const { unmount } = render(createElement(Counter));
    unmount();
    renders.mockClear();

    act(() => count.set(1));

    // An unmounted component's subscription must be gone, not merely inert: React would warn, and the graph
    // would keep the component's closure — and its props — alive for the process's lifetime.
    expect(renders).not.toHaveBeenCalled();
  });

  it('does not tear: two components reading one signal agree in a pass', () => {
    const count = signal(0);
    function Reader(): ReactElement {
      return createElement('span', null, String(useSignal(count)));
    }
    function Pair(): ReactElement {
      return createElement('div', null, createElement(Reader), createElement(Reader));
    }
    const { container } = render(createElement(Pair));
    act(() => count.set(7));

    // What `useSyncExternalStore` exists for. Reading external mutable state with `useState` + an effect
    // lets a concurrent render show two values for one signal in a single frame.
    expect(container.textContent).toBe('77');
  });
});

describe('useDerived', () => {
  it('re-renders only when the derived value changes', () => {
    const count = signal(1);
    const renders = vi.fn();
    function Gate(): ReactElement {
      renders();
      const positive = useDerived(() => count.get() > 0);
      return createElement('span', null, String(positive));
    }
    const { container } = render(createElement(Gate));
    renders.mockClear();

    act(() => count.set(2));
    act(() => count.set(3));

    // The signal changed twice; the derived value did not change at all. The component must not re-render.
    expect(renders).not.toHaveBeenCalled();
    expect(container.textContent).toBe('true');

    act(() => count.set(-1));
    expect(renders).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe('false');
  });

  it('rebuilds the derivation when its React dependencies change, and sees fresh props', () => {
    const items = signal<readonly string[]>(['apple', 'apricot', 'banana']);
    function Filtered({ prefix }: { prefix: string }): ReactElement {
      const matching = useDerived(
        () => items.get().filter((item) => item.startsWith(prefix)),
        [prefix],
      );
      return createElement('span', null, matching.join(','));
    }
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted.push({ root, container });

    act(() => root.render(createElement(Filtered, { prefix: 'ap' })));
    expect(container.textContent).toBe('apple,apricot');

    act(() => root.render(createElement(Filtered, { prefix: 'ba' })));
    // If the derivation held render #1's closure, this would still say `apple,apricot` — the classic stale
    // closure, and the reason the computation calls through a ref.
    expect(container.textContent).toBe('banana');
  });
});

describe('useSignalEffect', () => {
  it('runs on mount and re-runs when a signal it read changes', () => {
    const count = signal(0);
    const seen: number[] = [];
    function Watcher(): ReactElement {
      useSignalEffect(() => {
        seen.push(count.get());
      });
      return createElement('span');
    }
    render(createElement(Watcher));

    act(() => count.set(1));

    // No dependency array: the effect tracks what it read, dynamically. This is the difference from
    // `useEffect`, where the same code needs `[count]` kept in sync by hand.
    expect(seen).toEqual([0, 1]);
  });

  it('runs its cleanup on unmount', () => {
    const count = signal(0);
    const cleanup = vi.fn();
    function Watcher(): ReactElement {
      useSignalEffect(() => {
        count.get();
        return cleanup;
      });
      return createElement('span');
    }
    const { unmount } = render(createElement(Watcher));
    cleanup.mockClear();

    unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);

    act(() => count.set(1));
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});

describe('StoreProvider scopes a store to a subtree (ADR-15)', () => {
  it('provides a store its children can read and dispatch to', () => {
    function Count(): ReactElement {
      const cart = useStore(cartStore);
      return createElement('span', null, String(useSignal(cart.count)));
    }
    function App(): ReactElement {
      return createElement(StoreProvider, { definition: cartStore }, createElement(Count));
    }
    const { container } = render(createElement(App));
    expect(container.textContent).toBe('0');
  });

  it('re-renders a reader when an action writes', () => {
    let add: ((sku: string) => void) | null = null;
    function Count(): ReactElement {
      const cart = useStore(cartStore);
      add = cart.add;
      return createElement('span', null, String(useSignal(cart.count)));
    }
    const { container } = render(
      createElement(StoreProvider, { definition: cartStore }, createElement(Count)),
    );

    act(() => add?.('a'));
    expect(container.textContent).toBe('1');
  });

  it('gives two providers of one definition two separate stores', () => {
    const adders: Array<(sku: string) => void> = [];
    function Count(): ReactElement {
      const cart = useStore(cartStore);
      adders.push(cart.add);
      return createElement('span', null, String(useSignal(cart.count)));
    }
    const provider = (): ReactElement =>
      createElement(StoreProvider, { definition: cartStore }, createElement(Count));
    const { container } = render(createElement('div', null, provider(), provider()));

    act(() => adders[0]?.('a'));

    // ADR-15's defect, at the React boundary: two roots on one server process must not share a cart.
    expect(container.textContent).toBe('10');
  });

  it('lets an inner provider shadow an outer one', () => {
    const seen: number[] = [];
    function Count(): ReactElement {
      seen.push(useSignal(useStore(cartStore).count));
      return createElement('span');
    }
    let outerAdd: ((sku: string) => void) | null = null;
    function Outer(): ReactElement {
      outerAdd = useStore(cartStore).add;
      return createElement(StoreProvider, { definition: cartStore }, createElement(Count));
    }
    render(createElement(StoreProvider, { definition: cartStore }, createElement(Outer)));
    seen.length = 0;

    act(() => outerAdd?.('a'));

    // The inner component reads the inner store, so writing the outer one changes nothing it can see.
    expect(seen).toEqual([]);
  });

  it('disposes the store when the provider unmounts', () => {
    const cleanup = vi.fn();
    const watched = defineStore('watched', ({ signal: state, effect: watch }) => {
      const value = state(0);
      watch(() => {
        value.get();
        return cleanup;
      }, 'watcher');
      return { value };
    });
    function Child(): ReactElement {
      useStore(watched);
      return createElement('span');
    }
    const { unmount } = render(
      createElement(StoreProvider, { definition: watched }, createElement(Child)),
    );
    cleanup.mockClear();

    unmount();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('survives StrictMode’s mount/unmount/remount with a live store', () => {
    function Count(): ReactElement {
      const cart = useStore(cartStore);
      return createElement('span', null, String(useSignal(cart.count)));
    }
    const { container } = render(
      createElement(
        StrictMode,
        null,
        createElement(StoreProvider, { definition: cartStore }, createElement(Count)),
      ),
    );

    // StrictMode mounts, unmounts and remounts in development precisely to surface state that does not
    // survive it. Our unmount disposes the store and React keeps the `useState` value, so a naive provider
    // would remount onto a disposed store and throw BRG4003 on the first dispatch.
    expect(container.textContent).toBe('0');
  });

  it('throws BRG4005 when a store is read with no provider', () => {
    function Orphan(): ReactElement {
      useStore(cartStore);
      return createElement('span');
    }
    // React logs the error it re-throws; the assertion is about ours.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => render(createElement(Orphan))).toThrow(/BRG4005/);
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe('ThemeProvider', () => {
  it('provides a theme, and re-renders readers when brightness flips', () => {
    let flip: (() => void) | null = null;
    function Swatch(): ReactElement {
      const instance = useTheme();
      const color = useDerived(() => instance.token('primary'));
      flip = () => instance.brightness.set('dark');
      return createElement('span', null, String(color));
    }
    const { container } = render(
      createElement(ThemeProvider, { descriptor: theme }, createElement(Swatch)),
    );
    expect(container.textContent).toBe('#6750A4');

    act(() => flip?.());
    expect(container.textContent).toBe('#D0BCFF');
  });

  it('honours its starting brightness', () => {
    function Swatch(): ReactElement {
      return createElement('span', null, String(useDerived(() => useTheme().token('primary'))));
    }
    const { container } = render(
      createElement(
        ThemeProvider,
        { descriptor: theme, options: { brightness: 'dark' } },
        createElement(Swatch),
      ),
    );
    expect(container.textContent).toBe('#D0BCFF');
  });

  it('throws BRG4005 with no provider', () => {
    function Orphan(): ReactElement {
      useTheme();
      return createElement('span');
    }
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => render(createElement(Orphan))).toThrow(/BRG4005/);
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe('RouterProvider', () => {
  it('provides a router, and re-renders on navigation', () => {
    let go: (() => void) | null = null;
    function Screen(): ReactElement {
      const router = useRouter();
      go = () => router.push({ kind: 'route', route: 'product', params: { id: '7' } });
      return createElement('span', null, String(useSignal(router.current).path));
    }
    const { container } = render(
      createElement(
        RouterProvider,
        {
          descriptor: {
            routes: [
              { name: 'home', path: '/' },
              { name: 'product', path: '/product/:id' },
            ],
            initial: 'home',
          },
        },
        createElement(Screen),
      ),
    );
    expect(container.textContent).toBe('/');

    act(() => go?.());
    expect(container.textContent).toBe('/product/7');
  });

  it('throws BRG4005 with no provider', () => {
    function Orphan(): ReactElement {
      useRouter();
      return createElement('span');
    }
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => render(createElement(Orphan))).toThrow(/BRG4005/);
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe('lifecycle helpers land the Flutter callbacks where the catalog says', () => {
  it('useMountEffect runs once on mount and cleans up on unmount — initState/dispose', () => {
    const body = vi.fn();
    const cleanup = vi.fn();
    function Screen(): ReactElement {
      useMountEffect(() => {
        body();
        return cleanup;
      });
      return createElement('span');
    }
    const { unmount } = render(createElement(Screen));
    expect(body).toHaveBeenCalledTimes(1);
    expect(cleanup).not.toHaveBeenCalled();

    unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(body).toHaveBeenCalledTimes(1);
  });

  it('useUnmountEffect runs only on unmount — dispose', () => {
    const body = vi.fn();
    function Screen(): ReactElement {
      useUnmountEffect(body);
      return createElement('span');
    }
    const { unmount } = render(createElement(Screen));
    expect(body).not.toHaveBeenCalled();

    unmount();
    expect(body).toHaveBeenCalledTimes(1);
  });

  it('useUpdateEffect skips the first render — didUpdateWidget', () => {
    const body = vi.fn();
    function Screen({ value }: { value: number }): ReactElement {
      useUpdateEffect(body, [value]);
      return createElement('span', null, String(value));
    }
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted.push({ root, container });

    act(() => root.render(createElement(Screen, { value: 1 })));
    // `didUpdateWidget` does not run on the initial build. A plain `useEffect` here would run the body once
    // too often, forever — and usually converge to the same state, so no golden would ever catch it.
    expect(body).not.toHaveBeenCalled();

    act(() => root.render(createElement(Screen, { value: 2 })));
    expect(body).toHaveBeenCalledTimes(1);

    act(() => root.render(createElement(Screen, { value: 2 })));
    expect(body).toHaveBeenCalledTimes(1);

    act(() => root.render(createElement(Screen, { value: 3 })));
    expect(body).toHaveBeenCalledTimes(2);
  });
});

describe('a component renders only for the state it actually reads', () => {
  it('does not re-render a sibling that reads a different signal', () => {
    const first = signal(0);
    const second = signal(0);
    const firstRenders = vi.fn();
    const secondRenders = vi.fn();
    function First(): ReactElement {
      firstRenders();
      useRenderCount();
      return createElement('span', null, String(useSignal(first)));
    }
    function Second(): ReactElement {
      secondRenders();
      return createElement('span', null, String(useSignal(second)));
    }
    function App(): ReactNode {
      return createElement('div', null, createElement(First), createElement(Second));
    }
    render(createElement(App as () => ReactElement));
    firstRenders.mockClear();
    secondRenders.mockClear();

    act(() => first.set(1));

    // The point of the whole facade: state is fine-grained, so a write repaints the components that read it
    // and nothing else. A context holding a plain object would re-render both.
    expect(firstRenders).toHaveBeenCalledTimes(1);
    expect(secondRenders).not.toHaveBeenCalled();
  });
});
