// @vitest-environment jsdom

import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  Center,
  Column,
  EdgeInsets,
  ElevatedButton,
  Padding,
  Row,
  SizedBox,
  Text,
  type CrossAxisAlignment,
  type MainAxisAlignment,
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
