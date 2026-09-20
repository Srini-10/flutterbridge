// Identity integrity and malformed input (M11 audit).
//
// `Program.of` deduplicates by id — "two nodes with one id are one node" — which is only true if they ARE. Last-wins would
// silently replace one meaning with another, so two nodes that differ in anything but where they were written are an
// identity collision and are refused. And a document that is not valid NDJSON, or names a node kind the schema does not
// have, is an input the compiler refuses (`LoadError`, exit 3) — not a stack trace.

import type { AnyUirNode } from '@bridge/uir';
import { describe, expect, it } from 'vitest';

import { IdentityCollisionError, LoadError, Program, load } from '../src/index.js';

const span = (line: number) => ({ file: 'lib/a.dart', line, column: 1 }) as const;
const lit = (id: string, value: number, line = 1): AnyUirNode =>
  ({ id, kind: 'logic.Lit', span: span(line), value, type: { name: 'int' } }) as unknown as AnyUirNode;

describe('Program.of on two nodes with one id', () => {
  it('treats nodes that differ only in span as one node (content addressing)', () => {
    const program = Program.of([lit('a', 1, 1), lit('a', 1, 40)]);
    expect(program.nodes).toHaveLength(1);
  });

  it('refuses nodes that say different things: an identity collision, not a silent last-wins', () => {
    expect(() => Program.of([lit('a', 1), lit('a', 2)])).toThrow(IdentityCollisionError);
  });

  it('names the id and both kinds', () => {
    const other = { id: 'a', kind: 'logic.Ref', span: span(1), name: 'x', type: { name: 'int' } } as unknown as AnyUirNode;
    expect(() => Program.of([lit('a', 1), other])).toThrow(/share the id a \(logic\.Lit and logic\.Ref\)/);
  });

  it('is not tripped by the same node twice', () => {
    const node = lit('a', 1);
    expect(Program.of([node, node]).nodes).toHaveLength(1);
  });
});

describe('load() on a document the compiler cannot read', () => {
  it('a truncated line is a LoadError, with the line', () => {
    expect(() => load('{"kind":"logic.Lit","id":"a"')).toThrow(LoadError);
    expect(() => load('{"kind":"logic.Lit","id":"a"')).toThrow(/malformed.*line 1: not valid JSON/);
  });

  it('an unknown node kind is a LoadError, not an uncaught UirParseError', () => {
    const bad = JSON.stringify({ id: 'z', kind: 'ui.Bogus', span: span(1) });
    expect(() => load(bad)).toThrow(LoadError);
    expect(() => load(bad)).toThrow(/unknown UIR node kind "ui\.Bogus"/);
  });

  it('a document nested past the parser’s stack is a LoadError that says so', () => {
    let deep: unknown = { kind: 'logic.Lit', id: 'd0', span: span(1), value: 1, type: { name: 'int' } };
    for (let i = 0; i < 40_000; i++) deep = { kind: 'logic.Unary', id: `d${i}`, span: span(1), operator: '-', operand: deep, type: { name: 'int' } };
    const document = JSON.stringify({ kind: 'sig.Signal', id: 's', span: span(1), scope: 'component', initial: deep, type: { name: 'int' } });
    expect(() => load(document)).toThrow(LoadError);
    expect(() => load(document)).toThrow(/nests expressions too deeply/);
  });

  it('an empty document loads as an empty program', () => {
    expect(load('').nodes).toHaveLength(0);
  });
});
