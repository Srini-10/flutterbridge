import type { AnyUirNode } from '@bridge/uir';
import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { fileAt, harness } from './support.js';

// M9-J — the receiver-classification boundary itself, in isolation from the full real-Dart fixture
// (`unmodelled_class_member_build.test.ts`). Every positive case here proves the new refusal fires only
// for a **parameter** read of a type this generator cannot represent; every negative control proves a
// shape that must stay exactly as it was before this milestone — `dynamic`, `Object`/`Object?`, an unused
// opaque value, and a write through an assignment target, which shares the read-side classifier for free
// (`emitTarget` defers a non-`Ref` target to the identical `logic.PropertyAccess` case).

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

function component(id: string, name: string, params: Record<string, unknown>[], render: Record<string, unknown>): AnyUirNode {
  return { id, kind: 'ui.Component', span, name, params, render } as unknown as AnyUirNode;
}

function text(id: string, value: Record<string, unknown>): Record<string, unknown> {
  return { id, kind: 'ui.Text', span, value: { id: `${id}-b`, kind: 'bind.Expr', span, expr: value } };
}

const PROJECT_TYPE = (name: string) => ({ library: 'package:app/main.dart', name });
const DART_CORE_INT = { library: 'dart:core', name: 'int' };
const DYNAMIC = { name: 'dynamic' };
const OBJECT = { library: 'dart:core', name: 'Object' };
const OBJECT_NULLABLE = { library: 'dart:core', name: 'Object?', nullable: true };

function buildRead(receiverName: string, receiverType: Record<string, unknown>, property: string) {
  const receiver = paramRef('r1', receiverName, receiverType);
  const nodes: AnyUirNode[] = [
    component('comp', 'W', [param(receiverName, receiverType)], text('t1', propertyAccess('p1', property, receiver, DART_CORE_INT))),
  ];
  const { context, reported } = harness(nodes);
  const { files } = reactGenerator.generate(context);
  return { reported, source: fileAt(files, 'src/components/w.tsx') ?? '' };
}

describe('M9-J — unsupported project-class member access is honestly refused', () => {
  it('a project-defined class parameter\'s field read is refused as BRG3013', () => {
    const { reported, source } = buildRead('model', PROJECT_TYPE('Model'), 'count');
    const errors = reported.filter((d) => d.severity === 'error');
    expect(errors.some((d) => d.code === 'BRG3013' && d.message.includes('Model') && d.message.includes('count'))).toBe(true);
    expect(source).toBe('');
  });

  it('an external-package class parameter is refused identically to a project-local one', () => {
    const { reported, source } = buildRead('model', { library: 'package:some_dep/model.dart', name: 'Model' }, 'count');
    const errors = reported.filter((d) => d.severity === 'error');
    expect(errors.some((d) => d.code === 'BRG3013' && d.message.includes('Model'))).toBe(true);
    expect(source).toBe('');
  });

  describe('negative controls — must not newly refuse', () => {
    it('a `dynamic` receiver is untouched (source dynamic is not compiler-generated unknown)', () => {
      const { reported, source } = buildRead('value', DYNAMIC, 'count');
      expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
      expect(source).toContain('props.value.count');
    });

    it('an `Object` receiver is untouched (Dart\'s own root type, not a project-class-shaped gap)', () => {
      const { reported, source } = buildRead('value', OBJECT, 'count');
      expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
      expect(source).toContain('props.value.count');
    });

    it('an `Object?` receiver is untouched', () => {
      const { reported, source } = buildRead('value', OBJECT_NULLABLE, 'count');
      expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
      expect(source).toContain('props.value.count');
    });

    it('an unused, opaque project-class parameter is never refused — carrying a value is unaffected', () => {
      const stringType = { library: 'dart:core', name: 'String' };
      const nodes: AnyUirNode[] = [
        component(
          'comp',
          'W',
          [param('empty', PROJECT_TYPE('EmptyModel')), param('label', stringType)],
          text('t1', paramRef('r2', 'label', stringType)),
        ),
      ];
      const { context, reported } = harness(nodes);
      reactGenerator.generate(context);
      expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    });

    it('a local variable holding a project-class value is untouched — a real, separate, narrower gap this milestone does not close', () => {
      // `emitTarget`/local emission never annotates a local's own type (`statement.ts`'s `logic.VarDecl`
      // always infers), so the identical `TypeRef` that means `unknown` in a parameter position does not
      // mean the same thing here — refusing it would be a false positive against `tsc`'s own, more precise
      // inference. See the milestone doc's own remaining-blocker graph.
      const local: Record<string, unknown> = {
        id: 'l1',
        kind: 'logic.Ref',
        span,
        name: 'localCopy',
        target: 'localCopyDecl',
        type: PROJECT_TYPE('Model'),
      };
      const nodes: AnyUirNode[] = [component('comp', 'W', [], text('t1', propertyAccess('p1', 'count', local, DART_CORE_INT)))];
      const { context, reported } = harness(nodes);
      reactGenerator.generate(context);
      // Not asserted refused — this documents the boundary's own known limit, not a claim of correctness.
      expect(reported.filter((d) => d.severity === 'error' && d.code === 'BRG3013')).toEqual([]);
    });
  });

  it('a write through an assignment target is refused too — the same classifier, not a separate one', () => {
    // `emitTarget` (`expression.ts`) defers a non-`Ref` assignment target to the identical `emitExpression`
    // path a read uses — there is no separate write-side receiver check to keep in sync. Reached here via
    // `logic.Assign` directly in expression position (Dart's own assignment is an expression), so this
    // needs no `sig.Action`/store scaffold to exercise.
    const receiver = paramRef('r1', 'model', PROJECT_TYPE('Model'));
    const target = propertyAccess('p1', 'count', receiver, DART_CORE_INT);
    const assign: Record<string, unknown> = {
      id: 'a1',
      kind: 'logic.Assign',
      span,
      target,
      operator: 'assign',
      value: { id: 'v1', kind: 'logic.Lit', span, value: 3, type: DART_CORE_INT },
      type: DART_CORE_INT,
    };
    const nodes: AnyUirNode[] = [component('comp', 'W', [param('model', PROJECT_TYPE('Model'))], text('t1', assign))];
    const { context, reported } = harness(nodes);
    reactGenerator.generate(context);
    expect(reported.some((d) => d.severity === 'error' && d.code === 'BRG3013' && d.message.includes('Model'))).toBe(true);
  });
});
