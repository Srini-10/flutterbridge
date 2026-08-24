// A route overlay's own destination — `showDialog(builder: (_) => AlertDialog(...))` (M9-D, ADR-0025
// amendment `0025-amendment-inline-overlay-destinations.md`).
//
// ## Why a native `<dialog>`, and why that is the whole runtime cost
//
// `shell.ts`'s own header names this precisely: "`SnackBar`, modal `BottomSheet`, dialogs and menus... are
// shown by an imperative call rather than by being in the tree." A route overlay is not a page — there is
// no router entry, no URL, nothing `useRouter()` already does for it (ADR-0025 §"overlay routes" was wrong
// about that; the analyzer/schema half of the correction is `app.RouteTransition.inline`).
//
// The HTML `<dialog>` element already is "a positioned surface with a scrim" — ADR-0024's own words for
// what an overlay component still needed. `showModal()` centers it, traps focus, and paints a `::backdrop`
// pseudo-element for free; `close()` (or the native Escape-key/backdrop-click dismissal) reverses it. No
// portal, no z-index bookkeeping, no focus-trap library — the platform already does this correctly.
//
// ## What this milestone does not attempt
//
// M3 visual fidelity (elevation, the exact Material dialog surface treatment, `barrierDismissible: false`
// suppressing the native backdrop-click dismissal) is not implemented here — this ships the *structural*
// capability the schema amendment unblocks, not a pixel-faithful Material dialog. `AlertDialog`'s own
// styling below is deliberately plain.

import { createElement, forwardRef, useImperativeHandle, useRef, type ReactNode, type Ref } from 'react';

/**
 * Imperative handle a generated `logic.Navigate` push calls.
 *
 * **No `close()` yet.** Dismissing the dialog from inside it (`Navigator.pop(context)` in an action
 * button) is a genuine, unresolved architectural question (`catalog/widgets/material.json`'s own
 * `AlertDialog` comment, `docs/m9/m9d-dialog-destination-architecture.md` §9) — nothing generated calls
 * one yet, so none is declared. The native `<dialog>`'s own Escape-key and backdrop-click dismissal work
 * regardless, without this handle's help.
 */
export interface DialogHostHandle {
  /** Shows the dialog — the lowering of the `showDialog(...)`-shaped push that names it. */
  show(): void;
}

/** Props for {@link DialogHost}. */
export interface DialogHostProps {
  /** The overlay's own inline content — an `AlertDialog`, or any future overlay destination. */
  readonly children?: ReactNode;
}

/**
 * Hosts one route overlay's own inline destination behind an imperative `show`/`close` handle.
 *
 * Rendered once per `app.RouteTransition.inline` a component reaches (M9-D) — a sibling of the
 * component's own render tree, not inside it, so it exists whether or not it is currently shown.
 */
export const DialogHost = forwardRef<DialogHostHandle, DialogHostProps>(function DialogHost(
  { children }: DialogHostProps,
  ref: Ref<DialogHostHandle>,
) {
  const dialogRef = useRef<DialogElement>(null);
  useImperativeHandle(ref, () => ({
    show: () => dialogRef.current?.showModal(),
  }));
  return createElement('dialog', { ref: dialogRef }, children);
});

/**
 * The one capability {@link DialogHost} needs of the native element it attaches to — named structurally,
 * the same way `input.ts`'s own `Focusable` is, because this package's `lib` is `ES2023` with no DOM.
 * `showModal` is the real `HTMLDialogElement` method; naming it here rather than importing the DOM lib
 * keeps this file provably server-renderable, the same property `Focusable` protects.
 */
interface DialogElement {
  showModal(): void;
}

/** Props for {@link AlertDialog}. */
export interface AlertDialogProps {
  /** Flutter's `title:` slot. */
  readonly title?: ReactNode;
  /** Flutter's `content:` slot. */
  readonly content?: ReactNode;
}

/**
 * `AlertDialog`'s own content — the surface `DialogHost`'s `<dialog>` shows.
 *
 * A widget mapping like any other (`WIDGET_MAP`, ADR-6): title and content render, in that order, with
 * no assumption about what shows it — `DialogHost` above is the one caller today, and a future
 * `showModalBottomSheet`/`showMenu` mapping could reuse the same host with different content.
 *
 * **`actions:` is deliberately not a prop here** — the catalog does not extract it yet
 * (`catalog/widgets/material.json`'s own comment explains why: an action button's `onPressed` commonly
 * dismisses the dialog via `Navigator.pop(context)`, and representing "pop the dialog I'm inside" rather
 * than "pop the page router" is a genuine, unresolved architectural question, not a recognition gap).
 * The native `<dialog>` element's own Escape-key and backdrop-click dismissal still work regardless.
 */
export function AlertDialog({ title, content }: AlertDialogProps): ReturnType<typeof createElement> {
  return createElement(
    'div',
    { className: 'bridge-alert-dialog' },
    title === undefined ? null : createElement('div', { className: 'bridge-alert-dialog-title' }, title),
    content === undefined ? null : createElement('div', { className: 'bridge-alert-dialog-content' }, content),
  );
}
