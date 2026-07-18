// @vitest-environment jsdom

import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import {
  AnimatedAlign,
  AnimatedContainer,
  AnimatedOpacity,
  AnimatedPadding,
  Alignment,
  Curves,
  Duration,
  EdgeInsets,
  PageView,
  ThemeProvider,
  transitionStyle,
  type ThemeDescriptor,
} from '../src/index.js';

// M4-H's implicit-animation family and paged scrolling.
//
// The point these assert is the one the milestone turns on: an implicitly-animated widget is a pure
// function of its props, and the animation is a CSS transition. There is no ticker here to test.

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

const theme: ThemeDescriptor = {
  tokens: [['surface', '#FFFEF7FF'], ['primary', '#FF6750A4']].map(([name, light]) => ({
    name: name!,
    group: 'color' as const,
    role: name!,
    light: light!,
  })),
};

const themed = (element: ReactElement): HTMLElement =>
  render(createElement(ThemeProvider, { descriptor: theme }, element));

describe('Duration', () => {
  it('sums every unit Dart’s constructor takes', () => {
    expect(new Duration({ milliseconds: 300 }).inMilliseconds).toBe(300);
    expect(new Duration({ seconds: 2, milliseconds: 500 }).inMilliseconds).toBe(2500);
    expect(new Duration({ minutes: 1 }).inMilliseconds).toBe(60_000);
  });

  it('rounds microseconds rather than truncating them away', () => {
    // Truncating would turn a sub-millisecond duration into zero, which switches the transition off
    // entirely — a silent change of behaviour rather than a rounding error.
    expect(new Duration({ microseconds: 1500 }).inMilliseconds).toBe(2);
    expect(new Duration({ microseconds: 600 }).inMilliseconds).toBe(1);
  });
});

describe('Curves', () => {
  it('is the SDK’s own cubic, not an approximation of it', () => {
    // Flutter declares `Curves.easeInOut` as `Cubic(0.42, 0.0, 0.58, 1.0)` (animation/curves.dart:1726).
    // CSS's `cubic-bezier` takes the same four control points of the same unit cubic Bezier.
    expect(Curves['easeInOut']?.css).toBe('cubic-bezier(0.42, 0.0, 0.58, 1.0)');
    expect(Curves['fastOutSlowIn']?.css).toBe('cubic-bezier(0.4, 0.0, 0.2, 1.0)');
    expect(Curves['linear']?.css).toBe('linear');
  });

  it('refuses a curve CSS cannot express, rather than substituting a near one', () => {
    // `bounceOut` is piecewise and `elasticIn` is a spring; no single cubic-bezier is either. Animating on
    // a nearby curve would move on a path the author did not write, with nothing on screen to say so.
    expect(() => Curves['bounceOut']).toThrow(/no CSS timing function/);
    expect(() => Curves['elasticIn']).toThrow(/no CSS timing function/);
    expect(() => Curves['decelerate']).toThrow(/no CSS timing function/);
  });
});

describe('transitionStyle', () => {
  it('names every property that animates, with the duration and the curve', () => {
    const style = transitionStyle(['opacity'], new Duration({ milliseconds: 300 }), Curves['easeIn']);
    expect(style.transition).toBe('opacity 300ms cubic-bezier(0.42, 0.0, 1.0, 1.0)');
  });

  it('a zero or absent duration is no transition at all', () => {
    // Flutter's own behaviour for a zero duration: the value snaps. A `transition: … 0ms` declaration would
    // say the same thing more slowly, but an absent one cannot be overridden by a cascade accident.
    expect(transitionStyle(['opacity'], new Duration({}), undefined).transition).toBeUndefined();
    expect(transitionStyle(['opacity'], undefined, undefined).transition).toBeUndefined();
  });

  it('defaults to linear, which is Flutter’s default curve', () => {
    const style = transitionStyle(['width'], new Duration({ milliseconds: 100 }), undefined);
    expect(style.transition).toBe('width 100ms linear');
  });
});

describe('the implicit-animation family', () => {
  it('AnimatedOpacity sets the target and transitions to it', () => {
    const faded = only(
      render(
        createElement(AnimatedOpacity, {
          opacity: 0.25,
          duration: new Duration({ milliseconds: 300 }),
          curve: Curves['easeInOut'],
        }),
      ),
    );
    expect(faded.style.opacity).toBe('0.25');
    expect(faded.style.transition).toContain('opacity 300ms');
  });

  it('AnimatedContainer transitions only the properties it was actually given', () => {
    // A transition naming a property the widget does not set would animate whatever a cascade happened to
    // supply — so the list is built from the props present, not from the full set.
    const box = only(
      themed(
        createElement(AnimatedContainer, {
          width: 240,
          duration: new Duration({ milliseconds: 200 }),
        }),
      ),
    );
    expect(box.style.width).toBe('240px');
    expect(box.style.transition).toBe('width 200ms linear');
    expect(box.style.transition).not.toContain('background-color');
  });

  it('AnimatedContainer paints its colour through the theme, never as a literal (INV-20)', () => {
    const box = only(
      themed(
        createElement(AnimatedContainer, {
          color: 'surface',
          duration: new Duration({ milliseconds: 200 }),
        }),
      ),
    );
    expect(box.style.backgroundColor).not.toBe('');
    expect(box.style.transition).toContain('background-color 200ms');
  });

  it('AnimatedPadding and AnimatedAlign apply their geometry', () => {
    const padded = only(
      render(
        createElement(AnimatedPadding, {
          padding: EdgeInsets.all(12),
          duration: new Duration({ milliseconds: 150 }),
        }),
      ),
    );
    expect(padded.style.paddingTop).toBe('12px');
    expect(padded.style.transition).toContain('padding 150ms');

    const aligned = only(
      render(
        createElement(AnimatedAlign, {
          alignment: Alignment.bottomRight,
          duration: new Duration({ milliseconds: 150 }),
        }),
      ),
    );
    expect(aligned.style.display).toBe('flex');
  });
});

describe('PageView', () => {
  it('snaps on child boundaries, horizontally by default', () => {
    // A `PageView`'s default axis is the opposite of a `ListView`'s. Taking the scroll module's shared
    // default would have made every page view vertical.
    const view = only(render(createElement(PageView, null, 'a', 'b')));
    expect(view.style.scrollSnapType).toBe('x mandatory');
    expect(view.style.flexDirection).toBe('row');
  });

  it('each page fills the viewport and refuses to shrink', () => {
    // Without `flex-shrink: 0` every page compresses to fit and all of them are visible at once — which is
    // not a smaller PageView, it is a Row.
    const view = only(render(createElement(PageView, null, 'a', 'b')));
    const page = view.firstElementChild as HTMLElement;
    expect(page.style.scrollSnapAlign).toBe('start');
    expect(page.style.flexShrink).toBe('0');
    expect(page.style.width).toBe('100%');
  });
});
