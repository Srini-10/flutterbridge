// Stack and Positioned — Flutter's overlap on CSS positioning.
//
// A Flutter `Stack` layers its children; a `Positioned` child pins itself to the stack's edges. That is
// exactly `position: relative` on the container and `position: absolute` on the pinned child — CSS's own
// containing-block rule is the one Flutter's `Positioned` obeys, so a `Positioned(top: 8, left: 8)` inside a
// `Stack` lands 8 from the top-left of the stack, in both.
//
// ## Where this degrades, stated rather than guessed (as `flex.ts` states its own)
//
// A Flutter `Stack` also sizes itself to its **non-positioned** children and places each of them by the
// stack's `alignment` (default `topStart`), stacking them on top of one another. `alignment` now maps —
// `layout/alignment.ts` carries the `Alignment` value type M4-A did not have, and a `Stack` is a flex
// container for the purpose of placing its non-positioned children, so the same two declarations that place
// an `Align`'s child place these. What remains unmapped:
//
// - **multiple non-positioned children overlapping**: Flutter stacks them at the same alignment; CSS flows
//   them in sequence. The common shape — one base child with `Positioned` overlays on top — is exact; two
//   bare children are laid out side by side here and on top of each other in Flutter.
//
// That is the honest limit of positioning-without-a-constraint-model; it is recorded here, not papered over,
// because a `Stack` that guessed at its own size would be wrong on exactly the screens that use it.

import { createElement, type CSSProperties, type ReactElement, type ReactNode } from 'react';

import { AlignmentDirectional, alignmentStyle, type AlignmentGeometry } from '../layout/alignment.js';

/** Props for {@link Stack}. Flutter's `Stack`. */
export interface StackProps {
  /**
   * Where non-positioned children sit. Defaults to {@link AlignmentDirectional.topStart}, as in Flutter —
   * *directional*, so it follows the text direction, which is why the default is the `AlignmentDirectional`
   * value and not `Alignment.topLeft`.
   */
  readonly alignment?: AlignmentGeometry;
  /** The children, painted in order — later children on top. Flutter's `List<Widget> children`. */
  readonly children?: ReactNode;
}

/**
 * Flutter's `Stack` — layers its children, the containing block for any {@link Positioned} among them.
 *
 * `position: relative` establishes the coordinate system `Positioned` pins against; the alignment
 * declarations place whatever flows normally. See this file's header for what that flow does and does not
 * match.
 *
 * @param props - see {@link StackProps}.
 * @returns the positioning container.
 */
export function Stack(props: StackProps): ReactElement {
  const style: CSSProperties = {
    position: 'relative',
    ...alignmentStyle(props.alignment ?? AlignmentDirectional.topStart),
  };
  return createElement('div', { style }, props.children);
}

/** Props for {@link Positioned}. Flutter's `Positioned` — only meaningful as a direct child of a {@link Stack}. */
export interface PositionedProps {
  /** Distance from the stack's top edge. */
  readonly top?: number;
  /** Distance from the stack's left edge. */
  readonly left?: number;
  /** Distance from the stack's right edge. */
  readonly right?: number;
  /** Distance from the stack's bottom edge. */
  readonly bottom?: number;
  /** An explicit width; Flutter derives it from `left`+`right` when both are given, as does CSS. */
  readonly width?: number;
  /** An explicit height; derived from `top`+`bottom` when both are given, as in CSS. */
  readonly height?: number;
  /** The widget to pin. Flutter's `child` slot. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `Positioned` — pins its child to a {@link Stack}'s edges.
 *
 * Every offset that is set is written, and the unset ones are left out rather than defaulted: an absolute box
 * with only `top` and `left` sizes to its content, and one with `left`+`right` stretches — the same
 * derivation Flutter does, and CSS does it for the same reasons from the same four values.
 *
 * @param props - see {@link PositionedProps}.
 * @returns the pinned child.
 */
export function Positioned(props: PositionedProps): ReactElement {
  const style: CSSProperties = { position: 'absolute' };
  if (props.top !== undefined) style.top = props.top;
  if (props.left !== undefined) style.left = props.left;
  if (props.right !== undefined) style.right = props.right;
  if (props.bottom !== undefined) style.bottom = props.bottom;
  if (props.width !== undefined) style.width = props.width;
  if (props.height !== undefined) style.height = props.height;
  return createElement('div', { style }, props.child);
}
