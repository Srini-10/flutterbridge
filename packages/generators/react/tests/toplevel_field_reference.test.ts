import type { AnyUirNode } from '@bridge/uir';
import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { fileAt, harness } from './support.js';

// A project-defined top-level `const`/`final` variable reference (M8-P). M8-J gave a cross-file/
// cross-package `logic.Ref` to a top-level field real target identity; M8-L's own `FunctionDecl` fix
// left the sibling case unfixed (recorded in its own doc as a candidate). M8-P measured whether the
// declaration itself could be lowered (found no real Continuum site that would benefit — both
// motivating cases fail for reasons unrelated to FieldDecl lowering, M8-P's own doc §17) and closed the
// diagnostic misattribution the identical, structural way M8-L closed it for functions: by the resolved
// target's own kind, never by name.

const span = { file: 'lib/main.dart', line: 10, column: 3 } as const;

function fieldDecl(id: string, name: string, extra: Record<string, unknown> = {}): AnyUirNode {
  return {
    id,
    kind: 'logic.FieldDecl',
    span,
    name,
    type: { library: 'dart:core', name: 'String' },
    isStatic: true,
    isFinal: true,
    ...extra,
  } as unknown as AnyUirNode;
}

function fieldRef(id: string, name: string, target?: string): Record<string, unknown> {
  return {
    id,
    kind: 'logic.Ref',
    span,
    name,
    ...(target === undefined ? {} : { target }),
    type: { library: 'dart:core', name: 'String' },
  };
}

function component(id: string, name: string, render: Record<string, unknown>): AnyUirNode {
  return { id, kind: 'ui.Component', span, name, render } as unknown as AnyUirNode;
}

function text(id: string, value: Record<string, unknown>): Record<string, unknown> {
  return { id, kind: 'ui.Text', span, value: { id: `${id}-b`, kind: 'bind.Expr', span, expr: value } };
}

describe('a targeted reference to a project top-level field (M8-P)', () => {
  it('is refused as an unsupported capability, never as an unresolved reference', () => {
    const nodes: AnyUirNode[] = [
      fieldDecl('greeting-decl', 'greeting'),
      component('comp', 'W', text('t1', fieldRef('r1', 'greeting', 'greeting-decl'))),
    ];
    const { context, reported } = harness(nodes);
    reactGenerator.generate(context);
    const capability = reported.find((d) => d.code === 'BRG3013');
    expect(capability?.severity).toBe('error');
    expect(capability?.message).toContain('greeting');
    expect(capability?.message).not.toContain('not declared in this program');
    expect(reported.some((d) => d.code === 'BRG3006')).toBe(false);
    expect(reported.filter((d) => d.severity === 'error').map((d) => d.code).sort()).toEqual(['BRG3005', 'BRG3013']);
  });

  it('does not emit a read for the unsupported field', () => {
    const nodes: AnyUirNode[] = [
      fieldDecl('greeting-decl', 'greeting'),
      component('comp', 'W', text('t1', fieldRef('r1', 'greeting', 'greeting-decl'))),
    ];
    const { context } = harness(nodes);
    const { files } = reactGenerator.generate(context);
    expect(files).toHaveLength(0);
  });

  it('a genuinely missing target still gets BRG3006, unweakened', () => {
    const nodes: AnyUirNode[] = [component('comp', 'W', text('t1', fieldRef('r1', 'mystery')))];
    const { context, reported } = harness(nodes);
    reactGenerator.generate(context);
    expect(reported.some((d) => d.severity === 'error' && d.code === 'BRG3006')).toBe(true);
    expect(reported.some((d) => d.code === 'BRG3013')).toBe(false);
  });

  it('a mutable top-level variable (no isFinal) is refused identically — this is a lowering gap, not a mutability one', () => {
    const nodes: AnyUirNode[] = [
      fieldDecl('mutable-decl', 'counter', { isFinal: undefined, type: { library: 'dart:core', name: 'int' } }),
      component('comp', 'W', text('t1', fieldRef('r1', 'counter', 'mutable-decl'))),
    ];
    const { context, reported } = harness(nodes);
    reactGenerator.generate(context);
    const capability = reported.find((d) => d.code === 'BRG3013');
    expect(capability?.message).toContain('counter');
  });

  it('two different top-level fields with the same name never collapse into one classification', () => {
    const nodes: AnyUirNode[] = [
      fieldDecl('a-decl', 'shared'),
      fieldDecl('b-decl', 'shared'),
      component(
        'comp',
        'W',
        {
          id: 'root',
          kind: 'ui.Element',
          span,
          component: { name: 'Column', userDefined: false },
          children: [
            text('t1', fieldRef('r1', 'shared', 'a-decl')),
            text('t2', fieldRef('r2', 'shared', 'b-decl')),
          ],
        },
      ),
    ];
    const { context, reported } = harness(nodes);
    reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error' && d.code === 'BRG3013');
    expect(errors).toHaveLength(2);
    expect(reported.some((d) => d.code === 'BRG3006')).toBe(false);
  });

  it('a targeted top-level function (M8-L) is unaffected — still BRG3013 with its own message, not confused with a field', () => {
    const functionDeclNode: AnyUirNode = {
      id: 'fn-decl',
      kind: 'logic.FunctionDecl',
      span,
      name: 'greet',
      returnType: { library: 'dart:core', name: 'String' },
      body: [],
    } as unknown as AnyUirNode;
    const nodes: AnyUirNode[] = [
      functionDeclNode,
      component('comp', 'W', text('t1', {
        id: 'c1',
        kind: 'logic.Call',
        span,
        callee: fieldRef('r1', 'greet', 'fn-decl'),
        args: [],
        type: { library: 'dart:core', name: 'String' },
      })),
    ];
    const { context, reported } = harness(nodes);
    reactGenerator.generate(context);
    const capability = reported.find((d) => d.code === 'BRG3013');
    expect(capability?.message).toContain('top-level function');
    expect(capability?.message).not.toContain('top-level variable');
  });

  it('an enum constant reference (M8-D) is unaffected — still a literal, not a capability refusal', () => {
    const enumDecl: AnyUirNode = { id: 'stage-decl', kind: 'logic.EnumDecl', span, name: 'Stage', values: ['ready'] } as unknown as AnyUirNode;
    const enumRef = { id: 'r1', kind: 'logic.Ref', span, name: 'Stage.ready', target: 'stage-decl', type: { library: 'package:app/stage', name: 'Stage' } };
    const nodes: AnyUirNode[] = [enumDecl, component('comp', 'W', text('t1', enumRef))];
    const { context, reported } = harness(nodes);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(fileAt(files, 'src/components/w.tsx') ?? '').toContain("'ready'");
  });
});
