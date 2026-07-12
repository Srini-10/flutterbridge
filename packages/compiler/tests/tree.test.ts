// `mapTree` — the one tree rewrite every rewriting pass is built on.
//
// These tests exist because five passes used to hand-roll this, five times. The contract below is what
// the fixed-point check *is*: `manifest.changed` is a pointer comparison, so a rewrite that returns a
// deep-equal copy instead of the identical object would make every pass look like it changed the
// program, forever, and the pipeline would never be seen to converge.

import { describe, expect, it } from 'vitest';

import { mapTree } from '../src/internal/normalize/tree.js';

const leaf = (id: string, kind = 'ui.Text') => ({ id, kind });

describe('the same-object contract', () => {
  it('returns the IDENTICAL object when the visitor changes nothing', () => {
    // Not deep equality — identity. This is the whole basis of the fixed-point check.
    const tree = { kind: 'ui.Element', children: [leaf('a'), leaf('b')], slots: { body: leaf('c') } };

    expect(mapTree(tree, {})).toBe(tree);
    expect(mapTree(tree, { node: () => undefined })).toBe(tree);
    expect(mapTree(tree, { item: () => undefined, prune: () => undefined })).toBe(tree);
  });

  it('returns the identical ARRAY when no item changed', () => {
    const children = [leaf('a'), leaf('b')];
    const tree = { kind: 'ui.Element', children };

    expect((mapTree(tree, {}) as typeof tree).children).toBe(children);
  });

  it('rebuilds only the spine that changed — untouched siblings keep their identity', () => {
    const keep = leaf('keep');
    const tree = { kind: 'ui.Element', children: [leaf('drop'), keep] };

    const out = mapTree(tree, {
      node: (n) => (n['id'] === 'drop' ? { ...n, id: 'dropped' } : undefined),
    }) as typeof tree;

    expect(out).not.toBe(tree);
    expect(out.children[1]).toBe(keep);
  });
});

describe('the node hook runs bottom-up', () => {
  it('a child is visited before its parent', () => {
    // `(1 + 2) * 3` must fold the sum before it is asked to fold the product; an inner `ui.Cond` must
    // collapse before the outer one is asked whether it can.
    const seen: string[] = [];
    const tree = { kind: 'outer', id: 'o', child: { kind: 'inner', id: 'i' } };

    mapTree(tree, {
      node: (n) => {
        seen.push(String(n['id']));
        return undefined;
      },
    });

    expect(seen).toEqual(['i', 'o']);
  });

  it('a parent sees its children already rewritten', () => {
    const tree = { kind: 'outer', id: 'o', child: { kind: 'inner', id: 'i' } };

    const out = mapTree(tree, {
      node: (n) =>
        n['kind'] === 'inner'
          ? { ...n, rewritten: true }
          : n['kind'] === 'outer'
            ? { ...n, sawRewrittenChild: (n['child'] as Record<string, unknown>)['rewritten'] === true }
            : undefined,
    }) as Record<string, unknown>;

    expect(out['sawRewrittenChild']).toBe(true);
  });
});

describe('a node may only vanish inside a list', () => {
  it('`item` splices several nodes in where one stood', () => {
    const tree = { kind: 'sig.Action', body: [leaf('block'), leaf('z')] };

    const out = mapTree(tree, {
      item: (i) =>
        (i as Record<string, unknown>)['id'] === 'block' ? [leaf('s1'), leaf('s2')] : undefined,
    }) as typeof tree;

    expect(out.body.map((n) => n.id)).toEqual(['s1', 's2', 'z']);
  });

  it('`item` returning [] removes it', () => {
    const tree = { kind: 'sig.Action', body: [leaf('gone'), leaf('kept')] };

    const out = mapTree(tree, {
      item: (i) => ((i as Record<string, unknown>)['id'] === 'gone' ? [] : undefined),
    }) as typeof tree;

    expect(out.body.map((n) => n.id)).toEqual(['kept']);
  });
});

describe('`prune` does not descend — and that is the point', () => {
  it('a pruned subtree is NEVER visited', () => {
    // The behaviour N7 depends on. A `ui.Cond` that can never render is dropped whole, and nothing
    // inside it is visited — because visiting it means reporting diagnostics about code that is about to
    // stop existing. A warning pointing inside a branch that cannot render is worse than no warning.
    const visited: string[] = [];
    const tree = {
      kind: 'ui.Element',
      children: [
        { id: 'dead', kind: 'ui.Cond', then: { id: 'buried', kind: 'ui.Text' } },
        { id: 'live', kind: 'ui.Text' },
      ],
    };

    mapTree(tree, {
      prune: (i) => ((i as Record<string, unknown>)['id'] === 'dead' ? [] : undefined),
      node: (n) => {
        visited.push(String(n['id']));
        return undefined;
      },
    });

    expect(visited).not.toContain('buried');
    expect(visited).not.toContain('dead');
    expect(visited).toContain('live');
  });

  it('`prune` wins over `item` — the item hook never sees a pruned node', () => {
    const seen: string[] = [];
    const tree = { kind: 'ui.Element', children: [leaf('a')] };

    const out = mapTree(tree, {
      prune: () => [],
      item: (i) => {
        seen.push(String((i as Record<string, unknown>)['id']));
        return undefined;
      },
    }) as typeof tree;

    expect(out.children).toEqual([]);
    expect(seen).toEqual([]);
  });
});
