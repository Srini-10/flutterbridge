import { afterEach, describe, expect, it, vi } from 'vitest';

import { dartDebugPrint } from '../src/index.js';

describe('debugPrint', () => {
  afterEach(() => vi.restoreAllMocks());

  it('writes the message as one console line; wrapWidth is a terminal hint and changes nothing', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    dartDebugPrint('hello');
    dartDebugPrint('wide', 4);
    expect(spy.mock.calls).toEqual([['hello'], ['wide']]);
  });

  it('prints `null` for a null message, as Dart does', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    dartDebugPrint(null);
    expect(spy.mock.calls).toEqual([['null']]);
  });
});
