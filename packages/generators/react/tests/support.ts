import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { Diagnostic, GeneratorContext, ProgramView, WidgetCatalog } from '@bridge/plugin-sdk';
import { parseUirNode, type AnyUirNode, type NodeId } from '@bridge/uir';

// Test support.
//
// ## Why this builds its own ProgramView instead of importing the compiler's Program
//
// It could not import it if it wanted to — `.dependency-cruiser.cjs` forbids the plugin realm from reaching
// `@bridge/compiler`, and while `tests/` is excluded from the cruise, a devDependency on the compiler would
// invert the layering the rule exists to protect and would make this package unbuildable without it.
//
// So the tests do what the SPI says a host does: hand the generator a `ProgramView` over `AnyUirNode[]`. That
// this is possible *at all* using only `@bridge/uir` is itself the point ADR-22 was arguing — and it is the
// cheapest available check that the SPI does not secretly depend on the compiler.

/** A `ProgramView` over nodes in hand. The compiler's `Program` satisfies the same interface (ADR-22). */
export function programOf(nodes: readonly AnyUirNode[]): ProgramView {
  const byId = new Map<NodeId, AnyUirNode>();
  for (const node of nodes) byId.set(node.id, node);
  // Canonical order — kind, then id — which is what the compiler guarantees and every emitter relies on.
  const ordered = [...nodes].sort((a, b) => (a.kind === b.kind ? (a.id < b.id ? -1 : 1) : a.kind < b.kind ? -1 : 1));
  return {
    nodes: ordered,
    get: (id) => byId.get(id),
    has: (id) => byId.has(id),
    ofKind: <K extends AnyUirNode['kind']>(kind: K) =>
      ordered.filter((node): node is Extract<AnyUirNode, { kind: K }> => node.kind === kind),
  };
}

/** Parses an NDJSON document the way the loader does: validating every line, never casting. */
export function parseNdjson(document: string): AnyUirNode[] {
  return document
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line, index) => parseUirNode(JSON.parse(line), `line ${index + 1}`));
}

/** The empty catalog. Widget facts only matter where a test exercises slots. */
export const NO_WIDGETS: WidgetCatalog = { name: 'test', priority: 0, widgets: [] };

/** A context, and the diagnostics it collected. */
export interface Harness {
  readonly context: GeneratorContext;
  readonly reported: Diagnostic[];
}

/** Builds a `GeneratorContext` over `nodes`. */
export function harness(
  nodes: readonly AnyUirNode[],
  inherited: readonly Diagnostic[] = [],
): Harness {
  const reported: Diagnostic[] = [];
  return {
    reported,
    context: {
      program: programOf(nodes),
      widgets: NO_WIDGETS,
      diagnostics: inherited,
      report: (diagnostic) => reported.push(diagnostic),
    },
  };
}

/** The real hello_bridge document, normalized — minted by `bridge_analyzer` from `fixtures/apps/hello_bridge`. */
export function helloBridge(): AnyUirNode[] {
  const path = fileURLToPath(new URL('../../../../fixtures/uir/hello_bridge.normalized.ndjson', import.meta.url));
  return parseNdjson(readFileSync(path, 'utf8'));
}

/**
 * The real `examples/counter` document, normalized — minted by `bridge_analyzer` from the example app.
 *
 * The subject of the browser suite, and therefore the right fixture for the defects that suite found: a
 * hand-authored node graph would assert about a program shape the compiler does not actually produce, and
 * both M5-D defects were in the gap between "the emitter handles this node" and "the app it produces runs".
 */
export function counter(): AnyUirNode[] {
  const path = fileURLToPath(new URL('../../../../fixtures/uir/counter.normalized.ndjson', import.meta.url));
  return parseNdjson(readFileSync(path, 'utf8'));
}

/** The file at `path` in an emitted project, or `undefined`. */
export function fileAt(files: readonly { path: string; contents: string }[], path: string): string | undefined {
  return files.find((file) => file.path === path)?.contents;
}
