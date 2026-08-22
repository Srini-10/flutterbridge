import type { AnyUirNode } from '@bridge/uir';
import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { fileAt, harness } from './support.js';

// M8-V — Dart `dart:core` Duration/numeric SDK member recognition. Every positive case here is checked
// by the *receiver's own resolved type* (`type.library === 'dart:core'`), never by the property/method's
// bare name — and every negative control proves a project-defined lookalike (a different `type.library`)
// is untouched, falling through to the exact, unchanged generic `receiver.member`/`receiver.method(args)`
// lowering these cases already had before M8-V.
//
// Each expression lives in a component param's own render-tree read (`props.<name>`, per `component.ts`'s
// `childScope`), not a `logic.FunctionDecl` body — a `FunctionDecl` attempt discards its own error reports
// on failure (`functions.ts`'s quarantine, M8-U) and re-raises only the generic BRG3013 at the call site,
// which would hide the specific message these tests check for.

const span = { file: 'lib/main.dart', line: 10, column: 3 } as const;

function param(name: string, type: Record<string, unknown>): Record<string, unknown> {
  return { name, type, required: true };
}

function paramRef(id: string, name: string, type: Record<string, unknown>): Record<string, unknown> {
  return { id, kind: 'logic.Ref', span, name, type };
}

function propertyAccess(id: string, property: string, receiver: Record<string, unknown>, resultType: Record<string, unknown>): Record<string, unknown> {
  return { id, kind: 'logic.PropertyAccess', span, property, receiver, type: resultType };
}

function methodCall(id: string, method: string, receiver: Record<string, unknown>, args: Record<string, unknown>[], resultType: Record<string, unknown>): Record<string, unknown> {
  return { id, kind: 'logic.MethodCall', span, method, receiver, args, type: resultType };
}

function lit(id: string, value: unknown, type: Record<string, unknown>): Record<string, unknown> {
  return { id, kind: 'logic.Lit', span, value, type };
}

function component(id: string, name: string, params: Record<string, unknown>[], render: Record<string, unknown>): AnyUirNode {
  return { id, kind: 'ui.Component', span, name, params, render } as unknown as AnyUirNode;
}

function text(id: string, value: Record<string, unknown>): Record<string, unknown> {
  return { id, kind: 'ui.Text', span, value: { id: `${id}-b`, kind: 'bind.Expr', span, expr: value } };
}

const DART_CORE_INT = { library: 'dart:core', name: 'int' };
const DART_CORE_DOUBLE = { library: 'dart:core', name: 'double' };
const DART_CORE_DURATION = { library: 'dart:core', name: 'Duration' };
const DART_CORE_STRING = { library: 'dart:core', name: 'String' };
const PROJECT_TYPE = (name: string) => ({ library: 'package:app/main.dart', name });

function build(receiverName: string, receiverType: Record<string, unknown>, expr: (receiver: Record<string, unknown>) => Record<string, unknown>) {
  const receiver = paramRef('r1', receiverName, receiverType);
  const nodes: AnyUirNode[] = [component('comp', 'W', [param(receiverName, receiverType)], text('t1', expr(receiver)))];
  const { context, reported } = harness(nodes);
  const { files } = reactGenerator.generate(context);
  return { reported, source: fileAt(files, 'src/components/w.tsx') ?? '' };
}

describe('M8-V — Duration getter recognition', () => {
  it('a dart:core Duration receiver\'s .inSeconds lowers to inMilliseconds arithmetic', () => {
    const { reported, source } = build('d', DART_CORE_DURATION, (r) => propertyAccess('p1', 'inSeconds', r, DART_CORE_INT));
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(source).toContain('Math.trunc(props.d.inMilliseconds / 1000)');
  });

  it('a project-defined type with its own .inSeconds getter is untouched (negative control)', () => {
    const { reported, source } = build('d', PROJECT_TYPE('MyDuration'), (r) => propertyAccess('p1', 'inSeconds', r, DART_CORE_INT));
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(source).toContain('props.d.inSeconds');
    expect(source).not.toContain('Math.trunc');
  });

  it('an unrecognized Duration getter on a real dart:core Duration receiver is honestly refused, not silently passed through', () => {
    const { reported, source } = build('d', DART_CORE_DURATION, (r) => propertyAccess('p1', 'inDays', r, DART_CORE_INT));
    expect(reported.some((d) => d.severity === 'error' && d.message.includes('Duration.inDays'))).toBe(true);
    expect(source).not.toContain('inDays');
  });
});

describe('M8-V — numeric method recognition', () => {
  it('int.toDouble() is a no-op — the receiver text alone', () => {
    const { reported, source } = build('n', DART_CORE_INT, (r) => methodCall('m1', 'toDouble', r, [], DART_CORE_DOUBLE));
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(source).not.toContain('.toDouble()');
  });

  it('a project-defined type with its own .toDouble() is untouched (negative control)', () => {
    const { reported, source } = build('f', PROJECT_TYPE('FakeNumber'), (r) => methodCall('m1', 'toDouble', r, [], DART_CORE_DOUBLE));
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(source).toContain('props.f.toDouble()');
  });

  it('double.toStringAsFixed(n) lowers to .toFixed(n)', () => {
    const { reported, source } = build('v', DART_CORE_DOUBLE, (r) =>
      methodCall('m1', 'toStringAsFixed', r, [lit('a1', 2, DART_CORE_INT)], DART_CORE_STRING),
    );
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(source).toContain('props.v.toFixed(2)');
  });

  it('a project-defined type with its own .toStringAsFixed() is untouched (negative control)', () => {
    const { reported, source } = build('f', PROJECT_TYPE('FakeNumber'), (r) =>
      methodCall('m1', 'toStringAsFixed', r, [lit('a1', 2, DART_CORE_INT)], DART_CORE_STRING),
    );
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(source).toContain('props.f.toStringAsFixed(2)');
    expect(source).not.toContain('.toFixed(');
  });

  it('int.remainder(n) lowers to %, never Dart\'s own % operator semantics', () => {
    const { reported, source } = build('n', DART_CORE_INT, (r) =>
      methodCall('m1', 'remainder', r, [lit('a1', 60, DART_CORE_INT)], DART_CORE_INT),
    );
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(source).toContain('(props.n % 60)');
  });

  it('an unrecognized numeric method on a real dart:core int receiver is honestly refused, not silently passed through', () => {
    const { reported, source } = build('n', DART_CORE_INT, (r) => methodCall('m1', 'ceil', r, [], DART_CORE_INT));
    expect(reported.some((d) => d.severity === 'error' && d.message.includes('int.ceil'))).toBe(true);
    expect(source).not.toContain('.ceil(');
  });

  it('a receiver with no resolved type is untouched — falls through to the ordinary, unchanged lowering', () => {
    const receiver = { id: 'r1', kind: 'logic.Ref', span, name: 'x' };
    const nodes: AnyUirNode[] = [
      component('comp', 'W', [{ name: 'x', required: true }], text('t1', methodCall('m1', 'toDouble', receiver, [], DART_CORE_DOUBLE))),
    ];
    const { context, reported } = harness(nodes);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/w.tsx') ?? '';
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(source).toContain('props.x.toDouble()');
  });
});
