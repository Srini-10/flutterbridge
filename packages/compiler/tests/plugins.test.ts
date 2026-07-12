// The compiler-side adapter registry and plugin host (M2-T10).
//
// The point of all of this is a single negative property: **no normalization pass knows what Flutter
// is.** The tests below are what that property looks like when you can actually check it.

import type { BridgePlugin } from '@bridge/plugin-sdk';
import { UIR_SCHEMA_HASH, UIR_VERSION, type AnyUirNode } from '@bridge/uir';
import { describe, expect, it } from 'vitest';

import {
  N6ConstFold,
  N7FlattenWrappers,
  PassManager,
  PluginError,
  PluginHost,
  Program,
  WidgetRegistry,
} from '../src/index.js';

const span = { file: 'lib/a.dart', line: 1, column: 1 } as const;
const FLUTTER = 'package:flutter/';

/** A plugin describing [widgets]. A plugin with no catalog simply has no `widgets` property. */
function plugin(name: string, priority: number, widgets?: BridgePlugin['widgets']): BridgePlugin {
  return {
    name,
    version: '0.0.0',
    ...(widgets ? { widgets: { ...widgets, name, priority } } : {}),
  };
}

function text(id: string): Record<string, unknown> {
  return { id, kind: 'ui.Text', span, value: { id: `${id}-b`, kind: 'bind.Const', span, value: 'x' } };
}

/** A `ui.Element` wrapping one child. */
function element(
  id: string,
  name: string,
  child: Record<string, unknown>,
  props?: Record<string, unknown>,
  extra?: Record<string, unknown>,
): AnyUirNode {
  return {
    id,
    kind: 'ui.Element',
    span,
    component: { name, library: FLUTTER, userDefined: false },
    children: [child],
    ...(props ? { props } : {}),
    ...extra,
  } as unknown as AnyUirNode;
}

/** The Material catalog, loaded the way the compiler actually loads it: at runtime, by name. */
async function materialHost(): Promise<PluginHost> {
  return PluginHost.load(['@bridge/widgets-material']);
}

function flatten(program: Program, widgets: WidgetRegistry) {
  return new PassManager([new N6ConstFold(), new N7FlattenWrappers()]).run(program, {
    uirVersion: UIR_VERSION,
    schemaHash: UIR_SCHEMA_HASH,
    widgets,
  });
}

describe('the plugin host loads adapters at runtime, never by import', () => {
  it('loads the Material catalog by module specifier', async () => {
    const host = await materialHost();

    expect(host.plugins.map((p) => p.name)).toEqual(['@bridge/widgets-material']);
    expect(host.plugins[0]!.widgets!.widgets.length).toBeGreaterThan(10);
  });

  it('a specifier that does not resolve is a HARD failure, never a shrug', async () => {
    // Skipping it would produce a compiler that silently knows less than it was configured to know —
    // and the symptom of that is not an error, it is a widget catalog with a hole in it and a generated
    // application missing a layout nobody can explain.
    await expect(PluginHost.load(['@bridge/does-not-exist'])).rejects.toThrow(PluginError);
  });

  it('plugins are ordered by name, whatever order they were listed in', () => {
    const a = PluginHost.of([plugin('z', 1), plugin('a', 1)]);
    const b = PluginHost.of([plugin('a', 1), plugin('z', 1)]);

    expect(a.plugins.map((p) => p.name)).toEqual(b.plugins.map((p) => p.name));
  });
});

describe('the registry merges catalogs deterministically', () => {
  const container = { name: 'Container', library: FLUTTER, transparentWithoutProps: ['color'] };

  it('a higher-priority catalog wins, whatever order the plugins arrived in', () => {
    const low = plugin('low', 20, { name: 'low', priority: 20, widgets: [container] });
    const high = plugin('high', 10, {
      name: 'high',
      priority: 10,
      widgets: [{ name: 'Container', library: FLUTTER, slots: ['child'] }],
    });

    for (const order of [[low, high], [high, low]]) {
      const registry = WidgetRegistry.from(order);
      expect(registry.slotsOf({ name: 'Container', library: FLUTTER })).toEqual(['child']);
      expect(registry.conflicts).toEqual([]);
    }
  });

  it('two catalogs describing one widget at the SAME priority is BRG2108', () => {
    // Which one won would depend on the order of a list, and the meaning of a user's program may never
    // depend on that.
    const a = plugin('a', 10, { name: 'a', priority: 10, widgets: [container] });
    const b = plugin('b', 10, { name: 'b', priority: 10, widgets: [container] });

    const registry = WidgetRegistry.from([a, b]);

    expect(registry.conflicts).toHaveLength(1);
    expect(registry.conflicts[0]!.code).toBe('BRG2108');
    expect(registry.conflicts[0]!.severity).toBe('error');
  });

  it('the conflict is reported once, before any pass runs', () => {
    const a = plugin('a', 10, { name: 'a', priority: 10, widgets: [container] });
    const b = plugin('b', 10, { name: 'b', priority: 10, widgets: [container] });

    const result = flatten(Program.of([text('t') as unknown as AnyUirNode]), WidgetRegistry.from([a, b]));

    expect(result.diagnostics.map((d) => d.code)).toEqual(['BRG2108']);
  });

  it('the library qualifies the name — two frameworks may both have a `Card`', () => {
    const flutter = plugin('f', 10, {
      name: 'f',
      priority: 10,
      widgets: [{ name: 'Card', library: FLUTTER, slots: ['child'] }],
    });
    const other = plugin('o', 10, {
      name: 'o',
      priority: 10,
      widgets: [{ name: 'Card', library: 'package:other/', slots: ['body'] }],
    });

    const registry = WidgetRegistry.from([flutter, other]);

    expect(registry.conflicts).toEqual([]);
    expect(registry.slotsOf({ name: 'Card', library: FLUTTER })).toEqual(['child']);
    expect(registry.slotsOf({ name: 'Card', library: 'package:other/' })).toEqual(['body']);
  });
});

describe('N7 flattens transparent wrappers — through metadata, not knowledge', () => {
  it('a Container with none of its own props renders exactly its child, and is removed', async () => {
    const registry = WidgetRegistry.from((await materialHost()).plugins);
    const program = Program.of([element('c', 'Container', text('t'))]);

    const result = flatten(program, registry);

    expect(result.program.ofKind('ui.Element')).toHaveLength(0);
    expect(result.program.ofKind('ui.Text')).toHaveLength(1);
    expect(result.diagnostics.map((d) => d.code)).toEqual(['BRG2109']);
  });

  it('a Container that carries a prop is a widget, not a wrapper, and stays', async () => {
    const registry = WidgetRegistry.from((await materialHost()).plugins);
    const program = Program.of([
      element('c', 'Container', text('t'), {
        color: { id: 'p', kind: 'bind.Const', span, value: '#FF0000' },
      }),
    ]);

    expect(flatten(program, registry).program).toBe(program);
  });

  it('a Center with no props is NOT transparent — its identity is its behaviour', async () => {
    // This is the one that matters. Guessing that a prop-less widget must be a pass-through is how a
    // compiler silently deletes a layout.
    const registry = WidgetRegistry.from((await materialHost()).plugins);
    const program = Program.of([element('c', 'Center', text('t'))]);

    expect(flatten(program, registry).program).toBe(program);
  });

  it('a widget the registry has never heard of is never transparent', async () => {
    const registry = WidgetRegistry.from((await materialHost()).plugins);
    const program = Program.of([element('c', 'SomeUnknownWrapper', text('t'))]);

    expect(flatten(program, registry).program).toBe(program);
  });

  it('a wrapper carrying a key, semantics or layout intent is never removed', async () => {
    // Each of those is something a generator must render: a key is addressable, semantics are announced
    // to a screen reader, layout intent has been measured. None survives being deleted.
    const registry = WidgetRegistry.from((await materialHost()).plugins);

    for (const extra of [
      { key: { id: 'k', kind: 'bind.Const', span, value: 'k1' } },
      { semantics: { label: 'a picture' } },
    ]) {
      const program = Program.of([element('c', 'Container', text('t'), undefined, extra)]);
      expect(flatten(program, registry).program).toBe(program);
    }
  });

  it('with NO adapters loaded, nothing is transparent — the compiler never guesses', () => {
    const program = Program.of([element('c', 'Container', text('t'))]);

    expect(flatten(program, WidgetRegistry.empty).program).toBe(program);
  });

  it('nested wrappers collapse completely, and it is a fixed point', async () => {
    const registry = WidgetRegistry.from((await materialHost()).plugins);
    const inner = { ...(element('i', 'Container', text('t')) as unknown as Record<string, unknown>) };
    const program = Program.of([element('o', 'SizedBox', inner)]);

    const once = flatten(program, registry);
    const twice = flatten(once.program, registry);

    expect(once.program.ofKind('ui.Element')).toHaveLength(0);
    expect(twice.program.toNdjson()).toBe(once.program.toNdjson());
  });
});
