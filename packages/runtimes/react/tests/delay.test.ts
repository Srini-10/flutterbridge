import { describe, expect, it, vi } from 'vitest';

import { delay, Duration } from '../src/index.js';

describe('delay — Future.delayed(Duration(...)), the single-argument form (M7-L)', () => {
  it('resolves to undefined, once, after the duration elapses', async () => {
    vi.useFakeTimers();
    try {
      const spy = vi.fn();
      void delay(new Duration({ milliseconds: 400 })).then(spy);

      await vi.advanceTimersByTimeAsync(399);
      expect(spy).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(undefined);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads the same Duration the kit already carries for animations — no separate unit conversion', async () => {
    // `Duration({ seconds: 1 })` and `Duration({ milliseconds: 1000 })` must schedule identically: `delay`
    // does not reimplement `Duration`'s own arithmetic, it reads `inMilliseconds`.
    vi.useFakeTimers();
    try {
      const bySeconds = vi.fn();
      const byMilliseconds = vi.fn();
      void delay(new Duration({ seconds: 1 })).then(bySeconds);
      void delay(new Duration({ milliseconds: 1000 })).then(byMilliseconds);

      await vi.advanceTimersByTimeAsync(1000);
      expect(bySeconds).toHaveBeenCalledTimes(1);
      expect(byMilliseconds).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a zero duration still resolves asynchronously, not synchronously', async () => {
    // Dart's `Future.delayed(Duration.zero)` still yields to the event loop rather than completing inline —
    // `.then` is observably later than the call, the same way a real network delay would be.
    let resolved = false;
    const p = delay(new Duration()).then(() => {
      resolved = true;
    });
    expect(resolved).toBe(false);
    await p;
    expect(resolved).toBe(true);
  });
});
