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

final itemsProvider = FutureProvider<List<String>>((ref) async {
  await Future<void>.delayed(const Duration(milliseconds: 1));
  return <String>['a', 'b'];
});

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(itemsProvider);
    return Scaffold(
      // `.when(...)` embedded directly as widget-tree content, each branch itself returning a `Widget` —
      // App B's own dominant real shape for consuming an async provider on screen.
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, st) => Center(child: Text('error: $e')),
        data: (items) => Center(child: Text('items: ${items.length}')),
      ),
    );
  }
}
