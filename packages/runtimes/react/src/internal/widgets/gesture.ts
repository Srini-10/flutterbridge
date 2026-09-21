// GestureDetector and InkWell — the tap family, on the browser's pointer and keyboard events (ADR-0070).
//
// ## What is modelled, and where it was measured
//
// Every rule below was read off a real Flutter run (`fixtures/apps/gestures`, `flutter test`), not off the documentation,
// and the generated component is driven through the same script and compared step by step:
//
//  - **Alone, a tap is immediate.** `onTapDown` at pointer-down, `onTapUp` then `onTap` at pointer-up, `onTapCancel` if the
//    pointer is cancelled or slides away first.
//  - **A competitor delays it.** With `onDoubleTap` or `onLongPress` on the same detector the tap recogniser cannot claim
//    the gesture at once. `onTapDown` then fires at the 100 ms press deadline (or, if the pointer is lifted sooner, is
//    fired together with `onTapUp`/`onTap` when the tap wins); a press cancelled before the deadline reports nothing at all.
//  - **`onDoubleTap`** wins when a second press begins within 300 ms of the first release: then `onDoubleTap` fires, and the
//    first tap's `onTapDown`/`onTapUp`/`onTap` never do. Otherwise the tap wins 300 ms after the release, all three at once.
//  - **`onLongPress`** fires 500 ms after pointer-down; the tap is cancelled (`onTapCancel`, after `onTapDown` if that had
//    been sent) and the release does nothing.
//  - **InkWell** is a detector that is *enabled* when it has `onTap`, `onDoubleTap`, `onLongPress` or `onTapDown` (a disabled
//    one is inert and not focusable), is focusable, activates `onTap` on Enter and Space, and reports `onHover` for a mouse
//    and `onFocusChange` for keyboard focus. A pointer press does not focus it (measured), so a focus that arrives during
//    a press is not reported and a key does not activate an InkWell that keyboard focus never reached.
//
// ## Documented differences (see ADR-0070)
//
//  - Flutter waits for scroll and drag competitors; an ancestor scroller does not delay `onTapDown` here. A pointer that
//    moves further than 18 px, or that the browser cancels (which is what a touch scroll becomes), cancels the tap.
//  - A gesture detector's hit region is its child's, as in Flutter (`display: contents`); `behavior:` is not forwarded.
//  - No ink ripple: an InkWell's splash, highlight and hover/focus overlays are Material *appearance* and follow the
//    button-appearance stub (see `index.ts`).
//  - The pointer position is reported in CSS pixels; Flutter's are logical pixels — the same unit at a device-pixel ratio
//    of 1, which is how a browser reports CSS pixels.
//
// A gesture the model does not have (pan, drag, scale, secondary buttons, long-press sub-events) is refused by the
// generator by name (`UNSUPPORTED_PARAMETERS`) rather than accepted and never delivered.

import {
  createElement,
  useEffect,
  useRef,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

import { Offset } from '../layout/decoration.js';

/** How long a press must last before `onTapDown` is sent while another recogniser may still claim it — `kPressTimeout`. */
const PRESS_TIMEOUT_MS = 100;
/** The window after a release in which a second press makes a double tap — `kDoubleTapTimeout`. */
const DOUBLE_TAP_TIMEOUT_MS = 300;
/** How long a press must last to be a long press — `kLongPressTimeout`. */
const LONG_PRESS_TIMEOUT_MS = 500;
/** How far a pointer may move before the tap is abandoned — `kTouchSlop`. */
const SLOP = 18;

/** Flutter's `TapDownDetails`. */
export class TapDownDetails {
  /** Where the pointer touched, in the viewport. */
  public readonly globalPosition: Offset;
  /** Where the pointer touched, relative to the detector. */
  public readonly localPosition: Offset;

  public constructor(globalPosition: Offset, localPosition: Offset) {
    this.globalPosition = globalPosition;
    this.localPosition = localPosition;
  }
}

/** Flutter's `TapUpDetails`. */
export class TapUpDetails {
  /** Where the pointer was lifted, in the viewport. */
  public readonly globalPosition: Offset;
  /** Where the pointer was lifted, relative to the detector. */
  public readonly localPosition: Offset;

  public constructor(globalPosition: Offset, localPosition: Offset) {
    this.globalPosition = globalPosition;
    this.localPosition = localPosition;
  }
}

/** The callbacks a detector takes. Each is `null`/absent when the Dart parameter is. */
export interface GestureCallbacks {
  readonly onTap?: (() => void) | null | undefined;
  readonly onDoubleTap?: (() => void) | null | undefined;
  readonly onLongPress?: (() => void) | null | undefined;
  readonly onTapDown?: ((details: TapDownDetails) => void) | null | undefined;
  readonly onTapUp?: ((details: TapUpDetails) => void) | null | undefined;
  readonly onTapCancel?: (() => void) | null | undefined;
}

type Phase = 'idle' | 'down' | 'awaitingDouble' | 'secondDown' | 'long';

interface Point {
  readonly x: number;
  readonly y: number;
  readonly rect: { readonly left: number; readonly top: number };
}

/**
 * The tap recogniser: one pointer at a time, the arena rules above. It owns its timers and reads the callbacks through
 * `latest()` at the moment it fires, so a rebuild that changes a handler (or removes it) is honoured by a press already
 * in flight, as in Flutter, where the recogniser's callbacks are reassigned on every build.
 */
export class TapRecognizer {
  private phase: Phase = 'idle';
  private pointer: number | null = null;
  private start: Point | null = null;
  private last: Point | null = null;
  private sentDown = false;
  private pressTimer: ReturnType<typeof setTimeout> | undefined;
  private longTimer: ReturnType<typeof setTimeout> | undefined;
  private doubleTimer: ReturnType<typeof setTimeout> | undefined;

  public constructor(private readonly latest: () => GestureCallbacks) {}

  /** Whether another recogniser on this detector could claim the gesture, so the tap must wait to be sure. */
  private get contested(): boolean {
    const callbacks = this.latest();
    return (callbacks.onDoubleTap ?? null) !== null || (callbacks.onLongPress ?? null) !== null;
  }

  public down(pointer: number, at: Point): void {
    if (this.pointer !== null && this.pointer !== pointer) return;
    const callbacks = this.latest();
    if (this.phase === 'awaitingDouble' && (callbacks.onDoubleTap ?? null) !== null) {
      clearTimeout(this.doubleTimer);
      this.pointer = pointer;
      this.start = at;
      this.last = at;
      this.phase = 'secondDown';
      return;
    }
    if (this.phase === 'awaitingDouble') this.resolveTap();
    this.reset();
    this.pointer = pointer;
    this.start = at;
    this.last = at;
    this.phase = 'down';
    this.sentDown = false;
    if (!this.contested) {
      this.sendDown();
      return;
    }
    this.pressTimer = setTimeout(() => {
      if (this.phase === 'down') this.sendDown();
    }, PRESS_TIMEOUT_MS);
    if ((callbacks.onLongPress ?? null) !== null) {
      this.longTimer = setTimeout(() => this.longPressed(), LONG_PRESS_TIMEOUT_MS);
    }
  }

  public move(pointer: number, at: Point): void {
    if (pointer !== this.pointer || this.start === null) return;
    this.last = at;
    if (this.phase === 'long') return;
    if (Math.hypot(at.x - this.start.x, at.y - this.start.y) > SLOP) this.abandon();
  }

  public up(pointer: number, at: Point): void {
    if (pointer !== this.pointer) return;
    this.last = at;
    if (this.phase === 'long') {
      this.reset();
      return;
    }
    if (this.phase === 'secondDown') {
      this.reset();
      this.latest().onDoubleTap?.();
      return;
    }
    if (this.phase !== 'down') return;
    clearTimeout(this.pressTimer);
    clearTimeout(this.longTimer);
    this.pointer = null;
    if ((this.latest().onDoubleTap ?? null) !== null) {
      this.phase = 'awaitingDouble';
      this.doubleTimer = setTimeout(() => this.resolveTap(), DOUBLE_TAP_TIMEOUT_MS);
      return;
    }
    this.resolveTap();
  }

  public cancel(pointer: number): void {
    if (pointer !== this.pointer) return;
    this.abandon();
  }

  /** Stops every timer; a press pending at unmount never reports. */
  public dispose(): void {
    this.reset();
  }

  private abandon(): void {
    const wasSecond = this.phase === 'secondDown';
    const sent = this.sentDown;
    this.clearTimers();
    if (wasSecond) {
      this.phase = 'awaitingDouble';
      this.pointer = null;
      this.resolveTap();
      return;
    }
    this.phase = 'idle';
    this.pointer = null;
    if (sent) this.latest().onTapCancel?.();
    this.sentDown = false;
  }

  /** The tap won: `onTapDown` if not yet sent, then `onTapUp`, then `onTap`. */
  private resolveTap(): void {
    clearTimeout(this.doubleTimer);
    const at = this.last;
    this.phase = 'idle';
    this.pointer = null;
    if (!this.sentDown) this.sendDown();
    this.sentDown = false;
    const callbacks = this.latest();
    if (at !== null) callbacks.onTapUp?.(new TapUpDetails(globalOf(at), localOf(at)));
    callbacks.onTap?.();
  }

  private sendDown(): void {
    this.sentDown = true;
    const at = this.start;
    if (at === null) return;
    this.latest().onTapDown?.(new TapDownDetails(globalOf(at), localOf(at)));
  }

  private longPressed(): void {
    if (this.phase !== 'down') return;
    clearTimeout(this.pressTimer);
    if (!this.sentDown) this.sendDown();
    this.phase = 'long';
    const callbacks = this.latest();
    callbacks.onTapCancel?.();
    callbacks.onLongPress?.();
  }

  private clearTimers(): void {
    clearTimeout(this.pressTimer);
    clearTimeout(this.longTimer);
    clearTimeout(this.doubleTimer);
  }

  private reset(): void {
    this.clearTimers();
    this.phase = 'idle';
    this.pointer = null;
    this.start = null;
    this.last = null;
    this.sentDown = false;
  }
}

function globalOf(point: Point): Offset {
  return new Offset(point.x, point.y);
}

function localOf(point: Point): Offset {
  return new Offset(point.x - point.rect.left, point.y - point.rect.top);
}

/** The two DOM capabilities a pointer position needs; the kit compiles without the DOM lib. */
interface Measurable {
  readonly firstElementChild: Measurable | null;
  getBoundingClientRect(): { readonly left: number; readonly top: number };
}

function pointOf(event: PointerEvent<Element>): Point {
  // A `display: contents` detector has no box of its own; its first child is what the pointer is inside.
  const target = event.currentTarget as unknown as Measurable;
  const box = (target.firstElementChild ?? target).getBoundingClientRect();
  return { x: event.clientX, y: event.clientY, rect: { left: box.left, top: box.top } };
}

/**
 * The presses an inner detector has already claimed. A press bubbles to every enclosing detector, but Flutter's arena has
 * one tap winner: the innermost recogniser (the deepest in the hit test), so an outer `onTap` does not also fire.
 */
const claimed = new WeakSet<object>();

/** The press handlers shared by both components, bound to one recogniser. */
function usePress(callbacks: GestureCallbacks): {
  readonly onPointerDown: (event: PointerEvent<Element>) => void;
  readonly onPointerMove: (event: PointerEvent<Element>) => void;
  readonly onPointerUp: (event: PointerEvent<Element>) => void;
  readonly onPointerCancel: (event: PointerEvent<Element>) => void;
  readonly onClick: (event: MouseEvent<Element>) => void;
  readonly pressing: () => boolean;
} {
  const latest = useRef(callbacks);
  latest.current = callbacks;
  const recognizer = useRef<TapRecognizer | null>(null);
  recognizer.current ??= new TapRecognizer(() => latest.current);
  const held = useRef(false);
  const sawPointer = useRef(false);
  useEffect(() => {
    const current = recognizer.current;
    return () => current?.dispose();
  }, []);
  const anyCallback =
    callbacks.onTap != null || callbacks.onDoubleTap != null || callbacks.onLongPress != null || callbacks.onTapDown != null;
  return {
    onPointerDown(event) {
      // Only the primary button of a mouse; a touch or a pen is always primary.
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (claimed.has(event.nativeEvent)) return;
      if (anyCallback) claimed.add(event.nativeEvent);
      sawPointer.current = true;
      held.current = true;
      recognizer.current?.down(event.pointerId, pointOf(event));
    },
    onPointerMove(event) {
      recognizer.current?.move(event.pointerId, pointOf(event));
    },
    onPointerUp(event) {
      held.current = false;
      recognizer.current?.up(event.pointerId, pointOf(event));
    },
    onPointerCancel(event) {
      held.current = false;
      recognizer.current?.cancel(event.pointerId);
    },
    // A click nobody pressed for — assistive technology, or `element.click()` — is a whole tap.
    onClick(event) {
      if (event.detail !== 0 || sawPointer.current || !anyCallback || claimed.has(event.nativeEvent)) return;
      claimed.add(event.nativeEvent);
      const callbacksNow = latest.current;
      const at = { x: event.clientX, y: event.clientY, rect: { left: 0, top: 0 } };
      callbacksNow.onTapDown?.(new TapDownDetails(globalOf(at), localOf(at)));
      callbacksNow.onTapUp?.(new TapUpDetails(globalOf(at), localOf(at)));
      callbacksNow.onTap?.();
    },
    pressing: () => held.current,
  };
}

/** Props for {@link GestureDetector}. */
export interface GestureDetectorProps extends GestureCallbacks {
  /** The widget the detector wraps. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `GestureDetector` for the tap family. Renders a `display: contents` element, so it takes no space and its hit
 * region is its child's — Flutter's `HitTestBehavior.deferToChild`.
 */
export function GestureDetector(props: GestureDetectorProps): ReactElement {
  const press = usePress(props);
  return createElement(
    'div',
    {
      style: { display: 'contents' },
      onPointerDown: press.onPointerDown,
      onPointerMove: press.onPointerMove,
      onPointerUp: press.onPointerUp,
      onPointerCancel: press.onPointerCancel,
      onClick: press.onClick,
    },
    props.child,
  );
}

/** Props for {@link InkWell}. */
export interface InkWellProps extends GestureCallbacks {
  /** The widget the ink well wraps. */
  readonly child?: ReactNode;
  /** Called when a mouse enters (`true`) or leaves (`false`) the well. */
  readonly onHover?: ((hovering: boolean) => void) | null | undefined;
  /** Called when keyboard focus enters (`true`) or leaves (`false`) the well. */
  readonly onFocusChange?: ((focused: boolean) => void) | null | undefined;
}

/**
 * Flutter's `InkWell`: a focusable, keyboard-activatable detector that is inert unless it has a tap-family callback.
 * Renders no ink; see the header for what is and is not reproduced.
 */
export function InkWell(props: InkWellProps): ReactElement {
  const enabled =
    props.onTap != null || props.onDoubleTap != null || props.onLongPress != null || props.onTapDown != null;
  const press = usePress(enabled ? props : {});
  const latest = useRef(props);
  latest.current = props;
  const keyboardFocus = useRef(false);
  const hovering = useRef(false);
  return createElement(
    'div',
    {
      role: 'button',
      'aria-disabled': enabled ? undefined : true,
      tabIndex: enabled ? 0 : undefined,
      style: { display: 'inline-flex', flexDirection: 'column', verticalAlign: 'top', cursor: enabled ? 'pointer' : undefined },
      onPointerDown: press.onPointerDown,
      onPointerMove: press.onPointerMove,
      onPointerUp: press.onPointerUp,
      onPointerCancel: press.onPointerCancel,
      onClick: press.onClick,
      onPointerEnter: (event: PointerEvent<Element>) => {
        if (event.pointerType !== 'mouse' || !enabled || hovering.current) return;
        hovering.current = true;
        latest.current.onHover?.(true);
      },
      onPointerLeave: (event: PointerEvent<Element>) => {
        if (event.pointerType !== 'mouse' || !hovering.current) return;
        hovering.current = false;
        latest.current.onHover?.(false);
      },
      onFocus: (event: FocusEvent<Element>) => {
        if (event.target !== event.currentTarget || press.pressing()) return;
        keyboardFocus.current = true;
        latest.current.onFocusChange?.(true);
      },
      onBlur: (event: FocusEvent<Element>) => {
        if (event.target !== event.currentTarget || !keyboardFocus.current) return;
        keyboardFocus.current = false;
        latest.current.onFocusChange?.(false);
      },
      onKeyDown: (event: KeyboardEvent<Element>) => {
        if (!enabled || !keyboardFocus.current || event.repeat) return;
        if (event.target !== event.currentTarget) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        latest.current.onTap?.();
      },
    },
    props.child,
  );
}
