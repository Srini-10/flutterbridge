// Records what the real `riverpod` 2.6.1 does, scenario by scenario, as a list of log lines per scenario.
//   dart run bin/oracle.dart > expected.json
//
// The runtime's `ProviderContainer` (packages/runtimes/react/src/internal/riverpod) is replayed against the same scenarios in
// `tests/riverpod_oracle.test.ts`, and the logs must be identical. Nothing here is a claim about how Riverpod ought to behave:
// it is a recording. Every step that could be observed *between* microtasks is separated by an explicit flush so the recording
// says what is synchronous and what is not.

import 'dart:async';
import 'dart:convert';

import 'package:riverpod/riverpod.dart';

Future<void> flush() async {
  // Two turns: the scheduler runs in a microtask, and a provider it rebuilds may schedule another.
  await Future<void>.delayed(Duration.zero);
  await Future<void>.delayed(Duration.zero);
}

String flags(AsyncValue<Object?> v) => '${v.hasValue}/${v.isLoading}/${v.hasError}/${v.valueOrNull}';

String show(AsyncValue<Object?> v) {
  final flags = 'hasValue=${v.hasValue} hasError=${v.hasError} isLoading=${v.isLoading} isRefreshing=${v.isRefreshing} isReloading=${v.isReloading}';
  return v.when(
    data: (d) => 'data($d) $flags',
    loading: () => 'loading(value=${v.valueOrNull}) $flags',
    error: (e, _) => 'error($e) $flags',
  );
}

class Key {
  Key(this.n);
  final int n;
}

class V {
  V(this.n);
  final int n;
  @override
  bool operator ==(Object other) => other is V && other.n == n;
  @override
  int get hashCode => n;
  @override
  String toString() => 'V$n';
}

class VNotifier extends StateNotifier<V> {
  VNotifier() : super(V(0));
  void set(V v) => state = v;
}

class Counter extends StateNotifier<int> {
  Counter(this.log) : super(0);
  final List<String> log;
  void set(int v) => state = v;
}

Future<Map<String, List<String>>> main() async {
  final out = <String, List<String>>{};

  Future<void> scenario(String name, Future<void> Function(List<String> log) body) async {
    final log = <String>[];
    await body(log);
    out[name] = log;
  }

  await scenario('lazy_and_cached', (log) async {
    final p = Provider<int>((ref) {
      log.add('create p');
      return 1;
    });
    final c = ProviderContainer();
    log.add('container made');
    log.add('read ${c.read(p)}');
    log.add('read ${c.read(p)}');
    c.dispose();
  });

  await scenario('watch_chain', (log) async {
    final a = StateProvider<int>((ref) => 0);
    final b = Provider<int>((ref) {
      log.add('build b');
      return ref.watch(a) * 2;
    });
    final cc = Provider<int>((ref) {
      log.add('build c');
      return ref.watch(b) + 1;
    });
    final c = ProviderContainer();
    c.listen<int>(cc, (p, n) => log.add('c: $p -> $n'));
    log.add('read c ${c.read(cc)}');
    c.read(a.notifier).state = 5;
    log.add('after set (sync) read a=${c.read(a)}');
    await flush();
    log.add('after flush read c=${c.read(cc)}');
    c.dispose();
  });

  await scenario('read_makes_no_edge', (log) async {
    final a = StateProvider<int>((ref) => 0);
    final r = Provider<int>((ref) {
      log.add('build r');
      return ref.read(a) + 100;
    });
    final c = ProviderContainer();
    c.listen<int>(r, (p, n) => log.add('r: $p -> $n'));
    log.add('read r ${c.read(r)}');
    c.read(a.notifier).state = 7;
    await flush();
    log.add('read r ${c.read(r)}');
    c.dispose();
  });

  await scenario('family_keys', (log) async {
    final f = Provider.family<String, int>((ref, n) {
      log.add('build f($n)');
      return 'v$n';
    });
    final g = Provider.family<String, (int, int)>((ref, k) {
      log.add('build g(${k.$1},${k.$2})');
      return 'g${k.$1}${k.$2}';
    });
    final h = Provider.family<int, Key>((ref, k) {
      log.add('build h(${k.n})');
      return k.n;
    });
    final c = ProviderContainer();
    log.add(c.read(f(1)));
    log.add(c.read(f(1)));
    log.add(c.read(f(2)));
    log.add(c.read(g((1, 2))));
    log.add(c.read(g((1, 2))));
    log.add('h ${c.read(h(Key(1)))}');
    log.add('h ${c.read(h(Key(1)))}');
    c.dispose();
  });

  await scenario('listen_previous_next', (log) async {
    final a = StateProvider<int>((ref) => 0);
    final c = ProviderContainer();
    c.listen<int>(a, (p, n) => log.add('a: $p -> $n'));
    c.read(a.notifier).state = 1;
    await flush();
    c.read(a.notifier).state = 1;
    await flush();
    c.read(a.notifier).state = 2;
    await flush();
    log.add('done');
    c.dispose();
  });

  await scenario('listen_fire_immediately', (log) async {
    final a = StateProvider<int>((ref) => 3);
    final c = ProviderContainer();
    c.listen<int>(a, (p, n) => log.add('a: $p -> $n'), fireImmediately: true);
    log.add('listening');
    c.dispose();
  });

  await scenario('select_narrows', (log) async {
    final a = StateProvider<int>((ref) => 0);
    final c = ProviderContainer();
    c.listen<int>(a.select((v) => v % 2), (p, n) => log.add('parity: $p -> $n'));
    for (final v in [1, 3, 4, 6, 7]) {
      c.read(a.notifier).state = v;
      await flush();
    }
    log.add('done');
    c.dispose();
  });

  await scenario('auto_dispose', (log) async {
    final ap = Provider.autoDispose<int>((ref) {
      log.add('create ap');
      ref.onDispose(() => log.add('dispose ap'));
      return 1;
    });
    final c = ProviderContainer();
    final sub = c.listen<int>(ap, (p, n) {});
    log.add('listening ${sub.read()}');
    sub.close();
    log.add('closed');
    await flush();
    log.add('after flush');
    log.add('read ${c.read(ap)}');
    log.add('read again');
    await flush();
    log.add('end');
    c.dispose();
  });

  await scenario('keep_alive_without_auto_dispose', (log) async {
    final p = Provider<int>((ref) {
      log.add('create p');
      ref.onDispose(() => log.add('dispose p'));
      return 1;
    });
    final c = ProviderContainer();
    final sub = c.listen<int>(p, (a, b) {});
    sub.close();
    await flush();
    log.add('still alive: ${c.read(p)}');
    c.dispose();
    log.add('container disposed');
  });

  await scenario('future_provider', (log) async {
    var n = 0;
    final fp = FutureProvider<int>((ref) async {
      final id = ++n;
      log.add('run $id');
      await Future<void>.delayed(Duration.zero);
      if (id == 3) throw StateError('boom');
      return id * 10;
    });
    final c = ProviderContainer();
    c.listen<AsyncValue<int>>(fp, (p, v) => log.add('-> ${show(v)}'), fireImmediately: true);
    await flush();
    c.invalidate(fp);
    await flush();
    c.invalidate(fp);
    await flush();
    c.invalidate(fp);
    await flush();
    log.add('final ${show(c.read(fp))}');
    c.dispose();
  });

  await scenario('future_value_read', (log) async {
    final fp = FutureProvider<int>((ref) async {
      await Future<void>.delayed(Duration.zero);
      return 7;
    });
    final c = ProviderContainer();
    log.add('first ${show(c.read(fp))}');
    log.add('future ${await c.read(fp.future)}');
    log.add('then ${show(c.read(fp))}');
    c.dispose();
  });

  await scenario('invalidate_without_listeners', (log) async {
    var n = 0;
    final p = Provider<int>((ref) {
      log.add('build ${++n}');
      return n;
    });
    final c = ProviderContainer();
    log.add('read ${c.read(p)}');
    c.invalidate(p);
    log.add('invalidated');
    await flush();
    log.add('after flush');
    log.add('read ${c.read(p)}');
    c.dispose();
  });

  await scenario('refresh_returns_new_value', (log) async {
    var n = 0;
    final p = Provider<int>((ref) => ++n);
    final c = ProviderContainer();
    log.add('read ${c.read(p)}');
    log.add('refresh ${c.refresh(p)}');
    log.add('read ${c.read(p)}');
    c.dispose();
  });

  await scenario('state_notifier', (log) async {
    final np = StateNotifierProvider<Counter, int>((ref) => Counter(log));
    final c = ProviderContainer();
    c.listen<int>(np, (p, n) => log.add('count: $p -> $n'));
    c.read(np.notifier).set(0);
    await flush();
    c.read(np.notifier).set(4);
    await flush();
    c.read(np.notifier).set(4);
    await flush();
    log.add('final ${c.read(np)}');
    c.dispose();
  });

  await scenario('overrides', (log) async {
    final p = Provider<int>((ref) {
      log.add('create p');
      return 1;
    });
    final q = Provider<int>((ref) => ref.watch(p) + 1);
    final c = ProviderContainer(overrides: [p.overrideWithValue(9)]);
    log.add('q ${c.read(q)}');
    final d = ProviderContainer(overrides: [p.overrideWith((ref) {
      log.add('create override');
      return 20;
    })]);
    log.add('q ${d.read(q)}');
    c.dispose();
    d.dispose();
  });

  await scenario('on_dispose_container', (log) async {
    final p = Provider<int>((ref) {
      ref.onDispose(() => log.add('dispose p'));
      return 1;
    });
    final c = ProviderContainer();
    c.read(p);
    log.add('disposing');
    c.dispose();
    log.add('disposed');
  });

  await scenario('dependent_rebuilds_on_watch_change', (log) async {
    final a = StateProvider<int>((ref) => 1);
    final d = Provider<String>((ref) {
      final v = ref.watch(a);
      log.add('build d with $v');
      ref.onDispose(() => log.add('dispose d($v)'));
      return 'd$v';
    });
    final c = ProviderContainer();
    log.add(c.read(d));
    c.read(a.notifier).state = 2;
    log.add('sync read ${c.read(d)}');
    c.read(a.notifier).state = 3;
    c.read(a.notifier).state = 4;
    log.add('batched read ${c.read(d)}');
    c.dispose();
  });


  await scenario('listen_creates_eagerly', (log) async {
    final p = Provider<int>((ref) {
      log.add('create p');
      return 1;
    });
    final c = ProviderContainer();
    c.listen<int>(p, (a, b) {});
    log.add('listened');
    c.dispose();
  });

  await scenario('source_notifies_when', (log) async {
    final a = StateProvider<int>((ref) => 0);
    final c = ProviderContainer();
    c.listen<int>(a, (p, n) => log.add('a: $p -> $n'));
    c.read(a.notifier).state = 1;
    log.add('after set 1');
    c.read(a.notifier).state = 2;
    log.add('after set 2');
    await flush();
    log.add('flushed');
    c.dispose();
  });

  await scenario('derived_batches_notifications', (log) async {
    final a = StateProvider<int>((ref) => 0);
    final d = Provider<int>((ref) => ref.watch(a) * 10);
    final c = ProviderContainer();
    c.listen<int>(d, (p, n) => log.add('d: $p -> $n'));
    c.read(a.notifier).state = 1;
    c.read(a.notifier).state = 2;
    await flush();
    log.add('flushed');
    c.read(a.notifier).state = 3;
    c.read(a.notifier).state = 2;
    await flush();
    log.add('flushed again');
    c.dispose();
  });

  await scenario('future_refresh', (log) async {
    var n = 0;
    final fp = FutureProvider<int>((ref) async {
      final id = ++n;
      await Future<void>.delayed(Duration.zero);
      return id;
    });
    final c = ProviderContainer();
    c.listen<AsyncValue<int>>(fp, (p, v) => log.add('-> ${show(v)}'));
    await flush();
    log.add('refresh returned ${show(c.refresh(fp))}');
    await flush();
    log.add('final ${show(c.read(fp))}');
    c.dispose();
  });

  await scenario('stale_future_result_is_dropped', (log) async {
    var n = 0;
    final fp = FutureProvider<int>((ref) async {
      final id = ++n;
      await Future<void>.delayed(Duration(milliseconds: id == 1 ? 30 : 1));
      return id;
    });
    final c = ProviderContainer();
    c.listen<AsyncValue<int>>(fp, (p, v) => log.add('-> ${show(v)}'));
    await Future<void>.delayed(const Duration(milliseconds: 5));
    c.invalidate(fp);
    await Future<void>.delayed(const Duration(milliseconds: 60));
    log.add('final ${show(c.read(fp))}');
    c.dispose();
  });

  await scenario('stream_provider', (log) async {
    final ctl = StreamController<int>();
    final sp = StreamProvider<int>((ref) {
      ref.onDispose(ctl.close);
      return ctl.stream;
    });
    final c = ProviderContainer();
    c.listen<AsyncValue<int>>(sp, (p, v) => log.add('-> ${show(v)}'), fireImmediately: true);
    ctl.add(1);
    await flush();
    ctl.add(2);
    await flush();
    ctl.addError('bad');
    await flush();
    ctl.add(3);
    await flush();
    c.dispose();
  });


  await scenario('equality_kinds', (log) async {
    final sp = StateProvider<V>((ref) => V(0));
    final np = StateNotifierProvider<VNotifier, V>((ref) => VNotifier());
    final a = StateProvider<int>((ref) => 0);
    final dp = Provider<V>((ref) => V(ref.watch(a) % 2));
    final c = ProviderContainer();
    c.listen<V>(sp, (p, n) => log.add('state: $p -> $n'));
    c.listen<V>(np, (p, n) => log.add('notifier: $p -> $n'));
    c.listen<V>(dp, (p, n) => log.add('derived: $p -> $n'));
    c.read(sp.notifier).state = V(0); // equal, not identical
    c.read(sp.notifier).state = V(1);
    c.read(np.notifier).set(V(0));
    c.read(np.notifier).set(V(2));
    await flush();
    c.read(a.notifier).state = 2; // derived rebuilds to V(0): equal, not identical
    await flush();
    c.read(a.notifier).state = 3;
    await flush();
    log.add('done');
    c.dispose();
  });

  await scenario('unchanged_intermediate', (log) async {
    final a = StateProvider<int>((ref) => 0);
    final b = Provider<int>((ref) {
      log.add('build b');
      return ref.watch(a) % 2;
    });
    final cc = Provider<int>((ref) {
      log.add('build c');
      return ref.watch(b) + 1;
    });
    final c = ProviderContainer();
    c.listen<int>(cc, (p, n) => log.add('c: $p -> $n'));
    c.read(a.notifier).state = 2; // b stays 0
    await flush();
    log.add('flushed 1');
    c.read(a.notifier).state = 3; // b becomes 1
    await flush();
    log.add('flushed 2');
    c.dispose();
  });

  await scenario('invalidate_with_listener_is_immediate', (log) async {
    var n = 0;
    final p = Provider<int>((ref) {
      log.add('build ${++n}');
      return n;
    });
    final c = ProviderContainer();
    c.listen<int>(p, (a, b) => log.add('p: $a -> $b'));
    c.invalidate(p);
    log.add('invalidated');
    await flush();
    log.add('flushed');
    c.dispose();
  });


  await scenario('when_branches', (log) async {
    var n = 0;
    final fp = FutureProvider<int>((ref) async {
      final id = ++n;
      await Future<void>.delayed(Duration.zero);
      if (id == 3) throw StateError('boom');
      return id;
    });
    String pick(AsyncValue<int> v) =>
        'when=${v.when(data: (d) => 'D$d', loading: () => 'L', error: (e, _) => 'E')} '
        'noskip=${v.when(skipLoadingOnRefresh: false, data: (d) => 'D$d', loading: () => 'L', error: (e, _) => 'E')} '
        'skipError=${v.when(skipError: true, data: (d) => 'D$d', loading: () => 'L', error: (e, _) => 'E')} '
        'maybe=${v.maybeWhen(data: (d) => 'D$d', orElse: () => 'other')} '
        'whenData=${flags(v.whenData((d) => d * 2))} '
        'valueOrNull=${v.valueOrNull} '
        'value=${v.value}';
    final c = ProviderContainer();
    c.listen<AsyncValue<int>>(fp, (p, v) => log.add(pick(v)), fireImmediately: true);
    await flush();
    c.invalidate(fp);
    await flush();
    c.invalidate(fp);
    await flush();
    c.invalidate(fp);
    await flush();
    var threw = 'no';
    try {
      AsyncValue<int>.loading().requireValue;
    } catch (e) {
      threw = e.runtimeType.toString();
    }
    log.add('requireValue on loading throws: $threw');
    log.add('data equality: ${AsyncValue.data(1) == AsyncValue.data(1)} ${AsyncValue.data(1) == AsyncValue.data(2)} ${AsyncValue<int>.loading() == AsyncValue<int>.loading()}');
    c.dispose();
  });

  print(const JsonEncoder.withIndent('  ').convert(out));
  return out;
}
