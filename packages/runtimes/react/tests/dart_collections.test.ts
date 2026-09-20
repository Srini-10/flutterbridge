import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import * as c from '../src/index.js';

// Dart `List` / `Set` / `Map` semantics (ADR-0051), verified **differentially**. `col_scenarios.json` is 361 randomly
// generated but seed-fixed operation sequences over lists, sets, maps and a string list; `col_expected.json` is the
// output of real Dart (`dart run`) executing every sequence — each operation's result (or `THROW`) and the final state.
// The helpers must reproduce both, exactly. Nothing here was written from memory of Dart's documentation.

type Scenario = { kind: 'list' | 'set' | 'map' | 'strlist'; init: unknown[]; ops: unknown[][] };
type Expected = { results: unknown[]; state: unknown };

const load = <T>(name: string): T => JSON.parse(readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')) as T;
const scenarios = load<Scenario[]>('col_scenarios.json');
const expected = load<Expected[]>('col_expected.json');

const pred = (name: string) => (x: number): boolean => (name === 'even' ? x % 2 === 0 : name === 'gt2' ? x > 2 : x < 0);

function listOp(l: number[], op: unknown[]): unknown {
  const [name, a, b] = op as [string, never, never];
  switch (name) {
    case 'add': return c.listAdd(l, a);
    case 'addAll': return c.listAddAll(l, a);
    case 'insert': return c.listInsert(l, a, b);
    case 'insertAll': return c.listInsertAll(l, a, b);
    case 'remove': return c.listRemove(l, a);
    case 'removeAt': return c.listRemoveAt(l, a);
    case 'removeLast': return c.listRemoveLast(l);
    case 'removeWhere': return c.listRemoveWhere(l, pred(a));
    case 'retainWhere': return c.listRetainWhere(l, pred(a));
    case 'clear': return c.listClear(l);
    case 'sort': return c.listSort(l);
    case 'sortDesc': return c.listSort(l, (x, y) => y - x);
    case 'setAt': return c.listSetAt(l, a, b);
    case 'first': return c.listFirst(l);
    case 'last': return c.listLast(l);
    case 'contains': return c.listContains(l, a);
    case 'indexOf': return l.indexOf(a);
    case 'toList': return c.listToList(l);
    case 'reversed': return c.listReversed(l);
    case 'sublist': return c.listSublist(l, a, b);
    case 'take': return c.listTake(l, a);
    case 'skip': return c.listSkip(l, a);
    case 'whereOp': return c.listWhere(l, pred(a));
    case 'mapDouble': return c.listMap(l, (x) => x * 2);
    case 'anyOp': return c.listAny(l, pred(a));
  }
  throw new Error(`unknown op ${name}`);
}

function setOp(s: Set<number>, op: unknown[]): unknown {
  const [name, a] = op as [string, never];
  switch (name) {
    case 'add': return c.setAdd(s, a);
    case 'remove': return c.setRemove(s, a);
    case 'contains': return c.setContains(s, a);
    case 'addAll': return c.setAddAll(s, a);
    case 'clear': return c.setClear(s);
    case 'toList': return c.setToList(s);
  }
  throw new Error(`unknown op ${name}`);
}

function mapOp(m: Map<string, number>, op: unknown[]): unknown {
  const [name, a, b] = op as [string, never, never];
  switch (name) {
    case 'get': return c.mapGet(m, a);
    case 'set': return c.mapSet(m, a, b);
    case 'remove': return c.mapRemove(m, a);
    case 'putIfAbsent': return c.mapPutIfAbsent(m, a, () => b);
    case 'addAll': return c.mapAddAll(m, new Map(a as [string, number][]));
    case 'containsKey': return c.mapContainsKey(m, a);
    case 'containsValue': return c.mapContainsValue(m, a);
    case 'keys': return c.mapKeys(m);
    case 'values': return c.mapValues(m);
    case 'entries': return c.mapEntries(m);
    case 'clear': return c.mapClear(m);
  }
  throw new Error(`unknown op ${name}`);
}

/** Runs one scenario through the helpers. A throw is recorded as `THROW`, as the Dart driver does. */
function replay(s: Scenario): Expected {
  const attempt = (fn: () => unknown): unknown => {
    try {
      return fn() ?? null;
    } catch (error) {
      if ((error as { code?: string }).code === 'BRG4014') return 'THROW';
      throw error;
    }
  };
  if (s.kind === 'list') {
    const l = [...(s.init as number[])];
    return { results: s.ops.map((op) => attempt(() => listOp(l, op))), state: l };
  }
  if (s.kind === 'strlist') {
    const l = [...(s.init as string[])];
    c.listSort(l);
    return { results: [null], state: l };
  }
  if (s.kind === 'set') {
    const st = new Set(s.init as number[]);
    return { results: s.ops.map((op) => attempt(() => setOp(st, op))), state: Array.from(st) };
  }
  const m = new Map(s.init as [string, number][]);
  return { results: s.ops.map((op) => attempt(() => mapOp(m, op))), state: Array.from(m) };
}

describe('every list, set and map operation matches real Dart — results, throws and final state', () => {
  it('reproduces all 361 scenarios exactly', () => {
    expect(scenarios).toHaveLength(expected.length);
    const failures: string[] = [];
    scenarios.forEach((s, i) => {
      const got = replay(s);
      if (JSON.stringify(got) !== JSON.stringify(expected[i])) {
        failures.push(`#${i} ${s.kind} init=${JSON.stringify(s.init)} ops=${JSON.stringify(s.ops)}\n   dart=${JSON.stringify(expected[i])}\n   js  =${JSON.stringify(got)}`);
      }
    });
    expect(failures.slice(0, 3)).toEqual([]);
  });

  it('exercises every operation, including the throwing paths', () => {
    const seen = new Set(scenarios.flatMap((s) => s.ops.map((o) => `${s.kind}:${String(o[0])}`)));
    expect(seen.size).toBeGreaterThan(40);
    const throws = expected.reduce((n, e) => n + e.results.filter((r) => r === 'THROW').length, 0);
    expect(throws).toBeGreaterThan(100);
  });
});

describe('the specific coincidences the old lowering got wrong', () => {
  it('sort() orders numbers numerically and strings by code unit — [10, 9, 1] → [1, 9, 10]', () => {
    const l = [10, 9, 1];
    c.listSort(l);
    expect(l).toEqual([1, 9, 10]);
    const s = ['b', 'A', 'a', 'B'];
    c.listSort(s);
    expect(s).toEqual(['A', 'B', 'a', 'b']);
  });
  it('map[missing] is null, not undefined', () => {
    expect(c.mapGet(new Map([['a', 1]]), 'zzz')).toBeNull();
  });
  it('Set.add reports whether the value was new', () => {
    const s = new Set([1]);
    expect(c.setAdd(s, 1)).toBe(false);
    expect(c.setAdd(s, 2)).toBe(true);
  });
  it('removeAt out of range throws instead of silently doing nothing, and leaves the list untouched', () => {
    const l = [1, 2, 3];
    expect(() => c.listRemoveAt(l, 9)).toThrow(/BRG4014/);
    expect(l).toEqual([1, 2, 3]);
  });
  it('addAll(itself) is well-defined', () => {
    const l = [1, 2];
    c.listAddAll(l, l);
    expect(l).toEqual([1, 2, 1, 2]);
  });
  it('sort with no comparator refuses a non-Comparable element', () => {
    expect(() => c.listSort([{}, {}] as never[])).toThrow(/BRG4014/);
  });
});
