// @vitest-environment jsdom

import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  Align,
  Alignment,
  AlignmentDirectional,
  AspectRatio,
  Center,
  Column,
  ConstrainedBox,
  Directionality,
  Divider,
  FractionallySizedBox,
  Positioned,
  EdgeInsets,
  ElevatedButton,
  Expanded,
  Flexible,
  Padding,
  Row,
  SafeArea,
  safeAreaStyle,
  SizedBox,
  Spacer,
  Text,
  Stack,
  ThemeProvider,
  VerticalDivider,
  Wrap,
  type CrossAxisAlignment,
  type MainAxisAlignment,
  type ThemeDescriptor,
} from '../src/index.js';

// The widget layer (M3-A) — Flutter's layout vocabulary on flexbox, per ADR-6.
//
// ADR-6 states the choice these tests are about: `Row(mainAxisAlignment: spaceBetween)` compiles either into
// "a bespoke flexbox `<div>` at every call site, or into `<Row mainAxisAlignment="spaceBetween">` imported
// from a versioned runtime package". Everything below asserts the second thing works — that the enum tables
// are right, that Flutter's semantics survive the mapping (a null `onPressed` disables), and that the same
// props produce the same bytes, since a component that renders two ways for one input cannot be pixel-diffed
// against a Flutter reference at all (ADR-6's own correctness proof, Blueprint §3 M2-T12).
//
// The harness is `react.test.ts`'s, deliberately unchanged: `react-dom/client` plus React's own `act`, jsdom
// opted into per file so the Node suites keep proving the engines need no DOM, and no `vitest.config.ts`.

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

/**
 * A theme with the roles the Material components below paint — the shape N10 emits, in miniature.
 *
 * `outlineVariant` is the divider role. Both brightnesses are given so the dark-mode assertions have
 * something to resolve, and the values are ARGB hex (ADR-21) because that is what reaches a real theme.
 */
const materialTheme: ThemeDescriptor = {
  tokens: [
    { name: 'outlineVariant', group: 'color', role: 'outlineVariant', light: '#FFCAC4D0', dark: '#FF49454F' },
    { name: 'surface', group: 'color', role: 'surface', light: '#FFFEF7FF', dark: '#FF141218' },
    { name: 'surfaceTint', group: 'color', role: 'surfaceTint', light: '#FF6750A4', dark: '#FFD0BCFF' },
  ],
};

/**
 * Renders inside a `ThemeProvider`, which every themed component now requires.
 *
 * That requirement is the point of M4-B's theme surface rather than an inconvenience of it: a Material
 * component paints roles, and a role with no theme to resolve against is a hole (`BRG4006`) rather than a
 * colour to invent. INV-20 is the rule — "kit components contain no literal colour values" — and it is
 * enforceable exactly because there is nowhere for a component to get a colour except from here.
 */
function renderThemed(
  element: ReactElement,
  brightness: 'light' | 'dark' = 'light',
): { container: HTMLElement; unmount: () => void } {
  return render(
    createElement(ThemeProvider, { descriptor: materialTheme, options: { brightness } }, element),
  );
}

/** The single element a widget rendered. Fails loudly rather than returning null into an assertion. */
function only(container: HTMLElement): HTMLElement {
  const element = container.firstElementChild;
  if (!(element instanceof HTMLElement)) throw new Error('the widget rendered no element');
  return element;
}

describe('each widget renders', () => {
  it('Text renders its string into a span', () => {
    const { container } = render(createElement(Text, null, 'hello'));
    const span = only(container);

    // `<span>`, not `<div>`: Flutter's Text imposes no layout, and a block-level box would break a line in
    // every Row it appeared in.
    expect(span.tagName).toBe('SPAN');
    expect(span.textContent).toBe('hello');
  });

  it('Text accepts its string as a prop or as children', () => {
    const viaProp = render(createElement(Text, { children: 'hello' }));
    const viaChildren = render(createElement(Text, null, 'hello'));
    expect(viaProp.container.innerHTML).toBe(viaChildren.container.innerHTML);
  });

  it('Column renders a column-direction flex container holding its children', () => {
    const { container } = render(
      createElement(Column, null, createElement(Text, null, 'a'), createElement(Text, null, 'b')),
    );
    const div = only(container);
    expect(div.style.display).toBe('flex');
    expect(div.style.flexDirection).toBe('column');
    expect(div.textContent).toBe('ab');
  });

  it('Row renders a row-direction flex container holding its children', () => {
    const { container } = render(
      createElement(Row, null, createElement(Text, null, 'a'), createElement(Text, null, 'b')),
    );
    const div = only(container);
    expect(div.style.display).toBe('flex');
    expect(div.style.flexDirection).toBe('row');
    expect(div.textContent).toBe('ab');
  });

  it('Center centres its child on both axes and expands to fill', () => {
    const { container } = render(
      createElement(Center, { child: createElement(Text, null, 'hello') }),
    );
    const div = only(container);
    expect(div.style.display).toBe('flex');
    expect(div.style.justifyContent).toBe('center');
    expect(div.style.alignItems).toBe('center');
    // Flutter's Center is `Align(alignment: center)` with no size factors, which expands to its constraints.
    // A shrink-wrapped Center would centre its child inside exactly its child.
    expect(div.style.width).toBe('100%');
    expect(div.style.height).toBe('100%');
    expect(div.textContent).toBe('hello');
  });

  it('Padding renders its child inside an inset box', () => {
    const { container } = render(
      createElement(Padding, {
        padding: EdgeInsets.all(16),
        child: createElement(Text, null, 'hello'),
      }),
    );
    expect(only(container).textContent).toBe('hello');
  });

  it('SizedBox renders with a child', () => {
    const { container } = render(
      createElement(SizedBox, { width: 40, height: 20, child: createElement(Text, null, 'hi') }),
    );
    const div = only(container);
    expect(div.style.width).toBe('40px');
    expect(div.style.height).toBe('20px');
    expect(div.textContent).toBe('hi');
  });

  it('SizedBox renders without a child — the gap case', () => {
    const { container } = render(createElement(SizedBox, { height: 8 }));
    const div = only(container);
    expect(div.style.height).toBe('8px');
    expect(div.textContent).toBe('');
  });

  it('ElevatedButton renders a button holding its child', () => {
    const { container } = render(
      createElement(ElevatedButton, {
        onPressed: () => {},
        child: createElement(Text, null, 'Save'),
      }),
    );
    const button = only(container);
    expect(button.tagName).toBe('BUTTON');
    expect(button.textContent).toBe('Save');
  });

  it('widgets nest', () => {
    const { container } = render(
      createElement(
        Center,
        {
          child: createElement(
            Padding,
            {
              padding: EdgeInsets.symmetric({ vertical: 8 }),
              child: createElement(
                Column,
                { mainAxisAlignment: 'spaceBetween' },
                createElement(Text, null, 'a'),
                createElement(SizedBox, { height: 8 }),
                createElement(ElevatedButton, { onPressed: null, child: createElement(Text, null, 'b') }),
              ),
            },
          ),
        },
      ),
    );
    expect(container.textContent).toBe('ab');
    expect(container.querySelectorAll('div')).toHaveLength(4);
    expect(container.querySelector('button')?.disabled).toBe(true);
  });
});

describe('MainAxisAlignment maps onto justify-content', () => {
  // The table ADR-6 exists to state exactly once. `spaceBetween` is the ADR's own example.
  const cases: ReadonlyArray<readonly [MainAxisAlignment, string]> = [
    ['start', 'flex-start'],
    ['end', 'flex-end'],
    ['center', 'center'],
    ['spaceBetween', 'space-between'],
    ['spaceAround', 'space-around'],
    ['spaceEvenly', 'space-evenly'],
  ];

  it.each(cases)('Column %s → %s', (alignment, expected) => {
    const { container } = render(createElement(Column, { mainAxisAlignment: alignment }));
    expect(only(container).style.justifyContent).toBe(expected);
  });

  it.each(cases)('Row %s → %s', (alignment, expected) => {
    const { container } = render(createElement(Row, { mainAxisAlignment: alignment }));
    expect(only(container).style.justifyContent).toBe(expected);
  });

  it('defaults to start, as Flutter does', () => {
    const { container } = render(createElement(Row));
    expect(only(container).style.justifyContent).toBe('flex-start');
  });
});

describe('CrossAxisAlignment maps onto align-items', () => {
  const cases: ReadonlyArray<readonly [CrossAxisAlignment, string]> = [
    ['start', 'flex-start'],
    ['end', 'flex-end'],
    ['center', 'center'],
    ['stretch', 'stretch'],
    ['baseline', 'baseline'],
  ];

  it.each(cases)('Column %s → %s', (alignment, expected) => {
    const { container } = render(createElement(Column, { crossAxisAlignment: alignment }));
    expect(only(container).style.alignItems).toBe(expected);
  });

  it.each(cases)('Row %s → %s', (alignment, expected) => {
    const { container } = render(createElement(Row, { crossAxisAlignment: alignment }));
    expect(only(container).style.alignItems).toBe(expected);
  });

  it('defaults to center — Flutter’s default, not CSS’s', () => {
    const { container } = render(createElement(Row));

    // The divergence that would be silent if `align-items` were left off: CSS defaults to `stretch`, Flutter
    // to `center`. Every default Row would stretch every child to the tallest one's height.
    expect(only(container).style.alignItems).toBe('center');
    expect(only(container).style.alignItems).not.toBe('stretch');
  });
});

describe('MainAxisSize maps onto the main-axis extent', () => {
  it('Column max fills the height — which is what gives mainAxisAlignment free space to distribute', () => {
    const { container } = render(createElement(Column, { mainAxisSize: 'max' }));
    expect(only(container).style.height).toBe('100%');
  });

  it('Column min shrink-wraps the height', () => {
    const { container } = render(createElement(Column, { mainAxisSize: 'min' }));
    expect(only(container).style.height).toBe('fit-content');
  });

  it('Row max fills the width', () => {
    const { container } = render(createElement(Row, { mainAxisSize: 'max' }));
    expect(only(container).style.width).toBe('100%');
  });

  it('Row min shrink-wraps the width — `fit-content`, because `auto` would fill', () => {
    const { container } = render(createElement(Row, { mainAxisSize: 'min' }));

    // The reason the table does not use `auto`: on a block-level flex container `height: auto` shrink-wraps
    // but `width: auto` fills, so `auto` would mean `min` for Column and `max` for Row.
    expect(only(container).style.width).toBe('fit-content');
  });

  it('defaults to max, as Flutter does', () => {
    const column = render(createElement(Column));
    expect(only(column.container).style.height).toBe('100%');
    const row = render(createElement(Row));
    expect(only(row.container).style.width).toBe('100%');
  });

  it('constrains only the main axis, leaving the cross axis to the cross-axis alignment', () => {
    const column = render(createElement(Column, { mainAxisSize: 'min' }));
    expect(only(column.container).style.width).toBe('');
    const row = render(createElement(Row, { mainAxisSize: 'min' }));
    expect(only(row.container).style.height).toBe('');
  });
});

describe('ElevatedButton takes its enablement from onPressed (Flutter’s semantics)', () => {
  it('fires onPressed when pressed', () => {
    const onPressed = vi.fn();
    const { container } = render(createElement(ElevatedButton, { onPressed, child: 'Save' }));
    const button = container.querySelector('button');

    act(() => button?.click());

    expect(onPressed).toHaveBeenCalledTimes(1);
    expect(button?.disabled).toBe(false);
  });

  it('onPressed: null disables the button and does not fire', () => {
    const { container } = render(createElement(ElevatedButton, { onPressed: null, child: 'Save' }));
    const button = container.querySelector('button');
    expect(button?.disabled).toBe(true);

    const clicked = vi.fn();
    button?.addEventListener('click', clicked);
    act(() => button?.click());

    // Flutter's rule, which surprises everyone: `onPressed: null` *is* the disabled state — there is no
    // `enabled` prop. A converted app whose button reads `onPressed: valid ? submit : null` would submit an
    // invalid form if this were wrong, and no golden image would show it.
    expect(clicked).not.toHaveBeenCalled();
  });

  it('an omitted onPressed disables it too — the two absences agree', () => {
    const { container } = render(createElement(ElevatedButton, { child: 'Save' }));
    expect(container.querySelector('button')?.disabled).toBe(true);
  });

  it('an explicit undefined onPressed disables it too', () => {
    const onPressed: (() => void) | undefined = undefined;
    const { container } = render(createElement(ElevatedButton, { onPressed, child: 'Save' }));

    // Dart has one absence and TypeScript hands us two. If they rendered differently, "prop omitted" and
    // "prop passed as undefined" would be two different buttons — a distinction no Flutter source can make.
    expect(container.querySelector('button')?.disabled).toBe(true);
  });

  it('flips live between enabled and disabled', () => {
    const onPressed = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted.push({ root, container });

    act(() => root.render(createElement(ElevatedButton, { onPressed, child: 'Save' })));
    act(() => container.querySelector('button')?.click());
    expect(onPressed).toHaveBeenCalledTimes(1);

    act(() => root.render(createElement(ElevatedButton, { onPressed: null, child: 'Save' })));
    act(() => container.querySelector('button')?.click());

    // `onPressed: enabled ? handler : null` is the shape generated code has, so the transition is the case
    // that actually ships. A stale handler left attached here is a live button that renders as dead.
    expect(onPressed).toHaveBeenCalledTimes(1);
    expect(container.querySelector('button')?.disabled).toBe(true);
  });

  it('is type="button", so it cannot submit a form Flutter never asked it to', () => {
    const { container } = render(createElement(ElevatedButton, { onPressed: () => {}, child: 'Save' }));

    // A `<button>` in a `<form>` defaults to `type="submit"` and navigates on click. Flutter's
    // ElevatedButton has no such behaviour, and the catalog maps `Form`, so the two will meet.
    expect(container.querySelector('button')?.type).toBe('button');
  });

  it('paints no colour of its own (INV-20)', () => {
    const { container } = render(createElement(ElevatedButton, { onPressed: () => {}, child: 'Save' }));
    const button = only(container);

    // ADR-13: "kit components contain no literal colour values". The container, its label and its state
    // layers are roles the theme resolves; ADR-13 measured what guessing one costs — Δ15/255 on a screen
    // that looked entirely finished. An unstyled button is a widget someone will finish.
    expect(button.style.backgroundColor).toBe('');
    expect(button.style.color).toBe('');
    expect(button.getAttribute('style')).toBeNull();
  });
});

describe('EdgeInsets mirrors Flutter’s named constructors', () => {
  it('all() insets every side', () => {
    expect(EdgeInsets.all(16)).toEqual({ top: 16, right: 16, bottom: 16, left: 16 });
  });

  it('symmetric() maps vertical to top/bottom and horizontal to left/right', () => {
    expect(EdgeInsets.symmetric({ vertical: 8, horizontal: 24 })).toEqual({
      top: 8,
      right: 24,
      bottom: 8,
      left: 24,
    });
  });

  it('symmetric() defaults an omitted axis to 0, as Dart does', () => {
    expect(EdgeInsets.symmetric({ vertical: 8 })).toEqual({ top: 8, right: 0, bottom: 8, left: 0 });
    expect(EdgeInsets.symmetric({ horizontal: 8 })).toEqual({ top: 0, right: 8, bottom: 0, left: 8 });
    expect(EdgeInsets.symmetric({})).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('only() sets named sides and zeroes the rest', () => {
    expect(EdgeInsets.only({ top: 8 })).toEqual({ top: 8, right: 0, bottom: 0, left: 0 });
    expect(EdgeInsets.only({ left: 4, right: 6 })).toEqual({ top: 0, right: 6, bottom: 0, left: 4 });
    // `only({})` is EdgeInsets.zero by construction, rather than by a constant that could drift from it.
    expect(EdgeInsets.only({})).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('returns a fresh object every call, so one Padding cannot alias another', () => {
    expect(EdgeInsets.all(8)).not.toBe(EdgeInsets.all(8));
    expect(EdgeInsets.all(8)).toEqual(EdgeInsets.all(8));
  });
});

describe('Padding transcribes EdgeInsets onto the four longhands', () => {
  it('all() reaches every side', () => {
    const { container } = render(createElement(Padding, { padding: EdgeInsets.all(16), child: 'x' }));
    const style = only(container).style;
    expect(style.paddingTop).toBe('16px');
    expect(style.paddingRight).toBe('16px');
    expect(style.paddingBottom).toBe('16px');
    expect(style.paddingLeft).toBe('16px');
  });

  it('symmetric() reaches the two axes', () => {
    const { container } = render(
      createElement(Padding, { padding: EdgeInsets.symmetric({ vertical: 8, horizontal: 24 }), child: 'x' }),
    );
    const style = only(container).style;
    expect(style.paddingTop).toBe('8px');
    expect(style.paddingBottom).toBe('8px');
    expect(style.paddingLeft).toBe('24px');
    expect(style.paddingRight).toBe('24px');
  });

  it('only() zeroes the sides it did not name, rather than omitting them', () => {
    const { container } = render(
      createElement(Padding, { padding: EdgeInsets.only({ top: 8 }), child: 'x' }),
    );
    const style = only(container).style;
    expect(style.paddingTop).toBe('8px');

    // Emitted as `0px`, not left out: an omitted longhand would inherit a `padding` from a stylesheet, and
    // `EdgeInsets.only({ top: 8 })` says the other three sides are zero.
    expect(style.paddingRight).toBe('0px');
    expect(style.paddingBottom).toBe('0px');
    expect(style.paddingLeft).toBe('0px');
  });

  it('states all four sides, however the CSSOM chooses to spell them', () => {
    const { container } = render(
      createElement(Padding, { padding: EdgeInsets.only({ top: 8 }), child: 'x' }),
    );

    // The four longhands are what this component sets; the CSSOM is free to serialise them back as the
    // `padding` shorthand, and does. That is the same declaration by a shorter name — `8px 0px 0px` is
    // top 8, left/right 0, bottom 0 — so the assertion is that every side is stated, not how it is spelled.
    expect(only(container).getAttribute('style')).toBe('padding: 8px 0px 0px;');
    expect(only(container).style.paddingLeft).toBe('0px');
  });
});

describe('SizedBox', () => {
  it('emits no declaration for an omitted dimension', () => {
    const { container } = render(createElement(SizedBox, { width: 40 }));
    const style = only(container).style;
    expect(style.width).toBe('40px');

    // Not `auto`: the catalog lists width/height in SizedBox's `transparentWithoutProps`, so a SizedBox with
    // neither is deletable — and one emitting `width: auto` would have overridden an inherited width on its
    // way to being nothing.
    expect(style.height).toBe('');
  });

  it('maps double.infinity to 100% rather than to an invalid declaration', () => {
    const { container } = render(createElement(SizedBox, { width: Infinity, height: 24 }));
    const style = only(container).style;

    // `SizedBox(width: double.infinity)` is ordinary Flutter. Templated naively it becomes `Infinitypx`,
    // which the browser drops silently: a box that fills in Flutter and hugs its content on the web.
    expect(style.width).toBe('100%');
    expect(style.height).toBe('24px');
  });

  it('keeps fractional logical pixels, which Flutter has and CSS shares', () => {
    const { container } = render(createElement(SizedBox, { width: 0.5 }));
    expect(only(container).style.width).toBe('0.5px');
  });
});

describe('determinism: same props → identical output', () => {
  // ADR-6's correctness proof for this package is a pixel comparison against a Flutter-rendered reference
  // (Blueprint §3, M2-T12). A component that renders two ways for one input cannot be compared against
  // anything, so this is a precondition of the gate rather than a nicety.
  const build = (): ReactElement =>
    createElement(
      Center,
      {
        child: createElement(
          Padding,
          {
            padding: EdgeInsets.symmetric({ vertical: 8, horizontal: 24 }),
            child: createElement(
              Row,
              { mainAxisAlignment: 'spaceBetween', crossAxisAlignment: 'stretch', mainAxisSize: 'min' },
              createElement(Text, null, 'Total'),
              createElement(SizedBox, { width: 8 }),
              createElement(ElevatedButton, { onPressed: null, child: createElement(Text, null, 'Pay') }),
            ),
          },
        ),
      },
    );

  it('renders byte-identical markup across two mounts', () => {
    const first = render(build());
    const second = render(build());
    expect(second.container.innerHTML).toBe(first.container.innerHTML);
  });

  it('renders byte-identical markup across a re-render of the same tree', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted.push({ root, container });

    act(() => root.render(build()));
    const first = container.innerHTML;
    act(() => root.render(build()));

    expect(container.innerHTML).toBe(first);
  });

  it('orders declarations identically, not merely equivalently', () => {
    const a = render(createElement(Row, { mainAxisAlignment: 'center', crossAxisAlignment: 'start' }));
    const b = render(createElement(Row, { mainAxisAlignment: 'center', crossAxisAlignment: 'start' }));

    // `style` attribute equality, not per-property equality: React writes properties in the object's key
    // order, so a style built by mutation in a props-dependent order would pass a property-by-property check
    // and still produce two different attribute strings — and two different bytes to diff.
    expect(b.container.innerHTML).toBe(a.container.innerHTML);
    expect(only(a.container).getAttribute('style')).toBe(
      'display: flex; flex-direction: row; justify-content: center; align-items: flex-start; width: 100%;',
    );
  });

  it('differs when a prop differs — the check has teeth', () => {
    const a = render(createElement(Row, { mainAxisAlignment: 'center' }));
    const b = render(createElement(Row, { mainAxisAlignment: 'spaceBetween' }));
    expect(b.container.innerHTML).not.toBe(a.container.innerHTML);
  });
});

// ── M4-A: flex children and Material rules ──
//
// These carry Flutter semantics the same way `flex.ts` does: the meaning lives in the kit, so the day one
// mapping is wrong it is wrong once. `flex` is a shorthand and the grow/shrink/basis triple is where the
// Flutter distinction lives, so it is what the checks read.
describe('M4-A widgets render Flutter semantics', () => {
  it('Expanded fills its share — grow N, basis 0, min 0 so it may shrink below content', () => {
    const div = only(render(createElement(Expanded, { flex: 2, child: createElement(Text, null, 'x') })).container);
    expect(div.style.flexGrow).toBe('2');
    expect(div.style.flexShrink).toBe('1');
    expect(div.style.flexBasis).toBe('0%');
    expect(div.style.minWidth).toBe('0px');
    expect(div.style.minHeight).toBe('0px');
    expect(div.textContent).toBe('x');
  });

  it('Expanded defaults flex to 1, as in Flutter', () => {
    const div = only(render(createElement(Expanded, { child: createElement(Text, null, 'x') })).container);
    expect(div.style.flexGrow).toBe('1');
  });

  it('Flexible is loose by default — basis auto, so a small child stays its size', () => {
    const div = only(render(createElement(Flexible, { child: createElement(Text, null, 'x') })).container);
    expect(div.style.flexGrow).toBe('1');
    expect(div.style.flexBasis).toBe('auto');
  });

  it('Flexible(fit: tight) is Expanded — basis 0', () => {
    const div = only(render(createElement(Flexible, { fit: 'tight', child: createElement(Text, null, 'x') })).container);
    expect(div.style.flexBasis).toBe('0%');
  });

  it('Spacer is empty flexible space — grows, paints nothing', () => {
    const div = only(render(createElement(Spacer, { flex: 3 })).container);
    expect(div.style.flexGrow).toBe('3');
    expect(div.textContent).toBe('');
  });

  it('Divider is a box of `height` with a centred line of `thickness`', () => {
    const box = only(renderThemed(createElement(Divider, { height: 24, thickness: 2 })).container);
    expect(box.style.height).toBe('24px');
    expect(box.style.alignItems).toBe('center'); // the line is centred vertically in the box
    const line = only(box);
    expect(line.style.borderBottomWidth).toBe('2px');
    expect(line.style.borderBottomStyle).toBe('solid');
  });

  it('Divider defaults height 16, thickness 1', () => {
    const box = only(renderThemed(createElement(Divider, {})).container);
    expect(box.style.height).toBe('16px');
    expect(only(box).style.borderBottomWidth).toBe('1px');
  });

  it('VerticalDivider is the 90°-rotated Divider — a box of `width`, a line with a right border', () => {
    const box = only(renderThemed(createElement(VerticalDivider, { width: 24, thickness: 2 })).container);
    expect(box.style.width).toBe('24px');
    expect(box.style.justifyContent).toBe('center');
    expect(only(box).style.borderRightWidth).toBe('2px');
  });

  it('same props → same bytes (ADR-6 determinism)', () => {
    const a = renderThemed(createElement(Divider, { height: 8, thickness: 1 }));
    const b = renderThemed(createElement(Divider, { height: 8, thickness: 1 }));
    expect(b.container.innerHTML).toBe(a.container.innerHTML);
  });

  // ── M4-B: the colour comes from the theme, and INV-20 holds ──

  // The expected strings are the **CSSOM's** serialisation, not the kit's: `cssColor` writes the CSS Color 4
  // space-separated form and every engine re-serialises an opaque colour to the legacy `rgb(r, g, b)`. That
  // round trip is worth asserting rather than bypassing — it is the proof the value parsed as a colour at
  // all, which a hex string in a `style` would not have.

  it('Divider paints the `outlineVariant` role, not a literal (INV-20)', () => {
    const box = only(renderThemed(createElement(Divider, {})).container);
    // #FFCAC4D0 is ARGB: opaque, 0xCA 0xC4 0xD0 → 202 196 208. Reading it as CSS's #RRGGBBAA would give
    // 255 202 196 with an alpha of 0.81 — the exact defect ADR-21 was written about.
    expect(only(box).style.borderBottomColor).toBe('rgb(202, 196, 208)');
  });

  it('Divider re-resolves its role in the dark theme', () => {
    const box = only(renderThemed(createElement(Divider, {}), 'dark').container);
    // #FF49454F — the dark-scheme outlineVariant. A hard-coded black-at-12% (which M4-A shipped) would be
    // invisible here, which is exactly the defect the theme surface removes.
    expect(only(box).style.borderBottomColor).toBe('rgb(73, 69, 79)');
  });

  it('a themed component outside a ThemeProvider refuses rather than defaulting', () => {
    // BRG4006/BRG4005 rather than a safe grey: "a theme with a hole in it still looks like a theme" (ADR-13).
    expect(() => render(createElement(Divider, {}))).toThrow(/BRG4005/);
  });
});

describe('M4-A positioning and overflow', () => {
  it('Wrap wraps, mapping spacing→column-gap and runSpacing→row-gap', () => {
    const div = only(render(createElement(Wrap, { spacing: 8, runSpacing: 4 }, createElement(Text, null, 'a'))).container);
    expect(div.style.display).toBe('flex');
    expect(div.style.flexWrap).toBe('wrap');
    expect(div.style.columnGap).toBe('8px');
    expect(div.style.rowGap).toBe('4px');
  });

  it('Wrap alignment reuses the justify-content table', () => {
    const div = only(render(createElement(Wrap, { alignment: 'spaceBetween' })).container);
    expect(div.style.justifyContent).toBe('space-between');
  });

  it('Stack is a positioning container — position: relative', () => {
    const div = only(render(createElement(Stack, null, createElement(Text, null, 'base'))).container);
    expect(div.style.position).toBe('relative');
    expect(div.textContent).toBe('base');
  });

  it('Positioned pins its child, writing only the offsets that are set', () => {
    const div = only(render(createElement(Positioned, { top: 4, left: 8, child: createElement(Text, null, 'x') })).container);
    expect(div.style.position).toBe('absolute');
    expect(div.style.top).toBe('4px');
    expect(div.style.left).toBe('8px');
    // right/bottom unset → not written (an absolute box with only top/left sizes to content, as in Flutter)
    expect(div.style.right).toBe('');
    expect(div.style.bottom).toBe('');
    expect(div.textContent).toBe('x');
  });

  it('a Positioned overlay inside a Stack — the common shape', () => {
    const { container } = render(
      createElement(
        Stack,
        null,
        createElement(SizedBox, { width: 40, height: 40 }),
        createElement(Positioned, { top: 2, right: 2, child: createElement(Text, null, '•') }),
      ),
    );
    const stack = only(container);
    expect(stack.style.position).toBe('relative');
    expect(stack.children).toHaveLength(2);
    expect((stack.children[1] as HTMLElement).style.position).toBe('absolute');
  });
});

// ── M4-B: the alignment model ─────────────────────────────────────────────────────────────────────
//
// One mapping layer for every Flutter alignment vocabulary. These tests are about the *sharing*: that `Wrap`
// and `Row` resolve `spaceBetween` through the same table, and that `Align` and `Center` agree on "centre".
// A regression here is two widgets drifting apart, which is the failure ADR-6 gives the kit to prevent.

describe('M4-B alignment model', () => {
  it('Align places its child, and fills its constraints as Flutter does', () => {
    const div = only(render(createElement(Align, { alignment: Alignment.bottomRight, child: 'x' })).container);
    expect(div.style.display).toBe('flex');
    expect(div.style.justifyContent).toBe('right');
    expect(div.style.alignItems).toBe('flex-end');
    // An Align with no size factors expands, or it would be placing its child within exactly the child.
    expect(div.style.width).toBe('100%');
    expect(div.style.height).toBe('100%');
  });

  it('Center is Align(center) — literally, not a second definition of centre', () => {
    const centre = only(render(createElement(Center, { child: 'x' })).container);
    const align = only(render(createElement(Align, { alignment: Alignment.center, child: 'x' })).container);
    expect(centre.getAttribute('style')).toBe(align.getAttribute('style'));
  });

  it('physical Alignment does not follow the text direction; directional does', () => {
    // The distinction that only shows up in RTL, and the reason `alignmentStyle` has its one branch.
    const physical = only(render(createElement(Align, { alignment: Alignment.centerLeft })).container);
    const logical = only(render(createElement(Align, { alignment: AlignmentDirectional.centerStart })).container);
    expect(physical.style.justifyContent).toBe('left'); // a physical keyword: left in every locale
    expect(logical.style.justifyContent).toBe('flex-start'); // resolves against `direction`
  });

  it('a fractional Alignment is refused, not snapped to the nearest keyword', () => {
    // Flutter's alignment is continuous; flexbox has three positions per axis. Snapping would put the child
    // somewhere the author did not write with nothing on screen to say so.
    expect(() => render(createElement(Align, { alignment: new Alignment(0.3, -0.7) }))).toThrow(/BRG4008/);
  });

  it('Directionality sets the direction the logical keywords resolve against', () => {
    const div = only(render(createElement(Directionality, { textDirection: 'rtl', children: 'x' })).container);
    expect(div.style.direction).toBe('rtl');
  });

  it('Wrap and Row resolve the same alignment through the same table', () => {
    const row = only(render(createElement(Row, { mainAxisAlignment: 'spaceEvenly' })).container);
    const wrap = only(render(createElement(Wrap, { alignment: 'spaceEvenly' })).container);
    expect(wrap.style.justifyContent).toBe(row.style.justifyContent);
    expect(wrap.style.justifyContent).toBe('space-evenly');
  });

  it('Wrap cross-aligns within a run', () => {
    const div = only(render(createElement(Wrap, { crossAxisAlignment: 'end' })).container);
    expect(div.style.alignItems).toBe('flex-end');
  });

  it('verticalDirection: up reverses the layout order', () => {
    const column = only(render(createElement(Column, { verticalDirection: 'up' })).container);
    const row = only(render(createElement(Row, { verticalDirection: 'up' })).container);
    expect(column.style.flexDirection).toBe('column-reverse');
    expect(row.style.flexDirection).toBe('row-reverse');
  });

  it('Stack aligns its non-positioned children, defaulting to topStart', () => {
    const dflt = only(render(createElement(Stack, null, 'x')).container);
    expect(dflt.style.justifyContent).toBe('flex-start'); // directional: topStart, not topLeft
    expect(dflt.style.alignItems).toBe('flex-start');
    const centred = only(render(createElement(Stack, { alignment: Alignment.center }, 'x')).container);
    expect(centred.style.justifyContent).toBe('center');
    expect(centred.style.position).toBe('relative'); // still the containing block for Positioned
  });
});

// ── M4-B: the constraint model ────────────────────────────────────────────────────────────────────

describe('M4-B constraint model', () => {
  it('ConstrainedBox writes only the sides the constraints name', () => {
    const div = only(render(createElement(ConstrainedBox, { constraints: { maxWidth: 400 }, child: 'x' })).container);
    expect(div.style.maxWidth).toBe('400px');
    // An omitted maximum emits nothing rather than `none`, which would clear an inherited limit.
    expect(div.style.maxHeight).toBe('');
    expect(div.style.minWidth).toBe('');
  });

  it('a stated minWidth: 0 is emitted, because CSS defaults it to auto rather than 0', () => {
    // The automatic-minimum-size rule: `min-width: auto` on a flex item is its min-content size, so a long
    // word refuses to shrink and overflows where Flutter would clip. `0` is not a no-op.
    const div = only(render(createElement(ConstrainedBox, { constraints: { minWidth: 0 }, child: 'x' })).container);
    expect(div.style.minWidth).toBe('0px');
  });

  it('an infinite maximum is unconstrained, not the string "Infinitypx"', () => {
    const div = only(
      render(createElement(ConstrainedBox, { constraints: { maxWidth: Infinity }, child: 'x' })).container,
    );
    expect(div.style.maxWidth).toBe('');
  });

  it('SizedBox maps double.infinity to fill rather than an invalid declaration', () => {
    const div = only(render(createElement(SizedBox, { width: Infinity, height: 8 })).container);
    expect(div.style.width).toBe('100%');
    expect(div.style.height).toBe('8px');
  });

  it('AspectRatio is CSS aspect-ratio — one of the exact mappings', () => {
    const div = only(render(createElement(AspectRatio, { aspectRatio: 16 / 9, child: 'x' })).container);
    // The CSSOM normalises a bare ratio to `<w> / <h>`, so what comes back is the `/ 1` form of what was set.
    expect(div.style.aspectRatio).toBe(`${16 / 9} / 1`);
  });

  it('AspectRatio drops a ratio Flutter would assert on rather than emitting an invalid one', () => {
    const div = only(render(createElement(AspectRatio, { aspectRatio: 0, child: 'x' })).container);
    expect(div.style.aspectRatio).toBe('');
  });

  it('FractionallySizedBox is a percentage of the parent', () => {
    const div = only(render(createElement(FractionallySizedBox, { widthFactor: 0.5, child: 'x' })).container);
    expect(div.style.width).toBe('50%');
    expect(div.style.height).toBe('');
  });

  // `env()` is asserted on the helper rather than through the DOM: jsdom's CSS parser does not implement
  // environment variables and drops the declaration, so a DOM assertion here would be testing jsdom. The
  // helper is the unit that decides the value, and a browser keeps what it produces.

  it('safeAreaStyle reads the platform insets, with an explicit fallback on every side', () => {
    // The fallback matters: an unsupported env() with none makes the whole declaration invalid, and an
    // invalid padding-top is not zero — it is whatever was inherited.
    expect(safeAreaStyle({})).toEqual({
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingRight: 'env(safe-area-inset-right, 0px)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      paddingLeft: 'env(safe-area-inset-left, 0px)',
    });
  });

  it('safeAreaStyle insets only the edges it is asked to', () => {
    const style = safeAreaStyle({ top: false });
    expect(style.paddingTop).toBe('0px');
    expect(style.paddingBottom).toBe('env(safe-area-inset-bottom, 0px)');
  });

  it('SafeArea renders its child inside the inset box', () => {
    expect(only(render(createElement(SafeArea, { child: 'x' })).container).textContent).toBe('x');
  });

  it('Padding and the constraint helper agree — one definition of an inset', () => {
    const padded = only(render(createElement(Padding, { padding: EdgeInsets.all(4), child: 'x' })).container);
    expect(padded.getAttribute('style')).toBe('padding: 4px;');
  });
});
