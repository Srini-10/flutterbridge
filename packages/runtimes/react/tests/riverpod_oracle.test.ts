import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { AsyncValue } from '../src/internal/riverpod/async_value.js';
import {
  ProviderContainer,
  StateNotifier,
  defineFamily,
  defineProvider,
  type Listenable,
} from '../src/internal/riverpod/container.js';

// The runtime's `ProviderContainer`, replayed against what the real `riverpod` 2.6.1 did.
//
// `fixtures/riverpod_oracle/bin/oracle.dart` runs each scenario below against the package and records a log; the scenarios here are the
// same programs, step for step, written against the runtime. The logs must be identical — line for line, including the order in
// which providers build, when a listener hears, and which callback `when` picks. Nothing in this file states how Riverpod *should*
// behave; if a line disagrees, the runtime is wrong.

const expected = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../../fixtures/riverpod_oracle/expected.json', import.meta.url)), 'utf8'),
) as Record<string, string[]>;

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
/** Two turns: the scheduler runs in a microtask, and a provider it rebuilds may schedule another. */
const flush = async (): Promise<void> => {
  await tick();
  await tick();
};

const flags = (v: AsyncValue<unknown>): string => `${v.hasValue}/${v.isLoading}/${v.hasError}/${v.valueOrNull}`;
const show = (v: AsyncValue<unknown>): string => {
  const f = `hasValue=${v.hasValue} hasError=${v.hasError} isLoading=${v.isLoading} isRefreshing=${v.isRefreshing} isReloading=${v.isReloading}`;
  return v.when({
    data: (d) => `data(${String(d)}) ${f}`,
    loading: () => `loading(value=${String(v.valueOrNull)}) ${f}`,
    error: (e) => `error(${e instanceof Error ? e.message : String(e)}) ${f}`,
  });
};

class Key {
  constructor(readonly n: number) {}
}
class V {
  readonly hashCode: number;
  constructor(readonly n: number) {
    this.hashCode = n;
  }
  $eq(other: unknown): boolean {
    return other instanceof V && other.n === this.n;
  }
  toString(): string {
    return `V${this.n}`;
  }
}
class VNotifier extends StateNotifier<V> {
  constructor() {
    super(new V(0));
  }
  set(v: V): void {
    this.state = v;
  }
}
class Counter extends StateNotifier<number> {
  constructor() {
    super(0);
  }
  set(v: number): void {
    this.state = v;
  }
}
class StateError extends Error {
  constructor(message: string) {
    super(`Bad state: ${message}`);
  }
}

const provider = <T>(create: (ref: import('../src/internal/riverpod/container.js').Ref) => T, options?: { autoDispose?: boolean }) =>
  defineProvider<T>('provider', create, options);
const stateProvider = <T>(initial: T) => defineProvider<T>('state', () => initial);
const notifier = (state: { notifier: Listenable<unknown> }): { state: number } => state as never;
void notifier;

type Scenario = (log: string[]) => Promise<void>;

const scenarios: Record<string, Scenario> = {
  async lazy_and_cached(log) {
    const p = provider(() => {
      log.push('create p');
      return 1;
    });
    const c = new ProviderContainer();
    log.push('container made');
    log.push(`read ${c.read(p)}`);
    log.push(`read ${c.read(p)}`);
    c.dispose();
  },

  async watch_chain(log) {
    const a = stateProvider(0);
    const b = provider((ref) => {
      log.push('build b');
      return ref.watch(a) * 2;
    });
    const cc = provider((ref) => {
      log.push('build c');
      return ref.watch(b) + 1;
    });
    const c = new ProviderContainer();
    c.listen(cc, (p, n) => log.push(`c: ${p} -> ${n}`));
    log.push(`read c ${c.read(cc)}`);
    (c.read(a.notifier) as { state: number }).state = 5;
    log.push(`after set (sync) read a=${c.read(a)}`);
    await flush();
    log.push(`after flush read c=${c.read(cc)}`);
    c.dispose();
  },

  async read_makes_no_edge(log) {
    const a = stateProvider(0);
    const r = provider((ref) => {
      log.push('build r');
      return ref.read(a) + 100;
    });
    const c = new ProviderContainer();
    c.listen(r, (p, n) => log.push(`r: ${p} -> ${n}`));
    log.push(`read r ${c.read(r)}`);
    (c.read(a.notifier) as { state: number }).state = 7;
    await flush();
    log.push(`read r ${c.read(r)}`);
    c.dispose();
  },

  async family_keys(log) {
    const f = defineFamily<string, number>('provider', (_ref, n) => {
      log.push(`build f(${n})`);
      return `v${n}`;
    });
    const g = defineFamily<string, { $1: number; $2: number }>('provider', (_ref, k) => {
      log.push(`build g(${k.$1},${k.$2})`);
      return `g${k.$1}${k.$2}`;
    });
    const h = defineFamily<number, Key>('provider', (_ref, k) => {
      log.push(`build h(${k.n})`);
      return k.n;
    });
    const c = new ProviderContainer();
    log.push(c.read(f(1)));
    log.push(c.read(f(1)));
    log.push(c.read(f(2)));
    log.push(c.read(g({ $1: 1, $2: 2 })));
    log.push(c.read(g({ $1: 1, $2: 2 })));
    log.push(`h ${c.read(h(new Key(1)))}`);
    log.push(`h ${c.read(h(new Key(1)))}`);
    c.dispose();
  },

  async listen_previous_next(log) {
    const a = stateProvider(0);
    const c = new ProviderContainer();
    c.listen(a, (p, n) => log.push(`a: ${p} -> ${n}`));
    const set = (v: number): void => void ((c.read(a.notifier) as { state: number }).state = v);
    set(1);
    await flush();
    set(1);
    await flush();
    set(2);
    await flush();
    log.push('done');
    c.dispose();
  },

  async listen_fire_immediately(log) {
    const a = stateProvider(3);
    const c = new ProviderContainer();
    c.listen(a, (p, n) => log.push(`a: ${p} -> ${n}`), { fireImmediately: true });
    log.push('listening');
    c.dispose();
  },

  async select_narrows(log) {
    const a = stateProvider(0);
    const c = new ProviderContainer();
    c.listen(a.select((v) => v % 2), (p, n) => log.push(`parity: ${p} -> ${n}`));
    for (const v of [1, 3, 4, 6, 7]) {
      (c.read(a.notifier) as { state: number }).state = v;
      await flush();
    }
    log.push('done');
    c.dispose();
  },

  async auto_dispose(log) {
    const ap = provider(
      (ref) => {
        log.push('create ap');
        ref.onDispose(() => log.push('dispose ap'));
        return 1;
      },
      { autoDispose: true },
    );
    const c = new ProviderContainer();
    const sub = c.listen(ap, () => undefined);
    log.push(`listening ${String(sub.read())}`);
    sub.close();
    log.push('closed');
    await flush();
    log.push('after flush');
    log.push(`read ${c.read(ap)}`);
    log.push('read again');
    await flush();
    log.push('end');
    c.dispose();
  },

  async keep_alive_without_auto_dispose(log) {
    const p = provider((ref) => {
      log.push('create p');
      ref.onDispose(() => log.push('dispose p'));
      return 1;
    });
    const c = new ProviderContainer();
    const sub = c.listen(p, () => undefined);
    sub.close();
    await flush();
    log.push(`still alive: ${c.read(p)}`);
    c.dispose();
    log.push('container disposed');
  },

  async future_provider(log) {
    let n = 0;
    const fp = defineProvider<AsyncValue<number>>('future', async () => {
      const id = ++n;
      log.push(`run ${id}`);
      await tick();
      if (id === 3) throw new StateError('boom');
      return id * 10;
    });
    const c = new ProviderContainer();
    c.listen(fp, (_p, v) => log.push(`-> ${show(v)}`), { fireImmediately: true });
    await flush();
    c.invalidate(fp);
    await flush();
    c.invalidate(fp);
    await flush();
    c.invalidate(fp);
    await flush();
    log.push(`final ${show(c.read(fp))}`);
    c.dispose();
  },

  async future_value_read(log) {
    const fp = defineProvider<AsyncValue<number>>('future', async () => {
      await tick();
      return 7;
    });
    const c = new ProviderContainer();
    log.push(`first ${show(c.read(fp))}`);
    log.push(`future ${String(await c.read(fp.future))}`);
    log.push(`then ${show(c.read(fp))}`);
    c.dispose();
  },

  async invalidate_without_listeners(log) {
    let n = 0;
    const p = provider(() => {
      log.push(`build ${++n}`);
      return n;
    });
    const c = new ProviderContainer();
    log.push(`read ${c.read(p)}`);
    c.invalidate(p);
    log.push('invalidated');
    await flush();
    log.push('after flush');
    log.push(`read ${c.read(p)}`);
    c.dispose();
  },

  async refresh_returns_new_value(log) {
    let n = 0;
    const p = provider(() => ++n);
    const c = new ProviderContainer();
    log.push(`read ${c.read(p)}`);
    log.push(`refresh ${c.refresh(p)}`);
    log.push(`read ${c.read(p)}`);
    c.dispose();
  },

  async state_notifier(log) {
    const np = defineProvider<number>('stateNotifier', () => new Counter());
    const c = new ProviderContainer();
    c.listen(np, (p, n) => log.push(`count: ${p} -> ${n}`));
    const counter = (): Counter => c.read(np.notifier) as Counter;
    counter().set(0);
    await flush();
    counter().set(4);
    await flush();
    counter().set(4);
    await flush();
    log.push(`final ${c.read(np)}`);
    c.dispose();
  },

  async overrides(log) {
    const p = provider(() => {
      log.push('create p');
      return 1;
    });
    const q = provider((ref) => ref.watch(p) + 1);
    const c = new ProviderContainer({ overrides: [p.overrideWithValue(9)] });
    log.push(`q ${c.read(q)}`);
    const d = new ProviderContainer({
      overrides: [
        p.overrideWith(() => {
          log.push('create override');
          return 20;
        }),
      ],
    });
    log.push(`q ${d.read(q)}`);
    c.dispose();
    d.dispose();
  },

  async on_dispose_container(log) {
    const p = provider((ref) => {
      ref.onDispose(() => log.push('dispose p'));
      return 1;
    });
    const c = new ProviderContainer();
    c.read(p);
    log.push('disposing');
    c.dispose();
    log.push('disposed');
  },

  async dependent_rebuilds_on_watch_change(log) {
    const a = stateProvider(1);
    const d = provider((ref) => {
      const v = ref.watch(a);
      log.push(`build d with ${v}`);
      ref.onDispose(() => log.push(`dispose d(${v})`));
      return `d${v}`;
    });
    const c = new ProviderContainer();
    const set = (v: number): void => void ((c.read(a.notifier) as { state: number }).state = v);
    log.push(c.read(d));
    set(2);
    log.push(`sync read ${c.read(d)}`);
    set(3);
    set(4);
    log.push(`batched read ${c.read(d)}`);
    c.dispose();
  },

  async listen_creates_eagerly(log) {
    const p = provider(() => {
      log.push('create p');
      return 1;
    });
    const c = new ProviderContainer();
    c.listen(p, () => undefined);
    log.push('listened');
    c.dispose();
  },

  async source_notifies_when(log) {
    const a = stateProvider(0);
    const c = new ProviderContainer();
    c.listen(a, (p, n) => log.push(`a: ${p} -> ${n}`));
    const set = (v: number): void => void ((c.read(a.notifier) as { state: number }).state = v);
    set(1);
    log.push('after set 1');
    set(2);
    log.push('after set 2');
    await flush();
    log.push('flushed');
    c.dispose();
  },

  async derived_batches_notifications(log) {
    const a = stateProvider(0);
    const d = provider((ref) => ref.watch(a) * 10);
    const c = new ProviderContainer();
    c.listen(d, (p, n) => log.push(`d: ${p} -> ${n}`));
    const set = (v: number): void => void ((c.read(a.notifier) as { state: number }).state = v);
    set(1);
    set(2);
    await flush();
    log.push('flushed');
    set(3);
    set(2);
    await flush();
    log.push('flushed again');
    c.dispose();
  },

  async future_refresh(log) {
    let n = 0;
    const fp = defineProvider<AsyncValue<number>>('future', async () => {
      const id = ++n;
      await tick();
      return id;
    });
    const c = new ProviderContainer();
    c.listen(fp, (_p, v) => log.push(`-> ${show(v)}`));
    await flush();
    log.push(`refresh returned ${show(c.refresh(fp))}`);
    await flush();
    log.push(`final ${show(c.read(fp))}`);
    c.dispose();
  },

  async stale_future_result_is_dropped(log) {
    let n = 0;
    const fp = defineProvider<AsyncValue<number>>('future', async () => {
      const id = ++n;
      await new Promise((resolve) => setTimeout(resolve, id === 1 ? 30 : 1));
      return id;
    });
    const c = new ProviderContainer();
    c.listen(fp, (_p, v) => log.push(`-> ${show(v)}`));
    await new Promise((resolve) => setTimeout(resolve, 5));
    c.invalidate(fp);
    await new Promise((resolve) => setTimeout(resolve, 60));
    log.push(`final ${show(c.read(fp))}`);
    c.dispose();
  },

  async stream_provider(log) {
    const listeners: Array<{ data: (v: number) => void; error: (e: unknown) => void }> = [];
    const sp = defineProvider<AsyncValue<number>>('stream', () => ({
      listen(data: (v: number) => void, error?: (e: unknown) => void) {
        listeners.push({ data, error: error ?? (() => undefined) });
        return { cancel: () => undefined };
      },
    }));
    const c = new ProviderContainer();
    c.listen(sp, (_p, v) => log.push(`-> ${show(v)}`), { fireImmediately: true });
    listeners[0]!.data(1);
    await flush();
    listeners[0]!.data(2);
    await flush();
    listeners[0]!.error('bad');
    await flush();
    listeners[0]!.data(3);
    await flush();
    c.dispose();
  },

  async equality_kinds(log) {
    const sp = defineProvider<V>('state', () => new V(0));
    const np = defineProvider<V>('stateNotifier', () => new VNotifier());
    const a = stateProvider(0);
    const dp = provider((ref) => new V(ref.watch(a) % 2));
    const c = new ProviderContainer();
    c.listen(sp, (p, n) => log.push(`state: ${p} -> ${n}`));
    c.listen(np, (p, n) => log.push(`notifier: ${p} -> ${n}`));
    c.listen(dp, (p, n) => log.push(`derived: ${p} -> ${n}`));
    (c.read(sp.notifier) as { state: V }).state = new V(0);
    (c.read(sp.notifier) as { state: V }).state = new V(1);
    (c.read(np.notifier) as VNotifier).set(new V(0));
    (c.read(np.notifier) as VNotifier).set(new V(2));
    await flush();
    (c.read(a.notifier) as { state: number }).state = 2;
    await flush();
    (c.read(a.notifier) as { state: number }).state = 3;
    await flush();
    log.push('done');
    c.dispose();
  },

  async unchanged_intermediate(log) {
    const a = stateProvider(0);
    const b = provider((ref) => {
      log.push('build b');
      return ref.watch(a) % 2;
    });
    const cc = provider((ref) => {
      log.push('build c');
      return ref.watch(b) + 1;
    });
    const c = new ProviderContainer();
    c.listen(cc, (p, n) => log.push(`c: ${p} -> ${n}`));
    (c.read(a.notifier) as { state: number }).state = 2;
    await flush();
    log.push('flushed 1');
    (c.read(a.notifier) as { state: number }).state = 3;
    await flush();
    log.push('flushed 2');
    c.dispose();
  },

  async invalidate_with_listener_is_immediate(log) {
    let n = 0;
    const p = provider(() => {
      log.push(`build ${++n}`);
      return n;
    });
    const c = new ProviderContainer();
    c.listen(p, (a, b) => log.push(`p: ${a} -> ${b}`));
    c.invalidate(p);
    log.push('invalidated');
    await flush();
    log.push('flushed');
    c.dispose();
  },

  async when_branches(log) {
    let n = 0;
    const fp = defineProvider<AsyncValue<number>>('future', async () => {
      const id = ++n;
      await tick();
      if (id === 3) throw new StateError('boom');
      return id;
    });
    const pick = (v: AsyncValue<number>): string => {
      const cases = { data: (d: number) => `D${d}`, loading: () => 'L', error: () => 'E' };
      return (
        `when=${v.when(cases)} ` +
        `noskip=${v.when({ ...cases, skipLoadingOnRefresh: false })} ` +
        `skipError=${v.when({ ...cases, skipError: true })} ` +
        `maybe=${v.maybeWhen({ data: (d) => `D${d}`, orElse: () => 'other' })} ` +
        `whenData=${flags(v.whenData((d) => d * 2))} ` +
        `valueOrNull=${String(v.valueOrNull)} ` +
        `value=${String(v.value)}`
      );
    };
    const c = new ProviderContainer();
    c.listen(fp, (_p, v) => log.push(pick(v)), { fireImmediately: true });
    await flush();
    c.invalidate(fp);
    await flush();
    c.invalidate(fp);
    await flush();
    c.invalidate(fp);
    await flush();
    let threw = 'no';
    try {
      void AsyncValue.loading<number>().requireValue;
    } catch (e) {
      threw = e instanceof Error ? 'StateError' : 'other';
    }
    log.push(`requireValue on loading throws: ${threw}`);
    log.push(
      `data equality: ${AsyncValue.data(1).$eq(AsyncValue.data(1))} ${AsyncValue.data(1).$eq(AsyncValue.data(2))} ${AsyncValue.loading<number>().$eq(AsyncValue.loading<number>())}`,
    );
    c.dispose();
  },
};

describe('the provider container, against what the real riverpod 2.6.1 did', () => {
  it('replays every recorded scenario, and records nothing the runtime lacks', () => {
    expect(Object.keys(scenarios).sort()).toEqual(Object.keys(expected).sort());
  });

  for (const [name, scenario] of Object.entries(scenarios)) {
    it(name, async () => {
      const log: string[] = [];
      await scenario(log);
      expect(log).toEqual(expected[name]);
    });
  }
});
