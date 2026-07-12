import { describe, expect, it } from 'vitest';

import * as pkg from '../src/index.js';

// M0-T1 gate: every package is importable and buildable. Behaviour arrives with its milestone.
describe('@bridge/verification', () => {
  it('exposes a module boundary', () => {
    expect(pkg).toBeTypeOf('object');
  });
});
