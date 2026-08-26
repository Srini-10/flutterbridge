import type { AnyUirNode } from '@bridge/uir';
import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { fileAt, harness } from './support.js';

// Hand-authored-UIR unit coverage for the ADR-0038 (M9-Q) bounded explicit-getter execution model,
// isolating the generator-side mechanism (helper emission, receiver evaluation, module ownership) from
// the real fixture's own build-proof (`bounded_getter_execution_build.test.ts`), the same division of
// labor every prior milestone's own unit/build-proof pair in this suite already uses.

const span = { file: 'lib/main.dart', line: 1, column: 1 } as const;

function component(id: string, name: string, render: unknown): AnyUirNode {
  return { id, kind: 'ui.Component', span, name, render } as unknown as AnyUirNode;
}

function element(id: string, widget: string, props: Record<string, unknown> = {}): unknown {
  return { id, kind: 'ui.Element', span, component: { name: widget, userDefined: false }, props, children: [] };
}

function route(component_: string): AnyUirNode {
  return { id: 'r1', kind: 'app.Route', span, path: '/', component: component_ } as unknown as AnyUirNode;
}

function field(id: string, name: string, typeName: string): unknown {
  return { id, kind: 'logic.FieldDecl', span, name, isFinal: true, type: { library: 'dart:core', name: typeName } };
}

/** A `logic.FunctionDecl` embedded in `ClassDecl.methods`, shaped as a bounded, eligible getter. */
function getterDecl(id: string, name: string, body: unknown[], returnTypeName = 'int'): unknown {
  return {
    id,
    kind: 'logic.FunctionDecl',
    span,
    name,
    isGetter: true,
    params: [],
    returnType: { library: 'dart:core', name: returnTypeName },
    body,
  };
}

/** A `logic.ClassDecl`, structurally constructible (ADR-0036/0037) over exactly `fields`' own ids, in order. */
function classDecl(id: string, name: string, fields: unknown[], methods: unknown[] = []): AnyUirNode {
  const fieldIds = (fields as { id: string }[]).map((f) => f.id);
  return {
    id,
    kind: 'logic.ClassDecl',
    span,
    name,
    fields,
    methods,
    constructibleConstructors: [{ kind: 'positional', fields: fieldIds }],
  } as unknown as AnyUirNode;
}

function ref(id: string, target: string, name: string, typeName = 'int'): unknown {
  return { id, kind: 'logic.Ref', span, name, target, type: { library: 'dart:core', name: typeName } };
}

function lit(id: string, typeName: string, value: unknown): unknown {
  return { id, kind: 'logic.Lit', span, type: { library: 'dart:core', name: typeName }, value };
}

function binary(id: string, left: unknown, operator: string, right: unknown): unknown {
  return { id, kind: 'logic.Binary', span, left, operator, right, type: { library: 'dart:core', name: 'int' } };
}

function returnStmt(id: string, value: unknown): unknown {
  return { id, kind: 'logic.Return', span, value };
}

/** An external `logic.PropertyAccess` reading `getterId` off `receiver`. */
function propertyAccess(id: string, receiver: unknown, property: string, target: string): unknown {
  return { id, kind: 'logic.PropertyAccess', span, receiver, property, target, type: { library: 'dart:core', name: 'int' } };
}

function boundProp(id: string, expr: unknown): unknown {
  return { id, kind: 'bind.Expr', span, expr };
}

function generatedHome(nodes: AnyUirNode[]): { source: string; errors: unknown[] } {
  const { context, reported } = harness(nodes);
  const { files } = reactGenerator.generate(context);
  return { source: fileAt(files, 'src/components/home-screen.tsx') ?? '', errors: reported.filter((d) => d.severity === 'error') };
}

function modelFile(nodes: AnyUirNode[]): string {
  const { context } = harness(nodes);
  const { files } = reactGenerator.generate(context);
  return fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
}

describe('bounded structural instance getter execution (ADR-0038, M9-Q)', () => {
  it('a bounded getter emits a helper function operating on a plain structural receiver, never a prototype', () => {
    const nodes: AnyUirNode[] = [
      classDecl(
        'cls1',
        'Model',
        [field('f1', 'count', 'int')],
        [getterDecl('g1', 'doubled', [returnStmt('r1', binary('b1', ref('rf1', 'f1', 'count'), '*', lit('l1', 'int', 2)))])],
      ),
      component(
        'c1',
        'HomeScreen',
        element('e1', 'AnimatedOpacity', {
          duration: boundProp('bp1', propertyAccess('pa1', { id: 'recv1', kind: 'logic.New', span, typeName: 'Model', type: { library: 'app', name: 'Model', target: 'cls1' }, args: [lit('cv1', 'int', 7)] }, 'doubled', 'g1')),
        }),
      ),
      route('c1'),
    ];
    const { source, errors } = generatedHome(nodes);
    expect(errors).toEqual([]);
    expect(source).toMatch(/Model_doubled\(/);
    expect(source).not.toContain('.doubled');
    const model = modelFile(nodes);
    expect(model).toMatch(/export function Model_doubled\(self: Model\): number \{/);
    expect(model).toContain('self.count * 2');
    expect(model).not.toContain('class Model');
  });

  it('the receiver expression is evaluated exactly once, even though the helper reads two distinct fields', () => {
    const nodes: AnyUirNode[] = [
      classDecl(
        'cls1',
        'Model',
        [field('f1', 'a', 'int'), field('f2', 'b', 'int')],
        [getterDecl('g1', 'combined', [returnStmt('r1', binary('b1', ref('rf1', 'f1', 'a'), '+', ref('rf2', 'f2', 'b')))])],
      ),
      component(
        'c1',
        'HomeScreen',
        element('e1', 'AnimatedOpacity', {
          duration: boundProp(
            'bp1',
            propertyAccess(
              'pa1',
              {
                id: 'recv1',
                kind: 'logic.New',
                span,
                typeName: 'Model',
                type: { library: 'app', name: 'Model', target: 'cls1' },
                args: [lit('cv1', 'int', 7), lit('cv2', 'int', 8)],
              },
              'combined',
              'g1',
            ),
          ),
        }),
      ),
      route('c1'),
    ];
    const { source, errors } = generatedHome(nodes);
    expect(errors).toEqual([]);
    // The receiver's own emitted text — `{ a: 7, b: 8 }` — must appear exactly once, as the helper's one
    // argument, even though `combined`'s own body reads two distinct fields off it. Inlining the getter's
    // body at each field read (rejected as Option D, ADR-0038) would duplicate it once per field read.
    expect(source.match(/Model_combined\(/g)).toHaveLength(1);
    expect(source.match(/\{ a: 7, b: 8 \}/g)).toHaveLength(1);
  });

  it('two reads of the same getter each emit their own call — never memoized, never cached', () => {
    const nodes: AnyUirNode[] = [
      classDecl(
        'cls1',
        'Model',
        [field('f1', 'count', 'int')],
        [getterDecl('g1', 'doubled', [returnStmt('r1', binary('b1', ref('rf1', 'f1', 'count'), '*', lit('l1', 'int', 2)))])],
      ),
      component(
        'c1',
        'HomeScreen',
        element('e1', 'AnimatedOpacity', {
          duration: boundProp('bp1', propertyAccess('pa1', { id: 'recv1', kind: 'logic.New', span, typeName: 'Model', type: { library: 'app', name: 'Model', target: 'cls1' }, args: [lit('cv1', 'int', 7)] }, 'doubled', 'g1')),
        }),
        // A second element re-reads the same getter — a distinct read site, own id.
      ),
      component(
        'c2',
        'OtherScreen',
        element('e2', 'AnimatedOpacity', {
          duration: boundProp('bp2', propertyAccess('pa2', { id: 'recv2', kind: 'logic.New', span, typeName: 'Model', type: { library: 'app', name: 'Model', target: 'cls1' }, args: [lit('cv2', 'int', 8)] }, 'doubled', 'g1')),
        }),
      ),
      route('c1'),
    ];
    const { context, reported } = harness(nodes);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const home = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    const other = fileAt(files, 'src/components/other-screen.tsx') ?? '';
    expect(home).toMatch(/Model_doubled\(/);
    expect(other).toMatch(/Model_doubled\(/);
  });

  it('the same getter name on two different classes gets two distinct, collision-safe helpers', () => {
    const nodes: AnyUirNode[] = [
      classDecl(
        'cls1',
        'Alpha',
        [field('f1', 'count', 'int')],
        [getterDecl('g1', 'doubled', [returnStmt('r1', binary('b1', ref('rf1', 'f1', 'count'), '*', lit('l1', 'int', 2)))])],
      ),
      classDecl(
        'cls2',
        'Beta',
        [field('f2', 'count', 'int')],
        [getterDecl('g2', 'doubled', [returnStmt('r2', binary('b2', ref('rf2', 'f2', 'count'), '*', lit('l2', 'int', 3)))])],
      ),
      component(
        'c1',
        'HomeScreen',
        element('e1', 'AnimatedOpacity', {
          duration: boundProp('bp1', propertyAccess('pa1', { id: 'recv1', kind: 'logic.New', span, typeName: 'Alpha', type: { library: 'app', name: 'Alpha', target: 'cls1' }, args: [lit('cv1', 'int', 7)] }, 'doubled', 'g1')),
        }),
      ),
      component(
        'c2',
        'OtherScreen',
        element('e2', 'AnimatedOpacity', {
          duration: boundProp('bp2', propertyAccess('pa2', { id: 'recv2', kind: 'logic.New', span, typeName: 'Beta', type: { library: 'app', name: 'Beta', target: 'cls2' }, args: [lit('cv2', 'int', 8)] }, 'doubled', 'g2')),
        }),
      ),
      route('c1'),
    ];
    const { context, reported } = harness(nodes);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const model = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(model).toContain('self.count * 2');
    expect(model).toContain('self.count * 3');
    // Two distinct exported function names — never one shadowing/overwriting the other.
    const exported = [...model.matchAll(/export function (\w+)\(/g)].map((m) => m[1]);
    expect(new Set(exported).size).toBe(exported.length);
  });

  it('two genuinely identical preferred helper names (from two different declarations) still resolve to two distinct helpers', () => {
    // `Foo_bar`'s own `baz` getter and `Foo`'s own `bar_baz` getter both request the identical preferred
    // text `Foo_bar_baz` — collision safety must come from each getter's own unique declaration id (the
    // `owner` `ModuleBuilder.declare` collision-checks against), never from the human-readable name text
    // alone coinciding by chance.
    const nodes: AnyUirNode[] = [
      classDecl(
        'cls1',
        'Foo_bar',
        [field('f1', 'count', 'int')],
        [getterDecl('g1', 'baz', [returnStmt('r1', binary('b1', ref('rf1', 'f1', 'count'), '*', lit('l1', 'int', 2)))])],
      ),
      classDecl(
        'cls2',
        'Foo',
        [field('f2', 'count', 'int')],
        [getterDecl('g2', 'bar_baz', [returnStmt('r2', binary('b2', ref('rf2', 'f2', 'count'), '*', lit('l2', 'int', 3)))])],
      ),
      component(
        'c1',
        'HomeScreen',
        element('e1', 'AnimatedOpacity', {
          duration: boundProp('bp1', propertyAccess('pa1', { id: 'recv1', kind: 'logic.New', span, typeName: 'Foo_bar', type: { library: 'app', name: 'Foo_bar', target: 'cls1' }, args: [lit('cv1', 'int', 7)] }, 'baz', 'g1')),
        }),
      ),
      component(
        'c2',
        'OtherScreen',
        element('e2', 'AnimatedOpacity', {
          duration: boundProp('bp2', propertyAccess('pa2', { id: 'recv2', kind: 'logic.New', span, typeName: 'Foo', type: { library: 'app', name: 'Foo', target: 'cls2' }, args: [lit('cv2', 'int', 8)] }, 'bar_baz', 'g2')),
        }),
      ),
      route('c1'),
    ];
    const { context, reported } = harness(nodes);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const model = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(model).toContain('self.count * 2');
    expect(model).toContain('self.count * 3');
    const exported = [...model.matchAll(/export function (\w+)\(/g)].map((m) => m[1]);
    expect(new Set(exported).size).toBe(exported.length);
    expect(exported).toContain('Foo_bar_baz');
    expect(exported).toContain('Foo_bar_baz2');
  });

  it('no `any` appears anywhere in the emitted helper or its call site', () => {
    const nodes: AnyUirNode[] = [
      classDecl(
        'cls1',
        'Model',
        [field('f1', 'count', 'int')],
        [getterDecl('g1', 'doubled', [returnStmt('r1', binary('b1', ref('rf1', 'f1', 'count'), '*', lit('l1', 'int', 2)))])],
      ),
      component(
        'c1',
        'HomeScreen',
        element('e1', 'AnimatedOpacity', {
          duration: boundProp('bp1', propertyAccess('pa1', { id: 'recv1', kind: 'logic.New', span, typeName: 'Model', type: { library: 'app', name: 'Model', target: 'cls1' }, args: [lit('cv1', 'int', 7)] }, 'doubled', 'g1')),
        }),
      ),
      route('c1'),
    ];
    const { source, errors } = generatedHome(nodes);
    expect(errors).toEqual([]);
    expect(source).not.toMatch(/\bany\b/);
    expect(modelFile(nodes)).not.toMatch(/\bany\b/);
  });
});
