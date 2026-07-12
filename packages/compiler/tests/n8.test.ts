// N8 — extract-slots (M2-T10B).
//
// Verification first. The most important test in this file is the one that asserts N8 does *nothing*.

import { UIR_SCHEMA_HASH, UIR_VERSION, type AnyUirNode } from '@bridge/uir';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  N6ConstFold,
  N7FlattenWrappers,
  N8ExtractSlots,
  PassManager,
  PipelineError,
  PluginHost,
  Program,
  WidgetRegistry,
} from '../src/index.js';

const span = { file: 'lib/a.dart', line: 1, column: 1 } as const;
const FLUTTER = 'package:flutter/src/widgets/framework.dart';

let material: WidgetRegistry;

beforeAll(async () => {
  material = WidgetRegistry.from((await PluginHost.load(['@bridge/widgets-material'])).plugins);
});

function text(id: string): Record<string, unknown> {
  return { id, kind: 'ui.Text', span, value: { id: `${id}-b`, kind: 'bind.Const', span, value: 'x' } };
}

/** A `ui.Element` built exactly as given — canonical or not. */
function element(id: string, name: string, parts: Record<string, unknown> = {}): AnyUirNode {
  return {
    id,
    kind: 'ui.Element',
    span,
    component: { name, library: FLUTTER, userDefined: false },
    ...parts,
  } as unknown as AnyUirNode;
}

/** A `bind.Expr` holding a list of constructor calls — a widget list buried in props. */
function buriedList(id: string): Record<string, unknown> {
  return {
    id,
    kind: 'bind.Expr',
    span,
    expr: {
      id: `${id}-l`,
      kind: 'logic.ListLit',
      span,
      type: { name: 'List<Widget>' },
      elements: [
        { id: `${id}-n`, kind: 'logic.New', span, typeName: 'IconButton', type: { name: 'IconButton' } },
      ],
    },
  };
}

function run(program: Program, widgets = material) {
  return new PassManager([
    new N6ConstFold(),
    new N7FlattenWrappers(),
    new N8ExtractSlots(),
  ]).run(program, { uirVersion: UIR_VERSION, schemaHash: UIR_SCHEMA_HASH, widgets });
}

describe('verification — a canonical program is returned untouched', () => {
  it('a canonical Scaffold passes silently, and N8 returns the SAME object', () => {
    // The most important assertion in this file. For a canonical Flutter program, N8 looks, finds
    // nothing to do, and hands back exactly what it was given: no allocations, no rewrites.
    const program = Program.of([
      element('s', 'Scaffold', {
        slots: { appBar: element('a', 'AppBar', { children: [text('t1')] }), body: text('t2') },
      }),
    ]);

    const result = run(program);

    expect(result.program).toBe(program);
    expect(result.diagnostics).toEqual([]);
  });

  it('a widget the catalog has never heard of is silent — not a violation', () => {
    // `SeparatedRow` is in nobody's Material catalog. A slot we have no metadata for is a *gap*, which
    // is a different thing from a *violation*, and it must not be reported as one.
    const program = Program.of([
      element('u', 'SeparatedRow', { slots: { header: text('t') } }),
    ]);

    const result = run(program);

    expect(result.program).toBe(program);
    expect(result.diagnostics).toEqual([]);
  });

  it("an element with a catalog children property, correctly in `children`, is untouched", () => {
    const program = Program.of([
      element('c', 'CustomScrollView', { children: [text('a'), text('b')] }),
    ]);

    expect(run(program).program).toBe(program);
  });
});

describe('verification — genuine invariant violations are reported', () => {
  it('a widget list buried in props is BRG2110, and is NOT repaired', () => {
    // It cannot be repaired here: rebuilding elements from expressions loses the const/signal/param
    // classification of every prop, which needs the resolved scope and exists only in the frontend.
    const program = Program.of([
      element('a', 'AppBar', { props: { actions: buriedList('p') } }),
    ]);

    const result = run(program);

    expect(result.diagnostics.map((d) => d.code)).toEqual(['BRG2110']);
    expect(result.diagnostics[0]!.severity).toBe('error');
    expect(result.program).toBe(program);
  });

  it('a name assigned as both a slot and a prop is BRG2111', () => {
    const program = Program.of([
      element('s', 'Scaffold', {
        slots: { body: text('t') },
        props: { body: { id: 'p', kind: 'bind.Const', span, value: 1 } },
      }),
    ]);

    expect(run(program).diagnostics.map((d) => d.code)).toContain('BRG2111');
  });

  it('a slot the catalog does not declare for a KNOWN widget is BRG2112', () => {
    const program = Program.of([
      element('s', 'Scaffold', { slots: { somethingElse: text('t') } }),
    ]);

    const result = run(program);

    expect(result.diagnostics.map((d) => d.code)).toEqual(['BRG2112']);
    expect(result.diagnostics[0]!.severity).toBe('warning');
  });

  it('children in BOTH `children` and the catalog children slot is BRG2113 — and nothing is guessed', () => {
    // Which comes first is not recoverable, and child order is what the user sees.
    const program = Program.of([
      element('c', 'CustomScrollView', {
        children: [text('a')],
        slots: { slivers: text('b') },
      }),
    ]);

    const result = run(program);

    expect(result.diagnostics.map((d) => d.code)).toContain('BRG2113');
    expect(result.program).toBe(program);
  });
});

describe('the optional rewrite — lossless, catalog-driven, or not at all', () => {
  it('a UiNode slotted under the widget’s CHILDREN property is lifted into `children`', () => {
    // A frontend that treats every named child as a slot produces exactly this. The node is already a
    // UiNode, and the catalog says `slivers` is where CustomScrollView keeps its ordered children — so
    // moving it loses nothing.
    const program = Program.of([
      element('c', 'CustomScrollView', { slots: { slivers: text('t') } }),
    ]);

    const result = run(program);
    const rewritten = result.program.ofKind('ui.Element')[0]! as unknown as Record<string, unknown>;

    expect(rewritten['children']).toHaveLength(1);
    expect((rewritten['children'] as Record<string, unknown>[])[0]!['id']).toBe('t');
    expect(rewritten['slots']).toBeUndefined();
    expect(result.diagnostics).toEqual([]);
  });

  it('the element keeps its id — it is the same element, with its children where they belong', () => {
    // Re-minting it would orphan every override anchor that addresses it.
    const program = Program.of([
      element('c', 'CustomScrollView', { slots: { slivers: text('t') } }),
    ]);

    expect(run(program).program.ofKind('ui.Element')[0]!.id).toBe('c');
  });

  it('other slots survive the lift', () => {
    const program = Program.of([
      element('a', 'AppBar', { slots: { actions: text('x'), title: text('t') } }),
    ]);

    const rewritten = run(program).program.ofKind('ui.Element')[0]! as unknown as Record<
      string,
      unknown
    >;

    expect(rewritten['children']).toHaveLength(1);
    expect(Object.keys(rewritten['slots'] as Record<string, unknown>)).toEqual(['title']);
  });

  it('the rewrite is idempotent — running it again changes nothing', () => {
    const program = Program.of([
      element('c', 'CustomScrollView', { slots: { slivers: text('t') } }),
    ]);

    const once = run(program);
    const twice = run(once.program);

    expect(twice.program.toNdjson()).toBe(once.program.toNdjson());
    expect(twice.program).toBe(once.program);
  });

  it('with NO catalog loaded, nothing is rewritten and nothing is reported', () => {
    // The compiler does less and says so; it never guesses.
    const program = Program.of([
      element('c', 'CustomScrollView', { slots: { slivers: text('t') } }),
    ]);

    const result = run(program, WidgetRegistry.empty);

    expect(result.program).toBe(program);
    expect(result.diagnostics).toEqual([]);
  });
});

describe('N8 respects the pipeline contract', () => {
  it('requires N7 — a wrapper that flattened away has no slots left to verify', () => {
    expect(() => new PassManager([new N8ExtractSlots()])).toThrow(PipelineError);
    expect(
      () => new PassManager([new N6ConstFold(), new N7FlattenWrappers(), new N8ExtractSlots()]),
    ).not.toThrow();
  });

  it('the same input produces the same bytes, every run', () => {
    const source = () =>
      Program.of([element('c', 'CustomScrollView', { slots: { slivers: text('t') } })]);

    expect(run(source()).program.toNdjson()).toBe(run(source()).program.toNdjson());
  });
});
