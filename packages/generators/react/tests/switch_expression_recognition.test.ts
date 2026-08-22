import type { AnyUirNode } from '@bridge/uir';
import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { fileAt, harness } from './support.js';

// M8-Y — the generator-level exhaustiveness safety net for `logic.Switch` (`isProvablyExhaustiveEnumSwitch`,
// `statement.ts`). Directly tested via synthetic UIR because `logic.Switch` was, until M8-Y, never produced
// by any real Dart shape — these negative controls prove the safety net declines exactly the shapes it must
// (a subset of an enum, a primitive-typed switch, a nullable subject missing its own null case), so a
// future producer of `logic.Switch` this generator does not yet have inherits the same, unweakened guard.

const span = { file: 'lib/main.dart', line: 10, column: 3 } as const;
const ENUM_TYPE = { library: 'package:app/main.dart', name: 'Reason' };
const NULLABLE_ENUM_TYPE = { library: 'package:app/main.dart', name: 'Reason?', nullable: true };

function enumDecl(id: string, name: string, values: string[]): Record<string, unknown> {
  return { id, kind: 'logic.EnumDecl', span, name, values };
}

function enumRef(id: string, memberName: string, target: string): Record<string, unknown> {
  return { id, kind: 'logic.Ref', span, name: memberName, target, type: ENUM_TYPE };
}

function nullLit(id: string): Record<string, unknown> {
  return { id, kind: 'logic.Lit', span, type: { library: 'dart:core', name: 'Null' } };
}

function intLit(id: string, value: number): Record<string, unknown> {
  return { id, kind: 'logic.Lit', span, value, type: { library: 'dart:core', name: 'int' } };
}

function returnLit(id: string, value: string): Record<string, unknown> {
  return { id, kind: 'logic.Return', span, value: { id: `${id}-v`, kind: 'logic.Lit', span, type: { name: 'String' }, value } };
}

function switchNode(
  id: string,
  subject: Record<string, unknown>,
  cases: { test: Record<string, unknown>; body: Record<string, unknown>[] }[],
): Record<string, unknown> {
  return {
    id,
    kind: 'logic.Switch',
    span,
    subject,
    cases: cases.map((c) => ({ test: c.test, body: c.body })),
  };
}

function fn(
  id: string,
  name: string,
  paramName: string,
  paramType: Record<string, unknown>,
  body: Record<string, unknown>[],
): AnyUirNode {
  return {
    id,
    kind: 'logic.FunctionDecl',
    span,
    name,
    returnType: { library: 'dart:core', name: 'String' },
    params: [{ name: paramName, type: paramType, required: true }],
    body,
  } as unknown as AnyUirNode;
}

function ref(id: string, name: string, target: string): Record<string, unknown> {
  return { id, kind: 'logic.Ref', span, name, type: { name: 'String Function()' }, target };
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

describe('M8-Y — logic.Switch exhaustiveness safety net (isProvablyExhaustiveEnumSwitch)', () => {
  it('full enum coverage gets a throw-default (case.test uses the correct field, not "undefined")', () => {
    const decls: AnyUirNode[] = [enumDecl('e1', 'Reason', ['a', 'b']) as unknown as AnyUirNode];
    const sw = switchNode(
      'sw1',
      { id: 'subj', kind: 'logic.Ref', span, name: 'r', type: ENUM_TYPE },
      [
        { test: enumRef('t1', 'Reason.a', 'e1'), body: [returnLit('r1', 'x')] },
        { test: enumRef('t2', 'Reason.b', 'e1'), body: [returnLit('r2', 'y')] },
      ],
    );
    const nodes: AnyUirNode[] = [...decls, fn('fn1', 'f', 'r', ENUM_TYPE, [sw as unknown as Record<string, unknown>]), component('comp', 'W', text('t1', callOf('c1', ref('r1', 'f', 'fn1'))))];
    const { context, reported } = harness(nodes);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(source).toContain("case 'a':");
    expect(source).not.toContain('case undefined:');
    expect(source).toContain('default: {');
    expect(source).toContain('throw new Error(');
  });

  it('a switch covering only a subset of the enum does NOT get a throw-default', () => {
    const decls: AnyUirNode[] = [enumDecl('e1', 'Reason', ['a', 'b', 'c']) as unknown as AnyUirNode];
    const sw = switchNode(
      'sw1',
      { id: 'subj', kind: 'logic.Ref', span, name: 'r', type: ENUM_TYPE },
      [
        { test: enumRef('t1', 'Reason.a', 'e1'), body: [returnLit('r1', 'x')] },
        { test: enumRef('t2', 'Reason.b', 'e1'), body: [returnLit('r2', 'y')] },
      ],
    );
    const nodes: AnyUirNode[] = [...decls, fn('fn1', 'f', 'r', ENUM_TYPE, [sw as unknown as Record<string, unknown>]), component('comp', 'W', text('t1', callOf('c1', ref('r1', 'f', 'fn1'))))];
    const { context } = harness(nodes);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(source).not.toContain('default:');
  });

  it('a primitive (int) switch does NOT get a throw-default', () => {
    const sw = switchNode(
      'sw1',
      { id: 'subj', kind: 'logic.Ref', span, name: 'n', type: { library: 'dart:core', name: 'int' } },
      [
        { test: intLit('t1', 1), body: [returnLit('r1', 'x')] },
        { test: intLit('t2', 2), body: [returnLit('r2', 'y')] },
      ],
    );
    const nodes: AnyUirNode[] = [fn('fn1', 'f', 'n', { library: 'dart:core', name: 'int' }, [sw as unknown as Record<string, unknown>]), component('comp', 'W', text('t1', callOf('c1', ref('r1', 'f', 'fn1'))))];
    const { context } = harness(nodes);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(source).not.toContain('default:');
  });

  it('a nullable subject fully covering the enum but missing its own null case does NOT get a throw-default', () => {
    const decls: AnyUirNode[] = [enumDecl('e1', 'Reason', ['a', 'b']) as unknown as AnyUirNode];
    const sw = switchNode(
      'sw1',
      { id: 'subj', kind: 'logic.Ref', span, name: 'r', type: NULLABLE_ENUM_TYPE },
      [
        { test: enumRef('t1', 'Reason.a', 'e1'), body: [returnLit('r1', 'x')] },
        { test: enumRef('t2', 'Reason.b', 'e1'), body: [returnLit('r2', 'y')] },
      ],
    );
    const nodes: AnyUirNode[] = [...decls, fn('fn1', 'f', 'r', NULLABLE_ENUM_TYPE, [sw as unknown as Record<string, unknown>]), component('comp', 'W', text('t1', callOf('c1', ref('r1', 'f', 'fn1'))))];
    const { context } = harness(nodes);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(source).not.toContain('default:');
  });

  it('a nullable subject covering the enum AND a null case DOES get a throw-default', () => {
    const decls: AnyUirNode[] = [enumDecl('e1', 'Reason', ['a', 'b']) as unknown as AnyUirNode];
    const sw = switchNode(
      'sw1',
      { id: 'subj', kind: 'logic.Ref', span, name: 'r', type: NULLABLE_ENUM_TYPE },
      [
        { test: nullLit('t0'), body: [returnLit('r0', 'none')] },
        { test: enumRef('t1', 'Reason.a', 'e1'), body: [returnLit('r1', 'x')] },
        { test: enumRef('t2', 'Reason.b', 'e1'), body: [returnLit('r2', 'y')] },
      ],
    );
    const nodes: AnyUirNode[] = [...decls, fn('fn1', 'f', 'r', NULLABLE_ENUM_TYPE, [sw as unknown as Record<string, unknown>]), component('comp', 'W', text('t1', callOf('c1', ref('r1', 'f', 'fn1'))))];
    const { context } = harness(nodes);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(source).toContain('case null:');
    expect(source).toContain('default: {');
    expect(source).toContain('throw new Error(');
  });

  it('an explicit default (defaultCase) is unaffected — never doubled', () => {
    const decls: AnyUirNode[] = [enumDecl('e1', 'Reason', ['a', 'b']) as unknown as AnyUirNode];
    const sw = {
      id: 'sw1',
      kind: 'logic.Switch',
      span,
      subject: { id: 'subj', kind: 'logic.Ref', span, name: 'r', type: ENUM_TYPE },
      cases: [{ test: enumRef('t1', 'Reason.a', 'e1'), body: [returnLit('r1', 'x')] }],
      defaultCase: [returnLit('rd', 'fallback')],
    };
    const nodes: AnyUirNode[] = [...decls, fn('fn1', 'f', 'r', ENUM_TYPE, [sw as unknown as Record<string, unknown>]), component('comp', 'W', text('t1', callOf('c1', ref('r1', 'f', 'fn1'))))];
    const { context } = harness(nodes);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(source.match(/default:/g)?.length ?? 0).toBe(1);
    expect(source).toContain("return 'fallback';");
    expect(source).not.toContain('unreachable');
  });
});
