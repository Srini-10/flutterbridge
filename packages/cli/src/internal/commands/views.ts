// `inspect`, `widget-tree`, `route-graph`, `signal-graph`, `graph`.
//
// Five ways of looking at one document. None of them computes anything the compiler does not already
// compute: `route-graph` is `navGraph()`, the same analysis N11 consumes, and `graph` is `referencesOf()`,
// the same edge set the loader links against. A debugger that re-derives the compiler's facts will
// eventually disagree with it, and then it is worse than useless — it is misleading.

import { referencesOf, type Program } from '@bridge/compiler';
import type { AnyUirNode, NodeId } from '@bridge/uir';

import { flag, type Args } from '../args.js';
import { navigation, type Document } from '../document.js';
import { bar, bold, cyan, dim, json, table, tree, yellow, type TreeNode } from '../render.js';

/** Every node of [program], by id. */
function index(program: Program): Map<NodeId, AnyUirNode> {
  return new Map(program.nodes.map((n) => [n.id, n]));
}

/** The layer a kind belongs to: `ui.Element` → `ui`. */
function layerOf(kind: string): string {
  const dot = kind.indexOf('.');
  return dot === -1 ? kind : kind.slice(0, dot);
}

// ── inspect ───────────────────────────────────────────────────────────────────────────────────────

/** What the document contains: counts by layer and kind, and the manifest it arrived with. */
export function inspect(doc: Document, args: Args): string {
  const counts = new Map<string, number>();
  for (const node of doc.program.nodes) counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1);

  const kinds = [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const layers = new Map<string, number>();
  for (const [kind, n] of kinds) {
    layers.set(layerOf(kind), (layers.get(layerOf(kind)) ?? 0) + n);
  }

  if (flag(args, 'json')) {
    return json({
      path: doc.path,
      normalized: doc.normalized,
      nodes: doc.program.nodes.length,
      manifest: doc.manifest ?? null,
      layers: Object.fromEntries([...layers].sort()),
      kinds: Object.fromEntries(kinds),
    });
  }

  const max = Math.max(...kinds.map(([, n]) => n), 1);
  const out: string[] = [
    bold(doc.path),
    table([
      ['nodes', doc.program.nodes.length],
      ['normalized', doc.normalized ? 'yes (N1..N11)' : 'no (as the analyzer emitted it)'],
      ['uir version', doc.manifest?.uirVersion ?? dim('(no manifest)')],
      ['schema hash', doc.manifest?.schemaHash ?? dim('(no manifest)')],
      ['diagnostics at extraction', doc.manifest?.diagnosticCount ?? dim('(no manifest)')],
      ['catalog conflicts', doc.widgets.conflicts.length],
    ]),
    '',
    bold('by layer'),
    table([...layers].sort().map(([l, n]) => [l, n] as const)),
    '',
    bold('by kind'),
    ...kinds.map(([kind, n]) => `  ${kind.padEnd(24)} ${String(n).padStart(4)}  ${bar(n, max)}`),
  ];
  return out.join('\n');
}

// ── widget-tree ───────────────────────────────────────────────────────────────────────────────────

/** The UI tree of every component, drawn. */
export function widgetTree(doc: Document, args: Args): string {
  const byId = index(doc.program);
  const components = doc.program.nodes.filter((n) => n.kind === 'ui.Component');

  if (components.length === 0) return dim('no ui.Component in this document.');

  const roots = components.map((component) => uiNode(component, byId, new Set()));
  return flag(args, 'json') ? json(roots) : tree(roots);
}

/** Draws one UI node and everything under it. */
function uiNode(node: AnyUirNode, byId: Map<NodeId, AnyUirNode>, seen: Set<NodeId>): TreeNode {
  const record = node as unknown as Record<string, unknown>;

  if (seen.has(node.id)) return { label: dim(`↺ ${node.kind}`), detail: node.id };
  seen.add(node.id);

  const children: TreeNode[] = [];
  const push = (value: unknown, prefix?: string): void => {
    if (Array.isArray(value)) {
      for (const item of value) push(item, prefix);
      return;
    }
    if (value === null || typeof value !== 'object') return;

    const child = value as Record<string, unknown>;
    if (typeof child['kind'] !== 'string' || !String(child['kind']).startsWith('ui.')) return;

    const drawn = uiNode(child as unknown as AnyUirNode, byId, seen);
    children.push(prefix === undefined ? drawn : { ...drawn, label: `${dim(prefix + ':')} ${drawn.label}` });
  };

  // The field names are the schema's, not a guess: `ui.Component` renders through `render`, `ui.List`
  // repeats a `template`, `ui.Async` resolves to `data`.
  push(record['render']);

  const slots = record['slots'];
  if (slots !== null && typeof slots === 'object' && !Array.isArray(slots)) {
    for (const name of Object.keys(slots as Record<string, unknown>).sort()) {
      push((slots as Record<string, unknown>)[name], name);
    }
  }
  push(record['children']);
  push(record['then'], 'then');
  push(record['otherwise'], 'else');
  push(record['template'], 'each');
  push(record['data'], 'data');

  return { label: label(node), detail: node.id, children };
}

/** How a node is named on screen: `ui.Element(Scaffold)`, `ui.Text("Hello")`. */
function label(node: AnyUirNode): string {
  const record = node as unknown as Record<string, unknown>;
  const component = record['component'] as { name?: unknown } | undefined;

  if (typeof component?.name === 'string') return `${cyan(node.kind)} ${bold(component.name)}`;
  if (typeof record['name'] === 'string') return `${cyan(node.kind)} ${bold(String(record['name']))}`;
  if (typeof record['symbol'] === 'string') return `${cyan(node.kind)} ${bold(String(record['symbol']))}`;

  // A `ui.Text` is worth showing by what it says; a `ui.Opaque` by what defeated the frontend.
  if (node.kind === 'ui.Text') {
    const value = record['value'] as Record<string, unknown> | undefined;
    const literal = value?.['kind'] === 'bind.Const' ? value['value'] : undefined;
    return `${cyan(node.kind)}${literal === undefined ? '' : ' ' + bold(JSON.stringify(literal))}`;
  }
  if (node.kind === 'ui.Opaque' && typeof record['reason'] === 'string') {
    return `${yellow(node.kind)} ${dim(String(record['reason']))}`;
  }
  return cyan(node.kind);
}

// ── route-graph ───────────────────────────────────────────────────────────────────────────────────

/** The routes, what each renders, and every transition between them. */
export function routeGraph(doc: Document, args: Args): string {
  const nav = navigation(doc.program);
  const byId = index(doc.program);

  if (!nav.hasRoutes) return dim('no app.Route in this document — this program has no route boundary.');

  const routes = [...nav.routes.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));

  if (flag(args, 'json')) {
    return json({
      routes: routes.map(([id, route]) => ({
        id,
        path: (route as unknown as Record<string, unknown>)['path'] ?? null,
        component: nav.componentOf.get(id) ?? null,
      })),
      transitions: nav.transitions.map((t) => ({
        id: t.id,
        source: t.source ?? null,
        target: t.target,
        arguments: t.arguments.map((a) => a.name),
      })),
    });
  }

  const out: string[] = [bold(`routes (${routes.length})`)];
  for (const [id, route] of routes) {
    const record = route as unknown as Record<string, unknown>;
    const componentId = nav.componentOf.get(id);
    const component = componentId === undefined ? undefined : byId.get(componentId);
    out.push(
      `  ${bold(String(record['path'] ?? '(no path)'))}  ${dim(id)}` +
        (component === undefined ? dim('  → (unresolved component)') : `  → ${label(component)}`),
    );
  }

  out.push('', bold(`transitions (${nav.transitions.length})`));
  if (nav.transitions.length === 0) {
    // Honest about a known gap rather than silently drawing an empty graph.
    out.push(
      dim('  none. Extraction emits app.Route declarations but not app.RouteTransition call sites,'),
      dim('  so this graph has nodes and no edges. See the Compiler Readiness Report, "known limitations".'),
    );
  }
  for (const t of nav.transitions) {
    const carried = t.arguments.map((a) => a.name).join(', ');
    out.push(
      `  ${dim(t.source ?? '(no source)')} → ${bold(t.target)}` +
        (carried === '' ? '' : dim(`  carrying ${carried}`)),
    );
  }
  return out.join('\n');
}

// ── signal-graph ──────────────────────────────────────────────────────────────────────────────────

/** Every signal, who writes it, and who reads it. */
export function signalGraph(doc: Document, args: Args): string {
  const signals = doc.program.nodes.filter((n) => n.kind === 'sig.Signal');
  const actions = doc.program.nodes.filter((n) => n.kind === 'sig.Action');
  const stores = doc.program.nodes.filter((n) => n.kind === 'app.Store');

  if (signals.length === 0) return dim('no sig.Signal in this document.');

  // Who writes what: `sig.Action.writes` is the compiler's own answer, computed by N5.
  const writers = new Map<NodeId, string[]>();
  for (const action of actions) {
    const record = action as unknown as Record<string, unknown>;
    const writes = Array.isArray(record['writes']) ? (record['writes'] as NodeId[]) : [];
    for (const signal of writes) {
      writers.set(signal, [...(writers.get(signal) ?? []), action.id]);
    }
  }

  // Who reads what: any node holding a `bind.Signal` for it.
  const readers = new Map<NodeId, Set<NodeId>>();
  for (const node of doc.program.nodes) {
    for (const signal of signalRefs(node)) {
      readers.set(signal, (readers.get(signal) ?? new Set()).add(node.id));
    }
  }

  if (flag(args, 'json')) {
    return json(
      signals.map((s) => ({
        id: s.id,
        name: (s as unknown as Record<string, unknown>)['name'] ?? null,
        writtenBy: (writers.get(s.id) ?? []).sort(),
        readBy: [...(readers.get(s.id) ?? [])].sort(),
      })),
    );
  }

  const roots: TreeNode[] = signals.map((signal) => {
    const wrote = (writers.get(signal.id) ?? []).sort();
    const read = [...(readers.get(signal.id) ?? [])].sort();
    return {
      label: label(signal),
      detail: signal.id,
      children: [
        {
          label: wrote.length > 0 ? yellow(`written by ${wrote.length}`) : dim('written by nobody'),
          children: wrote.map((id) => ({ label: dim('sig.Action'), detail: id })),
        },
        {
          label: read.length > 0 ? cyan(`read by ${read.length}`) : dim('read by nobody'),
          children: read.map((id) => ({ label: dim('via bind.Signal'), detail: id })),
        },
      ],
    };
  });

  const header = `${bold(`${signals.length} signal(s)`)}, ${actions.length} action(s), ${stores.length} store(s)`;
  return [header, '', tree(roots)].join('\n');
}

/** Every signal id a node binds to, anywhere inside it. */
function signalRefs(node: AnyUirNode): NodeId[] {
  const found: NodeId[] = [];

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value === null || typeof value !== 'object') return;

    const record = value as Record<string, unknown>;
    if (record['kind'] === 'bind.Signal' && typeof record['signal'] === 'string') {
      found.push(record['signal']);
    }
    for (const child of Object.values(record)) visit(child);
  };

  visit(node);
  return found;
}

// ── graph ─────────────────────────────────────────────────────────────────────────────────────────

/** The whole reference graph: every node, and every id it points at. */
export function graph(doc: Document, args: Args): string {
  const byId = index(doc.program);
  const edges: { from: NodeId; to: NodeId; dangling: boolean }[] = [];

  for (const node of doc.program.nodes) {
    for (const to of referencesOf(node)) {
      edges.push({ from: node.id, to, dangling: !byId.has(to) });
    }
  }
  edges.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : 1));

  if (flag(args, 'json')) {
    return json({
      nodes: doc.program.nodes.map((n) => ({ id: n.id, kind: n.kind })),
      edges,
    });
  }

  if (flag(args, 'dot')) {
    const lines = ['digraph bridge {', '  rankdir=LR;', '  node [shape=box, fontname="monospace"];'];
    for (const node of doc.program.nodes) {
      lines.push(`  "${node.id}" [label="${node.kind}\\n${node.id.slice(0, 8)}"];`);
    }
    for (const edge of edges) {
      lines.push(`  "${edge.from}" -> "${edge.to}"${edge.dangling ? ' [color=red, style=dashed]' : ''};`);
    }
    lines.push('}');
    return lines.join('\n');
  }

  const dangling = edges.filter((e) => e.dangling);
  const out: string[] = [
    `${bold(`${doc.program.nodes.length} node(s)`)}, ${edges.length} edge(s)`,
    dim('  (--dot for graphviz, --json for the raw graph)'),
    '',
  ];
  for (const edge of edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    out.push(
      `  ${cyan(from?.kind ?? '?')} ${dim(edge.from)} → ` +
        (edge.dangling ? yellow(`${edge.to} (dangling)`) : `${cyan(to?.kind ?? '?')} ${dim(edge.to)}`),
    );
  }
  if (dangling.length > 0) {
    out.push('', yellow(`${dangling.length} dangling reference(s) — these point at ids not in the document.`));
  }
  return out.join('\n');
}
