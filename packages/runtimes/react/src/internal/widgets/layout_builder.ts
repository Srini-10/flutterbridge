// LayoutBuilder — a builder that reads the size its parent offers, and is rebuilt when that size changes (ADR-0071).
//
// ## What Flutter gives a LayoutBuilder, and what a browser can say
//
// Flutter hands the builder a `BoxConstraints`: the range of sizes the parent will accept. A browser has no such object;
// what it has is a laid-out box. So the component renders a wrapper that fills the space its parent offers, measures it, and
// calls the builder with the measurement. Two of the four numbers are recoverable, and two are not:
//
//  - **`maxWidth`** is the width the constraint chain offers. Flutter's parent passes its own *incoming* maximum down, so a
//    shrink-wrapped `Column` still offers its parent's width; a browser element that shrink-wraps is only as wide as its content.
//    The nearest ancestor whose width does **not** depend on its content (measured: hide what is inside it and see whether its
//    width changes) stands for the maximum, less the padding and border of the shrink-wrapped ones in between. (Found by the
//    Chromium suite: a wrapper that merely filled its parent measured 400 in a 1000-wide window.)
//  - **`maxHeight`** is read structurally, as Flutter's is: a scroll container (`overflow-y: auto|scroll`) and the main axis of a
//    column flex container (unless the child grows, i.e. `Expanded`) offer `Infinity`; an explicit `height` bounds it; otherwise the
//    parent's bound is inherited. It is *not* inferred from percentage heights — the kit's own scroller is `height: 100%`, which would
//    report a bound where Flutter has none.
//  - **`minWidth`/`minHeight`, `hasTightWidth`, `isTight`** say whether the parent *forced* a size or merely allowed one.
//    A laid-out box does not remember which, so the generator refuses to read them rather than return a guess.
//
// The measurement is re-taken with a `ResizeObserver`, so a window resize, a container resize and a sibling that changes the
// parent's size all rebuild the builder — and nested builders each observe their own wrapper.
//
// ## Documented differences
//
//  - The builder does not run on the server: constraints do not exist before layout, so the server-rendered HTML holds the empty
//    wrapper and the content appears in the first layout effect, before the first paint. (Flutter has no server.)
//  - The wrapper is an element (`display: block`, filling its parent), where Flutter's LayoutBuilder is a transparent render
//    object. A parent that lays out its children by their content (a shrink-wrapped `Row` child) gives it the width it offers,
//    not the width its content would take.

import { createElement, useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode, type Ref } from 'react';

/** The part of Flutter's `BoxConstraints` a browser can state — see this file's header. */
export interface LayoutConstraints {
  /** The largest width the parent offers. */
  readonly maxWidth: number;
  /** The largest height the parent offers, or `Infinity` when the parent's height depends on its content. */
  readonly maxHeight: number;
  /** Whether {@link LayoutConstraints.maxWidth} is finite. */
  readonly hasBoundedWidth: boolean;
  /** Whether {@link LayoutConstraints.maxHeight} is finite. */
  readonly hasBoundedHeight: boolean;
}

/** Props for {@link LayoutBuilder}. */
export interface LayoutBuilderProps {
  /** Builds the content for the size on offer. Flutter's `(BuildContext, BoxConstraints)` builder. */
  readonly builder: (context: unknown, constraints: LayoutConstraints) => ReactNode;
}

/** The DOM capabilities the measurement needs; the kit compiles without the DOM lib. */
interface Node_ {
  readonly parentElement: Node_ | null;
  readonly children: ArrayLike<Node_>;
  readonly style: { display: string; height: string; flex: string };
  getBoundingClientRect(): { readonly width: number; readonly height: number };
}
interface ComputedLike {
  readonly display: string;
  readonly flexDirection: string;
  readonly flexGrow: string;
  readonly overflowY: string;
  readonly paddingLeft: string;
  readonly paddingRight: string;
  readonly paddingTop: string;
  readonly paddingBottom: string;
  readonly borderLeftWidth: string;
  readonly borderRightWidth: string;
  readonly borderTopWidth: string;
  readonly borderBottomWidth: string;
}
interface ObserverLike {
  observe(target: unknown): void;
  disconnect(): void;
}
type ObserverConstructor = new (callback: () => void) => ObserverLike;

const computed = (node: Node_): ComputedLike =>
  (globalThis as unknown as { getComputedStyle(node: Node_): ComputedLike }).getComputedStyle(node);
const length = (value: string): number => (Number.parseFloat(value) || 0);
const horizontalInsets = (c: ComputedLike): number =>
  length(c.paddingLeft) + length(c.paddingRight) + length(c.borderLeftWidth) + length(c.borderRightWidth);
const verticalInsets = (c: ComputedLike): number =>
  length(c.paddingTop) + length(c.paddingBottom) + length(c.borderTopWidth) + length(c.borderBottomWidth);

/** Whether a flex item takes free space on the main axis — `Expanded` (`flex: 1 1 0%`), `flex-grow > 0`. */
const grows = (node: Node_): boolean => length(computed(node).flexGrow) > 0 || length(node.style.flex) > 0;

/** Whether `node`'s width is the same with everything inside it hidden — i.e. it does not shrink-wrap its content. */
function widthIsIndependent(node: Node_): boolean {
  const before = node.getBoundingClientRect().width;
  const kids = Array.from(node.children);
  const saved = kids.map((kid) => kid.style.display);
  for (const kid of kids) kid.style.display = 'none';
  const after = node.getBoundingClientRect().width;
  kids.forEach((kid, index) => {
    kid.style.display = saved[index] ?? '';
  });
  return Math.abs(before - after) < 0.5;
}

/**
 * The width the constraint chain offers: Flutter's parent passes its *incoming* maximum down, so a shrink-wrapped `Column`
 * (a flex item that is as wide as its widest child) still offers its own parent's width. The nearest ancestor whose width does
 * not depend on its content stands for that maximum, less the padding and border of the shrink-wrapped ones in between.
 */
function offeredWidth(wrapper: Node_): number {
  let inset = 0;
  for (let node = wrapper.parentElement; node !== null; node = node.parentElement) {
    const style = computed(node);
    if (style.display === 'contents') continue;
    if (node.parentElement === null || widthIsIndependent(node)) {
      return Math.max(0, node.getBoundingClientRect().width - horizontalInsets(style) - inset);
    }
    inset += horizontalInsets(style);
  }
  return wrapper.getBoundingClientRect().width;
}

/**
 * The height the constraint chain offers, or `Infinity`. Flutter's answer is structural: a scroll view and the main axis of a
 * `Column` (unless the child is `Expanded`) pass an unbounded height; an explicit height bounds it; otherwise the parent's
 * bound is inherited. The same structure is read here from the computed style of the kit's own layout widgets.
 */
function offeredHeight(wrapper: Node_): number {
  let child: Node_ = wrapper;
  let inset = 0;
  for (let node = wrapper.parentElement; node !== null; node = node.parentElement) {
    const style = computed(node);
    if (style.display === 'contents') continue;
    if (style.overflowY === 'auto' || style.overflowY === 'scroll') return Number.POSITIVE_INFINITY;
    const explicit = /^-?[\d.]+px$/.test(node.style.height) ? Number.parseFloat(node.style.height) : undefined;
    if (explicit !== undefined) return Math.max(0, explicit - verticalInsets(style) - inset);
    if (style.display.includes('flex') && style.flexDirection.startsWith('column') && !grows(child)) {
      return Number.POSITIVE_INFINITY;
    }
    inset += verticalInsets(style);
    child = node;
  }
  return Number.POSITIVE_INFINITY;
}

const useIsomorphicLayoutEffect = (globalThis as { document?: unknown }).document === undefined ? useEffect : useLayoutEffect;

function constraintsOf(width: number, height: number): LayoutConstraints {
  const bounded = Number.isFinite(height);
  return { maxWidth: width, maxHeight: height, hasBoundedWidth: true, hasBoundedHeight: bounded };
}

/**
 * Flutter's `LayoutBuilder`. Renders a wrapper that fills its parent, measures it, and renders `builder(context, constraints)`
 * inside; see this file's header for what the constraints mean.
 */
export function LayoutBuilder(props: LayoutBuilderProps): ReactElement {
  const wrapper = useRef<Node_ | null>(null);
  const [constraints, setConstraints] = useState<LayoutConstraints | null>(null);

  useIsomorphicLayoutEffect(() => {
    const element = wrapper.current;
    if (element === null) return undefined;
    const measure = (): void => {
      const content = element.children[0];
      // Measured with the content hidden: what is left is what the parent offers, independent of what is built in it.
      const shown = content?.style.display ?? '';
      if (content !== undefined) content.style.display = 'none';
      const next = constraintsOf(offeredWidth(element), offeredHeight(element));
      if (content !== undefined) content.style.display = shown;
      setConstraints((previous) =>
        previous !== null && previous.maxWidth === next.maxWidth && previous.maxHeight === next.maxHeight ? previous : next,
      );
    };
    measure();
    const Observer = (globalThis as { ResizeObserver?: ObserverConstructor }).ResizeObserver;
    if (Observer === undefined) return undefined;
    const observer = new Observer(measure);
    // The wrapper, and every ancestor whose size the offer depends on: a shrink-wrapped parent that grows or shrinks changes
    // the wrapper's width without the wrapper's own box necessarily changing.
    for (let node: Node_ | null = element; node !== null; node = node.parentElement) observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return createElement(
    'div',
    {
      ref: wrapper as unknown as Ref<HTMLDivElement>,
      style: { position: 'relative', display: 'block', width: '100%', minWidth: 0, minHeight: 0 },
    },
    createElement('div', { style: { display: 'contents' } }, constraints === null ? null : props.builder(null, constraints)),
  );
}
