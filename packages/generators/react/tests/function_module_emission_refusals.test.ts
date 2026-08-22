import type { AnyUirNode } from '@bridge/uir';
import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { harness } from './support.js';

// Negative controls for ADR-29 (M8-U) — every one of these must remain an honest refusal after module
// emission ships. A diagnostic moving from BRG3013 to a different, still-honest code is acceptable
// (M8-U's own instruction); silently emitting wrong code, or emitting nothing with no diagnostic, is not.
//
// Each function's own body attempt is discarded on its first error (`functions.ts`'s own suppressed-
// report wrapper), so what a caller's `logic.Ref` sees is always the same, pre-existing BRG3013
// ("this generator does not yet lower a `logic.FunctionDecl`") — never the inner cause. These tests
// assert that outer shape, matching every other unsupported-FunctionDecl test in this suite.

const span = { file: 'lib/main.dart', line: 10, column: 3 } as const;

function ref(id: string, name: string, target?: string): Record<string, unknown> {
  return { id, kind: 'logic.Ref', span, name, type: { name: 'String Function()' }, ...(target ? { target } : {}) };
}

function callOf(id: string, callee: Record<string, unknown>): Record<string, unknown> {
  return { id: `${id}-call`, kind: 'logic.Call', span, callee, args: [] };
}

function component(id: string, name: string, render: Record<string, unknown>): AnyUirNode {
  return { id, kind: 'ui.Component', span, name, render } as unknown as AnyUirNode;
}

function text(id: string, value: Record<string, unknown>): Record<string, unknown> {
  return { id, kind: 'ui.Text', span, value: { id: `${id}-b`, kind: 'bind.Expr', span, expr: value } };
}

function returnLit(id: string, value: string): Record<string, unknown> {
  return { id, kind: 'logic.Return', span, value: { id: `${id}-v`, kind: 'logic.Lit', span, type: { name: 'String' }, value } };
}

function harnessFor(fn: AnyUirNode, refId: string, target: string) {
  const nodes: AnyUirNode[] = [fn, component('comp', 'W', text('t1', callOf('c1', ref(refId, 'f', target))))];
  return harness(nodes);
}

describe('ADR-29 (M8-U) — refusal boundary', () => {
  it('an async function is refused, unchanged (BRG3013), even with an otherwise-trivial body', () => {
    const fn: AnyUirNode = {
      id: 'fn', kind: 'logic.FunctionDecl', span, name: 'f', returnType: { name: 'String' },
      isAsync: true, body: [returnLit('r1', 'x')],
    } as unknown as AnyUirNode;
    const { context, reported } = harnessFor(fn, 'ref1', 'fn');
    const { files } = reactGenerator.generate(context);
    expect(files).toHaveLength(0);
    const capability = reported.find((d) => d.code === 'BRG3013');
    expect(capability?.severity).toBe('error');
    expect(capability?.message).toContain('f');
  });

  it('a function whose body depends on a top-level FieldDecl is refused (BRG3013), unchanged', () => {
    const field: AnyUirNode = {
      id: 'field-decl', kind: 'logic.FieldDecl', span, name: '_cached', isStatic: true, isFinal: true, type: { name: 'int' },
    } as unknown as AnyUirNode;
    const fn: AnyUirNode = {
      id: 'fn', kind: 'logic.FunctionDecl', span, name: 'f', returnType: { name: 'int' },
      body: [{ id: 'r1', kind: 'logic.Return', span, value: ref('r1-v', '_cached', 'field-decl') }],
    } as unknown as AnyUirNode;
    const nodes: AnyUirNode[] = [field, fn, component('comp', 'W', text('t1', callOf('c1', ref('ref1', 'f', 'fn'))))];
    const { context, reported } = harness(nodes);
    const { files } = reactGenerator.generate(context);
    expect(files).toHaveLength(0);
    const capability = reported.find((d) => d.code === 'BRG3013' && d.message.includes('`f`'));
    expect(capability?.severity).toBe('error');
  });

  it('a function containing an opaque expression is refused (BRG3013), unchanged', () => {
    const fn: AnyUirNode = {
      id: 'fn', kind: 'logic.FunctionDecl', span, name: 'f', returnType: { name: 'String' },
      body: [
        { id: 'r1', kind: 'logic.Return', span, value: { id: 'opaque', kind: 'logic.OpaqueExpr', span, source: '...spread', type: { name: 'String' } } },
      ],
    } as unknown as AnyUirNode;
    const { context, reported } = harnessFor(fn, 'ref1', 'fn');
    const { files } = reactGenerator.generate(context);
    expect(files).toHaveLength(0);
    const capability = reported.find((d) => d.code === 'BRG3013');
    expect(capability?.severity).toBe('error');
  });

  it('a function with a named parameter is refused (BRG3002 at the site, BRG3013 at the reference)', () => {
    const fn: AnyUirNode = {
      id: 'fn', kind: 'logic.FunctionDecl', span, name: 'f', returnType: { name: 'String' },
      params: [{ name: 'id', named: true, required: true, type: { name: 'int' } }],
      body: [returnLit('r1', 'x')],
    } as unknown as AnyUirNode;
    const { context, reported } = harnessFor(fn, 'ref1', 'fn');
    const { files } = reactGenerator.generate(context);
    expect(files).toHaveLength(0);
    expect(reported.some((d) => d.severity === 'error' && d.code === 'BRG3013')).toBe(true);
  });

  it('two mutually-recursive functions remain refused — a real, honestly-reported limitation, not silent wrong code', () => {
    // ADR-29 §7's own found limitation: the fixed-point retry can never mark either as "known good" first,
    // since each one's own first attempt always sees the other as not-yet-resolved. Both stay BRG3013 —
    // proven here so a future change to the retry strategy has a regression test to prove against, not
    // just the milestone doc's own prose.
    const a: AnyUirNode = {
      id: 'a', kind: 'logic.FunctionDecl', span, name: 'pingPong', returnType: { name: 'String' },
      body: [{ id: 'r1', kind: 'logic.Return', span, value: { id: 'call-b', kind: 'logic.Call', span, callee: ref('ref-b', 'pongPing', 'b'), args: [] } }],
    } as unknown as AnyUirNode;
    const b: AnyUirNode = {
      id: 'b', kind: 'logic.FunctionDecl', span, name: 'pongPing', returnType: { name: 'String' },
      body: [{ id: 'r2', kind: 'logic.Return', span, value: { id: 'call-a', kind: 'logic.Call', span, callee: ref('ref-a', 'pingPong', 'a'), args: [] } }],
    } as unknown as AnyUirNode;
    const nodes: AnyUirNode[] = [a, b, component('comp', 'W', text('t1', callOf('c1', ref('ref1', 'pingPong', 'a'))))];
    const { context, reported } = harness(nodes);
    const { files } = reactGenerator.generate(context);
    expect(files).toHaveLength(0);
    expect(reported.filter((d) => d.code === 'BRG3013').length).toBeGreaterThanOrEqual(1);
  });

  it('an unreachable function is never emitted and never diagnosed', () => {
    const reachable: AnyUirNode = {
      id: 'used', kind: 'logic.FunctionDecl', span, name: 'used', returnType: { name: 'String' },
      body: [returnLit('r1', 'x')],
    } as unknown as AnyUirNode;
    const unreachable: AnyUirNode = {
      id: 'unused', kind: 'logic.FunctionDecl', span, name: 'unused', returnType: { name: 'String' },
      body: [returnLit('r2', 'y')],
    } as unknown as AnyUirNode;
    const nodes: AnyUirNode[] = [reachable, unreachable, component('comp', 'W', text('t1', callOf('c1', ref('ref1', 'used', 'used'))))];
    const { context, reported } = harness(nodes);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const source = files.find((f) => f.path.includes('generated'))?.contents ?? '';
    expect(source).toContain('used');
    expect(source).not.toContain('function unused');
  });
});
