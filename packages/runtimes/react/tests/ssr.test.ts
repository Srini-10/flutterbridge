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
  useThemeSurface,
  AssetProvider,
  Divider,
  Icon,
  IconData,
  Image,
  type AssetManifest,
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

// ── M4-B: the theme surface renders on the server ─────────────────────────────────────────────────
//
// The surface is what every Material component reads a colour through, so if it needed a DOM, every themed
// widget would be client-only — and the whole App Router shape ADR-16 pins would be unavailable to them.
// These render with `renderToString` in the Node environment this file runs in: no jsdom, no `window`, no
// `matchMedia`. A regression that reached for one would fail here rather than in someone's production build.

describe('the theme surface is server-renderable (M4-B)', () => {
  /** A theme with the roles a Material component paints, in the shape N10 emits. */
  const material: ThemeDescriptor = {
    tokens: [
      { name: 'outlineVariant', group: 'color', role: 'outlineVariant', light: '#FFCAC4D0', dark: '#FF49454F' },
      { name: 'surface', group: 'color', role: 'surface', light: '#FFFEF7FF', dark: '#FF141218' },
      { name: 'surfaceTint', group: 'color', role: 'surfaceTint', light: '#FF6750A4', dark: '#FFD0BCFF' },
      { name: 'elevation1', group: 'shadow', light: 0.05 },
      { name: 'gap', group: 'space', light: 8 },
    ],
  };

  it('resolves a role to a CSS colour with no DOM present', () => {
    function Rule(): ReactElement {
      const surface = useThemeSurface();
      return createElement('hr', { style: { borderColor: surface.color('outlineVariant') } });
    }
    const html = renderToString(createElement(ThemeProvider, { descriptor: material }, createElement(Rule)));
    // The CSS form, never the #AARRGGBB interchange form — a hex in a style attribute would be read by the
    // browser as #RRGGBBAA and shift every channel by a byte (ADR-21).
    expect(html).toContain('rgb(202 196 208)');
    expect(html).not.toContain('#FFCAC4D0');
  });

  it('renders a real themed widget — Divider — on the server', () => {
    const html = renderToString(
      createElement(ThemeProvider, { descriptor: material }, createElement(Divider, { height: 8 })),
    );
    expect(html).toContain('rgb(202 196 208)');
  });

  it('server output matches the brightness the request was created with', () => {
    const dark = renderToString(
      createElement(
        ThemeProvider,
        { descriptor: material, options: { brightness: 'dark' } },
        createElement(Divider, {}),
      ),
    );
    expect(dark).toContain('rgb(73 69 79)');
    // A second request at the default brightness must not see the first one's. Brightness lives in a
    // provider-scoped signal, so this is ADR-15's guarantee applied to the theme.
    const light = renderToString(
      createElement(ThemeProvider, { descriptor: material }, createElement(Divider, {})),
    );
    expect(light).toContain('rgb(202 196 208)');
  });

  it('composes an elevation from tokens rather than a hard-coded overlay table', () => {
    function Card(): ReactElement {
      const surface = useThemeSurface();
      return createElement('div', { style: { background: surface.elevation(1) } });
    }
    const html = renderToString(createElement(ThemeProvider, { descriptor: material }, createElement(Card)));
    // surface #FEF7FF tinted 5% toward surfaceTint #6750A4 — composition on the kit's side of ADR-13's line,
    // with the opacity coming from a `shadow`-group token rather than a table written into the kit.
    expect(html).toContain('rgb(');
    expect(html).not.toContain('#');
  });

  it('a missing token is a hole, not a default', () => {
    function Missing(): ReactElement {
      return createElement('div', { style: { color: useThemeSurface().color('tertiary') } });
    }
    expect(() =>
      renderToString(createElement(ThemeProvider, { descriptor: material }, createElement(Missing))),
    ).toThrow(/BRG4006/);
  });
});

// ── M4-C: assets server-render ────────────────────────────────────────────────────────────────────
//
// `resolveImage` is a pure function of the provider and the manifest — no fetch, no cache, no `document` —
// which is the whole reason an `<img>` can be server-rendered at all. A resolver that reached for a browser
// API would make every image client-only, and the mismatch would surface as a hydration error rather than as
// a clear failure. These run in this file's Node environment: no jsdom, no `window`.

describe('the asset layer is server-renderable (M4-C)', () => {
  const manifest: AssetManifest = { assets: { 'images/logo.png': '/assets/images/logo.png' } };

  it('resolves an asset to its served URL with no DOM present', () => {
    const html = renderToString(
      createElement(
        AssetProvider,
        { manifest },
        createElement(Image, { name: 'images/logo.png', width: 40 }),
      ),
    );
    expect(html).toContain('src="/assets/images/logo.png"');
    expect(html).toContain('width:40px');
  });

  it('renders an icon glyph on the server', () => {
    const html = renderToString(createElement(Icon, { icon: new IconData({ codePoint: 0xe5f9 }) }));
    expect(html).toContain('MaterialIcons');
    expect(html).toContain(String.fromCodePoint(0xe5f9));
  });

  it('a missing asset fails loudly on the server rather than rendering a broken img', () => {
    expect(() =>
      renderToString(
        createElement(AssetProvider, { manifest }, createElement(Image, { name: 'images/nope.png' })),
      ),
    ).toThrow(/BRG4010/);
  });

  it('two requests do not share a manifest', () => {
    // The manifest holds no per-request state, but the kit is a library: a module-scope manifest would mean
    // one per process, so a host rendering two generated apps would serve one app's assets to the other.
    const other: AssetManifest = { assets: { 'images/logo.png': '/other/logo.png' } };
    const first = renderToString(
      createElement(AssetProvider, { manifest }, createElement(Image, { name: 'images/logo.png' })),
    );
    const second = renderToString(
      createElement(AssetProvider, { manifest: other }, createElement(Image, { name: 'images/logo.png' })),
    );
    expect(first).toContain('/assets/images/logo.png');
    expect(second).toContain('/other/logo.png');
  });
});
