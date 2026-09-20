import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, harness, projectStaticsRefusalRaw } from './support.js';

// M12 — a mutable static field and a mutable top-level variable are refused BY NAME. A module-level `let` would be state
// shared by every request a server process handles (INV-19); emitting one would be a silent semantic change.
afterAll(cleanupBuildProofTemporaries);

describe('mutable module-level state is refused, not emitted', () => {
  const run = () => {
    const { context, reported } = harness(compiledFrom(projectStaticsRefusalRaw()));
    const { files } = reactGenerator.generate(context);
    return { files, errors: reported.filter((d) => d.severity === 'error' && d.code === 'BRG3013') };
  };

  it('refuses both, and emits nothing', () => {
    const { files, errors } = run();
    expect(errors).toHaveLength(2);
    expect(files).toEqual([]);
  });

  it('names each and says why', () => {
    const messages = run().errors.map((d) => d.message);
    expect(messages.some((m) => m.startsWith('`hits`') && m.includes('mutable top-level variable') && m.includes('INV-19'))).toBe(true);
    expect(messages.some((m) => m.startsWith('`Registry.created`') && m.includes('mutable static'))).toBe(true);
  });
});
