// The implicit-animation family — AnimatedOpacity, AnimatedContainer, AnimatedAlign, AnimatedPadding.
//
// ## Why these are here when "the animation engine" is M5
//
// M4-D through M4-G classified every widget with `Animated` in its name under one capability — *"the
// animation engine, owner: runtime"* — and deferred all of them. M4-H's evidence run shows that grouped two
// unrelated problems, in the same way M4-G found `IntrinsicWidth` and `FittedBox` had been grouped.
//
// Flutter itself draws the line, and names it. `ImplicitlyAnimatedWidget` — the base class of everything in
// this file — takes a **target value** and a **duration**, and interpolates to the target whenever the value
// it is given changes. It has no controller, no ticker exposed to the program, and nothing to drive: the
// widget is a pure function of its props, and the animation is a consequence of a prop changing.
//
// That is precisely a CSS transition. `transition: opacity 300ms cubic-bezier(0.42, 0, 0.58, 1)` says: when
// the computed value of `opacity` changes, interpolate over 300ms on that curve. The browser is the ticker.
//
// The **explicit** family is a different thing and is still deferred: `AnimationController`,
// `AnimatedBuilder`, `TweenAnimationBuilder` and the `*Transition` widgets hand a *value* to Dart code on
// every frame, and that code can do anything with it. There is no CSS property to attach that to, and no
// UIR construct for a per-frame value, so `unsupported.ts` keeps refusing them.
//
// The analyzer's output is what settled it. `AnimatedContainer(width: _width)` extracts as an ordinary
// `ui.Element` whose `width` prop is a **`bind.Signal`** — the same binding a plain `Container` gets. The
// duration is a kit value type, the curve a kit static const. Nothing in it needed a construct that does not
// exist.
//
// ## Every curve is the SDK's own, and the ones that are not are refused
//
// Flutter declares its curves as `Cubic(x1, y1, x2, y2)`; CSS's `cubic-bezier(x1, y1, x2, y2)` is the same
// four control points of the same unit cubic Bezier. The catalog carries all 33 of them with the SDK line
// each came from. `Curves.bounceOut` and `Curves.elasticIn` are piecewise and spring curves that no
// `cubic-bezier()` expresses; they are absent from the table and the generator refuses them by name rather
// than substituting something that looks similar.

import { createElement, type CSSProperties, type ReactElement, type ReactNode } from 'react';

import { timingFunction } from '../generated/material_metadata.js';
import { RuntimeDiagnosticCode, RuntimeError } from '../diagnostics/codes.js';
import { Alignment, alignmentStyle, type AlignmentGeometry } from '../layout/alignment.js';
import { edgeInsetsStyle, mergeStyles, sizeStyle } from '../layout/constraints.js';
import type { EdgeInsets } from '../layout/edge_insets.js';
import { useThemeSurface } from '../react/theme.js';

/**
 * Flutter's `Duration`, as the kit carries it.
 *
 * Mirrored rather than reduced to milliseconds at the call site, for the reason `edge_insets.ts` gives:
 * `Duration(seconds: 2)` must survive into the output as `Duration({ seconds: 2 })`, because a reviewer
 * reading the emitted file beside its Dart is the whole override workflow.
 */
export interface DurationOptions {
  /** Whole days. */
  readonly days?: number;
  /** Whole hours. */
  readonly hours?: number;
  /** Whole minutes. */
  readonly minutes?: number;
  /** Whole seconds. */
  readonly seconds?: number;
  /** Whole milliseconds. */
  readonly milliseconds?: number;
  /** Whole microseconds. Dart's finest unit; CSS's is the millisecond, so this rounds. */
  readonly microseconds?: number;
}

/**
 * Flutter's `Duration` — a length of time, in the units Dart's constructor takes.
 *
 * A class taking an options object, which is the shape `Duration(milliseconds: 300)` lowers to and the same
 * convention `BoxConstraints` and `EdgeInsets` follow.
 */
export class Duration {
  /** The total length, in milliseconds — the unit CSS measures in. */
  public readonly inMilliseconds: number;

  public constructor(options: DurationOptions = {}) {
    this.inMilliseconds =
      (options.days ?? 0) * 86_400_000 +
      (options.hours ?? 0) * 3_600_000 +
      (options.minutes ?? 0) * 60_000 +
      (options.seconds ?? 0) * 1000 +
      (options.milliseconds ?? 0) +
      // Dart's microsecond is finer than CSS can express. Rounded rather than dropped, and rounded rather
      // than truncated: a 1500µs duration is nearer 2ms than 1ms, and truncating a sub-millisecond duration
      // to zero would switch the transition off entirely.
      Math.round((options.microseconds ?? 0) / 1000);
  }
}

/**
 * Flutter's `Curve` — an easing function, as a CSS timing function.
 *
 * Holds the CSS text rather than a function, because the browser evaluates it: there is nothing for the kit
 * to compute. `Curves` below is the set the SDK declares as cubics.
 */
export class Curve {
  /** The CSS `transition-timing-function` value. */
  public readonly css: string;
  /** The Flutter name, for diagnostics. */
  public readonly name: string;

  public constructor(name: string) {
    const css = timingFunction(name);
    if (css === undefined) {
      throw new RuntimeError(
        RuntimeDiagnosticCode.InvalidToken,
        `\`Curves.${name}\` has no CSS timing function. Flutter declares most of its curves as ` +
          `\`Cubic(x1, y1, x2, y2)\`, which is exactly \`cubic-bezier(x1, y1, x2, y2)\` — but the bounce, ` +
          `elastic and three-point families are piecewise or spring curves that no single cubic-bezier ` +
          `expresses. Substituting a nearby curve would animate on a path the author did not write.`,
        [name],
      );
    }
    this.css = css;
    this.name = name;
  }
}

/**
 * Flutter's `Curves` — the named easing curves, as CSS timing functions.
 *
 * A `Proxy` over the generated table rather than 33 hand-written members: the table is generated from the
 * catalog, which is generated from the SDK, and restating the names here would be the fourth copy of a fact
 * ADR-18 exists to keep to one. An unknown name throws at the point of use with the reason, rather than
 * resolving to `undefined` and silently producing no transition.
 */
export const Curves: Readonly<Record<string, Curve>> = new Proxy(
  {},
  {
    get: (_target, name: string | symbol): Curve | undefined =>
      typeof name === 'string' ? new Curve(name) : undefined,
  },
) as Readonly<Record<string, Curve>>;

/** Flutter's default when an implicitly-animated widget states no curve — `Curves.linear`. */
const DEFAULT_CURVE = 'linear';

/**
 * The `transition` declarations for a set of animated properties.
 *
 * @param properties - the CSS properties that animate.
 * @param duration - how long. An absent duration means no transition, which is what a Flutter widget with a
 * zero duration does.
 * @param curve - the easing. Flutter's own default is `Curves.linear`.
 * @returns the declaration.
 */
export function transitionStyle(
  properties: readonly string[],
  duration: Duration | undefined,
  curve: Curve | undefined,
): CSSProperties {
  const ms = duration?.inMilliseconds ?? 0;
  if (ms <= 0 || properties.length === 0) return {};
  const easing = curve?.css ?? timingFunction(DEFAULT_CURVE) ?? DEFAULT_CURVE;
  return { transition: properties.map((property) => `${property} ${ms}ms ${easing}`).join(', ') };
}

/** Props shared by every implicitly-animated widget. */
interface ImplicitProps {
  /**
   * How long the interpolation takes. Flutter's `duration`, which is required there.
   *
   * `| undefined` deliberately, unlike `EdgeInsets.symmetric`'s parameters and for the opposite reason to
   * theirs (see `edge_insets.ts`). A consumer compiling with `noUncheckedIndexedAccess` gets
   * `Curve | undefined` from any table lookup, and a bare `duration?: Duration` under
   * `exactOptionalPropertyTypes` would reject it — pushing every caller toward a non-null assertion on a
   * value the kit is perfectly happy to receive as absent. Both absences mean "no transition", and they
   * mean it in one place: `?? 0`, in `transitionStyle`.
   */
  readonly duration?: Duration | undefined;
  /** The easing. Flutter's `curve`, defaulting to `Curves.linear`. */
  readonly curve?: Curve | undefined;
}

/** Props for {@link AnimatedOpacity}. */
export interface AnimatedOpacityProps extends ImplicitProps {
  /** The target opacity, 0–1. Flutter's `opacity`. */
  readonly opacity?: number | undefined;
  /** The child. Flutter's `child` slot. */
  readonly child?: ReactNode | undefined;
}

/**
 * Flutter's `AnimatedOpacity` — fades to a new opacity when the value changes.
 *
 * @param props - see {@link AnimatedOpacityProps}.
 * @returns the faded child.
 */
export function AnimatedOpacity(props: AnimatedOpacityProps): ReactElement {
  const style: CSSProperties = {
    opacity: props.opacity ?? 1,
    ...transitionStyle(['opacity'], props.duration, props.curve),
  };
  return createElement('div', { style }, props.child);
}

/** Props for {@link AnimatedAlign}. */
export interface AnimatedAlignProps extends ImplicitProps {
  /** Where the child sits. Flutter's `alignment`. */
  readonly alignment?: AlignmentGeometry | undefined;
  /** The child. Flutter's `child` slot. */
  readonly child?: ReactNode | undefined;
}

/**
 * Flutter's `AnimatedAlign`.
 *
 * **Where this diverges, stated rather than hidden.** Flutter interpolates the alignment *fraction*, so the
 * child slides continuously. This kit maps an alignment to flexbox's three positions per axis (see
 * `layout/alignment.ts`), and `justify-content` is not an interpolatable CSS property — so the child jumps
 * between positions rather than sliding. The transition is declared on the properties that *do* interpolate,
 * and the generator refuses a fractional alignment here as it does everywhere else.
 *
 * @param props - see {@link AnimatedAlignProps}.
 * @returns the aligned child.
 */
export function AnimatedAlign(props: AnimatedAlignProps): ReactElement {
  const style: CSSProperties = mergeStyles(
    alignmentStyle(props.alignment ?? Alignment.center),
    transitionStyle(['justify-content', 'align-items'], props.duration, props.curve),
  );
  return createElement('div', { style }, props.child);
}

/** Props for {@link AnimatedPadding}. */
export interface AnimatedPaddingProps extends ImplicitProps {
  /** The target padding. Flutter's `padding`. */
  readonly padding?: EdgeInsets | undefined;
  /** The child. Flutter's `child` slot. */
  readonly child?: ReactNode | undefined;
}

/**
 * Flutter's `AnimatedPadding`.
 *
 * @param props - see {@link AnimatedPaddingProps}.
 * @returns the padded child.
 */
export function AnimatedPadding(props: AnimatedPaddingProps): ReactElement {
  const style: CSSProperties = mergeStyles(
    props.padding === undefined ? {} : edgeInsetsStyle(props.padding, 'padding'),
    transitionStyle(['padding'], props.duration, props.curve),
  );
  return createElement('div', { style }, props.child);
}

/** Props for {@link AnimatedContainer}. */
export interface AnimatedContainerProps extends ImplicitProps {
  /** The target width. Flutter's `width`. */
  readonly width?: number | undefined;
  /** The target height. Flutter's `height`. */
  readonly height?: number | undefined;
  /** The target colour, as a token name (INV-20). Flutter's `color`. */
  readonly color?: string | undefined;
  /** The target padding. Flutter's `padding`. */
  readonly padding?: EdgeInsets | undefined;
  /** The target margin. Flutter's `margin`. */
  readonly margin?: EdgeInsets | undefined;
  /** Where the child sits. Flutter's `alignment`. */
  readonly alignment?: AlignmentGeometry | undefined;
  /** The child. Flutter's `child` slot. */
  readonly child?: ReactNode | undefined;
}

/**
 * Flutter's `AnimatedContainer` — a `Container` that interpolates to its new geometry and colour.
 *
 * ## What animates, and what is left out
 *
 * `width`, `height`, `padding`, `margin` and `color` are all interpolatable CSS properties, and are declared
 * in the transition. **`decoration` is not a prop here**, and that is deliberate: Flutter lerps a whole
 * `BoxDecoration` — border, radius, shadows and gradient together — and CSS interpolates each of those
 * separately with different rules (a gradient only interpolates between gradients of the same shape). A
 * `decoration:` that silently animated some of its parts and snapped the rest would look supported and not
 * be, so the generator refuses it and names the parameter.
 *
 * `color` is a token name, never a literal — INV-20 (ADR-13), the same rule every other component follows.
 *
 * @param props - see {@link AnimatedContainerProps}.
 * @returns the container.
 * @throws RuntimeError - `BRG4006` if the theme defines no token for `color`.
 */
export function AnimatedContainer(props: AnimatedContainerProps): ReactElement {
  const theme = useThemeSurface();
  const animated: string[] = [];
  if (props.width !== undefined) animated.push('width');
  if (props.height !== undefined) animated.push('height');
  if (props.color !== undefined) animated.push('background-color');
  if (props.padding !== undefined) animated.push('padding');
  if (props.margin !== undefined) animated.push('margin');

  const style: CSSProperties = mergeStyles(
    sizeStyle(props.width, props.height),
    props.padding === undefined ? {} : edgeInsetsStyle(props.padding, 'padding'),
    props.margin === undefined ? {} : edgeInsetsStyle(props.margin, 'margin'),
    props.color === undefined ? {} : { backgroundColor: theme.color(props.color) },
    props.alignment === undefined ? {} : alignmentStyle(props.alignment),
    transitionStyle(animated, props.duration, props.curve),
  );
  return createElement('div', { style }, props.child);
}
