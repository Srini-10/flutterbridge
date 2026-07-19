// Checkbox, Switch, Radio, Slider — the controlled selection controls.
//
// ## Why these are one file and one shape
//
// Every one of them is the same thing: a value in, a callback out, and no state of its own. The analyzer
// confirms it — `Checkbox(value: _accepted, onChanged: (v) { setState(() => _accepted = v); })` extracts as
// `value: bind.Signal` and `onChanged: logic.Lambda`, and so do `Switch` and `Slider`. That is React's
// controlled-input pattern arriving unprompted from Dart, so the components below simply *are* controlled
// inputs and hold no `useState` between them.
//
// The consequence worth stating: a control whose `onChanged` is null is **disabled** in Flutter, and is
// disabled here. That is not a styling choice, it is the widget's contract — `Checkbox(onChanged: null)` is
// how Flutter spells a disabled checkbox — and getting it wrong would render an interactive control that
// silently does nothing.
//
// ## The paint
//
// Native `<input>` elements, styled with `accent-color`. Two reasons rather than one: a native control is
// keyboard-accessible, announces itself correctly to a screen reader and behaves like the platform's own
// without any of it being reimplemented; and `accent-color` is the one CSS property that recolours a native
// control's *checked* state, which is the only colour M3 actually specifies for these. Redrawing them as
// divs would mean rebuilding focus rings, keyboard handling and ARIA from scratch to look the same.
//
// Every colour is a token and every dimension comes from `generated/material_metadata.ts` — the catalog's
// transcription of Flutter's own defaults classes.

import { createElement, type CSSProperties, type ReactElement } from 'react';

import { componentDefault } from '../generated/material_metadata.js';
import { useThemeSurface } from '../react/theme.js';

const num = (component: string, field: string): number => Number(componentDefault(component, field));
const role = (component: string, field: string): string => String(componentDefault(component, field));

/** Props for {@link Checkbox}. Flutter's `Checkbox`. */
export interface CheckboxProps {
  /** Whether it is ticked. `null` is Flutter's tristate "neither", rendered indeterminate. */
  readonly value?: boolean | null;
  /** Called with the new value. **`undefined` disables the control**, as `null` does in Flutter. */
  readonly onChanged?: (value: boolean) => void;
}

/**
 * Flutter's `Checkbox` — a tickable box.
 *
 * `value: null` renders the **indeterminate** state, which is what Flutter's tristate checkbox shows for it —
 * a dash rather than a tick, and distinct from unticked. A checkbox that rendered it as unticked would be
 * showing a value the author did not set.
 *
 * @param props - see {@link CheckboxProps}.
 * @returns the checkbox.
 * @throws RuntimeError - `BRG4006` if the theme lacks the roles it paints.
 */
export function Checkbox(props: CheckboxProps): ReactElement {
  const theme = useThemeSurface();
  const disabled = props.onChanged === undefined;
  const style: CSSProperties = {
    width: num('Checkbox', 'size'),
    height: num('Checkbox', 'size'),
    accentColor: theme.color(role('Checkbox', 'fillColorRole')),
    margin: 0,
    flexShrink: 0,
  };
  return createElement('input', {
    type: 'checkbox',
    checked: props.value === true,
    // The DOM's own tristate: `indeterminate` is not an attribute, so React sets it through the property —
    // which is why it is written here rather than alongside `checked`.
    ref: (element: { indeterminate: boolean } | null): void => {
      if (element !== null) element.indeterminate = props.value === null || props.value === undefined;
    },
    disabled,
    style,
    onChange: (event: { target: { checked: boolean } }): void => props.onChanged?.(event.target.checked),
  });
}

/** Props for {@link Switch}. Flutter's `Switch`. */
export interface SwitchProps {
  /** Whether it is on. */
  readonly value?: boolean;
  /** Called with the new value. **`undefined` disables the control**, as `null` does in Flutter. */
  readonly onChanged?: (value: boolean) => void;
}

/**
 * Flutter's `Switch` — a two-state toggle.
 *
 * A checkbox with the switch role, not a redrawn track and thumb. Flutter's M3 switch is painted by a custom
 * painter with no size constants to transcribe (the catalog says so at its entry), so the *geometry* here is
 * this kit's own and only the colours are Material's. Reproducing the exact track and thumb would mean
 * inventing dimensions and losing the native control's keyboard and screen-reader behaviour to do it.
 *
 * @param props - see {@link SwitchProps}.
 * @returns the switch.
 */
export function Switch(props: SwitchProps): ReactElement {
  const theme = useThemeSurface();
  const disabled = props.onChanged === undefined;
  const style: CSSProperties = {
    accentColor: theme.color(role('Switch', 'selectedTrackColorRole')),
    margin: 0,
    flexShrink: 0,
  };
  return createElement('input', {
    type: 'checkbox',
    role: 'switch',
    checked: props.value === true,
    disabled,
    style,
    onChange: (event: { target: { checked: boolean } }): void => props.onChanged?.(event.target.checked),
  });
}

/** Props for {@link Radio}. Flutter's `Radio<T>`. */
export interface RadioProps<T> {
  /** This button's value. */
  readonly value: T;
  /** The group's current value. This button is selected when the two are equal. */
  readonly groupValue?: T;
  /** Called with this button's value when it is chosen. **`undefined` disables it**, as `null` does. */
  readonly onChanged?: (value: T) => void;
}

/**
 * Flutter's `Radio` — one option in a group.
 *
 * Selection is `value === groupValue`, exactly as Flutter computes it, so a group is a set of radios sharing
 * a `groupValue` and nothing coordinates them but that comparison. No `name` attribute is emitted: the
 * browser's own grouping would be a *second* source of truth for which button is selected, and the two would
 * disagree the moment `groupValue` changed for any reason other than a click.
 *
 * @param props - see {@link RadioProps}.
 * @returns the radio button.
 */
export function Radio<T>(props: RadioProps<T>): ReactElement {
  const theme = useThemeSurface();
  const disabled = props.onChanged === undefined;
  const style: CSSProperties = {
    width: num('Checkbox', 'size'),
    height: num('Checkbox', 'size'),
    accentColor: theme.color(role('Checkbox', 'fillColorRole')),
    margin: 0,
    flexShrink: 0,
  };
  return createElement('input', {
    type: 'radio',
    checked: props.value === props.groupValue,
    disabled,
    style,
    onChange: (): void => props.onChanged?.(props.value),
  });
}

/** Props for {@link Slider}. Flutter's `Slider`. */
export interface SliderProps {
  /** The current value, between `min` and `max`. */
  readonly value?: number;
  /** The lowest value. Defaults to `0`, as in Flutter. */
  readonly min?: number;
  /** The highest value. Defaults to `1`, as in Flutter. */
  readonly max?: number;
  /** How many discrete steps the track has. Omitted, the slider is continuous. */
  readonly divisions?: number;
  /** Called with the new value. **`undefined` disables the control**, as `null` does in Flutter. */
  readonly onChanged?: (value: number) => void;
}

/**
 * Flutter's `Slider` — a value chosen along a track.
 *
 * `divisions` becomes the step: Flutter divides the range into that many intervals, so the step is
 * `(max - min) / divisions` — not `1`, and not `divisions`. A continuous slider gets `'any'`, which is the
 * DOM's way of saying the same thing.
 *
 * @param props - see {@link SliderProps}.
 * @returns the slider.
 */
export function Slider(props: SliderProps): ReactElement {
  const theme = useThemeSurface();
  const min = props.min ?? 0;
  const max = props.max ?? 1;
  const disabled = props.onChanged === undefined;
  const style: CSSProperties = {
    accentColor: theme.color(role('Slider', 'activeTrackColorRole')),
    height: num('Slider', 'thumbSize'),
    width: '100%',
    margin: 0,
  };
  return createElement('input', {
    type: 'range',
    value: props.value ?? min,
    min,
    max,
    step: props.divisions === undefined ? 'any' : (max - min) / props.divisions,
    disabled,
    style,
    onChange: (event: { target: { value: string } }): void =>
      props.onChanged?.(Number(event.target.value)),
  });
}
