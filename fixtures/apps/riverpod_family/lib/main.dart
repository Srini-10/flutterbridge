import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

void main() => runApp(const ProviderScope(child: App()));

class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo)),
        home: const HomeScreen(),
      );
}

/// `Provider.family<Value, Arg>` (App B: `resolvedPriceProvider`-shaped usage).
final itemByIdProvider = Provider.family<String, String>((ref, id) => 'item-$id');

/// `Provider.autoDispose.family<Value, Arg>` (App B).
final autoItemByIdProvider = Provider.autoDispose.family<String, String>((ref, id) => 'item-$id');

/// `FutureProvider.autoDispose.family<Value, Arg>` — App B's dominant shape
/// (`openProfileChangeProvider`, `openCreditRequestProvider`).
final loadedByIdProvider = FutureProvider.autoDispose.family<int, String>((ref, id) async {
  await Future<void>.delayed(const Duration(milliseconds: 1));
  return id.length;
});

/// `StateProvider.autoDispose.family<Value, Arg>` (App B: `customersFirmFilterProvider`), read through
/// both `ref.watch` and `ref.read(...notifier).state = `.
final filterByIdProvider = StateProvider.autoDispose.family<String?, String?>((ref, seed) => seed);

/// The real App A shape: `StateNotifierProvider.family<Notifier, State, Arg>`.
class CounterNotifier extends StateNotifier<int> {
  CounterNotifier() : super(0);
  void increment() {
    state = state + 1;
  }
}

final counterByIdProvider = StateNotifierProvider.family<CounterNotifier, int, String>((ref, id) => CounterNotifier());

/// The non-family siblings — a program that mixes family and non-family declarations of the same kind, as
/// both real apps do, must lower both without either interfering with the other.
final autoValueProvider = Provider.autoDispose<int>((ref) => 7);
final futureValueProvider = FutureProvider<int>((ref) async => 7);

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final item = ref.read(itemByIdProvider('a'));
    final autoItem = ref.read(autoItemByIdProvider('a'));
    final loaded = ref.read(loadedByIdProvider('a'));
    final filter = ref.read(filterByIdProvider('all'));
    final counter = counterByIdProvider('a');
    final count = ref.read(counter);
    final plainAuto = ref.read(autoValueProvider);
    final future = ref.read(futureValueProvider);
    return Scaffold(
      body: Center(
        child: Column(
          children: [
            Text(item),
            Text('$autoItem $loaded $filter $count $plainAuto $future'),
            ElevatedButton(
              onPressed: () {
                ref.read(counter.notifier).increment();
                ref.read(filterByIdProvider('all').notifier).state = 'changed';
              },
              child: const Text('change'),
            ),
          ],
        ),
      ),
    );
  }
}
