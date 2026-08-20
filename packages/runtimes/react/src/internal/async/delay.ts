// `Future.delayed(Duration(...))` — M7-L.
//
// Not a `Future` compatibility class. Every measured use of Dart's `Future` in the real corpus this
// milestone had to hand (`hello_bridge`) is `await Future<void>.delayed(const Duration(milliseconds: 400))`
// — a single `Duration`, no computation callback, awaited in statement position. JavaScript already has the
// value that shape needs: `Promise<void>`, and `await` already lowers to `await` (`logic.Await`, unchanged
// since before this milestone). The only missing piece was a function to await.
//
// `Duration` survives as the kit's own `Duration` — mirrored in `widgets/animation.ts` for M4-H's implicit
// animations — rather than being reduced to a raw millisecond number at the call site, for the same reason
// that file gives: `Future.delayed(Duration(milliseconds: 400))` should read as `delay(new Duration({
// milliseconds: 400 }))`, not as a number a reviewer has to trace back to the Dart to understand.
//
// The two-argument overload — `Future.delayed(duration, computation)` — is a different capability: it runs
// `computation` after the delay and resolves to *its* result, which this function cannot express. The
// generator refuses that shape by name (`BRG3002`) rather than silently dropping the callback.

import type { Duration } from '../widgets/animation.js';

/**
 * Resolves after `duration` — Dart's `Future.delayed(duration)`, the single-argument form.
 *
 * @param duration - how long to wait.
 * @returns a promise that resolves once `duration` has elapsed.
 */
export function delay(duration: Duration): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, duration.inMilliseconds);
  });
}
