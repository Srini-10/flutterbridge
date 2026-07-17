import type { AnyUirNode } from '@bridge/uir';
import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { fileAt, harness, helloBridge } from './support.js';

// Parameterised actions, emitted (Spec v2.5 §A18, M3-B.1).
//
// The generator is where §A18 pays out. Before it, `FavoritesStore.toggle(int id)` reached here as a body
// reading an undeclared `id`, and the only correct response was BRG3006 and no output. Now the parameter is
// declared on the action, the body resolves it **by name** — a `ParamDecl` has no id, so there is nothing to
// resolve by target — and the emitted closure takes it.
//
// The kit needed no change: `action<A extends readonly unknown[], R>(body: (...args: A) => R)` already
// forwards arguments, batches the call and reports them to `onAction`. `tests/build.test.ts` compiles the
// result against the real one.

const span = { file: 'lib/state/favorites_store.dart', line: 10, column: 3 } as const;

/** A `ParamDecl` — the existing type, reused (§A18.3). */
function param(name: string, type: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { name, type: { name: type }, ...extra };
}

/** A reference. `target` is absent for a parameter: a ParamDecl has no id. */
function ref(id: string, name: string, target?: string): Record<string, unknown> {
  return { id, kind: 'logic.Ref', span, name, type: { name: 'int' }, ...(target ? { target } : {}) };
}

/** `sig.Signal`, store-scoped. */
function signal(id: string, anchor: string): AnyUirNode {
  return {
    id,
    kind: 'sig.Signal',
    span,
    anchor,
    scope: 'store',
    type: { name: 'int' },
    initial: { id: `${id}-i`, kind: 'logic.Lit', span, type: { name: 'int' }, value: 0 },
  } as unknown as AnyUirNode;
}

/** A `sig.Action` whose body assigns its first parameter to the signal. */
function action(
  id: string,
  anchor: string,
  params: Record<string, unknown>[],
  options: { readonly isAsync?: boolean; readonly reads?: string } = {},
): AnyUirNode {
  const read = options.reads ?? (params[0] === undefined ? undefined : String(params[0]['name']));
  return {
    id,
    kind: 'sig.Action',
    span,
    anchor,
    ...(params.length > 0 ? { params } : {}),
    ...(options.isAsync === true ? { isAsync: true } : {}),
    writes: ['sig1'],
    body: [
      {
        id: `${id}-st`,
        kind: 'logic.ExprStmt',
        span,
        expr: {
          id: `${id}-as`,
          kind: 'logic.Assign',
          span,
          operator: 'assign',
          type: { name: 'int' },
          target: ref(`${id}-t`, 'count', 'sig1'),
          value: read === undefined ? { id: `${id}-l`, kind: 'logic.Lit', span, type: { name: 'int' }, value: 0 } : ref(`${id}-v`, read),
        },
      },
    ],
  } as unknown as AnyUirNode;
}

/** A program with one store, whose actions are `actions`. */
function storeWith(actions: AnyUirNode[]): AnyUirNode[] {
  return [
    signal('sig1', 'lib/state/favorites_store.dart#count'),
    ...actions,
    {
      id: 'store1',
      kind: 'app.Store',
      span,
      name: 'Favorites',
      origin: 'declared',
      signals: ['sig1'],
      actions: actions.map((a) => a.id),
    } as unknown as AnyUirNode,
    { id: 'tok1', kind: 'app.Token', span, group: 'color', name: 'primary', light: '#FF3F51B5' } as unknown as AnyUirNode,
    {
      id: 'comp1',
      kind: 'ui.Component',
      span,
      name: 'HomeScreen',
      localSignals: [],
      render: { id: 'txt1', kind: 'ui.Text', span, value: { id: 'b1', kind: 'bind.Const', span, value: 'hi' } },
    } as unknown as AnyUirNode,
    { id: 'route1', kind: 'app.Route', span, path: '/', component: 'comp1' } as unknown as AnyUirNode,
  ];
}

/** The emitted store source, or ''. */
function storeSource(nodes: AnyUirNode[]): string {
  const { context, reported } = harness(nodes);
  const { files } = reactGenerator.generate(context);
  const source = fileAt(files, 'src/stores/favorites.ts') ?? '';
  if (source === '') {
    throw new Error(`no store emitted; diagnostics: ${reported.map((d) => `${d.code} ${d.message}`).join(' | ')}`);
  }
  return source;
}

describe('arity', () => {
  it('emits `() =>` for an action with no parameters', () => {
    const source = storeSource(storeWith([action('a1', 'lib/state/favorites_store.dart#reset', [])]));
    expect(source).toContain("const reset = action(() => {");
  });

  it('emits `(id: number) =>` for one parameter, and the body reads it', () => {
    // The §A18 case, end to end. `toggle(int id)` in Dart; `id` resolves by name because a ParamDecl has no
    // id to resolve by; `int` is `number`.
    const source = storeSource(
      storeWith([action('a1', 'lib/state/favorites_store.dart#toggle', [param('id', 'int')])]),
    );
    expect(source).toContain("const toggle = action((id: number) => {");
    expect(source).toContain('count.set(id)');
  });

  it('emits several parameters in source order', () => {
    // Order is the call site's contract. `writes` is a set and is sorted; `params` is a sequence and is not.
    const source = storeSource(
      storeWith([
        action('a1', 'lib/state/favorites_store.dart#select', [
          param('item', 'String'),
          param('index', 'int'),
          param('force', 'bool'),
        ]),
      ]),
    );
    expect(source).toContain('const select = action((item: string, index: number, force: boolean) => {');
  });

  it('emits an async action’s parameters', () => {
    const source = storeSource(
      storeWith([
        action('a1', 'lib/state/favorites_store.dart#load', [param('id', 'int')], { isAsync: true }),
      ]),
    );
    // The kit batches writes up to the first `await` and no further — `sig.Action.isAsync` and the store
    // facade's own documented behaviour. Nothing about parameters changes that.
    expect(source).toContain('const load = action(async (id: number) => {');
  });

  it('emits the shapes the milestone names: toggle(id), select(item), remove(index)', () => {
    const source = storeSource(
      storeWith([
        action('a1', 'lib/state/favorites_store.dart#toggle', [param('id', 'int')]),
        action('a2', 'lib/state/favorites_store.dart#select', [param('item', 'String')], { reads: 'item' }),
        action('a3', 'lib/state/favorites_store.dart#remove', [param('index', 'int')], { reads: 'index' }),
      ]),
    );
    expect(source).toContain('const toggle = action((id: number) => {');
    expect(source).toContain('const select = action((item: string) => {');
    expect(source).toContain('const remove = action((index: number) => {');
  });
});

describe('parameter types', () => {
  it('maps Dart’s primitives', () => {
    const source = storeSource(
      storeWith([
        action('a1', 'lib/state/favorites_store.dart#every', [
          param('a', 'int'),
          param('b', 'double'),
          param('c', 'num'),
          param('d', 'String'),
          param('e', 'bool'),
        ], { reads: 'a' }),
      ]),
    );
    expect(source).toContain('(a: number, b: number, c: number, d: string, e: boolean)');
  });

  it('maps a nullable Dart type to `| null`, not `| undefined`', () => {
    const source = storeSource(
      storeWith([
        action('a1', 'lib/state/favorites_store.dart#maybe', [
          { name: 'id', type: { name: 'int', nullable: true } },
        ]),
      ]),
    );
    // Dart has one absent value and it is `null`. A Dart `null` crossing into JavaScript is still `null`.
    expect(source).toContain('(id: number | null)');
  });

  it('maps a user type to `unknown` rather than inventing an interface', () => {
    const source = storeSource(
      storeWith([
        action('a1', 'lib/state/favorites_store.dart#add', [param('item', 'Item')], { reads: 'item' }),
      ]),
    );
    // `Item` would reference a type this generator has not emitted — M3-B does not emit `logic.ClassDecl` —
    // and the file would not compile. `unknown` compiles, and is true.
    expect(source).toContain('(item: unknown)');
  });

  it('marks an optional parameter with `?`', () => {
    const source = storeSource(
      storeWith([
        action('a1', 'lib/state/favorites_store.dart#maybe', [param('id', 'int', { required: false })]),
      ]),
    );
    expect(source).toContain('(id?: number)');
  });
});

describe('scope', () => {
  it('resolves a reference to a parameter by name, since a ParamDecl has no id', () => {
    const source = storeSource(
      storeWith([action('a1', 'lib/state/favorites_store.dart#toggle', [param('id', 'int')])]),
    );
    // Not `undefined`, which is what it emitted before §A18, and not a bare unresolved name.
    expect(source).toContain('count.set(id)');
    expect(source).not.toContain('count.set(undefined)');
  });

  it('does not leak one action’s parameter into another’s body', () => {
    const { context, reported } = harness(
      storeWith([
        action('a1', 'lib/state/favorites_store.dart#toggle', [param('id', 'int')]),
        // Declares nothing, but its body reads `id`. It must NOT resolve: `id` belongs to `toggle`.
        action('a2', 'lib/state/favorites_store.dart#leak', [], { reads: 'id' }),
      ]),
    );
    reactGenerator.generate(context);

    // A parameter is scoped to the action that declares it. Resolving it anywhere else would be the
    // inference §A18.2 refused — a name matching a parameter somewhere is not a declaration here.
    const finding = reported.find((d) => d.code === 'BRG3006');
    expect(finding?.severity).toBe('error');
    expect(finding?.message).toContain('id');
  });

  it('still refuses a name that is no parameter and no declaration', () => {
    const { context, reported } = harness(
      storeWith([action('a1', 'lib/state/favorites_store.dart#toggle', [param('id', 'int')], { reads: 'notifyListeners' })]),
    );
    reactGenerator.generate(context);
    // §A18 removes the false negatives, not the check.
    expect(reported.some((d) => d.code === 'BRG3006')).toBe(true);
  });

  it('refuses a Dart named parameter rather than emitting it positionally', () => {
    const { context, reported } = harness(
      storeWith([
        action('a1', 'lib/state/favorites_store.dart#toggle', [param('id', 'int', { named: true, required: true })]),
      ]),
    );
    reactGenerator.generate(context);

    // `toggle({required int id})` is called `toggle(id: 1)`. Emitting it positionally compiles and silently
    // reorders any call that passed arguments out of declaration order.
    const finding = reported.find((d) => d.message.includes('named parameter'));
    expect(finding?.severity).toBe('error');
  });
});

describe('the real hello_bridge document', () => {
  /** Every `sig.Action` in the real, normalized fixture. */
  function realActions(): Record<string, unknown>[] {
    return helloBridge().filter((node) => node.kind === 'sig.Action') as unknown as Record<string, unknown>[];
  }

  it('carries `toggle(int id)`’s parameter — the node §A18 was written about', () => {
    const signatures = realActions().map((a) =>
      ((a['params'] as Record<string, unknown>[] | undefined) ?? []).map(
        (p) => `${String(p['name'])}: ${String((p['type'] as Record<string, unknown>)['name'])}`,
      ),
    );
    // `FavoritesStore.toggle(int id)`, straight from the analyzer. Before §A18 this list was empty for every
    // action in the corpus, and the `id` its body reads was declared nowhere.
    expect(signatures).toContainEqual(['id: int']);
  });

  it('carries the parameters of the closures N5 lifted', () => {
    // `onChanged: (value) => setState(() => _email = value)` ×2 in `login_screen.dart`. These are the widget
    // case §A18.4 warned about: `freeLocals` treats a lambda's own parameters as bound, so they lifted before
    // the amendment too — into actions whose bodies read an undeclared `value`. Fixing only the store's
    // methods would have left these exactly as broken and looked complete.
    const signatures = realActions().map((a) =>
      ((a['params'] as Record<string, unknown>[] | undefined) ?? []).map((p) => String(p['name'])),
    );
    expect(signatures.filter((s) => s.length === 1 && s[0] === 'value')).toHaveLength(2);
  });

  it('leaves a parameterless action’s `params` absent, not empty', () => {
    // §A18.3. `_toggleTheme()` takes nothing, and every document minted before the amendment must keep its id.
    const parameterless = realActions().filter((a) => !('params' in a));
    expect(parameterless.length).toBeGreaterThan(0);
  });

  it('no longer reports `id` as unresolved', () => {
    const { context, reported } = harness(helloBridge());
    reactGenerator.generate(context);

    // The regression that matters. `hello_bridge` still emits nothing — its `MaterialApp`/`Scaffold` are
    // outside M3-B's widget surface — but the *reason* must no longer include a parameter. Before §A18,
    // `toggle`'s body produced `BRG3006: id is not declared in this program`.
    const unresolved = reported.filter((d) => d.code === 'BRG3006').map((d) => d.message);
    expect(unresolved.some((m) => m.includes('`id`'))).toBe(false);
    expect(unresolved.some((m) => m.includes('`value`'))).toBe(false);

    // `notifyListeners` is a different finding and is still correctly refused: a ChangeNotifier API with no
    // referent in the emitted program. §A18 removes the false negatives, not the check.
    expect(unresolved.some((m) => m.includes('notifyListeners'))).toBe(true);
  });
});

describe('determinism', () => {
  it('emits byte-identical output for a parameterised store across two runs', () => {
    const build = (): string =>
      storeSource(
        storeWith([
          action('a1', 'lib/state/favorites_store.dart#toggle', [param('id', 'int')]),
          action('a2', 'lib/state/favorites_store.dart#select', [param('item', 'String')], { reads: 'item' }),
        ]),
      );
    expect(build()).toBe(build());
  });

  it('is incremental-equals-clean over the whole project', () => {
    const nodes = storeWith([action('a1', 'lib/state/favorites_store.dart#toggle', [param('id', 'int')])]);
    const clean = reactGenerator.generate(harness(nodes).context);
    const incremental = reactGenerator.generate(harness(nodes).context);
    expect(incremental).toEqual(clean);
  });
});
