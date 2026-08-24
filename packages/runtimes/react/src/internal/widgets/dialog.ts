// A route overlay's own destination — `showDialog(builder: (_) => AlertDialog(...))` (M9-D, ADR-0025
// amendment `0025-amendment-inline-overlay-destinations.md`) — and its own dismissal, from inside an
// action button (M9-E, `0025-amendment-dialog-dismissal-scope.md`).
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
// styling below is deliberately plain. A dismissal never carries a result value (M9-E's own scope, see the
// ADR amendment §4) — `close()` takes no argument, and nothing here transports one.

import { createElement, forwardRef, useImperativeHandle, useRef, type ReactNode, type Ref } from 'react';

/**
 * Imperative handle a generated `logic.Navigate` push/pop calls.
 *
 * `close()` (M9-E) is the lowering of a `Navigator.pop(...)` the analyzer proved dismisses *this*
 * presentation (`logic.Navigate.dismisses`) — never inferred here from "a dialog happens to be open"; the
 * generator only ever calls this specific ref's own `close()`, resolved by the same `dialogRefFor` lookup
 * `show()` already uses. The native `<dialog>`'s own Escape-key and backdrop-click dismissal work
 * regardless, without this handle's help, and calling `close()` on an already-closed `<dialog>` is a no-op
 * per the HTML spec — dismissal is safe to call at most once from generated code, and safe if it is not.
 */
export interface DialogHostHandle {
  /** Shows the dialog — the lowering of the `showDialog(...)`-shaped push that names it. */
  show(): void;
  /** Dismisses the dialog — the lowering of a `Navigator.pop(...)` proved to target it (M9-E). */
  close(): void;
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
    close: () => dialogRef.current?.close(),
  }));
  return createElement('dialog', { ref: dialogRef }, children);
});

/**
 * The two capabilities {@link DialogHost} needs of the native element it attaches to — named structurally,
 * the same way `input.ts`'s own `Focusable` is, because this package's `lib` is `ES2023` with no DOM.
 * `showModal`/`close` are the real `HTMLDialogElement` methods; naming them here rather than importing the
 * DOM lib keeps this file provably server-renderable, the same property `Focusable` protects.
 */
interface DialogElement {
  showModal(): void;
  close(): void;
}

/** Props for {@link AlertDialog}. */
export interface AlertDialogProps {
  /** Flutter's `title:` slot. */
  readonly title?: ReactNode;
  /** Flutter's `content:` slot. */
  readonly content?: ReactNode;
  /**
   * Flutter's `actions:` list (M9-E) — rendered as ordinary JSX children, the same way any other
   * catalogued widget's own unslotted `children` already are (`emitElement`, unmodified); `AlertDialog`
   * has no catalog `childrenProp` (`catalog/widgets/material.json`'s own comment explains why: the
   * *extraction* shape needed none), but the generator still emits `actions:` as this component's own
   * positional children, so this prop is where they land.
   */
  readonly children?: ReactNode;
}

/**
 * `AlertDialog`'s own content — the surface `DialogHost`'s `<dialog>` shows.
 *
 * A widget mapping like any other (`WIDGET_MAP`, ADR-6): title, content, then actions render in that
 * order, with no assumption about what shows it — `DialogHost` above is the one caller today, and a
 * future `showModalBottomSheet`/`showMenu` mapping could reuse the same host with different content.
 *
 * An action button's own `onPressed` renders exactly like any other callback — nothing here is aware of
 * dismissal at all. `Navigator.pop(...)` inside one lowers to `dialogRef.current?.close()` at the
 * `logic.Navigate` call site (`statement.ts`), not here; this component only ever renders what it is
 * given. The native `<dialog>` element's own Escape-key and backdrop-click dismissal still work
 * regardless of whether any action button is present.
 */
export function AlertDialog({ title, content, children }: AlertDialogProps): ReturnType<typeof createElement> {
  return createElement(
    'div',
    { className: 'bridge-alert-dialog' },
    title === undefined ? null : createElement('div', { className: 'bridge-alert-dialog-title' }, title),
    content === undefined ? null : createElement('div', { className: 'bridge-alert-dialog-content' }, content),
    children === undefined ? null : createElement('div', { className: 'bridge-alert-dialog-actions' }, children),
  );
}
