// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { StrictMode, act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { AsyncValue } from '../src/internal/riverpod/async_value.js';
import { defineFamily, defineProvider, type StateController } from '../src/internal/riverpod/container.js';
import { ProviderScope, useListen, useProviderContainer, useRead, useWatch } from '../src/internal/riverpod/react.js';

// The provider container behind React: what `ref.watch` in a widget (a subscription) and `ref.read` (none) do to a rendered tree,
// under StrictMode as well, which replays effects on the same instance.

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<{ root: Root; container: HTMLElement }> = [];
function render(element: ReactElement, strict = false): { container: HTMLElement; root: Root } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(strict ? createElement(StrictMode, null, element) : element));
  mounted.push({ root, container });
  return { container, root };
}
afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => entry.root.unmount());
    entry.container.remove();
  }
});

const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
};

const counter = defineProvider<number>('state', () => 0);
const setCounter = (container: { read: (t: never) => unknown }, value: number): void => {
  (container.read(counter.notifier as never) as StateController<number>).state = value;
};

describe('ref.watch in a widget', () => {
  it('re-renders when the watched provider changes, and only then', () => {
    let renders = 0;
    let scope!: ReturnType<typeof useProviderContainer>;
    const Watcher = (): ReactElement => {
      renders += 1;
      scope = useProviderContainer();
      return createElement('span', null, `n=${useWatch(counter)}`);
    };
    const { container } = render(createElement(ProviderScope, null, createElement(Watcher)));
    expect(container.textContent).toBe('n=0');
    const before = renders;

    act(() => setCounter(scope, 3));
    expect(container.textContent).toBe('n=3');
    expect(renders).toBeGreaterThan(before);

    const after = renders;
    act(() => setCounter(scope, 3)); // identical: nothing to react to
    expect(renders).toBe(after);
  });

  it('ref.read is not a subscription', () => {
    let renders = 0;
    let scope!: ReturnType<typeof useProviderContainer>;
    const Reader = (): ReactElement => {
      renders += 1;
      scope = useProviderContainer();
      const read = useRead(counter);
      return createElement('span', null, `n=${read()}`);
    };
    const { container } = render(createElement(ProviderScope, null, createElement(Reader)));
    const before = renders;
    act(() => setCounter(scope, 9));
    expect(renders).toBe(before);
    expect(container.textContent).toBe('n=0');
  });

  it('select narrows the re-renders to what it projects', () => {
    let renders = 0;
    let scope!: ReturnType<typeof useProviderContainer>;
    const Parity = (): ReactElement => {
      renders += 1;
      scope = useProviderContainer();
      return createElement('span', null, `odd=${useWatch(counter.select((v) => v % 2 === 1))}`);
    };
    const { container } = render(createElement(ProviderScope, null, createElement(Parity)));
    act(() => setCounter(scope, 1));
    expect(container.textContent).toBe('odd=true');
    const after = renders;
    act(() => setCounter(scope, 3)); // still odd
    expect(renders).toBe(after);
    act(() => setCounter(scope, 4));
    expect(container.textContent).toBe('odd=false');
  });

  it('ref.listen runs its callback with previous and next, and does not re-render', () => {
    const heard: string[] = [];
    let renders = 0;
    let scope!: ReturnType<typeof useProviderContainer>;
    const Listener = (): ReactElement => {
      renders += 1;
      scope = useProviderContainer();
      useListen(counter, (previous, next) => heard.push(`${previous}->${next}`));
      return createElement('span', null, 'x');
    };
    render(createElement(ProviderScope, null, createElement(Listener)));
    const before = renders;
    act(() => setCounter(scope, 2));
    expect(heard).toEqual(['0->2']);
    expect(renders).toBe(before);
  });
});

describe('lifetime under React', () => {
  it('an autoDispose provider is built once through StrictMode’s replay, and disposed after the widget goes', async () => {
    const log: string[] = [];
    const ap = defineProvider<number>(
      'provider',
      (ref) => {
        log.push('create');
        ref.onDispose(() => log.push('dispose'));
        return 1;
      },
      { autoDispose: true },
    );
    const Screen = (): ReactElement => createElement('span', null, `v=${useWatch(ap)}`);
    const { container, root } = render(createElement(ProviderScope, null, createElement(Screen)), true);
    await settle();
    expect(container.textContent).toBe('v=1');
    expect(log).toEqual(['create']);

    act(() => root.render(createElement(StrictMode, null, createElement(ProviderScope, null, null))));
    await settle();
    expect(log).toEqual(['create', 'dispose']);
  });

  it('the scope disposes its providers when it unmounts, and not on StrictMode’s simulated unmount', async () => {
    const log: string[] = [];
    const p = defineProvider<number>('provider', (ref) => {
      ref.onDispose(() => log.push('dispose'));
      return 1;
    });
    const Screen = (): ReactElement => createElement('span', null, `v=${useWatch(p)}`);
    const { root } = render(createElement(ProviderScope, null, createElement(Screen)), true);
    await settle();
    expect(log).toEqual([]);
    act(() => root.render(createElement('span', null, 'gone')));
    await settle();
    expect(log).toEqual(['dispose']);
  });

  it('a nested ProviderScope overrides for its subtree only', () => {
    const base = defineProvider<string>('provider', () => 'base');
    const Show = (): ReactElement => createElement('i', null, useWatch(base));
    const { container } = render(
      createElement(
        ProviderScope,
        null,
        createElement(Show),
        createElement(ProviderScope, { overrides: [base.overrideWithValue('inner')] }, createElement(Show)),
      ),
    );
    expect(Array.from(container.querySelectorAll('i')).map((i) => i.textContent)).toEqual(['base', 'inner']);
  });
});

describe('async providers in a widget', () => {
  it('shows loading, then data, and keeps the data while a refresh runs', async () => {
    let n = 0;
    const fp = defineProvider<AsyncValue<number>>('future', async () => {
      const id = ++n;
      await new Promise((resolve) => setTimeout(resolve, id === 1 ? 1 : 40));
      return id;
    });
    let scope!: ReturnType<typeof useProviderContainer>;
    const Screen = (): ReactElement => {
      scope = useProviderContainer();
      const value = useWatch(fp);
      return createElement('span', null, value.when({ data: (d) => `data ${d}`, loading: () => 'loading', error: () => 'error' }));
    };
    const { container } = render(createElement(ProviderScope, null, createElement(Screen)));
    expect(container.textContent).toBe('loading');
    await settle();
    expect(container.textContent).toBe('data 1');

    act(() => scope.invalidate(fp));
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toBe('data 1'); // refreshing: `when` skips the loading branch
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });
    expect(container.textContent).toBe('data 2');
  });

  it('a family member is one subscription however often the widget re-renders with an equal argument', async () => {
    let builds = 0;
    const byId = defineFamily<string, number>('provider', (_ref, id) => {
      builds += 1;
      return `item ${id}`;
    });
    let bump!: () => void;
    const Screen = (): ReactElement => {
      const scope = useProviderContainer();
      bump = () => scope.invalidate(byId(1));
      return createElement('span', null, useWatch(byId(1)));
    };
    const { container, root } = render(createElement(ProviderScope, null, createElement(Screen)));
    act(() => root.render(createElement(ProviderScope, null, createElement(Screen))));
    expect(container.textContent).toBe('item 1');
    expect(builds).toBe(1);
    void bump;
  });
});
