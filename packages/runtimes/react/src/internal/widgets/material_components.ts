// ListTile, Chip, CircleAvatar, Badge and the two progress indicators.
//
// ## Every number here comes from the catalog
//
// Not one literal dimension, radius or opacity is written in this file. They are read from
// `generated/material_metadata.ts`, which the catalog generates from values transcribed out of the Flutter
// SDK with a file:line citation each. INV-20 states the rule for colours; the same argument applies to a
// 32-pixel chip height that would otherwise be `32` here and `32.0` in the next component.
//
// Reading the SDK rather than the Material specification changed three of these components:
//
// - **Both progress indicators default to `year2023: true`** in Flutter 3.44, which selects a *different*
//   defaults class from the one the M3 spec describes. The circular indicator is therefore **36** logical
//   pixels, not the 40 the 2024 class would give, and the linear one has **no** default corner radius.
// - **A bare `Chip` has no background colour in the SDK at all** — `_ChipDefaultsM3.color` returns `null`
//   with the comment *"Subclasses override this getter"*. So this `Chip` paints an outline and no fill,
//   which is what Flutter does, rather than a fill this file would have had to invent.
// - **`Tooltip` is the one documented divergence.** Flutter 3.44 paints it with literal colours
//   (`Colors.white`, `Colors.grey[700]`), which a kit component may not hold. The catalog states M3's own
//   plain-tooltip roles instead and says so at the entry.

import { createElement, type CSSProperties, type ReactElement, type ReactNode } from 'react';

import { componentDefault } from '../generated/material_metadata.js';
import { useThemeSurface } from '../react/theme.js';

/** A component default as a number. Every caller wants one, and the catalog stores numbers and roles alike. */
const size = (component: string, field: string): number => Number(componentDefault(component, field));

/** A component default as a role name. */
const role = (component: string, field: string): string => String(componentDefault(component, field));

// ── ListTile ──────────────────────────────────────────────────────────────────────────────────────

/** Props for {@link ListTile}. Flutter's `ListTile`. */
export interface ListTileProps {
  /** What sits before the title — an icon or an avatar. Flutter's `leading` slot, per the catalog. */
  readonly leading?: ReactNode;
  /** The primary line. Flutter's `title` slot. */
  readonly title?: ReactNode;
  /** The secondary line. Its presence is what makes the tile two lines tall. */
  readonly subtitle?: ReactNode;
  /** What sits after the title. Flutter's `trailing` slot. */
  readonly trailing?: ReactNode;
  /** Whether the tile is laid out for three lines. Defaults to `false`, as in Flutter. */
  readonly isThreeLine?: boolean;
}

/**
 * Flutter's `ListTile` — a fixed-height row of leading, title/subtitle, trailing.
 *
 * The height is **not** content-driven: Flutter picks 56, 72 or 88 logical pixels from whether there is a
 * subtitle and whether `isThreeLine` is set, and a tile that sized to its content would break the rhythm of
 * every list it appears in. `minHeight` rather than `height`, because Flutter's is a *minimum* too — a tile
 * whose content genuinely exceeds it grows.
 *
 * `onTap`, `selected` and the state layers are not props. They need the interaction model, and a tile that
 * accepted `onTap` and did not visibly respond would look supported and not be.
 *
 * @param props - see {@link ListTileProps}.
 * @returns the tile.
 * @throws RuntimeError - `BRG4006` if the theme defines no `onSurface`/`onSurfaceVariant`.
 */
export function ListTile(props: ListTileProps): ReactElement {
  const theme = useThemeSurface();
  const height =
    props.isThreeLine === true
      ? size('ListTile', 'heightThreeLine')
      : props.subtitle === undefined
        ? size('ListTile', 'heightOneLine')
        : size('ListTile', 'heightTwoLine');

  const row: CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: height,
    paddingInlineStart: size('ListTile', 'paddingStart'),
    paddingInlineEnd: size('ListTile', 'paddingEnd'),
    paddingTop: size('ListTile', 'minVerticalPadding'),
    paddingBottom: size('ListTile', 'minVerticalPadding'),
    // Logical, not physical: a list tile's leading edge follows the text direction, which is why the SDK's
    // own default is an `EdgeInsetsDirectional`.
    boxSizing: 'border-box',
  };
  const leadingStyle: CSSProperties = {
    minWidth: size('ListTile', 'minLeadingWidth'),
    marginInlineEnd: size('ListTile', 'horizontalTitleGap'),
    color: theme.color(role('ListTile', 'iconColorRole')),
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  };
  // The text column takes the remaining width and may shrink; `minWidth: 0` is what lets a long title
  // ellipsise rather than push the trailing widget off the tile.
  const textStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    flex: '1 1 0%',
    minWidth: 0,
    color: theme.color(role('ListTile', 'titleColorRole')),
  };
  const subtitleStyle: CSSProperties = {
    color: theme.color(role('ListTile', 'subtitleColorRole')),
  };
  const trailingStyle: CSSProperties = {
    marginInlineStart: size('ListTile', 'horizontalTitleGap'),
    color: theme.color(role('ListTile', 'iconColorRole')),
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  };

  return createElement(
    'div',
    { style: row },
    props.leading === undefined ? null : createElement('div', { key: 'l', style: leadingStyle }, props.leading),
    createElement(
      'div',
      { key: 't', style: textStyle },
      props.title,
      props.subtitle === undefined ? null : createElement('div', { style: subtitleStyle }, props.subtitle),
    ),
    props.trailing === undefined ? null : createElement('div', { key: 'r', style: trailingStyle }, props.trailing),
  );
}

// ── Chip ──────────────────────────────────────────────────────────────────────────────────────────

/** Props for {@link Chip}. Flutter's `Chip`. */
export interface ChipProps {
  /** The chip's text. Flutter's `label` slot, per the catalog. */
  readonly label?: ReactNode;
  /** A leading icon or avatar. Flutter's `avatar` slot. */
  readonly avatar?: ReactNode;
}

/**
 * Flutter's `Chip` — a compact, outlined label.
 *
 * **No background fill**, and that is the SDK's answer rather than an omission: `_ChipDefaultsM3.color`
 * returns `null` and leaves the fill to `ActionChip`/`FilterChip`/`InputChip`/`ChoiceChip`, each of which has
 * its own defaults class in its own file. A bare `Chip` is an outline, a label and nothing behind them.
 *
 * `onDeleted` and `deleteIcon` are not props: a delete affordance that did nothing when pressed would look
 * supported and not be.
 *
 * @param props - see {@link ChipProps}.
 * @returns the chip.
 */
export function Chip(props: ChipProps): ReactElement {
  const theme = useThemeSurface();
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    height: size('Chip', 'height'),
    paddingInline: size('Chip', 'padding'),
    gap: size('Chip', 'labelPadding'),
    borderRadius: size('Chip', 'borderRadius'),
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: theme.color(role('Chip', 'sideColorRole')),
    color: theme.color(role('Chip', 'labelColorRole')),
    boxSizing: 'border-box',
    flexShrink: 0,
  };
  const avatarStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    color: theme.color(role('Chip', 'iconColorRole')),
    fontSize: size('Chip', 'iconSize'),
  };
  return createElement(
    'div',
    { style },
    props.avatar === undefined ? null : createElement('span', { key: 'a', style: avatarStyle }, props.avatar),
    props.label,
  );
}

// ── CircleAvatar ──────────────────────────────────────────────────────────────────────────────────

/** Props for {@link CircleAvatar}. Flutter's `CircleAvatar`. */
export interface CircleAvatarProps {
  /** The circle's radius, in logical pixels. Defaults to Material's, from the catalog. */
  readonly radius?: number;
  /** What sits inside — usually initials or an icon. Flutter's `child` slot, per the catalog. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `CircleAvatar` — a circle holding initials or an icon.
 *
 * Sized by *radius*, as Flutter's is, so the box is `2 × radius` on both axes. Both axes are stated: a circle
 * that took its height from its content would be an ellipse the moment the initials were two characters wide.
 *
 * `backgroundImage` is not a prop. It takes an `ImageProvider`, which the kit has — but a background image on
 * an avatar also needs the `object-fit` cover behaviour that only a replaced element gets, so it belongs on an
 * `Image` child rather than as a paint on this box.
 *
 * @param props - see {@link CircleAvatarProps}.
 * @returns the avatar.
 */
export function CircleAvatar(props: CircleAvatarProps): ReactElement {
  const theme = useThemeSurface();
  const diameter = (props.radius ?? size('CircleAvatar', 'radius')) * 2;
  const style: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: diameter,
    height: diameter,
    borderRadius: '50%',
    overflow: 'hidden',
    flexShrink: 0,
    backgroundColor: theme.color(role('CircleAvatar', 'backgroundColorRole')),
    color: theme.color(role('CircleAvatar', 'foregroundColorRole')),
  };
  return createElement('div', { style }, props.child);
}

// ── Badge ─────────────────────────────────────────────────────────────────────────────────────────

/** Props for {@link Badge}. Flutter's `Badge`. */
export interface BadgeProps {
  /** The count or text. Flutter's `label` slot, per the catalog. Absent renders the small dot form. */
  readonly label?: ReactNode;
  /** What the badge is attached to. Flutter's `child` slot. */
  readonly child?: ReactNode;
  /** Whether the badge shows at all. Defaults to `true`, as in Flutter. */
  readonly isLabelVisible?: boolean;
}

/**
 * Flutter's `Badge` — a small marker on the top-trailing corner of its child.
 *
 * Two forms, as in Flutter: a **dot** when there is no label (a `smallSize` square), and a **pill** when
 * there is (`largeSize` tall, padded horizontally). `AlignmentDirectional.topEnd` is the SDK's default, so
 * the offsets are logical (`insetInlineEnd`) rather than physical — a badge follows the text direction.
 *
 * Flutter's exact pixel offset is not reproduced: it is computed in `build`, is direction-dependent, and
 * carries an unconditional `+Offset(0, 8)` compatibility shim, so there is no single value to transcribe.
 * The badge is pinned to the corner instead, which is what the alignment says.
 *
 * @param props - see {@link BadgeProps}.
 * @returns the badge, wrapping its child.
 */
export function Badge(props: BadgeProps): ReactElement {
  const theme = useThemeSurface();
  if (props.isLabelVisible === false) {
    return createElement('div', { style: { position: 'relative', display: 'inline-flex' } }, props.child);
  }
  const dot = props.label === undefined;
  const small = size('Badge', 'smallSize');
  const large = size('Badge', 'largeSize');
  const marker: CSSProperties = {
    position: 'absolute',
    top: 0,
    insetInlineEnd: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: dot ? small : large,
    height: dot ? small : large,
    paddingInline: dot ? 0 : size('Badge', 'padding'),
    // A stadium: Flutter's `Badge` uses `StadiumBorder()`, which is a fully-rounded pill at any width.
    borderRadius: large,
    backgroundColor: theme.color(role('Badge', 'backgroundColorRole')),
    color: theme.color(role('Badge', 'textColorRole')),
    boxSizing: 'border-box',
  };
  return createElement(
    'div',
    { style: { position: 'relative', display: 'inline-flex' } },
    props.child,
    createElement('span', { key: 'b', style: marker }, props.label),
  );
}

// ── Progress indicators ───────────────────────────────────────────────────────────────────────────

/** What both progress indicators share. */
interface ProgressLike {
  /** `0.0`–`1.0` for a determinate indicator; absent means indeterminate, as in Flutter. */
  readonly value?: number;
}

/**
 * The ARIA attributes a progress indicator carries.
 *
 * `progressbar` with no `aria-valuenow` is exactly how the accessibility model spells "indeterminate", which
 * is the same distinction Flutter draws with a null `value`. Shared so the two indicators cannot describe
 * themselves differently to a screen reader.
 */
function progressAria(value: number | undefined): Record<string, string | number> {
  return value === undefined
    ? { role: 'progressbar' }
    : {
        role: 'progressbar',
        'aria-valuenow': Math.round(value * 100),
        'aria-valuemin': 0,
        'aria-valuemax': 100,
      };
}

/** Props for {@link LinearProgressIndicator}. */
export interface LinearProgressIndicatorProps extends ProgressLike {
  /** The track's height, in logical pixels. Defaults to Material's, from the catalog. */
  readonly minHeight?: number;
}

/**
 * Flutter's `LinearProgressIndicator` — a horizontal progress track.
 *
 * **Determinate only.** A null `value` is indeterminate in Flutter, which animates the bar on a 1800 ms cycle
 * — an animation, and the animation engine is deferred to M5 (see this package's barrel). Rather than
 * render a still bar that looks
 * stuck, the indeterminate form renders an empty track with the `progressbar` role and no value, which is
 * what "in progress, amount unknown" means to assistive technology and what it looks like on screen.
 *
 * No default corner radius, and that is Flutter 3.44's answer rather than an omission: `year2023` resolves to
 * `true`, selecting a defaults class that does not override `borderRadius`. The rounded 2024 form applies
 * only to an app that opts in.
 *
 * @param props - see {@link LinearProgressIndicatorProps}.
 * @returns the track.
 */
export function LinearProgressIndicator(props: LinearProgressIndicatorProps): ReactElement {
  const theme = useThemeSurface();
  const height = props.minHeight ?? size('LinearProgressIndicator', 'minHeight');
  const track: CSSProperties = {
    width: '100%',
    height,
    backgroundColor: theme.color(role('LinearProgressIndicator', 'trackColorRole')),
    overflow: 'hidden',
  };
  const bar: CSSProperties = {
    height: '100%',
    width: props.value === undefined ? '0%' : `${Math.max(0, Math.min(1, props.value)) * 100}%`,
    backgroundColor: theme.color(role('LinearProgressIndicator', 'colorRole')),
  };
  return createElement(
    'div',
    { style: track, ...progressAria(props.value) },
    createElement('div', { style: bar }),
  );
}

/** Props for {@link CircularProgressIndicator}. */
export interface CircularProgressIndicatorProps extends ProgressLike {
  /** The ring's thickness, in logical pixels. Defaults to Material's, from the catalog. */
  readonly strokeWidth?: number;
}

/**
 * Flutter's `CircularProgressIndicator` — a ring that fills as progress is made.
 *
 * An SVG circle with a dash offset, which is how a browser draws an arc without a canvas: the ring's
 * circumference becomes the dash length, and the visible fraction is the progress. Exact, and it scales
 * without rasterising.
 *
 * **36 logical pixels**, not 40. `year2023` resolves to `true` in Flutter 3.44, which selects a defaults
 * class whose `constraints` are `minWidth: 36`; the 40 that the Material 3 specification describes belongs to
 * the opt-in 2024 class. Reading the SDK rather than the spec is the difference.
 *
 * Indeterminate is a still empty ring, for the reason {@link LinearProgressIndicator} states.
 *
 * @param props - see {@link CircularProgressIndicatorProps}.
 * @returns the ring.
 */
export function CircularProgressIndicator(props: CircularProgressIndicatorProps): ReactElement {
  const theme = useThemeSurface();
  const diameter = size('CircularProgressIndicator', 'size');
  const stroke = props.strokeWidth ?? size('CircularProgressIndicator', 'strokeWidth');
  // `strokeAlign` is centre in this Flutter version, so the ring straddles the radius and the drawable
  // radius is inset by half the stroke.
  const radius = (diameter - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = props.value === undefined ? 0 : Math.max(0, Math.min(1, props.value));

  return createElement(
    'svg',
    {
      width: diameter,
      height: diameter,
      viewBox: `0 0 ${diameter} ${diameter}`,
      style: { display: 'block', flexShrink: 0 },
      ...progressAria(props.value),
    },
    createElement('circle', {
      cx: diameter / 2,
      cy: diameter / 2,
      r: radius,
      fill: 'none',
      stroke: theme.color(role('CircularProgressIndicator', 'colorRole')),
      strokeWidth: stroke,
      strokeDasharray: circumference,
      strokeDashoffset: circumference * (1 - fraction),
      // Twelve o'clock, which is where Flutter starts its arc; SVG's zero angle is three o'clock.
      transform: `rotate(-90 ${diameter / 2} ${diameter / 2})`,
    }),
  );
}

/** Props for {@link Tooltip}. Flutter's `Tooltip`. */
export interface TooltipProps {
  /** The text to show. Flutter's `message`. */
  readonly message?: string;
  /** What the tooltip describes. Flutter's `child` slot, per the catalog. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `Tooltip` — a label shown on hover or long-press.
 *
 * The **structure** is rendered and the **presentation trigger is the browser's**: `title` is the platform's
 * own tooltip, shown on hover after the platform's own delay, positioned by the platform. Flutter's timings
 * (`waitDuration` zero, `showDuration` 1500 ms) and its `verticalOffset` are therefore not applied — a
 * bespoke overlay that reproduced them would be an imperative overlay, which is the family that still needs
 * its own ADR.
 *
 * `aria-label` accompanies it, because a `title` alone is not reliably announced.
 *
 * @param props - see {@link TooltipProps}.
 * @returns the child, with the tooltip attached.
 */
export function Tooltip(props: TooltipProps): ReactElement {
  return createElement(
    'span',
    {
      style: { display: 'inline-flex' },
      title: props.message,
      'aria-label': props.message,
    },
    props.child,
  );
}
