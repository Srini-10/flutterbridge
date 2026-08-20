import type { AnyUirNode } from '@bridge/uir';
import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { fileAt, harness } from './support.js';

// An application enum constant (M8-D). Before this, `logic.Ref{name:'Stage.ready'}` reached the
// generator with no `target` at all — the analyzer-side gap M8-C measured across 7 real Continuum
// sites — and every one became `BRG3006`, "not declared in this program", regardless of what the
// generator itself might have done with a resolved one. This is the generator half: given a `target`
// the analyzer now supplies, prove the reference lowers to the enum's own member, not a refusal.

const span = { file: 'lib/pages/pairing_page.dart', line: 40, column: 3 } as const;

function enumDecl(id: string, name: string, values: readonly string[]): AnyUirNode {
  return { id, kind: 'logic.EnumDecl', span, name, values } as unknown as AnyUirNode;
}

function enumRef(id: string, name: string, target: string): Record<string, unknown> {
  return { id, kind: 'logic.Ref', span, name, target, type: { library: `package:app/${name.split('.')[0]}`, name: name.split('.')[0] } };
}

function component(id: string, name: string, render: Record<string, unknown>): AnyUirNode {
  return { id, kind: 'ui.Component', span, name, render } as unknown as AnyUirNode;
}

function text(id: string, value: Record<string, unknown>): Record<string, unknown> {
  return { id, kind: 'ui.Text', span, value: { id: `${id}-b`, kind: 'bind.Expr', span, expr: value } };
}

describe('an application enum constant lowers to its own member (M8-D)', () => {
  it('emits the constant’s name as a string literal, not a refused reference', () => {
    const nodes: AnyUirNode[] = [
      enumDecl('stage-decl', 'Stage', ['loading', 'idle', 'ready']),
      component('comp', 'W', text('t1', enumRef('r1', 'Stage.ready', 'stage-decl'))),
    ];
    const { context, reported } = harness(nodes);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const source = fileAt(files, 'src/components/w.tsx') ?? '';
    expect(source).toContain("'ready'");
  });

  it('two different enums with the same member name never collapse into one literal by accident', () => {
    const nodes: AnyUirNode[] = [
      enumDecl('a-decl', 'EnumA', ['ready']),
      enumDecl('b-decl', 'EnumB', ['ready']),
      component(
        'comp',
        'W',
        { id: 'root', kind: 'ui.Element', span, component: { name: 'Column', userDefined: false }, children: [
          text('t1', enumRef('r1', 'EnumA.ready', 'a-decl')),
          text('t2', enumRef('r2', 'EnumB.ready', 'b-decl')),
        ] },
      ),
    ];
    const { context, reported } = harness(nodes);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const source = fileAt(files, 'src/components/w.tsx') ?? '';
    // Both lower to the same literal — that is expected and correct (each is compared only within its
    // own enum's type in valid Dart) — the identity distinction that matters is upstream, at the
    // analyzer's own `target` resolution (dart/bridge_analyzer's own M8-D tests assert that directly).
    expect(source.match(/'ready'/g)?.length).toBe(2);
  });

  it('an unresolved reference (no target) is still refused, not silently accepted', () => {
    const nodes: AnyUirNode[] = [
      component('comp', 'W', text('t1', { id: 'r1', kind: 'logic.Ref', span, name: 'Stage.unknown', type: { name: 'Stage' } })),
    ];
    const { context, reported } = harness(nodes);
    reactGenerator.generate(context);
    expect(reported.some((d) => d.severity === 'error' && d.code === 'BRG3006')).toBe(true);
  });
});
