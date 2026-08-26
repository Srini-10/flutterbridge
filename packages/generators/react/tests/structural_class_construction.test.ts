import type { AnyUirNode } from '@bridge/uir';
import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { fileAt, harness } from './support.js';

// Hand-authored-UIR unit coverage for the ADR-0036/ADR-0037 (M9-O/M9-P) `logic.New` object-literal
// lowering, isolating the lowering itself from the pre-existing, out-of-scope component build-method
// inlining gap that the real fixtures' own build-proofs necessarily exercise alongside it. Everything
// here is about the properties this line of work adds: a bounded project-class construction — unnamed or
// named, positional or required-named field-formals — becomes a plain object literal, in real source
// argument-evaluation order, evaluating each argument exactly once — and every unbounded shape (const, an
// unmatched constructor name, a class with no `constructibleConstructors`) still reaches the pre-existing
// refusal, unchanged.

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

interface ConstructorEntry {
  name?: string;
  kind: 'positional' | 'named';
  fields: string[];
}

/** A `logic.ClassDecl`, optionally bounded-constructible (ADR-0036/ADR-0037). */
function classDecl(id: string, name: string, fields: unknown[], constructors?: ConstructorEntry[]): AnyUirNode {
  return {
    id,
    kind: 'logic.ClassDecl',
    span,
    name,
    fields,
    ...(constructors === undefined ? {} : { constructibleConstructors: constructors }),
  } as unknown as AnyUirNode;
}

/** The common case: a single unnamed constructor with required-positional field-formals. */
function positional(fieldIds: string[]): ConstructorEntry[] {
  return [{ kind: 'positional', fields: fieldIds }];
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

/** A `logic.New` invoking a required-named constructor, with real source (`namedArgOrder`) call order. */
function constructNamed(
  id: string,
  className: string,
  classId: string,
  namedArgs: Record<string, unknown>,
  namedArgOrder: string[],
  overrides: Record<string, unknown> = {},
): unknown {
  return {
    id,
    kind: 'logic.New',
    span,
    typeName: className,
    type: { library: 'package:app/model.dart', name: className, target: classId },
    namedArgs,
    namedArgOrder,
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
  it('a bounded construction lowers to a plain object literal, in constructor-field order', () => {
    const nodes: AnyUirNode[] = [
      classDecl('cls1', 'Point', [field('f1', 'x', 'int'), field('f2', 'y', 'int')], positional(['f1', 'f2'])),
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
    // Field declaration order is `x`, `y`; the constructor's own parameter order is `y`, `x`.
    const nodes: AnyUirNode[] = [
      classDecl('cls1', 'Point', [field('f1', 'x', 'int'), field('f2', 'y', 'int')], positional(['f2', 'f1'])),
      component('c1', 'HomeScreen', element('e1', 'AnimatedOpacity', { duration: boundProp('b1', construct('n1', 'Point', 'cls1', [lit('a1', 'int', 1), lit('a2', 'int', 2)])) })),
      route('c1'),
    ];
    const { source, errors } = generatedHome(nodes);
    expect(errors).toEqual([]);
    // Argument `1` binds to `y` (first constructor parameter), `2` binds to `x` (second) — never `{ x: 1, y: 2 }`.
    expect(source).toContain('{ y: 1, x: 2 }');
  });

  it('each argument occupies exactly one property in the emitted object literal — never duplicated, never dropped', () => {
    const nodes: AnyUirNode[] = [
      classDecl('cls1', 'Point', [field('f1', 'x', 'int'), field('f2', 'y', 'int')], positional(['f1', 'f2'])),
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
      classDecl('cls1', 'Marker', [], positional([])),
      component('c1', 'HomeScreen', element('e1', 'AnimatedOpacity', { duration: boundProp('b1', construct('n1', 'Marker', 'cls1', [])) })),
      route('c1'),
    ];
    const { source, errors } = generatedHome(nodes);
    expect(errors).toEqual([]);
    expect(source).toContain('{}');
  });

  it('a const construction of an otherwise-eligible class is still refused — construction never bypasses canonicalization', () => {
    const nodes: AnyUirNode[] = [
      classDecl('cls1', 'Point', [field('f1', 'x', 'int'), field('f2', 'y', 'int')], positional(['f1', 'f2'])),
      component('c1', 'HomeScreen', element('e1', 'AnimatedOpacity', { duration: boundProp('b1', construct('n1', 'Point', 'cls1', [lit('a1', 'int', 1), lit('a2', 'int', 2)], { isConst: true })) })),
      route('c1'),
    ];
    const { errors } = generatedHome(nodes);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((d) => /does not emit class declarations/.test((d as { message: string }).message))).toBe(true);
  });

  it('a construction naming a constructor the class has no matching entry for is still refused', () => {
    const nodes: AnyUirNode[] = [
      classDecl('cls1', 'Point', [field('f1', 'x', 'int'), field('f2', 'y', 'int')], positional(['f1', 'f2'])),
      component('c1', 'HomeScreen', element('e1', 'AnimatedOpacity', { duration: boundProp('b1', construct('n1', 'Point', 'cls1', [lit('a1', 'int', 1), lit('a2', 'int', 2)], { constructorName: 'origin' })) })),
      route('c1'),
    ];
    const { errors } = generatedHome(nodes);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((d) => /does not emit class declarations/.test((d as { message: string }).message))).toBe(true);
  });

  it('a class with no constructibleConstructors remains an ordinary, refused construction', () => {
    const nodes: AnyUirNode[] = [
      classDecl('cls1', 'Point', [field('f1', 'x', 'int'), field('f2', 'y', 'int')]),
      component('c1', 'HomeScreen', element('e1', 'AnimatedOpacity', { duration: boundProp('b1', construct('n1', 'Point', 'cls1', [lit('a1', 'int', 1), lit('a2', 'int', 2)])) })),
      route('c1'),
    ];
    const { errors } = generatedHome(nodes);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((d) => /does not emit class declarations/.test((d as { message: string }).message))).toBe(true);
  });

  it('an argument-count mismatch against the matched entry falls back to the ordinary refusal, never a malformed literal', () => {
    // Defensive only — a correct extractor never produces this shape — but the generator must not crash or
    // emit a partial object literal if it ever did.
    const nodes: AnyUirNode[] = [
      classDecl('cls1', 'Point', [field('f1', 'x', 'int'), field('f2', 'y', 'int')], positional(['f1', 'f2'])),
      component('c1', 'HomeScreen', element('e1', 'AnimatedOpacity', { duration: boundProp('b1', construct('n1', 'Point', 'cls1', [lit('a1', 'int', 1)])) })),
      route('c1'),
    ];
    const { source, errors } = generatedHome(nodes);
    expect(errors.length).toBeGreaterThan(0);
    expect(source).not.toContain('{ x: 1');
  });
});

describe('constructor-specific structural construction (ADR-0037, M9-P)', () => {
  it('a named constructor resolves against its own entry, distinct from the unnamed one', () => {
    const nodes: AnyUirNode[] = [
      classDecl('cls1', 'Point', [field('f1', 'x', 'int'), field('f2', 'y', 'int')], [
        { kind: 'positional', fields: ['f1', 'f2'] },
        { name: 'swapped', kind: 'positional', fields: ['f2', 'f1'] },
      ]),
      component(
        'c1',
        'HomeScreen',
        element('e1', 'AnimatedOpacity', {
          duration: boundProp('b1', construct('n1', 'Point', 'cls1', [lit('a1', 'int', 1), lit('a2', 'int', 2)], { constructorName: 'swapped' })),
        }),
      ),
      route('c1'),
    ];
    const { source, errors } = generatedHome(nodes);
    expect(errors).toEqual([]);
    // The `swapped` entry's own field order (`y`, `x`), not the unnamed entry's (`x`, `y`).
    expect(source).toContain('{ y: 1, x: 2 }');
  });

  it('a required named field-formal construction resolves each argument by field name, in real source call order', () => {
    const nodes: AnyUirNode[] = [
      classDecl('cls1', 'Point', [field('f1', 'x', 'int'), field('f2', 'y', 'int')], [
        { kind: 'named', fields: ['f1', 'f2'] },
      ]),
      component(
        'c1',
        'HomeScreen',
        element('e1', 'AnimatedOpacity', {
          duration: boundProp(
            'b1',
            constructNamed('n1', 'Point', 'cls1', { x: lit('a1', 'int', 1), y: lit('a2', 'int', 2) }, ['y', 'x']),
          ),
        }),
      ),
      route('c1'),
    ];
    const { source, errors } = generatedHome(nodes);
    expect(errors).toEqual([]);
    // `namedArgOrder` says `y` was written before `x` at the call site — the emitted property order must
    // follow that, never the entry's own declaration order (`x`, `y`) and never alphabetical.
    expect(source).toContain('{ y: 2, x: 1 }');
  });

  it('a named-argument call site presented in declaration order still emits in that (also source) order', () => {
    const nodes: AnyUirNode[] = [
      classDecl('cls1', 'Point', [field('f1', 'x', 'int'), field('f2', 'y', 'int')], [
        { kind: 'named', fields: ['f1', 'f2'] },
      ]),
      component(
        'c1',
        'HomeScreen',
        element('e1', 'AnimatedOpacity', {
          duration: boundProp(
            'b1',
            constructNamed('n1', 'Point', 'cls1', { x: lit('a1', 'int', 1), y: lit('a2', 'int', 2) }, ['x', 'y']),
          ),
        }),
      ),
      route('c1'),
    ];
    const { source, errors } = generatedHome(nodes);
    expect(errors).toEqual([]);
    expect(source).toContain('{ x: 1, y: 2 }');
  });

  it('a named-argument call whose namedArgOrder does not match the entry\'s own field-name set falls back to refusal', () => {
    // Defensive only — a correct, BRG1310-gated extraction never produces this shape.
    const nodes: AnyUirNode[] = [
      classDecl('cls1', 'Point', [field('f1', 'x', 'int'), field('f2', 'y', 'int')], [
        { kind: 'named', fields: ['f1', 'f2'] },
      ]),
      component(
        'c1',
        'HomeScreen',
        element('e1', 'AnimatedOpacity', {
          duration: boundProp(
            'b1',
            constructNamed('n1', 'Point', 'cls1', { x: lit('a1', 'int', 1), z: lit('a2', 'int', 2) }, ['x', 'z']),
          ),
        }),
      ),
      route('c1'),
    ];
    const { source, errors } = generatedHome(nodes);
    expect(errors.length).toBeGreaterThan(0);
    expect(source).not.toContain('x: 1');
  });

  it('a safe unnamed entry and an absent (unsafe) named entry coexist correctly — the unnamed one still succeeds', () => {
    const nodes: AnyUirNode[] = [
      // `Model.bad` is simply absent from `constructibleConstructors` — the class-decl shape a real
      // "safe + unsafe sibling" extraction produces (ADR-0037 §9/§23).
      classDecl('cls1', 'Point', [field('f1', 'x', 'int')], positional(['f1'])),
      component('c1', 'HomeScreen', element('e1', 'AnimatedOpacity', { duration: boundProp('b1', construct('n1', 'Point', 'cls1', [lit('a1', 'int', 1)])) })),
      route('c1'),
    ];
    const { source, errors } = generatedHome(nodes);
    expect(errors).toEqual([]);
    expect(source).toContain('{ x: 1 }');
  });

  it('the unsafe sibling itself (a constructor name absent from constructibleConstructors) is refused', () => {
    const nodes: AnyUirNode[] = [
      classDecl('cls1', 'Point', [field('f1', 'x', 'int')], positional(['f1'])),
      component(
        'c1',
        'HomeScreen',
        element('e1', 'AnimatedOpacity', {
          duration: boundProp('b1', construct('n1', 'Point', 'cls1', [lit('a1', 'int', 1)], { constructorName: 'bad' })),
        }),
      ),
      route('c1'),
    ];
    const { errors } = generatedHome(nodes);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((d) => /does not emit class declarations/.test((d as { message: string }).message))).toBe(true);
  });
});
