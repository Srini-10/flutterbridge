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

final itemsProvider = FutureProvider<List<String>>((ref) async => ['a', 'b']);

/// App B's own real shape (`skusAsync.when(loading: ..., error: (e, _) {debugPrint(...); return ...;})`):
/// a block-bodied branch performing a side effect before returning.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(itemsProvider);
    return Scaffold(
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, st) {
          debugPrint('failed: $e');
          return Text('Error: $e');
        },
        data: (items) => Text('${items.length} items'),
      ),
    );
  }
}
