import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG, defaultConfigDocument, parseConfig } from '../src/index.js';

// The configuration parser. It is the first thing a new user's mistakes land on, so what it *says* matters
// as much as what it accepts.

describe('parseConfig', () => {
  it('an empty document is the defaults', () => {
    // A Flutter project with no configuration must compile. Requiring a file to do nothing would be
    // requiring ceremony.
    const { config, problems } = parseConfig({});
    expect(problems).toEqual([]);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('the document `init` writes parses back to the defaults', () => {
    // The file is also the documentation, so it must not drift from what it documents.
    const { config, problems } = parseConfig(JSON.parse(defaultConfigDocument()));
    expect(problems).toEqual([]);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('collects every problem, not the first', () => {
    // A user with three mistakes should learn that once. A parser that stops at the first makes them run
    // the tool once per mistake.
    const { problems } = parseConfig({ source: 1, out: '', 'diagnostics': { level: 'loud' } });
    expect(problems.map((p) => p.key).sort()).toEqual(['diagnostics.level', 'out', 'source']);
  });

  it('names an unknown key and lists the real ones', () => {
    // Almost always a typo, and being told `out` exists is the whole value of noticing.
    const { problems } = parseConfig({ outDir: 'build' });
    expect(problems).toHaveLength(1);
    expect(problems[0]?.key).toBe('outDir');
    expect(problems[0]?.message).toContain('out');
  });

  it('reports problems in a deterministic order', () => {
    // Diagnostics are part of the output a user diffs.
    const document = { zebra: 1, alpha: 2, middle: 3 };
    expect(parseConfig(document).problems.map((p) => p.key)).toEqual(
      parseConfig(document).problems.map((p) => p.key),
    );
    expect(parseConfig(document).problems.map((p) => p.key)).toEqual(['alpha', 'middle', 'zebra']);
  });

  it('a bad value falls back to the default rather than to nothing', () => {
    // The configuration is returned even when it has problems, so a caller can report all of them instead
    // of failing on the first and hiding the rest.
    const { config } = parseConfig({ source: 42 });
    expect(config.source).toBe(DEFAULT_CONFIG.source);
  });

  it('refuses a document that is not an object, and says what one looks like', () => {
    const { problems } = parseConfig([1, 2, 3]);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toContain('JSON object');
  });

  it('accepts every valid diagnostics level and rejects the rest', () => {
    for (const level of ['error', 'warning', 'info'] as const) {
      expect(parseConfig({ diagnostics: { level } }).problems).toEqual([]);
    }
    expect(parseConfig({ diagnostics: { level: 'debug' } }).problems).toHaveLength(1);
  });
});
