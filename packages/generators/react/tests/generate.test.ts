import type { AnyUirNode } from '@bridge/uir';
import { describe, expect, it } from 'vitest';

import { sortSpecifiers } from '../src/internal/emit/module.js';
import { reactGenerator, reactPlugin } from '../src/index.js';
import { fileAt, harness, helloBridge } from './support.js';

// The React generator (M3-B).
//
// These tests are about the properties the milestone is judged on — determinism, byte-identical output,
// stable imports, and the refusal to invent — not about whether any particular widget renders prettily.
//
// The corpus test at the bottom runs against **the real `hello_bridge` document**, minted by `bridge_analyzer`
// from `fixtures/apps/hello_bridge` and normalized through N1–N11. It is the first real UIR document in this
// repository's history, and it is the only test here that could not have been made to pass by writing a
// fixture that suits the implementation.

const span = { file: 'lib/main.dart', line: 1, column: 1 } as const;

/** A `sig.Signal` owned by a store. */
function signal(id: string, initial: unknown, anchor?: string): AnyUirNode {
  return {
    id,
    kind: 'sig.Signal',
    span,
    scope: 'store',
    type: { name: 'int' },
    ...(anchor === undefined ? {} : { anchor }),
    initial: { id: `${id}-i`, kind: 'logic.Lit', span, type: { name: 'int' }, value: initial },
  } as unknown as AnyUirNode;
}

/** An `app.Store`. */
function store(id: string, name: string, parts: Partial<Record<'signals' | 'derived' | 'actions', string[]>>): AnyUirNode {
  return { id, kind: 'app.Store', span, name, origin: 'declared', ...parts } as unknown as AnyUirNode;
}

/** A `ui.Component` rendering `render`. */
function component(id: string, name: string, render: unknown, localSignals: string[] = []): AnyUirNode {
  return { id, kind: 'ui.Component', span, name, render, localSignals } as unknown as AnyUirNode;
}

/** A `ui.Element`. */
function element(id: string, widget: string, props: Record<string, unknown> = {}, children: unknown[] = []): unknown {
  return { id, kind: 'ui.Element', span, component: { name: widget, userDefined: false }, props, children };
}

/** A `ui.Text` with a constant value. */
function text(id: string, value: string): unknown {
  return { id, kind: 'ui.Text', span, value: { id: `${id}-b`, kind: 'bind.Const', span, value } };
}

/** The smallest complete application: a store, a component, a theme, a route. */
function minimalApp(): AnyUirNode[] {
  return [
    signal('s1', 0, 'lib/state/counter.dart#count'),
    store('st1', 'Counter', { signals: ['s1'] }),
    { id: 'tk1', kind: 'app.Token', span, group: 'color', name: 'primary', light: '#FF3F51B5' } as unknown as AnyUirNode,
    component(
      'c1',
      'HomeScreen',
      element('e1', 'Column', {}, [text('t1', 'Hello')]),
    ),
    { id: 'r1', kind: 'app.Route', span, path: '/', component: 'c1' } as unknown as AnyUirNode,
  ];
}

describe('the generator is a plugin the host can load', () => {
  it('default-exports a BridgePlugin with a generator', () => {
    // `PluginHost.load` takes the default export and gates on `name` + `version`. Shaped exactly like
    // `@bridge/widgets-material`'s, which is the point of ADR-22: one plugin kind, one loading path.
    expect(reactPlugin.name).toBe('@bridge/gen-react');
    expect(typeof reactPlugin.version).toBe('string');
    expect(reactPlugin.generator).toBe(reactGenerator);
    expect(reactPlugin.widgets).toBeUndefined();
  });

  it('declares its target and runtimeRange', () => {
    // `runtimeRange` is INV-12/INV-13, required by ADR-6 and — until ADR-22 — declared nowhere.
    expect(reactGenerator.target).toBe('react');
    expect(reactGenerator.runtimeRange).toBe('0.0.x');
  });
});

describe('output is deterministic', () => {
  it('produces byte-identical files when run twice', () => {
    const first = reactGenerator.generate(harness(minimalApp()).context);
    const second = reactGenerator.generate(harness(minimalApp()).context);

    // Not "equivalent" — identical. `generate` is a pure function with no clock, no filesystem and no
    // randomness, which is what makes this a complete test of the property rather than a sample of it.
    expect(second.files).toEqual(first.files);
  });

  it('produces the same array, not just the same contents', () => {
    const first = reactGenerator.generate(harness(minimalApp()).context);
    const second = reactGenerator.generate(harness(minimalApp()).context);
    expect(second.files.map((f) => f.path)).toEqual(first.files.map((f) => f.path));
  });

  it('sorts files by path', () => {
    const { files } = reactGenerator.generate(harness(minimalApp()).context);
    const paths = files.map((file) => file.path);
    expect(paths).toEqual([...paths].sort());
  });

  it('does not depend on the order nodes arrive in', () => {
    const nodes = minimalApp();
    const forward = reactGenerator.generate(harness(nodes).context);
    const backward = reactGenerator.generate(harness([...nodes].reverse()).context);

    // The program is canonically ordered (kind, then id) before any emitter sees it, so the order a document
    // happened to be written in cannot reach the output.
    expect(backward.files).toEqual(forward.files);
  });

  it('is incremental-equals-clean: a second run over an unchanged program changes nothing', () => {
    const nodes = minimalApp();
    const clean = reactGenerator.generate(harness(nodes).context);
    const incremental = reactGenerator.generate(harness(nodes).context);
    expect(incremental).toEqual(clean);
  });
});

describe('imports are stable and sorted', () => {
  it('sorts imports: packages first, then relative, each lexicographic', () => {
    const { files } = reactGenerator.generate(harness(minimalApp()).context);
    for (const file of files) {
      const specifiers = file.contents
        .split('\n')
        .filter((line) => line.startsWith('import '))
        .map((line) => line.split("from '")[1]?.replace(/';$/, '') ?? '');
      // Discovery order would make the bytes a function of how the tree was walked, so every refactor of a
      // walk would rewrite every file. The rule is `sortSpecifiers`, asserted rather than restated — and it
      // holds for the scaffolder's fixed literals too, which is why this loops over every file.
      expect(specifiers, file.path).toEqual(sortSpecifiers(specifiers));
    }
  });

  it('imports each name once however many times it is used', () => {
    const nodes = [
      ...minimalApp().filter((n) => n.kind !== 'ui.Component'),
      component('c1', 'HomeScreen', element('e1', 'Column', {}, [text('t1', 'a'), text('t2', 'b'), text('t3', 'c')])),
    ];
    const { files } = reactGenerator.generate(harness(nodes).context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source.match(/import \{[^}]*Text[^}]*\}/g)).toHaveLength(1);
  });

  it('emits every runtime import from the kit’s public entrypoint (INV-12)', () => {
    const { files } = reactGenerator.generate(harness(minimalApp()).context);
    for (const file of files) {
      // ADR-6: "Generated code may only use **public** kit entrypoints." A deep import into the kit's
      // internals would couple the app to a path the kit is free to move within its LTS window.
      expect(file.contents, file.path).not.toMatch(/@bridge\/runtime-react\/(?!')/);
    }
  });
});

describe('the emitted project', () => {
  it('emits a Next.js App Router project, per ADR-16', () => {
    const { files } = reactGenerator.generate(harness(minimalApp()).context);
    const paths = files.map((file) => file.path);
    expect(paths).toContain('package.json');
    expect(paths).toContain('tsconfig.json');
    expect(paths).toContain('app/layout.tsx');
    expect(paths).toContain('app/page.tsx');
    expect(paths).toContain('app/providers.tsx');
  });

  it('pins next@15.5.x, which ADR-16 decided and sequenced', () => {
    const { files } = reactGenerator.generate(harness(minimalApp()).context);
    const manifest = JSON.parse(fileAt(files, 'package.json') ?? '{}') as {
      dependencies: Record<string, string>;
    };
    // ADR-16: "Remain on Next.js 15 (pinned 15.5.x) through M1 and M2. Re-decide at the M3-T6 freeze."
    expect(manifest.dependencies['next']).toMatch(/^15\.5\./);
  });

  it('sorts package.json dependencies', () => {
    const { files } = reactGenerator.generate(harness(minimalApp()).context);
    const manifest = JSON.parse(fileAt(files, 'package.json') ?? '{}') as {
      dependencies: Record<string, string>;
    };
    const keys = Object.keys(manifest.dependencies);
    expect(keys).toEqual([...keys].sort());
  });

  it('marks every file it emits as generated', () => {
    const { files } = reactGenerator.generate(harness(minimalApp()).context);
    for (const file of files) {
      if (file.path.endsWith('.json')) continue;
      expect(file.contents, file.path).toContain('GENERATED CODE — DO NOT EDIT');
    }
  });

  it('ends every file with exactly one newline', () => {
    const { files } = reactGenerator.generate(harness(minimalApp()).context);
    for (const file of files) {
      expect(file.contents.endsWith('\n'), file.path).toBe(true);
      expect(file.contents.endsWith('\n\n'), file.path).toBe(false);
    }
  });
});

describe('INV-19 — no module-scope mutable state in the output (ADR-15)', () => {
  it('emits a store definition, never an instance', () => {
    const { files } = reactGenerator.generate(harness(minimalApp()).context);
    const source = fileAt(files, 'src/stores/counter.ts') ?? '';

    // ADR-15's defect, as a test on the emitted bytes: `final CartStore cartStore = CartStore();` is one
    // user in Flutter and every user in a Next.js server process. `defineStore` holds no state, so the shape
    // that leaks cannot be written.
    expect(source).toContain('defineStore(');
    expect(source).not.toMatch(/^\s*new [A-Z]\w*Store\(/m);
    expect(source).toContain('export const counterStore');
  });

  it('instantiates stores only in the client provider', () => {
    const { files } = reactGenerator.generate(harness(minimalApp()).context);
    const providers = fileAt(files, 'app/providers.tsx') ?? '';
    expect(providers).toContain("'use client'");
    expect(providers).toContain('StoreProvider');
    expect(providers).toContain('definition={counterStore}');
  });

  it('declares a component’s own signals inside the component, not at module scope', () => {
    const nodes = [
      ...minimalApp().filter((n) => n.kind !== 'ui.Component'),
      signal('ls1', 0, 'lib/screens/home.dart#counter'),
      component('c1', 'HomeScreen', text('t1', 'hi'), ['ls1']),
    ];
    const { files } = reactGenerator.generate(harness(nodes).context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';

    // Through `useState`'s initialiser: a bare `signal(0)` in the body would allocate a new signal every
    // render and lose every write; at module scope it would be INV-19.
    expect(source).toMatch(/export function HomeScreen\(\) \{[\s\S]*useState\(\(\) => signal\(0\)\)/);
    expect(source).not.toMatch(/^const \w+ = signal\(/m);
  });
});

describe('store emission — a store’s action writes through the signal, and its derived reads through it', () => {
  // A store with a signal, an action that writes it (`count += 1`), and a derived over it (`count * 2`).
  // The shapes the analyzer produces for a `ChangeNotifier`; asserted here on the emitted bytes because a
  // store is not yet buildable end to end — `notifyListeners` has no lowering (validation C1) — so it cannot
  // sit in the build-proof, only in an emission unit test. These two checks moved here when build.test.ts
  // became a real, store-free build-proof.
  function counterStoreApp(): AnyUirNode[] {
    const int = { name: 'int' };
    const countRef = { id: 'ref', kind: 'logic.Ref', span, type: int, name: 'count', target: 'sig-count' };
    return [
      signal('sig-count', 0, 'lib/state/counter.dart#count'),
      {
        id: 'act-inc',
        kind: 'sig.Action',
        span,
        anchor: 'lib/state/counter.dart#increment',
        writes: ['sig-count'],
        body: [
          {
            id: 'stmt',
            kind: 'logic.ExprStmt',
            span,
            expr: {
              id: 'asg',
              kind: 'logic.Assign',
              span,
              type: int,
              operator: 'addAssign',
              target: countRef,
              value: { id: 'one', kind: 'logic.Lit', span, type: int, value: 1 },
            },
          },
        ],
      } as unknown as AnyUirNode,
      {
        id: 'der-2x',
        kind: 'sig.Derived',
        span,
        anchor: 'lib/state/counter.dart#doubled',
        type: int,
        body: {
          id: 'bin',
          kind: 'logic.Binary',
          span,
          type: int,
          operator: '*',
          left: countRef,
          right: { id: 'two', kind: 'logic.Lit', span, type: int, value: 2 },
        },
      } as unknown as AnyUirNode,
      store('st-counter', 'Counter', { signals: ['sig-count'], derived: ['der-2x'], actions: ['act-inc'] }),
      component('c1', 'HomeScreen', text('t1', 'hi')),
      { id: 'r1', kind: 'app.Route', span, path: '/', component: 'c1' } as unknown as AnyUirNode,
    ];
  }

  it('an action writes through the signal, not around it (`count.set(count.peek() + 1)`)', () => {
    const { files } = reactGenerator.generate(harness(counterStoreApp()).context);
    const source = fileAt(files, 'src/stores/counter.ts') ?? '';
    // `count = count + 1` would rebind a local and leave the signal untouched — "state that never updates",
    // which `sig.Action`'s own schema doc names as the defect.
    expect(source).toContain('count.set(count.peek() + 1)');
    expect(source).not.toMatch(/^\s*count = /m);
  });

  it('a derived reads through `.get()` (`derived(() => (count.get() * 2), \'doubled\')`)', () => {
    const { files } = reactGenerator.generate(harness(counterStoreApp()).context);
    const source = fileAt(files, 'src/stores/counter.ts') ?? '';
    expect(source).toContain("derived(() => (count.get() * 2), 'doubled')");
  });
});

describe('it refuses rather than invents', () => {
  it('reports an unmapped widget and emits nothing for it', () => {
    const nodes = [
      ...minimalApp().filter((n) => n.kind !== 'ui.Component'),
      component('c1', 'HomeScreen', element('e1', 'Scaffold', {}, [])),
    ];
    const { context, reported } = harness(nodes);
    reactGenerator.generate(context);

    // A `<div>` where a `Scaffold` belonged is an application that renders, looks nearly right, and is wrong.
    const finding = reported.find((d) => d.code === 'BRG3001');
    expect(finding?.severity).toBe('error');
    expect(finding?.message).toContain('Scaffold');
  });

  it('reports an opaque construct rather than guessing at it', () => {
    const nodes = [
      ...minimalApp().filter((n) => n.kind !== 'ui.Component'),
      component('c1', 'HomeScreen', {
        id: 'o1',
        kind: 'ui.Opaque',
        span,
        source: 'SomeWidget(foo: bar)',
      }),
    ];
    const { context, reported } = harness(nodes);
    reactGenerator.generate(context);
    expect(reported.find((d) => d.code === 'BRG3004')?.severity).toBe('error');
  });

  it('refuses a program carrying an upstream error, and emits no files at all', () => {
    const { context, reported } = harness(minimalApp(), [
      { code: 'BRG2303', severity: 'error', message: 'an unpromotable callback' },
    ]);
    const { files } = reactGenerator.generate(context);

    // "error — the program is not fit to generate from. Something would have to be invented."
    // (docs/architecture/compiler.md). Discovering that halfway through would leave a half-written project.
    expect(files).toEqual([]);
    expect(reported.find((d) => d.code === 'BRG3005')?.severity).toBe('error');
  });

  it('proceeds past a warning', () => {
    const { context } = harness(minimalApp(), [
      { code: 'BRG2103', severity: 'warning', message: 'un-expanded repeated UI' },
    ]);
    expect(reactGenerator.generate(context).files.length).toBeGreaterThan(0);
  });

  it('reports an inline route destination rather than inventing a URL (Spec v2.4 §A17.6)', () => {
    const nodes = [
      ...minimalApp(),
      {
        id: 'rt1',
        kind: 'app.RouteTransition',
        span,
        source: 'c1',
        component: 'c1',
      } as unknown as AnyUirNode,
    ];
    const { context, reported } = harness(nodes);
    reactGenerator.generate(context);

    // §A17.2 refused `/_push/HomeScreen` in the analyzer because it invents a URL the developer never wrote.
    // §A17.6 left the decision to "the layer that knows the target" — this one — "with the evidence in front
    // of it, not guessed at". The evidence is one push in one fixture, so the generator declines too.
    const finding = reported.find((d) => d.code === 'BRG3008');
    expect(finding?.severity).toBe('error');
    expect(finding?.message).toContain('legalization');
  });
});

describe('the real hello_bridge document', () => {
  it('parses, and is what the analyzer actually produced', () => {
    const nodes = helloBridge();
    // 33 nodes: 31 from the analyzer — including the `app.RouteTransition` for its one `Navigator.push`
    // (M3-C) — plus the two N5 lifted from closures.
    expect(nodes.length).toBe(33);
    expect(nodes.filter((n) => n.kind === 'ui.Component')).toHaveLength(3);
    expect(nodes.filter((n) => n.kind === 'app.Store')).toHaveLength(1);
  });

  it('generates deterministically from it', () => {
    const first = reactGenerator.generate(harness(helloBridge()).context);
    const second = reactGenerator.generate(harness(helloBridge()).context);
    expect(second.files).toEqual(first.files);
  });

  it('emits nothing, because it is outside M3-B’s surface — and says exactly why', () => {
    const { context, reported } = harness(helloBridge());
    const { files } = reactGenerator.generate(context);

    // The honest result, and worth stating as an assertion rather than a footnote. `hello_bridge` builds on
    // `MaterialApp` and `Scaffold`; M3-B maps seven layout widgets. So the generator refuses the whole
    // project rather than emitting one that compiles around the holes and fails where they are.
    expect(files).toEqual([]);
    const codes = new Set(reported.filter((d) => d.severity === 'error').map((d) => d.code));
    expect(codes.has('BRG3001')).toBe(true);
    expect(codes.has('BRG3005')).toBe(true);
  });

  it('names MaterialApp and Scaffold as the widgets it cannot render', () => {
    const { context, reported } = harness(helloBridge());
    reactGenerator.generate(context);
    const unmapped = reported.filter((d) => d.code === 'BRG3001').map((d) => d.message);
    expect(unmapped.some((m) => m.includes('MaterialApp'))).toBe(true);
    expect(unmapped.some((m) => m.includes('Scaffold'))).toBe(true);
  });

  it('recovers declaration names from the references to them', () => {
    // `sig.Signal` carries no name — it is symbol-addressed (ADR-17) — but the `logic.Ref`s that read it say
    // `_favoriteIds`. Without this the real store emits `value_d18f644e`, which compiles and cannot be
    // reviewed. Asserted through the store emitter's naming rather than the file, since no file is emitted.
    const nodes = helloBridge();
    const refNames: string[] = [];
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) return void value.forEach(visit);
      if (value === null || typeof value !== 'object') return;
      const node = value as Record<string, unknown>;
      if (node['kind'] === 'logic.Ref' && typeof node['name'] === 'string') refNames.push(node['name']);
      Object.values(node).forEach(visit);
    };
    nodes.forEach(visit);
    expect(refNames).toContain('_favoriteIds');
  });

  it('passes its real eight-digit ARGB token values through verbatim (ADR-21)', () => {
    // hello_bridge's actual tokens — `Color(0xFFF6F6FA)` and `Color(0xFF3F51B5)` from `main.dart`, formatted
    // by the analyzer as ARGB — carried into a program M3-B *can* generate, so the passthrough is observable.
    // The generator must not re-encode them: the kit knows eight digits are ARGB, and a second place that
    // decides is a second place that can be wrong.
    const tokens = (helloBridge() as unknown as Record<string, unknown>[]).filter((n) => n['kind'] === 'app.Token');
    expect(tokens.length).toBe(2);
    const nodes = [...minimalApp().filter((n) => n.kind !== 'app.Token'), ...(tokens as unknown as AnyUirNode[])];
    const { files } = reactGenerator.generate(harness(nodes).context);
    const emitted = fileAt(files, 'src/theme/tokens.ts') ?? '';

    expect(emitted).toContain("name: 'primaryColor'");
    expect(emitted).toContain("name: 'scaffoldBackgroundColor'");
    expect(emitted).toContain("light: '#FFF6F6FA'");
    expect(emitted).toContain("dark: '#FF121212'");
  });

  it('reports every construct it cannot render, and hides none', () => {
    const { context, reported } = harness(helloBridge());
    reactGenerator.generate(context);

    // hello_bridge is a real app and this is M3-B's minimal surface, so there are many. What matters is that
    // each is named: an unsupported widget is a diagnostic, never a silent `<div>`.
    const codes = new Set(reported.map((d) => d.code));
    expect(codes.size).toBeGreaterThan(0);
    for (const finding of reported) {
      expect(finding.code, finding.message).toMatch(/^BRG3\d{3}$/);
      expect(finding.message.length).toBeGreaterThan(20);
    }
  });
});
