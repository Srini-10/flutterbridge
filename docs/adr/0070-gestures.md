# ADR-70 — The tap-family gesture model: `GestureDetector`, `InkWell`

- **Status:** Accepted (M13). `GestureDetector`/`InkWell` were refused (`BRG3013`, "the gesture model"): 56 sites in a real consumer app.
- **Date:** 2026-09-21

## Decisions

**D1 — The rules come from Flutter, not from documentation.** `fixtures/apps/gestures` runs each scenario in `flutter test` and in the generated component,
and compares after every step. What it measured (all implemented in `runtimes/react/src/internal/widgets/gesture.ts`, `TapRecognizer`):

- alone, a tap is immediate: `onTapDown`, then at release `onTapUp`, `onTap`; a cancel or a slide past the slop reports `onTapCancel`;
- a competitor (`onDoubleTap` or `onLongPress` on the same detector) delays it: `onTapDown` fires at the 100 ms press deadline (a press cancelled before it
  reports **nothing**), and after a release the tap wins 300 ms later — `onTapDown`, `onTapUp`, `onTap` together;
- a second press within 300 ms of the first release is `onDoubleTap` and *only* that; the first tap reports nothing;
- `onLongPress` fires 500 ms after the press: `onTapCancel` (after `onTapDown`), then `onLongPress`; the release adds nothing;
- the innermost detector with a callback receives the press; a detector with none is transparent;
- **InkWell** is enabled iff it has `onTap`, `onDoubleTap`, `onLongPress` or `onTapDown`; a disabled one is inert and not focusable; it activates `onTap` on
  Enter and Space; `onHover(true/false)` for a mouse; `onFocusChange` for keyboard focus. A **pointer press does not focus it** (measured), so a focus that
  arrives during a press is not reported and a key does not activate an InkWell keyboard focus never reached.

**D2 — Browser events.** Pointer events (`pointerdown/move/up/cancel`, so a touch scroll — which the browser turns into `pointercancel` — cancels a tap), `keydown`
for activation, `focus`/`blur`, `pointerenter/leave`. A `click` with no preceding pointer (assistive technology, `element.click()`) is a whole tap.
`GestureDetector` renders `display: contents` (its hit region is its child's, as `deferToChild`); `InkWell` renders a `role="button"` inline-flex box with
`tabindex=0` when enabled and `aria-disabled` when not.

**D3 — Details.** `TapDownDetails`/`TapUpDetails` carry `globalPosition` and `localPosition` (`Offset`); the generator types a callback parameter with them and reads
`d.localPosition.dx` (`SDK_VALUE_TYPE_NAMES`). Found by the browser build: hoisted handlers typed their parameters `unknown`.

**D4 — Refused by name (`UNSUPPORTED_PARAMETERS`), never accepted and not delivered.** Not built yet: pan, vertical/horizontal drag, scale, the long-press sub-events
(`onLongPressStart/End/Up/MoveUpdate`), `onDoubleTapDown/Cancel`, secondary/tertiary buttons, `onHighlightChanged`, `focusNode`, `statesController`. No browser
equivalent: force press. Dropped with a warning (appearance): `splashColor`, `highlightColor`, `borderRadius`, `behavior`, …

## Documented differences

- Flutter also waits for scroll/drag competitors *above* the detector; an ancestor scroller does not delay `onTapDown` here.
- No ink ripple, splash or highlight (Material appearance; see the button-appearance stub).
- With several detectors nested, Flutter runs one arena per recogniser kind (an outer `onLongPress` can beat an inner `onTap`); here the innermost detector with any callback takes the press.
- A double tap whose second press is held past the window, and a second pointer during a press, are unmeasured edge cases.
- Hover callbacks are not suppressed after keyboard interaction (Flutter's highlight mode switches to "traditional" on a key and reports `onHover(false)`).

## Evidence

11 oracle scenarios (tap, phases, double, long, all callbacks together, disabled InkWell, hover, focus + Enter + Space, nesting, inert), a Chromium suite with a real
mouse and keyboard (double click, long press, drag past the slop, `localPosition`, hover/focus/Enter/Space, the disabled InkWell), production and development.
