// @vitest-environment jsdom

import { act, createElement, StrictMode, useState, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { useDidUpdateWidget, useInitState, useLifecycle } from '../src/index.js';

// The lifecycle hooks generated code uses for `initState` / `dispose` / `didUpdateWidget` (ADR-0052). Each property is
// one a Flutter `State` has and a bare `useEffect` does not.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<{ root: Root; container: HTMLElement }> = [];
function render(element: ReactElement): { rerender(next: ReactElement): void; unmount(): void; container: HTMLElement } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  mounted.push({ root, container });
  return {
    container,
    rerender: (next) => act(() => root.render(next)),
    unmount: () => act(() => root.unmount()),
  };
}
afterEach(() => {
  for (const entry of mounted.splice(0)) {
    try {
      act(() => entry.root.unmount());
    } catch {
      /* already unmounted */
    }
    entry.container.remove();
  }
});

describe('useInitState', () => {
  it('runs during the first render, before anything is drawn', () => {
    const seen: string[] = [];
    function C(): ReactElement {
      useInitState(() => seen.push('init'));
      seen.push('render');
      return createElement('i');
    }
    render(createElement(C));
    expect(seen.slice(0, 2)).toEqual(['init', 'render']);
  });

  it('runs once per mount, not once per render', () => {
    let runs = 0;
    function C(): ReactElement {
      const [, set] = useState(0);
      useInitState(() => runs++);
      return createElement('button', { onClick: () => set((n) => n + 1) });
    }
    const view = render(createElement(C));
    act(() => (view.container.querySelector('button') as HTMLButtonElement).click());
    act(() => (view.container.querySelector('button') as HTMLButtonElement).click());
    expect(runs).toBe(1);
  });
});

describe('useLifecycle', () => {
  it('init runs after the first commit, dispose exactly once on unmount', () => {
    const events: string[] = [];
    function C(): ReactElement {
      useLifecycle({ init: () => events.push('init'), dispose: () => events.push('dispose') });
      return createElement('i');
    }
    const view = render(createElement(C));
    expect(events).toEqual(['init']);
    view.unmount();
    expect(events).toEqual(['init', 'dispose']);
  });

  it('does not re-run on a re-render', () => {
    const events: string[] = [];
    function C(props: { n: number }): ReactElement {
      useLifecycle({ init: () => events.push('init'), dispose: () => events.push('dispose') });
      return createElement('i', null, props.n);
    }
    const view = render(createElement(C, { n: 1 }));
    view.rerender(createElement(C, { n: 2 }));
    view.rerender(createElement(C, { n: 3 }));
    expect(events).toEqual(['init']);
  });

  it('dispose sees the latest render’s closure — `widget.x` is the current widget, as in Flutter', () => {
    const disposed: number[] = [];
    function C(props: { n: number }): ReactElement {
      useLifecycle({ dispose: () => disposed.push(props.n) });
      return createElement('i');
    }
    const view = render(createElement(C, { n: 1 }));
    view.rerender(createElement(C, { n: 2 }));
    view.rerender(createElement(C, { n: 3 }));
    view.unmount();
    expect(disposed).toEqual([3]);
  });

  it('under StrictMode, init and dispose stay paired: init, dispose, init', () => {
    const events: string[] = [];
    function C(): ReactElement {
      useLifecycle({ init: () => events.push('init'), dispose: () => events.push('dispose') });
      return createElement('i');
    }
    const view = render(createElement(StrictMode, null, createElement(C)));
    expect(events).toEqual(['init', 'dispose', 'init']);
    view.unmount();
    expect(events).toEqual(['init', 'dispose', 'init', 'dispose']);
  });
});

describe('useDidUpdateWidget', () => {
  function Probe(props: { tag: string; log: string[] }): ReactElement {
    const [own, setOwn] = useState(0);
    useDidUpdateWidget(props, (old) => props.log.push(`${old.tag}>${props.tag}`));
    return createElement('button', { onClick: () => setOwn(own + 1) }, `${props.tag} ${own}`);
  }

  it('does not run on the first render', () => {
    const log: string[] = [];
    render(createElement(Probe, { tag: 'a', log }));
    expect(log).toEqual([]);
  });

  it('runs when the parent supplies new props, with the previous ones — even if they are equal', () => {
    const log: string[] = [];
    const view = render(createElement(Probe, { tag: 'a', log }));
    view.rerender(createElement(Probe, { tag: 'b', log }));
    view.rerender(createElement(Probe, { tag: 'b', log })); // equal, but a new props object: Flutter calls it too
    expect(log).toEqual(['a>b', 'b>b']);
  });

  it('does not run when the component re-renders for its own state', () => {
    const log: string[] = [];
    const view = render(createElement(Probe, { tag: 'a', log }));
    act(() => (view.container.querySelector('button') as HTMLButtonElement).click());
    act(() => (view.container.querySelector('button') as HTMLButtonElement).click());
    expect(view.container.textContent).toBe('a 2');
    expect(log).toEqual([]);
  });
});
