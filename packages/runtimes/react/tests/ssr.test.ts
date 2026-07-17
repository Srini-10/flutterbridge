import { createElement, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  defineStore,
  StoreProvider,
  ThemeProvider,
  useDerived,
  useSignal,
  useStore,
  useTheme,
  type ThemeDescriptor,
} from '../src/index.js';

// Server rendering (M3-A) — ADR-15's defect, as a test.
//
// ## Why this file exists at all
//
// ADR-15 is the one place the platform deliberately refuses fidelity, and it was written about *this*:
//
// > `final CartStore cartStore = CartStore();` ... In Flutter that singleton is **one user**. In a Next.js
// > server process, **a module is shared across every request**. If a component that touches such a store is
// > server-rendered, **one user can be served another user's cart.** This is a correctness and privacy
// > defect, not a styling one — and note that *no golden, no pixel diff, and no visual verifier would ever
// > have caught it*.
//
// So it is caught here, where it lives: two requests rendered from one module, asserted not to see each
// other. The rest of the suite proves stores are independent; this proves it on the server, which is the
// only place the defect is a privacy breach rather than a bug.
//
// ## No DOM
//
// This file runs in vitest's default Node environment — no jsdom, no `document`. That is deliberate: a
// server render has no DOM, and if the kit needed one, `renderToString` would fail here rather than in
// someone's production build.

/** The store ADR-15 found, in the shape the generator will emit it. */
const cartStore = defineStore('cart', ({ signal, derived, action }) => {
  const items = signal<readonly string[]>([]);
  const count = derived(() => items.get().length, 'count');
  const add = action((sku: string) => items.update((current) => [...current, sku]), 'add');
  return { items, count, add };
});

const theme: ThemeDescriptor = {
  tokens: [{ name: 'primary', group: 'color', light: '#6750A4', dark: '#D0BCFF' }],
};

function Count(): ReactElement {
  const cart = useStore(cartStore);
  return createElement('span', null, String(useSignal(cart.count)));
}

/** One request: a fresh provider tree, exactly as a server component root would build it. */
function renderRequest(prime?: (add: (sku: string) => void) => void): string {
  function Root(): ReactElement {
    const cart = useStore(cartStore);
    prime?.(cart.add);
    return createElement(Count);
  }
  return renderToString(createElement(StoreProvider, { definition: cartStore }, createElement(Root)));
}

describe('a store rendered on the server is scoped to its request', () => {
  it('renders', () => {
    expect(renderRequest()).toContain('0');
  });

  it('does not leak one request’s state into the next', () => {
    // Request A puts something in its cart.
    const first = renderRequest((add) => add('a'));
    expect(first).toContain('1');

    // Request B, from the same module, in the same process.
    const second = renderRequest();

    // This is the assertion ADR-15 exists for. A module-scope `CartStore` would render `1` here, and would
    // have served user B the contents of user A's cart. The definition is module-scope; the instance is not.
    expect(second).toContain('0');
  });

  it('keeps concurrent request trees independent', () => {
    // Two provider trees in one render pass — the shape of a server rendering two roots.
    const primed = (): ReactElement =>
      createElement(
        StoreProvider,
        { definition: cartStore },
        createElement(function Priming(): ReactElement {
          const cart = useStore(cartStore);
          cart.add('a');
          return createElement(Count);
        }),
      );
    const empty = (): ReactElement =>
      createElement(StoreProvider, { definition: cartStore }, createElement(Count));

    const html = renderToString(createElement('div', null, primed(), empty()));

    expect(html).toContain('1');
    expect(html).toContain('0');
  });

  it('uses the server snapshot without a subscription', () => {
    // `useSyncExternalStore`'s third argument. Without it React throws on the server, because there is
    // nothing to subscribe to and no way to tear. ADR-15's per-request scoping is what makes "current" an
    // unambiguous answer here.
    expect(() => renderRequest()).not.toThrow();
  });
});

describe('the theme renders on the server', () => {
  it('resolves tokens with no DOM present', () => {
    function Swatch(): ReactElement {
      return createElement('span', null, String(useDerived(() => useTheme().token('primary'))));
    }
    const html = renderToString(
      createElement(ThemeProvider, { descriptor: theme }, createElement(Swatch)),
    );
    expect(html).toContain('#6750A4');
  });

  it('does not leak brightness between requests', () => {
    function Swatch(): ReactElement {
      const instance = useTheme();
      // A render-phase write, standing in for a request that resolves its own brightness.
      instance.brightness.set('dark');
      return createElement('span', null, String(useDerived(() => instance.token('primary'))));
    }
    const dark = renderToString(
      createElement(ThemeProvider, { descriptor: theme }, createElement(Swatch)),
    );
    expect(dark).toContain('#D0BCFF');

    function PlainSwatch(): ReactElement {
      return createElement('span', null, String(useDerived(() => useTheme().token('primary'))));
    }
    const light = renderToString(
      createElement(ThemeProvider, { descriptor: theme }, createElement(PlainSwatch)),
    );

    // Brightness is mutable state, so it is subject to ADR-15 exactly as a cart is: on a shared module, this
    // would be one user's dark mode on another user's screen.
    expect(light).toContain('#6750A4');
  });
});
