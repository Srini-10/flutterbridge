// @vitest-environment jsdom

import { act, createElement, StrictMode, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  Duration,
  RuntimeError,
  SnackbarHostProvider,
  ThemeProvider,
  useSnackbarHost,
  type SnackbarHostHandle,
  type ThemeDescriptor,
} from '../src/index.js';

// ADR-0030's own runtime contract: a real FIFO queue (one visible at a time, §3.2/§10), duration-driven
// auto-advance, and — the milestone's own mandatory section — proof that React 18 Strict Mode's
// intentional double-invocation does not duplicate a presentation. The harness is `widgets.test.ts`'s,
// deliberately unchanged.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const theme: ThemeDescriptor = {
  tokens: [
    { name: 'inverseSurface', group: 'color', light: '#303030' },
    { name: 'onInverseSurface', group: 'color', light: '#FFFFFF' },
    { name: 'inversePrimary', group: 'color', light: '#90CAF9' },
  ],
};

const mounted: Array<{ root: Root; container: HTMLElement }> = [];

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
      container.remove();
    },
  };
}

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

/** A component that captures the host handle for the test to drive directly, and renders nothing itself. */
function HostCapture({ onReady }: { readonly onReady: (host: SnackbarHostHandle) => void }): ReactElement {
  onReady(useSnackbarHost());
  return createElement('div');
}

function withProvider(onReady: (host: SnackbarHostHandle) => void): ReactElement {
  return createElement(
    ThemeProvider,
    { descriptor: theme },
    createElement(SnackbarHostProvider, null, createElement(HostCapture, { onReady })),
  );
}

describe('SnackbarHostProvider — ScaffoldMessenger/SnackBar presentation (ADR-0030)', () => {
  it('show() displays content, with role="status"', () => {
    let host!: SnackbarHostHandle;
    const { container } = render(withProvider((h) => (host = h)));
    act(() => host.show('Saved'));
    const status = container.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status?.textContent).toContain('Saved');
  });

  it('a second show() while one is presented QUEUES — it is not visible until the first is gone (real FIFO, ADR-0030 §3.2/§10)', () => {
    vi.useFakeTimers();
    try {
      let host!: SnackbarHostHandle;
      const { container } = render(withProvider((h) => (host = h)));

      act(() => host.show('first', { duration: new Duration({ seconds: 2 }) }));
      act(() => host.show('second', { duration: new Duration({ seconds: 2 }) }));

      expect(container.textContent).toContain('first');
      expect(container.textContent).not.toContain('second');

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(container.textContent).not.toContain('first');
      expect(container.textContent).toContain('second');
    } finally {
      vi.useRealTimers();
    }
  });

  it('duration-driven auto-advance uses the given Duration, not a hard-coded one', () => {
    vi.useFakeTimers();
    try {
      let host!: SnackbarHostHandle;
      const { container } = render(withProvider((h) => (host = h)));

      act(() => host.show('short', { duration: new Duration({ milliseconds: 500 }) }));
      act(() => {
        vi.advanceTimersByTime(499);
      });
      expect(container.textContent).toContain('short');

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(container.textContent).not.toContain('short');
    } finally {
      vi.useRealTimers();
    }
  });

  it('hideCurrentSnackBar/removeCurrentSnackBar both advance the queue immediately (ADR-0030 §12: no animation distinction attempted)', () => {
    let host!: SnackbarHostHandle;
    const { container } = render(withProvider((h) => (host = h)));

    act(() => host.show('first'));
    act(() => host.show('second'));
    expect(container.textContent).toContain('first');

    act(() => host.hide());
    expect(container.textContent).toContain('second');

    act(() => host.show('third'));
    act(() => host.remove());
    expect(container.textContent).toContain('third');
  });

  it('clearSnackBars drops the current presentation and the whole queue', () => {
    let host!: SnackbarHostHandle;
    const { container } = render(withProvider((h) => (host = h)));

    act(() => host.show('first'));
    act(() => host.show('second'));
    act(() => host.clear());

    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('the action button fires onPress and the snack bar advances, with no explicit dismiss call needed (ADR-0030 §11)', () => {
    let host!: SnackbarHostHandle;
    const { container } = render(withProvider((h) => (host = h)));
    const onPress = vi.fn();

    act(() => host.show('Item deleted', { action: { label: 'Undo', onPress } }));
    const button = container.querySelector('button');
    expect(button?.textContent).toBe('Undo');

    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('useSnackbarHost() throws BRG4005 outside a provider (ADR-15: provider-scoped, never a module singleton)', () => {
    let thrown: unknown;
    function Bare(): ReactElement {
      try {
        useSnackbarHost();
      } catch (error) {
        thrown = error;
      }
      return createElement('div');
    }
    render(createElement(Bare));
    expect(thrown).toBeInstanceOf(RuntimeError);
    expect((thrown as RuntimeError).code).toBe('BRG4005');
  });

  // ── React 18 Strict Mode / duplication audit (ADR-0030 §10, mandatory) ──────────────────────────

  it('Strict Mode’s intentional double-invocation does not duplicate a presentation: one call, one snack bar', () => {
    let host!: SnackbarHostHandle;
    const { container } = render(createElement(StrictMode, null, withProvider((h) => (host = h))));

    act(() => host.show('Saved'));

    const statuses = container.querySelectorAll('[role="status"]');
    expect(statuses).toHaveLength(1);
    expect(container.textContent?.match(/Saved/g)).toHaveLength(1);
  });

  it('Strict Mode’s mount/unmount/remount cycle does not replay a presentation that was never shown', () => {
    // The concern this guards against: if the queue were ever seeded from a ref/effect that runs on
    // mount (rather than purely from `show()`'s own call-site invocation), Strict Mode's development-only
    // extra mount/unmount/remount pass would surface a phantom presentation. It does not, because nothing
    // in this host's own mount path enqueues anything — only `show()` does, and Strict Mode does not
    // replay a plain function call, only render bodies and effects.
    let host: SnackbarHostHandle | undefined;
    const { container } = render(createElement(StrictMode, null, withProvider((h) => (host = h))));
    expect(host).toBeDefined();
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('two events in sequence produce two snack bars, in order — Strict Mode does not merge or drop either', () => {
    vi.useFakeTimers();
    try {
      let host!: SnackbarHostHandle;
      const { container } = render(createElement(StrictMode, null, withProvider((h) => (host = h))));

      act(() => host.show('first', { duration: new Duration({ seconds: 1 }) }));
      act(() => host.show('second', { duration: new Duration({ seconds: 1 }) }));
      expect(container.textContent).toContain('first');

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(container.textContent).toContain('second');
      expect(container.textContent).not.toContain('first');
    } finally {
      vi.useRealTimers();
    }
  });
});
