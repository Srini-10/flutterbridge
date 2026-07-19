// The `gap` package's widgets.
//
// ## Why a third-party package has a file in the kit
//
// `Gap` is the most-used widget the compiler could not render: **115 instantiations** across the two M0
// corpus applications, more than `Container` and more than `SizedBox`. It belongs to no framework, which is
// why it went unnoticed through six milestones of Material work — every triage list was a list of Flutter
// widgets.
//
// ADR-18 anticipated this and said what it should cost: a catalog, an adapter, and a line in the registry.
// This file is the runtime half.
//
// ## Why `flex-basis` and not a width or a height
//
// A `Gap` is a fixed extent along its parent's **main axis**, whichever that is. Flutter's own
// implementation reads the enclosing `Flex`'s direction from the element tree to decide; a kit component
// cannot see its parent, which is the limitation `basic.ts` documents at length for `SizedBox`
// (*"a component that cannot see its parent cannot know which axis that is"*).
//
// CSS answers it without needing to know. `flex-basis` **is** the main-axis size of a flex item, defined
// relative to whichever direction the container is running — so one declaration is correct in a `Row` and in
// a `Column`, and this component is *more* faithful than `SizedBox`, which has to be given an axis.
//
// `flex-shrink: 0` is load-bearing rather than defensive: a flex item's default is to shrink under pressure,
// and a gap that compresses is not a gap. Flutter's `Gap` does not compress — it is a `RenderBox` with a
// fixed extent, and an overflowing `Flex` overflows loudly instead.

import { createElement, type CSSProperties, type ReactElement } from 'react';

/** Props for {@link Gap}. */
export interface GapProps {
  /** The extent along the parent's main axis, in logical pixels. The package's own field name. */
  readonly mainAxisExtent?: number | undefined;
}

/**
 * The `gap` package's `Gap` — a fixed extent along the enclosing flex's main axis.
 *
 * @param props - see {@link GapProps}.
 * @returns the gap.
 *
 * @example
 * ```ts
 * // Gap(16)
 * createElement(Gap, { mainAxisExtent: 16 });
 * ```
 */
export function Gap(props: GapProps): ReactElement {
  const style: CSSProperties = {
    flexBasis: props.mainAxisExtent ?? 0,
    flexGrow: 0,
    flexShrink: 0,
  };
  return createElement('div', { style });
}

/** Props for {@link MaxGap}. */
export interface MaxGapProps {
  /** The **largest** extent it takes. Unlike a `Gap`, it yields when the axis is short. */
  readonly mainAxisExtent?: number | undefined;
}

/**
 * The `gap` package's `MaxGap` — a gap that yields rather than overflowing.
 *
 * The one difference from {@link Gap} is `flex-shrink`, and it is the whole widget: a `MaxGap`'s extent is a
 * maximum, so it *may* compress, which is what the default flex behaviour already does. Stated explicitly
 * rather than by omission, because "the value that happens to be the default" and "the value this widget
 * means" are different facts and only one of them survives a refactor.
 *
 * @param props - see {@link MaxGapProps}.
 * @returns the gap.
 */
export function MaxGap(props: MaxGapProps): ReactElement {
  const style: CSSProperties = {
    flexBasis: props.mainAxisExtent ?? 0,
    flexGrow: 0,
    flexShrink: 1,
  };
  return createElement('div', { style });
}
