// @vitest-environment jsdom

import { act, createElement, StrictMode, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  batch,
  derived,
  effect,
  inheritOwners,
  listAdd,
  listAddAll,
  listClear,
  listInsert,
  listInsertAll,
  listRemove,
  listRemoveAt,
  listRemoveLast,
  listRemoveWhere,
  listRetainWhere,
  listSetAt,
  listShuffle,
  listSort,
  mapAddAll,
  mapClear,
  mapPutIfAbsent,
  mapRemove,
  mapSet,
  notifyMutation,
  setAdd,
  setAddAll,
  setClear,
  setRemove,
  signal,
  useSignal,
} from '../src/index.js';

// In-place mutation of a State-held collection (ADR-0051).
//
// A Dart `List` keeps its identity when it is mutated — `final other = items; items.add(1)` reaches `other` — so the
// generated program mutates the array the signal already holds. `Signal.set` cannot announce that (the reference is
// `Object.is`-equal: ADR-20 R3, deliberately), so `touch` is the explicit exception. Which signal to touch is a runtime
// fact — an alias, a prop or a nested list has no root the call site can name — so every signal registers the
// collection graph it holds, and each mutator helper announces to the owners of what it changed.
// What must hold: a touch notifies despite equality; a plain equal write still does not; a component re-renders on a
// touch though `useSignal`'s value is the same reference; owners are found through aliases, nesting and later
// insertion; a no-op mutation is silent; and none of it leaks into ordinary signals.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<{ root: Root; container: HTMLElement }> = [];
function render(element: ReactElement): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  mounted.push({ root, container });
  return container;
}
afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => entry.root.unmount());
    entry.container.remove();
  }
});

describe('touch notifies where set cannot', () => {
  it('re-runs an effect for the same reference; an equal set still does not', () => {
    const items = signal([1]);
    const runs = vi.fn();
    effect(() => {
      runs(items.get().length);
    });
    expect(runs).toHaveBeenCalledTimes(1);

    items.set(items.peek()); // R3: equal, so nothing
    expect(runs).toHaveBeenCalledTimes(1);

    items.peek().push(2);
    items.touch();
    expect(runs).toHaveBeenCalledTimes(2);
    expect(runs).toHaveBeenLastCalledWith(2);
  });

  it('invalidates a derived that reads the collection', () => {
    const items = signal([1, 2]);
    const total = derived(() => items.get().length);
    expect(total.get()).toBe(2);
    items.peek().push(3);
    items.touch();
    expect(total.get()).toBe(3);
  });

  it('two touches inside a batch notify once', () => {
    const items = signal([1]);
    const runs = vi.fn();
    effect(() => {
      runs(items.get().length);
    });
    batch(() => {
      items.peek().push(2);
      items.touch();
      items.peek().push(3);
      items.touch();
    });
    expect(runs).toHaveBeenCalledTimes(2);
    expect(runs).toHaveBeenLastCalledWith(3);
  });
});

describe('a helper announces to the signals that hold the collection', () => {
  it('returns the mutation’s result and notifies after the change is made', () => {
    const items = signal([1, 2, 3]);
    let seen: number[] = [];
    effect(() => {
      seen = [...items.get()];
    });
    const removed = listRemoveAt(items.peek(), 0);
    expect(removed).toBe(1);
    expect(seen).toEqual([2, 3]);
  });

  it('notifies nothing when the mutation throws — the collection is unchanged', () => {
    const items = signal([1]);
    const runs = vi.fn();
    effect(() => {
      runs(items.get().length);
    });
    expect(() => listRemoveAt(items.peek(), 5)).toThrow(/BRG4014/);
    expect(runs).toHaveBeenCalledTimes(1);
    expect(items.peek()).toEqual([1]);
  });

  it('an alias sees the mutation and so does the signal, as in Dart', () => {
    const items = signal<number[]>([1]);
    const alias = items.peek();
    const runs = vi.fn();
    effect(() => {
      runs(items.get().length);
    });
    listAdd(alias, 2); // through the alias, not through the signal
    expect(alias).toBe(items.peek());
    expect(runs).toHaveBeenCalledTimes(2);
  });

  it('a nested list is found, and so is one inserted later', () => {
    const grid = signal<number[][]>([[1]]);
    const runs = vi.fn();
    effect(() => {
      runs(JSON.stringify(grid.get()));
    });
    listAdd(grid.peek()[0] as number[], 2);
    expect(runs).toHaveBeenLastCalledWith('[[1,2]]');
    const row: number[] = [];
    listAdd(grid.peek(), row);
    expect(runs).toHaveBeenLastCalledWith('[[1,2],[]]');
    listAdd(row, 5); // the row was added after the signal was built: it inherits the owners
    expect(runs).toHaveBeenLastCalledWith('[[1,2],[5]]');
  });

  it('sets and maps, and a map holding a list', () => {
    const tags = signal(new Set<string>());
    const index = signal(new Map<string, number[]>());
    const runs = vi.fn();
    effect(() => {
      runs(tags.get().size, JSON.stringify([...index.get()]));
    });
    setAdd(tags.peek(), 'a');
    expect(runs).toHaveBeenLastCalledWith(1, '[]');
    const bucket: number[] = [];
    mapSet(index.peek(), 'k', bucket);
    listAdd(bucket, 1);
    expect(runs).toHaveBeenLastCalledWith(1, '[["k",[1]]]');
  });

  it('one collection held by two signals notifies both, once each', () => {
    const shared = [1];
    const a = signal(shared);
    const b = signal(shared);
    const runsA = vi.fn();
    const runsB = vi.fn();
    effect(() => runsA(a.get().length));
    effect(() => runsB(b.get().length));
    listAdd(shared, 2);
    expect(runsA).toHaveBeenCalledTimes(2);
    expect(runsB).toHaveBeenCalledTimes(2);
  });

  it('a no-op mutation is silent; a collection no signal holds is a plain array', () => {
    const items = signal<number[]>([]);
    const runs = vi.fn();
    effect(() => {
      runs(items.get().length);
    });
    listRemoveAt(items.peek().concat([1]), 0); // a copy: nobody owns it
    expect(runs).toHaveBeenCalledTimes(1);
    notifyMutation([] as number[]); // no owners: nothing to do
    inheritOwners([], [] as number[]);
    expect(runs).toHaveBeenCalledTimes(1);
  });

  it('an element removed from a signal’s collection may still notify it (over-notification, never a miss)', () => {
    const inner = [1];
    const outer = signal<number[][]>([inner]);
    const runs = vi.fn();
    effect(() => {
      runs(outer.get().length);
    });
    listRemoveAt(outer.peek(), 0);
    runs.mockClear();
    listAdd(inner, 2);
    expect(runs.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

// Every mutator announces a real change, and stays silent when nothing changed (a no-op must not render).
describe('every mutator helper announces exactly when it changed something', () => {
  type Case = [name: string, make: () => unknown, mutate: (c: never) => unknown, changes: boolean];
  const cases: Case[] = [
    ['listAdd', () => [1], (c: number[]) => listAdd(c, 2), true],
    ['listAddAll', () => [1], (c: number[]) => listAddAll(c, [2, 3]), true],
    ['listInsert', () => [1], (c: number[]) => listInsert(c, 0, 9), true],
    ['listInsertAll', () => [1], (c: number[]) => listInsertAll(c, 1, [4]), true],
    ['listRemove (present)', () => [1, 2], (c: number[]) => listRemove(c, 2), true],
    ['listRemove (absent)', () => [1, 2], (c: number[]) => listRemove(c, 9), false],
    ['listRemoveAt', () => [1, 2], (c: number[]) => listRemoveAt(c, 0), true],
    ['listRemoveLast', () => [1, 2], (c: number[]) => listRemoveLast(c), true],
    ['listRemoveWhere (removes)', () => [1, 2], (c: number[]) => listRemoveWhere(c, (x) => x > 1), true],
    ['listRemoveWhere (none)', () => [1, 2], (c: number[]) => listRemoveWhere(c, (x) => x > 5), false],
    ['listRetainWhere (drops)', () => [1, 2], (c: number[]) => listRetainWhere(c, (x) => x > 1), true],
    ['listRetainWhere (keeps all)', () => [1, 2], (c: number[]) => listRetainWhere(c, () => true), false],
    ['listClear (non-empty)', () => [1], (c: number[]) => listClear(c), true],
    ['listClear (empty)', () => [] as number[], (c: number[]) => listClear(c), false],
    ['listSort', () => [2, 1], (c: number[]) => listSort(c), true],
    ['listShuffle', () => [1, 2, 3], (c: number[]) => listShuffle(c), true],
    ['listSetAt', () => [1], (c: number[]) => listSetAt(c, 0, 5), true],
    ['setAdd (new)', () => new Set([1]), (c: Set<number>) => setAdd(c, 2), true],
    ['setAdd (present)', () => new Set([1]), (c: Set<number>) => setAdd(c, 1), false],
    ['setRemove (present)', () => new Set([1]), (c: Set<number>) => setRemove(c, 1), true],
    ['setRemove (absent)', () => new Set([1]), (c: Set<number>) => setRemove(c, 9), false],
    ['setAddAll', () => new Set([1]), (c: Set<number>) => setAddAll(c, [2]), true],
    ['setClear (non-empty)', () => new Set([1]), (c: Set<number>) => setClear(c), true],
    ['setClear (empty)', () => new Set<number>(), (c: Set<number>) => setClear(c), false],
    ['mapSet', () => new Map<string, number>(), (c: Map<string, number>) => mapSet(c, 'a', 1), true],
    ['mapRemove (present)', () => new Map([['a', 1]]), (c: Map<string, number>) => mapRemove(c, 'a'), true],
    ['mapRemove (absent)', () => new Map([['a', 1]]), (c: Map<string, number>) => mapRemove(c, 'z'), false],
    ['mapPutIfAbsent (absent)', () => new Map<string, number>(), (c: Map<string, number>) => mapPutIfAbsent(c, 'a', () => 1), true],
    ['mapPutIfAbsent (present)', () => new Map([['a', 1]]), (c: Map<string, number>) => mapPutIfAbsent(c, 'a', () => 2), false],
    ['mapAddAll', () => new Map<string, number>(), (c: Map<string, number>) => mapAddAll(c, new Map([['a', 1]])), true],
    ['mapClear (non-empty)', () => new Map([['a', 1]]), (c: Map<string, number>) => mapClear(c), true],
    ['mapClear (empty)', () => new Map<string, number>(), (c: Map<string, number>) => mapClear(c), false],
  ];
  for (const [name, make, mutate, changes] of cases) {
    it(`${name} ${changes ? 'notifies' : 'is silent'}`, () => {
      const held = signal(make() as object);
      const runs = vi.fn();
      effect(() => {
        held.get();
        runs();
      });
      runs.mockClear();
      (mutate as (c: object) => unknown)(held.peek());
      // A no-op may notify (over-notification is allowed) but a change must: assert the direction that matters, and
      // for the no-ops assert what the design promises — the helpers do not announce a change that did not happen.
      if (changes) expect(runs).toHaveBeenCalled();
      else expect(runs).not.toHaveBeenCalled();
    });
  }
});

describe('useSignal re-renders on an in-place change', () => {
  function Count(props: { source: ReturnType<typeof signal<number[]>>; renders: () => void }): ReactElement {
    props.renders();
    const items = useSignal(props.source);
    return createElement('span', null, items.join(','));
  }

  it('re-renders once for a mutation of the same reference', () => {
    const items = signal<number[]>([1]);
    const renders = vi.fn();
    const container = render(createElement(Count, { source: items, renders }));
    expect(container.textContent).toBe('1');
    renders.mockClear();

    act(() => {
      listAdd(items.peek(), 2);
    });
    expect(container.textContent).toBe('1,2');
    expect(renders).toHaveBeenCalledTimes(1);
  });

  it('does not re-render for an equal set, or for a mutation nobody announced', () => {
    const items = signal<number[]>([1]);
    const renders = vi.fn();
    const container = render(createElement(Count, { source: items, renders }));
    renders.mockClear();

    act(() => items.set(items.peek()));
    expect(renders).not.toHaveBeenCalled();

    act(() => {
      items.peek().push(9); // in place, but no touch: nothing was said, so nothing renders
    });
    expect(renders).not.toHaveBeenCalled();
    // The DOM still shows the old content: the graph was never told. Generated code cannot do this, because it only
    // mutates through the helpers, which announce.
    expect(container.textContent).toBe('1');
  });

  it('one render for several mutations in one act (React batches the event)', () => {
    const items = signal<number[]>([]);
    const renders = vi.fn();
    render(createElement(Count, { source: items, renders }));
    renders.mockClear();
    act(() => {
      for (let i = 0; i < 5; i++) listAdd(items.peek(), i);
    });
    expect(renders).toHaveBeenCalledTimes(1);
  });

  it('renders a replaced value and a mutated one, and survives StrictMode', () => {
    const items = signal<number[]>([1]);
    const renders = vi.fn();
    const container = render(createElement(StrictMode, null, createElement(Count, { source: items, renders })));
    act(() => items.set([7, 8]));
    expect(container.textContent).toBe('7,8');
    act(() => {
      listAdd(items.peek(), 9);
    });
    expect(container.textContent).toBe('7,8,9');
  });

  it('two components on one collection both re-render', () => {
    const items = signal<number[]>([1]);
    const a = render(createElement(Count, { source: items, renders: () => undefined }));
    const b = render(createElement(Count, { source: items, renders: () => undefined }));
    act(() => {
      listAdd(items.peek(), 2);
    });
    expect(a.textContent).toBe('1,2');
    expect(b.textContent).toBe('1,2');
  });
});
