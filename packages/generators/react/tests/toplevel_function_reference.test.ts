import type { AnyUirNode } from '@bridge/uir';
import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { fileAt, harness } from './support.js';

// A project-defined top-level function reference (M8-L). M8-J gave a cross-file/cross-package
// `logic.Ref` to a top-level function real target identity; M8-K found that a *targeted* reference
// still fell through to `BRG3006` ("`greet` is not declared in this program") because nothing in this
// generator recognised the target's own kind — a real `logic.FunctionDecl` was mistaken for an absent
// declaration. This proves the corrected classification: structural (by resolved node kind), never by
// matching the function's name.

const span = { file: 'lib/main.dart', line: 10, column: 3 } as const;

function functionDecl(id: string, name: string): AnyUirNode {
  return {
    id,
    kind: 'logic.FunctionDecl',
    span,
    name,
    params: [{ name: 'name', type: { library: 'dart:core', name: 'String' }, required: true }],
    returnType: { library: 'dart:core', name: 'String' },
    body: [],
  } as unknown as AnyUirNode;
}

function fnRef(id: string, name: string, target?: string): Record<string, unknown> {
  return {
    id,
    kind: 'logic.Ref',
    span,
    name,
    ...(target === undefined ? {} : { target }),
    type: { name: 'String Function(String)' },
  };
}

function callOf(id: string, callee: Record<string, unknown>): Record<string, unknown> {
  return {
    id: `${id}-call`,
    kind: 'logic.Call',
    span,
    callee,
    args: [{ id: `${id}-arg`, kind: 'logic.Lit', span, type: { library: 'dart:core', name: 'String' }, value: 'Ada' }],
  };
}

function component(id: string, name: string, render: Record<string, unknown>): AnyUirNode {
  return { id, kind: 'ui.Component', span, name, render } as unknown as AnyUirNode;
}

function text(id: string, value: Record<string, unknown>): Record<string, unknown> {
  return { id, kind: 'ui.Text', span, value: { id: `${id}-b`, kind: 'bind.Expr', span, expr: value } };
}

describe('a targeted reference to a project top-level function (M8-L)', () => {
  it('is refused as an unsupported capability, never as an unresolved reference', () => {
    const nodes: AnyUirNode[] = [
      functionDecl('greet-decl', 'greet'),
      component('comp', 'W', text('t1', callOf('c1', fnRef('r1', 'greet', 'greet-decl')))),
    ];
    const { context, reported } = harness(nodes);
    reactGenerator.generate(context);
    const capability = reported.find((d) => d.code === 'BRG3013');
    expect(capability?.severity).toBe('error');
    expect(capability?.message).toContain('greet');
    expect(capability?.message).not.toContain('not declared in this program');
    expect(reported.some((d) => d.code === 'BRG3006')).toBe(false);
    // The refusal is real: a whole-program summary (BRG3005) follows it, and nothing else names a
    // second, unrelated cause — a themed-component/route warning aside (this program declares neither).
    expect(reported.filter((d) => d.severity === 'error').map((d) => d.code).sort()).toEqual(['BRG3005', 'BRG3013']);
  });

  it('does not emit a call for the unsupported function', () => {
    const nodes: AnyUirNode[] = [
      functionDecl('greet-decl', 'greet'),
      component('comp', 'W', text('t1', callOf('c1', fnRef('r1', 'greet', 'greet-decl')))),
    ];
    const { context } = harness(nodes);
    const { files } = reactGenerator.generate(context);
    // A refused program emits no files at all (BRG3005) — nothing here should compile around the hole.
    expect(files).toHaveLength(0);
  });

  it('a genuinely missing target still gets BRG3006, unweakened', () => {
    const nodes: AnyUirNode[] = [component('comp', 'W', text('t1', fnRef('r1', 'mystery')))];
    const { context, reported } = harness(nodes);
    reactGenerator.generate(context);
    expect(reported.some((d) => d.severity === 'error' && d.code === 'BRG3006')).toBe(true);
    expect(reported.some((d) => d.code === 'BRG3013')).toBe(false);
  });

  it('two different top-level functions with the same name never collapse into one classification', () => {
    const nodes: AnyUirNode[] = [
      functionDecl('a-decl', 'helper'),
      functionDecl('b-decl', 'helper'),
      component(
        'comp',
        'W',
        {
          id: 'root',
          kind: 'ui.Element',
          span,
          component: { name: 'Column', userDefined: false },
          children: [
            text('t1', callOf('c1', fnRef('r1', 'helper', 'a-decl'))),
            text('t2', callOf('c2', fnRef('r2', 'helper', 'b-decl'))),
          ],
        },
      ),
    ];
    const { context, reported } = harness(nodes);
    reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error' && d.code === 'BRG3013');
    // Each reference resolves its own declaration independently — two refusals, not a shared or
    // deduplicated one, and neither is misreported as BRG3006.
    expect(errors).toHaveLength(2);
    expect(reported.some((d) => d.code === 'BRG3006')).toBe(false);
  });

  it('a targeted top-level const (M8-J) was BRG3006 at M8-L, and is now BRG3013 (M8-P)', () => {
    // The sibling gap this milestone's own doc recorded, at the time deliberately not fixed (M8-L was
    // scoped to `logic.FunctionDecl` only): M8-J gave a top-level `const`/`final` reference real target
    // identity, but nothing here recognised a `logic.FieldDecl` target — the same shape of
    // misattribution `greet` had. M8-P closed it, structurally, the identical way. This test is the
    // updated regression guard for that change — see `toplevel_field_reference.test.ts` for the full
    // M8-P coverage (same-name collision, missing-target, enum/local/action regressions).
    const fieldDecl: AnyUirNode = {
      id: 'const-decl',
      kind: 'logic.FieldDecl',
      span,
      name: 'protocolVersion',
      isStatic: true,
      isFinal: true,
      type: { library: 'dart:core', name: 'String' },
    } as unknown as AnyUirNode;
    const nodes: AnyUirNode[] = [
      fieldDecl,
      component('comp', 'W', text('t1', fnRef('r1', 'protocolVersion', 'const-decl'))),
    ];
    const { context, reported } = harness(nodes);
    reactGenerator.generate(context);
    expect(reported.some((d) => d.severity === 'error' && d.code === 'BRG3006')).toBe(false);
    const capability = reported.find((d) => d.code === 'BRG3013');
    expect(capability?.severity).toBe('error');
    expect(capability?.message).toContain('protocolVersion');
    expect(capability?.message).not.toContain('not declared in this program');
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
