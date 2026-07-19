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
    expect(reactGenerator.runtimeRange).toBe('^0.1.0');
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

describe('M4-A widget coverage — flex children and Material rules', () => {
  // A screen using the M4-A widgets: Expanded/Spacer/Flexible (slot child / flex prop) and Divider (props).
  // Emission over a hand-built tree; the real analyzer → generator → tsc proof of these lives in build.test.ts.
  function screen(): AnyUirNode[] {
    const slotChild = (id: string, w: string, props: Record<string, unknown>): unknown => ({
      id,
      kind: 'ui.Element',
      span,
      component: { name: w, userDefined: false },
      props,
      slots: { child: text(`${id}-t`, 'x') },
    });
    const c = { name: 'int' };
    const flex2 = { id: 'f2', kind: 'bind.Const', span, value: 2, type: c };
    const row = {
      id: 'row',
      kind: 'ui.Element',
      span,
      component: { name: 'Row', userDefined: false },
      children: [
        slotChild('exp', 'Expanded', { flex: flex2 }),
        { id: 'sp', kind: 'ui.Element', span, component: { name: 'Spacer', userDefined: false } },
        slotChild('flx', 'Flexible', {}),
        {
          id: 'div',
          kind: 'ui.Element',
          span,
          component: { name: 'Divider', userDefined: false },
          props: {
            height: { id: 'h', kind: 'bind.Const', span, value: 8, type: c },
            thickness: { id: 'th', kind: 'bind.Const', span, value: 1, type: c },
          },
        },
      ],
    };
    return [
      ...minimalApp().filter((n) => n.kind !== 'ui.Component' && n.kind !== 'app.Store'),
      // `Divider` declares that it paints `outlineVariant`, and M4-B checks that against the program's own
      // tokens before emitting (BRG3010, INV-20). A real app gets the role from `ColorScheme.fromSeed` via
      // N10; this hand-built program has to state it, which is the point — the requirement is now visible in
      // the fixture instead of being discovered in a browser as BRG4006.
      {
        id: 'tk-ov',
        kind: 'app.Token',
        span,
        group: 'color',
        name: 'outlineVariant',
        role: 'outlineVariant',
        light: '#FFCAC4D0',
      } as unknown as AnyUirNode,
      component('c1', 'HomeScreen', row),
    ];
  }

  it('emits Expanded/Flexible/Spacer as flex children with the child slot as a prop', () => {
    const { files, reported } = ((): { files: readonly { path: string; contents: string }[]; reported: unknown[] } => {
      const h = harness(screen());
      return { files: reactGenerator.generate(h.context).files, reported: h.reported };
    })();
    expect((reported as { severity: string }[]).filter((d) => d.severity === 'error')).toEqual([]);
    const src = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(src).toMatch(/<Expanded flex=\{2\} child=\{<Text>/);
    expect(src).toMatch(/<Spacer \/>/);
    expect(src).toMatch(/<Flexible child=\{<Text>/);
    // All imported from the kit — no dangling reference.
    expect(src).toMatch(/import \{[^}]*\bExpanded\b[^}]*\} from '@bridge\/runtime-react'/);
    expect(src).toMatch(/import \{[^}]*\bSpacer\b[^}]*\} from '@bridge\/runtime-react'/);
  });

  it('emits Divider forwarding only representable props (never a Color)', () => {
    const src = fileAt(reactGenerator.generate(harness(screen()).context).files, 'src/components/home-screen.tsx') ?? '';
    expect(src).toMatch(/<Divider height=\{8\} thickness=\{1\} \/>/);
  });
});

describe('it refuses rather than invents', () => {
  it('reports an unmapped widget and emits nothing for it', () => {
    // `Scaffold` was the widget here until M4-G mapped it. A widget nothing has heard of is the case
    // `BRG3001` is now reserved for — a widget the generator *knows* and cannot render gets `BRG3013` and
    // names the capability — so the fixture uses one that genuinely is not in any catalog.
    const nodes = [
      ...minimalApp().filter((n) => n.kind !== 'ui.Component'),
      component('c1', 'HomeScreen', element('e1', 'ParallaxCarousel', {}, [])),
    ];
    const { context, reported } = harness(nodes);
    reactGenerator.generate(context);

    // A `<div>` where a `ParallaxCarousel` belonged is an application that renders, looks nearly right, and
    // is wrong.
    const finding = reported.find((d) => d.code === 'BRG3001');
    expect(finding?.severity).toBe('error');
    expect(finding?.message).toContain('ParallaxCarousel');
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

    // §A17.2 refused `/_push/HomeScreen` in the analyzer because it invents a URL the developer never wrote,
    // and this generator refuses for the same reason. What it must **not** do is explain itself with a
    // measurement: BRG3008 told users it declined "on the evidence available — one push, in one fixture"
    // for three milestones after M5-A had counted 17 and M6-D counted 62. A message that has to be
    // re-measured to stay true is one nobody re-measures.
    const finding = reported.find((d) => d.code === 'BRG3008');
    expect(finding?.severity).toBe('error');
    // BRG3008 now means what it was always about: an edge in the nav graph that **nothing performs**.
    // An inline push whose call *is* lowered renders through the runtime stack and needs no URL — the
    // missing URL was never the blocker, which is what M7-C established and `RouterOutlet` closed.
    expect(finding?.message).toContain('nothing performs it');
    expect(finding?.message).toContain('logic.Navigate');
    expect(finding?.message).toContain('not a defect in your program');
    // §A17.6, not §A17.2. The URL-invention refusal used to be this diagnostic's whole justification;
    // M7-C established the kit never wanted a URL, so what it cites now is the section saying an inline
    // push legitimately has none.
    expect(finding?.message).toContain('§A17.6');

    // The stale claim, pinned so it cannot return. Any count of programs, pushes or fixtures in a
    // diagnostic is a defect by construction — it describes implementation history, not a capability.
    expect(finding?.message).not.toMatch(/one push|one fixture|evidence available|sample of one/);
  });
});

describe('the real hello_bridge document', () => {
  it('parses, and is what the analyzer actually produced', () => {
    const nodes = helloBridge();
    // 38 nodes: 36 from the analyzer — including the `app.RouteTransition` for its one `Navigator.push`
    // (M3-C) — plus the two N5 lifted from closures.
    //
    // It was 33 until M4-G, and none of the five that appeared is M4-G's doing. The golden was **stale by a
    // milestone**: M4-E taught the analyzer to hoist every literal colour in a widget tree into an
    // `app.Token`, and this fixture is minted from `fixtures/apps/hello_bridge` with no drift guard —
    // `layout_proof.ndjson` has one (`build_proof_test.dart`), this does not, because regenerating it needs
    // the real Flutter SDK and the Dart suite runs against stubs. So the drift was silent. Every added node
    // is an `app.Token`; every other count below is unchanged.
    expect(nodes.length).toBe(38);
    expect(nodes.filter((n) => n.kind === 'ui.Component')).toHaveLength(3);
    expect(nodes.filter((n) => n.kind === 'app.Store')).toHaveLength(1);
  });

  it('generates deterministically from it', () => {
    const first = reactGenerator.generate(harness(helloBridge()).context);
    const second = reactGenerator.generate(harness(helloBridge()).context);
    expect(second.files).toEqual(first.files);
  });

  it('emits nothing — and what stops it is no longer the shell', () => {
    const { context, reported } = harness(helloBridge());
    const { files } = reactGenerator.generate(context);

    // Still refused, and for entirely different reasons than it was before M4-G. Until this milestone the
    // first thing `hello_bridge` hit was `BRG3001` on `MaterialApp` and `Scaffold`: this project's own
    // walking-skeleton could not be compiled because the generator had no mapping for the two widgets every
    // Flutter application is built out of. That is gone — see the assertion below.
    expect(files).toEqual([]);
    const codes = new Set(reported.filter((d) => d.severity === 'error').map((d) => d.code));
    expect(codes.has('BRG3005')).toBe(true);
  });

  it('no longer reports a single unmapped widget — the shell is mapped (M4-G)', () => {
    // The measurement this milestone is judged on. `MaterialApp`, `Scaffold`, `AppBar`, `IconButton` and
    // `TextField` all resolve now; nothing in `hello_bridge`'s widget tree is unknown to the generator.
    const { context, reported } = harness(helloBridge());
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.code === 'BRG3001' && d.severity === 'error')).toEqual([]);
  });

  it('what remains is named precisely, and none of it is a widget mapping', () => {
    // Every blocker left belongs to a different subsystem, and each says which. Asserted as a set so that a
    // regression that re-introduces an unmapped widget — or silently drops one of these — fails here.
    const { context, reported } = harness(helloBridge());
    reactGenerator.generate(context);
    const codes = [...new Set(reported.filter((d) => d.severity === 'error').map((d) => d.code))].sort();
    expect(codes).toEqual([
      // a call with Dart named arguments, whose callee signature the program does not carry
      'BRG3002',
      // `notifyListeners`, `mounted`, `widget` — framework primitives INV-22 should have erased
      'BRG3006',
      // a `FutureBuilder` whose loading and error branches are inside the builder (BRG2104 upstream)
      'BRG3007',
      // `Navigator.push(MaterialPageRoute(...))` — an inline destination with no path (§A17.6)
      'BRG3008',
      // the theme states `primaryColor:`, not a `ColorScheme`, so N10 derives no role set (INV-20)
      'BRG3010',
      // the *call site* of a navigation, which the schema does not link to its `app.RouteTransition`
      'BRG3013',
      // `MaterialApp.themeMode` — switching brightness after mount
      'BRG3016',
      // M6-C: `home: LoginScreen(isDark: …, onToggleTheme: …)` — the route renders a component requiring
      // both, and `app.Route` has no field linking it to the `ui.Element` whose `props` carry them. This
      // fixture *does* hit the gap, which the M6 gap document had recorded the other way round; the
      // emitted `<LoginScreen />` could never have typechecked, and nothing said so until BRG3018.
      'BRG3018',
      // the roll-up: nothing is emitted from a program carrying an error
      'BRG3005',
    ].sort());
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
    // The two the *theme* declares, by name. The other five are M4-E's hoisted literals — `colorFF3F51B5`
    // and friends — which carry the same ARGB encoding but are named after their value rather than after a
    // `ThemeData` parameter. Filtering by name keeps this test about ADR-21's passthrough rather than about
    // how many colours the fixture happens to contain.
    const tokens = (helloBridge() as unknown as Record<string, unknown>[])
      .filter((n) => n['kind'] === 'app.Token' && !String(n['name'] ?? '').startsWith('color'));
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

// ── M4-B: the capability registry ─────────────────────────────────────────────────────────────────
//
// A `WidgetMapping` used to say only which component to render, so everything else the kit component needed
// was invisible to the generator: `Divider` reads the `outlineVariant` role, and an app whose theme had no
// such token compiled cleanly and threw `BRG4006` on first paint. These assert the two requirements that are
// now declared and checked before a byte is emitted.

describe('M4-B declared capabilities are checked before emission', () => {
  /** A one-widget screen, with whatever tokens the case needs. */
  function appWith(widget: unknown, tokens: readonly unknown[]): AnyUirNode[] {
    return [
      ...(tokens as AnyUirNode[]),
      component('c1', 'HomeScreen', widget as ReturnType<typeof element>),
      { id: 'r1', kind: 'app.Route', span, path: '/', component: 'c1' } as unknown as AnyUirNode,
    ];
  }

  const divider = {
    id: 'div',
    kind: 'ui.Element',
    span,
    component: { name: 'Divider', userDefined: false },
    props: {},
  };

  const outlineVariant = {
    id: 'tk-ov',
    kind: 'app.Token',
    span,
    group: 'color',
    name: 'outlineVariant',
    role: 'outlineVariant',
    light: '#FFCAC4D0',
  };

  it('BRG3010 — a widget painting a role the theme does not define is refused (INV-20)', () => {
    const { context, reported } = harness(appWith(divider, []));
    const { files } = reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error');
    expect(errors.some((d) => d.code === 'BRG3010')).toBe(true);
    expect(errors.find((d) => d.code === 'BRG3010')?.message).toContain('outlineVariant');
    // An error means nothing is emitted — a partial project would compile around the hole and fail where it is.
    expect(files).toEqual([]);
  });

  it('BRG3010 passes once the role resolves — by `role`, not only by `name`', () => {
    // The case the name-only index would have missed: a token whose `name` is what the author's ColorScheme
    // parameter was called, carrying the role separately.
    const namedDifferently = { ...outlineVariant, name: 'dividerColor', role: 'outlineVariant' };
    const { context, reported } = harness(appWith(divider, [namedDifferently]));
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('BRG3011 — a fractional Alignment is refused rather than snapped to the nearest keyword', () => {
    const fractional = {
      id: 'al',
      kind: 'ui.Element',
      span,
      component: { name: 'Align', userDefined: false },
      props: {
        alignment: {
          id: 'b1',
          kind: 'bind.Expr',
          span,
          expr: {
            id: 'n1',
            kind: 'logic.New',
            span,
            typeName: 'Alignment',
            type: { name: 'Alignment', library: 'package:flutter/widgets.dart' },
            args: [
              { id: 'x', kind: 'logic.Lit', span, value: 0.3, type: { name: 'double' } },
              {
                id: 'y',
                kind: 'logic.Unary',
                span,
                operator: '-',
                operand: { id: 'y0', kind: 'logic.Lit', span, value: 0.7, type: { name: 'double' } },
                type: { name: 'double' },
              },
            ],
          },
        },
      },
    };
    const { context, reported } = harness(appWith(fractional, []));
    reactGenerator.generate(context);
    const error = reported.find((d) => d.code === 'BRG3011');
    expect(error).toBeDefined();
    // The message states the position it could not express, so the author knows which call site to change.
    expect(error?.message).toContain('Alignment(0.3, -0.7)');
  });

  it('a named Alignment is not refused — every kit constant is discrete by construction', () => {
    const named = {
      id: 'al',
      kind: 'ui.Element',
      span,
      component: { name: 'Align', userDefined: false },
      props: {
        alignment: {
          id: 'b1',
          kind: 'bind.Expr',
          span,
          expr: {
            id: 'r1',
            kind: 'logic.Ref',
            span,
            name: 'Alignment.bottomRight',
            type: { name: 'Alignment', library: 'package:flutter/widgets.dart' },
          },
        },
      },
    };
    const { context, reported } = harness(appWith(named, []));
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const src = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(src).toContain('Alignment.bottomRight');
  });

  it('the unmapped-widget diagnostic lists what is actually supported, not a stale copy', () => {
    const unknown = {
      id: 'u1',
      kind: 'ui.Element',
      span,
      component: { name: 'Mystery', userDefined: false },
      props: {},
    };
    const { context, reported } = harness(appWith(unknown, []));
    reactGenerator.generate(context);
    const error = reported.find((d) => d.code === 'BRG3001');
    expect(error).toBeDefined();
    // Derived from WIDGET_MAP, so it cannot drift the way the hand-kept list did — it named seven widgets
    // while fifteen were supported.
    expect(error?.message).toContain('AspectRatio');
    expect(error?.message).toContain('VerticalDivider');
  });
});

// ── M4-C: the asset pipeline ──────────────────────────────────────────────────────────────────────

describe('M4-C asset collection', () => {
  function appWith(widget: unknown, tokens: readonly unknown[] = []): AnyUirNode[] {
    return [
      ...(tokens as AnyUirNode[]),
      component('c1', 'HomeScreen', widget as ReturnType<typeof element>),
      { id: 'r1', kind: 'app.Route', span, path: '/', component: 'c1' } as unknown as AnyUirNode,
    ];
  }

  const imageWith = (nameBinding: unknown): unknown => ({
    id: 'img',
    kind: 'ui.Element',
    span,
    component: { name: 'Image', constructorName: 'asset', userDefined: false },
    props: { name: nameBinding },
  });

  it('BRG3012 — an asset key that is not a constant is refused, not omitted', () => {
    // Omitting it would leave the manifest short an entry and the app rendering a broken <img>, which looks
    // like a slow network rather than a defect.
    const computed = {
      id: 'b',
      kind: 'bind.Expr',
      span,
      expr: { id: 'r', kind: 'logic.Ref', span, name: 'path', type: { name: 'String' } },
    };
    const { context, reported } = harness(appWith(imageWith(computed)));
    reactGenerator.generate(context);
    const error = reported.find((d) => d.code === 'BRG3012');
    expect(error).toBeDefined();
    expect(error?.severity).toBe('error');
  });

  it('a constant key reaches the manifest, sorted and deduplicated', () => {
    const key = (value: string): unknown => ({ id: `k-${value}`, kind: 'bind.Const', span, value });
    const row = {
      id: 'row',
      kind: 'ui.Element',
      span,
      component: { name: 'Row', userDefined: false },
      children: [
        { ...(imageWith(key('z/last.png')) as object), id: 'i1' },
        { ...(imageWith(key('a/first.png')) as object), id: 'i2' },
        // The same asset twice is one manifest entry: the manifest is a property of the application.
        { ...(imageWith(key('a/first.png')) as object), id: 'i3' },
      ],
    };
    const { files } = reactGenerator.generate(harness(appWith(row)).context);
    const manifest = fileAt(files, 'src/assets/manifest.ts') ?? '';
    const keys = [...manifest.matchAll(/"([^"]+)": "\/assets\//g)].map((match) => match[1]);
    expect(keys).toEqual(['a/first.png', 'z/last.png']);
  });

  it('a program with no assets still emits a manifest, so the scaffold always resolves', () => {
    const { files } = reactGenerator.generate(harness(minimalApp()).context);
    const manifest = fileAt(files, 'src/assets/manifest.ts') ?? '';
    expect(manifest).toContain('export const assetManifest: AssetManifest');
    expect(manifest).toContain('assets: {');
  });
});

// ── M4-E: colours that cannot resolve ─────────────────────────────────────────────────────────────

describe('M4-E colour resolution', () => {
  const box = (colorBinding: unknown): unknown => ({
    id: 'cb',
    kind: 'ui.Element',
    span,
    component: { name: 'ColoredBox', userDefined: false },
    props: { color: colorBinding },
  });

  function appWith(widget: unknown, tokens: readonly unknown[] = []): AnyUirNode[] {
    return [
      ...(tokens as AnyUirNode[]),
      component('c1', 'HomeScreen', widget as ReturnType<typeof element>),
      { id: 'r1', kind: 'app.Route', span, path: '/', component: 'c1' } as unknown as AnyUirNode,
    ];
  }

  it('a resolved colour is a token name, and passes through untouched', () => {
    // The analyzer hoists a constant colour into a token and hands down its name, so by the time the
    // generator sees it there is no colour left to convert — which is why no colour code exists in the
    // emitter at all.
    const { context, reported } = harness(
      appWith(box({ id: 'k', kind: 'bind.Const', span, value: 'colorFF2196F3' }), [
        {
          id: 'tk',
          kind: 'app.Token',
          span,
          group: 'color',
          name: 'colorFF2196F3',
          light: '#FF2196F3',
        } as unknown as AnyUirNode,
      ]),
    );
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(fileAt(files, 'src/components/home-screen.tsx') ?? '').toContain(
      "<ColoredBox color={'colorFF2196F3'} />",
    );
  });

  it('BRG3014 — a runtime-computed colour is refused, not painted from one branch', () => {
    const ternary = {
      id: 'b',
      kind: 'bind.Expr',
      span,
      expr: {
        id: 'c',
        kind: 'logic.Conditional',
        span,
        condition: { id: 'q', kind: 'logic.Lit', span, value: true, type: { name: 'bool' } },
        then: { id: 't', kind: 'logic.Lit', span, value: 1, type: { name: 'int' } },
        otherwise: { id: 'o', kind: 'logic.Lit', span, value: 2, type: { name: 'int' } },
        type: { name: 'Color', library: 'package:flutter/painting.dart' },
      },
    };
    const { context, reported } = harness(appWith(box(ternary)));
    reactGenerator.generate(context);
    const error = reported.find((d) => d.code === 'BRG3014');
    expect(error).toBeDefined();
    // Names the subsystem that owns the work, per §8 — never a generic message.
    expect(error?.message).toContain('belongs to the analyzer');
    expect(error?.message).toContain('INV-20');
  });
});

describe('M6-C — a route whose component requires constructor arguments', () => {
  // The node shapes here are copied from a real `bridge_analyzer` run over the reproduction in
  // `docs/m6/GAP-route-constructor-arguments.md`, not invented: a `ui.Component` with `params`, and an
  // `app.Route` naming it with nothing else. Three tests in this project's history passed against a
  // deliberately broken implementation because the hand-authored graph had the wrong shape.

  /** A route rendering a component that declares `params`, and passing it nothing. */
  function appWithRouteParams(params: readonly Record<string, unknown>[]): AnyUirNode[] {
    return [
      { id: 'tk1', kind: 'app.Token', span, group: 'color', name: 'primary', light: '#FF3F51B5' } as unknown as AnyUirNode,
      {
        id: 'c1',
        kind: 'ui.Component',
        span,
        name: 'CounterPanel',
        params,
        render: element('e1', 'Column', {}, [text('t1', 'Hello')]),
        localSignals: [],
      } as unknown as AnyUirNode,
      { id: 'r1', kind: 'app.Route', span, path: '/', component: 'c1' } as unknown as AnyUirNode,
    ];
  }

  it('is refused rather than emitted as a call with no arguments (BRG3018)', () => {
    // The defect this closes was *silence*: `bridge build` reported success and emitted
    // `<CounterPanel />` against a `CounterPanelProps` requiring `label` and `step`, so the failure
    // surfaced as `TS2739` in generated code the developer is told not to edit.
    const { context, reported } = harness(
      appWithRouteParams([
        { name: 'label', required: true, type: { name: 'String', library: 'dart:core' } },
        { name: 'step', required: true, type: { name: 'int', library: 'dart:core' } },
      ]),
    );
    reactGenerator.generate(context);

    const error = reported.find((d) => d.code === 'BRG3018');
    expect(error).toBeDefined();
    expect(error?.severity).toBe('error');
    // Names both parameters, so the message says what is missing rather than that something is.
    expect(error?.message).toContain('`label`');
    expect(error?.message).toContain('`step`');
    // Names the owning layer and the capability, per §8 — never a generic message. It no longer names an
    // amendment that has landed: `app.Route.arguments` exists, so what is missing is the *recording* of
    // this particular argument, and the message says which layer records one.
    expect(error?.message).toContain('app.Route.arguments');
    expect(error?.message).toContain("the analyzer's route extractor");
  });

  it('emits nothing, because a project that cannot typecheck is worse than no project', () => {
    const { context } = harness(
      appWithRouteParams([{ name: 'label', required: true, type: { name: 'String', library: 'dart:core' } }]),
    );
    expect(reactGenerator.generate(context).files).toHaveLength(0);
  });

  it('does not fire for a component whose parameters are all optional', () => {
    // An optional parameter is satisfied by its own default, so a route that omits it renders exactly what
    // the Flutter program renders. Firing here would refuse programs that are complete.
    const { context, reported } = harness(
      appWithRouteParams([{ name: 'label', required: false, type: { name: 'String', library: 'dart:core' } }]),
    );
    reactGenerator.generate(context);

    expect(reported.find((d) => d.code === 'BRG3018')).toBeUndefined();
  });

  it('does not fire for a route whose component takes no parameters', () => {
    // hello_bridge is this case, which is why it never hit the gap and why the corpus test above still passes.
    const { context, reported } = harness(appWithRouteParams([]));
    reactGenerator.generate(context);

    expect(reported.find((d) => d.code === 'BRG3018')).toBeUndefined();
  });
});

describe('M7-D — a route that records the arguments its construction site passed', () => {
  // `app.Route.arguments` existed in the schema from ADR-0025 D1 and nothing populated it, so BRG3018
  // fired for every required parameter of every routed component. The analyzer populates it now, and this
  // block is the generator half: the field is *used*, so the diagnostic narrows to what is genuinely
  // missing and the page constructs the component with what is there.

  function appWithRouteParams(
    params: readonly Record<string, unknown>[],
    args?: readonly Record<string, unknown>[],
  ): AnyUirNode[] {
    return [
      { id: 'tk1', kind: 'app.Token', span, group: 'color', name: 'primary', light: '#FF3F51B5' } as unknown as AnyUirNode,
      {
        id: 'c1',
        kind: 'ui.Component',
        span,
        name: 'CounterPanel',
        params,
        render: element('e1', 'Column', {}, [text('t1', 'Hello')]),
        localSignals: [],
      } as unknown as AnyUirNode,
      {
        id: 'r1',
        kind: 'app.Route',
        span,
        path: '/',
        component: 'c1',
        ...(args === undefined ? {} : { arguments: args }),
      } as unknown as AnyUirNode,
    ];
  }

  function constArgument(name: string, value: unknown): Record<string, unknown> {
    return { name, transport: 'primitive', binding: { id: `b_${name}`, kind: 'bind.Const', span, value } };
  }

  const required = (name: string, type: string): Record<string, unknown> => ({
    name,
    required: true,
    type: { name: type, library: 'dart:core' },
  });

  it('BRG3018 does not fire when every required parameter has an argument', () => {
    // The whole point. `home: CounterPanel(label: 'Taps', step: 2)` satisfies both parameters, so there is
    // nothing missing and nothing to report — and, because BRG3018 was the only error, a project is
    // emitted where before there was none.
    const { context, reported } = harness(
      appWithRouteParams(
        [required('label', 'String'), required('step', 'int')],
        [constArgument('label', 'Taps'), constArgument('step', 2)],
      ),
    );
    const files = reactGenerator.generate(context).files;

    expect(reported.find((d) => d.code === 'BRG3018')).toBeUndefined();
    expect(files.length).toBeGreaterThan(0);
  });

  it('BRG3018 still fires for the required parameter that has none, and names only that one', () => {
    // Partial coverage is the case that would be easiest to get wrong in either direction: reporting all
    // of them again (so the field bought nothing), or reporting none (so a component that cannot be
    // constructed is emitted anyway). The message must name `step` and must not name `label`.
    const { context, reported } = harness(
      appWithRouteParams(
        [required('label', 'String'), required('step', 'int')],
        [constArgument('label', 'Taps')],
      ),
    );
    reactGenerator.generate(context);

    const error = reported.find((d) => d.code === 'BRG3018');
    expect(error).toBeDefined();
    expect(error?.message).toContain('requires `step`');
    expect(error?.message).not.toContain('requires `label`');
    // And says what *was* supplied, so the reader can see the difference rather than infer it.
    expect(error?.message).toContain('supplies only `label`');
  });

  it('the page constructs the component with those arguments, as props', () => {
    const { context } = harness(
      appWithRouteParams([required('label', 'String')], [constArgument('label', 'Taps')]),
    );
    const page = fileAt(reactGenerator.generate(context).files, 'app/page.tsx') ?? '';

    expect(page).toContain("<CounterPanel label={'Taps'} />");
  });

  it('the wrapper is a module-scope function, never an arrow in the outlet map', () => {
    // `RouterOutlet` takes a `ComponentType`, so an argument-carrying route has to be passed as something
    // that supplies them. An arrow written into the map literal would be a **new component identity on
    // every render of `Page`** — and `Page` re-renders on every navigation — so React would unmount and
    // remount the screen, discarding its state. A module-scope function has one identity for the life of
    // the module. This is the assertion that keeps it there.
    const { context } = harness(
      appWithRouteParams([required('label', 'String')], [constArgument('label', 'Taps')]),
    );
    const page = fileAt(reactGenerator.generate(context).files, 'app/page.tsx') ?? '';

    expect(page).toMatch(/^function CounterPanelRoute\(\) \{$/m);
    expect(page).toContain('routes={{ "root": CounterPanelRoute }}');
    // No inline component in the map — the defect this pins.
    expect(page).not.toMatch(/routes=\{\{[^}]*=>/);
  });

  it('an argument whose value the page cannot reach is named as a capability, not as a hash', () => {
    // `hello_bridge` is exactly this: `home: LoginScreen(isDark: _isDark, onToggleTheme: _toggleTheme)`
    // where both read state the **application root** declares — and an app root is consumed, not emitted,
    // so its signals have no home in the project. The analyzer records the argument correctly; nothing has
    // promoted the state it reads.
    //
    // The failure mode this pins is a *message*: lowered naively, `emitBinding` reports
    // "a bind.Signal names `36d5792cf2325285`, which is not a signal in scope" — a content hash, no owner,
    // and no capability. This project's own rule (routes.ts) is that a diagnostic names the capability and
    // the layer that owns it, so the low-level report is replaced by one that does.
    const { context, reported } = harness(
      appWithRouteParams(
        [required('isDark', 'bool')],
        [
          {
            name: 'isDark',
            transport: 'primitive',
            binding: { id: 'b_isDark', kind: 'bind.Signal', span, signal: 'sig_nowhere' },
          },
        ],
      ),
    );
    reactGenerator.generate(context);

    // No hash reaches the reader.
    expect(reported.map((d) => d.message).join('\n')).not.toContain('sig_nowhere');

    const error = reported.find((d) => d.code === 'BRG3013');
    expect(error).toBeDefined();
    expect(error?.severity).toBe('error');
    expect(error?.message).toContain('`isDark`');
    // The capability and its owner, per §8.
    expect(error?.message).toContain('Missing capability');
    expect(error?.message).toContain('promote-cross-route-state');
    expect(error?.message).toContain('app.Route.arguments');

    // And BRG3018 stays silent: the parameter *has* an argument, so nothing is missing from the route.
    // What is missing is a pass, and that is a different diagnostic with a different owner.
    expect(reported.find((d) => d.code === 'BRG3018')).toBeUndefined();
  });

  it('a route with no arguments is still passed as its bare component', () => {
    // The common case must emit the bytes it always did: no wrapper, no indirection, no diff for every
    // existing program.
    const { context } = harness(appWithRouteParams([]));
    const page = fileAt(reactGenerator.generate(context).files, 'app/page.tsx') ?? '';

    expect(page).toContain('routes={{ "root": CounterPanel }}');
    expect(page).not.toContain('CounterPanelRoute');
  });
});
