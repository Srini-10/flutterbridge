// @vitest-environment jsdom

import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import {
  AssetImage,
  AssetProvider,
  Card,
  Container,
  ExactAssetImage,
  Icon,
  IconData,
  Image,
  MemoryImage,
  NetworkImage,
  Opacity,
  ThemeProvider,
  ICON_DEFAULTS,
  componentDefault,
  resolveImage,
  surfaceTintOpacity,
  type AssetManifest,
  type ThemeDescriptor,
} from '../src/index.js';

// The asset layer and the Material family it unlocked (M4-C).
//
// Flutter names an image's bytes with an `ImageProvider`; `Image.asset` and `Image.network` are sugar over
// one. Resolution is a pure function of the provider and the generated manifest, which is what lets an
// `<img>` server-render to the markup it hydrates into — `ssr.test.ts` asserts that half.

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

/** The shape the generator emits, in miniature. */
const manifest: AssetManifest = {
  assets: { 'images/logo.png': '/assets/images/logo.png', 'packages/kit/i/a.png': '/assets/packages/kit/i/a.png' },
};

const theme: ThemeDescriptor = {
  tokens: [
    { name: 'surface', group: 'color', role: 'surface', light: '#FFFEF7FF', dark: '#FF141218' },
    { name: 'surfaceTint', group: 'color', role: 'surfaceTint', light: '#FF6750A4', dark: '#FFD0BCFF' },
    { name: 'outlineVariant', group: 'color', role: 'outlineVariant', light: '#FFCAC4D0' },
    { name: 'primary', group: 'color', role: 'primary', light: '#FF6750A4' },
  ],
};

/** Renders with both a manifest and a theme in scope, as the generated scaffold does. */
function app(element: ReactElement): HTMLElement {
  return render(
    createElement(ThemeProvider, { descriptor: theme }, createElement(AssetProvider, { manifest }, element)),
  );
}

describe('image providers resolve without a DOM, a fetch or a cache', () => {
  it('AssetImage resolves through the manifest', () => {
    expect(resolveImage(new AssetImage('images/logo.png'), manifest)).toEqual({
      src: '/assets/images/logo.png',
      scale: 1,
    });
  });

  it('a packaged asset is addressed the way Flutter addresses it', () => {
    // Flutter reads a dependency's asset as `packages/<package>/<path>`, and the manifest is keyed the same,
    // so the key is built once in the kit rather than by every caller.
    expect(resolveImage(new AssetImage('i/a.png', { package: 'kit' }), manifest).src).toBe(
      '/assets/packages/kit/i/a.png',
    );
  });

  it('ExactAssetImage carries its density through', () => {
    const resolved = resolveImage(new ExactAssetImage('images/logo.png', { scale: 2 }), manifest);
    expect(resolved).toEqual({ src: '/assets/images/logo.png', scale: 2 });
  });

  it('NetworkImage needs no manifest at all', () => {
    expect(resolveImage(new NetworkImage('https://example.com/a.png'), { assets: {} }).src).toBe(
      'https://example.com/a.png',
    );
  });

  it('MemoryImage becomes a data: URL with the media type its bytes declare', () => {
    // A PNG signature. The type is sniffed rather than assumed because a data: URL must state one, and a
    // browser handed the wrong type renders nothing at all.
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
    expect(resolveImage(new MemoryImage(png), { assets: {} }).src).toMatch(/^data:image\/png;base64,/);
  });

  it('bytes in no displayable format are refused rather than guessed at', () => {
    const nonsense = new Uint8Array([1, 2, 3, 4]);
    expect(() => resolveImage(new MemoryImage(nonsense), { assets: {} })).toThrow(/BRG4010/);
  });

  it('an asset the manifest does not carry is refused, not rendered broken', () => {
    // A broken <img> looks like a slow network, so a missing asset would be indistinguishable from a working
    // app until somebody looked closely.
    expect(() => resolveImage(new AssetImage('images/nope.png'), manifest)).toThrow(/BRG4010/);
  });
});

describe('Image renders all three of Flutter’s spellings', () => {
  it('Image.asset — the `name` prop the catalog named', () => {
    const img = only(app(createElement(Image, { name: 'images/logo.png', width: 40, fit: 'cover' })));
    expect(img.tagName).toBe('IMG');
    expect(img.getAttribute('src')).toBe('/assets/images/logo.png');
    expect(img.style.width).toBe('40px');
    expect(img.style.objectFit).toBe('cover');
  });

  it('Image.network — the `src` prop', () => {
    const img = only(app(createElement(Image, { src: 'https://example.com/a.png' })));
    expect(img.getAttribute('src')).toBe('https://example.com/a.png');
  });

  it('Image(image:) — an explicit provider', () => {
    const img = only(app(createElement(Image, { image: new AssetImage('images/logo.png') })));
    expect(img.getAttribute('src')).toBe('/assets/images/logo.png');
  });

  it('an absent semanticLabel is an empty alt — decorative, as in Flutter', () => {
    // A *missing* alt makes a screen reader announce the file name; an empty one means "decorative", which is
    // what `semanticLabel: null` means in Flutter.
    const img = only(app(createElement(Image, { name: 'images/logo.png' })));
    expect(img.getAttribute('alt')).toBe('');
  });
});

describe('Icon paints a codepoint, not a name', () => {
  it('renders the glyph in the font the IconData names', () => {
    const icon = only(app(createElement(Icon, { icon: new IconData({ codePoint: 0xe5f9 }) })));
    expect(icon.textContent).toBe(String.fromCodePoint(0xe5f9));
    expect(icon.style.fontFamily).toBe('MaterialIcons');
    // The default size is Material's, from the catalog — not a number written in the component.
    expect(icon.style.fontSize).toBe(`${Number(ICON_DEFAULTS['size'])}px`);
  });

  it('is hidden from assistive technology unless it is given a label', () => {
    const bare = only(app(createElement(Icon, { icon: new IconData({ codePoint: 0xe5f9 }) })));
    expect(bare.getAttribute('aria-hidden')).toBe('true');
    const labelled = only(
      app(createElement(Icon, { icon: new IconData({ codePoint: 0xe5f9 }), semanticLabel: 'favourite' })),
    );
    expect(labelled.getAttribute('aria-label')).toBe('favourite');
    expect(labelled.getAttribute('role')).toBe('img');
    expect(labelled.getAttribute('aria-hidden')).toBeNull();
  });
});

describe('the Material family reads its numbers from generated metadata', () => {
  it('Card takes its elevation, radius and margin from the catalog', () => {
    const card = only(app(createElement(Card, { child: 'x' })));
    expect(card.style.borderRadius).toBe(`${Number(componentDefault('Card', 'borderRadius'))}px`);
    expect(card.style.margin).toBe(`${Number(componentDefault('Card', 'margin'))}px`);
    // The surface is tinted by elevation — a colour, composed from two roles, never a literal (INV-20).
    expect(card.style.backgroundColor).toMatch(/^rgb\(/);
  });

  it('a raised Card is a different colour from a flat one', () => {
    const flat = only(app(createElement(Card, { elevation: 0, child: 'x' })));
    const raised = only(app(createElement(Card, { elevation: 12, child: 'x' })));
    expect(raised.style.backgroundColor).not.toBe(flat.style.backgroundColor);
  });

  it('the elevation curve interpolates the way Flutter’s does', () => {
    // Transcribed stops: 0→0.0, 1→0.05, 3→0.08, 6→0.11, 8→0.12, 12→0.14, linear between, clamped outside.
    expect(surfaceTintOpacity(0)).toBe(0);
    expect(surfaceTintOpacity(1)).toBe(0.05);
    expect(surfaceTintOpacity(12)).toBe(0.14);
    expect(surfaceTintOpacity(99)).toBe(0.14); // clamped
    // 2 is halfway between the 1.0 and 3.0 stops, so halfway between 0.05 and 0.08.
    expect(surfaceTintOpacity(2)).toBeCloseTo(0.065, 10);
  });

  it('Opacity is CSS opacity', () => {
    expect(only(render(createElement(Opacity, { opacity: 0.5, child: 'x' }))).style.opacity).toBe('0.5');
  });

  it('Container merges its concerns onto one element rather than nesting a div per concern', () => {
    // Nesting would change what a percentage resolves against, so a nested width: 100% would mean something
    // different from the one Flutter computes.
    const box = only(
      app(
        createElement(Container, {
          width: 120,
          padding: { top: 8, right: 8, bottom: 8, left: 8 },
          alignment: { x: 0, y: 0, directional: false },
          color: 'primary',
          child: 'x',
        }),
      ),
    );
    expect(box.children).toHaveLength(0); // the child is text; no wrapper divs
    expect(box.style.width).toBe('120px');
    expect(box.style.padding).toBe('8px');
    expect(box.style.justifyContent).toBe('center');
    expect(box.style.backgroundColor).toBe('rgb(103, 80, 164)');
  });

  it('an explicit size wins over the fill that alignment implies', () => {
    const box = only(app(createElement(Container, { width: 120, alignment: { x: 0, y: 0, directional: false } })));
    expect(box.style.width).toBe('120px');
  });
});
