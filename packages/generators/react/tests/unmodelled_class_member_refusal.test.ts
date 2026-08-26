import type { AnyUirNode } from '@bridge/uir';
import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { fileAt, harness } from './support.js';

// M9-J — the receiver-classification boundary itself, in isolation from the full real-Dart fixture
// (`unmodelled_class_member_build.test.ts`). Every positive case here proves the refusal fires for a
// **parameter** read, or (M9-R closure fix) a **local** whose own resolved type carries `TypeRef.target`
// (ADR-0034) — a type this generator has itself proven a real declaration for, and so proven an
// unsupported member on cannot be `tsc`-safe the way an untargeted, unresolved local's own type might be.
// Every negative control proves a shape that must stay exactly as it was — `dynamic`, `Object`/`Object?`,
// an unused opaque value, an *untargeted* local (the one case `tsc`'s own more precise inference can
// still legitimately differ from this generator's own type text for), and a write through an assignment
// target, which shares the read-side classifier for free (`emitTarget` defers a non-`Ref` target to the
// identical `logic.PropertyAccess` case).

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

    it('a local variable holding an UNRESOLVED type is untouched — a real, separate, narrower gap this milestone does not close', () => {
      // `emitTarget`/local emission never annotates a local's own type (`statement.ts`'s `logic.VarDecl`
      // always infers), so the identical `TypeRef` that means `unknown` in a parameter position does not
      // mean the same thing here — refusing it would be a false positive against `tsc`'s own, more precise
      // inference (a local initialized from an array/collection literal is the real-world shape this
      // protects, M9-J's own milestone doc). This type carries no `target` at all — an *unresolved* type
      // this generator never proved anything about, the one case the array-literal argument actually
      // covers. See the milestone doc's own remaining-blocker graph.
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

    it('a local variable holding a KNOWN project-class value (TypeRef.target present) IS refused — M9-R closure fix', () => {
      // The array/collection-literal argument the prior test relies on does not hold here: once
      // `TypeRef.target` is present (ADR-0034), the receiver's own inferred TypeScript shape is *exactly*
      // as narrow as the source class's own eligible field set (ADR-0036 §10/§17, for a construction; the
      // identical structural fact for any other project-class-typed expression) — there is no way for
      // `tsc` to infer something *broader* the way it can for `[...]`. An unsupported member on such a
      // receiver was, before this fix, silently lowered to `receiver.property` regardless of whether the
      // receiver was a parameter or a local — reaching `tsc` as its own, uncontrolled error rather than
      // this compiler's own honest `BRG3013`. Found during M9-R's own closure audit via a real
      // `Model(7).multiply(3)` probe (a locally-constructed receiver calling an unsupported method);
      // reproduced here at the unit level via a property read for isolation from M9-O's own construction
      // machinery.
      const local: Record<string, unknown> = {
        id: 'l1',
        kind: 'logic.Ref',
        span,
        name: 'localCopy',
        target: 'localCopyDecl',
        type: { ...PROJECT_TYPE('Model'), target: 'model-class-decl' },
      };
      const nodes: AnyUirNode[] = [component('comp', 'W', [], text('t1', propertyAccess('p1', 'count', local, DART_CORE_INT)))];
      const { context, reported } = harness(nodes);
      const { files } = reactGenerator.generate(context);
      const errors = reported.filter((d) => d.severity === 'error');
      expect(errors.some((d) => d.code === 'BRG3013' && d.message.includes('Model') && d.message.includes('count'))).toBe(true);
      expect(fileAt(files, 'src/components/w.tsx') ?? '').toBe('');
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
