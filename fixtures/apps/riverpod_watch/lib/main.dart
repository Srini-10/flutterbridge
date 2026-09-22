import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

void main() => runApp(const ProviderScope(child: App()));

class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo)),
        home: const HomeScreen(id: 'x'),
      );
}

final baseProvider = Provider<int>((ref) => 3);

/// A provider watching another provider, inside its own `create` closure (§7): a plain call on the
/// runtime's own `Ref`, never a hook — must lower unchanged, regardless of this fixture's own widget-side
/// hoisting elsewhere.
final doubledProvider = Provider<int>((ref) => ref.watch(baseProvider) * 2);

class CounterNotifier extends StateNotifier<int> {
  CounterNotifier() : super(0);
  void increment() {
    state = state + 1;
  }
}

/// App A's own real shape: `StateNotifierProvider.family<Notifier, State, Arg>`.
final counterByIdProvider = StateNotifierProvider.family<CounterNotifier, int, String>((ref, id) => CounterNotifier());

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // App A's own exact pattern: the family instance resolved once, then both watched and read/mutated.
    final provider = counterByIdProvider(id);
    final count = ref.watch(provider);
    final doubled = ref.watch(doubledProvider);
    ref.listen(provider, (previous, next) {});
    return Scaffold(
      body: Column(
        children: [
          Text('$count'),
          Text('$doubled'),
          ElevatedButton(
            onPressed: () => ref.read(provider.notifier).increment(),
            child: const Text('inc'),
          ),
        ],
      ),
    );
  }
}
