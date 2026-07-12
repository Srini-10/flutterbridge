// The `bridge` debugging surface.
//
// The load-bearing test in this file is the last one: **what `bridge normalize` writes is byte-identical
// to what the compiler itself produces.** Everything else here is convenience. That one is the contract —
// a debugger that disagrees with the compiler sends you hunting a bug that is not there, and it would be
// better not to ship it at all.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  normalizationPipeline,
  PassManager,
  PluginHost,
  Program,
  WidgetRegistry,
  load,
} from '@bridge/compiler';
import {
  UIR_SCHEMA_HASH,
  UIR_VERSION,
  canonicalEncode,
  nodeIdOfContent,
  stripIdentity,
  type AnyUirNode,
} from '@bridge/uir';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { main } from '../src/index.js';

const span = { file: 'lib/main.dart', line: 1, column: 1 } as const;

let dir: string;
let out: string[];
let err: string[];

/** A tiny but real document: a component rendering a Container that wraps some text. */
function document(): string {
  const text = {
    kind: 'ui.Text',
    span,
    value: { kind: 'bind.Const', span, value: 'hi' },
  };
  const container = {
    kind: 'ui.Element',
    span,
    component: { name: 'Container', library: 'package:flutter/src/widgets/container.dart', userDefined: false },
    children: [text],
  };
  const component = {
    id: 'c0ffee0000000001',
    kind: 'ui.Component',
    span,
    name: 'Home',
    render: container,
  };

  // Tree nodes are content-addressed (ADR-17): their ids must be the hash of their own content, or the
  // document this test builds would not be one the compiler could have produced.
  return [withIds(component)].map((n) => canonicalEncode(n as AnyUirNode)).join('\n') + '\n';
}

/** Mints content-addressed ids for every nested node, the way the analyzer does. */
function withIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withIds);
  if (value === null || typeof value !== 'object') return value;

  const node: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    node[key] = withIds(child);
  }
  if (typeof node['kind'] === 'string' && node['id'] === undefined) {
    // The real derivation, from the generated UIR — not a stand-in.
    node['id'] = nodeIdOfContent(stripIdentity(node as unknown as AnyUirNode));
  }
  return node;
}

/** Runs `bridge` with [argv], capturing stdout. */
async function bridge(...argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const code = await main(argv);
  return { code, stdout: out.join(''), stderr: err.join('') };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bridge-cli-'));
  writeFileSync(join(dir, 'app.ndjson'), document());
  out = [];
  err = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => (out.push(String(chunk)), true));
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => (err.push(String(chunk)), true));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

const doc = (): string => join(dir, 'app.ndjson');

describe('the tool never disagrees with the compiler', () => {
  it('`normalize` writes exactly what the compiler itself produces — byte for byte', async () => {
    // The contract of this whole package. If these bytes ever diverge, the debugger is lying, and every
    // conclusion anyone draws from it is suspect.
    const target = join(dir, 'out.ndjson');
    const { code } = await bridge('normalize', doc(), '--out', target);
    expect(code).toBe(0);

    const host = await PluginHost.load(['@bridge/widgets-material']);
    const expected = new PassManager(normalizationPipeline()).run(
      load(readFileSync(doc(), 'utf8')),
      {
        uirVersion: UIR_VERSION,
        schemaHash: UIR_SCHEMA_HASH,
        widgets: WidgetRegistry.from(host.plugins),
      },
    );

    expect(readFileSync(target, 'utf8')).toBe(expected.program.toNdjson());
  });

  it('`explain` recomputes a tree node’s id and confirms it is a function of its content', async () => {
    const program: Program = load(readFileSync(doc(), 'utf8'));
    const container = program.nodes
      .flatMap((n) => Object.values(n as unknown as Record<string, unknown>))
      .find((v): v is Record<string, unknown> => (v as Record<string, unknown>)?.['kind'] === 'ui.Element');

    const { stdout, code } = await bridge('explain', doc(), String(container!['id']));

    expect(code).toBe(0);
    expect(stdout).toContain('the id is a function of the content');
  });

  it('`explain` does NOT cry corruption at a symbol-addressed declaration', async () => {
    // A declaration's id is sha256('d:' + symbol), and the symbol is not carried in the document. A tool
    // that called that "corrupt" would call every healthy declaration in every document corrupt.
    const { stdout } = await bridge('explain', doc(), 'c0ffee0000000001');

    expect(stdout).toContain('symbol-addressed');
    expect(stdout).not.toContain('Do not trust this file');
  });

  it('`explain` names the pass that removed a node', async () => {
    // The Container has no props, so the catalog calls it transparent and N7 flattens it away.
    const program: Program = load(readFileSync(doc(), 'utf8'));
    const container = program.nodes
      .flatMap((n) => Object.values(n as unknown as Record<string, unknown>))
      .find((v): v is Record<string, unknown> => (v as Record<string, unknown>)?.['kind'] === 'ui.Element');

    const { stdout } = await bridge('explain', doc(), String(container!['id']));

    expect(stdout).toMatch(/N7\s+flatten-wrappers\s+removed/);
  });
});

describe('the views', () => {
  it('`inspect` counts the document by kind', async () => {
    const { stdout, code } = await bridge('inspect', doc(), '--json');
    const report = JSON.parse(stdout) as { nodes: number; kinds: Record<string, number> };

    expect(code).toBe(0);
    expect(report.nodes).toBe(1);
    expect(report.kinds['ui.Component']).toBe(1);
  });

  it('`widget-tree` draws the tree under each component', async () => {
    const { stdout } = await bridge('widget-tree', doc());

    expect(stdout).toContain('ui.Component');
    expect(stdout).toContain('Container');
    expect(stdout).toContain('ui.Text');
  });

  it('`graph` emits graphviz on request', async () => {
    const { stdout } = await bridge('graph', doc(), '--dot');

    expect(stdout).toContain('digraph bridge {');
    expect(stdout.trimEnd().endsWith('}')).toBe(true);
  });

  it('`signal-graph` says so plainly when there are no signals', async () => {
    const { stdout } = await bridge('signal-graph', doc());
    expect(stdout).toContain('no sig.Signal');
  });

  it('`route-graph` says so plainly when there is no route boundary', async () => {
    const { stdout } = await bridge('route-graph', doc());
    expect(stdout).toContain('no app.Route');
  });

  it('`diagnostics` reports what the passes said, and exits 0 when none is an error', async () => {
    const { stdout, code } = await bridge('diagnostics', doc());

    expect(code).toBe(0);
    expect(stdout).toContain('BRG2109'); // the Container N7 flattened
  });

  it('`stats` times every pass', async () => {
    const { stdout, code } = await bridge('stats', doc(), '--json');
    const report = JSON.parse(stdout) as { passes: { id: string }[] };

    expect(code).toBe(0);
    expect(report.passes.map((p) => p.id)).toEqual([
      'N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8', 'N9', 'N10', 'N11',
    ]);
  });
});

describe('exit codes mean something', () => {
  it('a malformed command is 2, and an unfit input is 3 — they are not the same thing', async () => {
    // 3 is INV-5: the compiler refuses an environment it cannot work in. A script that retries a 2 might
    // succeed; a script that retries a 3 never will.
    expect((await bridge('inspect', join(dir, 'nope.ndjson'))).code).toBe(2);
    expect((await bridge('frobnicate', doc())).code).toBe(2);
    expect((await bridge('explain', doc(), 'nosuchnode')).code).toBe(2);
    expect((await bridge('inspect', doc(), '--plugin', '@bridge/does-not-exist')).code).toBe(3);
  });

  it('no command at all prints usage and fails', async () => {
    const { code, stdout } = await bridge();

    expect(code).toBe(2);
    expect(stdout).toContain('bridge <command>');
  });

  it('`--help` prints usage and succeeds', async () => {
    expect((await bridge('help')).code).toBe(0);
  });
});
