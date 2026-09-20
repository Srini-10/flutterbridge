import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, harness } from './support.js';

// Diagnostic quality (M11 audit): a message an author reads must say what it means. A refusal that prints `<unknown>`,
// `undefined`, `[object Object]` or `NaN` where a name or a location belongs is a defect in the compiler that reports it,
// even if the refusal itself is right. Run over **every real analyzer document in `fixtures/uir/`** — the generator's
// diagnostics for each — so a new construct that reaches an unfinished message fails here, not in a user's terminal.

afterAll(cleanupBuildProofTemporaries);

const uirDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'fixtures', 'uir');
const documents = readdirSync(uirDir)
  .filter((name) => name.endsWith('.ndjson') && !name.endsWith('.normalized.ndjson'))
  .sort();

const BAD = [/<unknown>/, /\bundefined\b/, /\[object Object\]/, /\bNaN\b/, /\bnull\b(?! )/];

/** Places where the word appears legitimately in Dart terms (`null` literals, `undefined` in a JS-semantics explanation). */
const ALLOWED = [
  /JavaScript'?s? .*undefined/i,
  /`undefined`/,
  /`null`/,
  /\bis `?undefined`?/,
  /yields? `?undefined/i,
  /would be `?undefined/i,
  /\bundefined or a `TypeError`/,
  /evaluate to `?undefined/i,
  /silently `?undefined/i,
];

describe('every generator diagnostic over the real documents reads as a sentence', () => {
  it(`(${documents.length} documents)`, () => {
    const offenders: string[] = [];
    const unreadable: string[] = [];
    let messages = 0;
    for (const name of documents) {
      let reported;
      try {
        const nodes = compiledFrom(readFileSync(join(uirDir, name), 'utf8'));
        const run = harness(nodes);
        reactGenerator.generate(run.context);
        reported = run.reported;
      } catch (error) {
        // Every committed document must load: this is also the identity check over the whole corpus — an
        // `IdentityCollisionError` in any of them lands here.
        unreadable.push(`${name}: ${String((error as Error).message).slice(0, 160)}`);
        continue;
      }
      for (const d of reported) {
        messages++;
        const text = `${d.message}`;
        const stripped = ALLOWED.reduce((t, allowed) => t.replace(new RegExp(allowed.source, allowed.flags + 'g'), ''), text);
        for (const bad of BAD) {
          if (bad.test(stripped)) offenders.push(`${name} ${d.code}: ${text.slice(0, 200)}`);
        }
      }
    }
    expect(unreadable, 'every committed document loads and normalizes').toEqual([]);
    expect(messages, 'the corpus must actually produce diagnostics').toBeGreaterThan(50);
    expect(offenders.slice(0, 8)).toEqual([]);
  }, 600_000);
});
