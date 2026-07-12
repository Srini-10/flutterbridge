// The normalization framework (M2-T6).
//
// The framework's job is to make eleven passes composable, ordered, deterministic and replayable. These
// tests are about *those* properties — not about what any individual pass computes, which is M2-T7..T11.

import { UIR_SCHEMA_HASH, UIR_VERSION, type AnyUirNode } from '@bridge/uir';
import { describe, expect, it } from 'vitest';

import {
  load,
  LoadError,
  normalizationPipeline,
  PassManager,
  PipelineError,
  Program,
  referencesOf,
  type Analysis,
  type Pass,
} from '../src/index.js';

const span = { file: 'lib/a.dart', line: 1, column: 1 } as const;

/** A `ui.Text` with a constant value. */
function text(id: string, value: string): AnyUirNode {
  return {
    id,
    kind: 'ui.Text',
    span,
    value: { id: `${id}-b`, kind: 'bind.Const', span, value },
  } as AnyUirNode;
}

/** A `sig.Signal`. */
function signal(id: string): AnyUirNode {
  return {
    id,
    kind: 'sig.Signal',
    span,
    scope: 'component',
    type: { name: 'int' },
  } as AnyUirNode;
}

/** An `app.Store` referring to [signals] by id. */
function store(id: string, signals: readonly string[]): AnyUirNode {
  return {
    id,
    kind: 'app.Store',
    span,
    name: 'Counter',
    origin: 'declared',
    signals,
  } as AnyUirNode;
}

/** A pass that does nothing, for testing the manager rather than a pass. */
function noop(id: string, overrides: Partial<Pass> = {}): Pass {
  return {
    id,
    name: `noop-${id}`,
    requires: [],
    requiresAnalyses: [],
    produces: [],
    invalidates: [],
    implemented: true,
    run: (program) => program,
    ...overrides,
  };
}

const options = { uirVersion: UIR_VERSION, schemaHash: UIR_SCHEMA_HASH };

describe('the program is immutable and canonically ordered', () => {
  it('imposes canonical order, whatever order the nodes arrived in', () => {
    const forward = Program.of([text('b', 'B'), text('a', 'A')]);
    const backward = Program.of([text('a', 'A'), text('b', 'B')]);

    expect(forward.nodes.map((n) => n.id)).toEqual(backward.nodes.map((n) => n.id));
    expect(forward.toNdjson()).toBe(backward.toNdjson());
  });

  it('a pass that changes nothing returns the SAME object', () => {
    // Not deep equality — identity. It is what makes "the pipeline reached a fixed point" cheap to
    // check, and what the manager's `changed` flag actually means.
    const program = Program.of([text('a', 'A')]);
    expect(program.with(new Map())).toBe(program);
  });

  it('`with` replaces a node without mutating the original', () => {
    const before = Program.of([text('a', 'A')]);
    const after = before.with(new Map([['a', text('a', 'CHANGED')]]));

    expect(after).not.toBe(before);
    expect(before.toNdjson()).toContain('"A"');
    expect(after.toNdjson()).toContain('"CHANGED"');
    expect(before.toNdjson()).not.toContain('CHANGED');
  });

  it('reads references from the schema-generated table, not a hand-kept list', () => {
    // A new reference field in the schema is followed automatically. A hand-maintained list is a list
    // that goes stale the first time somebody adds one.
    expect(referencesOf(store('s', ['sig1', 'sig2']))).toEqual(['sig1', 'sig2']);
    expect(referencesOf(signal('sig1'))).toEqual([]);
  });
});

describe('the loader', () => {
  it('round-trips the analyzer output byte for byte', () => {
    const program = Program.of([text('a', 'A'), signal('s')]);
    const document = program.toNdjson();

    expect(load(document).toNdjson()).toBe(document);
  });

  it('refuses a document built against a different schema', () => {
    // A node built against schema A and read against schema B does not *fail* — it deserializes, with
    // a field missing or an enum value the reader has never heard of, and the compiler carries on and
    // is quietly wrong. Amending the schema in v2.2 is exactly such a change.
    const document = Program.of([text('a', 'A')]).toNdjson();

    expect(() =>
      load(document, {
        buildVersion: '0.0.1',
        diagnosticCount: 0,
        format: 'ndjson/1',
        recordCount: 1,
        schemaHash: 'deadbeefdeadbeef',
        uirVersion: '1.0.0',
      }),
    ).toThrow(LoadError);
  });

  it('refuses a truncated document', () => {
    const document = Program.of([text('a', 'A')]).toNdjson();

    expect(() =>
      load(document, {
        buildVersion: '0.0.1',
        diagnosticCount: 0,
        format: 'ndjson/1',
        recordCount: 2,
        schemaHash: UIR_SCHEMA_HASH,
        uirVersion: UIR_VERSION,
      }),
    ).toThrow(/truncated/);
  });

  it('rejects a record the schema does not admit, at the boundary', () => {
    expect(() => load('{"kind":"ui.Text","id":"a"}\n')).toThrow();
    expect(() => load('not json\n')).toThrow(/line 1/);
  });
});

describe('the pass manager enforces the dependency graph', () => {
  it('rejects a pipeline that runs a pass before what it requires', () => {
    // Spec §3.3 records that N11 depends on N5. A pipeline that violates it does not crash: N11 finds
    // no named actions, promotes nothing, and produces an app that silently loses state on navigation.
    expect(() => new PassManager([noop('N11', { requires: ['N5'] }), noop('N5')])).toThrow(
      PipelineError,
    );
    expect(() => new PassManager([noop('N5'), noop('N11', { requires: ['N5'] })])).not.toThrow();
  });

  it('an analysis is computed ON DEMAND — a pass need not name its producer (Spec §3.2)', () => {
    // ADR-11: "the pass manager computes the analysis on demand". `nav-graph` depends only on L3 route
    // declarations and navigation sites, both of which exist the moment the program is loaded — so N11
    // declaring `requiresAnalyses: ['nav-graph']` is a statement about what it reads, not a scheduling
    // constraint the author has to satisfy by hand.
    const needsNav = noop('N11', { requiresAnalyses: ['nav-graph'] as Analysis[] });

    expect(() => new PassManager([needsNav])).not.toThrow();
  });

  it('an invalidated analysis is recomputed, not fatal', () => {
    // `invalidates` says the cached analysis is stale, not that the pipeline is broken. N11 invalidates
    // the nav-graph *and* the reactivity-graph precisely because it moved state across a boundary.
    expect(
      () =>
        new PassManager([
          noop('X', { invalidates: ['nav-graph'] as Analysis[] }),
          noop('N11', { requiresAnalyses: ['nav-graph'] as Analysis[] }),
        ]),
    ).not.toThrow();
  });

  it('rejects a duplicate pass', () => {
    expect(() => new PassManager([noop('N1'), noop('N1')])).toThrow(/twice/);
  });

  it('refuses to run a pipeline with an unimplemented pass, rather than skipping it', () => {
    // Skipping produces a program that claims to be normalized and is not — and every stage downstream
    // is written against the assumption that it is.
    const manager = new PassManager([
      noop('N1'),
      noop('N2', { implemented: false, run: () => { throw new Error('must not run'); } }),
    ]);

    expect(() => manager.run(Program.of([text('a', 'A')]), options)).toThrow(PipelineError);
    expect(() => manager.run(Program.of([text('a', 'A')]), options)).toThrow(/not implemented/);
  });
});

describe('execution is deterministic and replayable', () => {
  it('the manifest records what ran, and what each pass changed', () => {
    const rewrite = noop('N2', {
      run: (program) => program.with(new Map([['a', text('a', 'REWRITTEN')]])),
    });
    const manager = new PassManager([noop('N1'), rewrite]);

    const result = manager.run(Program.of([text('a', 'A')]), options);

    expect(result.manifest.passes).toEqual([
      { id: 'N1', name: 'noop-N1', changed: false, diagnostics: 0 },
      { id: 'N2', name: 'noop-N2', changed: true, diagnostics: 0 },
    ]);
    expect(result.manifest.schemaHash).toBe(UIR_SCHEMA_HASH);
  });

  it('the same input produces the same bytes, every run', () => {
    const manager = new PassManager(
      normalizationPipeline().filter((p) => p.implemented),
    );
    const input = Program.of([text('a', 'A'), signal('s'), store('st', ['s'])]);

    const first = manager.run(input, options);
    const second = manager.run(input, options);

    expect(first.program.toNdjson()).toBe(second.program.toNdjson());
    expect(first.diagnostics).toEqual(second.diagnostics);
  });

  it('running the pipeline TWICE is a fixed point', () => {
    // The acceptance criterion. A pass that is not idempotent turns the compiler into something whose
    // output depends on how many times you ran it — and a cache, a watch mode and a replay all run it a
    // different number of times.
    const manager = new PassManager(normalizationPipeline().filter((p) => p.implemented));
    const input = Program.of([text('a', 'A'), signal('s')]);

    const once = manager.run(input, options);
    const twice = manager.run(once.program, options);

    expect(twice.program.toNdjson()).toBe(once.program.toNdjson());
    expect(twice.manifest.passes.every((p) => !p.changed)).toBe(true);
  });
});

describe('the pipeline is the specification’s', () => {
  it('is the eleven passes of Spec §3.3, in order', () => {
    expect(normalizationPipeline().map((p) => `${p.id} ${p.name}`)).toEqual([
      'N1 desugar-cascades',
      'N2 desugar-collection-ctrl',
      'N3 expand-builders',
      'N4 normalize-async-ui',
      'N5 lift-closures',
      'N6 const-fold',
      'N7 flatten-wrappers',
      'N8 extract-slots',
      'N9 key-inference',
      'N10 theme-tokenize',
      'N11 promote-cross-route-state',
    ]);
  });

  it('N11 declares the dependencies the spec gives it', () => {
    const n11 = normalizationPipeline().find((p) => p.id === 'N11')!;

    expect(n11.requires).toEqual(['N5']);
    expect(n11.requiresAnalyses).toEqual(['nav-graph']);
    expect(n11.invalidates).toEqual(['nav-graph', 'reactivity-graph']);
  });

  it('every pass of the specification is implemented — the pipeline has no holes', () => {
    // The success criterion of the compiler roadmap. A pipeline with an unimplemented pass in it is one
    // the manager refuses to run at all, because a program that claims to be normalized and is not is
    // more dangerous than one that is honestly unfinished.
    expect(normalizationPipeline().filter((p) => !p.implemented)).toEqual([]);
  });
});

describe('N2/N3/N4 verify the invariant rather than redo the work', () => {
  it('a canonical ui.Cond passes N2 silently', () => {
    const manager = new PassManager(normalizationPipeline().filter((p) => p.implemented));
    // The test is a *signal*, so this is a real decision — the kind N2 is asserting is canonical. A
    // constant test would be collapsed by N7, correctly, and the diagnostic would be N7's, not N2's.
    const cond = {
      id: 'c',
      kind: 'ui.Cond',
      span,
      test: { id: 'c-t', kind: 'bind.Signal', span, signal: 'sig1' },
      then: text('c-a', 'yes'),
    } as AnyUirNode;

    const result = manager.run(Program.of([cond]), options);

    expect(result.diagnostics).toEqual([]);
  });

  it('an un-desugared collection-if is an ERROR — a generator would evaluate both branches', () => {
    const manager = new PassManager(normalizationPipeline().filter((p) => p.implemented));
    // A `ui.Opaque` — a conditional in a *UI* position. A `logic.OpaqueExpr` with the same reason is a
    // collection-if in a list of *data*, which has nothing to do with rendering.
    const opaque = {
      id: 'o',
      kind: 'ui.Opaque',
      span,
      dartSource: 'if (x) A() else B()',
      reason: 'collection-if',
    } as AnyUirNode;

    const result = manager.run(Program.of([opaque]), options);

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe('BRG2102');
    expect(result.diagnostics[0]!.severity).toBe('error');
  });

  it('an opaque cascade is named by N1 rather than carried silently', () => {
    const manager = new PassManager(normalizationPipeline().filter((p) => p.implemented));
    const cascade = {
      id: 'o',
      kind: 'logic.OpaqueExpr',
      span,
      dartSource: 'obj..a = 1..b = 2',
      reason: 'cascade',
      type: { name: 'Object' },
    } as AnyUirNode;

    const result = manager.run(Program.of([cascade]), options);

    expect(result.diagnostics.map((d) => d.code)).toEqual(['BRG2101']);
  });

  it('a ui.Async with no loading or error branch is named, not invented', () => {
    const manager = new PassManager(normalizationPipeline().filter((p) => p.implemented));
    const async = {
      id: 'a',
      kind: 'ui.Async',
      span,
      source: { id: 'a-s', kind: 'bind.Const', span, value: 1 },
      data: text('a-d', 'done'),
    } as AnyUirNode;

    const result = manager.run(Program.of([async]), options);

    expect(result.diagnostics.map((d) => d.code)).toEqual(['BRG2104']);
  });
});
