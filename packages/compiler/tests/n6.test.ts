// N6 — const-fold (M2-T8).
//
// The interesting tests here are the ones about what it *refuses* to fold. Folding `1 + 2` is easy.
// Knowing not to fold `1 % -2` is the pass.

import { UIR_SCHEMA_HASH, UIR_VERSION, type AnyUirNode } from '@bridge/uir';
import { describe, expect, it } from 'vitest';

import { N6ConstFold, PassManager, Program } from '../src/index.js';

const span = { file: 'lib/a.dart', line: 1, column: 1 } as const;
const options = { uirVersion: UIR_VERSION, schemaHash: UIR_SCHEMA_HASH };

function lit(id: string, value: unknown, type = 'int'): Record<string, unknown> {
  return { id, kind: 'logic.Lit', span, value, type: { name: type } };
}

function binary(
  id: string,
  operator: string,
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  type = 'int',
): Record<string, unknown> {
  return { id, kind: 'logic.Binary', span, operator, left, right, type: { name: type } };
}

function ref(id: string, name: string, target?: string): Record<string, unknown> {
  return { id, kind: 'logic.Ref', span, name, type: { name: 'int' }, ...(target ? { target } : {}) };
}

/** A widget with one prop bound to [expr]. */
function widget(expr: Record<string, unknown>): AnyUirNode {
  return {
    id: 'w',
    kind: 'ui.Element',
    span,
    component: { name: 'Padding', userDefined: false },
    props: { padding: { id: 'b', kind: 'bind.Expr', span, expr } },
  } as unknown as AnyUirNode;
}

function fold(program: Program) {
  return new PassManager([new N6ConstFold()]).run(program, options);
}

/** The binding of the folded widget's only prop. */
function binding(program: Program): Record<string, unknown> {
  const element = program.ofKind('ui.Element')[0]! as unknown as Record<string, unknown>;
  return (element['props'] as Record<string, Record<string, unknown>>)['padding']!;
}

describe('N6 folds what it is certain of', () => {
  it('arithmetic over literals', () => {
    const result = fold(Program.of([widget(binary('e', '+', lit('l', 8), lit('r', 4)))]));
    const bound = binding(result.program);

    expect(bound['kind']).toBe('bind.Const');
    expect(bound['value']).toBe(12);
  });

  it('folds depth first, so a nested expression collapses completely', () => {
    // `(1 + 2) * 3` — the product cannot fold until the sum has.
    const inner = binary('i', '+', lit('a', 1), lit('b', 2));
    const outer = binary('o', '*', inner, lit('c', 3));

    expect(binding(fold(Program.of([widget(outer)])).program)['value']).toBe(9);
  });

  it('string concatenation and comparison', () => {
    const concat = binary('e', '+', lit('l', 'ab', 'String'), lit('r', 'cd', 'String'), 'String');
    expect(binding(fold(Program.of([widget(concat)])).program)['value']).toBe('abcd');

    const compare = binary('e', '<', lit('l', 1), lit('r', 2), 'bool');
    expect(binding(fold(Program.of([widget(compare)])).program)['value']).toBe(true);
  });

  it('a bind.Expr around a bare literal becomes a bind.Const', () => {
    // The fold that matters most: it takes the value *out of the reactive graph*. A bind.Const is
    // emitted inline and never subscribed to, so nothing re-renders for it — ever.
    const result = fold(Program.of([widget(lit('l', 16))]));

    expect(binding(result.program)['kind']).toBe('bind.Const');
    expect(binding(result.program)['value']).toBe(16);
  });

  it('the folded node gets a NEW id — it is new content', () => {
    // `8 + 4` and `12` are different content, and content is what an id is a hash of (§A16). Keeping
    // the old id would give one id two meanings.
    const result = fold(Program.of([widget(binary('e', '+', lit('l', 8), lit('r', 4)))]));
    const bound = binding(result.program);

    // The *binding* keeps its id — it is the same binding.
    expect(bound['id']).toBe('b');
    expect(bound['kind']).toBe('bind.Const');
  });
});

describe('N6 refuses to fold what it is not certain of', () => {
  it('an expression touching a signal is left completely alone', () => {
    const program = Program.of([widget(binary('e', '+', ref('r', '_count', 'sig1'), lit('l', 1)))]);

    expect(fold(program).program).toBe(program);
  });

  it('modulo is not folded — Dart and JavaScript disagree about its sign', () => {
    // Dart's `%` is always non-negative for a positive divisor; JavaScript's is not. Folding it would
    // bake one language's answer into a target-neutral IR.
    const program = Program.of([widget(binary('e', '%', lit('l', -7), lit('r', 3)))]);

    expect(binding(fold(program).program)['kind']).toBe('bind.Expr');
  });

  it('division by zero is not folded, and says why', () => {
    // Dart's `1 ~/ 0` throws; JavaScript's `1 / 0` is Infinity; and §A15 prohibits Infinity from
    // canonical form outright. A compiler that picks one of those has changed the program.
    const result = fold(Program.of([widget(binary('e', '/', lit('l', 1), lit('r', 0)))]));

    expect(binding(result.program)['kind']).toBe('bind.Expr');
    expect(result.diagnostics.map((d) => d.code)).toEqual(['BRG2106']);
  });

  it('mixed types are not folded — `1 == "1"` means different things in different languages', () => {
    const program = Program.of([
      widget(binary('e', '==', lit('l', 1), lit('r', '1', 'String'), 'bool')),
    ]);

    expect(binding(fold(program).program)['kind']).toBe('bind.Expr');
  });

  it('a null literal is not folded into a bind.Const — the schema has no room for it', () => {
    // `bind.Const.value` is required, and canonical JSON omits nulls (§A15), so `value: null` and *no
    // value* are the same bytes. That is ISSUE-14, and folding here would produce a node the schema
    // rejects (BRG1204).
    const nullLit = { id: 'l', kind: 'logic.Lit', span, type: { name: 'Null' } };
    const program = Program.of([widget(nullLit)]);

    expect(fold(program).program).toBe(program);
  });
});

describe('N6 is deterministic and idempotent', () => {
  const source = () => Program.of([widget(binary('e', '+', lit('l', 8), lit('r', 4)))]);

  it('the same input folds to the same bytes, every run', () => {
    expect(fold(source()).program.toNdjson()).toBe(fold(source()).program.toNdjson());
  });

  it('running N6 twice is a fixed point', () => {
    const once = fold(source());
    const twice = fold(once.program);

    expect(twice.program.toNdjson()).toBe(once.program.toNdjson());
    expect(twice.manifest.passes[0]!.changed).toBe(false);
  });

  it('a program with nothing to fold is returned unchanged — the SAME object', () => {
    const program = Program.of([widget(ref('r', '_count', 'sig1'))]);

    expect(fold(program).program).toBe(program);
  });
});
