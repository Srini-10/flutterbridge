// `bridge generate` and `bridge build` came to different conclusions about the same document.
//
// `generate` normalizes a raw document itself, but it took only the normalizer's *program* and dropped its
// *diagnostics* — so a program N11 had refused (BRG2305: a forwarded constructor parameter crossing a route
// boundary) went on to the generator, which reported a different set of errors or none. `build` stopped at the
// normalizer, and additionally left the refused document on disk as `normalized.ndjson`, which `generate` prefers.
//
// The document here is `fixtures/uir/hello_bridge.ndjson`, which N11 refuses with four BRG2305s.

import { existsSync, mkdirSync, mkdtempSync, copyFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { main } from '../src/index.js';

const fixture = join(import.meta.dirname, '../../../fixtures/uir/hello_bridge.ndjson');

let dir: string;
let out: string[];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bridge-gen-norm-'));
  mkdirSync(join(dir, '.bridge'));
  writeFileSync(
    join(dir, 'bridge.json'),
    JSON.stringify({ source: '.', out: 'build/bridge', work: '.bridge', generator: '@bridge/gen-react', plugins: ['@bridge/widgets-material'] }),
  );
  copyFileSync(fixture, join(dir, '.bridge', 'uir.ndjson'));
  out = [];
  vi.spyOn(process, 'cwd').mockReturnValue(dir);
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => (out.push(String(chunk)), true));
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => (out.push(String(chunk)), true));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

describe('a program the normalizer refused is not generated', () => {
  it('`generate` from a raw document exits non-zero, names the normalizer diagnostic, and writes nothing', async () => {
    const code = await main(['generate']);
    const text = out.join('');

    expect(code).toBe(1);
    expect(text).toContain('BRG2305');
    expect(text).toContain('nothing was written');
    expect(existsSync(join(dir, 'build'))).toBe(false);
  });

  it('`generate --json` reports the normalizer errors and no files', async () => {
    const code = await main(['generate', '--json']);
    const report = JSON.parse(out.join('')) as { files: string[]; diagnostics: { code: string }[] };

    expect(code).toBe(1);
    expect(report.files).toEqual([]);
    expect(report.diagnostics.map((d) => d.code)).toContain('BRG2305');
  });

  it('a stale normalized document from an earlier, refusing `build` cannot be generated from', async () => {
    // `build` removes `normalized.ndjson` when normalization fails (it needs the analyzer, so it is covered by the real-app runs, not here).
    // What `generate` must do without it is fall back to the raw document and refuse it — not to generate.
    const code = await main(['generate']);
    expect(code).toBe(1);
    expect(existsSync(join(dir, '.bridge', 'normalized.ndjson'))).toBe(false);
  });
});
