// ElevatedButton — the disabled semantics, and none of the elevation.
//
// ## `onPressed: null` disables the button. That is the whole widget here.
//
// It is Flutter's rule and it surprises everyone who meets it: `ElevatedButton({required this.onPressed})`
// is *required but nullable*, and passing `null` is how you disable it. There is no `enabled` prop, because
// the callback's absence is the disablement — Flutter derives `enabled => onPressed != null`. Generated code
// therefore says `onPressed: enabled ? handler : null`, mirroring the Dart, and this component has to read
// that the same way Flutter does or every conditional button in every converted application is live when it
// should be dead. A disabled button that still fires is not a rendering defect; it is a purchase.
//
// ## Two absent values for a callback Dart has one of
//
// Dart has one absence: `null`. TypeScript hands us two, and `onPressed?: (() => void) | null | undefined`
// admits both on purpose, unlike `EdgeInsets.symmetric`'s parameters (see `edge_insets.ts`, which takes the
// opposite decision from the same reasoning). Under `exactOptionalPropertyTypes` a bare `onPressed?: (() =>
// void) | null` would reject `{ ...props }` where `props.onPressed` is `(() => void) | undefined` — an
// ordinary shape for a component forwarding its own optional prop — so the type would be pushing callers
// toward a cast. Both absences mean disabled, and they mean it in one place: `?? null`, below. Treating them
// differently would make "prop omitted" and "prop passed as undefined" render two different buttons, which
// is a distinction no Flutter source can express and no reviewer would think to check.
//
// ## `type="button"`, which Flutter does not have and the DOM needs
//
// A `<button>` inside a `<form>` defaults to `type="submit"`: clicking it submits the form and navigates.
// Flutter's `ElevatedButton` does nothing of the sort, and the catalog lists `Form` as a mapped widget, so
// the two will meet. This is not styling and not a liberty — it is switching off a DOM default that
// contradicts the semantics being mapped. Left alone it would show up as a converted form reloading the page
// on a button that was only ever supposed to call a handler.
//
// ## Why it has no appearance (INV-20)
//
// ADR-13: "Generated code and kit components contain no literal colour values." An `ElevatedButton`'s
// container colour, its `onPrimary` label, its elevation tint and its hover/pressed state layers are all
// roles — `primary`, `surfaceTint` — that N10 derives and the theme resolves. `color.ts` already implements
// the composition (`stateLayer`, `elevationOverlay`) and takes the opacities as arguments, because Material's
// state-layer opacities are framework metadata and ADR-18 puts those in `catalog/` or nowhere.
// `catalog/widgets/material.json` does not carry them yet.
//
// So this button renders with the user agent's chrome, and looks unfinished. That is the correct failure:
// ADR-13's evidence table is exactly this widget — "Button container | Flutter rgb(247,242,250) | Kit
// rgb(232,230,248) | Δ 15, 12, 2" — a hand-written React reference that guessed a plausible purple and was
// wrong by 15/255 on a screen that looked entirely finished. A button that is visibly unstyled is a widget
// someone will finish. A button that is invisibly the wrong purple is a bug with no reporter.

import { createElement, type ReactElement, type ReactNode } from 'react';

/** Props for {@link ElevatedButton}. */
export interface ElevatedButtonProps {
  /**
   * The press handler, or `null` to disable the button — Flutter's `VoidCallback? onPressed`.
   *
   * **`null` (or omitted) is not "no handler", it is `disabled`.** Flutter derives the button's enablement
   * from this callback's presence and has no `enabled` prop; so does this. See this file's header.
   */
  readonly onPressed?: (() => void) | null | undefined;
  /** The label. Flutter's `child` slot, per `catalog/widgets/material.json`. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `ElevatedButton` — a button whose enablement is its `onPressed`.
 *
 * **Deliberately unstyled.** Every colour it should paint is a Material role the theme resolves to a token,
 * and inventing one here would violate INV-20 (ADR-13) — see this file's header for what that cost when it
 * was last measured. The behaviour is complete; the elevation is not here yet.
 *
 * @param props - see {@link ElevatedButtonProps}.
 * @returns a `<button>`, disabled when `onPressed` is absent.
 *
 * @example
 * ```ts
 * // ElevatedButton(onPressed: () => store.submit(), child: Text('Save'))
 * createElement(ElevatedButton, { onPressed: () => store.submit(), child: createElement(Text, null, 'Save') });
 *
 * // ElevatedButton(onPressed: valid ? submit : null, child: Text('Save'))  — disabled when invalid
 * createElement(ElevatedButton, { onPressed: valid ? submit : null, child: createElement(Text, null, 'Save') });
 * ```
 */
export function ElevatedButton(props: ElevatedButtonProps): ReactElement {
  // The one place the two absences collapse into Dart's one.
  const onPressed = props.onPressed ?? null;
  return createElement(
    'button',
    {
      type: 'button',
      disabled: onPressed === null,
      // Belt and braces: the DOM will not dispatch a click on a disabled control, and there is nothing
      // attached to dispatch to. Either alone would do; a live handler on a dead button is the one defect
      // this component exists to prevent, so it does not rely on either alone.
      onClick: onPressed ?? undefined,
    },
    props.child,
  );
}
