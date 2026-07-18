// @vitest-environment jsdom

import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import {
  Badge,
  BorderRadius,
  BoxDecoration,
  Chip,
  CircleAvatar,
  CircularProgressIndicator,
  ClipRRect,
  ClipRect,
  ColoredBox,
  DecoratedBox,
  Flex,
  GridView,
  LinearProgressIndicator,
  ListTile,
  ListView,
  RichText,
  SelectableText,
  SingleChildScrollView,
  SliverGridDelegateWithFixedCrossAxisCount,
  ThemeProvider,
  Tooltip,
  componentDefault,
  type ThemeDescriptor,
} from '../src/index.js';

// M4-D's widget families. Every dimension these assert against is read back from the generated catalog
// metadata rather than written here — a test that hard-coded 32 would pass a component that had drifted from
// the SDK, which is the failure the catalog exists to prevent.

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

/** The single element rendered, as an `Element` — an `<svg>` is an `SVGElement`, not an `HTMLElement`. */
function onlyElement(container: HTMLElement): Element {
  const element = container.firstElementChild;
  if (element === null) throw new Error('nothing rendered');
  return element;
}

/** Every role the M4-D components paint, in the shape N10 emits. */
const theme: ThemeDescriptor = {
  tokens: [
    ['primary', '#FF6750A4'],
    ['onPrimary', '#FFFFFFFF'],
    ['primaryContainer', '#FFEADDFF'],
    ['onPrimaryContainer', '#FF21005D'],
    ['secondaryContainer', '#FFE8DEF8'],
    ['error', '#FFB3261E'],
    ['onError', '#FFFFFFFF'],
    ['surface', '#FFFEF7FF'],
    ['surfaceTint', '#FF6750A4'],
    ['onSurface', '#FF1D1B20'],
    ['onSurfaceVariant', '#FF49454F'],
    ['outlineVariant', '#FFCAC4D0'],
    ['inverseSurface', '#FF322F35'],
    ['onInverseSurface', '#FFF5EFF7'],
  ].map(([name, light]) => ({ name: name!, group: 'color' as const, role: name!, light: light! })),
};

function themed(element: ReactElement): HTMLElement {
  return render(createElement(ThemeProvider, { descriptor: theme }, element));
}

describe('scrolling', () => {
  it('ListView is a scrolling column whose children fill the cross axis', () => {
    const list = only(render(createElement(ListView, null, 'a', 'b')));
    expect(list.style.flexDirection).toBe('column');
    expect(list.style.overflowY).toBe('auto');
    // Tight cross axis: a ListView's children get the full width, unlike this kit's usual centred default.
    expect(list.style.alignItems).toBe('stretch');
    expect(list.style.height).toBe('100%');
  });

  it('shrinkWrap omits the extent rather than setting it to auto', () => {
    // `auto` is a real declaration that would override an inherited height on its way to meaning nothing.
    const list = only(render(createElement(ListView, { shrinkWrap: true })));
    expect(list.style.height).toBe('');
  });

  it('a horizontal list swaps which axis scrolls', () => {
    const list = only(render(createElement(ListView, { scrollDirection: 'horizontal' })));
    expect(list.style.flexDirection).toBe('row');
    expect(list.style.overflowX).toBe('auto');
    expect(list.style.overflowY).toBe('hidden');
  });

  it('SingleChildScrollView scrolls one child', () => {
    const box = only(render(createElement(SingleChildScrollView, { child: 'x' })));
    expect(box.style.overflowY).toBe('auto');
    expect(box.textContent).toBe('x');
  });

  it('GridView divides the cross axis into equal tracks', () => {
    const grid = only(
      render(createElement(GridView, { crossAxisCount: 3, mainAxisSpacing: 8, crossAxisSpacing: 4 }, 'a', 'b')),
    );
    expect(grid.style.display).toBe('grid');
    expect(grid.style.gridTemplateColumns).toBe('repeat(3, 1fr)');
    expect(grid.style.rowGap).toBe('8px');
    expect(grid.style.columnGap).toBe('4px');
  });

  it('GridView accepts a delegate as well as the loose props, and the delegate wins', () => {
    const grid = only(
      render(
        createElement(GridView, {
          crossAxisCount: 9,
          gridDelegate: new SliverGridDelegateWithFixedCrossAxisCount({ crossAxisCount: 2 }),
        }),
      ),
    );
    expect(grid.style.gridTemplateColumns).toBe('repeat(2, 1fr)');
  });

  it('each grid cell carries the aspect ratio, so the track sizes to the cells', () => {
    const grid = only(render(createElement(GridView, { crossAxisCount: 2, childAspectRatio: 2 }, 'a')));
    const cell = grid.firstElementChild as HTMLElement;
    expect(cell.style.aspectRatio).toBe('2 / 1');
  });

  it('Flex is a Row or a Column whose axis is a value', () => {
    expect(only(render(createElement(Flex, { direction: 'horizontal' }))).style.flexDirection).toBe('row');
    expect(only(render(createElement(Flex, { direction: 'vertical' }))).style.flexDirection).toBe('column');
  });
});

describe('clipping and decoration', () => {
  it('ClipRect clips to the box', () => {
    expect(only(render(createElement(ClipRect, { child: 'x' }))).style.overflow).toBe('hidden');
  });

  it('Clip.none disables clipping rather than forcing it', () => {
    // A clip widget set to `none` is a widget that does not clip; forcing overflow:hidden anyway would cut
    // off a child the author meant to overflow.
    expect(only(render(createElement(ClipRect, { clipBehavior: 'none', child: 'x' }))).style.overflow).toBe('');
  });

  it('ClipRRect rounds every corner it is given', () => {
    const box = only(render(createElement(ClipRRect, { borderRadius: BorderRadius.circular(12), child: 'x' })));
    expect(box.style.overflow).toBe('hidden');
    // The four corner longhands, not the shorthand: they are written individually so an unstated corner is
    // never left to a stylesheet, and jsdom's CSSOM does not recombine them.
    expect(box.style.borderTopLeftRadius).toBe('12px');
    expect(box.style.borderBottomRightRadius).toBe('12px');
  });

  it('BorderRadius mirrors Dart’s named constructors', () => {
    expect(BorderRadius.circular(4)).toEqual({ topLeft: 4, topRight: 4, bottomRight: 4, bottomLeft: 4 });
    expect(BorderRadius.vertical({ top: 8 })).toEqual({ topLeft: 8, topRight: 8, bottomRight: 0, bottomLeft: 0 });
    expect(BorderRadius.only({ topLeft: 2 })).toEqual({ topLeft: 2, topRight: 0, bottomRight: 0, bottomLeft: 0 });
  });

  it('DecoratedBox paints a role, never a literal (INV-20)', () => {
    const box = only(themed(createElement(DecoratedBox, { decoration: new BoxDecoration({ color: 'primary' }) })));
    expect(box.style.backgroundColor).toBe('rgb(103, 80, 164)');
  });

  it('a circular shape wins over an explicit radius, as it does in Flutter', () => {
    // Flutter's BoxDecoration asserts that a circle carries no borderRadius, so a decoration with both is one
    // Flutter would have rejected.
    const box = only(
      themed(
        createElement(DecoratedBox, {
          decoration: new BoxDecoration({ shape: 'circle', borderRadius: BorderRadius.circular(12) }),
        }),
      ),
    );
    expect(box.style.borderRadius).toBe('50%');
  });

  it('ColoredBox is a DecoratedBox with only a fill — the same definition, not a second one', () => {
    const colored = only(themed(createElement(ColoredBox, { color: 'primary', child: 'x' })));
    const decorated = only(
      themed(createElement(DecoratedBox, { decoration: { color: 'primary' }, child: 'x' })),
    );
    expect(colored.getAttribute('style')).toBe(decorated.getAttribute('style'));
  });
});

describe('Material components read every number from the catalog', () => {
  it('ListTile grows with its content: one line, two lines, three', () => {
    const one = only(themed(createElement(ListTile, { title: 'a' })));
    const two = only(themed(createElement(ListTile, { title: 'a', subtitle: 'b' })));
    const three = only(themed(createElement(ListTile, { title: 'a', subtitle: 'b', isThreeLine: true })));
    expect(one.style.minHeight).toBe(`${Number(componentDefault('ListTile', 'heightOneLine'))}px`);
    expect(two.style.minHeight).toBe(`${Number(componentDefault('ListTile', 'heightTwoLine'))}px`);
    expect(three.style.minHeight).toBe(`${Number(componentDefault('ListTile', 'heightThreeLine'))}px`);
  });

  it('ListTile places leading, text and trailing in that order', () => {
    const tile = only(themed(createElement(ListTile, { leading: 'L', title: 'T', trailing: 'R' })));
    expect(tile.children).toHaveLength(3);
    expect(tile.textContent).toBe('LTR');
  });

  it('Chip paints an outline and no fill, which is what the SDK does', () => {
    // `_ChipDefaultsM3.color` returns null with the comment "Subclasses override this getter" — a bare Chip
    // genuinely has no background default, so inventing one would be inventing.
    const chip = only(themed(createElement(Chip, { label: 'x' })));
    expect(chip.style.height).toBe(`${Number(componentDefault('Chip', 'height'))}px`);
    expect(chip.style.borderColor).toBe('rgb(202, 196, 208)');
    expect(chip.style.backgroundColor).toBe('');
  });

  it('CircleAvatar is a circle of 2 × radius on both axes', () => {
    const avatar = only(themed(createElement(CircleAvatar, { child: 'FB' })));
    const diameter = Number(componentDefault('CircleAvatar', 'radius')) * 2;
    expect(avatar.style.width).toBe(`${diameter}px`);
    expect(avatar.style.height).toBe(`${diameter}px`);
    expect(avatar.style.borderRadius).toBe('50%');
  });

  it('Badge is a dot with no label and a pill with one', () => {
    const dot = only(themed(createElement(Badge, { child: 'x' })));
    const pill = only(themed(createElement(Badge, { label: '9', child: 'x' })));
    const marker = (box: HTMLElement): HTMLElement => box.lastElementChild as HTMLElement;
    expect(marker(dot).style.height).toBe(`${Number(componentDefault('Badge', 'smallSize'))}px`);
    expect(marker(pill).style.height).toBe(`${Number(componentDefault('Badge', 'largeSize'))}px`);
    expect(marker(pill).style.backgroundColor).toBe('rgb(179, 38, 30)');
  });

  it('an invisible badge renders its child and no marker', () => {
    const box = only(themed(createElement(Badge, { label: '9', child: 'x', isLabelVisible: false })));
    expect(box.textContent).toBe('x');
    expect(box.children).toHaveLength(0);
  });

  it('LinearProgressIndicator fills its track by the value', () => {
    const track = only(themed(createElement(LinearProgressIndicator, { value: 0.4 })));
    expect(track.style.height).toBe(`${Number(componentDefault('LinearProgressIndicator', 'minHeight'))}px`);
    expect((track.firstElementChild as HTMLElement).style.width).toBe('40%');
    expect(track.getAttribute('aria-valuenow')).toBe('40');
  });

  it('an indeterminate indicator says so to assistive technology rather than looking stuck', () => {
    const track = only(themed(createElement(LinearProgressIndicator, {})));
    expect(track.getAttribute('role')).toBe('progressbar');
    expect(track.getAttribute('aria-valuenow')).toBeNull();
  });

  it('CircularProgressIndicator is 36 logical pixels, because year2023 defaults true', () => {
    // The Material 3 spec says 40; Flutter 3.44's effective defaults class says 36. Reading the SDK rather
    // than the spec is the difference, and this pins it.
    const svg = onlyElement(themed(createElement(CircularProgressIndicator, { value: 0.5 })));
    expect(svg.getAttribute('width')).toBe('36');
    expect(Number(componentDefault('CircularProgressIndicator', 'size'))).toBe(36);
  });

  it('the ring’s dash offset is the unfilled fraction of its circumference', () => {
    const svg = onlyElement(themed(createElement(CircularProgressIndicator, { value: 0.25 })));
    const circle = svg.firstElementChild!;
    const radius = Number(circle.getAttribute('r'));
    const circumference = 2 * Math.PI * radius;
    expect(Number(circle.getAttribute('stroke-dasharray'))).toBeCloseTo(circumference, 6);
    expect(Number(circle.getAttribute('stroke-dashoffset'))).toBeCloseTo(circumference * 0.75, 6);
  });

  it('Tooltip attaches the platform tooltip and an accessible name', () => {
    const span = only(render(createElement(Tooltip, { message: 'a hint', child: 'x' })));
    expect(span.getAttribute('title')).toBe('a hint');
    expect(span.getAttribute('aria-label')).toBe('a hint');
  });
});

describe('display', () => {
  it('RichText renders a span tree as nested spans in one paragraph', () => {
    // Nesting is the point: every run shares the paragraph's line breaking, which a stack of Text widgets
    // cannot do.
    const p = only(
      themed(
        createElement(RichText, {
          text: { text: 'a ', children: [{ text: 'bold', fontWeight: 700 }] },
        }),
      ),
    );
    expect(p.tagName).toBe('P');
    expect(p.textContent).toBe('a bold');
    const nested = p.firstElementChild!.firstElementChild as HTMLElement;
    expect(nested.style.fontWeight).toBe('700');
  });

  it('a span paints a role, never a literal', () => {
    const p = only(themed(createElement(RichText, { text: { text: 'x', colorRole: 'primary' } })));
    expect((p.firstElementChild as HTMLElement).style.color).toBe('rgb(103, 80, 164)');
  });

  it('maxLines clamps by line count, which only the line-clamp box does', () => {
    const p = only(themed(createElement(RichText, { text: { text: 'x' }, maxLines: 2 })));
    expect(p.style.overflow).toBe('hidden');
    expect(p.style.getPropertyValue('-webkit-line-clamp')).toBe('2');
  });

  it('SelectableText opts into selection explicitly, so an ancestor cannot disable it', () => {
    const span = only(render(createElement(SelectableText, { data: 'pick me' })));
    expect(span.style.userSelect).toBe('text');
    expect(span.textContent).toBe('pick me');
  });
});
