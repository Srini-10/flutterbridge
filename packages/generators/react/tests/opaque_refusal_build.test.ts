import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { compiledFrom, harness, opaqueRefusalRaw } from './support.js';

// Plan Phase C — every opaque node the analyzer hands the generator is refused with a `BRG3004` that names
// the construct and the reason the frontend recorded.
//
// The defect: all three refusal sites read a field called `source`, which no producer writes (`ui.Opaque`,
// `logic.OpaqueExpr` and `logic.OpaqueStmt` carry `dartSource` and `reason`). Every opaque refusal therefore
// said "`<unknown>`". The one existing test hand-wrote a node with the same wrong field name, so it could
// only ever agree with the bug — this file uses the real analyzer's document instead, one component per
// opaque kind (`fixtures/apps/opaque_refusal`).
const opaque = () => {
  const { context, reported } = harness(compiledFrom(opaqueRefusalRaw()));
  const { files } = reactGenerator.generate(context);
  return { reported, files, refusals: reported.filter((d) => d.code === 'BRG3004') };
};

describe('BRG3004 names what the analyzer could not model, and why', () => {
  it('refuses all three opaque kinds — nothing is silently dropped', () => {
    const { refusals, files } = opaque();
    expect(refusals).toHaveLength(3);
    expect(refusals.every((d) => d.severity === 'error')).toBe(true);
    expect(files).toEqual([]);
  });

  it('never says `<unknown>`', () => {
    for (const d of opaque().refusals) expect(d.message).not.toContain('<unknown>');
  });

  it('a ui.Opaque render carries its source and reason', () => {
    const message = opaque().refusals.find((d) => d.message.includes('debugPrint'))?.message ?? '';
    expect(message).toContain("final greeting = 'hello'");
    expect(message).toContain('build body with statements');
  });

  it('a logic.OpaqueStmt carries its source and reason', () => {
    const message = opaque().refusals.find((d) => d.message.includes('twice'))?.message ?? '';
    expect(message).toContain('int twice(int v)');
    expect(message).toContain('local function declaration');
  });

  it('a logic.OpaqueExpr carries its source and reason', () => {
    const message = opaque().refusals.find((d) => d.message.includes('_items[0]'))?.message ?? '';
    expect(message).toContain('write target');
  });
});
