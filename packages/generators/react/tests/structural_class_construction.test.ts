import type { AnyUirNode } from '@bridge/uir';
import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { fileAt, harness } from './support.js';

// Hand-authored-UIR unit coverage for the ADR-0036 (M9-O) `logic.New` object-literal lowering, isolating
// the lowering itself from the pre-existing, out-of-scope component build-method inlining gap that the
// real `structural_class_construction` fixture's own build-proof (`structural_class_construction_build.test.ts`)
// necessarily exercises alongside it. Everything here is about the one property this milestone adds:
// a bounded project-class construction becomes a plain object literal, in constructor-argument order,
// evaluating each argument exactly once — and every unbounded shape (const, named constructor, a class
// with no `constructibleFieldOrder`) still reaches the pre-existing refusal, unchanged.

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

/** A `logic.ClassDecl`, optionally bounded-constructible (ADR-0036). */
function classDecl(id: string, name: string, fields: unknown[], constructibleFieldOrder?: string[]): AnyUirNode {
  return {
    id,
    kind: 'logic.ClassDecl',
    span,
    name,
    fields,
    ...(constructibleFieldOrder === undefined ? {} : { constructibleFieldOrder }),
  } as unknown as AnyUirNode;
}

/** A `logic.New` referencing `classId` via its own `type.target` — the identical shape ADR-0034 already attaches. */
function construct(id: string, className: string, classId: string, args: unknown[], overrides: Record<string, unknown> = {}): unknown {
  return {
    id,
    kind: 'logic.New',
    span,
    typeName: className,
    type: { library: 'package:app/model.dart', name: className, target: classId },
    args,
    ...overrides,
  };
}

function lit(id: string, typeName: string, value: unknown): unknown {
  return { id, kind: 'logic.Lit', span, type: { library: 'dart:core', name: typeName }, value };
}

/** Wraps `expr` in a bound prop on a bare element — a widget/prop pair chosen only to reach `emitExpression`. */
function boundProp(id: string, expr: unknown): unknown {
  return { id, kind: 'bind.Expr', span, expr };
}

function generatedHome(nodes: AnyUirNode[]): { source: string; errors: unknown[] } {
  const { context, reported } = harness(nodes);
  const { files } = reactGenerator.generate(context);
  return { source: fileAt(files, 'src/components/home-screen.tsx') ?? '', errors: reported.filter((d) => d.severity === 'error') };
}

describe('bounded structural project-class construction (ADR-0036, M9-O)', () => {
  it('a bounded construction lowers to a plain object literal, in constructibleFieldOrder order', () => {
    const nodes: AnyUirNode[] = [
      classDecl('cls1', 'Point', [field('f1', 'x', 'int'), field('f2', 'y', 'int')], ['f1', 'f2']),
      component('c1', 'HomeScreen', element('e1', 'AnimatedOpacity', { duration: boundProp('b1', construct('n1', 'Point', 'cls1', [lit('a1', 'int', 1), lit('a2', 'int', 2)])) })),
      route('c1'),
    ];
    const { source, errors } = generatedHome(nodes);
    expect(errors).toEqual([]);
    expect(source).toContain('{ x: 1, y: 2 }');
    expect(source).not.toContain('new Point');
    expect(source).not.toContain('class Point');
  });

  it('constructor-argument order is preserved even when it differs from field-declaration order', () => {
    // Field declaration order is `x`, `y`; `constructibleFieldOrder` (constructor-parameter order) is `y`, `x`.
    const nodes: AnyUirNode[] = [
      classDecl('cls1', 'Point', [field('f1', 'x', 'int'), field('f2', 'y', 'int')], ['f2', 'f1']),
      component('c1', 'HomeScreen', element('e1', 'AnimatedOpacity', { duration: boundProp('b1', construct('n1', 'Point', 'cls1', [lit('a1', 'int', 1), lit('a2', 'int', 2)])) })),
      route('c1'),
    ];
    const { source, errors } = generatedHome(nodes);
    expect(errors).toEqual([]);
    // Argument `1` binds to `y` (first constructor parameter), `2` binds to `x` (second) — never `{ x: 1, y: 2 }`.
    expect(source).toContain('{ y: 1, x: 2 }');
  });

  it('each argument occupies exactly one property in the emitted object literal — never duplicated, never dropped', () => {
    // The lowering is a single loop over `constructibleFieldOrder`/`args` in lockstep: each argument is
    // emitted by exactly one `emitExpression` call, into exactly one property. Distinguishable string
    // literals — rather than two occurrences of the same value — make a duplicate-emission mutation (e.g.
    // pushing a property twice, or re-running the loop) visible as a substring appearing twice in the
    // object literal's own text, not just as a wrong count of properties.
    const nodes: AnyUirNode[] = [
      classDecl('cls1', 'Point', [field('f1', 'x', 'int'), field('f2', 'y', 'int')], ['f1', 'f2']),
      component(
        'c1',
        'HomeScreen',
        element('e1', 'AnimatedOpacity', {
          duration: boundProp('b1', construct('n1', 'Point', 'cls1', [lit('a1', 'String', 'left-arg'), lit('a2', 'String', 'right-arg')])),
        }),
      ),
      route('c1'),
    ];
    const { source, errors } = generatedHome(nodes);
    expect(errors).toEqual([]);
    expect(source.match(/left-arg/g)).toHaveLength(1);
    expect(source.match(/right-arg/g)).toHaveLength(1);
    expect(source).toContain("{ x: 'left-arg', y: 'right-arg' }");
  });

  it('an empty-field class constructs to an empty object literal', () => {
    const nodes: AnyUirNode[] = [
      classDecl('cls1', 'Marker', [], []),
      component('c1', 'HomeScreen', element('e1', 'AnimatedOpacity', { duration: boundProp('b1', construct('n1', 'Marker', 'cls1', [])) })),
      route('c1'),
    ];
    const { source, errors } = generatedHome(nodes);
    expect(errors).toEqual([]);
    expect(source).toContain('{}');
  });

  it('a const construction of an otherwise-eligible class is still refused — construction never bypasses canonicalization', () => {
    const nodes: AnyUirNode[] = [
      classDecl('cls1', 'Point', [field('f1', 'x', 'int'), field('f2', 'y', 'int')], ['f1', 'f2']),
      component('c1', 'HomeScreen', element('e1', 'AnimatedOpacity', { duration: boundProp('b1', construct('n1', 'Point', 'cls1', [lit('a1', 'int', 1), lit('a2', 'int', 2)], { isConst: true })) })),
      route('c1'),
    ];
    const { errors } = generatedHome(nodes);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((d) => /does not emit class declarations/.test((d as { message: string }).message))).toBe(true);
  });

  it('a named-constructor invocation of an otherwise-eligible class is still refused, not mistaken for the unnamed one', () => {
    const nodes: AnyUirNode[] = [
      classDecl('cls1', 'Point', [field('f1', 'x', 'int'), field('f2', 'y', 'int')], ['f1', 'f2']),
      component('c1', 'HomeScreen', element('e1', 'AnimatedOpacity', { duration: boundProp('b1', construct('n1', 'Point', 'cls1', [lit('a1', 'int', 1), lit('a2', 'int', 2)], { constructorName: 'origin' })) })),
      route('c1'),
    ];
    const { errors } = generatedHome(nodes);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((d) => /does not emit class declarations/.test((d as { message: string }).message))).toBe(true);
  });

  it('a class with no constructibleFieldOrder remains an ordinary, refused construction', () => {
    const nodes: AnyUirNode[] = [
      classDecl('cls1', 'Point', [field('f1', 'x', 'int'), field('f2', 'y', 'int')]),
      component('c1', 'HomeScreen', element('e1', 'AnimatedOpacity', { duration: boundProp('b1', construct('n1', 'Point', 'cls1', [lit('a1', 'int', 1), lit('a2', 'int', 2)])) })),
      route('c1'),
    ];
    const { errors } = generatedHome(nodes);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((d) => /does not emit class declarations/.test((d as { message: string }).message))).toBe(true);
  });

  it('an argument-count mismatch against constructibleFieldOrder falls back to the ordinary refusal, never a malformed literal', () => {
    // Defensive only — a correct extractor never produces this shape — but the generator must not crash or
    // emit a partial object literal if it ever did.
    const nodes: AnyUirNode[] = [
      classDecl('cls1', 'Point', [field('f1', 'x', 'int'), field('f2', 'y', 'int')], ['f1', 'f2']),
      component('c1', 'HomeScreen', element('e1', 'AnimatedOpacity', { duration: boundProp('b1', construct('n1', 'Point', 'cls1', [lit('a1', 'int', 1)])) })),
      route('c1'),
    ];
    const { source, errors } = generatedHome(nodes);
    expect(errors.length).toBeGreaterThan(0);
    expect(source).not.toContain('{ x: 1');
  });
});
